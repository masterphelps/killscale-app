'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, ChevronDown, RefreshCw, Loader2, Radio } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'
import { UtmIndicator } from './utm-indicator'
import { cn } from '@/lib/utils'

interface CampaignHierarchy {
  id: string
  name: string
  status: string
  adsets: {
    id: string
    name: string
    status: string
    ads: {
      id: string
      name: string
      status: string
    }[]
  }[]
}

interface UtmStatusPanelProps {
  userId: string
  adAccountIds: string[]
}

export function UtmStatusPanel({ userId, adAccountIds }: UtmStatusPanelProps) {
  const [hierarchy, setHierarchy] = useState<CampaignHierarchy[]>([])
  const [utmStatus, setUtmStatus] = useState<Record<string, boolean>>({})
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const syncInFlightRef = useRef(false)

  // Load hierarchy from ad_data table
  const loadHierarchy = useCallback(async () => {
    if (!userId || adAccountIds.length === 0) {
      setHierarchy([])
      setLoading(false)
      return
    }

    try {
      // Fetch ad data for all Meta ad accounts in this workspace
      const { data: adData, error } = await supabase
        .from('ad_data')
        .select('campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, status')
        .eq('user_id', userId)
        .in('ad_account_id', adAccountIds)

      if (error) {
        console.error('Failed to load ad hierarchy:', error)
        setHierarchy([])
        return
      }

      if (!adData || adData.length === 0) {
        setHierarchy([])
        return
      }

      // Build hierarchy from flat data
      const campaignMap = new Map<string, CampaignHierarchy>()

      adData.forEach(row => {
        // Get or create campaign
        if (!campaignMap.has(row.campaign_id)) {
          campaignMap.set(row.campaign_id, {
            id: row.campaign_id,
            name: row.campaign_name || 'Unknown Campaign',
            status: 'ACTIVE', // We'll determine this from children
            adsets: []
          })
        }
        const campaign = campaignMap.get(row.campaign_id)!

        // Get or create adset
        let adset = campaign.adsets.find(a => a.id === row.adset_id)
        if (!adset) {
          adset = {
            id: row.adset_id,
            name: row.adset_name || 'Unknown Ad Set',
            status: 'ACTIVE',
            ads: []
          }
          campaign.adsets.push(adset)
        }

        // Add ad if not already present
        if (!adset.ads.find(a => a.id === row.ad_id)) {
          adset.ads.push({
            id: row.ad_id,
            name: row.ad_name || 'Unknown Ad',
            status: row.status || 'ACTIVE'
          })
        }
      })

      // Convert to array and sort by campaign name
      const hierarchyArray = Array.from(campaignMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))

      setHierarchy(hierarchyArray)
    } catch (err) {
      console.error('Error loading hierarchy:', err)
      setHierarchy([])
    }
  }, [userId, adAccountIds])

  // Load cached UTM status from Supabase
  const loadCachedUtmStatus = useCallback(async () => {
    if (!userId || adAccountIds.length === 0) {
      setUtmStatus({})
      setLoading(false)
      return
    }

    try {
      // Fetch cached UTM status for all ad accounts
      const allStatus: Record<string, boolean> = {}
      let latestSync: string | null = null

      for (const adAccountId of adAccountIds) {
        const response = await fetch(
          `/api/meta/sync-utm-status?userId=${userId}&adAccountId=${adAccountId}`
        )

        if (response.ok) {
          const data = await response.json()
          Object.assign(allStatus, data.utmStatus || {})
          if (data.lastSynced && (!latestSync || data.lastSynced > latestSync)) {
            latestSync = data.lastSynced
          }
        }
      }

      setUtmStatus(allStatus)
      setLastSynced(latestSync)
    } catch (err) {
      console.error('Error loading cached UTM status:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, adAccountIds])

  // Initial load
  useEffect(() => {
    setLoading(true)
    Promise.all([loadHierarchy(), loadCachedUtmStatus()])
  }, [loadHierarchy, loadCachedUtmStatus])

  // Sync UTM status from Meta API
  const handleSync = async () => {
    if (syncInFlightRef.current || syncing) return
    if (hierarchy.length === 0) return

    syncInFlightRef.current = true
    setSyncing(true)

    try {
      // Collect all ad IDs from hierarchy
      const allAdIds: string[] = []
      hierarchy.forEach(campaign => {
        campaign.adsets.forEach(adset => {
          adset.ads.forEach(ad => {
            allAdIds.push(ad.id)
          })
        })
      })

      if (allAdIds.length === 0) {
        return
      }

      // Sync each ad account separately
      const allStatus: Record<string, boolean> = {}
      let latestSync: string | null = null

      for (const adAccountId of adAccountIds) {
        // Get ad IDs for this account (we don't know which ads belong to which account,
        // so we send all and the API will filter)
        const response = await fetch('/api/meta/sync-utm-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            adAccountId,
            adIds: allAdIds
          })
        })

        if (response.ok) {
          const data = await response.json()
          Object.assign(allStatus, data.utmStatus || {})
          if (data.lastSynced) {
            latestSync = data.lastSynced
          }
        }
      }

      setUtmStatus(allStatus)
      setLastSynced(latestSync)
    } catch (err) {
      console.error('Error syncing UTM status:', err)
    } finally {
      setSyncing(false)
      syncInFlightRef.current = false
    }
  }

  // Calculate UTM counts for a campaign
  const getCampaignUtmCounts = (campaign: CampaignHierarchy) => {
    let tracked = 0
    let total = 0
    campaign.adsets.forEach(adset => {
      adset.ads.forEach(ad => {
        total++
        if (utmStatus[ad.id]) tracked++
      })
    })
    return { tracked, total }
  }

  // Calculate UTM counts for an adset
  const getAdsetUtmCounts = (adset: CampaignHierarchy['adsets'][0]) => {
    let tracked = 0
    let total = 0
    adset.ads.forEach(ad => {
      total++
      if (utmStatus[ad.id]) tracked++
    })
    return { tracked, total }
  }

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev)
      if (next.has(campaignId)) {
        next.delete(campaignId)
      } else {
        next.add(campaignId)
      }
      return next
    })
  }

  const toggleAdset = (adsetId: string) => {
    setExpandedAdsets(prev => {
      const next = new Set(prev)
      if (next.has(adsetId)) {
        next.delete(adsetId)
      } else {
        next.add(adsetId)
      }
      return next
    })
  }

  // Format relative time
  const formatLastSynced = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (adAccountIds.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-purple-400" />
          <h3 className="font-medium text-sm">UTM Tracking Status</h3>
        </div>
        <div className="text-center py-8 bg-bg-dark rounded-lg">
          <Radio className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No Meta accounts connected</p>
          <p className="text-xs text-zinc-600 mt-1">
            Connect a Meta ad account to track UTM status
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-purple-400" />
          <h3 className="font-medium text-sm">UTM Tracking Status</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastSynced && (
            <span className="text-xs text-zinc-600">
              {formatLastSynced(lastSynced)}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || loading || hierarchy.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            Sync UTM
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : hierarchy.length === 0 ? (
        <div className="text-center py-8 bg-bg-dark rounded-lg">
          <Radio className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No ads found</p>
          <p className="text-xs text-zinc-600 mt-1">
            Sync your Meta account to see UTM status
          </p>
        </div>
      ) : (
        <div className="space-y-0.5 max-h-80 overflow-y-auto">
          {hierarchy.map(campaign => {
            const { tracked, total } = getCampaignUtmCounts(campaign)
            const isExpanded = expandedCampaigns.has(campaign.id)

            return (
              <div key={campaign.id}>
                {/* Campaign row */}
                <button
                  onClick={() => toggleCampaign(campaign.id)}
                  className="w-full flex items-center gap-1.5 p-2 bg-bg-dark rounded-lg text-sm hover:bg-bg-hover transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  )}
                  <span className="truncate flex-1 text-left text-zinc-300">
                    {campaign.name}
                  </span>
                  <UtmIndicator tracked={tracked} total={total} loading={syncing} />
                  <span className="text-xs text-zinc-600 ml-1">
                    {tracked}/{total}
                  </span>
                </button>

                {/* Expanded adsets */}
                {isExpanded && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {campaign.adsets.map(adset => {
                      const adsetCounts = getAdsetUtmCounts(adset)
                      const isAdsetExpanded = expandedAdsets.has(adset.id)

                      return (
                        <div key={adset.id}>
                          {/* Adset row */}
                          <button
                            onClick={() => toggleAdset(adset.id)}
                            className="w-full flex items-center gap-1.5 p-1.5 rounded text-sm hover:bg-bg-hover/50 transition-colors"
                          >
                            {isAdsetExpanded ? (
                              <ChevronDown className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                            )}
                            <span className="truncate flex-1 text-left text-zinc-400 text-xs">
                              {adset.name}
                            </span>
                            <UtmIndicator tracked={adsetCounts.tracked} total={adsetCounts.total} loading={syncing} />
                            <span className="text-xs text-zinc-600 ml-1">
                              {adsetCounts.tracked}/{adsetCounts.total}
                            </span>
                          </button>

                          {/* Expanded ads */}
                          {isAdsetExpanded && (
                            <div className="ml-4 mt-0.5 space-y-0.5">
                              {adset.ads.map(ad => {
                                const hasUtm = utmStatus[ad.id]
                                return (
                                  <div
                                    key={ad.id}
                                    className="flex items-center gap-1.5 p-1 rounded text-xs text-zinc-500"
                                  >
                                    <span className="truncate flex-1">
                                      {ad.name}
                                    </span>
                                    <UtmIndicator tracked={hasUtm ? 1 : 0} total={1} loading={syncing} />
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
            )
          })}
        </div>
      )}
    </div>
  )
}
