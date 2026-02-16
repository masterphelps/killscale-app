'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Lightbulb, Eye, BookOpen, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { HealthScoreCard } from '@/components/health-score-card'
import { AndromedaPreview } from '@/components/andromeda-preview'
import { AndromedaAuditModal } from '@/components/andromeda-audit-modal'
import { ActionCards, ActionCardItem } from '@/components/action-cards'
import { AIHealthRecommendations } from '@/components/ai-health-recommendations'
import { StatusChangeModal } from '@/components/confirm-modal'
import { BudgetEditModal } from '@/components/budget-edit-modal'
import { HealthScoreResult } from '@/lib/health-score'
import { calculateAndromedaScore, CampaignData, BudgetChangeRecord, AndromedaScoreResult } from '@/lib/andromeda-score'
import { Rules, calculateVerdict } from '@/lib/supabase'
import { useSubscription } from '@/lib/subscription'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { AccountFilterPills } from '@/components/account-filter-pills'
import { usePrivacyMode } from '@/lib/privacy-mode'
import { useAttribution } from '@/lib/attribution'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase-browser'

const DEFAULT_RULES: Rules = {
  id: '',
  user_id: '',
  scale_roas: 3.0,
  min_roas: 1.5,
  learning_spend: 100,
  scale_percentage: 20,
  target_cpr: null,
  max_cpr: null,
  created_at: '',
  updated_at: ''
}

// Fixed 30-day window for insights analysis
const INSIGHTS_DAYS = 30

// Extended hierarchy item for action center
type HierarchyItem = {
  name: string
  level: 'campaign' | 'adset' | 'ad'
  campaignId?: string
  adsetId?: string
  adId?: string
  spend: number
  revenue: number
  purchases: number
  roas: number
  dailyBudget?: number
  lifetimeBudget?: number
  budgetType?: 'CBO' | 'ABO' | null
  status?: string | null
  children?: HierarchyItem[]
}

// Action item type for Watch/Learn sections
type ActionItem = {
  id: string
  name: string
  entityType: 'campaign' | 'adset'
  entityId: string
  parentName?: string
  spend: number
  roas: number
  dailyBudget?: number
  budgetType: 'CBO' | 'ABO'
  daysInState: number
}

export default function InsightsPage() {
  // Health Score state
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(null)

  // Data state
  const [data, setData] = useState<any[]>([])
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [budgetChanges, setBudgetChanges] = useState<BudgetChangeRecord[]>([])

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAuditModal, setShowAuditModal] = useState(false)
  const [watchExpanded, setWatchExpanded] = useState(false)
  const [learnExpanded, setLearnExpanded] = useState(false)

  // Modal state
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean
    entityId: string
    entityType: 'campaign' | 'adset' | 'ad'
    entityName: string
    action: 'pause' | 'resume'
  } | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [budgetModal, setBudgetModal] = useState<{
    isOpen: boolean
    entityType: 'campaign' | 'adset'
    entityId: string
    entityName: string
    currentBudget: number
    budgetType: 'daily' | 'lifetime'
  } | null>(null)
  const [isUpdatingBudget, setIsUpdatingBudget] = useState(false)

  const router = useRouter()
  const { plan } = useSubscription()
  const { user } = useAuth()
  const { currentAccountId, currentAccount, accounts, workspaceAccountIds, filterAccountId, setFilterAccount } = useAccount()
  const { isPrivacyMode, maskText } = usePrivacyMode()
  const { isKillScaleActive, attributionData, refreshAttribution } = useAttribution()

  // Privacy mode helper for entity names
  const maskEntityName = (name: string, entityType: 'campaign' | 'adset', index: number): string => {
    if (!isPrivacyMode) return name
    return entityType === 'campaign' ? `Campaign ${index + 1}` : `Ad Set ${index + 1}`
  }

  // Mark as mounted
  useEffect(() => {
    setHasMounted(true)
  }, [])

  // Load data when account changes (after mount)
  useEffect(() => {
    if (user && currentAccountId && hasMounted) {
      loadAllData()
    }
  }, [user?.id, currentAccountId, hasMounted])

  // Refresh KillScale attribution on mount
  useEffect(() => {
    if (!isKillScaleActive || !hasMounted) return

    const dateRange = getDateRange()
    refreshAttribution(dateRange.start, dateRange.end)
  }, [isKillScaleActive, hasMounted])

  // Use currentAccountId from AccountContext as the single source of truth
  const selectedAccountId = currentAccountId
  const selectedAccountName = currentAccount?.name

  // Fixed 30-day date range for insights
  const getDateRange = () => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (INSIGHTS_DAYS - 1))
    startDate.setHours(0, 0, 0, 0)

    return {
      start: startDate.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    }
  }

  // Fixed date range in days
  const dateRangeDays = INSIGHTS_DAYS

  // Load all data (health score, ad data, rules, budget changes)
  const loadAllData = async () => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      const dateRange = getDateRange()

      // Load health score
      const healthResponse = await fetch('/api/health-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: selectedAccountId || null,
          dateStart: dateRange.start,
          dateEnd: dateRange.end
        })
      })

      if (healthResponse.ok) {
        const healthData = await healthResponse.json()
        setHealthScore(healthData)
      } else if (healthResponse.status === 404) {
        setError('No ad data found. Sync your Meta account to get started.')
        setHealthScore(null)
      }

      // Load ad data (filtered to 30-day window + account)
      let adQuery = supabase
        .from('ad_data')
        .select('*')
        .eq('user_id', user.id)
        .gte('date_start', dateRange.start)
        .lte('date_start', dateRange.end)
        .order('date_start', { ascending: false })

      if (selectedAccountId) {
        adQuery = adQuery.eq('ad_account_id', selectedAccountId)
      }

      const { data: adData, error: adError } = await adQuery

      if (adData && !adError) {
        // Transform data to use result_value for revenue when available
        const transformedData = adData.map(row => ({
          ...row,
          // Use result_value (calculated from event_values for lead-gen) if available
          revenue: parseFloat(row.result_value) || parseFloat(row.revenue) || 0,
          spend: parseFloat(row.spend) || 0,
        }))
        setData(transformedData)
      }

      // Load rules
      let rulesQuery = supabase
        .from('rules')
        .select('*')
        .eq('user_id', user.id)

      if (selectedAccountId) {
        rulesQuery = rulesQuery.eq('ad_account_id', selectedAccountId)
      } else {
        rulesQuery = rulesQuery.is('ad_account_id', null)
      }

      const { data: rulesData } = await rulesQuery.single()
      if (rulesData) {
        setRules({
          id: rulesData.id,
          user_id: rulesData.user_id,
          scale_roas: parseFloat(rulesData.scale_roas) || DEFAULT_RULES.scale_roas,
          min_roas: parseFloat(rulesData.min_roas) || DEFAULT_RULES.min_roas,
          learning_spend: parseFloat(rulesData.learning_spend) || DEFAULT_RULES.learning_spend,
          scale_percentage: parseFloat(rulesData.scale_percentage) || DEFAULT_RULES.scale_percentage,
          target_cpr: rulesData.target_cpr ?? null,
          max_cpr: rulesData.max_cpr ?? null,
          created_at: rulesData.created_at,
          updated_at: rulesData.updated_at
        })
      }

      // Load budget changes
      if (selectedAccountId) {
        const { data: changes } = await supabase
          .from('budget_changes')
          .select('*')
          .eq('user_id', user.id)
          .eq('ad_account_id', selectedAccountId)
          .gte('changed_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        if (changes) {
          setBudgetChanges(changes as BudgetChangeRecord[])
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError('Failed to load insights')
    } finally {
      setIsLoading(false)
    }
  }

  // Apply KillScale attribution to data when active
  const dataWithAttribution = useMemo(() => {
    if (!isKillScaleActive) return data

    // When KillScale is active, replace revenue/purchases with KillScale data
    // NO META FALLBACK - if no KillScale data for an ad, show 0
    return data.map(row => {
      const adAttribution = row.ad_id ? attributionData[row.ad_id] : null
      const newRevenue = adAttribution?.revenue ?? 0
      const newPurchases = adAttribution?.conversions ?? 0

      return {
        ...row,
        revenue: newRevenue,
        purchases: newPurchases,
      }
    })
  }, [data, isKillScaleActive, attributionData])

  // Build hierarchy from data (filtered by date range)
  // Note: We include ALL campaigns (active + paused) for historical analysis
  const hierarchy = useMemo<HierarchyItem[]>(() => {
    if (dataWithAttribution.length === 0) return []

    const dateRange = getDateRange()
    const filteredData = dataWithAttribution.filter(row => {
      // Filter by workspace accounts or individual account
      if (workspaceAccountIds.length > 0) {
        if (!workspaceAccountIds.includes(row.ad_account_id || '')) return false
      } else if (selectedAccountId && row.ad_account_id && row.ad_account_id !== selectedAccountId) {
        return false
      }
      // Filter by date only - include all statuses for historical analysis
      if (row.date_start && (row.date_start < dateRange.start || row.date_start > dateRange.end)) {
        return false
      }
      return true
    })

    if (filteredData.length === 0) return []

    const campaignMap = new Map<string, HierarchyItem>()
    // Track unique ads per adset for creative count - use ALL data, not just filtered
    // Only count ACTIVE ads (not paused/archived) for Andromeda score
    const adsetAdsMap = new Map<string, Set<string>>()
    dataWithAttribution.forEach(row => {
      if (row.ad_id && row.adset_name && row.campaign_name) {
        // Only count active ads in active adsets in active campaigns
        // Note: ad status is in 'status' field, not 'ad_status'
        const isActive = row.status === 'ACTIVE' &&
                        row.adset_status === 'ACTIVE' &&
                        row.campaign_status === 'ACTIVE'
        if (isActive) {
          const key = `${row.campaign_name}::${row.adset_name}`
          if (!adsetAdsMap.has(key)) {
            adsetAdsMap.set(key, new Set())
          }
          adsetAdsMap.get(key)!.add(row.ad_id)
        }
      }
    })

    filteredData.forEach(row => {
      let campaign = campaignMap.get(row.campaign_name)
      if (!campaign) {
        campaign = {
          name: row.campaign_name,
          level: 'campaign',
          campaignId: row.campaign_id || undefined,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.campaign_status,
          budgetType: row.campaign_daily_budget || row.campaign_lifetime_budget ? 'CBO' : null,
          dailyBudget: row.campaign_daily_budget || undefined,
          lifetimeBudget: row.campaign_lifetime_budget || undefined,
          children: []
        }
        campaignMap.set(row.campaign_name, campaign)
      }

      campaign.spend += row.spend
      campaign.revenue += row.revenue
      campaign.purchases += row.purchases || 0

      let adset = campaign.children?.find(a => a.name === row.adset_name)
      if (!adset) {
        adset = {
          name: row.adset_name,
          level: 'adset',
          adsetId: row.adset_id || undefined,
          spend: 0,
          revenue: 0,
          purchases: 0,
          roas: 0,
          status: row.adset_status,
          budgetType: row.adset_daily_budget || row.adset_lifetime_budget ? 'ABO' : null,
          dailyBudget: row.adset_daily_budget || undefined,
          lifetimeBudget: row.adset_lifetime_budget || undefined,
          children: []
        }
        campaign.children?.push(adset)
      }

      adset.spend += row.spend
      adset.revenue += row.revenue
      adset.purchases += row.purchases || 0
    })

    // Calculate ROAS and attach ad counts
    campaignMap.forEach(campaign => {
      campaign.roas = campaign.spend > 0 ? campaign.revenue / campaign.spend : 0
      campaign.children?.forEach(adset => {
        adset.roas = adset.spend > 0 ? adset.revenue / adset.spend : 0
        // Get unique ad count for this adset
        const key = `${campaign.name}::${adset.name}`
        const adCount = adsetAdsMap.get(key)?.size || 0
        // Store ad count as placeholder children
        adset.children = Array(adCount).fill({ name: '', level: 'ad' as const, spend: 0, revenue: 0, purchases: 0, roas: 0 })
      })
    })

    return Array.from(campaignMap.values())
  }, [dataWithAttribution, workspaceAccountIds, selectedAccountId])

  // Build action items from hierarchy
  const actionItems = useMemo(() => {
    const items: { kill: ActionCardItem[]; scale: ActionCardItem[]; watch: ActionItem[]; learn: ActionItem[] } = {
      kill: [],
      scale: [],
      watch: [],
      learn: []
    }

    hierarchy.forEach(campaign => {
      // For CBO campaigns, verdict is at campaign level
      if (campaign.budgetType === 'CBO') {
        const verdict = calculateVerdict(campaign.spend, campaign.roas, rules)
        const item = {
          id: `campaign-${campaign.campaignId}`,
          name: campaign.name,
          entityType: 'campaign' as const,
          entityId: campaign.campaignId || '',
          spend: campaign.spend,
          roas: campaign.roas,
          dailyBudget: campaign.dailyBudget,
          budgetType: 'CBO' as const,
          daysInState: 7
        }

        if (verdict === 'kill' || verdict === 'scale') {
          items[verdict].push(item)
        } else {
          items[verdict].push(item as ActionItem)
        }
      }

      // For ABO, verdict is at adset level
      campaign.children?.forEach(adset => {
        if (adset.budgetType === 'ABO' || (!campaign.budgetType && adset.dailyBudget)) {
          const verdict = calculateVerdict(adset.spend, adset.roas, rules)
          const item = {
            id: `adset-${adset.adsetId}`,
            name: adset.name,
            entityType: 'adset' as const,
            entityId: adset.adsetId || '',
            parentName: campaign.name,
            spend: adset.spend,
            roas: adset.roas,
            dailyBudget: adset.dailyBudget,
            budgetType: 'ABO' as const,
            daysInState: 7
          }

          if (verdict === 'kill' || verdict === 'scale') {
            items[verdict].push(item)
          } else {
            items[verdict].push(item as ActionItem)
          }
        }
      })
    })

    return items
  }, [hierarchy, rules])

  // Calculate Andromeda Score - only for ACTIVE campaigns/adsets
  const andromedaScore = useMemo<AndromedaScoreResult | null>(() => {
    if (!hierarchy || hierarchy.length === 0) return null

    // Filter to only active campaigns and adsets
    const activeCampaigns = hierarchy.filter(c => c.status === 'ACTIVE')

    const campaigns: CampaignData[] = activeCampaigns.map(campaign => {
      // Filter to only active adsets within each campaign
      const activeAdsets = (campaign.children || []).filter(a => a.status === 'ACTIVE')

      return {
        name: campaign.name,
        id: campaign.campaignId,
        spend: campaign.spend,
        purchases: campaign.purchases,
        budgetType: campaign.budgetType || null,
        adsetCount: activeAdsets.length,
        adsets: activeAdsets.map(adset => ({
          name: adset.name,
          id: adset.adsetId,
          spend: adset.spend,
          purchases: adset.purchases,
          adCount: adset.children?.length || 0
        }))
      }
    })

    return calculateAndromedaScore(campaigns, budgetChanges, dateRangeDays)
  }, [hierarchy, budgetChanges, dateRangeDays])

  // Handle sync
  const handleSync = async () => {
    if (!user || !selectedAccountId || isSyncing) return

    setIsSyncing(true)

    try {
      const response = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: selectedAccountId,
        })
      })

      if (response.ok) {
        await loadAllData()
      }
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  // Handle kill (pause) items
  const handleKillItems = async (items: { entityType: 'campaign' | 'adset' | 'ad'; entityId: string }[]) => {
    if (items.length === 0) return

    const first = items[0]
    let entityName = 'Selected items'

    if (items.length === 1) {
      hierarchy.forEach(campaign => {
        if (first.entityType === 'campaign' && campaign.campaignId === first.entityId) {
          entityName = campaign.name
        }
        campaign.children?.forEach(adset => {
          if (first.entityType === 'adset' && adset.adsetId === first.entityId) {
            entityName = adset.name
          }
        })
      })
    } else {
      entityName = `${items.length} items`
    }

    setStatusChangeModal({
      isOpen: true,
      entityId: first.entityId,
      entityType: first.entityType,
      entityName,
      action: 'pause'
    })
  }

  // Handle scale items
  const handleScaleItems = async (items: { entityType: 'campaign' | 'adset'; entityId: string; newBudget: number }[]) => {
    if (items.length === 0) return

    const first = items[0]
    let entityName = ''
    let currentBudget = 0
    let budgetType: 'daily' | 'lifetime' = 'daily'

    hierarchy.forEach(campaign => {
      if (first.entityType === 'campaign' && campaign.campaignId === first.entityId) {
        entityName = campaign.name
        currentBudget = campaign.dailyBudget || campaign.lifetimeBudget || 0
        budgetType = campaign.dailyBudget ? 'daily' : 'lifetime'
      }
      campaign.children?.forEach(adset => {
        if (first.entityType === 'adset' && adset.adsetId === first.entityId) {
          entityName = adset.name
          currentBudget = adset.dailyBudget || adset.lifetimeBudget || 0
          budgetType = adset.dailyBudget ? 'daily' : 'lifetime'
        }
      })
    })

    setBudgetModal({
      isOpen: true,
      entityType: first.entityType,
      entityId: first.entityId,
      entityName,
      currentBudget,
      budgetType
    })
  }

  // Handle Kill action from AI recommendations
  const handleAIKill = async (entityType: 'campaign' | 'adset', entityId: string) => {
    if (!user) return

    const response = await fetch('/api/meta/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        entityId,
        entityType,
        status: 'PAUSED'
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to pause')
    }

    await loadAllData()
  }

  // Handle Scale action from AI recommendations
  const handleAIScale = async (entityType: 'campaign' | 'adset', entityId: string, newBudget: number) => {
    if (!user) return

    const response = await fetch('/api/meta/update-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        entityId,
        entityType,
        newBudget
      })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to scale budget')
    }

    await loadAllData()
  }

  // Confirm status change
  const handleConfirmStatusChange = async () => {
    if (!statusChangeModal || !user) return

    setIsUpdatingStatus(true)

    try {
      const response = await fetch('/api/meta/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: statusChangeModal.entityId,
          entityType: statusChangeModal.entityType,
          status: statusChangeModal.action === 'pause' ? 'PAUSED' : 'ACTIVE'
        })
      })

      if (response.ok) {
        await loadAllData()
      }
    } catch (error) {
      console.error('Status update failed:', error)
    } finally {
      setIsUpdatingStatus(false)
      setStatusChangeModal(null)
    }
  }

  // Handle budget change
  const handleBudgetChange = async (newBudget: number, budgetType: 'daily' | 'lifetime') => {
    if (!budgetModal || !user || !selectedAccountId) return

    setIsUpdatingBudget(true)

    try {
      const response = await fetch('/api/meta/update-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: budgetModal.entityId,
          entityType: budgetModal.entityType,
          budget: newBudget,
          budgetType,
          oldBudget: budgetModal.currentBudget,
          adAccountId: selectedAccountId
        })
      })

      if (response.ok) {
        await loadAllData()
      }
    } catch (error) {
      console.error('Budget update failed:', error)
    } finally {
      setIsUpdatingBudget(false)
      setBudgetModal(null)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Calculate spend to go for learning items
  const learnSpendToGo = useMemo(() => {
    return actionItems.learn.reduce((sum, item) => {
      const remaining = Math.max(0, (rules.learning_spend || 100) - item.spend)
      return sum + remaining
    }, 0)
  }, [actionItems.learn, rules.learning_spend])

  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Insights</h1>
              <p className="text-sm text-zinc-400">
                {selectedAccountName ? `${maskText(selectedAccountName, 'Demo Account')} • ` : ''}
                Health analysis & recommended actions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Account filter pills */}
            <AccountFilterPills
              accounts={accounts}
              workspaceAccountIds={workspaceAccountIds}
              filterAccountId={filterAccountId}
              onFilterChange={setFilterAccount}
            />

            {/* Fixed date range label */}
            <span className="text-sm text-zinc-500 bg-bg-card px-3 py-1.5 rounded-lg border border-border">
              Last {INSIGHTS_DAYS} Days
            </span>

            {/* Sync Button */}
            {selectedAccountId && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-bg-card border border-border rounded-xl p-8 text-center mb-6">
            <Lightbulb className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Data Available</h3>
            <p className="text-sm text-zinc-400 mb-4">{error}</p>
            {selectedAccountId && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Main Content */}
        {!error && (
          <div className="space-y-6">
            {/* Scores Row: Stack on mobile, side-by-side on desktop */}
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-stretch">
              <div className="w-full lg:w-72 lg:flex-shrink-0">
                <HealthScoreCard score={healthScore} isLoading={isLoading} />
              </div>
              <div className="flex-1 [&>div]:h-full [&>div]:mb-0">
                <AndromedaPreview
                  score={andromedaScore}
                  isLoading={isLoading}
                  onViewAudit={() => setShowAuditModal(true)}
                />
              </div>
            </div>

            {/* Kill / Scale Cards */}
            <ActionCards
              killItems={actionItems.kill}
              scaleItems={actionItems.scale}
              scalePercentage={rules.scale_percentage || 20}
              onKill={(ids) => handleKillItems(ids.map(id => {
                const [entityType, entityId] = id.split('-') as ['campaign' | 'adset' | 'ad', string]
                return { entityType, entityId }
              }))}
              onScale={(ids) => handleScaleItems(ids.map(id => {
                const [entityType, entityId] = id.split('-') as ['campaign' | 'adset', string]
                const actionItem = actionItems.scale.find(i => i.id === id)
                const currentBudget = actionItem?.dailyBudget || 0
                const newBudget = Math.round(currentBudget * (1 + (rules.scale_percentage || 20) / 100) * 100) / 100
                return { entityType, entityId, newBudget }
              }))}
              isLoading={isLoading}
            />

            {/* Watch & Learn - Collapsed Sections */}
            <div className="space-y-3">
              {/* Watch Section */}
              <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setWatchExpanded(!watchExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-verdict-watch/20 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-verdict-watch" />
                    </div>
                    <div className="text-left">
                      <span className="font-medium text-white">Watch List</span>
                      <span className="text-zinc-500 ml-2">({actionItems.watch.length})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500">Hovering near thresholds</span>
                    {watchExpanded ? (
                      <ChevronUp className="w-5 h-5 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                </button>

                {watchExpanded && actionItems.watch.length > 0 && (
                  <div className="border-t border-border p-4">
                    <div className="space-y-2">
                      {actionItems.watch.map((item, index) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 bg-bg-dark/50 rounded-lg"
                        >
                          <div>
                            <div className="font-medium text-white">{maskEntityName(item.name, item.entityType, index)}</div>
                            {item.parentName && (
                              <div className="text-xs text-zinc-500">{isPrivacyMode ? 'Campaign' : item.parentName}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono text-verdict-watch">{(item.roas || 0).toFixed(2)}x ROAS</div>
                            <div className="text-xs text-zinc-500">{formatCurrency(item.spend)} spend</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {watchExpanded && actionItems.watch.length === 0 && (
                  <div className="border-t border-border p-4 text-center text-zinc-500 text-sm">
                    No budgets currently in watch state
                  </div>
                )}
              </div>

              {/* Learning Section */}
              <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setLearnExpanded(!learnExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-verdict-learn/20 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-verdict-learn" />
                    </div>
                    <div className="text-left">
                      <span className="font-medium text-white">Learning</span>
                      <span className="text-zinc-500 ml-2">({actionItems.learn.length})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500">
                      {learnSpendToGo > 0 ? `${formatCurrency(learnSpendToGo)} until verdicts` : 'Gathering data'}
                    </span>
                    {learnExpanded ? (
                      <ChevronUp className="w-5 h-5 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                </button>

                {learnExpanded && actionItems.learn.length > 0 && (
                  <div className="border-t border-border p-4">
                    <div className="space-y-2">
                      {actionItems.learn.map((item, index) => {
                        const spendToGo = Math.max(0, (rules.learning_spend || 100) - item.spend)
                        const progress = Math.min(100, (item.spend / (rules.learning_spend || 100)) * 100)
                        return (
                          <div
                            key={item.id}
                            className="p-3 bg-bg-dark/50 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <div className="font-medium text-white">{maskEntityName(item.name, item.entityType, index)}</div>
                                {item.parentName && (
                                  <div className="text-xs text-zinc-500">{isPrivacyMode ? 'Campaign' : item.parentName}</div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-zinc-500">
                                  {formatCurrency(spendToGo)} to go
                                </div>
                              </div>
                            </div>
                            <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
                              <div
                                className="h-full bg-verdict-learn rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {learnExpanded && actionItems.learn.length === 0 && (
                  <div className="border-t border-border p-4 text-center text-zinc-500 text-sm">
                    No budgets currently in learning phase
                  </div>
                )}
              </div>
            </div>

            {/* AI Recommendations */}
            <AIHealthRecommendations
              userId={user?.id || ''}
              healthScore={healthScore}
              isLoading={isLoading}
              scalePercentage={rules.scale_percentage || 20}
              onKill={handleAIKill}
              onScale={handleAIScale}
            />

            {/* Link to Full Table */}
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              View Full Performance Table
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Modals */}
      {andromedaScore && (
        <AndromedaAuditModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          score={andromedaScore}
        />
      )}

      {statusChangeModal && (
        <StatusChangeModal
          isOpen={statusChangeModal.isOpen}
          onClose={() => setStatusChangeModal(null)}
          onConfirm={handleConfirmStatusChange}
          entityName={statusChangeModal.entityName}
          entityType={statusChangeModal.entityType}
          action={statusChangeModal.action}
          isLoading={isUpdatingStatus}
        />
      )}

      {budgetModal && (
        <BudgetEditModal
          isOpen={budgetModal.isOpen}
          onClose={() => setBudgetModal(null)}
          onSave={handleBudgetChange}
          entityName={budgetModal.entityName}
          entityType={budgetModal.entityType}
          entityId={budgetModal.entityId}
          currentBudgetType={budgetModal.budgetType}
          currentBudget={budgetModal.currentBudget}
          scalePercentage={rules.scale_percentage}
          userId={user?.id}
        />
      )}
    </div>
  )
}
