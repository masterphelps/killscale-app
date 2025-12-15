'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Copy, Check, Activity, RefreshCw, Download, ExternalLink, Lock, Sparkles, ChevronDown, ChevronRight, Layers, Plus, Smartphone, Eye, EyeOff } from 'lucide-react'
import { useAuth, supabase } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { cn } from '@/lib/utils'

const EVENT_TYPES = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'lead', label: 'Lead' },
  { value: 'signup', label: 'Sign Up' },
  { value: 'contact', label: 'Contact' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'quote', label: 'Quote Request' },
  { value: 'call', label: 'Phone Call' },
  { value: 'walkin', label: 'Walk-In' },
]

type Workspace = {
  id: string
  name: string
}

type KioskSettings = {
  enabled: boolean
  slug: string | null
  hasPin: boolean
}

type WorkspacePixel = {
  workspace_id: string
  workspace_name: string
  pixel_id: string
  pixel_secret: string
  attribution_source: 'native' | 'pixel'
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
}

export default function PixelPage() {
  const { user } = useAuth()
  const { plan } = useSubscription()

  // Check if user is Pro+ (can access Pixel)
  const isProPlus = plan === 'Pro' || plan === 'Agency'

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspacePixels, setWorkspacePixels] = useState<WorkspacePixel[]>([])
  const [pixelEvents, setPixelEvents] = useState<Record<string, PixelEvent[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedWorkspace, setExpandedWorkspace] = useState<string | null>(null)
  const [loadingEvents, setLoadingEvents] = useState<string | null>(null)
  const [copiedPixelId, setCopiedPixelId] = useState<string | null>(null)
  const [copiedUtm, setCopiedUtm] = useState(false)
  const [updatingAttribution, setUpdatingAttribution] = useState<string | null>(null)
  const [lastEventTimes, setLastEventTimes] = useState<Record<string, string | null>>({})

  // Kiosk settings state
  const [kioskSettings, setKioskSettings] = useState<Record<string, KioskSettings>>({})
  const [kioskSlugInput, setKioskSlugInput] = useState<Record<string, string>>({})
  const [kioskPinInput, setKioskPinInput] = useState<Record<string, string>>({})
  const [showKioskPin, setShowKioskPin] = useState<Record<string, boolean>>({})
  const [updatingKiosk, setUpdatingKiosk] = useState<string | null>(null)
  const [copiedKioskUrl, setCopiedKioskUrl] = useState<string | null>(null)
  const [kioskError, setKioskError] = useState<Record<string, string | null>>({})

  // Manual Event state
  const [showLogModal, setShowLogModal] = useState<string | null>(null)  // workspace_id or null
  const [logEventType, setLogEventType] = useState('purchase')
  const [logValue, setLogValue] = useState('100')
  const [logNotes, setLogNotes] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [showEventDropdown, setShowEventDropdown] = useState(false)
  const [logHierarchy, setLogHierarchy] = useState<Array<{
    campaignId: string
    campaignName: string
    adsets: Array<{
      adsetId: string
      adsetName: string
      ads: Array<{ adId: string; adName: string; spend: number; spendPercentage: number }>
    }>
  }>>([])
  const [logAdsLoading, setLogAdsLoading] = useState(false)
  const [logAttribution, setLogAttribution] = useState<'top' | 'select'>('top')  // top=top spender, select=specific ad
  const [logSelectedAd, setLogSelectedAd] = useState<string | null>(null)
  const [logExpandedCampaigns, setLogExpandedCampaigns] = useState<Set<string>>(new Set())
  const [logExpandedAdsets, setLogExpandedAdsets] = useState<Set<string>>(new Set())

  // Load workspaces and their pixels
  useEffect(() => {
    if (!user || !isProPlus) {
      setLoading(false)
      return
    }

    const loadData = async () => {
      // Load non-default workspaces
      const { data: ws, error: wsError } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_default', false)
        .order('created_at', { ascending: true })

      if (wsError) {
        console.error('Error loading workspaces:', wsError)
        setLoading(false)
        return
      }

      setWorkspaces(ws || [])

      if (!ws || ws.length === 0) {
        setLoading(false)
        return
      }

      // Load or create pixels for each workspace
      const pixels: WorkspacePixel[] = []

      for (const workspace of ws) {
        // Check if pixel exists
        let { data: existingPixel } = await supabase
          .from('workspace_pixels')
          .select('pixel_id, pixel_secret, attribution_source')
          .eq('workspace_id', workspace.id)
          .single()

        if (!existingPixel) {
          // Create pixel for this workspace
          const workspacePrefix = workspace.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
          const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
          const newPixelId = `KS-${workspacePrefix}-${randomSuffix}`

          const { data: newPixel, error: createError } = await supabase
            .from('workspace_pixels')
            .insert({
              workspace_id: workspace.id,
              pixel_id: newPixelId,
              pixel_secret: crypto.randomUUID().replace(/-/g, ''),
              attribution_source: 'native',
            })
            .select('pixel_id, pixel_secret, attribution_source')
            .single()

          if (!createError && newPixel) {
            existingPixel = newPixel
          }
        }

        if (existingPixel) {
          pixels.push({
            workspace_id: workspace.id,
            workspace_name: workspace.name,
            pixel_id: existingPixel.pixel_id,
            pixel_secret: existingPixel.pixel_secret,
            attribution_source: existingPixel.attribution_source,
          })
        }
      }

      setWorkspacePixels(pixels)

      // Auto-expand first workspace if only one
      if (pixels.length === 1) {
        setExpandedWorkspace(pixels[0].workspace_id)
      }

      // Load status for all pixels to show active/inactive indicator
      for (const pixel of pixels) {
        try {
          const res = await fetch(`/api/pixel/events?pixelId=${pixel.pixel_id}&userId=${user.id}&limit=1`)
          const data = await res.json()
          setLastEventTimes(prev => ({ ...prev, [pixel.workspace_id]: data.lastEventTime || null }))
        } catch (err) {
          console.error('Failed to load pixel status:', err)
        }
      }

      setLoading(false)
    }

    loadData()
  }, [user, isProPlus])

  // Load events for a specific pixel
  const loadPixelEvents = useCallback(async (pixelId: string, workspaceId: string) => {
    if (!user?.id) return

    setLoadingEvents(workspaceId)
    try {
      const res = await fetch(`/api/pixel/events?pixelId=${pixelId}&userId=${user.id}&limit=50`)
      const data = await res.json()
      if (data.events) {
        setPixelEvents(prev => ({ ...prev, [workspaceId]: data.events }))
      }
      // Track last event time for active indicator
      setLastEventTimes(prev => ({ ...prev, [workspaceId]: data.lastEventTime || null }))
    } catch (err) {
      console.error('Failed to load pixel events:', err)
    } finally {
      setLoadingEvents(null)
    }
  }, [user?.id])

  // Update attribution source for a workspace
  const updateAttributionSource = async (workspaceId: string, newSource: 'native' | 'pixel') => {
    setUpdatingAttribution(workspaceId)
    try {
      const { error } = await supabase
        .from('workspace_pixels')
        .update({ attribution_source: newSource })
        .eq('workspace_id', workspaceId)

      if (!error) {
        // Update local state
        setWorkspacePixels(prev => prev.map(wp =>
          wp.workspace_id === workspaceId
            ? { ...wp, attribution_source: newSource }
            : wp
        ))
      } else {
        console.error('Failed to update attribution source:', error)
      }
    } catch (err) {
      console.error('Failed to update attribution source:', err)
    } finally {
      setUpdatingAttribution(null)
    }
  }

  // Load events when workspace is expanded
  useEffect(() => {
    if (expandedWorkspace) {
      const pixel = workspacePixels.find(p => p.workspace_id === expandedWorkspace)
      if (pixel && !pixelEvents[expandedWorkspace]) {
        loadPixelEvents(pixel.pixel_id, expandedWorkspace)
      }
      // Load kiosk settings for expanded workspace
      if (!kioskSettings[expandedWorkspace]) {
        loadKioskSettings(expandedWorkspace)
      }
    }
  }, [expandedWorkspace, workspacePixels, pixelEvents, loadPixelEvents])

  // Load kiosk settings for a workspace
  const loadKioskSettings = async (workspaceId: string) => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/kiosk/settings?workspaceId=${workspaceId}&userId=${user.id}`)
      const data = await res.json()
      if (res.ok) {
        setKioskSettings(prev => ({
          ...prev,
          [workspaceId]: {
            enabled: data.kioskEnabled,
            slug: data.kioskSlug,
            hasPin: data.hasPin
          }
        }))
        setKioskSlugInput(prev => ({ ...prev, [workspaceId]: data.kioskSlug || '' }))
      }
    } catch (err) {
      console.error('Failed to load kiosk settings:', err)
    }
  }

  // Update kiosk settings
  const updateKioskSettings = async (workspaceId: string, updates: { enabled?: boolean; slug?: string; pin?: string }) => {
    if (!user?.id) return
    setUpdatingKiosk(workspaceId)
    setKioskError(prev => ({ ...prev, [workspaceId]: null }))

    try {
      const res = await fetch('/api/kiosk/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId: user.id,
          ...updates
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setKioskError(prev => ({ ...prev, [workspaceId]: data.error }))
        return
      }

      // Reload settings
      await loadKioskSettings(workspaceId)

      // Clear PIN input after successful save
      if (updates.pin) {
        setKioskPinInput(prev => ({ ...prev, [workspaceId]: '' }))
      }
    } catch (err) {
      setKioskError(prev => ({ ...prev, [workspaceId]: 'Failed to update settings' }))
    } finally {
      setUpdatingKiosk(null)
    }
  }

  const copyKioskUrl = async (slug: string, workspaceId: string) => {
    const url = `https://kiosk.killscale.com/${slug}`
    await navigator.clipboard.writeText(url)
    setCopiedKioskUrl(workspaceId)
    setTimeout(() => setCopiedKioskUrl(null), 2000)
  }

  // Load active ads hierarchy for attribution selection
  const loadActiveAds = async (workspaceId: string) => {
    if (!user?.id) return
    setLogAdsLoading(true)
    try {
      const res = await fetch(`/api/workspace/active-hierarchy?workspaceId=${workspaceId}&userId=${user.id}`)
      const data = await res.json()
      if (res.ok && data.campaigns) {
        setLogHierarchy(data.campaigns)
        // Find top spender ad
        const allAds = data.campaigns.flatMap((c: any) =>
          c.adsets.flatMap((as: any) => as.ads)
        )
        if (allAds.length > 0) {
          // Sort by spend to find top spender
          const topAd = allAds.sort((a: any, b: any) => b.spend - a.spend)[0]
          setLogAttribution('top')
          setLogSelectedAd(topAd.adId)
        } else {
          // No ads - keep default, UI will show "no ads" message
          setLogAttribution('top')
          setLogSelectedAd(null)
        }
      }
    } catch (err) {
      console.error('Failed to load active hierarchy:', err)
    } finally {
      setLogAdsLoading(false)
    }
  }

  // Helper to get all ads from hierarchy
  const getAllAdsFromHierarchy = () => {
    return logHierarchy.flatMap(c =>
      c.adsets.flatMap(as => as.ads)
    ).sort((a, b) => b.spend - a.spend)
  }

  // Helper to get top spender ad
  const getTopSpenderAd = () => {
    const allAds = getAllAdsFromHierarchy()
    return allAds.length > 0 ? allAds[0] : null
  }

  // Helper to get total ad count
  const getTotalAdCount = () => {
    return logHierarchy.reduce((sum, c) =>
      sum + c.adsets.reduce((s, as) => s + as.ads.length, 0), 0
    )
  }

  const handleLogEvent = async (workspaceId: string) => {
    // Only validate value for purchase events
    let numValue: number | undefined = undefined
    if (logEventType === 'purchase') {
      numValue = parseFloat(logValue)
      if (isNaN(numValue) || numValue <= 0) {
        setLogError('Please enter a valid amount')
        return
      }
    }

    // Determine the adId based on attribution mode
    let adIdToUse: string | undefined = undefined
    const topAd = getTopSpenderAd()
    if (logAttribution === 'top' && topAd) {
      adIdToUse = topAd.adId  // Top spender
    } else if (logAttribution === 'select' && logSelectedAd) {
      adIdToUse = logSelectedAd
    }

    setLogLoading(true)
    setLogError(null)

    try {
      const res = await fetch('/api/pixel/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          eventType: logEventType,
          eventValue: numValue,
          adId: adIdToUse,
          notes: logNotes || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to log walk-in')
      }

      setLogSuccess(true)
      // Refresh events
      const wp = workspacePixels.find(p => p.workspace_id === workspaceId)
      if (wp) {
        loadPixelEvents(wp.pixel_id, workspaceId)
      }

      setTimeout(() => {
        setShowLogModal(null)
        setLogSuccess(false)
        setLogEventType('purchase')
        setLogValue('100')
        setLogNotes('')
        setShowEventDropdown(false)
      }, 1500)

    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to log walk-in')
    } finally {
      setLogLoading(false)
    }
  }

  const getPixelSnippet = (pixelId: string, pixelSecret: string) => `<!-- KillScale Pixel -->
<script>
!function(k,s,p,i,x,e,l){if(k.ks)return;x=k.ks=function(){x.q.push(arguments)};
x.q=[];e=s.createElement(p);l=s.getElementsByTagName(p)[0];
e.async=1;e.src='https://pixel.killscale.com/ks.js';l.parentNode.insertBefore(e,l)
}(window,document,'script');

ks('init', '${pixelId}', { secret: '${pixelSecret}' });
ks('pageview');
</script>
<!-- End KillScale Pixel -->`

  const copyPixelSnippet = async (pixelId: string, pixelSecret: string) => {
    await navigator.clipboard.writeText(getPixelSnippet(pixelId, pixelSecret))
    setCopiedPixelId(pixelId)
    setTimeout(() => setCopiedPixelId(null), 2000)
  }

  const copyUtmTemplate = async () => {
    await navigator.clipboard.writeText('?utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}')
    setCopiedUtm(true)
    setTimeout(() => setCopiedUtm(false), 2000)
  }

  const downloadPixelFile = (pixelId: string, pixelSecret: string, workspaceName: string) => {
    const snippet = getPixelSnippet(pixelId, pixelSecret)
    const blob = new Blob([snippet], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `killscale-pixel-${workspaceName.toLowerCase().replace(/\s+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Check if pixel is "active" (received event in last 24 hours)
  const isPixelActive = (workspaceId: string) => {
    const lastEvent = lastEventTimes[workspaceId]
    if (!lastEvent) return false
    const lastEventDate = new Date(lastEvent)
    const now = new Date()
    const diffMs = now.getTime() - lastEventDate.getTime()
    const diffHours = diffMs / 3600000
    return diffHours < 24
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  // Pro+ only - show upgrade prompt for Free/Starter
  if (!isProPlus) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Pixel</h1>
          <p className="text-zinc-500">First-party conversion tracking for accurate attribution</p>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Unlock KillScale Pixel</h2>
          <p className="text-zinc-500 mb-6 max-w-md mx-auto">
            Get first-party conversion tracking for more accurate attribution.
            Upgrade to Pro to access the KillScale Pixel.
          </p>
          <div className="space-y-4">
            <ul className="text-sm text-left max-w-xs mx-auto space-y-2">
              <li className="flex items-center gap-2 text-zinc-400">
                <Sparkles className="w-4 h-4 text-accent" />
                First-party tracking (no 3rd party cookies)
              </li>
              <li className="flex items-center gap-2 text-zinc-400">
                <Sparkles className="w-4 h-4 text-accent" />
                More accurate than Meta Pixel
              </li>
              <li className="flex items-center gap-2 text-zinc-400">
                <Sparkles className="w-4 h-4 text-accent" />
                One pixel per workspace
              </li>
            </ul>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-accent to-purple-500 hover:from-accent-hover hover:to-purple-400 text-white rounded-lg font-medium transition-all"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // No workspaces - prompt to create one
  if (workspaces.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Pixel</h1>
          <p className="text-zinc-500">First-party conversion tracking for accurate attribution</p>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-accent/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layers className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Create a Workspace First</h2>
          <p className="text-zinc-500 mb-6 max-w-md mx-auto">
            Each workspace gets its own pixel. Create a workspace to start tracking conversions for that business.
          </p>
          <Link
            href="/dashboard/settings/workspaces"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Workspace
          </Link>
        </div>

        {/* UTM Parameters - always show this */}
        <div className="bg-bg-card border border-border rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">UTM Parameters</h2>
              <p className="text-sm text-zinc-500 mt-1">Track conversions back to specific ads</p>
            </div>
            <button
              onClick={copyUtmTemplate}
              className="flex items-center gap-2 px-3 py-1.5 bg-bg-dark border border-border rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            >
              {copiedUtm ? (
                <>
                  <Check className="w-4 h-4 text-verdict-scale" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Template
                </>
              )}
            </button>
          </div>

          <code className="block p-4 bg-bg-dark rounded-lg text-sm text-zinc-400 font-mono break-all">
            {'?utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}'}
          </code>
        </div>
      </div>
    )
  }

  // Has workspaces - show each as a collapsible
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Pixel</h1>
        <p className="text-zinc-500">First-party conversion tracking for accurate attribution</p>
      </div>

      {/* Workspace Pixels */}
      <div className="space-y-4 mb-6">
        {workspacePixels.map((wp) => {
          const isExpanded = expandedWorkspace === wp.workspace_id
          const events = pixelEvents[wp.workspace_id] || []
          const isLoadingEvents = loadingEvents === wp.workspace_id

          return (
            <div
              key={wp.workspace_id}
              className="bg-bg-card border border-border rounded-xl overflow-hidden"
            >
              {/* Header - Clickable */}
              <button
                onClick={() => setExpandedWorkspace(isExpanded ? null : wp.workspace_id)}
                className="w-full p-4 flex items-center justify-between hover:bg-bg-hover/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-accent" />
                  <div className="text-left">
                    <div className="font-medium">{wp.workspace_name}</div>
                    <div className="text-sm text-zinc-500 font-mono">{wp.pixel_id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Active/Inactive Status */}
                  {lastEventTimes[wp.workspace_id] !== undefined && (
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                      isPixelActive(wp.workspace_id)
                        ? "bg-verdict-scale/20 text-verdict-scale"
                        : "bg-zinc-700/50 text-zinc-500"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isPixelActive(wp.workspace_id) ? "bg-verdict-scale" : "bg-zinc-500"
                      )} />
                      {isPixelActive(wp.workspace_id) ? 'Active' : 'Inactive'}
                    </div>
                  )}
                  {events.length > 0 && (
                    <span className="text-xs text-zinc-500">
                      {events.length} events
                    </span>
                  )}
                  <ChevronDown className={cn(
                    "w-5 h-5 text-zinc-500 transition-transform",
                    isExpanded && "rotate-180"
                  )} />
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-6">
                  {/* Install Code */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-sm">Install Code</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => downloadPixelFile(wp.pixel_id, wp.pixel_secret, wp.workspace_name)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button
                          onClick={() => copyPixelSnippet(wp.pixel_id, wp.pixel_secret)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          {copiedPixelId === wp.pixel_id ? (
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

                    <pre className="p-3 bg-bg-dark rounded-lg text-xs text-zinc-400 overflow-x-auto font-mono">
                      {getPixelSnippet(wp.pixel_id, wp.pixel_secret)}
                    </pre>

                    <p className="text-xs text-zinc-600 mt-2">
                      Add to your website's <code className="bg-zinc-800 px-1 rounded">&lt;head&gt;</code> section.
                      For purchases: <code className="bg-zinc-800 px-1 rounded">ks('purchase', {'{ value: 99.99 }'})</code>
                    </p>
                  </div>

                  {/* Attribution Source Toggle */}
                  <div>
                    <h3 className="font-medium text-sm mb-3">Attribution Source</h3>
                    <p className="text-xs text-zinc-500 mb-3">
                      Choose how conversions are tracked for this workspace's dashboard metrics.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => updateAttributionSource(wp.workspace_id, 'native')}
                        disabled={updatingAttribution === wp.workspace_id}
                        className={cn(
                          "flex-1 p-3 rounded-lg border-2 transition-all text-left",
                          wp.attribution_source === 'native'
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-zinc-600"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                            wp.attribution_source === 'native'
                              ? "border-accent"
                              : "border-zinc-600"
                          )}>
                            {wp.attribution_source === 'native' && (
                              <div className="w-2 h-2 rounded-full bg-accent" />
                            )}
                          </div>
                          <span className="font-medium text-sm">Native (Meta)</span>
                        </div>
                        <p className="text-xs text-zinc-500 ml-6">
                          Use Meta's built-in conversion tracking
                        </p>
                      </button>

                      <button
                        onClick={() => updateAttributionSource(wp.workspace_id, 'pixel')}
                        disabled={updatingAttribution === wp.workspace_id}
                        className={cn(
                          "flex-1 p-3 rounded-lg border-2 transition-all text-left",
                          wp.attribution_source === 'pixel'
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-border hover:border-zinc-600"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                            wp.attribution_source === 'pixel'
                              ? "border-purple-500"
                              : "border-zinc-600"
                          )}>
                            {wp.attribution_source === 'pixel' && (
                              <div className="w-2 h-2 rounded-full bg-purple-500" />
                            )}
                          </div>
                          <span className="font-medium text-sm">KillScale Pixel</span>
                        </div>
                        <p className="text-xs text-zinc-500 ml-6">
                          Use first-party tracking for better accuracy
                        </p>
                      </button>
                    </div>
                    {updatingAttribution === wp.workspace_id && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Updating...
                      </div>
                    )}
                  </div>

                  {/* Sales Kiosk */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Smartphone className="w-4 h-4 text-zinc-400" />
                      <h3 className="font-medium text-sm">Sales Kiosk</h3>
                    </div>
                    <p className="text-xs text-zinc-500 mb-4">
                      A simplified view for staff to log walk-in sales without full dashboard access.
                    </p>

                    {kioskError[wp.workspace_id] && (
                      <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                        {kioskError[wp.workspace_id]}
                      </div>
                    )}

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between p-3 bg-bg-dark rounded-lg mb-3">
                      <span className="text-sm">Enable Sales Kiosk</span>
                      <button
                        onClick={() => updateKioskSettings(wp.workspace_id, { enabled: !kioskSettings[wp.workspace_id]?.enabled })}
                        disabled={updatingKiosk === wp.workspace_id}
                        className={cn(
                          "w-10 h-6 rounded-full transition-colors relative",
                          kioskSettings[wp.workspace_id]?.enabled ? "bg-accent" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                          kioskSettings[wp.workspace_id]?.enabled ? "left-5" : "left-1"
                        )} />
                      </button>
                    </div>

                    {kioskSettings[wp.workspace_id]?.enabled && (
                      <>
                        {/* Kiosk URL */}
                        <div className="mb-3">
                          <label className="block text-xs text-zinc-500 mb-1">Kiosk URL</label>
                          <div className="flex gap-2">
                            <div className="flex-1 flex items-center bg-bg-dark border border-border rounded-lg overflow-hidden">
                              <span className="px-2 text-xs text-zinc-600 border-r border-border">kiosk.killscale.com/</span>
                              <input
                                type="text"
                                value={kioskSlugInput[wp.workspace_id] || ''}
                                onChange={(e) => setKioskSlugInput(prev => ({ ...prev, [wp.workspace_id]: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                placeholder="your-business"
                                className="flex-1 px-2 py-2 bg-transparent text-sm text-white focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => updateKioskSettings(wp.workspace_id, { slug: kioskSlugInput[wp.workspace_id] })}
                              disabled={updatingKiosk === wp.workspace_id || kioskSlugInput[wp.workspace_id] === kioskSettings[wp.workspace_id]?.slug}
                              className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        {/* Copy URL button */}
                        {kioskSettings[wp.workspace_id]?.slug && (
                          <button
                            onClick={() => copyKioskUrl(kioskSettings[wp.workspace_id].slug!, wp.workspace_id)}
                            className="w-full mb-3 flex items-center justify-center gap-2 p-2 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                          >
                            {copiedKioskUrl === wp.workspace_id ? (
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
                            PIN Code {kioskSettings[wp.workspace_id]?.hasPin && <span className="text-verdict-scale">(set)</span>}
                          </label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type={showKioskPin[wp.workspace_id] ? 'text' : 'password'}
                                value={kioskPinInput[wp.workspace_id] || ''}
                                onChange={(e) => setKioskPinInput(prev => ({ ...prev, [wp.workspace_id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                placeholder={kioskSettings[wp.workspace_id]?.hasPin ? '••••' : 'Enter 4-6 digits'}
                                maxLength={6}
                                className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm text-white focus:outline-none focus:border-accent"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKioskPin(prev => ({ ...prev, [wp.workspace_id]: !prev[wp.workspace_id] }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                              >
                                {showKioskPin[wp.workspace_id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <button
                              onClick={() => updateKioskSettings(wp.workspace_id, { pin: kioskPinInput[wp.workspace_id] })}
                              disabled={updatingKiosk === wp.workspace_id || !kioskPinInput[wp.workspace_id] || kioskPinInput[wp.workspace_id].length < 4}
                              className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                            >
                              {kioskSettings[wp.workspace_id]?.hasPin ? 'Change' : 'Set'}
                            </button>
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">Staff will enter this PIN to access the kiosk.</p>
                        </div>
                      </>
                    )}

                    {updatingKiosk === wp.workspace_id && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Updating...
                      </div>
                    )}
                  </div>

                  {/* Manual Event Logging */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Plus className="w-4 h-4 text-zinc-400" />
                      <h3 className="font-medium text-sm">Manual Event Logging</h3>
                    </div>
                    <p className="text-xs text-zinc-500 mb-4">
                      Manually log walk-ins, phone orders, signups, or other offline conversions.
                    </p>
                    <button
                      onClick={() => {
                        setShowLogModal(wp.workspace_id)
                        setLogValue('100')
                        setLogNotes('')
                        setLogError(null)
                        setLogSuccess(false)
                        setLogHierarchy([])
                        setLogExpandedCampaigns(new Set())
                        setLogExpandedAdsets(new Set())
                        setLogAttribution('top')
                        setLogSelectedAd(null)
                        loadActiveAds(wp.workspace_id)
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Log Manual Event
                    </button>
                  </div>

                  {/* Event Viewer */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-zinc-400" />
                        <h3 className="font-medium text-sm">Recent Events</h3>
                      </div>
                      <button
                        onClick={() => loadPixelEvents(wp.pixel_id, wp.workspace_id)}
                        disabled={isLoadingEvents}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isLoadingEvents && "animate-spin")} />
                        Refresh
                      </button>
                    </div>

                    {isLoadingEvents && events.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                      </div>
                    ) : events.length === 0 ? (
                      <div className="text-center py-8 bg-bg-dark rounded-lg">
                        <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500">No events received yet</p>
                        <p className="text-xs text-zinc-600 mt-1">Install the pixel and events will appear here</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {events.slice(0, 10).map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center justify-between p-2.5 bg-bg-dark rounded-lg text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-xs font-medium",
                                event.event_type === 'purchase' ? 'bg-verdict-scale/20 text-verdict-scale' :
                                event.event_type === 'pageview' ? 'bg-zinc-700 text-zinc-400' :
                                'bg-accent/20 text-accent'
                              )}>
                                {event.event_type}
                              </span>
                              {event.event_value && (
                                <span className="text-zinc-400">${event.event_value.toFixed(2)}</span>
                              )}
                              {event.utm_content && (
                                <span className="text-xs text-zinc-600 font-mono truncate max-w-[100px]" title={event.utm_content}>
                                  {event.utm_content}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-zinc-600 flex-shrink-0">
                              {formatTimeAgo(event.event_time)}
                            </span>
                          </div>
                        ))}
                        {events.length > 10 && (
                          <p className="text-xs text-zinc-600 text-center pt-2">
                            +{events.length - 10} more events
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* UTM Parameters */}
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">UTM Parameters</h2>
            <p className="text-sm text-zinc-500 mt-1">Track conversions back to specific ads</p>
          </div>
          <button
            onClick={copyUtmTemplate}
            className="flex items-center gap-2 px-3 py-1.5 bg-bg-dark border border-border rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            {copiedUtm ? (
              <>
                <Check className="w-4 h-4 text-verdict-scale" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Template
              </>
            )}
          </button>
        </div>

        <code className="block p-4 bg-bg-dark rounded-lg text-sm text-zinc-400 font-mono break-all">
          {'?utm_source=facebook&utm_medium=cpc&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}'}
        </code>

        <p className="text-xs text-zinc-600 mt-3">
          Add to your ad destination URLs. Campaigns created in KillScale include these automatically.
        </p>
      </div>

      {/* Manual Event Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Log Manual Event</h2>
                <button
                  onClick={() => setShowLogModal(null)}
                  className="p-2 hover:bg-bg-hover rounded-lg"
                >
                  <span className="text-zinc-400 text-xl">&times;</span>
                </button>
              </div>

              {logSuccess && (
                <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-center">
                  Event logged successfully!
                </div>
              )}

              {logError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {logError}
                </div>
              )}

              {!logSuccess && (
                <>
                  {/* Event Type */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Event Type</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEventDropdown(!showEventDropdown)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-bg-dark border border-border rounded-xl text-white focus:outline-none focus:border-accent"
                      >
                        <span>{EVENT_TYPES.find(e => e.value === logEventType)?.label || 'Select type'}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", showEventDropdown && "rotate-180")} />
                      </button>
                      {showEventDropdown && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowEventDropdown(false)} />
                          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                            {EVENT_TYPES.map((type) => (
                              <button
                                key={type.value}
                                type="button"
                                onClick={() => {
                                  setLogEventType(type.value)
                                  setShowEventDropdown(false)
                                }}
                                className={cn(
                                  "w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 transition-colors",
                                  logEventType === type.value && "bg-zinc-700 text-accent"
                                )}
                              >
                                {type.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Event Value - only for purchase */}
                  {logEventType === 'purchase' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Event Value</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xl">$</span>
                        <input
                          type="number"
                          value={logValue}
                          onChange={(e) => setLogValue(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="w-full pl-10 pr-4 py-4 bg-bg-dark border border-border rounded-xl text-white text-2xl font-bold focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  )}

                  {/* Attribution Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Attribute to</label>
                    {logAdsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                      </div>
                    ) : getTotalAdCount() === 0 ? (
                      <div className="p-3 bg-zinc-800/50 rounded-lg text-sm text-zinc-500 text-center">
                        No active ads found. Event will be logged without ad attribution.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Top Spender Option */}
                        {(() => {
                          const topAd = getTopSpenderAd()
                          return topAd ? (
                            <label
                              className={cn(
                                "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                                logAttribution === 'top'
                                  ? "border-accent bg-accent/10"
                                  : "border-border hover:border-zinc-600"
                              )}
                            >
                              <input
                                type="radio"
                                name="attribution"
                                checked={logAttribution === 'top'}
                                onChange={() => {
                                  setLogAttribution('top')
                                  setLogSelectedAd(topAd.adId)
                                }}
                                className="sr-only"
                              />
                              <div className={cn(
                                "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                                logAttribution === 'top' ? "border-accent bg-accent" : "border-zinc-500"
                              )}>
                                {logAttribution === 'top' && (
                                  <div className="w-full h-full rounded-full bg-white scale-50" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-white font-medium">Top Spender (last 7 days)</span>
                                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                                  {topAd.adName} • ${topAd.spend.toLocaleString()} ({topAd.spendPercentage}%)
                                </p>
                              </div>
                            </label>
                          ) : null
                        })()}

                        {/* Select Specific Ad Option */}
                        <label
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                            logAttribution === 'select'
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-zinc-600"
                          )}
                        >
                          <input
                            type="radio"
                            name="attribution"
                            checked={logAttribution === 'select'}
                            onChange={() => setLogAttribution('select')}
                            className="sr-only"
                          />
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                            logAttribution === 'select' ? "border-accent bg-accent" : "border-zinc-500"
                          )}>
                            {logAttribution === 'select' && (
                              <div className="w-full h-full rounded-full bg-white scale-50" />
                            )}
                          </div>
                          <div className="flex-1">
                            <span className="text-white font-medium">Select Specific Ad</span>
                            <p className="text-xs text-zinc-500 mt-0.5">Choose which ad brought them in</p>
                          </div>
                        </label>

                        {/* Hierarchical Ad Picker (shown when 'select' is chosen) */}
                        {logAttribution === 'select' && (
                          <div className="ml-4 max-h-64 overflow-y-auto bg-bg-dark rounded-lg border border-border">
                            {logHierarchy.map((campaign) => {
                              const isCampaignExpanded = logExpandedCampaigns.has(campaign.campaignId)
                              return (
                                <div key={campaign.campaignId}>
                                  {/* Campaign Row */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newExpanded = new Set(logExpandedCampaigns)
                                      if (isCampaignExpanded) {
                                        newExpanded.delete(campaign.campaignId)
                                      } else {
                                        newExpanded.add(campaign.campaignId)
                                      }
                                      setLogExpandedCampaigns(newExpanded)
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 text-left"
                                  >
                                    {isCampaignExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                    )}
                                    <span className="text-xs font-medium text-hierarchy-campaign truncate">{campaign.campaignName}</span>
                                    <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">
                                      {campaign.adsets.reduce((sum, as) => sum + as.ads.length, 0)} ads
                                    </span>
                                  </button>

                                  {/* Ad Sets (shown when campaign is expanded) */}
                                  {isCampaignExpanded && (
                                    <div className="border-l border-zinc-700 ml-5">
                                      {campaign.adsets.map((adset) => {
                                        const isAdsetExpanded = logExpandedAdsets.has(adset.adsetId)
                                        return (
                                          <div key={adset.adsetId}>
                                            {/* Ad Set Row */}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newExpanded = new Set(logExpandedAdsets)
                                                if (isAdsetExpanded) {
                                                  newExpanded.delete(adset.adsetId)
                                                } else {
                                                  newExpanded.add(adset.adsetId)
                                                }
                                                setLogExpandedAdsets(newExpanded)
                                              }}
                                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 text-left"
                                            >
                                              {isAdsetExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                              ) : (
                                                <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                              )}
                                              <span className="text-xs font-medium text-hierarchy-adset truncate">{adset.adsetName}</span>
                                              <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">
                                                {adset.ads.length} ads
                                              </span>
                                            </button>

                                            {/* Ads (shown when adset is expanded) */}
                                            {isAdsetExpanded && (
                                              <div className="border-l border-zinc-700 ml-5">
                                                {adset.ads.map((ad) => (
                                                  <label
                                                    key={ad.adId}
                                                    className={cn(
                                                      "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                                                      logSelectedAd === ad.adId
                                                        ? "bg-accent/20"
                                                        : "hover:bg-zinc-800/50"
                                                    )}
                                                  >
                                                    <input
                                                      type="radio"
                                                      name="selectedAd"
                                                      checked={logSelectedAd === ad.adId}
                                                      onChange={() => setLogSelectedAd(ad.adId)}
                                                      className="sr-only"
                                                    />
                                                    <div className={cn(
                                                      "w-3 h-3 rounded-full border-2 flex-shrink-0",
                                                      logSelectedAd === ad.adId ? "border-accent bg-accent" : "border-zinc-600"
                                                    )}>
                                                      {logSelectedAd === ad.adId && (
                                                        <div className="w-full h-full rounded-full bg-white scale-50" />
                                                      )}
                                                    </div>
                                                    <span className="flex-1 text-xs text-white truncate">{ad.adName}</span>
                                                    <span className="text-xs text-zinc-500 flex-shrink-0">${ad.spend.toLocaleString()}</span>
                                                    <span className="text-xs text-zinc-600 flex-shrink-0">{ad.spendPercentage}%</span>
                                                  </label>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                      </div>
                    )}
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Notes (optional)</label>
                    <input
                      type="text"
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      placeholder="e.g., Walk-in customer, phone order"
                      className="w-full px-4 py-3 bg-bg-dark border border-border rounded-xl text-white focus:outline-none focus:border-accent"
                    />
                  </div>

                  <button
                    onClick={() => handleLogEvent(showLogModal)}
                    disabled={logLoading || (logAttribution === 'select' && !logSelectedAd)}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-colors"
                  >
                    {logLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Log ${EVENT_TYPES.find(e => e.value === logEventType)?.label || 'Event'}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
