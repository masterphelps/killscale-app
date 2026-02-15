'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Copy, Check, Download, RefreshCw, Plus, X, Activity, Smartphone, Eye, EyeOff, Info, Trash2, Radio } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAttribution } from '@/lib/attribution'
import { ATTRIBUTION_MODEL_INFO, AttributionModel } from '@/lib/attribution-models'
import { ManualEventModal } from '@/components/manual-event-modal'
import { UtmStatusPanel } from '@/components/utm-status-panel'
import { supabase } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'

const STANDARD_EVENTS = [
  { key: 'purchase', label: 'Purchase' },
  { key: 'lead', label: 'Lead' },
  { key: 'complete_registration', label: 'Complete Registration' },
  { key: 'add_to_cart', label: 'Add to Cart' },
  { key: 'initiate_checkout', label: 'Initiate Checkout' },
  { key: 'add_payment_info', label: 'Add Payment Info' },
  { key: 'subscribe', label: 'Subscribe' },
  { key: 'contact', label: 'Contact' },
  { key: 'submit_application', label: 'Submit Application' },
  { key: 'start_trial', label: 'Start Trial' },
  { key: 'schedule', label: 'Schedule' },
]

type WorkspacePixel = {
  workspace_id: string
  pixel_id: string
  pixel_secret: string
  attribution_source: 'native' | 'pixel'
  attribution_model: AttributionModel
  event_values: Record<string, number>
}

type WorkspaceAccount = {
  id: string
  workspace_id: string
  platform: 'meta' | 'google'
  ad_account_id: string
  ad_account_name: string
  currency: string
}

type PixelEvent = {
  id: string
  event_type: string
  event_value: number | null
  event_currency: string
  utm_source: string | null
  utm_content: string | null
  page_url: string | null
  event_time: string
  source?: string
  event_metadata?: { notes?: string }
}

type KioskSettings = {
  enabled: boolean
  slug: string | null
  hasPin: boolean
}

type SourceBreakdown = {
  verified: { conversions: number; revenue: number }
  ks_only: { conversions: number; revenue: number }
  meta_only: { conversions: number; revenue: number }
  manual: { conversions: number; revenue: number }
  total: { conversions: number; revenue: number }
  date_start: string | null
  date_end: string | null
  days_count: number
}

interface PixelPanelProps {
  workspaceId: string | null
}

const getPixelSnippet = (pixelId: string, pixelSecret: string) => `<!-- KillScale Pixel - Add to your theme's <head> -->
<script>
!function(k,s,p,i,x,e,l){if(k.ks)return;x=k.ks=function(){x.q.push(arguments)};
x.q=[];e=s.createElement(p);l=s.getElementsByTagName(p)[0];
e.async=1;e.src='https://pixel.killscale.com/ks.js';l.parentNode.insertBefore(e,l)
}(window,document,'script');

ks('init', '${pixelId}', { secret: '${pixelSecret}' });
ks('pageview');
</script>
<!-- End KillScale Pixel -->`

const getShopifyPurchaseSnippet = (pixelId: string, pixelSecret: string) => `<!-- KillScale Purchase Tracking - Add to Shopify Order Status Scripts -->
<script>
(function() {
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }
  var utmData = {};
  try {
    var stored = getCookie('ks_utm') || localStorage.getItem('ks_utm');
    if (stored) utmData = JSON.parse(stored);
  } catch(e) {}
  if (typeof Shopify !== 'undefined' && Shopify.checkout) {
    var checkout = Shopify.checkout;
    fetch('https://app.killscale.com/api/pixel/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pixel_id: '${pixelId}',
        pixel_secret: '${pixelSecret}',
        order_id: String(checkout.order_id),
        order_total: parseFloat(checkout.total_price),
        utm_source: utmData.utm_source || null,
        utm_medium: utmData.utm_medium || null,
        utm_campaign: utmData.utm_campaign || null,
        utm_content: utmData.utm_content || null,
        utm_term: utmData.utm_term || null,
        session_id: getCookie('ks_session') || null,
        client_id: getCookie('ks_client') || localStorage.getItem('ks_client') || null,
        landing_page: utmData.landing_page || null,
        referrer: utmData.referrer || null,
        page_views: parseInt(utmData.page_views) || null,
        event_time: new Date().toISOString(),
        click_time: utmData.click_time || null
      })
    }).catch(function(e) { console.log('KillScale: purchase event failed', e); });
  }
})();
</script>
<!-- End KillScale Purchase Tracking -->`

export function PixelPanel({ workspaceId }: PixelPanelProps) {
  const { user } = useAuth()
  const { reloadConfig } = useAttribution()

  // Pixel data
  const [workspacePixel, setWorkspacePixel] = useState<WorkspacePixel | null>(null)
  const [loading, setLoading] = useState(true)

  // Events
  const [pixelEvents, setPixelEvents] = useState<PixelEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventSourceFilter, setEventSourceFilter] = useState<'all' | 'manual'>('all')
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)

  // Copy states
  const [copiedPixelId, setCopiedPixelId] = useState<string | null>(null)

  // Attribution
  const [updatingModel, setUpdatingModel] = useState(false)

  // Source breakdown
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown | null>(null)
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false)

  // Shopify connection
  const [shopifyConnection, setShopifyConnection] = useState<{
    shop_domain: string
    shop_name?: string
    created_at: string
  } | null>(null)

  // Kiosk
  const [kioskSettings, setKioskSettings] = useState<KioskSettings>({ enabled: false, slug: null, hasPin: false })
  const [kioskSlugInput, setKioskSlugInput] = useState('')
  const [kioskPinInput, setKioskPinInput] = useState('')
  const [showKioskPin, setShowKioskPin] = useState(false)
  const [updatingKiosk, setUpdatingKiosk] = useState(false)
  const [copiedKioskUrl, setCopiedKioskUrl] = useState(false)
  const [kioskError, setKioskError] = useState<string | null>(null)

  // Manual Event Modal
  const [showManualEventModal, setShowManualEventModal] = useState(false)

  // Workspace accounts for UTM panel
  const [wsMetaAccounts, setWsMetaAccounts] = useState<WorkspaceAccount[]>([])

  // Load pixel data
  const loadPixelData = useCallback(async () => {
    if (!user?.id || !workspaceId) return

    setLoading(true)

    // Load workspace name for pixel creation
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single()

    const workspaceName = ws?.name || 'Default'

    // Check if pixel exists
    let { data: existingPixel } = await supabase
      .from('workspace_pixels')
      .select('pixel_id, pixel_secret, attribution_source, attribution_model, event_values')
      .eq('workspace_id', workspaceId)
      .single()

    if (!existingPixel) {
      // Create pixel for this workspace
      const workspacePrefix = workspaceName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
      const newPixelId = `KS-${workspacePrefix}-${randomSuffix}`

      const { data: newPixel, error: createError } = await supabase
        .from('workspace_pixels')
        .insert({
          workspace_id: workspaceId,
          pixel_id: newPixelId,
          pixel_secret: crypto.randomUUID().replace(/-/g, ''),
          attribution_source: 'native',
          attribution_model: 'last_touch',
        })
        .select('pixel_id, pixel_secret, attribution_source, attribution_model, event_values')
        .single()

      if (!createError && newPixel) {
        existingPixel = newPixel
      }
    }

    if (existingPixel) {
      setWorkspacePixel({
        workspace_id: workspaceId,
        pixel_id: existingPixel.pixel_id,
        pixel_secret: existingPixel.pixel_secret,
        attribution_source: existingPixel.attribution_source,
        attribution_model: existingPixel.attribution_model || 'last_touch',
        event_values: existingPixel.event_values || {},
      })

      // Load events
      loadPixelEvents(existingPixel.pixel_id)
    }

    setLoading(false)
  }, [user?.id, workspaceId])

  // Load events
  const loadPixelEvents = useCallback(async (pixelId: string) => {
    if (!user?.id) return

    setLoadingEvents(true)
    try {
      const res = await fetch(`/api/pixel/events?pixelId=${pixelId}&userId=${user.id}&limit=50`)
      const data = await res.json()
      if (data.events) {
        setPixelEvents(data.events)
      }
    } catch (err) {
      console.error('Failed to load pixel events:', err)
    } finally {
      setLoadingEvents(false)
    }
  }, [user?.id])

  // Load source breakdown
  const loadSourceBreakdown = useCallback(async () => {
    if (!user?.id || !workspaceId) return
    setIsLoadingBreakdown(true)
    try {
      const res = await fetch(`/api/attribution/breakdown?workspace_id=${workspaceId}&userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSourceBreakdown(data.data)
        }
      }
    } catch (error) {
      console.error('Failed to load source breakdown:', error)
    } finally {
      setIsLoadingBreakdown(false)
    }
  }, [user?.id, workspaceId])

  // Load shopify connection
  const loadShopifyConnection = useCallback(async () => {
    if (!workspaceId) return
    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('shop_domain, shop_name, created_at')
        .eq('workspace_id', workspaceId)
        .single()

      if (!error && data) {
        setShopifyConnection(data)
      } else {
        setShopifyConnection(null)
      }
    } catch {
      setShopifyConnection(null)
    }
  }, [workspaceId])

  // Load kiosk settings
  const loadKioskSettings = useCallback(async () => {
    if (!user?.id || !workspaceId) return
    try {
      const res = await fetch(`/api/kiosk/settings?workspaceId=${workspaceId}&userId=${user.id}`)
      const data = await res.json()
      if (res.ok) {
        setKioskSettings({
          enabled: data.kioskEnabled,
          slug: data.kioskSlug,
          hasPin: data.hasPin,
        })
        setKioskSlugInput(data.kioskSlug || '')
      }
    } catch (err) {
      console.error('Failed to load kiosk settings:', err)
    }
  }, [user?.id, workspaceId])

  // Load workspace accounts (Meta only) for UTM panel
  const loadWorkspaceAccounts = useCallback(async () => {
    if (!workspaceId) return
    try {
      const { data } = await supabase
        .from('workspace_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)

      if (data) {
        setWsMetaAccounts(data.filter((a: WorkspaceAccount) => a.platform === 'meta'))
      }
    } catch (err) {
      console.error('Failed to load workspace accounts:', err)
    }
  }, [workspaceId])

  // Initial load
  useEffect(() => {
    if (!user || !workspaceId) {
      setLoading(false)
      return
    }

    loadPixelData()
    loadSourceBreakdown()
    loadShopifyConnection()
    loadKioskSettings()
    loadWorkspaceAccounts()
  }, [user, workspaceId, loadPixelData, loadSourceBreakdown, loadShopifyConnection, loadKioskSettings, loadWorkspaceAccounts])

  // Update attribution source
  const updateAttributionSource = async (newSource: 'native' | 'pixel') => {
    if (!workspaceId || !workspacePixel) return
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ attribution_source: newSource })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? { ...prev, attribution_source: newSource } : prev)
        reloadConfig()
      }
    } catch (err) {
      console.error('Failed to update attribution source:', err)
    }
  }

  // Update attribution model
  const updateAttributionModel = async (newModel: AttributionModel) => {
    if (!workspaceId || !workspacePixel) return
    setUpdatingModel(true)
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ attribution_model: newModel })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? { ...prev, attribution_model: newModel } : prev)
        reloadConfig()
      }
    } catch (err) {
      console.error('Failed to update attribution model:', err)
    } finally {
      setUpdatingModel(false)
    }
  }

  // Update event values
  const updateEventValues = async (newEventValues: Record<string, number>) => {
    if (!workspaceId || !workspacePixel) return
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ event_values: newEventValues })
        .eq('workspace_id', workspaceId)

      if (!error) {
        setWorkspacePixel(prev => prev ? { ...prev, event_values: newEventValues } : prev)
      }
    } catch (err) {
      console.error('Failed to update event values:', err)
    }
  }

  // Update kiosk settings
  const updateKioskSettings = async (updates: { enabled?: boolean; slug?: string; pin?: string }) => {
    if (!user?.id || !workspaceId) return
    setUpdatingKiosk(true)
    setKioskError(null)

    try {
      const res = await fetch('/api/kiosk/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          ...updates,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setKioskError(data.error)
        return
      }

      await loadKioskSettings()

      if (updates.pin) {
        setKioskPinInput('')
      }
    } catch {
      setKioskError('Failed to update settings')
    } finally {
      setUpdatingKiosk(false)
    }
  }

  // Delete manual event
  const deleteManualEvent = async (eventId: string) => {
    if (!workspacePixel) return
    setDeletingEventId(eventId)
    try {
      const res = await fetch(`/api/pixel/events/${eventId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadPixelEvents(workspacePixel.pixel_id)
      } else {
        const data = await res.json()
        console.error('Failed to delete event:', data.error)
      }
    } catch (err) {
      console.error('Failed to delete event:', err)
    } finally {
      setDeletingEventId(null)
    }
  }

  // Copy helpers
  const copyPixelSnippet = async (pixelId: string, pixelSecret: string) => {
    await navigator.clipboard.writeText(getPixelSnippet(pixelId, pixelSecret))
    setCopiedPixelId('main')
    setTimeout(() => setCopiedPixelId(null), 2000)
  }

  const downloadPixelFile = (pixelId: string, pixelSecret: string) => {
    const snippet = getPixelSnippet(pixelId, pixelSecret)
    const blob = new Blob([snippet], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `killscale-pixel.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copyKioskUrl = async (slug: string) => {
    const url = `https://kiosk.killscale.com/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedKioskUrl(true)
    setTimeout(() => setCopiedKioskUrl(false), 2000)
  }

  // No workspace selected
  if (!workspaceId) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Pixel</h2>
        <p className="text-sm text-zinc-500">Select a workspace to view pixel settings.</p>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    )
  }

  // No pixel (should not happen since we auto-create)
  if (!workspacePixel) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Pixel</h2>
        <p className="text-sm text-zinc-500">No pixel configured for this workspace.</p>
      </div>
    )
  }

  const wp = workspacePixel
  const filteredEvents = eventSourceFilter === 'manual'
    ? pixelEvents.filter(e => e.source === 'manual')
    : pixelEvents

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-1">Pixel & Attribution</h2>
        <p className="text-sm text-zinc-500">Configure your KillScale pixel, attribution settings, and event tracking.</p>
      </div>

      {/* ───────────────────── 1. Install Code ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Install Code</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadPixelFile(wp.pixel_id, wp.pixel_secret)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={() => copyPixelSnippet(wp.pixel_id, wp.pixel_secret)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
            >
              {copiedPixelId === 'main' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-bg-dark rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-500">Pixel ID:</span>
            <code className="text-xs font-mono text-white">{wp.pixel_id}</code>
          </div>
          <pre className="text-xs text-zinc-400 overflow-x-auto font-mono whitespace-pre-wrap">
            {getPixelSnippet(wp.pixel_id, wp.pixel_secret)}
          </pre>
        </div>

        <p className="text-xs text-zinc-600 mt-2">
          Add to your website&apos;s <code className="bg-zinc-800 px-1 rounded">&lt;head&gt;</code> section.
        </p>
      </div>

      {/* ───────────────────── 2. Shopify Purchase Tracking ───────────────────── */}
      {shopifyConnection && (
        <div className="p-4 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Shopify Purchase Tracking</h3>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(getShopifyPurchaseSnippet(wp.pixel_id, wp.pixel_secret))
                setCopiedPixelId('shopify')
                setTimeout(() => setCopiedPixelId(null), 2000)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
            >
              {copiedPixelId === 'shopify' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="p-3 bg-bg-dark rounded-lg">
            <pre className="text-xs text-zinc-400 overflow-x-auto font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
              {getShopifyPurchaseSnippet(wp.pixel_id, wp.pixel_secret)}
            </pre>
          </div>

          <p className="text-xs text-zinc-600 mt-2">
            Add to <strong>Shopify Admin &rarr; Settings &rarr; Checkout &rarr; Order status page</strong> under &quot;Additional scripts&quot;.
            This fires purchase events with your Shopify order ID for accurate attribution.
          </p>
        </div>
      )}

      {/* ───────────────────── 3. Attribution Insights ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Attribution Insights</h3>
          <button
            onClick={loadSourceBreakdown}
            disabled={isLoadingBreakdown}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoadingBreakdown && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="p-4 bg-bg-dark rounded-lg">
          <p className="text-xs text-zinc-500 mb-4">
            KillScale merges your pixel data with Meta API for the most complete picture.
          </p>

          {!sourceBreakdown ? (
            <div className="text-center py-4">
              <p className="text-sm text-zinc-500">No attribution data yet</p>
              <p className="text-xs text-zinc-600 mt-1">Data will appear after your first sync</p>
            </div>
          ) : (
            <>
              {/* Source Breakdown Bar */}
              <div className="mb-4">
                <div className="h-3 rounded-full overflow-hidden flex bg-zinc-800">
                  {sourceBreakdown.total.conversions > 0 && (
                    <>
                      <div
                        style={{ width: `${(sourceBreakdown.verified.conversions / sourceBreakdown.total.conversions) * 100}%` }}
                        className="bg-verdict-scale"
                        title="Verified"
                      />
                      <div
                        style={{ width: `${(sourceBreakdown.ks_only.conversions / sourceBreakdown.total.conversions) * 100}%` }}
                        className="bg-purple-500"
                        title="KS Only"
                      />
                      <div
                        style={{ width: `${(sourceBreakdown.meta_only.conversions / sourceBreakdown.total.conversions) * 100}%` }}
                        className="bg-zinc-500"
                        title="Meta Only"
                      />
                      <div
                        style={{ width: `${(sourceBreakdown.manual.conversions / sourceBreakdown.total.conversions) * 100}%` }}
                        className="bg-amber-500"
                        title="Manual"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Legend with counts */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-verdict-scale" />
                    Verified (KS + Meta)
                  </span>
                  <span className="text-zinc-400">
                    {sourceBreakdown.verified.conversions}
                    ({sourceBreakdown.total.conversions > 0
                      ? Math.round((sourceBreakdown.verified.conversions / sourceBreakdown.total.conversions) * 100)
                      : 0}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    KS Only
                  </span>
                  <span className="text-zinc-400">
                    {sourceBreakdown.ks_only.conversions}
                    ({sourceBreakdown.total.conversions > 0
                      ? Math.round((sourceBreakdown.ks_only.conversions / sourceBreakdown.total.conversions) * 100)
                      : 0}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-500" />
                    Meta Only
                  </span>
                  <span className="text-zinc-400">
                    {sourceBreakdown.meta_only.conversions}
                    ({sourceBreakdown.total.conversions > 0
                      ? Math.round((sourceBreakdown.meta_only.conversions / sourceBreakdown.total.conversions) * 100)
                      : 0}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Manual
                  </span>
                  <span className="text-zinc-400">
                    {sourceBreakdown.manual.conversions}
                    ({sourceBreakdown.total.conversions > 0
                      ? Math.round((sourceBreakdown.manual.conversions / sourceBreakdown.total.conversions) * 100)
                      : 0}%)
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border text-xs text-zinc-500">
                Total: {sourceBreakdown.total.conversions} conversions
                (${sourceBreakdown.total.revenue.toLocaleString()})
                <span className="ml-2 text-zinc-600">
                  &bull; {sourceBreakdown.date_start && sourceBreakdown.date_end
                    ? sourceBreakdown.date_start === sourceBreakdown.date_end
                      ? new Date(sourceBreakdown.date_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : `${new Date(sourceBreakdown.date_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(sourceBreakdown.date_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : 'Last sync'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ───────────────────── 4. Attribution Source ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium text-sm">Attribution Source</h3>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 z-10">
              Choose whether to use Meta&apos;s native attribution or KillScale&apos;s first-party pixel for tracking conversions.
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          KS Pixel uses first-party data from your pixel for attribution. Meta Native uses Meta&apos;s reported conversions.
        </p>
        <div className="space-y-2">
          {([
            { value: 'native' as const, label: 'Meta Native', desc: "Use Meta's reported attribution data" },
            { value: 'pixel' as const, label: 'KS Pixel', desc: 'Use KillScale first-party pixel for attribution' },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => updateAttributionSource(option.value)}
              className={cn(
                "w-full p-3 rounded-lg border-2 transition-all text-left",
                wp.attribution_source === option.value
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                  wp.attribution_source === option.value ? "border-purple-500" : "border-zinc-600"
                )}>
                  {wp.attribution_source === option.value && (
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  )}
                </div>
                <span className="text-sm font-medium text-white">{option.label}</span>
              </div>
              <p className="text-xs text-zinc-500 ml-6">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ───────────────────── 5. Attribution Model ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium text-sm">Attribution Model</h3>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 z-10">
              Choose how credit is distributed when a customer interacts with multiple ads before converting.
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Applied to conversions tracked by KillScale pixel. Meta-only conversions use Meta&apos;s native attribution.
        </p>
        <div className="space-y-2">
          {(Object.keys(ATTRIBUTION_MODEL_INFO) as AttributionModel[]).map((model) => (
            <button
              key={model}
              onClick={() => updateAttributionModel(model)}
              disabled={updatingModel}
              className={cn(
                "w-full p-3 rounded-lg border-2 transition-all text-left",
                wp.attribution_model === model
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                  wp.attribution_model === model ? "border-purple-500" : "border-zinc-600"
                )}>
                  {wp.attribution_model === model && (
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  )}
                </div>
                <span className="font-medium text-sm">{ATTRIBUTION_MODEL_INFO[model].label}</span>
              </div>
              <p className="text-xs text-zinc-500 ml-6">
                {ATTRIBUTION_MODEL_INFO[model].description}
              </p>
            </button>
          ))}
        </div>

        {updatingModel && (
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Updating...
          </div>
        )}
      </div>

      {/* ───────────────────── 6. Event Values ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium text-sm">Event Values</h3>
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 z-10">
              Assign dollar values to conversion events so pixel attribution can calculate revenue and ROAS.
            </div>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          When your pixel tracks events (leads, registrations, etc.), these values are used to calculate revenue. ROAS = (Events x Value) / Spend.
        </p>

        {/* Configured events */}
        <div className="space-y-2 mb-3">
          {Object.entries(wp.event_values || {}).map(([key, value]) => {
            const event = STANDARD_EVENTS.find(e => e.key === key)
            return (
              <div key={key} className="flex items-center gap-3 bg-bg-dark rounded-lg p-3">
                <span className="flex-1 text-sm font-medium">{event?.label || key}</span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-sm">$</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={value}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value)
                      if (!isNaN(num) && num >= 0) {
                        updateEventValues({ ...wp.event_values, [key]: num })
                      }
                    }}
                    className="w-24 px-3 py-2 bg-bg-card border border-border rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={() => {
                    const next = { ...wp.event_values }
                    delete next[key]
                    updateEventValues(next)
                  }}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
          {Object.keys(wp.event_values || {}).length === 0 && (
            <div className="text-sm text-zinc-500 py-2">
              No event values configured. Add events below to track their value.
            </div>
          )}
        </div>

        {/* Add event dropdown */}
        {STANDARD_EVENTS.filter(e => !(e.key in (wp.event_values || {}))).length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                updateEventValues({ ...wp.event_values, [e.target.value]: 0 })
                e.target.value = ''
              }
            }}
            className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer"
          >
            <option value="" disabled>Add an event...</option>
            {STANDARD_EVENTS.filter(e => !(e.key in (wp.event_values || {}))).map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
      </div>

      {/* ───────────────────── 7. Sales Kiosk ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-zinc-400" />
          <h3 className="font-medium text-sm">Sales Kiosk</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          A simplified view for staff to log walk-in sales without full dashboard access.
        </p>

        {kioskError && (
          <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
            {kioskError}
          </div>
        )}

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 bg-bg-dark rounded-lg mb-3">
          <span className="text-sm">Enable Sales Kiosk</span>
          <button
            onClick={() => updateKioskSettings({ enabled: !kioskSettings.enabled })}
            disabled={updatingKiosk}
            className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              kioskSettings.enabled ? "bg-accent" : "bg-zinc-700"
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
              kioskSettings.enabled ? "left-5" : "left-1"
            )} />
          </button>
        </div>

        {kioskSettings.enabled && (
          <>
            {/* Kiosk URL */}
            <div className="mb-3">
              <label className="block text-xs text-zinc-500 mb-1">Kiosk URL</label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center bg-bg-dark border border-border rounded-lg overflow-hidden">
                  <span className="px-2 text-xs text-zinc-600 border-r border-border">kiosk.killscale.com/</span>
                  <input
                    type="text"
                    value={kioskSlugInput}
                    onChange={(e) => setKioskSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="your-business"
                    className="flex-1 px-2 py-2 bg-transparent text-sm text-white focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => updateKioskSettings({ slug: kioskSlugInput })}
                  disabled={updatingKiosk || kioskSlugInput === kioskSettings.slug}
                  className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Copy URL button */}
            {kioskSettings.slug && (
              <button
                onClick={() => copyKioskUrl(kioskSettings.slug!)}
                className="w-full mb-3 flex items-center justify-center gap-2 p-2 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                {copiedKioskUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-verdict-scale" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Kiosk URL
                  </>
                )}
              </button>
            )}

            {/* PIN Code */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                PIN Code {kioskSettings.hasPin && <span className="text-verdict-scale">(set)</span>}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKioskPin ? 'text' : 'password'}
                    value={kioskPinInput}
                    onChange={(e) => setKioskPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={kioskSettings.hasPin ? '••••' : 'Enter 4-6 digits'}
                    maxLength={6}
                    className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKioskPin(!showKioskPin)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    {showKioskPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => updateKioskSettings({ pin: kioskPinInput })}
                  disabled={updatingKiosk || !kioskPinInput || kioskPinInput.length < 4}
                  className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                >
                  {kioskSettings.hasPin ? 'Change' : 'Set'}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-1">Staff will enter this PIN to access the kiosk.</p>
            </div>
          </>
        )}

        {updatingKiosk && (
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Updating...
          </div>
        )}
      </div>

      {/* ───────────────────── 8. Manual Event Logging ───────────────────── */}
      <div className="p-4 bg-bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-zinc-400" />
          <h3 className="font-medium text-sm">Manual Event Logging</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Manually log walk-ins, phone orders, signups, or other offline conversions.
        </p>
        <button
          onClick={() => setShowManualEventModal(true)}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Log Manual Event
        </button>
      </div>

      {/* ───────────────────── 9 & 10. Events + UTM Grid ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event Viewer */}
        <div className="p-4 bg-bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-400" />
              <h3 className="font-medium text-sm">Events</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Source filter toggle */}
              <div className="flex rounded-lg overflow-hidden border border-border">
                <button
                  onClick={() => setEventSourceFilter('all')}
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors",
                    eventSourceFilter === 'all'
                      ? "bg-accent text-white"
                      : "bg-bg-dark text-zinc-400 hover:text-white"
                  )}
                >
                  All
                </button>
                <button
                  onClick={() => setEventSourceFilter('manual')}
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors",
                    eventSourceFilter === 'manual'
                      ? "bg-purple-600 text-white"
                      : "bg-bg-dark text-zinc-400 hover:text-white"
                  )}
                >
                  Manual
                </button>
              </div>
              <button
                onClick={() => loadPixelEvents(wp.pixel_id)}
                disabled={loadingEvents}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loadingEvents && "animate-spin")} />
                Refresh
              </button>
            </div>
          </div>

          {loadingEvents && pixelEvents.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8 bg-bg-dark rounded-lg">
              <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">
                {eventSourceFilter === 'manual' ? 'No manual events yet' : 'No events received yet'}
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                {eventSourceFilter === 'manual'
                  ? 'Log a manual event to track offline conversions'
                  : 'Install the pixel and events will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filteredEvents.slice(0, 50).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-2.5 bg-bg-dark rounded-lg text-sm group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Event type badge */}
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0",
                      event.event_type === 'purchase' ? 'bg-verdict-scale/20 text-verdict-scale' :
                      event.event_type === 'pageview' ? 'bg-zinc-700 text-zinc-400' :
                      'bg-accent/20 text-accent'
                    )}>
                      {event.event_type}
                    </span>
                    {/* Manual indicator */}
                    {event.source === 'manual' && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 flex-shrink-0">
                        manual
                      </span>
                    )}
                    {/* Value */}
                    {event.event_value && (
                      <span className="text-zinc-400 flex-shrink-0">${event.event_value.toFixed(2)}</span>
                    )}
                    {/* Attribution */}
                    {event.utm_content && (
                      <span className="text-xs text-zinc-600 font-mono truncate max-w-[80px]" title={`Attributed to: ${event.utm_content}`}>
                        &rarr; {event.utm_content.slice(-8)}
                      </span>
                    )}
                    {/* Notes */}
                    {event.event_metadata?.notes && (
                      <span className="text-xs text-zinc-500 truncate" title={event.event_metadata.notes}>
                        &quot;{event.event_metadata.notes}&quot;
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Date */}
                    <span className="text-xs text-zinc-600" title={new Date(event.event_time).toLocaleString()}>
                      {new Date(event.event_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {/* Delete button for manual events */}
                    {event.source === 'manual' && (
                      <button
                        onClick={() => deleteManualEvent(event.id)}
                        disabled={deletingEventId === event.id}
                        className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                        title="Delete event"
                      >
                        {deletingEventId === event.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredEvents.length > 50 && (
                <p className="text-xs text-zinc-600 text-center pt-2">
                  +{filteredEvents.length - 50} more events
                </p>
              )}
            </div>
          )}
        </div>

        {/* UTM Tracking Status Panel */}
        <div className="p-4 bg-bg-card border border-border rounded-xl">
          <UtmStatusPanel
            userId={user!.id}
            adAccountIds={wsMetaAccounts.map(a => a.ad_account_id)}
          />
        </div>
      </div>

      {/* Manual Event Modal */}
      {showManualEventModal && workspaceId && (
        <ManualEventModal
          workspaceId={workspaceId}
          onClose={() => setShowManualEventModal(false)}
          onSuccess={() => {
            if (wp) {
              loadPixelEvents(wp.pixel_id)
            }
          }}
        />
      )}
    </div>
  )
}
