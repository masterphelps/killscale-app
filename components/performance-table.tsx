'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Minus, Plus, Check, ChevronUp, ChevronDown, Pause, Play, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { VerdictBadge } from './verdict-badge'
import { BudgetEditModal } from './budget-edit-modal'
import { Rules, calculateVerdict, Verdict, isEntityActive } from '@/lib/supabase'

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

type SortField = 'name' | 'spend' | 'revenue' | 'roas' | 'purchases' | 'cpc' | 'ctr' | 'cpa' | 'convRate' | 'clicks' | 'impressions' | 'verdict'
type SortDirection = 'asc' | 'desc'

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
  // For budget modal enhancements
  userId?: string
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

function calculateMetrics(node: { spend: number; clicks: number; impressions: number; purchases: number }) {
  return {
    cpc: node.clicks > 0 ? node.spend / node.clicks : 0,
    ctr: node.impressions > 0 ? (node.clicks / node.impressions) * 100 : 0,
    cpa: node.purchases > 0 ? node.spend / node.purchases : 0,
    convRate: node.clicks > 0 ? (node.purchases / node.clicks) * 100 : 0,
  }
}

const verdictOrder: Record<Verdict, number> = {
  'scale': 4,
  'watch': 3,
  'learn': 2,
  'kill': 1,
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
    // Keep the status from any row (they should all be the same for a given ad)
    if (row.status) ad.status = row.status
    
    adset.impressions += row.impressions
    adset.clicks += row.clicks
    adset.spend += row.spend
    adset.purchases += row.purchases
    adset.revenue += row.revenue
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
      if (adsetBudget && (adsetBudget.daily || adsetBudget.lifetime)) {
        adset.budgetType = 'ABO'
        adset.dailyBudget = adsetBudget.daily
        adset.lifetimeBudget = adsetBudget.lifetime
      }

      campaign.impressions += adset.impressions
      campaign.clicks += adset.clicks
      campaign.spend += adset.spend
      campaign.purchases += adset.purchases
      campaign.revenue += adset.revenue
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
  userId
}: PerformanceTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [allExpanded, setAllExpanded] = useState(false)
  const [nameColWidth, setNameColWidth] = useState(300)
  const [sortField, setSortField] = useState<SortField>('spend')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

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

  const hierarchy = useMemo(() => buildHierarchy(data, rules), [data, rules])

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
  }: {
    node: HierarchyNode
    level: 'campaign' | 'adset' | 'ad'
    isExpanded?: boolean
    onToggle?: () => void
    isSelected?: boolean
    rowKey?: string
    campaignName?: string
    adsetName?: string
  }) => {
    const indent = level === 'campaign' ? 0 : level === 'adset' ? 24 : 48
    const isHighlighted = rowKey === highlightedRow
    const bgClass = isHighlighted
      ? 'bg-accent/20 ring-2 ring-accent/50'
      : level === 'campaign'
        ? (isSelected ? 'bg-hierarchy-campaign-bg hover:bg-blue-500/20' : 'bg-bg-card/50 opacity-60 hover:opacity-80')
        : level === 'adset'
          ? 'bg-hierarchy-adset-bg hover:bg-purple-500/15'
          : 'bg-bg-card hover:bg-bg-hover'
    const textClass = level === 'campaign' ? 'text-white' : level === 'adset' ? 'text-purple-200' : 'text-zinc-400'
    const labelBg = level === 'campaign'
      ? 'bg-blue-500/30 text-blue-300'
      : level === 'adset'
        ? 'bg-purple-500/30 text-purple-300'
        : 'bg-bg-dark text-zinc-500'
    const label = level === 'campaign' ? 'Camp' : level === 'adset' ? 'Set' : 'Ad'

    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={cn(
          'flex items-center border-b border-border transition-all duration-300',
          bgClass,
          onToggle && 'cursor-pointer'
        )}
        style={{ height: level === 'ad' ? 38 : 46 }}
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
            }}
          >
            {level === 'campaign' && (
              <div className={cn(
                'w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer',
                isSelected 
                  ? 'bg-accent border-accent text-white' 
                  : 'border-zinc-600 hover:border-zinc-500'
              )}>
                {isSelected && <Check className="w-3 h-3" />}
              </div>
            )}
          </div>
        )}
        
        {/* Name column */}
        <div 
          className="flex items-center min-w-0 px-3 relative"
          style={{ width: nameColWidth, flexShrink: 0 }}
          onClick={onToggle}
        >
          <div style={{ paddingLeft: indent }} className="flex items-center gap-2 min-w-0 flex-1">
            {onToggle && (
              <button className={cn(
                'w-4 h-4 flex-shrink-0 flex items-center justify-center rounded border transition-colors',
                level === 'campaign' 
                  ? (isExpanded ? 'bg-accent border-accent text-white' : 'border-border text-zinc-500')
                  : level === 'adset'
                    ? (isExpanded ? 'bg-purple-500 border-purple-500 text-white' : 'border-purple-500/30 text-purple-400')
                    : ''
              )}>
                {isExpanded ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
              </button>
            )}
            {!onToggle && <div className="w-4" />}
            <span className={cn('text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded uppercase font-medium', labelBg)}>{label}</span>
            <span className={cn('truncate text-sm', textClass)} title={node.name}>{node.name}</span>
            {/* Paused indicator - only show when includePaused is true */}
            {includePaused && node.status && node.status !== 'ACTIVE' ? (
              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-zinc-500 bg-zinc-800/50 border border-zinc-700/50 rounded text-[9px] px-1.5 py-0.5 ml-1">
                <Pause className="w-2.5 h-2.5 fill-current" />
                <span>{node.status === 'PAUSED' || node.status === 'ADSET_PAUSED' || node.status === 'CAMPAIGN_PAUSED' ? 'Paused' : node.status === 'UNKNOWN' ? 'Unknown' : node.status}</span>
              </span>
            ) : includePaused && node.hasChildrenPaused ? (
              <span className="flex-shrink-0 inline-flex items-center text-zinc-600 ml-1" title="Contains paused items">
                <Pause className="w-3 h-3" strokeWidth={1.5} />
              </span>
            ) : null}
            {/* CBO/ABO Budget Type Badge */}
            {node.budgetType && (level === 'campaign' || level === 'adset') && (
              <span
                className={cn(
                  'flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded ml-1',
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
          <div 
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 flex items-center justify-center"
            onMouseDown={handleMouseDown}
          >
            <div className="w-0.5 h-4 bg-border rounded" />
          </div>
        </div>
        
        {/* Data columns */}
        <div className="flex-1 flex items-center">
          <div className="flex-1 text-right font-mono text-sm px-2">{formatCurrency(node.spend)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatCurrency(node.revenue)}</div>
          <div className="flex-1 text-right font-mono text-sm font-semibold px-2">{formatROAS(node.roas)}</div>
          {/* Detailed mode columns */}
          {viewMode === 'detailed' && (
            <>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.purchases)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(node.cpc)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(node.ctr)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(node.cpa)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(node.convRate)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.clicks)}</div>
              <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.impressions)}</div>
            </>
          )}
          {/* Budget column - shows for campaigns (CBO) and adsets (ABO) - positioned next to Verdict */}
          <div className="w-24 text-right font-mono text-sm px-2 flex-shrink-0">
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
                  "flex items-center justify-end gap-1 w-full",
                  onBudgetChange && canManageAds && "hover:text-accent cursor-pointer transition-colors"
                )}
                disabled={!onBudgetChange || !canManageAds}
              >
                <span>{formatBudget(node.dailyBudget, node.lifetimeBudget).value}</span>
                <span className="text-[10px] text-zinc-500">{formatBudget(node.dailyBudget, node.lifetimeBudget).type}</span>
              </button>
            ) : (
              <span className="text-zinc-600">—</span>
            )}
          </div>
          <div className="w-20 flex justify-center px-2 flex-shrink-0">
            {/* Show verdict only where budget lives:
                - CBO: verdict at campaign level
                - ABO: verdict at adset level
                - Ads: always show performance arrow */}
            {level === 'ad' ? (
              <PerformanceArrow verdict={node.verdict} />
            ) : level === 'campaign' && node.budgetType === 'CBO' ? (
              <VerdictBadge verdict={node.verdict} size="sm" />
            ) : level === 'adset' && node.budgetType === 'ABO' ? (
              <VerdictBadge verdict={node.verdict} size="sm" />
            ) : (
              <span className="text-zinc-600">—</span>
            )}
          </div>
          {/* Actions column */}
          {canManageAds && onStatusChange && node.id && (
            <div className="w-16 flex justify-center px-2 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const isPaused = node.status && node.status !== 'ACTIVE'
                  const newStatus = isPaused ? 'ACTIVE' : 'PAUSED'
                  onStatusChange(node.id!, level, node.name, newStatus)
                }}
                className={cn(
                  'w-7 h-7 flex items-center justify-center rounded-md border transition-all',
                  node.status && node.status !== 'ACTIVE'
                    ? 'border-green-500/30 text-green-500 hover:bg-green-500/20 hover:border-green-500/50'
                    : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/50'
                )}
                title={node.status && node.status !== 'ACTIVE' ? 'Resume' : 'Pause'}
              >
                {node.status && node.status !== 'ACTIVE' ? (
                  <Play className="w-3.5 h-3.5" />
                ) : (
                  <Pause className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const HeaderRow = () => (
    <div className="flex items-center bg-bg-dark text-[10px] text-zinc-500 uppercase tracking-wide border-b border-border" style={{ height: 40 }}>
      {hasCheckboxes && (
        <div
          className="flex flex-col items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ width: checkboxWidth }}
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
          <span className="text-[8px] text-zinc-600 mt-0.5">All</span>
        </div>
      )}
      <div
        className="px-3 relative flex-shrink-0 font-semibold flex items-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors"
        style={{ width: nameColWidth }}
        onClick={() => handleSort('name')}
      >
        Name
        <SortIcon field="name" />
        <div 
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-accent/30 flex items-center justify-center"
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-0.5 h-4 bg-border rounded" />
        </div>
      </div>
      <div className="flex-1 flex items-center">
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('spend')}>
          Spend <SortIcon field="spend" />
        </div>
        <div className="flex-1 text-right px-2 flex items-center justify-end gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('revenue')}>
          Revenue <SortIcon field="revenue" />
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

  const TotalsRow = () => (
    <div className="flex items-center bg-zinc-900 border-b border-border font-medium" style={{ height: 46 }}>
      {hasCheckboxes && (
        <div 
          className="flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{ width: checkboxWidth }}
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
      <div className="px-3 text-white flex-shrink-0 text-sm font-semibold" style={{ width: nameColWidth }}>All Campaigns</div>
      <div className="flex-1 flex items-center">
        <div className="flex-1 text-right font-mono text-sm px-2">{formatCurrency(totals.spend)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatCurrency(totals.revenue)}</div>
        <div className="flex-1 text-right font-mono text-sm font-semibold px-2">{formatROAS(totals.roas)}</div>
        {/* Detailed mode columns */}
        {viewMode === 'detailed' && (
          <>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.purchases)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(totals.cpc)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(totals.ctr)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(totals.cpa)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(totals.convRate)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.clicks)}</div>
            <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.impressions)}</div>
          </>
        )}
        {/* Budget column - empty for totals row */}
        <div className="w-24 text-right font-mono text-sm px-2 flex-shrink-0 text-zinc-600">—</div>
        <div className="w-20 flex justify-center px-2 flex-shrink-0">
          <VerdictBadge verdict={totals.verdict} size="sm" />
        </div>
        {canManageAds && (
          <div className="w-16 flex-shrink-0" />
        )}
      </div>
    </div>
  )

  // Mobile Card Component
  const MobileCard = ({ node, level, isExpanded, onToggle }: { 
    node: HierarchyNode
    level: 'campaign' | 'adset' | 'ad'
    isExpanded?: boolean
    onToggle?: () => void 
  }) => {
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
            )}>{node.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Show verdict only where budget lives:
                - CBO: verdict at campaign level
                - ABO: verdict at adset level
                - Ads: always show performance arrow */}
            {level === 'ad' ? (
              <PerformanceArrow verdict={node.verdict} />
            ) : level === 'campaign' && node.budgetType === 'CBO' ? (
              <VerdictBadge verdict={node.verdict} size="sm" />
            ) : level === 'adset' && node.budgetType === 'ABO' ? (
              <VerdictBadge verdict={node.verdict} size="sm" />
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
        <VerdictBadge verdict={totals.verdict} size="sm" />
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
      {/* Desktop Table View */}
      <div className="desktop-table bg-bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Campaign Performance</h2>
            <span className="text-sm text-zinc-500">{sortedHierarchy.length} campaigns</span>
            {verdictFilter !== 'all' && (
              <span className="text-xs text-zinc-400 bg-bg-dark px-2 py-1 rounded">
                Showing: {verdictFilter.charAt(0).toUpperCase() + verdictFilter.slice(1)} only
              </span>
            )}
          </div>
          <button
            onClick={toggleAll}
            className="text-xs text-zinc-400 hover:text-white bg-bg-dark border border-border px-3 py-1.5 rounded-md transition-colors"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
        
        {/* Table */}
        <div className="overflow-x-auto">
          <HeaderRow />

          <div className="max-h-[calc(100vh-500px)] overflow-y-auto">
            {sortedHierarchy.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-500">
                No ads match the selected filter
              </div>
            ) : (
              sortedHierarchy.map(campaign => {
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
                    />

                    {expandedCampaigns.has(campaign.name) && campaign.children?.map(adset => (
                      <div key={`${campaign.name}::${adset.name}`}>
                        <DataRow
                          node={adset}
                          level="adset"
                          isExpanded={expandedAdsets.has(`${campaign.name}::${adset.name}`)}
                          onToggle={() => toggleAdset(campaign.name, adset.name)}
                          rowKey={`${campaign.name}::${adset.name}`}
                          campaignName={campaign.name}
                        />

                        {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map(ad => (
                          <DataRow
                            key={`${campaign.name}::${adset.name}::${ad.name}`}
                            node={ad}
                            level="ad"
                            rowKey={`${campaign.name}::${adset.name}::${ad.name}`}
                            campaignName={campaign.name}
                            adsetName={adset.name}
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
          sortedHierarchy.map(campaign => (
            <div key={campaign.name}>
              <MobileCard
                node={campaign}
                level="campaign"
                isExpanded={expandedCampaigns.has(campaign.name)}
                onToggle={() => toggleCampaign(campaign.name)}
              />
              
              {expandedCampaigns.has(campaign.name) && campaign.children?.map(adset => (
                <div key={`${campaign.name}::${adset.name}`} className="ml-3">
                  <MobileCard
                    node={adset}
                    level="adset"
                    isExpanded={expandedAdsets.has(`${campaign.name}::${adset.name}`)}
                    onToggle={() => toggleAdset(campaign.name, adset.name)}
                  />
                  
                  {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map(ad => (
                    <div key={`${campaign.name}::${adset.name}::${ad.name}`} className="ml-3">
                      <MobileCard
                        node={ad}
                        level="ad"
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
