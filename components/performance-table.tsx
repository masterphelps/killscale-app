'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Minus, Plus, Check, ChevronUp, ChevronDown, ChevronRight, Pause, Play, TrendingUp, TrendingDown, Loader2, Video, Image as ImageIcon, X, MoreHorizontal, Pencil, Info, Copy, Trash2, Activity } from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { VerdictBadge } from './verdict-badge'
import { BudgetEditModal } from './budget-edit-modal'
import { StarButton } from './star-button'
import { CreativePreviewTooltip } from './creative-preview-tooltip'
import { Rules, calculateVerdict, Verdict, isEntityActive, StarredAd } from '@/lib/supabase'
import { SelectedItem } from './bulk-action-toolbar'
import { usePrivacyMode } from '@/lib/privacy-mode'
import { FEATURES } from '@/lib/feature-flags'
import { FatigueBurnoutPopover } from './fatigue-burnout-popover'

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

// Platform badge for distinguishing Meta vs Google accounts
// Compact M/G icons with brand colors
const PlatformBadge = ({ platform }: { platform?: 'meta' | 'google' }) => {
  if (!FEATURES.GOOGLE_ADS_INTEGRATION || !platform) return null

  if (platform === 'google') {
    return (
      <span
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold bg-[#EA4335] text-white"
        title="Google Ads"
      >
        G
      </span>
    )
  }

  // Meta - blue brand color
  return (
    <span
      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold bg-[#0866FF] text-white"
      title="Meta Ads"
    >
      M
    </span>
  )
}

type AdRow = {
  ad_account_id?: string | null  // Meta ad_account_id or Google customer_id
  campaign_name: string
  campaign_id?: string | null
  adset_name: string
  adset_id?: string | null
  ad_name: string
  ad_id?: string | null
  creative_id?: string | null  // For star deduplication
  // Creative preview data from sync (no API calls needed)
  thumbnail_url?: string | null
  image_url?: string | null
  media_type?: string | null
  media_hash?: string | null
  storage_url?: string | null
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
  // Platform indicator (for Google Ads integration)
  _platform?: 'meta' | 'google'
  // Google budget resource name for mutations
  campaign_budget_resource_name?: string | null
  // Manual events (from workspace pixel)
  _manualRevenue?: number
  _manualCount?: number
  // Reach & frequency for fatigue detection
  reach?: number
  frequency?: number
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
  onStatusChange?: (entityId: string, entityType: 'campaign' | 'adset' | 'ad', entityName: string, newStatus: 'ACTIVE' | 'PAUSED', platform?: 'meta' | 'google', accountId?: string | null) => void
  canManageAds?: boolean
  onBudgetChange?: (entityId: string, entityType: 'campaign' | 'adset', newBudget: number, budgetType: 'daily' | 'lifetime', oldBudget?: number, platform?: 'meta' | 'google', accountId?: string | null, budgetResourceName?: string) => Promise<void>
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
  // Starred ads for Performance Set
  starredAdIds?: Set<string>
  starredCreativeIds?: Set<string>  // For showing if a creative is already starred
  starredCreativeCounts?: Map<string, number>  // Track star counts per creative for universal performer detection
  onStarAd?: (ad: {
    adId: string
    adName: string
    adsetId: string
    adsetName: string
    campaignId: string
    campaignName: string
    creativeId?: string  // Optional - for deduplication
    spend: number
    revenue: number
    roas: number
  }) => Promise<void>
  onUnstarAd?: (adId: string) => Promise<void>
  // Shopify attribution data - replaces Meta revenue/results when Shopify is source of truth
  shopifyAttribution?: Record<string, { revenue: number; orders: number }>
  // Entity IDs currently being synced (show loading overlay)
  syncingEntities?: Set<string>
  // Row action callbacks (for overflow menu)
  onEditEntity?: (node: HierarchyNode) => void
  onInfoEntity?: (node: HierarchyNode) => void
  onDuplicateEntity?: (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => void
  onDeleteEntity?: (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => void
  // Bulk selection for actions
  bulkSelectedItems?: Map<string, SelectedItem>
  onBulkSelectItem?: (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => void
  // API date range for fatigue chart (since/until from date preset)
  apiDateRange?: { since: string; until: string }
}

type BudgetType = 'CBO' | 'ABO' | null

export type HierarchyNode = {
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
  // Platform (for Google Ads integration)
  platform?: 'meta' | 'google'
  accountId?: string | null  // Meta ad_account_id or Google customer_id
  budgetResourceName?: string  // Google budget resource name for mutations
  // Parent info (for ads - needed for starring)
  adsetId?: string | null
  adsetName?: string
  campaignId?: string | null
  campaignName?: string
  // Creative info (for star deduplication)
  creativeId?: string | null
  // Creative preview data from sync (no API calls needed)
  thumbnail_url?: string | null
  image_url?: string | null
  media_type?: string | null
  media_hash?: string | null
  storage_url?: string | null
  // Manual events (from workspace pixel)
  manualRevenue?: number
  manualCount?: number
  // Frequency for fatigue detection (weighted avg of Meta's raw per-day frequency)
  reach?: number
  frequency?: number
  _freqWeightedSum?: number   // internal: sum of (frequency × impressions)
  _freqWeightedCount?: number // internal: sum of impressions where frequency > 0
}

// Creative data type (from Meta API)
interface Creative {
  id: string
  name?: string
  thumbnailUrl?: string
  imageUrl?: string
  previewUrl?: string
  videoSource?: string
  mediaType: 'image' | 'video' | 'unknown'
}

// Preview modal state
interface PreviewModalState {
  isOpen: boolean
  previewUrl: string
  videoSource?: string
  thumbnailUrl?: string
  mediaType: 'image' | 'video' | 'unknown'
  name: string
  adId?: string
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
  // Use account-qualified keys to prevent collisions in workspace view (multiple accounts)
  const adsetStatuses: Record<string, string | null> = {}  // Track adset statuses by account::name
  const campaignStatuses: Record<string, string | null> = {}  // Track campaign statuses by account::name
  const campaignIds: Record<string, string | null> = {}  // Track campaign IDs by account::name
  const adsetIds: Record<string, string | null> = {}  // Track adset IDs by account::name
  // Track budget info
  const campaignBudgets: Record<string, { daily: number | null; lifetime: number | null }> = {}
  const adsetBudgets: Record<string, { daily: number | null; lifetime: number | null }> = {}
  // Track platform info (Google Ads integration)
  const campaignPlatforms: Record<string, 'meta' | 'google' | undefined> = {}

  data.forEach(row => {
    // Use account-qualified keys to prevent collisions across accounts in workspace view
    const campaignKey = `${row.ad_account_id}::${row.campaign_name}`
    // Include campaign_name in adset key — different campaigns can have adsets with identical names
    // but different budgets/statuses (e.g. "Walk and Talk" under Retargeting-2 vs Retargeting-3)
    const adsetKey = `${row.ad_account_id}::${row.campaign_name}::${row.adset_name}`

    // Capture statuses and IDs from the first row we see for each entity
    if (row.campaign_status && !campaignStatuses[campaignKey]) {
      campaignStatuses[campaignKey] = row.campaign_status
    }
    if (row.campaign_id && !campaignIds[campaignKey]) {
      campaignIds[campaignKey] = row.campaign_id
    }
    if (row.adset_status && !adsetStatuses[adsetKey]) {
      adsetStatuses[adsetKey] = row.adset_status
    }
    if (row.adset_id && !adsetIds[adsetKey]) {
      adsetIds[adsetKey] = row.adset_id
    }
    // Capture budget info from the first row we see for each entity
    if (!campaignBudgets[campaignKey]) {
      campaignBudgets[campaignKey] = {
        daily: row.campaign_daily_budget ?? null,
        lifetime: row.campaign_lifetime_budget ?? null,
      }
    }
    // Capture platform info from the first row we see for each campaign
    if (!campaignPlatforms[campaignKey] && row._platform) {
      campaignPlatforms[campaignKey] = row._platform
    }
    if (!adsetBudgets[adsetKey]) {
      adsetBudgets[adsetKey] = {
        daily: row.adset_daily_budget ?? null,
        lifetime: row.adset_lifetime_budget ?? null,
      }
    }

    if (!campaigns[campaignKey]) {
      campaigns[campaignKey] = {
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
        children: [],
        platform: row._platform,  // Google Ads integration
        accountId: row.ad_account_id,  // Meta ad_account_id or Google customer_id
        budgetResourceName: row.campaign_budget_resource_name || undefined,  // Google budget resource name
        manualRevenue: 0,
        manualCount: 0,
        reach: 0,
        frequency: 0,
        _freqWeightedSum: 0,
        _freqWeightedCount: 0,
      }
    }
    const campaign = campaigns[campaignKey]
    // Ensure we have the ID even if first row didn't have it
    if (row.campaign_id && !campaign.id) campaign.id = row.campaign_id
    
    // For Google data, we only have campaign-level data (no adsets/ads)
    // Skip creating children for Google campaigns
    if (row._platform === 'google') {
      // Aggregate metrics directly on campaign for Google
      campaign.impressions += row.impressions
      campaign.clicks += row.clicks
      campaign.spend += row.spend
      campaign.purchases += row.purchases
      campaign.revenue += row.revenue
      campaign.results += row.results || 0
      if (row.campaign_status) campaign.status = row.campaign_status
      return  // Skip adset/ad creation for Google
    }

    // Find adset by name AND accountId to prevent collisions in workspace view
    let adset = campaign.children?.find(c => c.name === row.adset_name && c.accountId === row.ad_account_id)
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
        children: [],
        platform: row._platform,  // Inherit platform from row
        accountId: row.ad_account_id,  // Inherit accountId from row
        manualRevenue: 0,
        manualCount: 0,
        reach: 0,
        frequency: 0,
        _freqWeightedSum: 0,
        _freqWeightedCount: 0,
      }
      campaign.children?.push(adset)
    }
    // Ensure we have the ID even if first row didn't have it
    if (row.adset_id && !adset.id) adset.id = row.adset_id

    // Find ad by name AND accountId to prevent collisions in workspace view
    let ad = adset.children?.find(a => a.name === row.ad_name && a.accountId === row.ad_account_id)
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
        verdict: 'learn',
        platform: row._platform,  // Inherit platform from row
        accountId: row.ad_account_id,  // Inherit accountId from row
        // Parent info for starring
        adsetId: adset.id,
        adsetName: adset.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        // Creative info for star deduplication
        creativeId: row.creative_id,
        // Creative preview data from sync
        thumbnail_url: row.thumbnail_url,
        image_url: row.image_url,
        media_type: row.media_type,
        storage_url: row.storage_url,
        // Manual events tracking
        manualRevenue: 0,
        manualCount: 0,
        // Frequency tracking (weighted average)
        reach: 0,
        frequency: 0,
        _freqWeightedSum: 0,
        _freqWeightedCount: 0,
      }
      adset.children?.push(ad)
    }
    // Ensure we have the ID even if first row didn't have it
    if (row.ad_id && !ad.id) ad.id = row.ad_id
    // Backfill thumbnail data from any row that has it
    if (!ad.thumbnail_url && row.thumbnail_url) ad.thumbnail_url = row.thumbnail_url
    if (!ad.image_url && row.image_url) ad.image_url = row.image_url
    if (!ad.media_type && row.media_type) ad.media_type = row.media_type
    // Backfill storage_url and media_hash — critical for derivative video IDs where
    // only some rows match media_library (originals have storage_url, derivatives don't)
    if (!ad.storage_url && row.storage_url) ad.storage_url = row.storage_url
    if (!ad.media_hash && row.media_hash) ad.media_hash = row.media_hash
    // Aggregate ad metrics
    ad.impressions += row.impressions
    ad.clicks += row.clicks
    ad.spend += row.spend
    ad.purchases += row.purchases
    ad.revenue += row.revenue
    ad.results += row.results || 0
    ad.reach = (ad.reach || 0) + (row.reach || 0)
    // Track weighted frequency from Meta's raw per-day values (skip rows with freq=0 from pre-migration data)
    const rowFreq = row.frequency || 0
    if (rowFreq > 0 && row.impressions > 0) {
      ad._freqWeightedSum = (ad._freqWeightedSum || 0) + rowFreq * row.impressions
      ad._freqWeightedCount = (ad._freqWeightedCount || 0) + row.impressions
    }
    // Manual events are already at ad level (not per-day), so only capture once
    // They're on every row for this ad, so we take max to avoid double-counting
    if (row._manualRevenue !== undefined) {
      ad.manualRevenue = row._manualRevenue
      ad.manualCount = row._manualCount || 0
    }
    // Keep status from the first (most recent) row only — don't overwrite with older rows
    // After an append sync, older rows may have stale status values
    if (row.status && !ad.status) ad.status = row.status

    adset.impressions += row.impressions
    adset.clicks += row.clicks
    adset.spend += row.spend
    adset.purchases += row.purchases
    adset.revenue += row.revenue
    adset.results += row.results || 0
    adset.reach = (adset.reach || 0) + (row.reach || 0)
    if (rowFreq > 0 && row.impressions > 0) {
      adset._freqWeightedSum = (adset._freqWeightedSum || 0) + rowFreq * row.impressions
      adset._freqWeightedCount = (adset._freqWeightedCount || 0) + row.impressions
    }
  })
  
  Object.values(campaigns).forEach(campaign => {
    campaign.children?.forEach(adset => {
      // Calculate ad-level metrics after aggregation
      adset.children?.forEach(ad => {
        ad.roas = ad.spend > 0 ? ad.revenue / ad.spend : 0
        const adMetrics = calculateMetrics(ad)
        Object.assign(ad, adMetrics)
        ad.verdict = calculateVerdict(ad.spend, ad.roas, rules)
        // Weighted average of Meta's per-day frequency (ignores pre-migration rows with freq=0)
        ad.frequency = (ad._freqWeightedCount && ad._freqWeightedCount > 0)
          ? ad._freqWeightedSum! / ad._freqWeightedCount : 0
      })

      // Roll up manual events from ads to adset
      adset.manualRevenue = adset.children?.reduce((sum, ad) => sum + (ad.manualRevenue || 0), 0) || 0
      adset.manualCount = adset.children?.reduce((sum, ad) => sum + (ad.manualCount || 0), 0) || 0

      adset.roas = adset.spend > 0 ? adset.revenue / adset.spend : 0
      const adsetMetrics = calculateMetrics(adset)
      Object.assign(adset, adsetMetrics)
      
      // Use the direct adset_status from Meta API if available
      // This is the adset's OWN status, not derived from children
      const adsetLookupKey = `${adset.accountId}::${campaign.name}::${adset.name}`
      const directStatus = adsetStatuses[adsetLookupKey]
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
      // Weighted average of Meta's per-day frequency
      adset.frequency = (adset._freqWeightedCount && adset._freqWeightedCount > 0)
        ? adset._freqWeightedSum! / adset._freqWeightedCount : 0

      // Set budget info on adset (use account-qualified keys)
      const adsetBudget = adsetBudgets[adsetLookupKey]
      const campaignLookupKey = `${campaign.accountId}::${campaign.name}`
      const campaignBudget = campaignBudgets[campaignLookupKey]

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
      campaign.reach = (campaign.reach || 0) + (adset.reach || 0)
      campaign._freqWeightedSum = (campaign._freqWeightedSum || 0) + (adset._freqWeightedSum || 0)
      campaign._freqWeightedCount = (campaign._freqWeightedCount || 0) + (adset._freqWeightedCount || 0)
      // Roll up manual events from adset to campaign
      campaign.manualRevenue = (campaign.manualRevenue || 0) + (adset.manualRevenue || 0)
      campaign.manualCount = (campaign.manualCount || 0) + (adset.manualCount || 0)
    })
    
    campaign.roas = campaign.spend > 0 ? campaign.revenue / campaign.spend : 0
    const campaignMetrics = calculateMetrics(campaign)
    Object.assign(campaign, campaignMetrics)
    // Weighted average of Meta's per-day frequency
    campaign.frequency = (campaign._freqWeightedCount && campaign._freqWeightedCount > 0)
      ? campaign._freqWeightedSum! / campaign._freqWeightedCount : 0

    // Use the direct campaign_status from Meta API if available (use account-qualified key)
    const campaignLookupKey = `${campaign.accountId}::${campaign.name}`
    const directStatus = campaignStatuses[campaignLookupKey]
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

    // Set budget info on campaign (use account-qualified key)
    const campBudget = campaignBudgets[campaignLookupKey]
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
    // First: sort by status (ACTIVE items first, paused items last)
    const aActive = a.status === 'ACTIVE' ? 0 : 1
    const bActive = b.status === 'ACTIVE' ? 0 : 1
    if (aActive !== bActive) return aActive - bActive

    // Second: sort by the requested field within each group
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
  externalSortDirection,
  starredAdIds,
  starredCreativeIds,
  starredCreativeCounts,
  onStarAd,
  onUnstarAd,
  shopifyAttribution,
  syncingEntities,
  onEditEntity,
  onInfoEntity,
  onDuplicateEntity,
  onDeleteEntity,
  bulkSelectedItems,
  onBulkSelectItem,
  apiDateRange,
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

  // Fatigue chart popover state
  const [fatigueChartEntity, setFatigueChartEntity] = useState<{
    type: 'campaign' | 'adset' | 'ad'
    id: string
    name: string
    accountId: string
  } | null>(null)
  const [fatigueAnchorRect, setFatigueAnchorRect] = useState<DOMRect | null>(null)

  // Budget edit modal state
  const [budgetEditModal, setBudgetEditModal] = useState<{
    isOpen: boolean
    entityId: string
    entityName: string
    entityType: 'campaign' | 'adset'
    currentBudget: number
    currentBudgetType: 'daily' | 'lifetime'
    platform?: 'meta' | 'google'
    accountId?: string | null
    budgetResourceName?: string  // Google budget resource name
  } | null>(null)

  // Creative state for thumbnails (lazy loaded when adsets expand)
  const [creativesData, setCreativesData] = useState<Record<string, Creative>>({})
  const [loadingCreatives, setLoadingCreatives] = useState<Set<string>>(new Set())
  const loadedCreativesRef = useRef<Set<string>>(new Set())
  const [previewModal, setPreviewModal] = useState<PreviewModalState | null>(null)

  // Overflow menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    const handleClickOutside = (e: MouseEvent) => {
      setOpenMenuId(null)
    }
    // Small delay to avoid closing immediately on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

  const containerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Build hierarchy
  const hierarchy = useMemo(() => {
    const baseHierarchy = buildHierarchy(data, rules)

    // If we have lastTouchAttribution (KillScale mode with Priority Merge),
    // apply Priority Merge per-ad, then re-aggregate to adsets → campaigns.
    if (lastTouchAttribution && Object.keys(lastTouchAttribution).length > 0) {
      return baseHierarchy.map(campaign => {
        // Aggregate all metrics from adsets (which aggregate from ads)
        let campaignImpressions = 0
        let campaignClicks = 0
        let campaignSpend = 0
        let campaignPurchases = 0
        let campaignRevenue = 0
        let campaignResults = 0

        const updatedAdsets = campaign.children?.map(adset => {
          // Aggregate all metrics from child ads
          let adsetImpressions = 0
          let adsetClicks = 0
          let adsetSpend = 0
          let adsetPurchases = 0
          let adsetRevenue = 0
          let adsetResults = 0

          // First, apply Priority Merge to each ad
          const updatedAds = adset.children?.map(ad => {
            // Only match if ad.id is a valid Meta ad ID (not null, undefined, or string versions)
            const adId = ad.id
            const isValidAdId = adId && typeof adId === 'string' && adId.length > 0 && adId !== 'null' && adId !== 'undefined'
            const ksData = isValidAdId ? lastTouchAttribution[adId] : null

            if (ksData) {
              // Priority Merge algorithm: combine KS + Meta data
              const metaCount = ad.purchases || 0
              const metaRev = ad.revenue || 0
              const ksCount = ksData.conversions || 0
              const ksRev = ksData.revenue || 0

              // Verified = both sources saw (MIN)
              const verified = Math.min(ksCount, metaCount)
              // KS-only = KS tracked extra that Meta missed
              const ksOnly = Math.max(0, ksCount - metaCount)
              // Meta-only = Meta reported extra that KS missed
              const metaOnly = Math.max(0, metaCount - ksCount)

              // Calculate merged values
              const mergedPurchases = verified + ksOnly + metaOnly

              // Revenue: proportional from each source
              const verifiedRev = metaCount > 0 ? (verified / metaCount) * metaRev : 0
              const ksOnlyRev = ksCount > 0 ? (ksOnly / ksCount) * ksRev : 0
              const metaOnlyRev = metaCount > 0 ? (metaOnly / metaCount) * metaRev : 0
              const mergedRevenue = verifiedRev + ksOnlyRev + metaOnlyRev

              // Calculate ad-level metrics with merged values
              const adRoas = ad.spend > 0 ? mergedRevenue / ad.spend : 0

              return {
                ...ad,
                purchases: mergedPurchases,
                revenue: mergedRevenue,
                results: mergedPurchases,
                roas: adRoas,
                cpr: mergedPurchases > 0 ? ad.spend / mergedPurchases : 0,
                cpa: mergedPurchases > 0 ? ad.spend / mergedPurchases : 0,
                convRate: ad.clicks > 0 ? (mergedPurchases / ad.clicks) * 100 : 0,
                verdict: calculateVerdict(ad.spend, adRoas, rules)
              }
            }

            // No KS data - keep Meta values as-is
            return ad
          }) || []

          // Now aggregate from updated ads
          updatedAds.forEach(ad => {
            adsetImpressions += ad.impressions ?? 0
            adsetClicks += ad.clicks ?? 0
            adsetSpend += ad.spend ?? 0
            adsetPurchases += ad.purchases ?? 0
            adsetRevenue += ad.revenue ?? 0
            adsetResults += ad.results ?? ad.purchases ?? 0
          })

          // Roll up to campaign
          campaignImpressions += adsetImpressions
          campaignClicks += adsetClicks
          campaignSpend += adsetSpend
          campaignPurchases += adsetPurchases
          campaignRevenue += adsetRevenue
          campaignResults += adsetResults

          // Calculate derived metrics for adset
          const adsetRoas = adsetSpend > 0 ? adsetRevenue / adsetSpend : 0
          const adsetCtr = adsetImpressions > 0 ? (adsetClicks / adsetImpressions) * 100 : 0
          return {
            ...adset,
            impressions: adsetImpressions,
            clicks: adsetClicks,
            spend: adsetSpend,
            purchases: adsetPurchases,
            revenue: adsetRevenue,
            results: adsetResults,
            roas: adsetRoas,
            ctr: adsetCtr,
            cpr: adsetPurchases > 0 ? adsetSpend / adsetPurchases : 0,
            cpa: adsetPurchases > 0 ? adsetSpend / adsetPurchases : 0,
            convRate: adsetClicks > 0 ? (adsetPurchases / adsetClicks) * 100 : 0,
            verdict: calculateVerdict(adsetSpend, adsetRoas, rules),
            children: updatedAds
          }
        })

        // Calculate derived metrics for campaign
        const campaignRoas = campaignSpend > 0 ? campaignRevenue / campaignSpend : 0
        const campaignCtr = campaignImpressions > 0 ? (campaignClicks / campaignImpressions) * 100 : 0
        return {
          ...campaign,
          impressions: campaignImpressions,
          clicks: campaignClicks,
          spend: campaignSpend,
          purchases: campaignPurchases,
          revenue: campaignRevenue,
          results: campaignResults,
          roas: campaignRoas,
          ctr: campaignCtr,
          cpr: campaignPurchases > 0 ? campaignSpend / campaignPurchases : 0,
          cpa: campaignPurchases > 0 ? campaignSpend / campaignPurchases : 0,
          convRate: campaignClicks > 0 ? (campaignPurchases / campaignClicks) * 100 : 0,
          verdict: calculateVerdict(campaignSpend, campaignRoas, rules),
          children: updatedAdsets
        }
      })
    }

    // If Shopify is the revenue source AND we have attribution data, apply it per-ad
    // Shopify data is aggregated by ad_id - we replace Meta revenue/purchases/results
    // IMPORTANT: Only apply if we actually have attribution data, otherwise show Meta data
    if (shopifyAttribution && Object.keys(shopifyAttribution).length > 0) {
      return baseHierarchy.map(campaign => {
        // Aggregate all metrics from adsets (which aggregate from ads)
        let campaignImpressions = 0
        let campaignClicks = 0
        let campaignSpend = 0
        let campaignPurchases = 0
        let campaignRevenue = 0
        let campaignResults = 0

        const updatedAdsets = campaign.children?.map(adset => {
          // Aggregate all metrics from child ads
          let adsetImpressions = 0
          let adsetClicks = 0
          let adsetSpend = 0
          let adsetPurchases = 0
          let adsetRevenue = 0
          let adsetResults = 0

          // Apply Shopify attribution to each ad
          const updatedAds = adset.children?.map(ad => {
            const adId = ad.id
            const isValidAdId = adId && typeof adId === 'string' && adId.length > 0 && adId !== 'null' && adId !== 'undefined'
            const shopifyData = isValidAdId ? shopifyAttribution[adId] : null

            if (shopifyData) {
              // Replace with Shopify data
              const adRoas = ad.spend > 0 ? shopifyData.revenue / ad.spend : 0

              return {
                ...ad,
                purchases: shopifyData.orders,
                revenue: shopifyData.revenue,
                results: shopifyData.orders,
                roas: adRoas,
                cpr: shopifyData.orders > 0 ? ad.spend / shopifyData.orders : 0,
                cpa: shopifyData.orders > 0 ? ad.spend / shopifyData.orders : 0,
                convRate: ad.clicks > 0 ? (shopifyData.orders / ad.clicks) * 100 : 0,
                verdict: calculateVerdict(ad.spend, adRoas, rules)
              }
            }

            // No Shopify data for this ad - zero out revenue/purchases
            return {
              ...ad,
              purchases: 0,
              revenue: 0,
              results: 0,
              roas: 0,
              cpr: 0,
              cpa: 0,
              convRate: 0,
              verdict: calculateVerdict(ad.spend, 0, rules)
            }
          }) || []

          // Now aggregate from updated ads
          // Use ?? (nullish coalescing) to preserve 0 values from Shopify attribution
          updatedAds.forEach(ad => {
            adsetImpressions += ad.impressions ?? 0
            adsetClicks += ad.clicks ?? 0
            adsetSpend += ad.spend ?? 0
            adsetPurchases += ad.purchases ?? 0
            adsetRevenue += ad.revenue ?? 0
            adsetResults += ad.results ?? 0
          })

          // Roll up to campaign
          campaignImpressions += adsetImpressions
          campaignClicks += adsetClicks
          campaignSpend += adsetSpend
          campaignPurchases += adsetPurchases
          campaignRevenue += adsetRevenue
          campaignResults += adsetResults

          // Calculate derived metrics for adset
          const adsetRoas = adsetSpend > 0 ? adsetRevenue / adsetSpend : 0
          const adsetCtr = adsetImpressions > 0 ? (adsetClicks / adsetImpressions) * 100 : 0
          return {
            ...adset,
            impressions: adsetImpressions,
            clicks: adsetClicks,
            spend: adsetSpend,
            purchases: adsetPurchases,
            revenue: adsetRevenue,
            results: adsetResults,
            roas: adsetRoas,
            ctr: adsetCtr,
            cpr: adsetPurchases > 0 ? adsetSpend / adsetPurchases : 0,
            cpa: adsetPurchases > 0 ? adsetSpend / adsetPurchases : 0,
            convRate: adsetClicks > 0 ? (adsetPurchases / adsetClicks) * 100 : 0,
            verdict: calculateVerdict(adsetSpend, adsetRoas, rules),
            children: updatedAds
          }
        })

        // Calculate derived metrics for campaign
        const campaignRoas = campaignSpend > 0 ? campaignRevenue / campaignSpend : 0
        const campaignCtr = campaignImpressions > 0 ? (campaignClicks / campaignImpressions) * 100 : 0
        return {
          ...campaign,
          impressions: campaignImpressions,
          clicks: campaignClicks,
          spend: campaignSpend,
          purchases: campaignPurchases,
          revenue: campaignRevenue,
          results: campaignResults,
          roas: campaignRoas,
          ctr: campaignCtr,
          cpr: campaignPurchases > 0 ? campaignSpend / campaignPurchases : 0,
          cpa: campaignPurchases > 0 ? campaignSpend / campaignPurchases : 0,
          convRate: campaignClicks > 0 ? (campaignPurchases / campaignClicks) * 100 : 0,
          verdict: calculateVerdict(campaignSpend, campaignRoas, rules),
          children: updatedAdsets
        }
      })
    }

    return baseHierarchy
  }, [data, rules, lastTouchAttribution, shopifyAttribution])

  // Handle deep-linking highlight from alerts
  useEffect(() => {
    if (!highlightEntity || hierarchy.length === 0) return

    const { type, name, campaignName, adsetName } = highlightEntity

    // Find the entity in the hierarchy and get its account-qualified key
    let foundCampaignKey: string | null = null
    let foundAdsetKey: string | null = null

    if (type === 'campaign') {
      const campaign = hierarchy.find(c => c.name === name)
      foundCampaignKey = campaign ? `${campaign.accountId}::${campaign.name}` : null
    } else if (type === 'adset' && campaignName) {
      const campaign = hierarchy.find(c => c.name === campaignName)
      if (campaign) {
        foundCampaignKey = `${campaign.accountId}::${campaign.name}`
        const adset = campaign.children?.find(a => a.name === name)
        foundAdsetKey = adset ? `${foundCampaignKey}::${adset.name}` : null
      }
    } else if (type === 'ad' && campaignName && adsetName) {
      const campaign = hierarchy.find(c => c.name === campaignName)
      if (campaign) {
        foundCampaignKey = `${campaign.accountId}::${campaign.name}`
        foundAdsetKey = `${foundCampaignKey}::${adsetName}`
      }
    }

    // Expand to show the entity
    if (foundCampaignKey) {
      setExpandedCampaigns(prev => {
        const newSet = new Set(prev)
        newSet.add(foundCampaignKey!)
        return newSet
      })
    }
    if (foundAdsetKey) {
      setExpandedAdsets(prev => {
        const newSet = new Set(prev)
        newSet.add(foundAdsetKey!)
        return newSet
      })
    }

    // Set the highlight (use account-qualified keys)
    const rowKey = type === 'campaign' ? foundCampaignKey
      : type === 'adset' ? foundAdsetKey
      : foundAdsetKey ? `${foundAdsetKey}::${name}` : null
    if (rowKey) setHighlightedRow(rowKey)

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

  // Load creative details for an ad (lazy loaded when adset expands)
  const loadCreative = useCallback(async (creativeId: string) => {
    // Use ref for immediate check (avoids stale closures)
    if (!userId || loadedCreativesRef.current.has(creativeId)) return

    // Mark as loading immediately using ref
    loadedCreativesRef.current.add(creativeId)
    setLoadingCreatives(prev => new Set(prev).add(creativeId))

    try {
      const res = await fetch(`/api/meta/creative?userId=${userId}&creativeId=${creativeId}`)
      const data = await res.json()
      if (data.creative) {
        setCreativesData(prev => ({ ...prev, [creativeId]: data.creative }))
      }
    } catch (err) {
      console.error('Failed to load creative:', err)
      // Remove from ref on error so it can be retried
      loadedCreativesRef.current.delete(creativeId)
    } finally {
      setLoadingCreatives(prev => {
        const next = new Set(prev)
        next.delete(creativeId)
        return next
      })
    }
  }, [userId])

  // Use account-qualified keys for expand state to prevent collisions in workspace view
  const toggleCampaign = (campaignName: string, accountId?: string | null) => {
    // Create account-qualified key for expanded state
    const key = accountId ? `${accountId}::${campaignName}` : campaignName
    const newSet = new Set(expandedCampaigns)
    if (newSet.has(key)) {
      newSet.delete(key)
      // Also collapse all adsets under this campaign
      const newAdsets = new Set(expandedAdsets)
      hierarchy.find(c => `${c.accountId}::${c.name}` === key)?.children?.forEach(adset => {
        newAdsets.delete(`${key}::${adset.name}`)
      })
      setExpandedAdsets(newAdsets)
    } else {
      newSet.add(key)
    }
    setExpandedCampaigns(newSet)
  }

  const toggleAdset = (campaignKey: string, adsetName: string, accountId?: string | null) => {
    // Create account-qualified key for expanded state
    const campKey = accountId ? `${accountId}::${campaignKey}` : campaignKey
    const key = `${campKey}::${adsetName}`
    const newSet = new Set(expandedAdsets)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setExpandedAdsets(newSet)
  }

  // Load creatives when adsets are expanded (lazy loading)
  useEffect(() => {
    if (!userId) return

    // For each expanded adset, find ads with creativeIds and load them
    sortedHierarchy.forEach(campaign => {
      const campaignKey = `${campaign.accountId}::${campaign.name}`
      if (!expandedCampaigns.has(campaignKey)) return

      campaign.children?.forEach(adset => {
        const adsetKey = `${campaignKey}::${adset.name}`
        if (!expandedAdsets.has(adsetKey)) return

        // Load creatives for visible ads (Meta only - Google doesn't have creatives)
        // Skip images that already have data from sync. Always load videos (need videoSource).
        adset.children?.forEach(ad => {
          if (ad.creativeId && ad.platform !== 'google' && !loadedCreativesRef.current.has(ad.creativeId)) {
            const isImage = ad.media_type && ad.media_type.toLowerCase() !== 'video'
            if (isImage && (ad.thumbnail_url || ad.image_url)) return // images have CDN URL already
            loadCreative(ad.creativeId)
          }
        })
      })
    })
  }, [expandedAdsets, expandedCampaigns, sortedHierarchy, userId, loadCreative])

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedCampaigns(new Set())
      setExpandedAdsets(new Set())
    } else {
      // Use account-qualified keys for expand state
      const campaigns = new Set(sortedHierarchy.map(c => `${c.accountId}::${c.name}`))
      const adsets = new Set<string>()
      sortedHierarchy.forEach(c => {
        const campaignKey = `${c.accountId}::${c.name}`
        c.children?.forEach(a => {
          adsets.add(`${campaignKey}::${a.name}`)
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
    // Check if this entity is currently being synced
    const isSyncing = syncingEntities?.has(node.id || '')
    // Check if this item is bulk selected
    const isBulkSelected = node.id ? bulkSelectedItems?.has(node.id) : false

    // Handle row click for bulk selection
    const handleRowClick = (e: React.MouseEvent) => {
      // Don't select if clicking on interactive elements
      const target = e.target as HTMLElement
      const isInteractive = target.closest('button') ||
                           target.closest('[data-no-select]') ||
                           target.closest('input')
      if (isInteractive) return

      // If onBulkSelectItem is provided and we have an ID, select/deselect
      if (onBulkSelectItem && node.id) {
        e.stopPropagation()
        onBulkSelectItem(node, level)
      }
    }

    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        onClick={handleRowClick}
        className={cn(
          // New card-style row with dark background
          'relative rounded-xl px-4 py-5 transition-all duration-200',
          'bg-bg-card',
          'border border-border',
          'hover:border-border/50 hover:bg-bg-hover',
          'flex gap-3',
          // Align to top in detailed mode (two-row metrics), center in simple mode
          viewMode === 'detailed' ? 'items-start' : 'items-center',
          isHighlighted && 'ring-2 ring-accent/50 border-accent/50',
          !isSelected && level !== 'ad' && 'opacity-60',
          onBulkSelectItem && 'cursor-pointer',
          // Bulk selection highlight - left border + background, no ring to avoid overlap
          // Use ! to override hover states
          isBulkSelected && 'border-l-4 !border-l-accent !bg-accent/10'
        )}
        style={{ marginLeft: indent }}
      >
        {/* Syncing overlay */}
        {isSyncing && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-dark/50 z-10 rounded-xl">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-400">Syncing...</span>
          </div>
        )}

        {/* Star button for ads - positioned where checkbox would be */}
        {level === 'ad' && node.id && onStarAd && onUnstarAd ? (
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 32 }}>
            <StarButton
              isStarred={starredAdIds?.has(node.id) ?? false}
              starCount={node.creativeId ? starredCreativeCounts?.get(node.creativeId) : undefined}
              onToggle={async () => {
                const isCurrentlyStarred = starredAdIds?.has(node.id!) ?? false
                if (isCurrentlyStarred) {
                  await onUnstarAd(node.id!)
                } else {
                  await onStarAd({
                    adId: node.id!,
                    adName: node.name,
                    adsetId: node.adsetId || '',
                    adsetName: node.adsetName || '',
                    campaignId: node.campaignId || '',
                    campaignName: node.campaignName || '',
                    creativeId: node.creativeId || undefined,
                    spend: node.spend,
                    revenue: node.revenue,
                    roas: node.roas
                  })
                }
              }}
            />
          </div>
        ) : hasCheckboxes ? (
          /* Checkbox for campaigns and ABO adsets */
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
        ) : null}

        {/* Creative thumbnail for ads only */}
        {level === 'ad' && (node.creativeId || node.thumbnail_url || node.image_url || node.storage_url) && node.platform !== 'google' && (
          <CreativePreviewTooltip
            previewUrl={(() => {
              // Prefer storage URL from Supabase Storage (zero external calls)
              if (node.storage_url) return node.storage_url
              // Prefer row-level data from sync (no API call needed)
              // Videos: prefer thumbnail_url (video thumbnail from media_library)
              // Images: prefer image_url (high-quality permanent CDN URL from media_library)
              const rowUrl = node.media_type?.toUpperCase() === 'VIDEO'
                ? (node.thumbnail_url || node.image_url)
                : (node.image_url || node.thumbnail_url)
              if (rowUrl) return rowUrl
              const creative = creativesData[node.creativeId!]
              return creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl
            })()}
            mediaType={(() => {
              if (node.storage_url || node.thumbnail_url || node.image_url) return node.media_type?.toUpperCase() === 'VIDEO' ? 'video' : 'image'
              return creativesData[node.creativeId!]?.mediaType
            })()}
            alt={nameToShow}
            onFullPreview={async () => {
              const isVideo = node.media_type?.toUpperCase() === 'VIDEO'

              // If we have a storage URL, use it directly (zero API calls)
              if (node.storage_url) {
                setPreviewModal({
                  isOpen: true,
                  previewUrl: node.storage_url,
                  videoSource: isVideo ? node.storage_url : undefined,
                  thumbnailUrl: node.storage_url,
                  mediaType: isVideo ? 'video' : 'image',
                  name: nameToShow,
                  adId: node.id || undefined
                })
                return
              }

              // Prefer row-level data from sync
              const rowUrl = isVideo
                ? (node.thumbnail_url || node.image_url)
                : (node.image_url || node.thumbnail_url)
              if (rowUrl) {
                // For videos, fetch playable source on demand
                let videoSource: string | undefined
                if (isVideo && node.media_hash && userId) {
                  try {
                    const res = await fetch(`/api/creative-studio/video-source?userId=${userId}&videoId=${node.media_hash}`)
                    if (res.ok) {
                      const data = await res.json()
                      videoSource = data.source
                    }
                  } catch (e) { /* ignore */ }
                }
                setPreviewModal({
                  isOpen: true,
                  previewUrl: rowUrl,
                  videoSource,
                  thumbnailUrl: rowUrl,
                  mediaType: isVideo ? 'video' : 'image',
                  name: nameToShow,
                  adId: node.id || undefined
                })
                return
              }
              const creative = creativesData[node.creativeId!]
              const previewUrl = creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl
              if (previewUrl || creative?.videoSource) {
                setPreviewModal({
                  isOpen: true,
                  previewUrl: previewUrl || '',
                  videoSource: creative?.videoSource,
                  thumbnailUrl: previewUrl,
                  mediaType: creative?.mediaType || 'unknown',
                  name: nameToShow,
                  adId: node.id || undefined
                })
              }
            }}
          >
            <div data-no-select className="w-10 h-12 rounded-lg bg-bg-hover flex-shrink-0 overflow-hidden">
              {(() => {
                const isVideo = node.media_type?.toUpperCase() === 'VIDEO'
                const creative = node.creativeId ? creativesData[node.creativeId] : undefined

                // Stored videos: use <video> tag — #t=0.3 forces browser to render a visible frame
                if (isVideo && node.storage_url) {
                  return (
                    <div className="relative w-full h-full">
                      <video
                        src={`${node.storage_url}#t=0.3`}
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-3 h-3 text-white fill-white" />
                      </div>
                    </div>
                  )
                }

                // Stored images: use storage URL directly
                if (!isVideo && node.storage_url) {
                  return (
                    <div className="relative w-full h-full">
                      <img src={node.storage_url} alt={nameToShow} className="w-full h-full object-cover" />
                    </div>
                  )
                }

                // Images: use row data from media_library (high-quality CDN URL)
                if (!isVideo) {
                  const imgUrl = node.image_url || node.thumbnail_url || creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl
                  if (imgUrl) {
                    return (
                      <div className="relative w-full h-full">
                        <img src={imgUrl} alt={nameToShow} className="w-full h-full object-cover" />
                      </div>
                    )
                  }
                }

                // Videos: use <video> element — #t=0.3 forces browser to render a visible frame
                if (isVideo && creative?.videoSource) {
                  return (
                    <div className="relative w-full h-full">
                      <video
                        src={`${creative.videoSource}#t=0.3`}
                        muted
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-3 h-3 text-white fill-white" />
                      </div>
                    </div>
                  )
                }

                // Videos: fallback to thumbnail while lazy loader fetches source
                if (isVideo) {
                  const thumbUrl = node.thumbnail_url || node.image_url || creative?.previewUrl || creative?.thumbnailUrl
                  if (thumbUrl) {
                    return (
                      <div className="relative w-full h-full">
                        <img src={thumbUrl} alt={nameToShow} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-3 h-3 text-white fill-white" />
                        </div>
                      </div>
                    )
                  }
                }

                // Loading state
                if (node.creativeId && loadingCreatives.has(node.creativeId)) {
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                    </div>
                  )
                }

                // No data at all
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    {isVideo ? (
                      <Video className="w-4 h-4 text-zinc-600" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                )
              })()}
            </div>
          </CreativePreviewTooltip>
        )}

        {/* Expand/collapse chevron */}
        {onToggle ? (
          <button
            data-no-select
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
        {/* Only toggle expand on click if bulk selection is not active */}
        <div
          className="flex-1 min-w-0 max-w-[280px]"
          onClick={onBulkSelectItem ? undefined : onToggle}
        >
          {/* Row 1: Name */}
          <div className={cn('truncate text-sm', textClass)} title={nameToShow}>{nameToShow}</div>
          {/* Row 2: Type label + platform badge + status badges + CBO/ABO badge */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-zinc-500">{typeLabels[level]}</span>
            {/* Platform badge - only show at campaign level */}
            {level === 'campaign' && <PlatformBadge platform={node.platform} />}
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
              <div className="font-mono text-white flex items-center justify-end gap-1">
                {formatCurrency(node.revenue)}
                {(node.manualCount ?? 0) > 0 && (
                  <span className="text-[10px] text-purple-400" title={`Includes ${node.manualCount} manual event${node.manualCount! > 1 ? 's' : ''} (${formatCurrency(node.manualRevenue || 0)})`}>+M</span>
                )}
              </div>
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
                        platform: node.platform,
                        accountId: node.accountId,
                        budgetResourceName: node.budgetResourceName,
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
              {/* Frequency indicator — leading signal for audience saturation */}
              <div className="text-right w-14">
                <div className="text-zinc-500 text-xs mb-0.5">Freq</div>
                <div className={cn(
                  "font-mono text-sm",
                  (node.frequency || 0) >= 3 ? "text-red-400" :     // 3+ burnout risk
                  (node.frequency || 0) >= 2.5 ? "text-orange-400" : // 2.5+ elevated
                  (node.frequency || 0) >= 2 ? "text-amber-400" :    // 2+ watch
                  "text-white"                                        // < 2 normal
                )}>
                  {(node.frequency || 0) > 0 ? (node.frequency || 0).toFixed(1) : '—'}
                </div>
              </div>
              {/* Burnout chart icon */}
              {node.id && node.platform !== 'google' && userId && apiDateRange && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setFatigueAnchorRect(rect)
                    setFatigueChartEntity({
                      type: level,
                      id: node.id!,
                      name: node.name,
                      accountId: node.accountId || '',
                    })
                  }}
                  className="flex items-center justify-center w-7 h-7 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Burnout Chart"
                >
                  <Activity className="w-3.5 h-3.5" />
                </button>
              )}
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
              onStatusChange(node.id!, level, node.name, newStatus, node.platform, node.accountId)
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

        {/* Overflow menu for row actions */}
        {canManageAds && node.id && node.platform !== 'google' && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpenMenuId(openMenuId === rowKey ? null : rowKey!)
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white transition-all flex-shrink-0"
              title="More actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {openMenuId === rowKey && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditEntity?.(node)
                    setOpenMenuId(null)
                  }}
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-bg-hover transition-colors"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                {level !== 'campaign' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onInfoEntity?.(node)
                      setOpenMenuId(null)
                    }}
                    className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-bg-hover transition-colors"
                  >
                    <Info className="w-4 h-4" /> Info
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicateEntity?.(node, level)
                    setOpenMenuId(null)
                  }}
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-bg-hover transition-colors"
                >
                  <Copy className="w-4 h-4" /> Duplicate
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteEntity?.(node, level)
                    setOpenMenuId(null)
                  }}
                  className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-bg-hover transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const HeaderRow = () => (
    <div className="flex items-center text-xs text-zinc-500 uppercase tracking-wide bg-bg-dark rounded-xl p-3 mb-2 border border-border/50">
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
          {/* Star button on left for ads */}
          {level === 'ad' && node.id && onStarAd && onUnstarAd && (
            <div className="flex-shrink-0 mr-3">
              <StarButton
                isStarred={starredAdIds?.has(node.id) ?? false}
                starCount={node.creativeId ? starredCreativeCounts?.get(node.creativeId) : undefined}
                onToggle={async () => {
                  const isCurrentlyStarred = starredAdIds?.has(node.id!) ?? false
                  if (isCurrentlyStarred) {
                    await onUnstarAd(node.id!)
                  } else {
                    await onStarAd({
                      adId: node.id!,
                      adName: node.name,
                      adsetId: node.adsetId || '',
                      adsetName: node.adsetName || '',
                      campaignId: node.campaignId || '',
                      campaignName: node.campaignName || '',
                      creativeId: node.creativeId || undefined,
                      spend: node.spend,
                      revenue: node.revenue,
                      roas: node.roas
                    })
                  }
                }}
              />
            </div>
          )}
          {/* Creative thumbnail for ads (mobile) */}
          {level === 'ad' && (node.creativeId || node.thumbnail_url || node.image_url || node.storage_url) && node.platform !== 'google' && (
            <div
              data-no-select
              className="flex-shrink-0 mr-3 cursor-pointer"
              onClick={() => {
                const isVideo = node.media_type?.toUpperCase() === 'VIDEO'

                // Prefer storage URL (zero API calls)
                if (node.storage_url) {
                  setPreviewModal({
                    isOpen: true,
                    previewUrl: node.storage_url,
                    videoSource: isVideo ? node.storage_url : undefined,
                    thumbnailUrl: node.storage_url,
                    mediaType: isVideo ? 'video' : 'image',
                    name: nameToShow,
                    adId: node.id || undefined
                  })
                  return
                }

                // Prefer row-level data from sync
                const rowUrl = isVideo
                  ? (node.thumbnail_url || node.image_url)
                  : (node.image_url || node.thumbnail_url)
                if (rowUrl) {
                  setPreviewModal({
                    isOpen: true,
                    previewUrl: rowUrl,
                    videoSource: undefined,
                    thumbnailUrl: rowUrl,
                    mediaType: isVideo ? 'video' : 'image',
                    name: nameToShow,
                    adId: node.id || undefined
                  })
                  return
                }
                const creative = creativesData[node.creativeId!]
                const previewUrl = creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl
                if (previewUrl || creative?.videoSource) {
                  setPreviewModal({
                    isOpen: true,
                    previewUrl: previewUrl || '',
                    videoSource: creative?.videoSource,
                    thumbnailUrl: previewUrl,
                    mediaType: creative?.mediaType || 'unknown',
                    name: nameToShow,
                    adId: node.id || undefined
                  })
                }
              }}
            >
              <div className="w-12 h-14 rounded-lg bg-bg-hover overflow-hidden">
                {(() => {
                  const isVideo = node.media_type?.toUpperCase() === 'VIDEO'

                  // Stored video: use <video> tag — #t=0.3 forces browser to render a visible frame
                  if (isVideo && node.storage_url) {
                    return (
                      <div className="relative w-full h-full">
                        <video
                          src={`${node.storage_url}#t=0.3`}
                          muted
                          playsInline
                          preload="auto"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </div>
                    )
                  }

                  // Stored image: use storage URL directly
                  if (!isVideo && node.storage_url) {
                    return (
                      <div className="relative w-full h-full">
                        <img
                          src={node.storage_url}
                          alt={nameToShow}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )
                  }

                  // Prefer row-level data from sync
                  const rowUrl = isVideo
                    ? (node.thumbnail_url || node.image_url)
                    : (node.image_url || node.thumbnail_url)
                  if (rowUrl) {
                    return (
                      <div className="relative w-full h-full">
                        <img
                          src={rowUrl}
                          alt={nameToShow}
                          className="w-full h-full object-cover"
                        />
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="w-4 h-4 text-white fill-white" />
                          </div>
                        )}
                      </div>
                    )
                  }
                  // Fallback to lazy-loaded creative data
                  if (node.creativeId && loadingCreatives.has(node.creativeId)) {
                    return (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                      </div>
                    )
                  }
                  const creative = node.creativeId ? creativesData[node.creativeId] : undefined
                  const previewUrl = creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl
                  return previewUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={previewUrl}
                        alt={nameToShow}
                        className="w-full h-full object-cover"
                      />
                      {creative?.mediaType === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {creative?.mediaType === 'video' ? (
                        <Video className="w-5 h-5 text-zinc-600" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-zinc-600" />
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
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
                  onStatusChange(node.id!, level, node.name, newStatus, node.platform, node.accountId)
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
            {/* Overflow menu for mobile */}
            {canManageAds && node.id && node.platform !== 'google' && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const mobileMenuId = `mobile-${node.id}`
                    setOpenMenuId(openMenuId === mobileMenuId ? null : mobileMenuId)
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-700 text-zinc-400"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {openMenuId === `mobile-${node.id}` && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditEntity?.(node)
                        setOpenMenuId(null)
                      }}
                      className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300"
                    >
                      <Pencil className="w-4 h-4" /> Edit
                    </button>
                    {level !== 'campaign' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onInfoEntity?.(node)
                          setOpenMenuId(null)
                        }}
                        className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300"
                      >
                        <Info className="w-4 h-4" /> Info
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicateEntity?.(node, level)
                        setOpenMenuId(null)
                      }}
                      className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-zinc-300"
                    >
                      <Copy className="w-4 h-4" /> Duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteEntity?.(node, level)
                        setOpenMenuId(null)
                      }}
                      className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-red-400"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                )}
              </div>
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
            <div className="font-mono text-sm font-semibold flex items-center justify-center gap-1">
              {formatCurrency(node.revenue)}
              {(node.manualCount ?? 0) > 0 && (
                <span className="text-[10px] text-purple-400" title={`Includes ${node.manualCount} manual event${node.manualCount! > 1 ? 's' : ''}`}>+M</span>
              )}
            </div>
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
                  platform: node.platform,
                  accountId: node.accountId,
                  budgetResourceName: node.budgetResourceName,
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
        <div className="space-y-2 min-w-[900px] max-w-[1400px] min-h-[calc(100vh-200px)]">
            {sortedHierarchy.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-500">
                No ads match the selected filter
              </div>
            ) : (
              sortedHierarchy.map((campaign, campaignIndex) => {
                const isSelected = selectedCampaigns?.has(campaign.name) ?? true
                // Use account-qualified key for React keys and expanded state
                const campaignKey = `${campaign.accountId}::${campaign.name}`

                return (
                  <div key={campaignKey}>
                    <DataRow
                      node={campaign}
                      level="campaign"
                      isExpanded={expandedCampaigns.has(campaignKey)}
                      onToggle={campaign.platform === 'google' ? undefined : () => toggleCampaign(campaign.name, campaign.accountId)}
                      isSelected={isSelected}
                      rowKey={campaignKey}
                      displayName={maskName(campaign.name, 'campaign', campaignIndex)}
                    />

                    {expandedCampaigns.has(campaignKey) && campaign.children?.map((adset, adsetIndex) => {
                      const adsetKey = `${campaignKey}::${adset.name}`
                      return (
                        <div key={adsetKey}>
                          <DataRow
                            node={adset}
                            level="adset"
                            isExpanded={expandedAdsets.has(adsetKey)}
                            onToggle={() => toggleAdset(campaign.name, adset.name, campaign.accountId)}
                            rowKey={adsetKey}
                            campaignName={campaign.name}
                            displayName={maskName(adset.name, 'adset', adsetIndex)}
                          />

                          {expandedAdsets.has(adsetKey) && adset.children?.map((ad, adIndex) => (
                            <DataRow
                              key={`${adsetKey}::${ad.name}`}
                              node={ad}
                              level="ad"
                              rowKey={`${adsetKey}::${ad.name}`}
                              campaignName={campaign.name}
                              adsetName={adset.name}
                              displayName={maskName(ad.name, 'ad', adIndex)}
                            />
                          ))}
                        </div>
                      )
                    })}
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
          sortedHierarchy.map((campaign, campaignIndex) => {
            // Use account-qualified key for React keys and expanded state
            const campaignKey = `${campaign.accountId}::${campaign.name}`
            return (
              <div key={campaignKey}>
                <MobileCard
                  node={campaign}
                  level="campaign"
                  isExpanded={expandedCampaigns.has(campaignKey)}
                  onToggle={campaign.platform === 'google' ? undefined : () => toggleCampaign(campaign.name, campaign.accountId)}
                  displayName={maskName(campaign.name, 'campaign', campaignIndex)}
                />

                {expandedCampaigns.has(campaignKey) && campaign.children?.map((adset, adsetIndex) => {
                  const adsetKey = `${campaignKey}::${adset.name}`
                  return (
                    <div key={adsetKey} className="ml-3">
                      <MobileCard
                        node={adset}
                        level="adset"
                        isExpanded={expandedAdsets.has(adsetKey)}
                        onToggle={() => toggleAdset(campaign.name, adset.name, campaign.accountId)}
                        displayName={maskName(adset.name, 'adset', adsetIndex)}
                      />

                      {expandedAdsets.has(adsetKey) && adset.children?.map((ad, adIndex) => (
                        <div key={`${adsetKey}::${ad.name}`} className="ml-3">
                          <MobileCard
                            node={ad}
                            level="ad"
                            displayName={maskName(ad.name, 'ad', adIndex)}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })
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
                budgetEditModal.currentBudget,
                budgetEditModal.platform,
                budgetEditModal.accountId,
                budgetEditModal.budgetResourceName
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

      {/* Creative Preview Modal */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setPreviewModal(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setPreviewModal(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Media preview */}
          <div className="max-w-[90vw] sm:max-w-4xl max-h-[80vh] relative" onClick={(e) => e.stopPropagation()}>
            {previewModal.mediaType === 'video' && previewModal.videoSource ? (
              // Video with playable source
              <video
                src={previewModal.videoSource}
                controls
                autoPlay
                muted
                playsInline
                poster={previewModal.thumbnailUrl}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              >
                Your browser does not support video playback.
              </video>
            ) : previewModal.mediaType === 'video' ? (
              // Video without playable source - show thumbnail with message
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  {previewModal.thumbnailUrl ? (
                    <img
                      src={previewModal.thumbnailUrl}
                      alt={previewModal.name}
                      className="max-w-full max-h-[60vh] rounded-lg shadow-2xl object-contain"
                    />
                  ) : (
                    <div className="w-80 h-48 bg-zinc-800 rounded-lg flex items-center justify-center">
                      <Video className="w-16 h-16 text-zinc-600" />
                    </div>
                  )}
                  {/* Video icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center">
                      <Video className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-zinc-400 text-sm">Video preview not available</p>
              </div>
            ) : (
              // Image preview
              <img
                src={previewModal.previewUrl}
                alt={previewModal.name}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
              />
            )}
          </div>

          {/* Title bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur px-4 py-2 rounded-lg max-w-[90vw]">
            <p className="text-white text-sm font-medium truncate">{previewModal.name}</p>
          </div>
        </div>
      )}

      {/* Fatigue/Burnout Chart Popover */}
      {fatigueChartEntity && fatigueAnchorRect && userId && apiDateRange && (
        <FatigueBurnoutPopover
          entity={fatigueChartEntity}
          userId={userId}
          since={apiDateRange.since}
          until={apiDateRange.until}
          anchorRect={fatigueAnchorRect}
          onClose={() => {
            setFatigueChartEntity(null)
            setFatigueAnchorRect(null)
          }}
        />
      )}
    </div>
  )
}
