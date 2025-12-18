'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Minus, Plus, Check, ChevronUp, ChevronDown, ChevronRight, Pause, Play, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { VerdictBadge } from './verdict-badge'
import { BudgetEditModal } from './budget-edit-modal'
import { Rules, calculateVerdict, Verdict, isEntityActive } from '@/lib/supabase'
import { usePrivacyMode } from '@/lib/privacy-mode'

// Simple performance indicator for ads (shows arrow based on verdict without text)
const PerformanceArrow = ({ verdict }: { verdict: Verdict }) => {
  if (verdict === 'scale') {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded bg-verdict-scale/20">
        <TrendingUp className="w-3.5 h-3.5 text-verdict-scale" />
      </div>
    )
  }
  if (verdict === 'kill') {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded bg-verdict-kill/20">
        <TrendingDown className="w-3.5 h-3.5 text-verdict-kill" />
      </div>
    )
  }
  if (verdict === 'watch') {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded bg-verdict-watch/20">
        <Minus className="w-3.5 h-3.5 text-verdict-watch" />
      </div>
    )
  }
  // learn - gray neutral
  return (
    <div className="flex items-center justify-center w-6 h-6 rounded bg-zinc-700/30">
      <Minus className="w-3.5 h-3.5 text-zinc-500" />
    </div>
  )
}

type AdRow = {
  campaign_name: string
  campaign_id?: string | null
  adset_name: string
  adset_id?: string | null
  ad_name: string
  ad_id?: string | null
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  // Results-based tracking
  results?: number
  result_value?: number | null
  result_type?: string | null
  status?: string | null  // Ad's effective status
  adset_status?: string | null  // Adset's own status
  campaign_status?: string | null  // Campaign's own status
  // Budget fields from Meta API
  campaign_daily_budget?: number | null
  campaign_lifetime_budget?: number | null
  adset_daily_budget?: number | null
  adset_lifetime_budget?: number | null
}

type VerdictFilter = 'all' | 'scale' | 'watch' | 'kill' | 'learn'

type SortField = 'name' | 'spend' | 'revenue' | 'roas' | 'purchases' | 'results' | 'cpr' | 'cpc' | 'ctr' | 'cpa' | 'convRate' | 'clicks' | 'impressions' | 'verdict'
type SortDirection = 'asc' | 'desc'

// Attribution data type (keyed by ad_id)
type AttributionData = Record<string, {
  conversions: number
  revenue: number
}>

type PerformanceTableProps = {
  data: AdRow[]
  rules: Rules
  dateRange: { start: string; end: string }
  verdictFilter?: VerdictFilter
  includePaused?: boolean
  viewMode?: 'simple' | 'detailed'
  selectedCampaigns?: Set<string>
  onCampaignToggle?: (campaignName: string) => void
  onSelectAll?: () => void
  allSelected?: boolean
  someSelected?: boolean
  onStatusChange?: (entityId: string, entityType: 'campaign' | 'adset' | 'ad', entityName: string, newStatus: 'ACTIVE' | 'PAUSED') => void
  canManageAds?: boolean
  onBudgetChange?: (entityId: string, entityType: 'campaign' | 'adset', newBudget: number, budgetType: 'daily' | 'lifetime', oldBudget?: number) => Promise<void>
  // For deep-linking from alerts
  highlightEntity?: {
    type: 'campaign' | 'adset' | 'ad'
    name: string
    campaignName?: string
    adsetName?: string
  } | null
  // For budget modal
  userId?: string
  // For cascading selection (ABO adsets)
  campaignAboAdsets?: Map<string, Set<string>>
  // Hybrid attribution: last-touch for campaigns/adsets (whole numbers)
  lastTouchAttribution?: AttributionData
  // TRUE when using multi-touch model (linear, time_decay, position_based)
  isMultiTouchModel?: boolean
  // External expand control from parent
  expandAllTrigger?: number
  onExpandedStateChange?: (expanded: boolean) => void
  // External sort control from parent
  externalSortField?: SortField
  externalSortDirection?: SortDirection
}

type BudgetType = 'CBO' | 'ABO' | null

type HierarchyNode = {
  name: string
  id?: string | null  // Meta entity ID for API calls
  type: 'campaign' | 'adset' | 'ad'
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  results: number
  cpr: number  // cost per result
  cpc: number
  ctr: number
  cpa: number
  convRate: number
  status?: string | null  // null for CSV, set for API data
  hasChildrenPaused?: boolean
  verdict: Verdict
  children?: HierarchyNode[]
  // Budget info
  budgetType?: BudgetType  // CBO for campaign-level, ABO for ad set-level
  dailyBudget?: number | null
  lifetimeBudget?: number | null
}

const formatPercent = (value: number) => {
  if (!isFinite(value) || isNaN(value)) return '0.00%'
  return value.toFixed(2) + '%'
}

const formatMetric = (value: number, prefix = '$') => {
  if (!isFinite(value) || isNaN(value)) return '—'
  return prefix + value.toFixed(2)
}

// Format budget display with daily/lifetime indicator
const formatBudget = (dailyBudget: number | null | undefined, lifetimeBudget: number | null | undefined): { value: string; type: string } => {
  if (dailyBudget && dailyBudget > 0) {
    return { value: `$${dailyBudget.toLocaleString()}`, type: '/day' }
  }
  if (lifetimeBudget && lifetimeBudget > 0) {
    return { value: `$${lifetimeBudget.toLocaleString()}`, type: 'lifetime' }
  }
  return { value: '—', type: '' }
}

function calculateMetrics(node: { spend: number; clicks: number; impressions: number; purchases: number; results: number }) {
  return {
    cpc: node.clicks > 0 ? node.spend / node.clicks : 0,
    ctr: node.impressions > 0 ? (node.clicks / node.impressions) * 100 : 0,
    cpa: node.purchases > 0 ? node.spend / node.purchases : 0,
    cpr: node.results > 0 ? node.spend / node.results : 0,
    convRate: node.clicks > 0 ? (node.purchases / node.clicks) * 100 : 0,
  }
}

const verdictOrder: Record<Verdict, number> = {
  'scale': 4,
  'watch': 3,
  'learn': 2,
  'kill': 1,
}

// Type color bars for visual hierarchy
const typeColors = {
  campaign: 'bg-blue-500',
  adset: 'bg-purple-500',
  ad: 'bg-zinc-500'
}

const typeLabels = {
  campaign: 'Campaign',
  adset: 'Ad Set',
  ad: 'Ad'
}

function buildHierarchy(data: AdRow[], rules: Rules): HierarchyNode[] {
  const campaigns: Record<string, HierarchyNode & { _status?: string | null }> = {}
  const adsetStatuses: Record<string, string | null> = {}  // Track adset statuses by name
  const campaignStatuses: Record<string, string | null> = {}  // Track campaign statuses by name
  const campaignIds: Record<string, string | null> = {}  // Track campaign IDs by name
  const adsetIds: Record<string, string | null> = {}  // Track adset IDs by name
  // Track budget info
  const campaignBudgets: Record<string, { daily: number | null; lifetime: number | null }> = {}
  const adsetBudgets: Record<string, { daily: number | null; lifetime: number | null }> = {}

  data.forEach(row => {
    // Capture statuses and IDs from the first row we see for each entity
    if (row.campaign_status && !campaignStatuses[row.campaign_name]) {
      campaignStatuses[row.campaign_name] = row.campaign_status
    }
    if (row.campaign_id && !campaignIds[row.campaign_name]) {
      campaignIds[row.campaign_name] = row.campaign_id
    }
    if (row.adset_status && !adsetStatuses[row.adset_name]) {
      adsetStatuses[row.adset_name] = row.adset_status
    }
    if (row.adset_id && !adsetIds[row.adset_name]) {
      adsetIds[row.adset_name] = row.adset_id
    }
    // Capture budget info from the first row we see for each entity
    if (!campaignBudgets[row.campaign_name]) {
      campaignBudgets[row.campaign_name] = {
        daily: row.campaign_daily_budget ?? null,
        lifetime: row.campaign_lifetime_budget ?? null,
      }
    }
    if (!adsetBudgets[row.adset_name]) {
      adsetBudgets[row.adset_name] = {
        daily: row.adset_daily_budget ?? null,
        lifetime: row.adset_lifetime_budget ?? null,
      }
    }
    
    if (!campaigns[row.campaign_name]) {
      campaigns[row.campaign_name] = {
        name: row.campaign_name,
        id: row.campaign_id,
        type: 'campaign',
        impressions: 0,
        clicks: 0,
        spend: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
        results: 0,
        cpr: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        convRate: 0,
        verdict: 'learn',
        children: []
      }
    }
    const campaign = campaigns[row.campaign_name]
    // Ensure we have the ID even if first row didn't have it
    if (row.campaign_id && !campaign.id) campaign.id = row.campaign_id
    
    let adset = campaign.children?.find(c => c.name === row.adset_name)
    if (!adset) {
      adset = {
        name: row.adset_name,
        id: row.adset_id,
        type: 'adset',
        impressions: 0,
        clicks: 0,
        spend: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
        results: 0,
        cpr: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        convRate: 0,
        verdict: 'learn',
        children: []
      }
      campaign.children?.push(adset)
    }
    // Ensure we have the ID even if first row didn't have it
    if (row.adset_id && !adset.id) adset.id = row.adset_id
    
    // Check if ad already exists - aggregate instead of duplicating
    let ad = adset.children?.find(a => a.name === row.ad_name)
    if (!ad) {
      ad = {
        name: row.ad_name,
        id: row.ad_id,
        type: 'ad',
        impressions: 0,
        clicks: 0,
        spend: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
        results: 0,
        cpr: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        convRate: 0,
        status: row.status,
        verdict: 'learn'
      }
      adset.children?.push(ad)
    }
    // Ensure we have the ID even if first row didn't have it
    if (row.ad_id && !ad.id) ad.id = row.ad_id
    
    // Aggregate ad metrics
    ad.impressions += row.impressions
    ad.clicks += row.clicks
    ad.spend += row.spend
    ad.purchases += row.purchases
    ad.revenue += row.revenue
    ad.results += row.results || 0
    // Keep the status from any row (they should all be the same for a given ad)
    if (row.status) ad.status = row.status

    adset.impressions += row.impressions
    adset.clicks += row.clicks
    adset.spend += row.spend
    adset.purchases += row.purchases
    adset.revenue += row.revenue
    adset.results += row.results || 0
  })
  
  Object.values(campaigns).forEach(campaign => {
    campaign.children?.forEach(adset => {
      // Calculate ad-level metrics after aggregation
      adset.children?.forEach(ad => {
        ad.roas = ad.spend > 0 ? ad.revenue / ad.spend : 0
        const adMetrics = calculateMetrics(ad)
        Object.assign(ad, adMetrics)
        ad.verdict = calculateVerdict(ad.spend, ad.roas, rules)
      })
      
      adset.roas = adset.spend > 0 ? adset.revenue / adset.spend : 0
      const adsetMetrics = calculateMetrics(adset)
      Object.assign(adset, adsetMetrics)
      
      // Use the direct adset_status from Meta API if available
      // This is the adset's OWN status, not derived from children
      const directStatus = adsetStatuses[adset.name]
      if (directStatus) {
        adset.status = directStatus
      } else {
        // Fallback: derive from children for CSV data or missing status
        const childStatuses = adset.children?.map(ad => ad.status).filter(s => s !== undefined && s !== null)
        if (childStatuses && childStatuses.length > 0) {
          const hasActiveAd = childStatuses.some(s => s === 'ACTIVE')
          adset.status = hasActiveAd ? 'ACTIVE' : 'PAUSED'
        }
      }
      
      // Check if any children are paused (only if adset itself is active)
      const adsetIsPaused = adset.status && adset.status !== 'ACTIVE'
      if (!adsetIsPaused && adset.children && adset.children.length > 0) {
        adset.hasChildrenPaused = adset.children.some(ad => ad.status && ad.status !== 'ACTIVE')
      }
      
      adset.verdict = calculateVerdict(adset.spend, adset.roas, rules)

      // Set budget info on adset
      const adsetBudget = adsetBudgets[adset.name]
      const campaignBudget = campaignBudgets[campaign.name]

      // ABO if adset has budget OR if campaign has no budget (budget must be at adset level)
      const isABO = (adsetBudget && (adsetBudget.daily || adsetBudget.lifetime)) ||
                    (campaignBudget && !campaignBudget.daily && !campaignBudget.lifetime)

      if (isABO) {
        adset.budgetType = 'ABO'
        adset.dailyBudget = adsetBudget?.daily ?? null
        adset.lifetimeBudget = adsetBudget?.lifetime ?? null
      }

      campaign.impressions += adset.impressions
      campaign.clicks += adset.clicks
      campaign.spend += adset.spend
      campaign.purchases += adset.purchases
      campaign.revenue += adset.revenue
      campaign.results += adset.results
    })
    
    campaign.roas = campaign.spend > 0 ? campaign.revenue / campaign.spend : 0
    const campaignMetrics = calculateMetrics(campaign)
    Object.assign(campaign, campaignMetrics)
    
    // Use the direct campaign_status from Meta API if available
    const directStatus = campaignStatuses[campaign.name]
    if (directStatus) {
      campaign.status = directStatus
    } else {
      // Fallback: derive from children for CSV data or missing status
      const childStatuses = campaign.children?.map(adset => adset.status).filter(s => s !== undefined && s !== null)
      if (childStatuses && childStatuses.length > 0) {
        const hasActiveAdset = childStatuses.some(s => s === 'ACTIVE')
        campaign.status = hasActiveAdset ? 'ACTIVE' : 'PAUSED'
      }
    }
    
    // Check if any children are paused (only if campaign itself is active)
    const campaignIsPaused = campaign.status && campaign.status !== 'ACTIVE'
    if (!campaignIsPaused && campaign.children && campaign.children.length > 0) {
      campaign.hasChildrenPaused = campaign.children.some(adset => {
        const adsetIsPaused = adset.status && adset.status !== 'ACTIVE'
        return adsetIsPaused || adset.hasChildrenPaused
      })
    }

    campaign.verdict = calculateVerdict(campaign.spend, campaign.roas, rules)

    // Set budget info on campaign
    const campBudget = campaignBudgets[campaign.name]
    if (campBudget && (campBudget.daily || campBudget.lifetime)) {
      campaign.budgetType = 'CBO'
      campaign.dailyBudget = campBudget.daily
      campaign.lifetimeBudget = campBudget.lifetime
    }
  })
  
  return Object.values(campaigns)
}

function sortNodes(nodes: HierarchyNode[], field: SortField, direction: SortDirection): HierarchyNode[] {
  const sorted = [...nodes].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string
    
    if (field === 'name') {
      aVal = a.name.toLowerCase()
      bVal = b.name.toLowerCase()
    } else if (field === 'verdict') {
      aVal = verdictOrder[a.verdict]
      bVal = verdictOrder[b.verdict]
    } else {
      aVal = a[field] as number
      bVal = b[field] as number
    }
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
  
  // Also sort children
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortNodes(node.children, field, direction) : undefined
  }))
}

export function PerformanceTable({
  data,
  rules,
  dateRange,
  verdictFilter = 'all',
  includePaused = true,
  viewMode = 'simple',
  selectedCampaigns,
  onCampaignToggle,
  onSelectAll,
  allSelected = false,
  someSelected = false,
  onStatusChange,
  canManageAds = false,
  onBudgetChange,
  highlightEntity,
  userId,
  campaignAboAdsets,
  lastTouchAttribution,
  isMultiTouchModel = false,
  expandAllTrigger,
  onExpandedStateChange,
  externalSortField,
  externalSortDirection
}: PerformanceTableProps) {
  const { isPrivacyMode } = usePrivacyMode()
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [allExpanded, setAllExpanded] = useState(false)
  const [nameColWidth, setNameColWidth] = useState(300)
  // Use external sort if provided, otherwise internal state
  const [internalSortField, setInternalSortField] = useState<SortField>('spend')
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>('desc')
  const sortField = externalSortField ?? internalSortField
  const sortDirection = externalSortDirection ?? internalSortDirection
  const setSortField = setInternalSortField
  const setSortDirection = setInternalSortDirection

  // Privacy mode masking for entity names
  const maskName = (name: string, type: 'campaign' | 'adset' | 'ad', index: number): string => {
    if (!isPrivacyMode) return name
    const prefix = type === 'campaign' ? 'Campaign' : type === 'adset' ? 'Ad Set' : 'Ad'
    return `${prefix} ${index + 1}`
  }

  // Budget edit modal state
  const [budgetEditModal, setBudgetEditModal] = useState<{
    isOpen: boolean
    entityId: string
    entityName: string
    entityType: 'campaign' | 'adset'
    currentBudget: number
    currentBudgetType: 'daily' | 'lifetime'
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Build hierarchy
  const hierarchy = useMemo(() => {
    const baseHierarchy = buildHierarchy(data, rules)

    // If we have lastTouchAttribution (hybrid multi-touch mode), recalculate
    // campaign/adset metrics using whole-number last-touch data instead of
    // fractional multi-touch data
    if (lastTouchAttribution && Object.keys(lastTouchAttribution).length > 0) {
      return baseHierarchy.map(campaign => {
        // Sum last-touch attribution for all ads in this campaign
        let campaignPurchases = 0
        let campaignRevenue = 0

        const updatedAdsets = campaign.children?.map(adset => {
          // Sum last-touch attribution for all ads in this adset
          let adsetPurchases = 0
          let adsetRevenue = 0

          adset.children?.forEach(ad => {
            const adId = ad.id
            if (adId && lastTouchAttribution[adId]) {
              adsetPurchases += lastTouchAttribution[adId].conversions
              adsetRevenue += lastTouchAttribution[adId].revenue
            }
          })

          campaignPurchases += adsetPurchases
          campaignRevenue += adsetRevenue

          // Update adset with last-touch totals (whole numbers)
          const adsetRoas = adset.spend > 0 ? adsetRevenue / adset.spend : 0
          return {
            ...adset,
            purchases: adsetPurchases,
            revenue: adsetRevenue,
            results: adsetPurchases,
            roas: adsetRoas,
            cpr: adsetPurchases > 0 ? adset.spend / adsetPurchases : 0,
            cpa: adsetPurchases > 0 ? adset.spend / adsetPurchases : 0,
            convRate: adset.clicks > 0 ? (adsetPurchases / adset.clicks) * 100 : 0,
            verdict: calculateVerdict(adset.spend, adsetRoas, rules)
          }
        })

        // Update campaign with last-touch totals (whole numbers)
        const campaignRoas = campaign.spend > 0 ? campaignRevenue / campaign.spend : 0
        return {
          ...campaign,
          purchases: campaignPurchases,
          revenue: campaignRevenue,
          results: campaignPurchases,
          roas: campaignRoas,
          cpr: campaignPurchases > 0 ? campaign.spend / campaignPurchases : 0,
          cpa: campaignPurchases > 0 ? campaign.spend / campaignPurchases : 0,
          convRate: campaign.clicks > 0 ? (campaignPurchases / campaign.clicks) * 100 : 0,
          verdict: calculateVerdict(campaign.spend, campaignRoas, rules),
          children: updatedAdsets
        }
      })
    }

    return baseHierarchy
  }, [data, rules, lastTouchAttribution])

  // Handle deep-linking highlight from alerts
  useEffect(() => {
    if (!highlightEntity || hierarchy.length === 0) return

    const { type, name, campaignName, adsetName } = highlightEntity

    // Find the entity in the hierarchy
    let foundCampaign: string | null = null
    let foundAdset: string | null = null

    if (type === 'campaign') {
      foundCampaign = hierarchy.find(c => c.name === name)?.name || null
    } else if (type === 'adset' && campaignName) {
      foundCampaign = campaignName
      const campaign = hierarchy.find(c => c.name === campaignName)
      foundAdset = campaign?.children?.find(a => a.name === name)?.name || null
    } else if (type === 'ad' && campaignName && adsetName) {
      foundCampaign = campaignName
      foundAdset = adsetName
    }

    // Expand to show the entity
    if (foundCampaign) {
      setExpandedCampaigns(prev => {
        const newSet = new Set(prev)
        newSet.add(foundCampaign!)
        return newSet
      })
    }
    if (foundAdset && foundCampaign) {
      setExpandedAdsets(prev => {
        const newSet = new Set(prev)
        newSet.add(`${foundCampaign}::${foundAdset}`)
        return newSet
      })
    }

    // Set the highlight
    const rowKey = type === 'campaign' ? name
      : type === 'adset' ? `${campaignName}::${name}`
      : `${campaignName}::${adsetName}::${name}`
    setHighlightedRow(rowKey)

    // Scroll to the highlighted row after a short delay
    setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)

    // Clear highlight after 3 seconds
    const timeout = setTimeout(() => {
      setHighlightedRow(null)
    }, 3000)

    return () => clearTimeout(timeout)
  }, [highlightEntity, hierarchy])

  const filteredHierarchy = useMemo(() => {
    // First filter by paused status if needed
    let filtered = hierarchy

    if (!includePaused) {
      // Exclude paused items at all levels
      filtered = hierarchy
        .filter(campaign => isEntityActive(campaign.status)) // Filter out paused campaigns
        .map(campaign => ({
          ...campaign,
          children: campaign.children
            ?.filter(adset => isEntityActive(adset.status)) // Filter out paused adsets
            .map(adset => ({
              ...adset,
              children: adset.children?.filter(ad => isEntityActive(ad.status)) // Filter out paused ads
            }))
            .filter(adset => adset.children && adset.children.length > 0)
        }))
        .filter(campaign => campaign.children && campaign.children.length > 0)
    }
    
    // Then apply verdict filter
    if (verdictFilter === 'all') return filtered
    
    return filtered
      .map(campaign => ({
        ...campaign,
        children: campaign.children
          ?.map(adset => ({
            ...adset,
            children: adset.children?.filter(ad => ad.verdict === verdictFilter)
          }))
          .filter(adset => adset.children && adset.children.length > 0)
      }))
      .filter(campaign => campaign.children && campaign.children.length > 0)
  }, [hierarchy, verdictFilter, includePaused])
  
  const sortedHierarchy = useMemo(() => 
    sortNodes(filteredHierarchy, sortField, sortDirection),
    [filteredHierarchy, sortField, sortDirection]
  )
  
  const totals = useMemo(() => {
    const t = {
      impressions: 0,
      clicks: 0,
      spend: 0,
      purchases: 0,
      revenue: 0,
      roas: 0,
      results: 0,
      cpr: 0,
      cpc: 0,
      ctr: 0,
      cpa: 0,
      convRate: 0,
      verdict: 'learn' as Verdict
    }
    filteredHierarchy.forEach(c => {
      t.impressions += c.impressions
      t.clicks += c.clicks
      t.spend += c.spend
      t.purchases += c.purchases
      t.revenue += c.revenue
      t.results += c.results
    })
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0
    const metrics = calculateMetrics(t)
    Object.assign(t, metrics)
    t.verdict = calculateVerdict(t.spend, t.roas, rules)
    return t
  }, [filteredHierarchy, rules])
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }
  
  const toggleCampaign = (name: string) => {
    const newSet = new Set(expandedCampaigns)
    if (newSet.has(name)) {
      newSet.delete(name)
      const newAdsets = new Set(expandedAdsets)
      hierarchy.find(c => c.name === name)?.children?.forEach(adset => {
        newAdsets.delete(`${name}::${adset.name}`)
      })
      setExpandedAdsets(newAdsets)
    } else {
      newSet.add(name)
    }
    setExpandedCampaigns(newSet)
  }
  
  const toggleAdset = (campaignName: string, adsetName: string) => {
    const key = `${campaignName}::${adsetName}`
    const newSet = new Set(expandedAdsets)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setExpandedAdsets(newSet)
  }
  
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedCampaigns(new Set())
      setExpandedAdsets(new Set())
    } else {
      const campaigns = new Set(sortedHierarchy.map(c => c.name))
      const adsets = new Set<string>()
      sortedHierarchy.forEach(c => {
        c.children?.forEach(a => {
          adsets.add(`${c.name}::${a.name}`)
        })
      })
      setExpandedCampaigns(campaigns)
      setExpandedAdsets(adsets)
    }
    setAllExpanded(!allExpanded)
  }

  // Respond to external expand trigger from parent
  const prevExpandTrigger = useRef(expandAllTrigger)
  useEffect(() => {
    if (expandAllTrigger !== undefined && expandAllTrigger !== prevExpandTrigger.current && expandAllTrigger > 0) {
      toggleAll()
      prevExpandTrigger.current = expandAllTrigger
    }
  }, [expandAllTrigger])

  // Notify parent of expand state changes
  useEffect(() => {
    onExpandedStateChange?.(allExpanded)
  }, [allExpanded, onExpandedStateChange])

  const handleMouseDown = (e: React.MouseEvent) => {
    resizing.current = true
    startX.current = e.clientX
    startWidth.current = nameColWidth
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return
    const diff = e.clientX - startX.current
    const newWidth = Math.max(200, Math.min(600, startWidth.current + diff))
    setNameColWidth(newWidth)
  }

  const handleMouseUp = () => {
    resizing.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  const hasCheckboxes = selectedCampaigns && onCampaignToggle
  const checkboxWidth = hasCheckboxes ? 32 : 0

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-3 h-3" />
    return sortDirection === 'asc' 
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />
  }

  const DataRow = ({
    node,
    level,
    isExpanded,
    onToggle,
    isSelected = true,
    rowKey,
    campaignName,
    adsetName,
    displayName,
  }: {
    node: HierarchyNode
    level: 'campaign' | 'adset' | 'ad'
    isExpanded?: boolean
    onToggle?: () => void
    isSelected?: boolean
    rowKey?: string
    campaignName?: string
    adsetName?: string
    displayName?: string
  }) => {
    // Use displayName if provided (for privacy mode), otherwise use node.name
    const nameToShow = displayName ?? node.name
    // New card-style indentation via marginLeft
    const indent = level === 'campaign' ? 0 : level === 'adset' ? 28 : 56
    const isHighlighted = rowKey === highlightedRow
    const textClass = level === 'campaign' ? 'text-white font-medium' : level === 'adset' ? 'text-zinc-200' : 'text-zinc-400'

    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={cn(
          // New card-style row with dark background
          'rounded-xl px-4 py-5 transition-all duration-200',
          'bg-[#0f1419]',
          'border border-white/10',
          'hover:border-white/20 hover:bg-[#131820]',
          'flex gap-3',
          // Align to top in detailed mode (two-row metrics), center in simple mode
          viewMode === 'detailed' ? 'items-start' : 'items-center',
          isHighlighted && 'ring-2 ring-accent/50 border-accent/50',
          !isSelected && level !== 'ad' && 'opacity-60',
          onToggle && 'cursor-pointer'
        )}
        style={{ marginLeft: indent }}
      >
        {/* Checkbox */}
        {hasCheckboxes && (
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: checkboxWidth }}
            onClick={(e) => {
              if (level === 'campaign' && onCampaignToggle) {
                e.stopPropagation()
                onCampaignToggle(node.name)
              }
              // ABO adsets also get checkboxes - use adset name prefixed with campaign for uniqueness
              if (level === 'adset' && node.budgetType === 'ABO' && onCampaignToggle && campaignName) {
                e.stopPropagation()
                onCampaignToggle(`${campaignName}::${node.name}`)
              }
            }}
          >
            {/* Show checkbox for campaigns and ABO adsets (where budget lives) */}
            {(level === 'campaign' || (level === 'adset' && node.budgetType === 'ABO')) && (() => {
              // For campaigns, check partial state (some but not all ABO adsets selected)
              let isPartial = false
              let isChecked = false

              if (level === 'campaign') {
                const aboAdsets = campaignAboAdsets?.get(node.name)
                if (aboAdsets && aboAdsets.size > 0) {
                  const aboArray = Array.from(aboAdsets)
                  const selectedCount = aboArray.filter(k => selectedCampaigns?.has(k)).length
                  isChecked = selectedCount === aboAdsets.size
                  isPartial = selectedCount > 0 && selectedCount < aboAdsets.size
                } else {
                  // No ABO adsets - use isSelected directly
                  isChecked = isSelected
                }
              } else {
                // ABO adset
                isChecked = selectedCampaigns?.has(`${campaignName}::${node.name}`) ?? false
              }

              return (
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer',
                  level === 'campaign'
                    ? (isChecked || isPartial)
                      ? 'bg-accent border-accent text-white'
                      : 'border-zinc-600 hover:border-zinc-500'
                    : isChecked
                      ? 'bg-purple-500 border-purple-500 text-white'
                      : 'border-purple-500/50 hover:border-purple-500'
                )}>
                  {level === 'campaign' && isChecked && <Check className="w-3 h-3" />}
                  {level === 'campaign' && isPartial && <Minus className="w-3 h-3" />}
                  {level === 'adset' && isChecked && <Check className="w-3 h-3" />}
                </div>
              )
            })()}
          </div>
        )}
        
        {/* Expand/collapse chevron */}
        {onToggle ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors flex-shrink-0"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Color bar indicator */}
        <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', typeColors[level])} style={{ minHeight: 32 }} />

        {/* Name section - two rows, max-width to ensure metrics align */}
        <div
          className="flex-1 min-w-0 max-w-[280px]"
          onClick={onToggle}
        >
          {/* Row 1: Name */}
          <div className={cn('truncate text-sm', textClass)} title={nameToShow}>{nameToShow}</div>
          {/* Row 2: Type label + status badges + CBO/ABO badge */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-zinc-500">{typeLabels[level]}</span>
            {/* Paused indicator - only show when includePaused is true */}
            {includePaused && node.status && node.status !== 'ACTIVE' && (
              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-zinc-500 bg-zinc-800/50 border border-zinc-700/50 rounded text-[9px] px-1.5 py-0.5">
                <Pause className="w-2.5 h-2.5 fill-current" />
                <span>{node.status === 'PAUSED' || node.status === 'ADSET_PAUSED' || node.status === 'CAMPAIGN_PAUSED' ? 'Paused' : node.status === 'UNKNOWN' ? 'Unknown' : node.status}</span>
              </span>
            )}
            {includePaused && !node.status?.includes('PAUSED') && node.hasChildrenPaused && (
              <span className="flex-shrink-0 inline-flex items-center text-zinc-600" title="Contains paused items">
                <Pause className="w-3 h-3" strokeWidth={1.5} />
              </span>
            )}
            {/* CBO/ABO Budget Type Badge */}
            {node.budgetType && (level === 'campaign' || level === 'adset') && (
              <span
                className={cn(
                  'flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded',
                  node.budgetType === 'CBO'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                )}
                title={node.budgetType === 'CBO'
                  ? `Campaign Budget: ${node.dailyBudget ? `$${node.dailyBudget}/day` : `$${node.lifetimeBudget} lifetime`}`
                  : `Ad Set Budget: ${node.dailyBudget ? `$${node.dailyBudget}/day` : `$${node.lifetimeBudget} lifetime`}`
                }
              >
                {node.budgetType}
              </span>
            )}
          </div>
        </div>

        {/* Metrics - with labels above values (matching mockup) */}
        {/* Simple mode: single row | Detailed mode: two rows */}
        {/* ml-auto pushes to right, flex-shrink-0 prevents shrinking for consistent alignment */}
        <div className={cn(
          "hidden lg:flex text-sm ml-auto flex-shrink-0",
          viewMode === 'detailed' ? 'flex-col gap-2' : 'items-center gap-4'
        )}>
          {/* Row 1: Core metrics (always shown) */}
          <div className="flex items-center gap-4">
            <div className="text-right w-20">
              <div className="text-zinc-500 text-xs mb-0.5">Spend</div>
              <div className="font-mono text-white">{formatCurrency(node.spend)}</div>
            </div>
            <div className="text-right w-20">
              <div className="text-zinc-500 text-xs mb-0.5">Revenue</div>
              <div className="font-mono text-white">{formatCurrency(node.revenue)}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">Results</div>
              <div className="font-mono text-white">{formatNumber(node.results)}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">CPR</div>
              <div className="font-mono text-white">{formatMetric(node.cpr)}</div>
            </div>
            <div className="text-right w-16">
              <div className="text-zinc-500 text-xs mb-0.5">ROAS</div>
              <div className="font-mono text-white font-semibold">{formatROAS(node.roas)}</div>
            </div>
            <div className="text-right w-20">
              <div className="text-zinc-500 text-xs mb-0.5">Budget</div>
              {(level === 'campaign' || level === 'adset') && node.budgetType && node.id ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onBudgetChange && canManageAds) {
                      const budgetType = node.dailyBudget ? 'daily' : 'lifetime'
                      const currentBudget = node.dailyBudget || node.lifetimeBudget || 0
                      setBudgetEditModal({
                        isOpen: true,
                        entityId: node.id!,
                        entityName: node.name,
                        entityType: level,
                        currentBudget,
                        currentBudgetType: budgetType,
                      })
                    }
                  }}
                  className={cn(
                    "font-mono text-white",
                    onBudgetChange && canManageAds && "hover:text-accent cursor-pointer transition-colors"
                  )}
                  disabled={!onBudgetChange || !canManageAds}
                >
                  {formatBudget(node.dailyBudget, node.lifetimeBudget).value}
                </button>
              ) : (
                <div className="font-mono text-zinc-600">—</div>
              )}
            </div>
          </div>

          {/* Row 2: Detailed metrics (only in detailed mode) */}
          {viewMode === 'detailed' && (
            <div className="flex items-center gap-4">
              <div className="text-right w-20">
                <div className="text-zinc-500 text-xs mb-0.5">CPC</div>
                <div className="font-mono text-white">{formatMetric(node.cpc)}</div>
              </div>
              <div className="text-right w-20">
                <div className="text-zinc-500 text-xs mb-0.5">CTR</div>
                <div className="font-mono text-white">{formatPercent(node.ctr)}</div>
              </div>
              <div className="text-right w-16">
                <div className="text-zinc-500 text-xs mb-0.5">CPA</div>
                <div className="font-mono text-white">{formatMetric(node.cpa)}</div>
              </div>
              <div className="text-right w-16">
                <div className="text-zinc-500 text-xs mb-0.5">Conv%</div>
                <div className="font-mono text-white">{formatPercent(node.convRate)}</div>
              </div>
              <div className="text-right w-16">
                <div className="text-zinc-500 text-xs mb-0.5">Clicks</div>
                <div className="font-mono text-white">{formatNumber(node.clicks)}</div>
              </div>
              <div className="text-right w-20">
                <div className="text-zinc-500 text-xs mb-0.5">Impr</div>
                <div className="font-mono text-white">{formatNumber(node.impressions)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Verdict badge */}
        {/* Show verdict only where budget lives: CBO at campaign, ABO at adset, arrows for ads */}
        {level === 'ad' ? (
          <PerformanceArrow verdict={node.verdict} />
        ) : level === 'campaign' && node.budgetType === 'CBO' ? (
          <VerdictBadge verdict={node.verdict} />
        ) : level === 'adset' && node.budgetType === 'ABO' ? (
          <VerdictBadge verdict={node.verdict} />
        ) : (
          <span className="w-[70px]" />
        )}

        {/* Actions - Play/Pause button */}
        {canManageAds && onStatusChange && node.id && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const isPaused = node.status && node.status !== 'ACTIVE'
              const newStatus = isPaused ? 'ACTIVE' : 'PAUSED'
              onStatusChange(node.id!, level, node.name, newStatus)
            }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg border transition-all flex-shrink-0',
              node.status && node.status !== 'ACTIVE'
                ? 'border-green-500/30 text-green-500 hover:bg-green-500/20 hover:border-green-500/50'
                : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/50'
            )}
            title={node.status && node.status !== 'ACTIVE' ? 'Resume' : 'Pause'}
          >
            {node.status && node.status !== 'ACTIVE' ? (
              <Play className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    )
  }

  const HeaderRow = () => (
    <div className="flex items-center text-xs text-zinc-500 uppercase tracking-wide bg-[#0a0d10] rounded-xl p-3 mb-2 border border-white/5">
      {hasCheckboxes && (
        <div
          className="flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ width: 24 }}
          onClick={onSelectAll}
        >
          <div className={cn(
            'w-4 h-4 rounded border flex items-center justify-center transition-colors',
            allSelected
              ? 'bg-accent border-accent text-white'
              : someSelected
                ? 'bg-accent/50 border-accent text-white'
                : 'border-zinc-600 hover:border-zinc-500'
          )}>
            {allSelected && <Check className="w-3 h-3" />}
            {someSelected && !allSelected && <Minus className="w-3 h-3" />}
          </div>
        </div>
      )}
      {/* Spacer for chevron column */}
      <div className="w-5 flex-shrink-0" />
      {/* Spacer for color bar column */}
      <div className="w-1 flex-shrink-0" />
      <div
        className="px-2 flex-1 min-w-0 font-semibold flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors"
        style={{ maxWidth: nameColWidth }}
        onClick={() => handleSort('name')}
      >
        Name
        <SortIcon field="name" />
      </div>
      {/* Spacer for resize handle */}
      <div className="w-1 flex-shrink-0" />
      <div className="flex-1 flex items-center">
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('spend')}>
          Spend <SortIcon field="spend" />
        </div>
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('revenue')}>
          Revenue <SortIcon field="revenue" />
        </div>
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('results')}>
          Results <SortIcon field="results" />
        </div>
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('cpr')}>
          CPR <SortIcon field="cpr" />
        </div>
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('roas')}>
          ROAS <SortIcon field="roas" />
        </div>
        {/* Detailed mode columns */}
        {viewMode === 'detailed' && (
          <>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('purchases')}>
              Purch <SortIcon field="purchases" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('cpc')}>
              CPC <SortIcon field="cpc" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('ctr')}>
              CTR <SortIcon field="ctr" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('cpa')}>
              CPA <SortIcon field="cpa" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('convRate')}>
              Conv% <SortIcon field="convRate" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('clicks')}>
              Clicks <SortIcon field="clicks" />
            </div>
            <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('impressions')}>
              Impr <SortIcon field="impressions" />
            </div>
          </>
        )}
        {/* Budget column header - positioned next to Verdict */}
        <div className="w-24 text-right px-2 flex-shrink-0">
          Budget
        </div>
        <div className="w-20 text-center px-2 flex-shrink-0 flex items-center justify-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('verdict')}>
          Verdict <SortIcon field="verdict" />
        </div>
        {canManageAds && (
          <div className="w-16 text-center px-2 flex-shrink-0">
            Actions
          </div>
        )}
      </div>
    </div>
  )

  // Note: TotalsRow is no longer used in the new card-based design
  // The totals are shown in the stat cards above the table instead

  // Mobile Card Component
  const MobileCard = ({ node, level, isExpanded, onToggle, displayName }: {
    node: HierarchyNode
    level: 'campaign' | 'adset' | 'ad'
    isExpanded?: boolean
    onToggle?: () => void
    displayName?: string
  }) => {
    const nameToShow = displayName ?? node.name
    const isPaused = node.status && !isEntityActive(node.status)
    const hasChildrenPaused = node.hasChildrenPaused

    const levelColors = {
      campaign: 'border-l-hierarchy-campaign',
      adset: 'border-l-hierarchy-adset',
      ad: 'border-l-zinc-600'
    }

    const levelLabels = {
      campaign: 'Campaign',
      adset: 'Ad Set',
      ad: 'Ad'
    }

    return (
      <div className={cn(
        "bg-bg-card border border-border rounded-xl p-4 mb-3 border-l-4",
        levelColors[level],
        isPaused && "opacity-60"
      )}>
        {/* Header with name and verdict */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{levelLabels[level]}</span>
              {/* CBO/ABO Badge for mobile */}
              {node.budgetType && (level === 'campaign' || level === 'adset') && (
                <span
                  className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded',
                    node.budgetType === 'CBO'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  )}
                >
                  {node.budgetType}
                </span>
              )}
              {isPaused && <Pause className="w-3 h-3 text-zinc-500" />}
              {hasChildrenPaused && !isPaused && (
                <span className="text-[10px] text-zinc-500">(has paused)</span>
              )}
            </div>
            <h3 className={cn(
              "font-semibold text-sm",
              isPaused && "text-zinc-400"
            )}>{nameToShow}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Show verdict only where budget lives:
                - CBO: verdict at campaign level
                - ABO: verdict at adset level
                - Ads: always show performance arrow */}
            {level === 'ad' ? (
              <PerformanceArrow verdict={node.verdict} />
            ) : level === 'campaign' && node.budgetType === 'CBO' ? (
              <VerdictBadge verdict={node.verdict} />
            ) : level === 'adset' && node.budgetType === 'ABO' ? (
              <VerdictBadge verdict={node.verdict} />
            ) : null}
            {/* Pause/Resume button for mobile */}
            {canManageAds && onStatusChange && node.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const newStatus = isPaused ? 'ACTIVE' : 'PAUSED'
                  onStatusChange(node.id!, level, node.name, newStatus)
                }}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg border transition-all',
                  isPaused
                    ? 'border-green-500/30 text-green-500 hover:bg-green-500/20'
                    : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                )}
              >
                {isPaused ? (
                  <Play className="w-4 h-4" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
        
        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-bg-dark rounded-lg p-2 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Spend</div>
            <div className="font-mono text-sm font-semibold">{formatCurrency(node.spend)}</div>
          </div>
          <div className="bg-bg-dark rounded-lg p-2 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Revenue</div>
            <div className="font-mono text-sm font-semibold">{formatCurrency(node.revenue)}</div>
          </div>
          <div className="bg-bg-dark rounded-lg p-2 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">ROAS</div>
            <div className={cn(
              "font-mono text-sm font-semibold",
              node.roas >= rules.scale_roas ? "text-verdict-scale" :
              node.roas >= rules.min_roas ? "text-verdict-watch" :
              node.spend >= rules.learning_spend ? "text-verdict-kill" : "text-zinc-400"
            )}>{formatROAS(node.roas)}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if ((level === 'campaign' || level === 'adset') && node.budgetType && node.id && onBudgetChange && canManageAds) {
                const budgetType = node.dailyBudget ? 'daily' : 'lifetime'
                const currentBudget = node.dailyBudget || node.lifetimeBudget || 0
                setBudgetEditModal({
                  isOpen: true,
                  entityId: node.id,
                  entityName: node.name,
                  entityType: level,
                  currentBudget,
                  currentBudgetType: budgetType,
                })
              }
            }}
            disabled={!((level === 'campaign' || level === 'adset') && node.budgetType && node.id && onBudgetChange && canManageAds)}
            className={cn(
              "bg-bg-dark rounded-lg p-2 text-center w-full",
              (level === 'campaign' || level === 'adset') && node.budgetType && node.id && onBudgetChange && canManageAds && "active:bg-bg-hover"
            )}
          >
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Budget</div>
            <div className="font-mono text-sm font-semibold">
              {(level === 'campaign' || level === 'adset') && node.budgetType ? (
                <span className="flex items-center justify-center gap-0.5">
                  <span>{formatBudget(node.dailyBudget, node.lifetimeBudget).value}</span>
                  <span className="text-[9px] text-zinc-500">{formatBudget(node.dailyBudget, node.lifetimeBudget).type}</span>
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </div>
          </button>
        </div>
        
        {/* Secondary metrics */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="text-zinc-500">Purch</div>
            <div className="font-mono">{formatNumber(node.purchases)}</div>
          </div>
          <div>
            <div className="text-zinc-500">CPA</div>
            <div className="font-mono">{formatMetric(node.cpa)}</div>
          </div>
          <div>
            <div className="text-zinc-500">CTR</div>
            <div className="font-mono">{formatPercent(node.ctr)}</div>
          </div>
          <div>
            <div className="text-zinc-500">CPC</div>
            <div className="font-mono">{formatMetric(node.cpc)}</div>
          </div>
        </div>
        
        {/* Expand/collapse for campaigns and adsets */}
        {level !== 'ad' && node.children && node.children.length > 0 && (
          <button
            onClick={onToggle}
            className="w-full mt-3 pt-3 border-t border-border text-xs text-zinc-400 hover:text-white flex items-center justify-center gap-1 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide {node.children.length} {level === 'campaign' ? 'ad sets' : 'ads'}
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show {node.children.length} {level === 'campaign' ? 'ad sets' : 'ads'}
              </>
            )}
          </button>
        )}
      </div>
    )
  }

  // Mobile Totals Card
  const MobileTotalsCard = () => (
    <div className="bg-zinc-900 border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">All Campaigns</h3>
        <VerdictBadge verdict={totals.verdict} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg-dark rounded-lg p-2 text-center">
          <div className="text-[10px] text-zinc-500 uppercase">Spend</div>
          <div className="font-mono text-sm font-semibold">{formatCurrency(totals.spend)}</div>
        </div>
        <div className="bg-bg-dark rounded-lg p-2 text-center">
          <div className="text-[10px] text-zinc-500 uppercase">Revenue</div>
          <div className="font-mono text-sm font-semibold">{formatCurrency(totals.revenue)}</div>
        </div>
        <div className="bg-bg-dark rounded-lg p-2 text-center">
          <div className="text-[10px] text-zinc-500 uppercase">ROAS</div>
          <div className="font-mono text-sm font-semibold text-verdict-scale">{formatROAS(totals.roas)}</div>
        </div>
      </div>
    </div>
  )
  
  return (
    <div ref={containerRef}>
      {/* Desktop Table View - no header, just cards */}
      <div className="desktop-table overflow-x-auto">
        <div className="space-y-2 min-w-[900px] max-w-[1400px]">
            {sortedHierarchy.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-500">
                No ads match the selected filter
              </div>
            ) : (
              sortedHierarchy.map((campaign, campaignIndex) => {
                const isSelected = selectedCampaigns?.has(campaign.name) ?? true

                return (
                  <div key={campaign.name}>
                    <DataRow
                      node={campaign}
                      level="campaign"
                      isExpanded={expandedCampaigns.has(campaign.name)}
                      onToggle={() => toggleCampaign(campaign.name)}
                      isSelected={isSelected}
                      rowKey={campaign.name}
                      displayName={maskName(campaign.name, 'campaign', campaignIndex)}
                    />

                    {expandedCampaigns.has(campaign.name) && campaign.children?.map((adset, adsetIndex) => (
                      <div key={`${campaign.name}::${adset.name}`}>
                        <DataRow
                          node={adset}
                          level="adset"
                          isExpanded={expandedAdsets.has(`${campaign.name}::${adset.name}`)}
                          onToggle={() => toggleAdset(campaign.name, adset.name)}
                          rowKey={`${campaign.name}::${adset.name}`}
                          campaignName={campaign.name}
                          displayName={maskName(adset.name, 'adset', adsetIndex)}
                        />

                        {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map((ad, adIndex) => (
                          <DataRow
                            key={`${campaign.name}::${adset.name}::${ad.name}`}
                            node={ad}
                            level="ad"
                            rowKey={`${campaign.name}::${adset.name}::${ad.name}`}
                            campaignName={campaign.name}
                            adsetName={adset.name}
                            displayName={maskName(ad.name, 'ad', adIndex)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </div>

      {/* Mobile Cards View */}
      <div className="mobile-cards">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">Campaign Performance</h2>
            <span className="text-sm text-zinc-500">{sortedHierarchy.length} campaigns</span>
          </div>
          <button
            onClick={toggleAll}
            className="text-xs text-zinc-400 hover:text-white bg-bg-card border border-border px-3 py-1.5 rounded-md transition-colors"
          >
            {allExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {verdictFilter !== 'all' && (
          <div className="text-xs text-zinc-400 bg-bg-card border border-border px-3 py-2 rounded-lg mb-4">
            Showing: {verdictFilter.charAt(0).toUpperCase() + verdictFilter.slice(1)} only
          </div>
        )}

        {/* Campaign Cards */}
        {sortedHierarchy.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            No ads match the selected filter
          </div>
        ) : (
          sortedHierarchy.map((campaign, campaignIndex) => (
            <div key={campaign.name}>
              <MobileCard
                node={campaign}
                level="campaign"
                isExpanded={expandedCampaigns.has(campaign.name)}
                onToggle={() => toggleCampaign(campaign.name)}
                displayName={maskName(campaign.name, 'campaign', campaignIndex)}
              />

              {expandedCampaigns.has(campaign.name) && campaign.children?.map((adset, adsetIndex) => (
                <div key={`${campaign.name}::${adset.name}`} className="ml-3">
                  <MobileCard
                    node={adset}
                    level="adset"
                    isExpanded={expandedAdsets.has(`${campaign.name}::${adset.name}`)}
                    onToggle={() => toggleAdset(campaign.name, adset.name)}
                    displayName={maskName(adset.name, 'adset', adsetIndex)}
                  />

                  {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map((ad, adIndex) => (
                    <div key={`${campaign.name}::${adset.name}::${ad.name}`} className="ml-3">
                      <MobileCard
                        node={ad}
                        level="ad"
                        displayName={maskName(ad.name, 'ad', adIndex)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Budget Edit Modal */}
      {budgetEditModal && (
        <BudgetEditModal
          isOpen={budgetEditModal.isOpen}
          onClose={() => setBudgetEditModal(null)}
          onSave={async (newBudget, budgetType) => {
            if (onBudgetChange) {
              await onBudgetChange(
                budgetEditModal.entityId,
                budgetEditModal.entityType,
                newBudget,
                budgetType,
                budgetEditModal.currentBudget
              )
            }
          }}
          entityName={budgetEditModal.entityName}
          entityType={budgetEditModal.entityType}
          entityId={budgetEditModal.entityId}
          currentBudget={budgetEditModal.currentBudget}
          currentBudgetType={budgetEditModal.currentBudgetType}
          scalePercentage={rules.scale_percentage}
          userId={userId}
        />
      )}
    </div>
  )
}
