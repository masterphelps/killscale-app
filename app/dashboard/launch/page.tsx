'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, Plus, Play, Pause, ExternalLink, Loader2, Sparkles, ChevronRight, ChevronDown, Image as ImageIcon, Video } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { useAccount } from '@/lib/account'
import { createClient } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { LaunchWizard } from '@/components/launch-wizard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface MetaCampaign {
  id: string
  name: string
  status: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  objective?: string
}

interface KillScaleCampaign {
  campaign_id: string
  budget_type: 'cbo' | 'abo'
  daily_budget: number
  created_at: string
  ad_ids: string[]
}

interface CombinedCampaign extends MetaCampaign {
  isKillScaleCreated: boolean
  killScaleData?: KillScaleCampaign
}

interface AdSet {
  id: string
  name: string
  status: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  optimizationGoal?: string
}

interface Ad {
  id: string
  name: string
  status: string
  creative: {
    id: string
    name?: string
    thumbnailUrl?: string
    imageUrl?: string
    hasCreative: boolean
  } | null
}

interface Creative {
  id: string
  name?: string
  thumbnailUrl?: string
  imageUrl?: string
  previewUrl?: string
  mediaType: 'image' | 'video' | 'unknown'
}

export default function LaunchPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { plan } = useSubscription()
  const { currentAccountId, loading: accountLoading } = useAccount()

  const [campaigns, setCampaigns] = useState<CombinedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Explorer state
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set())
  const [adSetsData, setAdSetsData] = useState<Record<string, AdSet[]>>({})
  const [adsData, setAdsData] = useState<Record<string, Ad[]>>({})
  const [creativesData, setCreativesData] = useState<Record<string, Creative>>({})
  const [loadingAdSets, setLoadingAdSets] = useState<Set<string>>(new Set())
  const [loadingAds, setLoadingAds] = useState<Set<string>>(new Set())
  const [loadingCreatives, setLoadingCreatives] = useState<Set<string>>(new Set())

  // Track the last loaded account to detect changes
  const [lastLoadedAccountId, setLastLoadedAccountId] = useState<string | null>(null)

  const planLower = plan?.toLowerCase() || ''
  const canLaunch = planLower === 'pro' || planLower === 'agency'

  // Load campaigns when account changes
  useEffect(() => {
    if (!canLaunch) {
      setLoading(false)
      return
    }

    if (currentAccountId && user && currentAccountId !== lastLoadedAccountId) {
      // Clear cached data from previous account
      setExpandedCampaigns(new Set())
      setExpandedAdSets(new Set())
      setAdSetsData({})
      setAdsData({})
      setCreativesData({})
      setCampaigns([])
      setLastLoadedAccountId(currentAccountId)
      loadCampaigns()
    } else if (!accountLoading && !currentAccountId) {
      setLoading(false)
    }
  }, [currentAccountId, user, canLaunch, accountLoading, lastLoadedAccountId])

  const loadCampaigns = async () => {
    if (!user || !currentAccountId) return

    setLoading(true)
    try {
      // Fetch all campaigns from Meta API
      const metaRes = await fetch(`/api/meta/campaigns?userId=${user.id}&adAccountId=${currentAccountId}`)
      const metaData = await metaRes.json()
      const metaCampaigns: MetaCampaign[] = metaData.campaigns || []

      // Fetch KillScale-created campaigns
      const { data: ksData } = await supabase
        .from('campaign_creations')
        .select('campaign_id, budget_type, daily_budget, created_at, ad_ids')
        .eq('user_id', user.id)
        .eq('ad_account_id', currentAccountId)

      const ksCampaignIds = new Set((ksData || []).map(k => k.campaign_id))
      const ksMap = new Map((ksData || []).map(k => [k.campaign_id, k]))

      // Combine the data
      const combined: CombinedCampaign[] = metaCampaigns.map(mc => ({
        ...mc,
        isKillScaleCreated: ksCampaignIds.has(mc.id),
        killScaleData: ksMap.get(mc.id)
      }))

      // Sort: KillScale-created first, then by name
      combined.sort((a, b) => {
        if (a.isKillScaleCreated && !b.isKillScaleCreated) return -1
        if (!a.isKillScaleCreated && b.isKillScaleCreated) return 1
        return a.name.localeCompare(b.name)
      })

      setCampaigns(combined)
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusToggle = async (campaign: CombinedCampaign) => {
    if (!user) return

    const newStatus = campaign.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED'
    setUpdatingStatus(campaign.id)

    try {
      const res = await fetch('/api/meta/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: campaign.id,
          entityType: 'campaign',
          status: newStatus
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update status')
      }

      // Update local state
      setCampaigns(prev =>
        prev.map(c =>
          c.id === campaign.id ? { ...c, status: newStatus } : c
        )
      )

      // If KillScale-created, also update the DB record
      if (campaign.isKillScaleCreated) {
        await supabase
          .from('campaign_creations')
          .update({
            status: newStatus,
            activated_at: newStatus === 'ACTIVE' ? new Date().toISOString() : null
          })
          .eq('campaign_id', campaign.id)
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleWizardComplete = () => {
    setShowWizard(false)
    loadCampaigns()
  }

  // Determine if campaign is CBO (budget at campaign level) or ABO (budget at ad set level)
  const getBudgetType = (campaign: CombinedCampaign): 'CBO' | 'ABO' => {
    // If campaign has budget, it's CBO
    if (campaign.dailyBudget || campaign.lifetimeBudget) {
      return 'CBO'
    }
    // Otherwise it's ABO (budget at ad set level)
    return 'ABO'
  }

  // Format objective for display
  const formatObjective = (objective?: string): string => {
    if (!objective) return ''
    // Convert OUTCOME_SALES -> Sales, OUTCOME_LEADS -> Leads, etc.
    return objective
      .replace('OUTCOME_', '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  // Toggle campaign expansion
  const toggleCampaign = async (campaignId: string) => {
    const newExpanded = new Set(expandedCampaigns)
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId)
    } else {
      newExpanded.add(campaignId)
      // Load ad sets if not already loaded
      if (!adSetsData[campaignId]) {
        await loadAdSets(campaignId)
      }
    }
    setExpandedCampaigns(newExpanded)
  }

  // Toggle ad set expansion
  const toggleAdSet = async (adSetId: string) => {
    const newExpanded = new Set(expandedAdSets)
    if (newExpanded.has(adSetId)) {
      newExpanded.delete(adSetId)
    } else {
      newExpanded.add(adSetId)
      // Load ads if not already loaded
      if (!adsData[adSetId]) {
        await loadAds(adSetId)
      }
    }
    setExpandedAdSets(newExpanded)
  }

  // Load ad sets for a campaign
  const loadAdSets = async (campaignId: string) => {
    if (!user) return

    setLoadingAdSets(prev => new Set(prev).add(campaignId))
    try {
      const res = await fetch(`/api/meta/adsets?userId=${user.id}&campaignId=${campaignId}`)
      const data = await res.json()
      if (data.adsets) {
        setAdSetsData(prev => ({ ...prev, [campaignId]: data.adsets }))
      }
    } catch (err) {
      console.error('Failed to load ad sets:', err)
    } finally {
      setLoadingAdSets(prev => {
        const next = new Set(prev)
        next.delete(campaignId)
        return next
      })
    }
  }

  // Load ads for an ad set
  const loadAds = async (adSetId: string) => {
    if (!user) return

    setLoadingAds(prev => new Set(prev).add(adSetId))
    try {
      const res = await fetch(`/api/meta/ads?userId=${user.id}&adsetId=${adSetId}`)
      const data = await res.json()
      if (data.ads) {
        setAdsData(prev => ({ ...prev, [adSetId]: data.ads }))
        // Load creatives for ads that have them
        for (const ad of data.ads) {
          if (ad.creative?.id && !creativesData[ad.creative.id]) {
            loadCreative(ad.creative.id)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load ads:', err)
    } finally {
      setLoadingAds(prev => {
        const next = new Set(prev)
        next.delete(adSetId)
        return next
      })
    }
  }

  // Load creative details
  const loadCreative = async (creativeId: string) => {
    if (!user || creativesData[creativeId] || loadingCreatives.has(creativeId)) return

    setLoadingCreatives(prev => new Set(prev).add(creativeId))
    try {
      const res = await fetch(`/api/meta/creative?userId=${user.id}&creativeId=${creativeId}`)
      const data = await res.json()
      if (data.creative) {
        setCreativesData(prev => ({ ...prev, [creativeId]: data.creative }))
      }
    } catch (err) {
      console.error('Failed to load creative:', err)
    } finally {
      setLoadingCreatives(prev => {
        const next = new Set(prev)
        next.delete(creativeId)
        return next
      })
    }
  }

  // Upgrade prompt for non-Pro users
  if (!canLaunch) {
    return (
      <div className="min-h-screen bg-bg-dark text-white pl-60">
        <div className="p-8">
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Launch Campaigns</h1>
            <p className="text-zinc-400 mb-8">
              Create Andromeda-compliant campaigns in 60 seconds.
              We handle the structure, you bring the creative.
            </p>
            <div className="bg-bg-card border border-border rounded-xl p-6 mb-8">
              <p className="text-sm text-zinc-500 mb-4">
                Campaign creation is available on Pro and Agency plans.
              </p>
              <button
                onClick={() => router.push('/pricing')}
                className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show wizard
  if (showWizard && currentAccountId) {
    return (
      <div className="min-h-screen bg-bg-dark text-white pl-60">
        <div className="p-8">
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={handleWizardComplete}
            onCancel={() => setShowWizard(false)}
          />
        </div>
      </div>
    )
  }

  // Loading state
  if (loading && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-bg-dark text-white pl-60">
        <div className="p-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        </div>
      </div>
    )
  }

  // No account selected
  if (!currentAccountId && !loading) {
    return (
      <div className="min-h-screen bg-bg-dark text-white pl-60">
        <div className="p-8">
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-8 h-8 text-zinc-500" />
            </div>
            <h1 className="text-2xl font-bold mb-4">No Ad Account Selected</h1>
            <p className="text-zinc-400 mb-6">
              Select an ad account from the sidebar to view and create campaigns.
            </p>
            <button
              onClick={() => router.push('/dashboard/connect')}
              className="text-accent hover:underline"
            >
              Connect an account →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main view
  return (
    <div className="min-h-screen bg-bg-dark text-white pl-60">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Rocket className="w-7 h-7 text-accent" />
              Launch
            </h1>
            <p className="text-zinc-500 mt-1">
              Manage and create campaigns
            </p>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Launch New Campaign
          </button>
        </div>

        {/* Empty state */}
        {campaigns.length === 0 && !loading && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-accent/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Rocket className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-2xl font-bold mb-4">No Campaigns Yet</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">
              Launch your first Andromeda-compliant campaign in 60 seconds.
            </p>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Launch Campaign
            </button>
          </div>
        )}

        {/* Campaigns List */}
        {campaigns.length > 0 && (
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
              </div>
            )}
            {campaigns.map((campaign) => {
              const isExpanded = expandedCampaigns.has(campaign.id)
              const campaignAdSets = adSetsData[campaign.id] || []
              const isLoadingAdSets = loadingAdSets.has(campaign.id)

              return (
                <div key={campaign.id} className="bg-bg-card border border-border rounded-xl overflow-hidden">
                  {/* Campaign Row */}
                  <div
                    className={cn(
                      "p-4 cursor-pointer hover:bg-bg-hover/50 transition-colors",
                      isExpanded && "border-b border-border"
                    )}
                    onClick={() => toggleCampaign(campaign.id)}
                  >
                    <div className="flex items-center gap-3">
                      <button className="p-1 hover:bg-bg-hover rounded transition-colors">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="px-1.5 py-0.5 bg-hierarchy-campaign/20 text-hierarchy-campaign text-xs font-medium rounded">
                            Campaign
                          </span>
                          <h3 className="font-semibold truncate">{campaign.name}</h3>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium uppercase flex-shrink-0",
                            campaign.status === 'ACTIVE'
                              ? "bg-verdict-scale/20 text-verdict-scale"
                              : "bg-zinc-700 text-zinc-400"
                          )}>
                            {campaign.status}
                          </span>
                          {campaign.isKillScaleCreated && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent flex-shrink-0">
                              <Sparkles className="w-3 h-3" />
                              KillScale
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-zinc-500 mt-1 ml-[74px]">
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                            getBudgetType(campaign) === 'CBO'
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          )}>
                            {getBudgetType(campaign)}
                          </span>
                          {campaign.objective && (
                            <span>{formatObjective(campaign.objective)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleStatusToggle(campaign)}
                          disabled={updatingStatus === campaign.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                            campaign.status === 'PAUSED'
                              ? "bg-verdict-scale/20 text-verdict-scale hover:bg-verdict-scale/30"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          )}
                        >
                          {updatingStatus === campaign.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : campaign.status === 'PAUSED' ? (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              Activate
                            </>
                          ) : (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              Pause
                            </>
                          )}
                        </button>
                        <a
                          href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${currentAccountId?.replace('act_', '')}&selected_campaign_ids=${campaign.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-zinc-500 hover:text-white hover:bg-bg-hover rounded-lg transition-colors"
                          title="View in Ads Manager"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Ad Sets (expanded) */}
                  {isExpanded && (
                    <div className="bg-bg-dark/50">
                      {isLoadingAdSets ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-accent" />
                        </div>
                      ) : campaignAdSets.length === 0 ? (
                        <div className="py-6 text-center text-zinc-500 text-sm">
                          No ad sets found
                        </div>
                      ) : (
                        campaignAdSets.map((adSet) => {
                          const isAdSetExpanded = expandedAdSets.has(adSet.id)
                          const adSetAds = adsData[adSet.id] || []
                          const isLoadingAdSetAds = loadingAds.has(adSet.id)

                          return (
                            <div key={adSet.id} className="border-t border-border/50">
                              {/* Ad Set Row */}
                              <div
                                className="pl-10 pr-4 py-3 cursor-pointer hover:bg-bg-hover/30 transition-colors"
                                onClick={() => toggleAdSet(adSet.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <button className="p-1 hover:bg-bg-hover rounded transition-colors">
                                    {isAdSetExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3">
                                      <span className="px-1.5 py-0.5 bg-hierarchy-adset/20 text-hierarchy-adset text-xs font-medium rounded">
                                        Ad Set
                                      </span>
                                      <span className="font-medium truncate">{adSet.name}</span>
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-xs font-medium uppercase flex-shrink-0",
                                        adSet.status === 'ACTIVE'
                                          ? "bg-verdict-scale/20 text-verdict-scale"
                                          : "bg-zinc-700 text-zinc-400"
                                      )}>
                                        {adSet.status}
                                      </span>
                                    </div>
                                    {(adSet.dailyBudget || adSet.lifetimeBudget) && (
                                      <div className="flex items-center gap-3 text-sm text-zinc-500 mt-0.5 ml-[60px]">
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                          ABO
                                        </span>
                                        <span>
                                          {adSet.dailyBudget ? `$${adSet.dailyBudget}/day` : `$${adSet.lifetimeBudget} lifetime`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Ads (expanded) */}
                              {isAdSetExpanded && (
                                <div className="bg-bg-dark/30">
                                  {isLoadingAdSetAds ? (
                                    <div className="flex items-center justify-center py-4">
                                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                                    </div>
                                  ) : adSetAds.length === 0 ? (
                                    <div className="py-4 text-center text-zinc-500 text-sm">
                                      No ads found
                                    </div>
                                  ) : (
                                    adSetAds.map((ad) => {
                                      const creative = ad.creative?.id ? creativesData[ad.creative.id] : null
                                      const isLoadingCreative = ad.creative?.id ? loadingCreatives.has(ad.creative.id) : false
                                      const previewUrl = creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl || ad.creative?.thumbnailUrl || ad.creative?.imageUrl

                                      return (
                                        <div key={ad.id} className="pl-20 pr-4 py-3 border-t border-border/30 hover:bg-bg-hover/20 transition-colors">
                                          <div className="flex items-center gap-3">
                                            {/* Creative Preview */}
                                            <div className="w-12 h-12 rounded-lg bg-bg-hover flex-shrink-0 overflow-hidden">
                                              {isLoadingCreative ? (
                                                <div className="w-full h-full flex items-center justify-center">
                                                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                                                </div>
                                              ) : previewUrl ? (
                                                <img
                                                  src={previewUrl}
                                                  alt={ad.name}
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                  {creative?.mediaType === 'video' ? (
                                                    <Video className="w-5 h-5 text-zinc-600" />
                                                  ) : (
                                                    <ImageIcon className="w-5 h-5 text-zinc-600" />
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-3">
                                                <span className="px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-xs font-medium rounded">
                                                  Ad
                                                </span>
                                                <span className="font-medium truncate">{ad.name}</span>
                                                <span className={cn(
                                                  "px-2 py-0.5 rounded text-xs font-medium uppercase flex-shrink-0",
                                                  ad.status === 'ACTIVE'
                                                    ? "bg-verdict-scale/20 text-verdict-scale"
                                                    : "bg-zinc-700 text-zinc-400"
                                                )}>
                                                  {ad.status}
                                                </span>
                                                {creative?.mediaType && creative.mediaType !== 'unknown' && (
                                                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                                                    {creative.mediaType === 'video' ? (
                                                      <Video className="w-3 h-3" />
                                                    ) : (
                                                      <ImageIcon className="w-3 h-3" />
                                                    )}
                                                    {creative.mediaType}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
