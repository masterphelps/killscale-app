'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { 
  ChevronRight, 
  ChevronDown,
  TrendingUp, 
  TrendingDown, 
  Minus,
  Zap,
  Target,
  DollarSign,
  Eye,
  MousePointer,
  ShoppingCart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Layers,
  Search,
  Download,
  RefreshCw,
  Calendar,
  GitCompare,
  PieChart,
  Activity,
  Filter,
  ChevronLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb
} from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  Legend,
  ComposedChart,
  Treemap,
  PieChart as RechartsPie,
  Pie,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type AdData = {
  campaign_name: string
  adset_name: string
  ad_name: string
  date_start: string
  date_end: string
  impressions: number
  clicks: number
  spend: number
  purchases: number
  revenue: number
  status?: string | null
  adset_status?: string | null
  campaign_status?: string | null
}

type HierarchyLevel = 'account' | 'campaign' | 'adset' | 'ad'

type SelectionPath = {
  campaign?: string
  adset?: string
  ad?: string
}

type AggregatedData = {
  name: string
  spend: number
  revenue: number
  roas: number
  impressions: number
  clicks: number
  purchases: number
  ctr: number
  cpc: number
  cpa: number
  convRate: number
  children?: AggregatedData[]
  status?: string | null
  hasChildrenPaused?: boolean
}

// Color scale for ROAS
const getROASColor = (roas: number) => {
  if (roas >= 3) return '#22c55e' // green - scale
  if (roas >= 2) return '#84cc16' // lime
  if (roas >= 1.5) return '#eab308' // yellow - watch
  if (roas >= 1) return '#f97316' // orange
  return '#ef4444' // red - kill
}

const getROASBgColor = (roas: number) => {
  if (roas >= 3) return 'rgba(34, 197, 94, 0.15)'
  if (roas >= 2) return 'rgba(132, 204, 22, 0.15)'
  if (roas >= 1.5) return 'rgba(234, 179, 8, 0.15)'
  if (roas >= 1) return 'rgba(249, 115, 22, 0.15)'
  return 'rgba(239, 68, 68, 0.15)'
}

// Trend indicator
const TrendIndicator = ({ current, previous }: { current: number, previous: number }) => {
  if (previous === 0) return <span className="text-zinc-500">—</span>
  
  const change = ((current - previous) / previous) * 100
  const isPositive = change > 0
  const isNeutral = Math.abs(change) < 1
  
  if (isNeutral) {
    return (
      <span className="flex items-center gap-1 text-zinc-500 text-sm">
        <Minus className="w-3 h-3" />
        <span>0%</span>
      </span>
    )
  }
  
  return (
    <span className={cn(
      'flex items-center gap-1 text-sm font-medium',
      isPositive ? 'text-green-400' : 'text-red-400'
    )}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      <span>{isPositive ? '+' : ''}{change.toFixed(1)}%</span>
    </span>
  )
}

// Custom Treemap Content
const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, spend, roas, onClick } = props
  
  if (width < 50 || height < 30) return null
  
  const color = getROASColor(roas || 0)
  const bgColor = getROASBgColor(roas || 0)
  
  // Calculate text to display
  const maxChars = Math.floor(width / 9)
  const displayName = name?.length > maxChars ? name.substring(0, maxChars) + '...' : name
  const statsText = `${roas?.toFixed(1)}x · ${formatCurrency(spend)}`
  
  return (
    <g>
      <rect
        x={x + 2}
        y={y + 2}
        width={width - 4}
        height={height - 4}
        fill={bgColor}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.3}
        rx={6}
        className="cursor-pointer"
        onClick={() => onClick?.(name)}
      />
      {/* Hover overlay */}
      <rect
        x={x + 2}
        y={y + 2}
        width={width - 4}
        height={height - 4}
        fill="transparent"
        rx={6}
        className="cursor-pointer hover:fill-white/5 transition-all"
        onClick={() => onClick?.(name)}
      />
      {width > 80 && height > 50 && (
        <>
          {/* Text background pill for readability */}
          <rect
            x={x + 8}
            y={y + height / 2 - 20}
            width={width - 16}
            height={40}
            fill="rgba(0,0,0,0.6)"
            rx={6}
            className="pointer-events-none"
          />
          {/* Campaign name - no stroke, just solid fill */}
          <text
            x={x + width / 2}
            y={y + height / 2 - 4}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={11}
            fontWeight={600}
            className="pointer-events-none"
          >
            {displayName}
          </text>
          {/* Stats line */}
          <text
            x={x + width / 2}
            y={y + height / 2 + 12}
            textAnchor="middle"
            fill={color}
            fontSize={13}
            fontWeight={700}
            className="pointer-events-none"
          >
            {statsText}
          </text>
        </>
      )}
    </g>
  )
}

// Insight Card component
const InsightCard = ({ 
  icon: Icon, 
  title, 
  value, 
  subtitle,
  trend,
  color = 'accent'
}: { 
  icon: any
  title: string
  value: string
  subtitle?: string
  trend?: { current: number, previous: number }
  color?: string
}) => {
  const colorClasses: Record<string, string> = {
    accent: 'text-accent bg-accent/10 border-accent/20',
    green: 'text-green-400 bg-green-400/10 border-green-400/20',
    red: 'text-red-400 bg-red-400/10 border-red-400/20',
    yellow: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    purple: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  }
  
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center border', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && <TrendIndicator current={trend.current} previous={trend.previous} />}
      </div>
      <div className="text-2xl font-bold mb-0.5">{value}</div>
      <div className="text-sm text-zinc-500">{title}</div>
      {subtitle && <div className="text-xs text-zinc-600 mt-1">{subtitle}</div>}
    </div>
  )
}

// Hierarchy Navigator Item
const NavItem = ({ 
  name, 
  level, 
  isSelected, 
  isExpanded, 
  hasChildren,
  metrics,
  onClick,
  onExpand,
  status,
  hasChildrenPaused
}: {
  name: string
  level: HierarchyLevel
  isSelected: boolean
  isExpanded: boolean
  hasChildren: boolean
  metrics: { spend: number, roas: number }
  onClick: () => void
  onExpand: () => void
  status?: string | null
  hasChildrenPaused?: boolean
}) => {
  const indent = level === 'campaign' ? 0 : level === 'adset' ? 16 : 32
  
  const levelColors: Record<HierarchyLevel, string> = {
    account: 'bg-accent text-white',
    campaign: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    adset: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    ad: 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30'
  }
  
  const levelLabels: Record<HierarchyLevel, string> = {
    account: 'ACC',
    campaign: 'C',
    adset: 'AS',
    ad: 'AD'
  }
  
  const isPaused = status && status !== 'ACTIVE'
  
  return (
    <div 
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all',
        isSelected 
          ? 'bg-accent/20 border border-accent/30' 
          : 'hover:bg-zinc-800/50 border border-transparent'
      )}
      style={{ marginLeft: indent }}
      onClick={onClick}
    >
      {hasChildren && (
        <button 
          onClick={(e) => { e.stopPropagation(); onExpand(); }}
          className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-white"
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      )}
      {!hasChildren && <div className="w-4" />}
      
      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', levelColors[level])}>
        {levelLabels[level]}
      </span>
      
      <span className={cn(
        'flex-1 text-sm truncate',
        isSelected ? 'text-white' : 'text-zinc-300',
        isPaused && 'opacity-50'
      )}>
        {name}
      </span>
      
      {/* Paused indicator - filled for self, outline for children */}
      {isPaused ? (
        <span className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
          <span>PAUSED</span>
        </span>
      ) : hasChildrenPaused ? (
        <span className="flex items-center text-zinc-500" title="Contains paused items">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </span>
      ) : null}
      
      <span className={cn(
        'text-xs font-medium',
        metrics.roas >= 2 ? 'text-green-400' : metrics.roas >= 1 ? 'text-yellow-400' : 'text-red-400'
      )}>
        {metrics.roas.toFixed(1)}x
      </span>
    </div>
  )
}

export default function TrendsPage() {
  const [data, setData] = useState<AdData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selection, setSelection] = useState<SelectionPath>({})
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'overview' | 'compare' | 'funnel' | 'scatter'>('overview')
  const [compareMode, setCompareMode] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<'roas' | 'spend' | 'revenue' | 'ctr'>('roas')
  const { user } = useAuth()
  
  useEffect(() => {
    if (user) loadData()
  }, [user])
  
  const loadData = async () => {
    if (!user) return
    setIsLoading(true)
    
    const { data: adData, error } = await supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .order('date_start', { ascending: true })
    
    if (adData && !error) {
      setData(adData.map(row => ({
        campaign_name: row.campaign_name,
        adset_name: row.adset_name,
        ad_name: row.ad_name,
        date_start: row.date_start,
        date_end: row.date_end,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: parseFloat(row.spend),
        purchases: row.purchases,
        revenue: parseFloat(row.revenue),
        status: row.status,
        adset_status: row.adset_status,
        campaign_status: row.campaign_status
      })))
    }
    setIsLoading(false)
  }
  
  // Build hierarchy
  const hierarchy = useMemo(() => {
    const campaigns: Record<string, AggregatedData> = {}
    
    data.forEach(row => {
      // Campaign level - use campaign_status if available
      if (!campaigns[row.campaign_name]) {
        campaigns[row.campaign_name] = {
          name: row.campaign_name,
          spend: 0, revenue: 0, roas: 0,
          impressions: 0, clicks: 0, purchases: 0,
          ctr: 0, cpc: 0, cpa: 0, convRate: 0,
          children: [],
          status: (row as any).campaign_status || null // Use campaign's own status
        }
      }
      const campaign = campaigns[row.campaign_name]
      
      // AdSet level - use adset_status if available, otherwise inherit from row
      let adset = campaign.children?.find(a => a.name === row.adset_name)
      if (!adset) {
        adset = {
          name: row.adset_name,
          spend: 0, revenue: 0, roas: 0,
          impressions: 0, clicks: 0, purchases: 0,
          ctr: 0, cpc: 0, cpa: 0, convRate: 0,
          children: [],
          status: (row as any).adset_status || null // Use adset's own status
        }
        campaign.children?.push(adset)
      }
      
      // Ad level - use ad's status
      let ad = adset.children?.find(a => a.name === row.ad_name)
      if (!ad) {
        ad = {
          name: row.ad_name,
          spend: 0, revenue: 0, roas: 0,
          impressions: 0, clicks: 0, purchases: 0,
          ctr: 0, cpc: 0, cpa: 0, convRate: 0,
          status: row.status // Ad's effective status
        }
        adset.children?.push(ad)
      }
      
      // Aggregate
      ad.spend += row.spend
      ad.revenue += row.revenue
      ad.impressions += row.impressions
      ad.clicks += row.clicks
      ad.purchases += row.purchases
      
      adset.spend += row.spend
      adset.revenue += row.revenue
      adset.impressions += row.impressions
      adset.clicks += row.clicks
      adset.purchases += row.purchases
      
      campaign.spend += row.spend
      campaign.revenue += row.revenue
      campaign.impressions += row.impressions
      campaign.clicks += row.clicks
      campaign.purchases += row.purchases
    })
    
    // Calculate derived metrics and hasChildrenPaused
    const calcMetrics = (node: AggregatedData) => {
      node.roas = node.spend > 0 ? node.revenue / node.spend : 0
      node.ctr = node.impressions > 0 ? (node.clicks / node.impressions) * 100 : 0
      node.cpc = node.clicks > 0 ? node.spend / node.clicks : 0
      node.cpa = node.purchases > 0 ? node.spend / node.purchases : 0
      node.convRate = node.clicks > 0 ? (node.purchases / node.clicks) * 100 : 0
      
      // Recursively process children first
      node.children?.forEach(calcMetrics)
      
      // Check if any children are paused (only if this node itself is active or has no status)
      const selfIsPaused = node.status && node.status !== 'ACTIVE'
      if (!selfIsPaused && node.children && node.children.length > 0) {
        node.hasChildrenPaused = node.children.some(child => {
          const childIsPaused = child.status && child.status !== 'ACTIVE'
          return childIsPaused || child.hasChildrenPaused
        })
      }
    }
    
    Object.values(campaigns).forEach(calcMetrics)
    
    return Object.values(campaigns).sort((a, b) => b.spend - a.spend)
  }, [data])
  
  // Current selection level
  const currentLevel: HierarchyLevel = selection.ad ? 'ad' 
    : selection.adset ? 'adset' 
    : selection.campaign ? 'campaign' 
    : 'account'
  
  // Get selected entity data
  const selectedData = useMemo(() => {
    if (selection.ad) {
      const campaign = hierarchy.find(c => c.name === selection.campaign)
      const adset = campaign?.children?.find(a => a.name === selection.adset)
      return adset?.children?.find(ad => ad.name === selection.ad)
    }
    if (selection.adset) {
      const campaign = hierarchy.find(c => c.name === selection.campaign)
      return campaign?.children?.find(a => a.name === selection.adset)
    }
    if (selection.campaign) {
      return hierarchy.find(c => c.name === selection.campaign)
    }
    return null
  }, [hierarchy, selection])
  
  // Account totals
  const accountTotals = useMemo(() => {
    const totals = hierarchy.reduce((acc, campaign) => ({
      spend: acc.spend + campaign.spend,
      revenue: acc.revenue + campaign.revenue,
      impressions: acc.impressions + campaign.impressions,
      clicks: acc.clicks + campaign.clicks,
      purchases: acc.purchases + campaign.purchases,
      roas: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      convRate: 0
    }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0, roas: 0, ctr: 0, cpc: 0, cpa: 0, convRate: 0 })
    
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
    totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
    totals.cpa = totals.purchases > 0 ? totals.spend / totals.purchases : 0
    totals.convRate = totals.clicks > 0 ? (totals.purchases / totals.clicks) * 100 : 0
    
    return totals
  }, [hierarchy])
  
  // Time series data for charts
  const timeSeriesData = useMemo(() => {
    const dateMap: Record<string, { date: string, spend: number, revenue: number, roas: number }> = {}
    
    const filteredData = selection.campaign
      ? data.filter(row => {
          if (selection.ad) return row.ad_name === selection.ad
          if (selection.adset) return row.adset_name === selection.adset
          return row.campaign_name === selection.campaign
        })
      : data
    
    filteredData.forEach(row => {
      const date = row.date_start
      if (!dateMap[date]) {
        dateMap[date] = { date, spend: 0, revenue: 0, roas: 0 }
      }
      dateMap[date].spend += row.spend
      dateMap[date].revenue += row.revenue
    })
    
    return Object.values(dateMap)
      .map(d => ({ ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [data, selection])
  
  // Treemap data for account view
  const treemapData = useMemo(() => {
    return hierarchy.map(campaign => ({
      name: campaign.name,
      size: campaign.spend,
      spend: campaign.spend,
      roas: campaign.roas
    }))
  }, [hierarchy])
  
  // Generate insights
  const insights = useMemo(() => {
    const results: { type: 'success' | 'warning' | 'info', message: string }[] = []
    
    if (hierarchy.length > 0) {
      // Best performer
      const best = [...hierarchy].sort((a, b) => b.roas - a.roas)[0]
      if (best && best.roas > 0) {
        results.push({
          type: 'success',
          message: `🔥 Top performer: "${best.name}" with ${best.roas.toFixed(2)}x ROAS`
        })
      }
      
      // Worst performer with significant spend
      const worst = [...hierarchy].filter(c => c.spend > 50).sort((a, b) => a.roas - b.roas)[0]
      if (worst && worst.roas < 1.5) {
        results.push({
          type: 'warning',
          message: `⚠️ "${worst.name}" has ${worst.roas.toFixed(2)}x ROAS - consider optimizing`
        })
      }
      
      // High spender
      const topSpender = [...hierarchy].sort((a, b) => b.spend - a.spend)[0]
      if (topSpender && accountTotals.spend > 0) {
        const spendPercent = (topSpender.spend / accountTotals.spend) * 100
        if (spendPercent > 40) {
          results.push({
            type: 'info',
            message: `💰 "${topSpender.name}" represents ${spendPercent.toFixed(0)}% of total spend`
          })
        }
      }
    }
    
    return results
  }, [hierarchy, accountTotals])
  
  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const parts: { label: string, onClick: () => void }[] = [
      { label: 'Account', onClick: () => setSelection({}) }
    ]
    
    if (selection.campaign) {
      parts.push({ 
        label: selection.campaign, 
        onClick: () => setSelection({ campaign: selection.campaign }) 
      })
    }
    if (selection.adset) {
      parts.push({ 
        label: selection.adset, 
        onClick: () => setSelection({ campaign: selection.campaign, adset: selection.adset }) 
      })
    }
    if (selection.ad) {
      parts.push({ 
        label: selection.ad, 
        onClick: () => {} 
      })
    }
    
    return parts
  }, [selection])
  
  // Filter hierarchy by search
  const filteredHierarchy = useMemo(() => {
    if (!searchQuery) return hierarchy
    
    const query = searchQuery.toLowerCase()
    return hierarchy.filter(campaign => {
      if (campaign.name.toLowerCase().includes(query)) return true
      return campaign.children?.some(adset => {
        if (adset.name.toLowerCase().includes(query)) return true
        return adset.children?.some(ad => ad.name.toLowerCase().includes(query))
      })
    })
  }, [hierarchy, searchQuery])
  
  const displayData = selectedData || { 
    name: 'Account', 
    ...accountTotals 
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
      </div>
    )
  }
  
  if (data.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-bg-card rounded-full flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
        <p className="text-zinc-500">Sync your Meta account or upload a CSV to explore trends</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Trends Explorer</h1>
          <p className="text-zinc-500">Drill down into your performance data</p>
        </div>
      </div>
      
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        {breadcrumb.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="w-4 h-4 text-zinc-600" />}
            <button 
              onClick={item.onClick}
              className={cn(
                'px-2 py-1 rounded transition-colors',
                index === breadcrumb.length - 1 
                  ? 'bg-accent/20 text-accent font-medium' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              {item.label.length > 30 ? item.label.substring(0, 30) + '...' : item.label}
            </button>
          </div>
        ))}
      </div>

      {/* Main Layout */}
      <div className="flex gap-6">
        {/* Left Sidebar - Hierarchy Navigator */}
        <div className="w-[380px] flex-shrink-0">
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden sticky top-6">
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search campaigns, ad sets, ads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-bg-dark border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            
            {/* Hierarchy */}
            <div className="p-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {/* Account Level */}
              <div 
                className={cn(
                  'flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all mb-2',
                  !selection.campaign 
                    ? 'bg-accent/20 border border-accent/30' 
                    : 'hover:bg-zinc-800/50 border border-transparent'
                )}
                onClick={() => setSelection({})}
              >
                <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="flex-1 font-medium">All Campaigns</span>
                <span className={cn(
                  'text-xs font-medium',
                  accountTotals.roas >= 2 ? 'text-green-400' : accountTotals.roas >= 1 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {accountTotals.roas.toFixed(1)}x
                </span>
              </div>
              
              <div className="h-px bg-border mb-2" />
              
              {/* Campaigns */}
              {filteredHierarchy.map(campaign => (
                <div key={campaign.name}>
                  <NavItem
                    name={campaign.name}
                    level="campaign"
                    isSelected={selection.campaign === campaign.name && !selection.adset}
                    isExpanded={expandedCampaigns.has(campaign.name)}
                    hasChildren={(campaign.children?.length || 0) > 0}
                    metrics={{ spend: campaign.spend, roas: campaign.roas }}
                    status={campaign.status}
                    hasChildrenPaused={campaign.hasChildrenPaused}
                    onClick={() => setSelection({ campaign: campaign.name })}
                    onExpand={() => {
                      const newSet = new Set(expandedCampaigns)
                      if (newSet.has(campaign.name)) {
                        newSet.delete(campaign.name)
                      } else {
                        newSet.add(campaign.name)
                      }
                      setExpandedCampaigns(newSet)
                    }}
                  />
                  
                  {expandedCampaigns.has(campaign.name) && campaign.children?.map(adset => (
                    <div key={adset.name}>
                      <NavItem
                        name={adset.name}
                        level="adset"
                        isSelected={selection.adset === adset.name && !selection.ad}
                        isExpanded={expandedAdsets.has(`${campaign.name}-${adset.name}`)}
                        hasChildren={(adset.children?.length || 0) > 0}
                        metrics={{ spend: adset.spend, roas: adset.roas }}
                        status={adset.status}
                        hasChildrenPaused={adset.hasChildrenPaused}
                        onClick={() => setSelection({ campaign: campaign.name, adset: adset.name })}
                        onExpand={() => {
                          const key = `${campaign.name}-${adset.name}`
                          const newSet = new Set(expandedAdsets)
                          if (newSet.has(key)) {
                            newSet.delete(key)
                          } else {
                            newSet.add(key)
                          }
                          setExpandedAdsets(newSet)
                        }}
                      />
                      
                      {expandedAdsets.has(`${campaign.name}-${adset.name}`) && adset.children?.map(ad => (
                        <NavItem
                          key={ad.name}
                          name={ad.name}
                          level="ad"
                          isSelected={selection.ad === ad.name}
                          isExpanded={false}
                          hasChildren={false}
                          metrics={{ spend: ad.spend, roas: ad.roas }}
                          status={ad.status}
                          onClick={() => setSelection({ campaign: campaign.name, adset: adset.name, ad: ad.name })}
                          onExpand={() => {}}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 space-y-6">
          {/* Insight Cards */}
          <div className="grid grid-cols-5 gap-4">
            <InsightCard
              icon={DollarSign}
              title="Total Spend"
              value={formatCurrency(displayData.spend)}
              color="purple"
            />
            <InsightCard
              icon={TrendingUp}
              title="Revenue"
              value={formatCurrency(displayData.revenue)}
              color="green"
            />
            <InsightCard
              icon={Target}
              title="ROAS"
              value={`${displayData.roas.toFixed(2)}x`}
              color={displayData.roas >= 2 ? 'green' : displayData.roas >= 1 ? 'yellow' : 'red'}
            />
            <InsightCard
              icon={ShoppingCart}
              title="Purchases"
              value={formatNumber(displayData.purchases)}
              color="accent"
            />
            <InsightCard
              icon={MousePointer}
              title="CTR"
              value={`${displayData.ctr.toFixed(2)}%`}
              color="accent"
            />
          </div>
          
          {/* AI Insights */}
          {insights.length > 0 && currentLevel === 'account' && (
            <div className="bg-gradient-to-r from-accent/10 via-purple-500/10 to-pink-500/10 border border-accent/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="font-medium text-sm">AI Insights</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-zinc-300 bg-black/20 rounded-lg p-3">
                    <span className="text-lg">{insight.type === 'success' ? '🔥' : insight.type === 'warning' ? '⚠️' : '💡'}</span>
                    <span>{insight.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* View Mode Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              <button
                onClick={() => setViewMode('overview')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  viewMode === 'overview' 
                    ? 'bg-accent text-white' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <BarChart3 className="w-4 h-4" />
                Overview
              </button>
              <button
                onClick={() => setViewMode('funnel')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  viewMode === 'funnel' 
                    ? 'bg-accent text-white' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <Filter className="w-4 h-4" />
                Funnel
              </button>
              <button
                onClick={() => setViewMode('scatter')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  viewMode === 'scatter' 
                    ? 'bg-accent text-white' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <Activity className="w-4 h-4" />
                Spend vs ROAS
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-all">
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
          
          {/* Main Visualization */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold mb-4">
              {viewMode === 'overview' 
                ? (currentLevel === 'account' ? 'Campaign Overview' : 'Performance Over Time')
                : viewMode === 'funnel'
                  ? 'Conversion Funnel'
                  : 'Spend vs ROAS Analysis'
              }
            </h3>
            
            {viewMode === 'funnel' ? (
              /* Funnel Visualization */
              <div className="h-96">
                <div className="grid grid-cols-5 gap-4 h-full items-end">
                  {[
                    { label: 'Impressions', value: displayData.impressions, color: 'bg-blue-500' },
                    { label: 'Clicks', value: displayData.clicks, color: 'bg-purple-500' },
                    { label: 'Purchases', value: displayData.purchases, color: 'bg-green-500' },
                  ].map((stage, i, arr) => {
                    const maxVal = arr[0].value || 1
                    const height = Math.max(10, (stage.value / maxVal) * 100)
                    const rate = i > 0 ? ((stage.value / (arr[i-1].value || 1)) * 100).toFixed(2) : '100'
                    return (
                      <div key={stage.label} className="flex flex-col items-center gap-2">
                        <div className="text-sm text-zinc-400">{stage.label}</div>
                        <div className="text-lg font-bold">{formatNumber(stage.value)}</div>
                        <div 
                          className={cn('w-full rounded-t-lg transition-all', stage.color)}
                          style={{ height: `${height}%`, minHeight: 40 }}
                        />
                        {i > 0 && (
                          <div className="text-xs text-zinc-500">{rate}% rate</div>
                        )}
                      </div>
                    )
                  })}
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-sm text-zinc-400">Revenue</div>
                    <div className="text-lg font-bold text-green-400">{formatCurrency(displayData.revenue)}</div>
                    <div 
                      className="w-full rounded-t-lg bg-green-500/50"
                      style={{ height: '60%', minHeight: 40 }}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-sm text-zinc-400">ROAS</div>
                    <div className={cn(
                      'text-2xl font-bold',
                      displayData.roas >= 2 ? 'text-green-400' : displayData.roas >= 1 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {displayData.roas.toFixed(2)}x
                    </div>
                    <div 
                      className={cn(
                        'w-full rounded-t-lg',
                        displayData.roas >= 2 ? 'bg-green-500' : displayData.roas >= 1 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ height: `${Math.min(100, displayData.roas * 25)}%`, minHeight: 40 }}
                    />
                  </div>
                </div>
              </div>
            ) : viewMode === 'scatter' ? (
              /* Scatter Plot - Spend vs ROAS */
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      type="number" 
                      dataKey="spend" 
                      name="Spend"
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickFormatter={(v) => `$${v}`}
                      label={{ value: 'Spend', position: 'bottom', fill: '#71717a', fontSize: 12 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="roas" 
                      name="ROAS"
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickFormatter={(v) => `${v.toFixed(1)}x`}
                      label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        color: '#e4e4e7'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'roas') return [`${value.toFixed(2)}x`, 'ROAS']
                        if (name === 'spend') return [formatCurrency(value), 'Spend']
                        return [value, name]
                      }}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Scatter 
                      name="Campaigns" 
                      data={hierarchy.map(c => ({ name: c.name, spend: c.spend, roas: c.roas, revenue: c.revenue }))}
                      fill="#8b5cf6"
                    >
                      {hierarchy.map((entry, index) => (
                        <Cell 
                          key={index} 
                          fill={getROASColor(entry.roas)}
                          cursor="pointer"
                          onClick={() => setSelection({ campaign: entry.name })}
                        />
                      ))}
                    </Scatter>
                    {/* Reference line at ROAS 1.0 */}
                    <Line 
                      type="monotone" 
                      dataKey={() => 1} 
                      stroke="#ef4444" 
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-4 text-xs text-zinc-500">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>ROAS ≥ 2x (Scale)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>ROAS 1-2x (Watch)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>ROAS &lt; 1x (Kill)</span>
                  </div>
                </div>
              </div>
            ) : currentLevel === 'account' ? (
              /* Campaign breakdown for account level - Pie + Bar combo */
              <div className="grid grid-cols-2 gap-6">
                {/* Spend Distribution Pie Chart */}
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">Spend by Campaign</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie
                          data={hierarchy.map(c => ({ name: c.name, value: c.spend, roas: c.roas }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          onClick={(data) => setSelection({ campaign: data.name })}
                          style={{ cursor: 'pointer' }}
                        >
                          {hierarchy.map((entry, index) => (
                            <Cell key={index} fill={getROASColor(entry.roas)} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #3f3f46',
                            borderRadius: 8,
                            color: '#e4e4e7'
                          }}
                          formatter={(value: number, name: string, props: any) => [
                            `${formatCurrency(value)} (${props.payload.roas.toFixed(2)}x ROAS)`,
                            props.payload.name
                          ]}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center text-sm text-zinc-500 mt-2">Click a segment to drill down</div>
                </div>
                
                {/* ROAS Ranking Bar Chart */}
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">ROAS by Campaign</h4>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[...hierarchy].sort((a, b) => b.roas - a.roas).slice(0, 8)}
                        layout="vertical"
                        margin={{ left: 10, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                        <XAxis 
                          type="number"
                          stroke="#3f3f46"
                          tick={{ fill: '#a1a1aa', fontSize: 10, stroke: 'none' }}
                          tickLine={{ stroke: '#3f3f46' }}
                          tickFormatter={(v) => `${v.toFixed(1)}x`}
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          stroke="#3f3f46"
                          tick={{ fill: '#a1a1aa', fontSize: 10, stroke: 'none' }}
                          tickLine={{ stroke: '#3f3f46' }}
                          width={140}
                          tickFormatter={(value) => value.length > 18 ? value.substring(0, 18) + '...' : value}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#18181b', 
                            border: '1px solid #3f3f46',
                            borderRadius: 8,
                            color: '#e4e4e7'
                          }}
                          formatter={(value: number) => [`${value.toFixed(2)}x`, 'ROAS']}
                        />
                        <Bar 
                          dataKey="roas" 
                          radius={[0, 4, 4, 0]}
                          onClick={(data) => setSelection({ campaign: data.name })}
                          style={{ cursor: 'pointer' }}
                        >
                          {[...hierarchy].sort((a, b) => b.roas - a.roas).slice(0, 8).map((entry, index) => (
                            <Cell key={index} fill={getROASColor(entry.roas)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              /* Time series for campaign/adset/ad level */
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickLine={{ stroke: '#3f3f46' }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis 
                      yAxisId="left" 
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickLine={{ stroke: '#3f3f46' }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickLine={{ stroke: '#3f3f46' }}
                      tickFormatter={(value) => `${value.toFixed(1)}x`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        color: '#e4e4e7'
                      }}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(value: number, name: string) => {
                        if (name === 'roas') return [`${value.toFixed(2)}x`, 'ROAS']
                        return [formatCurrency(value), name === 'spend' ? 'Spend' : 'Revenue']
                      }}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    />
                    <Legend 
                      wrapperStyle={{ color: '#a1a1aa' }}
                    />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="spend" 
                      fill="rgba(139, 92, 246, 0.3)" 
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      name="Spend"
                    />
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="revenue" 
                      fill="rgba(34, 197, 94, 0.3)" 
                      stroke="#22c55e"
                      strokeWidth={2}
                      name="Revenue"
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="roas" 
                      stroke="#f59e0b" 
                      strokeWidth={3}
                      dot={{ fill: '#f59e0b', strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: '#f59e0b' }}
                      name="ROAS"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          
          {/* Children breakdown for campaign/adset level */}
          {(currentLevel === 'campaign' || currentLevel === 'adset') && selectedData?.children && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">
                {currentLevel === 'campaign' ? 'Ad Sets' : 'Ads'} Performance
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={[...selectedData.children].sort((a, b) => b.roas - a.roas)}
                    layout="vertical"
                    margin={{ left: 20, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis 
                      type="number" 
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickLine={{ stroke: '#3f3f46' }}
                      tickFormatter={(v) => `${v.toFixed(1)}x`}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="#3f3f46"
                      tick={{ fill: '#a1a1aa', fontSize: 11, stroke: 'none' }}
                      tickLine={{ stroke: '#3f3f46' }}
                      width={200}
                      tickFormatter={(value) => value.length > 28 ? value.substring(0, 28) + '...' : value}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        color: '#e4e4e7'
                      }}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(value: number) => [`${value.toFixed(2)}x`, 'ROAS']}
                    />
                    <Bar dataKey="roas" radius={[0, 4, 4, 0]}>
                      {[...selectedData.children].sort((a, b) => b.roas - a.roas).map((entry, index) => (
                        <Cell key={index} fill={getROASColor(entry.roas)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          
          {/* Detailed metrics for ad level */}
          {currentLevel === 'ad' && selectedData && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Performance Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Cost per Click</span>
                    <span className="font-mono font-medium">{formatCurrency(selectedData.cpc)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Cost per Acquisition</span>
                    <span className="font-mono font-medium">{selectedData.cpa > 0 ? formatCurrency(selectedData.cpa) : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Click-through Rate</span>
                    <span className="font-mono font-medium">{selectedData.ctr.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-zinc-400">Conversion Rate</span>
                    <span className="font-mono font-medium">{selectedData.convRate.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Volume Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Impressions</span>
                    <span className="font-mono font-medium">{formatNumber(selectedData.impressions)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Clicks</span>
                    <span className="font-mono font-medium">{formatNumber(selectedData.clicks)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-zinc-400">Purchases</span>
                    <span className="font-mono font-medium">{formatNumber(selectedData.purchases)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-zinc-400">Total Spend</span>
                    <span className="font-mono font-medium">{formatCurrency(selectedData.spend)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
