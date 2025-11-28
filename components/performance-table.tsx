'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react'
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

type PerformanceTableProps = {
  data: AdRow[]
  rules: Rules
  dateRange: { start: string; end: string }
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
  verdict: Verdict
  children?: HierarchyNode[]
}

function buildHierarchy(data: AdRow[], rules: Rules): HierarchyNode[] {
  const campaigns: Record<string, HierarchyNode> = {}
  
  data.forEach(row => {
    // Get or create campaign
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
        verdict: 'learn',
        children: []
      }
    }
    const campaign = campaigns[row.campaign_name]
    
    // Get or create adset
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
        verdict: 'learn',
        children: []
      }
      campaign.children?.push(adset)
    }
    
    // Add ad
    const ad: HierarchyNode = {
      name: row.ad_name,
      type: 'ad',
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
      verdict: calculateVerdict(row.spend, row.spend > 0 ? row.revenue / row.spend : 0, rules)
    }
    adset.children?.push(ad)
    
    // Roll up to adset
    adset.impressions += row.impressions
    adset.clicks += row.clicks
    adset.spend += row.spend
    adset.purchases += row.purchases
    adset.revenue += row.revenue
  })
  
  // Calculate adset and campaign rollups
  Object.values(campaigns).forEach(campaign => {
    campaign.children?.forEach(adset => {
      adset.roas = adset.spend > 0 ? adset.revenue / adset.spend : 0
      adset.verdict = calculateVerdict(adset.spend, adset.roas, rules)
      
      campaign.impressions += adset.impressions
      campaign.clicks += adset.clicks
      campaign.spend += adset.spend
      campaign.purchases += adset.purchases
      campaign.revenue += adset.revenue
    })
    
    campaign.roas = campaign.spend > 0 ? campaign.revenue / campaign.spend : 0
    campaign.verdict = calculateVerdict(campaign.spend, campaign.roas, rules)
  })
  
  return Object.values(campaigns)
}

export function PerformanceTable({ data, rules, dateRange }: PerformanceTableProps) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)
  
  const hierarchy = useMemo(() => buildHierarchy(data, rules), [data, rules])
  
  const totals = useMemo(() => {
    const t = {
      impressions: 0,
      clicks: 0,
      spend: 0,
      purchases: 0,
      revenue: 0,
      roas: 0,
      verdict: 'learn' as Verdict
    }
    hierarchy.forEach(c => {
      t.impressions += c.impressions
      t.clicks += c.clicks
      t.spend += c.spend
      t.purchases += c.purchases
      t.revenue += c.revenue
    })
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0
    t.verdict = calculateVerdict(t.spend, t.roas, rules)
    return t
  }, [hierarchy, rules])
  
  const toggleCampaign = (name: string) => {
    const newSet = new Set(expandedCampaigns)
    if (newSet.has(name)) {
      newSet.delete(name)
      // Also collapse all adsets in this campaign
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
      const campaigns = new Set(hierarchy.map(c => c.name))
      const adsets = new Set<string>()
      hierarchy.forEach(c => {
        c.children?.forEach(a => {
          adsets.add(`${c.name}::${a.name}`)
        })
      })
      setExpandedCampaigns(campaigns)
      setExpandedAdsets(adsets)
    }
    setAllExpanded(!allExpanded)
  }
  
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Campaign Performance</h2>
          <span className="text-sm text-zinc-500">{hierarchy.length} campaigns</span>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs text-zinc-400 hover:text-white bg-bg-dark border border-border px-3 py-1.5 rounded-md transition-colors"
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
      
      {/* Table Header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-bg-dark text-xs text-zinc-500 uppercase tracking-wide border-b border-border">
        <div>Name</div>
        <div className="text-right">Impr</div>
        <div className="text-right">Clicks</div>
        <div className="text-right">Spend</div>
        <div className="text-right">Purch</div>
        <div className="text-right">Revenue</div>
        <div className="text-right">ROAS</div>
        <div className="text-center">Verdict</div>
      </div>
      
      {/* Account Total */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-zinc-900 border-b border-border font-medium">
        <div className="flex items-center gap-2">
          <span className="text-white">All Campaigns</span>
        </div>
        <div className="text-right font-mono text-sm">{formatNumber(totals.impressions)}</div>
        <div className="text-right font-mono text-sm">{formatNumber(totals.clicks)}</div>
        <div className="text-right font-mono text-sm">{formatCurrency(totals.spend)}</div>
        <div className="text-right font-mono text-sm">{formatNumber(totals.purchases)}</div>
        <div className="text-right font-mono text-sm">{formatCurrency(totals.revenue)}</div>
        <div className="text-right font-mono text-sm font-semibold">{formatROAS(totals.roas)}</div>
        <div className="text-center">
          <VerdictBadge verdict={totals.verdict} size="sm" />
        </div>
      </div>
      
      {/* Rows */}
      <div className="max-h-[500px] overflow-y-auto">
        {hierarchy.map(campaign => (
          <div key={campaign.name}>
            {/* Campaign Row */}
            <div 
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-hierarchy-campaign-bg hover:bg-blue-500/20 border-b border-border cursor-pointer transition-colors"
              onClick={() => toggleCampaign(campaign.name)}
            >
              <div className="flex items-center gap-2 font-medium text-white">
                <button className={cn(
                  'w-5 h-5 flex items-center justify-center rounded border transition-colors',
                  expandedCampaigns.has(campaign.name)
                    ? 'bg-accent border-accent text-white'
                    : 'border-border text-zinc-500 hover:border-zinc-500'
                )}>
                  {expandedCampaigns.has(campaign.name) ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </button>
                <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded uppercase">Camp</span>
                {campaign.name}
              </div>
              <div className="text-right font-mono text-sm">{formatNumber(campaign.impressions)}</div>
              <div className="text-right font-mono text-sm">{formatNumber(campaign.clicks)}</div>
              <div className="text-right font-mono text-sm">{formatCurrency(campaign.spend)}</div>
              <div className="text-right font-mono text-sm">{formatNumber(campaign.purchases)}</div>
              <div className="text-right font-mono text-sm">{formatCurrency(campaign.revenue)}</div>
              <div className="text-right font-mono text-sm font-semibold">{formatROAS(campaign.roas)}</div>
              <div className="text-center">
                <VerdictBadge verdict={campaign.verdict} size="sm" />
              </div>
            </div>
            
            {/* Adsets */}
            {expandedCampaigns.has(campaign.name) && campaign.children?.map(adset => (
              <div key={`${campaign.name}::${adset.name}`}>
                {/* Adset Row */}
                <div 
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-2.5 pl-10 bg-hierarchy-adset-bg hover:bg-purple-500/15 border-b border-border cursor-pointer transition-colors animate-slide-in"
                  onClick={() => toggleAdset(campaign.name, adset.name)}
                >
                  <div className="flex items-center gap-2 text-purple-200">
                    <button className={cn(
                      'w-4 h-4 flex items-center justify-center rounded border transition-colors',
                      expandedAdsets.has(`${campaign.name}::${adset.name}`)
                        ? 'bg-purple-500 border-purple-500 text-white'
                        : 'border-purple-500/30 text-purple-400 hover:border-purple-400'
                    )}>
                      {expandedAdsets.has(`${campaign.name}::${adset.name}`) ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                    </button>
                    <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded uppercase">Set</span>
                    {adset.name}
                  </div>
                  <div className="text-right font-mono text-sm text-purple-200">{formatNumber(adset.impressions)}</div>
                  <div className="text-right font-mono text-sm text-purple-200">{formatNumber(adset.clicks)}</div>
                  <div className="text-right font-mono text-sm text-purple-200">{formatCurrency(adset.spend)}</div>
                  <div className="text-right font-mono text-sm text-purple-200">{formatNumber(adset.purchases)}</div>
                  <div className="text-right font-mono text-sm text-purple-200">{formatCurrency(adset.revenue)}</div>
                  <div className="text-right font-mono text-sm font-semibold text-purple-200">{formatROAS(adset.roas)}</div>
                  <div className="text-center">
                    <VerdictBadge verdict={adset.verdict} size="sm" />
                  </div>
                </div>
                
                {/* Ads */}
                {expandedAdsets.has(`${campaign.name}::${adset.name}`) && adset.children?.map(ad => (
                  <div 
                    key={`${campaign.name}::${adset.name}::${ad.name}`}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-2 pl-16 bg-bg-card hover:bg-bg-hover border-b border-border transition-colors animate-slide-in"
                  >
                    <div className="flex items-center gap-2 text-zinc-400">
                      <span className="text-[10px] bg-bg-dark text-zinc-500 px-1.5 py-0.5 rounded uppercase">Ad</span>
                      {ad.name}
                    </div>
                    <div className="text-right font-mono text-sm text-zinc-400">{formatNumber(ad.impressions)}</div>
                    <div className="text-right font-mono text-sm text-zinc-400">{formatNumber(ad.clicks)}</div>
                    <div className="text-right font-mono text-sm text-zinc-400">{formatCurrency(ad.spend)}</div>
                    <div className="text-right font-mono text-sm text-zinc-400">{formatNumber(ad.purchases)}</div>
                    <div className="text-right font-mono text-sm text-zinc-400">{formatCurrency(ad.revenue)}</div>
                    <div className="text-right font-mono text-sm font-semibold text-zinc-300">{formatROAS(ad.roas)}</div>
                    <div className="text-center">
                      <VerdictBadge verdict={ad.verdict} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
