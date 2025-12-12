'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, Plus, Play, Pause, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
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
  daily_budget?: string
  lifetime_budget?: string
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

export default function LaunchPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { plan } = useSubscription()
  const [campaigns, setCampaigns] = useState<CombinedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [currentAdAccountId, setCurrentAdAccountId] = useState<string | null>(null)

  const planLower = plan?.toLowerCase() || ''
  const canLaunch = planLower === 'pro' || planLower === 'agency'

  // Get current ad account from ad_data (same as sidebar does)
  useEffect(() => {
    if (user && canLaunch) {
      loadCurrentAccount()
    } else {
      setLoading(false)
    }
  }, [user, canLaunch])

  // Load campaigns when account is determined
  useEffect(() => {
    if (currentAdAccountId && user) {
      loadCampaigns()
    }
  }, [currentAdAccountId, user])

  const loadCurrentAccount = async () => {
    if (!user) return

    try {
      // Check what account's data is currently loaded (same logic as sidebar)
      const { data: adData } = await supabase
        .from('ad_data')
        .select('ad_account_id')
        .eq('user_id', user.id)
        .eq('source', 'meta_api')
        .limit(1)
        .single()

      if (adData?.ad_account_id) {
        setCurrentAdAccountId(adData.ad_account_id)
      } else {
        // Fallback to selected_account_id from meta_connections
        const { data: connection } = await supabase
          .from('meta_connections')
          .select('selected_account_id')
          .eq('user_id', user.id)
          .single()

        if (connection?.selected_account_id) {
          setCurrentAdAccountId(connection.selected_account_id)
        } else {
          setLoading(false)
        }
      }
    } catch (err) {
      console.error('Failed to load current account:', err)
      setLoading(false)
    }
  }

  const loadCampaigns = async () => {
    if (!user || !currentAdAccountId) return

    setLoading(true)
    try {
      // Fetch all campaigns from Meta API
      const metaRes = await fetch(`/api/meta/campaigns?userId=${user.id}&adAccountId=${currentAdAccountId}`)
      const metaData = await metaRes.json()
      const metaCampaigns: MetaCampaign[] = metaData.campaigns || []

      // Fetch KillScale-created campaigns
      const { data: ksData } = await supabase
        .from('campaign_creations')
        .select('campaign_id, budget_type, daily_budget, created_at, ad_ids')
        .eq('user_id', user.id)
        .eq('ad_account_id', currentAdAccountId)

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

  const formatBudget = (campaign: CombinedCampaign) => {
    if (campaign.killScaleData) {
      return `$${campaign.killScaleData.daily_budget}/day`
    }
    if (campaign.daily_budget) {
      return `$${(parseInt(campaign.daily_budget) / 100).toFixed(0)}/day`
    }
    if (campaign.lifetime_budget) {
      return `$${(parseInt(campaign.lifetime_budget) / 100).toFixed(0)} lifetime`
    }
    return 'No budget set'
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
  if (showWizard && currentAdAccountId) {
    return (
      <div className="min-h-screen bg-bg-dark text-white pl-60">
        <div className="p-8">
          <LaunchWizard
            adAccountId={currentAdAccountId}
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
  if (!currentAdAccountId && !loading) {
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
          <div className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
              </div>
            )}
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-bg-card border border-border rounded-xl p-5 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{campaign.name}</h3>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium uppercase",
                        campaign.status === 'ACTIVE'
                          ? "bg-verdict-scale/20 text-verdict-scale"
                          : "bg-zinc-700 text-zinc-400"
                      )}>
                        {campaign.status}
                      </span>
                      {campaign.isKillScaleCreated && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
                          <Sparkles className="w-3 h-3" />
                          KillScale
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      {campaign.killScaleData && (
                        <>
                          <span className="uppercase">{campaign.killScaleData.budget_type}</span>
                          <span>•</span>
                          <span>{campaign.killScaleData.ad_ids?.length || 0} ads</span>
                          <span>•</span>
                        </>
                      )}
                      <span>{formatBudget(campaign)}</span>
                      {campaign.objective && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{campaign.objective.replace('OUTCOME_', '').toLowerCase()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStatusToggle(campaign)}
                      disabled={updatingStatus === campaign.id}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        campaign.status === 'PAUSED'
                          ? "bg-verdict-scale/20 text-verdict-scale hover:bg-verdict-scale/30"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      )}
                    >
                      {updatingStatus === campaign.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : campaign.status === 'PAUSED' ? (
                        <>
                          <Play className="w-4 h-4" />
                          Activate
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4" />
                          Pause
                        </>
                      )}
                    </button>
                    <a
                      href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${currentAdAccountId?.replace('act_', '')}&selected_campaign_ids=${campaign.id}`}
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
