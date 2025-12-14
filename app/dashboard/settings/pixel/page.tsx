'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Copy, Check, Activity, RefreshCw, Download, ExternalLink, Lock, Sparkles, ChevronDown, Layers, Plus } from 'lucide-react'
import { useAuth, supabase } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { cn } from '@/lib/utils'

type Workspace = {
  id: string
  name: string
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
    }
  }, [expandedWorkspace, workspacePixels, pixelEvents, loadPixelEvents])

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
    </div>
  )
}
