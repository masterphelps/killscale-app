'use client'

import { useState, useMemo, useRef } from 'react'
import { Minus, Plus, Check, ChevronUp, ChevronDown, Pause } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { VerdictBadge } from './verdict-badge'
import { Rules, calculateVerdict, Verdict, isEntityActive } from '@/lib/supabase'

type AdRow = {
  campaign_name: string
  adset_name: string
  ad_name: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  roas: number
  status?: string | null  // Ad's effective status
  adset_status?: string | null  // Adset's own status
  campaign_status?: string | null  // Campaign's own status
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
  selectedCampaigns?: Set<string>
  onCampaignToggle?: (campaignName: string) => void
  onSelectAll?: () => void
  allSelected?: boolean
  someSelected?: boolean
}

type HierarchyNode = {
  name: string
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
}

const formatPercent = (value: number) => {
  if (!isFinite(value) || isNaN(value)) return '0.00%'
  return value.toFixed(2) + '%'
}

const formatMetric = (value: number, prefix = '$') => {
  if (!isFinite(value) || isNaN(value)) return '—'
  return prefix + value.toFixed(2)
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
  
  data.forEach(row => {
    // Capture statuses from the first row we see for each entity
    if (row.campaign_status && !campaignStatuses[row.campaign_name]) {
      campaignStatuses[row.campaign_name] = row.campaign_status
    }
    if (row.adset_status && !adsetStatuses[row.adset_name]) {
      adsetStatuses[row.adset_name] = row.adset_status
    }
    
    if (!campaigns[row.campaign_name]) {
      campaigns[row.campaign_name] = {
        name: row.campaign_name,
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
    
    let adset = campaign.children?.find(c => c.name === row.adset_name)
    if (!adset) {
      adset = {
        name: row.adset_name,
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
    
    const metrics = calculateMetrics(row)
    const ad: HierarchyNode = {
      name: row.ad_name,
      type: 'ad',
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
      status: row.status,
      ...metrics,
      verdict: calculateVerdict(row.spend, row.spend > 0 ? row.revenue / row.spend : 0, rules)
    }
    adset.children?.push(ad)
    
    adset.impressions += row.impressions
    adset.clicks += row.clicks
    adset.spend += row.spend
    adset.purchases += row.purchases
    adset.revenue += row.revenue
  })
  
  Object.values(campaigns).forEach(campaign => {
    campaign.children?.forEach(adset => {
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
  selectedCampaigns,
  onCampaignToggle,
  onSelectAll,
  allSelected = false,
  someSelected = false
}: PerformanceTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  const [nameColWidth, setNameColWidth] = useState(300)
  const [sortField, setSortField] = useState<SortField>('spend')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const containerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  
  const hierarchy = useMemo(() => buildHierarchy(data, rules), [data, rules])
  
  const filteredHierarchy = useMemo(() => {
    // First filter by paused status if needed
    let filtered = hierarchy
    
    if (!includePaused) {
      // Exclude paused items
      filtered = hierarchy
        .map(campaign => ({
          ...campaign,
          children: campaign.children
            ?.map(adset => ({
              ...adset,
              children: adset.children?.filter(ad => isEntityActive(ad.status))
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
  }: { 
    node: HierarchyNode
    level: 'campaign' | 'adset' | 'ad'
    isExpanded?: boolean
    onToggle?: () => void
    isSelected?: boolean
  }) => {
    const indent = level === 'campaign' ? 0 : level === 'adset' ? 24 : 48
    const bgClass = level === 'campaign' 
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
        className={cn(
          'flex items-center border-b border-border transition-colors',
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
            {/* Paused indicator - filled for self, outline for children */}
            {node.status && node.status !== 'ACTIVE' ? (
              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-zinc-500 bg-zinc-800/50 border border-zinc-700/50 rounded text-[9px] px-1.5 py-0.5 ml-1">
                <Pause className="w-2.5 h-2.5 fill-current" />
                <span>{node.status === 'PAUSED' || node.status === 'ADSET_PAUSED' || node.status === 'CAMPAIGN_PAUSED' ? 'Paused' : node.status === 'UNKNOWN' ? 'Unknown' : node.status}</span>
              </span>
            ) : node.hasChildrenPaused ? (
              <span className="flex-shrink-0 inline-flex items-center text-zinc-600 ml-1" title="Contains paused items">
                <Pause className="w-3 h-3" strokeWidth={1.5} />
              </span>
            ) : null}
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
          <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.purchases)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(node.cpc)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(node.ctr)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(node.cpa)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(node.convRate)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.clicks)}</div>
          <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(node.impressions)}</div>
          <div className="w-20 flex justify-center px-2 flex-shrink-0">
            <VerdictBadge verdict={node.verdict} size="sm" />
          </div>
        </div>
      </div>
    )
  }

  const HeaderRow = () => (
    <div className="flex items-center bg-bg-dark text-[10px] text-zinc-500 uppercase tracking-wide border-b border-border" style={{ height: 40 }}>
      {hasCheckboxes && <div style={{ width: checkboxWidth }} className="flex-shrink-0" />}
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
        <div className="w-20 text-center px-2 flex-shrink-0 flex items-center justify-center gap-1 cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort('verdict')}>
          Verdict <SortIcon field="verdict" />
        </div>
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
        <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.purchases)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(totals.cpc)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(totals.ctr)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatMetric(totals.cpa)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatPercent(totals.convRate)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.clicks)}</div>
        <div className="flex-1 text-right font-mono text-sm px-2">{formatNumber(totals.impressions)}</div>
        <div className="w-20 flex justify-center px-2 flex-shrink-0">
          <VerdictBadge verdict={totals.verdict} size="sm" />
        </div>
      </div>
    </div>
  )
  
  return (
    <div ref={containerRef} className="bg-bg-card border border-border rounded-xl overflow-hidden">
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
        <TotalsRow />
        
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
                  />
                  
                  {expandedCampaigns.has(campaign.name) && campaign.children?.map(adset => (
                    <div key={`${campaign.name}::${adset.name}`}>
                      <DataRow 
                        node={adset}
                        level="adset"
                        isExpanded={expandedAdsets.has(`${campaign.name}::${adset.name}`)}
                        onToggle={() => toggleAdset(campaign.name, adset.name)}
                      />
                      
                      {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map(ad => (
                        <DataRow 
                          key={`${campaign.name}::${adset.name}::${ad.name}`}
                          node={ad}
                          level="ad"
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
  )
}
