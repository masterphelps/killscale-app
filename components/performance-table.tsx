'use client'

import { useState, useMemo, useRef } from 'react'
import { Minus, Plus, Check } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { VerdictBadge } from './verdict-badge'
import { Rules, calculateVerdict, Verdict } from '@/lib/supabase'

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
}

type VerdictFilter = 'all' | 'scale' | 'watch' | 'kill' | 'learn'

type PerformanceTableProps = {
  data: AdRow[]
  rules: Rules
  dateRange: { start: string; end: string }
  verdictFilter?: VerdictFilter
  selectedCampaigns?: Set<string>
  onCampaignToggle?: (campaignName: string) => void
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

function buildHierarchy(data: AdRow[], rules: Rules): HierarchyNode[] {
  const campaigns: Record<string, HierarchyNode> = {}
  
  data.forEach(row => {
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
    campaign.verdict = calculateVerdict(campaign.spend, campaign.roas, rules)
  })
  
  return Object.values(campaigns)
}

export function PerformanceTable({ 
  data, 
  rules, 
  dateRange, 
  verdictFilter = 'all',
  selectedCampaigns,
  onCampaignToggle
}: PerformanceTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  const [nameColWidth, setNameColWidth] = useState(280)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  
  const hierarchy = useMemo(() => buildHierarchy(data, rules), [data, rules])
  
  const filteredHierarchy = useMemo(() => {
    if (verdictFilter === 'all') return hierarchy
    
    return hierarchy
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
  }, [hierarchy, verdictFilter])
  
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
      const campaigns = new Set(filteredHierarchy.map(c => c.name))
      const adsets = new Set<string>()
      filteredHierarchy.forEach(c => {
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
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return
    const diff = e.clientX - startX.current
    const newWidth = Math.max(150, Math.min(500, startWidth.current + diff))
    setNameColWidth(newWidth)
  }

  const handleMouseUp = () => {
    resizing.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  const hasCheckboxes = selectedCampaigns && onCampaignToggle
  
  // Fixed pixel widths for data columns
  const colWidths = {
    checkbox: hasCheckboxes ? 28 : 0,
    name: nameColWidth,
    spend: 75,
    revenue: 75,
    roas: 60,
    purch: 55,
    cpc: 60,
    ctr: 60,
    cpa: 65,
    conv: 55,
    clicks: 60,
    impr: 70,
    verdict: 75,
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
    const indent = level === 'campaign' ? 0 : level === 'adset' ? 20 : 40
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
        style={{ height: level === 'ad' ? 36 : 44 }}
      >
        {/* Checkbox */}
        {hasCheckboxes && (
          <div 
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: colWidths.checkbox }}
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
          className="flex items-center gap-2 min-w-0 px-3 flex-shrink-0 relative"
          style={{ width: colWidths.name }}
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
            <span className={cn('text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded uppercase', labelBg)}>{label}</span>
            <span className={cn('truncate', textClass)} title={node.name}>{node.name}</span>
          </div>
          {/* Resize handle */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 active:bg-accent"
            onMouseDown={handleMouseDown}
          />
        </div>
        
        {/* Data columns - fixed width, never shift */}
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.spend }}>{formatCurrency(node.spend)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.revenue }}>{formatCurrency(node.revenue)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm font-semibold px-2" style={{ width: colWidths.roas }}>{formatROAS(node.roas)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.purch }}>{formatNumber(node.purchases)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.cpc }}>{formatMetric(node.cpc)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.ctr }}>{formatPercent(node.ctr)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.cpa }}>{formatMetric(node.cpa)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.conv }}>{formatPercent(node.convRate)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.clicks }}>{formatNumber(node.clicks)}</div>
        <div className="flex-shrink-0 text-right font-mono text-sm px-2" style={{ width: colWidths.impr }}>{formatNumber(node.impressions)}</div>
        <div className="flex-shrink-0 flex justify-center px-2" style={{ width: colWidths.verdict }}>
          <VerdictBadge verdict={node.verdict} size="sm" />
        </div>
      </div>
    )
  }

  const HeaderRow = () => (
    <div className="flex items-center bg-bg-dark text-[10px] text-zinc-500 uppercase tracking-wide border-b border-border" style={{ height: 40 }}>
      {hasCheckboxes && <div style={{ width: colWidths.checkbox }} />}
      <div className="px-3 relative flex-shrink-0" style={{ width: colWidths.name }}>
        Name
        <div 
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50"
          onMouseDown={handleMouseDown}
        />
      </div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.spend }}>Spend</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.revenue }}>Revenue</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.roas }}>ROAS</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.purch }}>Purch</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.cpc }}>CPC</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.ctr }}>CTR</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.cpa }}>CPA</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.conv }}>Conv%</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.clicks }}>Clicks</div>
      <div className="text-right px-2 flex-shrink-0" style={{ width: colWidths.impr }}>Impr</div>
      <div className="text-center px-2 flex-shrink-0" style={{ width: colWidths.verdict }}>Verdict</div>
    </div>
  )

  const TotalsRow = () => (
    <div className="flex items-center bg-zinc-900 border-b border-border font-medium" style={{ height: 44 }}>
      {hasCheckboxes && <div style={{ width: colWidths.checkbox }} />}
      <div className="px-3 text-white flex-shrink-0" style={{ width: colWidths.name }}>All Campaigns</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.spend }}>{formatCurrency(totals.spend)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.revenue }}>{formatCurrency(totals.revenue)}</div>
      <div className="text-right font-mono text-sm font-semibold px-2 flex-shrink-0" style={{ width: colWidths.roas }}>{formatROAS(totals.roas)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.purch }}>{formatNumber(totals.purchases)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.cpc }}>{formatMetric(totals.cpc)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.ctr }}>{formatPercent(totals.ctr)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.cpa }}>{formatMetric(totals.cpa)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.conv }}>{formatPercent(totals.convRate)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.clicks }}>{formatNumber(totals.clicks)}</div>
      <div className="text-right font-mono text-sm px-2 flex-shrink-0" style={{ width: colWidths.impr }}>{formatNumber(totals.impressions)}</div>
      <div className="flex justify-center px-2 flex-shrink-0" style={{ width: colWidths.verdict }}>
        <VerdictBadge verdict={totals.verdict} size="sm" />
      </div>
    </div>
  )
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Campaign Performance</h2>
          <span className="text-sm text-zinc-500">{filteredHierarchy.length} campaigns</span>
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
        <div style={{ minWidth: colWidths.checkbox + colWidths.name + colWidths.spend + colWidths.revenue + colWidths.roas + colWidths.purch + colWidths.cpc + colWidths.ctr + colWidths.cpa + colWidths.conv + colWidths.clicks + colWidths.impr + colWidths.verdict }}>
          <HeaderRow />
          <TotalsRow />
          
          <div className="max-h-[calc(100vh-500px)] overflow-y-auto">
            {filteredHierarchy.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-500">
                No ads match the selected filter
              </div>
            ) : (
              filteredHierarchy.map(campaign => {
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
    </div>
  )
}
