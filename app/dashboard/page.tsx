'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, Trash2, RefreshCw, UserPlus, ShoppingBag, Activity, Settings, Plus } from 'lucide-react'
import { StatCard, StatIcons } from '@/components/stat-card'
import { PrimaryStatCard } from '@/components/primary-stat-card'
import { BudgetStatCard } from '@/components/budget-stat-card'
import { SecondaryStatsPills } from '@/components/secondary-stats-pills'
import { PerformanceTable, HierarchyNode } from '@/components/performance-table'
import { StatusChangeModal, DeleteEntityModal } from '@/components/confirm-modal'
import { EditEntityModal } from '@/components/edit-entity-modal'
import { EntityInfoModal } from '@/components/entity-info-modal'
import { InlineDuplicateModal } from '@/components/inline-duplicate-modal'
import { BulkActionToolbar, SelectedItem } from '@/components/bulk-action-toolbar'
import { BulkOperationProgress } from '@/components/bulk-operation-progress'
import { LogWalkinModal } from '@/components/log-walkin-modal'
import { StarredAdsPopover } from '@/components/starred-ads-popover'
import { LaunchWizard, StarredAdForWizard } from '@/components/launch-wizard'
import { DatePicker, DatePickerButton, DATE_PRESETS } from '@/components/date-picker'
import { SyncOverlay } from '@/components/sync-overlay'
import { CSVRow } from '@/lib/csv-parser'
import { Rules, StarredAd } from '@/lib/supabase'
import { formatCurrency, formatNumber, formatROAS } from '@/lib/utils'
import { useSubscription } from '@/lib/subscription'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useAttribution } from '@/lib/attribution'
import Link from 'next/link'
import { FEATURES } from '@/lib/feature-flags'
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

// Shared localStorage keys for date preferences (used by dashboard and insights)
const DATE_STORAGE_KEY = 'killscale_date_preference'

type DatePreference = {
  preset: string
  customStart?: string
  customEnd?: string
}

function loadDatePreference(): DatePreference {
  if (typeof window === 'undefined') return { preset: 'last_30d' }
  try {
    const stored = sessionStorage.getItem(DATE_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { preset: 'last_30d' }
}

function saveDatePreference(pref: DatePreference): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DATE_STORAGE_KEY, JSON.stringify(pref))
  } catch (e) {
    // Ignore storage errors
  }
}

type VerdictFilter = 'all' | 'scale' | 'watch' | 'kill' | 'learn'

const formatPercent = (value: number) => {
  if (!isFinite(value) || isNaN(value)) return '0.00%'
  return value.toFixed(2) + '%'
}

const formatCPA = (spend: number, purchases: number) => {
  if (purchases === 0) return '—'
  return formatCurrency(spend / purchases)
}

const formatAOV = (revenue: number, purchases: number) => {
  if (purchases === 0) return '—'
  return formatCurrency(revenue / purchases)
}

const formatCPM = (spend: number, impressions: number) => {
  if (impressions === 0) return '—'
  return formatCurrency((spend / impressions) * 1000)
}

const formatCPC = (spend: number, clicks: number) => {
  if (clicks === 0) return '—'
  return formatCurrency(spend / clicks)
}

// Cache for synced data - persists across workspace/account switches
// Key: accountId or 'workspace:workspaceId', Value: { data, datePreset, fetchedAt }
type CacheEntry = {
  data: CSVRow[]
  datePreset: string
  customStartDate?: string
  customEndDate?: string
  fetchedAt: number
}
const dataCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const SESSION_CACHE_KEY = 'ks_dashboard_cache'

// Persist cache to sessionStorage for faster navigation
const saveToSessionCache = (key: string, entry: CacheEntry) => {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || '{}')
    existing[key] = entry
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(existing))
  } catch (e) {
    // Storage full or other error - ignore
  }
}

const loadFromSessionCache = (key: string): CacheEntry | null => {
  try {
    const existing = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || '{}')
    return existing[key] || null
  } catch (e) {
    return null
  }
}

// Initialize in-memory cache from sessionStorage on module load
if (typeof window !== 'undefined') {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || '{}')
    Object.entries(stored).forEach(([key, entry]) => {
      dataCache.set(key, entry as CacheEntry)
    })
  } catch (e) {
    // Ignore parse errors
  }
}

// Helper to detect Google vs Meta accounts
// Meta accounts start with 'act_', Google customer IDs don't
const isGoogleAccount = (accountId: string | null): boolean => {
  if (!accountId) return false
  return FEATURES.GOOGLE_ADS_INTEGRATION && !accountId.startsWith('act_')
}

// Helper to get cache key (account-based only - date range validation is separate)
const getCacheKey = (accountId: string | null, workspaceAccountIds: string[]): string => {
  if (workspaceAccountIds.length > 0) {
    return `workspace:${workspaceAccountIds.sort().join(',')}`
  }
  return accountId || 'none'
}

// Helper to calculate date range from preset (for server-side filtering)
const getDateRangeFromPreset = (preset: string, customStart?: string, customEnd?: string): { since: string; until: string } => {
  const today = new Date()
  const formatDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (preset === 'custom' && customStart && customEnd) {
    return { since: customStart, until: customEnd }
  }

  switch (preset) {
    case 'today':
      return { since: formatDate(today), until: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { since: formatDate(yesterday), until: formatDate(yesterday) }
    }
    case 'last_7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_14d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 13)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_90d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 89)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { since: formatDate(start), until: formatDate(today) }
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { since: formatDate(start), until: formatDate(end) }
    }
    case 'maximum':
    default:
      return { since: '2000-01-01', until: formatDate(today) }
  }
}

// Helper to check if cached data covers the requested date range
// NO TTL - historical data is COMPLETE and never changes
// last_30d synced at 10am is identical at 5pm
const isCacheValid = (cache: CacheEntry, datePreset: string, customStart?: string, customEnd?: string): boolean => {
  // Same preset = always valid (historical data never changes)
  if (cache.datePreset === datePreset) {
    if (datePreset === 'custom') {
      return cache.customStartDate === customStart && cache.customEndDate === customEnd
    }
    return true
  }

  // Cached range is longer than requested = valid (can filter down client-side)
  const presetDays: Record<string, number> = {
    'today': 1, 'yesterday': 1, 'last_7d': 7, 'last_14d': 14, 'last_30d': 30, 'last_90d': 90, 'this_month': 31, 'last_month': 31
  }
  const cachedDays = presetDays[cache.datePreset] || 0
  const requestedDays = presetDays[datePreset] || 0

  return cachedDays >= requestedDays && requestedDays > 0
}

// Fetch manual events for a workspace and aggregate by ad_id
// Returns { [ad_id]: { revenue, count } }
const fetchManualEvents = async (
  workspaceId: string,
  dateStart: string,
  dateEnd: string
): Promise<Record<string, { revenue: number; count: number }>> => {
  try {
    // First get the workspace's pixel_id
    const { data: wsPixel, error: pixelError } = await supabase
      .from('workspace_pixels')
      .select('pixel_id')
      .eq('workspace_id', workspaceId)
      .single()

    if (pixelError || !wsPixel) {
      console.log('[ManualEvents] No workspace pixel found:', workspaceId)
      return {}
    }

    // Fetch manual events in the date range
    const endDate = new Date(dateEnd)
    endDate.setDate(endDate.getDate() + 1) // Include the end date

    const { data: events, error } = await supabase
      .from('pixel_events')
      .select('utm_content, event_value')
      .eq('pixel_id', wsPixel.pixel_id)
      .eq('source', 'manual')
      .gte('event_time', dateStart)
      .lt('event_time', endDate.toISOString())

    if (error || !events) {
      console.log('[ManualEvents] Error fetching events:', error)
      return {}
    }

    // Aggregate by ad_id (utm_content)
    const byAdId: Record<string, { revenue: number; count: number }> = {}
    events.forEach(event => {
      const adId = event.utm_content
      if (!adId) return // Skip unattributed events

      if (!byAdId[adId]) {
        byAdId[adId] = { revenue: 0, count: 0 }
      }
      byAdId[adId].revenue += event.event_value || 0
      byAdId[adId].count += 1
    })

    console.log('[ManualEvents] Loaded:', {
      pixelId: wsPixel.pixel_id,
      dateRange: { dateStart, dateEnd },
      totalEvents: events.length,
      attributedAds: Object.keys(byAdId).length
    })

    return byAdId
  } catch (err) {
    console.error('[ManualEvents] Error:', err)
    return {}
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<CSVRow[]>([])
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [isLoading, setIsLoading] = useState(false) // Start false, only show on first load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false) // Track if we've ever loaded
  const hasTriggeredInitialSync = useRef(false) // Track if we've triggered auto-sync on first load
  const userManuallyDeselected = useRef(false) // Track if user manually deselected all
  const [pendingInitialSync, setPendingInitialSync] = useState<string | null>(null) // Account ID to sync on first load
  const [pendingWorkspaceSync, setPendingWorkspaceSync] = useState(false) // Workspace sync on first load
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all')
  const [includePaused, setIncludePaused] = useState(false)
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [datePreset, setDatePreset] = useState(() => {
    if (typeof window !== 'undefined') {
      const pref = loadDatePreference()
      return pref.preset
    }
    return 'last_30d'
  })
  const [customStartDate, setCustomStartDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const pref = loadDatePreference()
      return pref.customStart || ''
    }
    return ''
  })
  const [customEndDate, setCustomEndDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const pref = loadDatePreference()
      return pref.customEnd || ''
    }
    return ''
  })
  const [showCustomDateInputs, setShowCustomDateInputs] = useState(false)
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple') // Simple by default
  const [tableExpanded, setTableExpanded] = useState(false)
  const [expandTrigger, setExpandTrigger] = useState(0)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [sortField, setSortField] = useState<'name' | 'spend' | 'revenue' | 'roas' | 'results' | 'cpr'>('spend')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [statusChangeModal, setStatusChangeModal] = useState<{
    isOpen: boolean
    entityId: string
    entityType: 'campaign' | 'adset' | 'ad'
    entityName: string
    action: 'pause' | 'resume'
    platform?: 'meta' | 'google'
    accountId?: string | null  // Meta ad_account_id or Google customer_id
  } | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  // Row action modals
  const [editModal, setEditModal] = useState<{
    entityType: 'campaign' | 'adset' | 'ad'
    entityId: string
    entityName: string
    campaignName?: string
    adsetId?: string
  } | null>(null)
  const [infoModal, setInfoModal] = useState<{
    entityType: 'adset' | 'ad'
    entityId: string
    entityName: string
  } | null>(null)
  const [duplicateModal, setDuplicateModal] = useState<{
    itemType: 'campaign' | 'adset' | 'ad'
    itemId: string
    itemName: string
    parentCampaignId?: string
    parentAdsetId?: string
  } | null>(null)
  const [deleteModal, setDeleteModal] = useState<{
    entityType: 'campaign' | 'adset' | 'ad'
    entityId: string
    entityName: string
    childCount?: { adsets?: number; ads?: number }
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [highlightEntity, setHighlightEntity] = useState<{
    type: 'campaign' | 'adset' | 'ad'
    name: string
    campaignName?: string
    adsetName?: string
  } | null>(null)
  const [showWalkinModal, setShowWalkinModal] = useState(false)
  const [starredAds, setStarredAds] = useState<StarredAd[]>([])
  const [starCountMap, setStarCountMap] = useState<Record<string, number>>({})
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [launchWizardEntityType, setLaunchWizardEntityType] = useState<'campaign' | 'adset' | 'ad' | 'performance-set'>('campaign')
  const [showClearStarsPrompt, setShowClearStarsPrompt] = useState(false)
  const [performanceSetAdIds, setPerformanceSetAdIds] = useState<string[]>([])
  // Manual events aggregated by ad_id: { [ad_id]: { revenue, count } }
  const [manualEventsByAd, setManualEventsByAd] = useState<Record<string, { revenue: number; count: number }>>({})
  // Workspace attribution display toggle
  const [showAttribution, setShowAttribution] = useState(true)
  const [showAttributionSettings, setShowAttributionSettings] = useState(false)
  // Bulk selection state
  const [bulkSelectedItems, setBulkSelectedItems] = useState<Map<string, SelectedItem>>(new Map())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkLoadingAction, setBulkLoadingAction] = useState<'pause' | 'resume' | 'delete' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{
    isOpen: boolean
    title: string
    total: number
    completed: number
    failed: number
    currentItem: string
    results: Array<{ id: string; name: string; success: boolean; error?: string }>
  } | null>(null)
  const { plan } = useSubscription()
  const { user } = useAuth()
  const { currentAccountId, accounts, workspaceAccountIds, currentWorkspaceId } = useAccount()
  const {
    isKillScaleActive,
    attributionData,
    lastTouchAttribution,
    multiTouchAttribution,
    isMultiTouchModel,
    refreshAttribution,
    businessType,
    revenueSource,
    shopifyAttribution,
    shopifyTotals,
    hasShopify,
    refreshShopifyAttribution,
    hasUppromote,
    uppromoteTotals,
    refreshUppromoteAttribution
  } = useAttribution()
  const searchParams = useSearchParams()

  // Shopify embed detection logging - TEMPORARY
  useEffect(() => {
    console.log('=== KillScale Embed Detection ===')
    console.log('Full URL:', window.location.href)
    console.log('Search params:', window.location.search)
    console.log('Is in iframe:', window.self !== window.top)
    console.log('Referrer:', document.referrer)
    // @ts-ignore - ancestorOrigins may not be available in all browsers
    console.log('Ancestor origins:', window.location.ancestorOrigins ? Array.from(window.location.ancestorOrigins) : 'Not available')
  }, [])

  // Handle deep-linking from alerts page
  useEffect(() => {
    const entityType = searchParams.get('highlight') as 'campaign' | 'adset' | 'ad' | null
    const entityName = searchParams.get('name')
    const campaignName = searchParams.get('campaign')
    const adsetName = searchParams.get('adset')

    if (entityType && entityName) {
      setHighlightEntity({
        type: entityType,
        name: entityName,
        campaignName: campaignName || undefined,
        adsetName: adsetName || undefined,
      })
      // Clear URL params after setting highlight
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams])

  // Load saved view mode on mount
  useEffect(() => {
    const savedViewMode = localStorage.getItem('killscale_viewMode')
    if (savedViewMode === 'simple' || savedViewMode === 'detailed') setViewMode(savedViewMode)
  }, [])

  // Save view mode when it changes
  useEffect(() => {
    localStorage.setItem('killscale_viewMode', viewMode)
  }, [viewMode])

  // Load/save showAttribution preference per workspace
  useEffect(() => {
    if (currentWorkspaceId) {
      const saved = localStorage.getItem(`killscale_workspace_${currentWorkspaceId}_showAttribution`)
      if (saved !== null) {
        setShowAttribution(saved === 'true')
      } else {
        setShowAttribution(true) // default to true for new workspaces
      }
    }
  }, [currentWorkspaceId])

  useEffect(() => {
    if (currentWorkspaceId) {
      localStorage.setItem(`killscale_workspace_${currentWorkspaceId}_showAttribution`, String(showAttribution))
    }
  }, [currentWorkspaceId, showAttribution])

  // Save date preferences when they change
  useEffect(() => {
    saveDatePreference({
      preset: datePreset,
      customStart: customStartDate || undefined,
      customEnd: customEndDate || undefined
    })
  }, [datePreset, customStartDate, customEndDate])

  // Compute starred ad IDs for quick lookup
  const starredAdIds = useMemo(() => {
    return new Set(starredAds.map(ad => ad.ad_id))
  }, [starredAds])

  // Compute starred creative IDs for deduplication check
  const starredCreativeIds = useMemo(() => {
    return new Set(starredAds.filter(ad => ad.creative_id).map(ad => ad.creative_id!))
  }, [starredAds])

  // Compute star counts per creative for universal performer detection
  const starredCreativeCounts = useMemo(() => {
    return new Map(Object.entries(starCountMap))
  }, [starCountMap])

  // Load starred ads when account changes
  const loadStarredAds = async (accountId: string) => {
    if (!user?.id) return
    try {
      const response = await fetch(`/api/starred?userId=${user.id}&adAccountId=${accountId}`)
      if (response.ok) {
        const data = await response.json()
        setStarredAds(data.starred || [])
        setStarCountMap(data.starCountMap || {})
      }
    } catch (error) {
      console.error('Failed to load starred ads:', error)
    }
  }

  // Handle starring an ad
  const handleStarAd = async (ad: {
    adId: string
    adName: string
    adsetId: string
    adsetName: string
    campaignId: string
    campaignName: string
    creativeId?: string  // Optional - for tracking across audiences
    spend: number
    revenue: number
    roas: number
  }) => {
    if (!user?.id || !currentAccountId) return
    try {
      const response = await fetch('/api/starred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          adId: ad.adId,
          adName: ad.adName,
          adsetId: ad.adsetId,
          adsetName: ad.adsetName,
          campaignId: ad.campaignId,
          campaignName: ad.campaignName,
          creativeId: ad.creativeId,
          spend: ad.spend,
          revenue: ad.revenue,
          roas: ad.roas
        })
      })
      if (response.ok) {
        const data = await response.json()
        // Check if this ad already exists (upsert case) - replace instead of add
        setStarredAds(prev => {
          const existingIndex = prev.findIndex(s => s.ad_id === ad.adId)
          if (existingIndex >= 0) {
            // Replace existing entry
            const updated = [...prev]
            updated[existingIndex] = data.starred
            return updated
          }
          // New entry
          return [...prev, data.starred]
        })

        // Update star count if creative is tracked
        if (ad.creativeId && data.starCount) {
          setStarCountMap(prev => ({
            ...prev,
            [ad.creativeId!]: data.starCount
          }))
        }
      }
    } catch (error) {
      console.error('Failed to star ad:', error)
    }
  }

  // Handle unstarring an ad
  const handleUnstarAd = async (adId: string) => {
    if (!user?.id || !currentAccountId) return
    try {
      const response = await fetch('/api/starred', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          adId
        })
      })
      if (response.ok) {
        setStarredAds(prev => prev.filter(ad => ad.ad_id !== adId))
      }
    } catch (error) {
      console.error('Failed to unstar ad:', error)
    }
  }

  // Handle opening the launch wizard for Performance Set
  const handleBuildPerformanceSet = () => {
    setLaunchWizardEntityType('performance-set')
    setShowLaunchWizard(true)
  }

  // Handle clearing multiple stars at once (after Performance Set creation)
  const handleClearStars = async (adIds: string[]) => {
    if (!user?.id || !currentAccountId) return
    try {
      // Delete each starred ad
      await Promise.all(adIds.map(adId =>
        fetch('/api/starred', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            adId
          })
        })
      ))
      // Update local state
      setStarredAds(prev => prev.filter(ad => !adIds.includes(ad.ad_id)))
    } catch (error) {
      console.error('Failed to clear stars:', error)
    }
  }
  
  const canSync = true // All plans can sync via Meta API
  const planLower = plan?.toLowerCase() || ''
  const isProPlus = planLower === 'pro' || planLower === 'agency'
  
  // Initial data load - checks last_sync_at to decide if sync is needed
  useEffect(() => {
    if (!user) return

    const initialLoad = async () => {
      // First load data from Supabase (instant — reads stored data)
      await loadData()

      // Check if we should trigger auto-sync (only once per page load)
      if (hasTriggeredInitialSync.current) return
      hasTriggeredInitialSync.current = true

      // Check last_sync_at from meta_connections to decide if sync is needed
      // If >24 hours ago (or never synced) → trigger append sync
      // If <24 hours ago → data is fresh, skip sync
      const { data: metaConn } = await supabase
        .from('meta_connections')
        .select('last_sync_at')
        .eq('user_id', user.id)
        .single()

      const lastSyncAt = metaConn?.last_sync_at ? new Date(metaConn.last_sync_at) : null
      const hoursSinceSync = lastSyncAt ? (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60) : Infinity

      if (hoursSinceSync > 24) {
        console.log('[Dashboard] Data stale (last sync:', lastSyncAt ? `${Math.round(hoursSinceSync)}h ago` : 'never', ') - triggering auto sync')

        // Workspace mode: sync all workspace accounts
        if (workspaceAccountIds.length > 0) {
          console.log('[Dashboard] Syncing workspace -', workspaceAccountIds.length, 'accounts')
          setPendingWorkspaceSync(true)
        } else {
          // Single account mode
          const accountToSync = currentAccountId || accounts[0]?.id
          if (accountToSync && accounts.length > 0) {
            console.log('[Dashboard] Syncing single account:', accountToSync)
            setPendingInitialSync(accountToSync)
          }
        }
      } else {
        console.log('[Dashboard] Data fresh (synced', Math.round(hoursSinceSync), 'h ago) - loading from Supabase only')
      }
    }

    initialLoad()
  }, [user?.id, accounts.length]) // Include accounts.length to re-run when accounts load

  // Execute pending initial sync (separate effect so state updates have settled)
  useEffect(() => {
    if (pendingInitialSync && !isSyncing) {
      console.log('[Dashboard] Executing auto sync for', pendingInitialSync)
      setPendingInitialSync(null) // Clear before executing to prevent loops
      handleSyncAccount(pendingInitialSync)
    }
  }, [pendingInitialSync, isSyncing])

  // Execute pending workspace sync (separate effect for workspace mode)
  useEffect(() => {
    if (pendingWorkspaceSync && !isSyncing && workspaceAccountIds.length > 0) {
      console.log('[Dashboard] Executing auto workspace sync for', workspaceAccountIds.length, 'accounts')
      setPendingWorkspaceSync(false) // Clear before executing to prevent loops
      handleSyncWorkspace()
    }
  }, [pendingWorkspaceSync, isSyncing, workspaceAccountIds])

  // Check cache when switching accounts/workspaces
  useEffect(() => {
    if (!user) return
    // Skip cache check if no account/workspace selected
    if (!currentAccountId && workspaceAccountIds.length === 0) return

    const cacheKey = getCacheKey(currentAccountId, workspaceAccountIds)
    let cached = dataCache.get(cacheKey)

    // If not in memory, try sessionStorage
    if (!cached) {
      const sessionCached = loadFromSessionCache(cacheKey)
      if (sessionCached) {
        cached = sessionCached
        dataCache.set(cacheKey, cached)
      }
    }

    if (cached && isCacheValid(cached, datePreset, customStartDate, customEndDate)) {
      // Use cached data
      setData(cached.data)
      console.log('[Cache] Using cached data for', cacheKey)
    } else {
      // No valid cache - reload from Supabase (silent, no loading spinner)
      console.log('[Cache] Miss for', cacheKey, '- loading from Supabase')
      loadData(false)
    }
  }, [currentAccountId, workspaceAccountIds, user?.id])

  // Load rules when account changes (from context)
  useEffect(() => {
    if (user) {
      loadRules(currentAccountId)
    }
  }, [user?.id, currentAccountId])

  // Refresh KillScale attribution when date range changes
  useEffect(() => {
    console.log('[Dashboard] Attribution effect running:', {
      isKillScaleActive,
      hasShopify,
      datePreset,
      shopifyAttributionSize: Object.keys(shopifyAttribution).length,
      revenueSource
    })

    // Calculate date range for attribution refresh
    const today = new Date()
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    let since: string, until: string
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      since = customStartDate
      until = customEndDate
    } else {
      const daysMap: Record<string, number> = {
        'today': 0, 'yesterday': 1, 'last_7d': 6, 'last_14d': 13,
        'last_30d': 29, 'last_90d': 89, 'maximum': 365 * 10
      }
      const days = daysMap[datePreset] ?? 29
      const start = new Date(today)
      start.setDate(start.getDate() - days)
      since = formatDate(start)
      // For "yesterday" and "today", end date should be same as start (single day)
      // For ranges like "last_7d", end date is today
      if (datePreset === 'yesterday') {
        until = since // Yesterday only
      } else {
        until = formatDate(today)
      }
    }

    // Refresh KillScale attribution if active
    if (isKillScaleActive) {
      console.log('[Dashboard] Calling refreshAttribution with:', { since, until })
      refreshAttribution(since, until)
    }

    // Refresh Shopify attribution if connected
    if (hasShopify) {
      console.log('[Dashboard] Calling refreshShopifyAttribution with:', { since, until })
      refreshShopifyAttribution(since, until)
    }

    // Refresh UpPromote attribution if connected
    if (FEATURES.UPPROMOTE && hasUppromote) {
      console.log('[Dashboard] Calling refreshUppromoteAttribution with:', { since, until })
      refreshUppromoteAttribution(since, until)
    }
  }, [isKillScaleActive, hasShopify, hasUppromote, datePreset, customStartDate, customEndDate, refreshAttribution, refreshShopifyAttribution, refreshUppromoteAttribution])

  // Load manual events when workspace or date range changes
  // Manual events supplement both Meta and KillScale attribution
  useEffect(() => {
    if (!currentWorkspaceId) {
      setManualEventsByAd({})
      return
    }

    // Calculate date range for manual events
    const today = new Date()
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    let since: string, until: string
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      since = customStartDate
      until = customEndDate
    } else {
      const daysMap: Record<string, number> = {
        'today': 0, 'yesterday': 1, 'last_7d': 6, 'last_14d': 13,
        'last_30d': 29, 'last_90d': 89, 'maximum': 365 * 10
      }
      const days = daysMap[datePreset] ?? 29
      const start = new Date(today)
      start.setDate(start.getDate() - days)
      since = formatDate(start)
      // For "yesterday", end date should be same as start (single day)
      if (datePreset === 'yesterday') {
        until = since
      } else {
        until = formatDate(today)
      }
    }

    fetchManualEvents(currentWorkspaceId, since, until).then(setManualEventsByAd)
  }, [currentWorkspaceId, datePreset, customStartDate, customEndDate])

  // Track which sync param we've already processed (to prevent re-runs)
  const processedSyncRef = useRef<string | null>(null)

  // Auto-sync when coming from sidebar account selection
  useEffect(() => {
    const syncAccountId = searchParams.get('sync')
    if (syncAccountId && user && canSync && processedSyncRef.current !== syncAccountId) {
      // Mark as processed to prevent re-runs
      processedSyncRef.current = syncAccountId
      // Clear the URL param
      window.history.replaceState({}, '', '/dashboard')
      // Trigger sync for the selected account
      handleSyncAccount(syncAccountId)
    }
  }, [searchParams, user?.id, canSync])

  // Use currentAccountId from AccountContext as the single source of truth
  const selectedAccountId = currentAccountId

  // Track previous account/workspace to detect actual switches (not initial load)
  const prevAccountIdRef = useRef<string | undefined>(undefined)
  const prevWorkspaceKeyRef = useRef<string | undefined>(undefined)

  // Reset campaign selection when switching accounts or workspaces (not on initial load)
  useEffect(() => {
    const currentWorkspaceKey = workspaceAccountIds.length > 0
      ? workspaceAccountIds.sort().join(',')
      : undefined

    // Check for workspace switch
    if (currentWorkspaceKey) {
      if (prevWorkspaceKeyRef.current && prevWorkspaceKeyRef.current !== currentWorkspaceKey) {
        setSelectedCampaigns(new Set())
        userManuallyDeselected.current = false // Reset so new workspace auto-selects
      }
      prevWorkspaceKeyRef.current = currentWorkspaceKey
      prevAccountIdRef.current = undefined // Clear account tracking when in workspace mode
      return
    }

    // Check for individual account switch
    if (selectedAccountId) {
      if (prevAccountIdRef.current && prevAccountIdRef.current !== selectedAccountId) {
        setSelectedCampaigns(new Set())
        userManuallyDeselected.current = false // Reset so new account auto-selects
      }
      prevAccountIdRef.current = selectedAccountId
      prevWorkspaceKeyRef.current = undefined // Clear workspace tracking when in account mode
    }
  }, [selectedAccountId, workspaceAccountIds])

  // Load starred ads when account changes
  useEffect(() => {
    if (selectedAccountId && user?.id) {
      loadStarredAds(selectedAccountId)
    } else {
      setStarredAds([])
    }
  }, [selectedAccountId, user?.id])

  // Track if this is the initial mount (to prevent auto-sync on page load)
  // Re-query Supabase when date preset changes (no sync, just re-read stored data)
  const isInitialMount = useRef(true)

  useEffect(() => {
    // Skip initial mount (initial load handles this)
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (!user) return
    if (datePreset === 'custom') return // Custom dates handled by handleCustomDateApply

    console.log('[Dashboard] Date preset changed to', datePreset, '- re-querying Supabase (no sync)')
    loadData(false) // Re-query stored data with new date filter, no loading spinner
  }, [datePreset])

  const isLoadingData = useRef(false)

  const loadData = async (showLoading = true) => {
    if (!user) return

    // Prevent concurrent loads
    if (isLoadingData.current) {
      console.log('[loadData] Already loading, skipping')
      return
    }
    isLoadingData.current = true

    const startTime = Date.now()
    console.log('[loadData] Starting for account:', currentAccountId)

    // Only show loading spinner on very first load (never loaded before)
    if (showLoading && !hasLoadedOnce) {
      setIsLoading(true)
    }

    // Calculate date range for filtering
    const dateRange = getDateRangeFromPreset(datePreset, customStartDate, customEndDate)
    console.log('[loadData] Date range:', dateRange.since, 'to', dateRange.until)

    // Build query with account AND date filters to minimize data transfer
    let query = supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .gte('date_start', dateRange.since)
      .lte('date_start', dateRange.until)

    // Filter by account(s) to reduce data fetched
    if (workspaceAccountIds.length > 0) {
      query = query.in('ad_account_id', workspaceAccountIds)
    } else if (currentAccountId) {
      query = query.eq('ad_account_id', currentAccountId)
    }

    const { data: adData, error } = await query
      .order('date_start', { ascending: false })
    console.log('[loadData] Supabase query took', Date.now() - startTime, 'ms, got', adData?.length || 0, 'rows')

    let rows: CSVRow[] = []

    if (adData && !error) {
      rows = adData.map(row => ({
        ad_account_id: row.ad_account_id, // Include for account filtering
        date_start: row.date_start,
        date_end: row.date_end,
        campaign_name: row.campaign_name,
        campaign_id: row.campaign_id,
        adset_name: row.adset_name,
        adset_id: row.adset_id,
        ad_name: row.ad_name,
        ad_id: row.ad_id,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: parseFloat(row.spend),
        purchases: row.purchases,
        // Use result_value (calculated from event_values for lead-gen) if available, otherwise fall back to revenue
        revenue: parseFloat(row.result_value) || parseFloat(row.revenue) || 0,
        // Results-based tracking fields
        results: row.results || 0,
        result_value: row.result_value ?? null,
        result_type: row.result_type ?? null,
        status: row.status, // Ad's effective status (includes parent inheritance)
        adset_status: row.adset_status, // Adset's own status
        campaign_status: row.campaign_status, // Campaign's own status
        // Creative ID for thumbnail display
        creative_id: row.creative_id,
        // Creative preview data (from sync batch - no API calls needed)
        thumbnail_url: row.thumbnail_url,
        image_url: row.image_url,
        media_type: row.media_type,
        media_hash: row.media_hash,
        storage_url: row.storage_url,
        // Budget fields for CBO/ABO detection
        campaign_daily_budget: row.campaign_daily_budget,
        campaign_lifetime_budget: row.campaign_lifetime_budget,
        adset_daily_budget: row.adset_daily_budget,
        adset_lifetime_budget: row.adset_lifetime_budget,
        // Platform marker for display
        _platform: 'meta' as const,
      }))

      // Enrich with high-quality URLs from media_library
      try {
        // Derive account IDs from the actual data (context may not be ready yet)
        const acctIds = Array.from(new Set(
          rows.map(r => r.ad_account_id?.replace(/^act_/, '')).filter(Boolean)
        )) as string[]
        if (acctIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from('media_library')
            .select('media_hash, media_type, url, video_thumbnail_url, storage_url')
            .in('ad_account_id', acctIds)

          if (mediaRows && mediaRows.length > 0) {
            const mediaLookup = new Map<string, typeof mediaRows[0]>()
            for (const mr of mediaRows) {
              mediaLookup.set(mr.media_hash, mr)
            }

            // Build a reverse lookup: creative_id → original media_hash (from rows that DO match)
            // This handles derivative video IDs — Meta assigns different video_ids per placement,
            // but media_library only stores the original. We find the original via sibling rows.
            const creativeToOriginalHash = new Map<string, string>()
            for (const row of rows) {
              if (row.media_hash && row.creative_id && mediaLookup.has(row.media_hash as string)) {
                creativeToOriginalHash.set(row.creative_id as string, row.media_hash as string)
              }
            }

            let enriched = 0
            let loggedOne = false
            for (const row of rows) {
              if (row.media_hash) {
                // Try direct match first, then fallback to original hash via creative_id
                let media = mediaLookup.get(row.media_hash as string)
                if (!media && row.creative_id) {
                  const originalHash = creativeToOriginalHash.get(row.creative_id as string)
                  if (originalHash) media = mediaLookup.get(originalHash)
                }
                if (media) {
                  if (media.storage_url) {
                    row.storage_url = media.storage_url
                  }
                  if (media.media_type === 'image' && media.url) {
                    row.image_url = media.url
                    enriched++
                  }
                  if (media.media_type === 'video' && media.video_thumbnail_url) {
                    if (!loggedOne) {
                      console.log('[ENRICH] Before:', row.thumbnail_url?.slice(0, 80))
                      console.log('[ENRICH] After:', media.video_thumbnail_url?.slice(0, 80))
                      loggedOne = true
                    }
                    row.thumbnail_url = media.video_thumbnail_url
                    enriched++
                  }
                }
              }
            }
            console.log(`[Dashboard] Enriched ${enriched} rows from media_library`)
          }
        }
      } catch (mediaErr) {
        console.error('Media library enrichment failed:', mediaErr)
      }
    }

    // Load Google ad data if feature enabled
    if (FEATURES.GOOGLE_ADS_INTEGRATION) {
      let googleQuery = supabase
        .from('google_ad_data')
        .select('*')
        .eq('user_id', user.id)
        .gte('date_start', dateRange.since)
        .lte('date_start', dateRange.until)

      // Filter by account if specified (Google uses customer_id)
      if (workspaceAccountIds.length > 0) {
        const googleAccounts = workspaceAccountIds.filter(id => !id.startsWith('act_'))
        if (googleAccounts.length > 0) {
          googleQuery = googleQuery.in('customer_id', googleAccounts)
        }
      } else if (currentAccountId && !currentAccountId.startsWith('act_')) {
        googleQuery = googleQuery.eq('customer_id', currentAccountId)
      }

      const { data: googleData, error: googleError } = await googleQuery.order('date_start', { ascending: false })

      if (googleData && !googleError) {
        const googleRows = googleData.map(row => ({
          ad_account_id: row.customer_id, // Google uses customer_id
          date_start: row.date_start,
          date_end: row.date_end,
          campaign_name: row.campaign_name,
          campaign_id: row.campaign_id,
          // Map Google ad_group to adset fields for unified display
          adset_name: row.ad_group_name,
          adset_id: row.ad_group_id,
          ad_name: row.ad_name,
          ad_id: row.ad_id,
          impressions: row.impressions,
          clicks: row.clicks,
          spend: parseFloat(row.spend),
          purchases: row.conversions || 0,
          revenue: parseFloat(row.conversions_value) || 0,
          results: row.results || 0,
          result_value: row.result_value ?? null,
          result_type: row.result_type ?? null,
          status: row.ad_status,
          adset_status: row.ad_group_status,
          campaign_status: row.campaign_status,
          // Google is always CBO - budget at campaign level only
          campaign_daily_budget: row.campaign_budget,
          campaign_lifetime_budget: null,
          adset_daily_budget: null,
          adset_lifetime_budget: null,
          // Platform marker for display
          _platform: 'google' as const,
          // Google budget resource name for mutations
          campaign_budget_resource_name: row.campaign_budget_resource_name,
        }))
        rows = [...rows, ...googleRows]
      }
    }

    setData(rows)
    // Note: Campaign selection is now handled by the useEffect that watches accountFilteredData
    // This ensures selection is always for the currently selected account
    setHasLoadedOnce(true)
    setIsLoading(false)
    isLoadingData.current = false
    console.log('[loadData] Complete, loaded', rows.length, 'rows in', Date.now() - startTime, 'ms')
  }

  // Load data and cache for specific account or workspace
  const loadDataAndCache = async (accountId: string | null, wsAccountIds: string[] = []) => {
    if (!user) return
    console.log('[loadDataAndCache] Starting for account:', accountId, 'workspace accounts:', wsAccountIds.length)

    // Calculate date range for filtering
    const dateRange = getDateRangeFromPreset(datePreset, customStartDate, customEndDate)

    // Build query with account AND date filters
    let query = supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .gte('date_start', dateRange.since)
      .lte('date_start', dateRange.until)

    // Filter by account(s) to reduce data fetched
    if (wsAccountIds.length > 0) {
      query = query.in('ad_account_id', wsAccountIds)
    } else if (accountId) {
      query = query.eq('ad_account_id', accountId)
    }

    const { data: adData, error } = await query.order('date_start', { ascending: false })

    let rows: CSVRow[] = []

    if (adData && !error) {
      rows = adData.map(row => ({
        ad_account_id: row.ad_account_id,
        date_start: row.date_start,
        date_end: row.date_end,
        campaign_name: row.campaign_name,
        campaign_id: row.campaign_id,
        adset_name: row.adset_name,
        adset_id: row.adset_id,
        ad_name: row.ad_name,
        ad_id: row.ad_id,
        impressions: row.impressions,
        clicks: row.clicks,
        spend: parseFloat(row.spend),
        purchases: row.purchases,
        revenue: parseFloat(row.result_value) || parseFloat(row.revenue) || 0,
        results: row.results || 0,
        result_value: row.result_value ?? null,
        result_type: row.result_type ?? null,
        status: row.status,
        adset_status: row.adset_status,
        campaign_status: row.campaign_status,
        // Creative ID for thumbnail display
        creative_id: row.creative_id,
        // Creative preview data (from sync batch - no API calls needed)
        thumbnail_url: row.thumbnail_url,
        image_url: row.image_url,
        media_type: row.media_type,
        media_hash: row.media_hash,
        storage_url: row.storage_url,
        campaign_daily_budget: row.campaign_daily_budget,
        campaign_lifetime_budget: row.campaign_lifetime_budget,
        adset_daily_budget: row.adset_daily_budget,
        adset_lifetime_budget: row.adset_lifetime_budget,
        // Platform marker for display
        _platform: 'meta' as const,
      }))

      // Enrich with high-quality URLs from media_library
      try {
        const acctIds = Array.from(new Set(
          rows.map(r => r.ad_account_id?.replace(/^act_/, '')).filter(Boolean)
        )) as string[]
        if (acctIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from('media_library')
            .select('media_hash, media_type, url, video_thumbnail_url, storage_url')
            .in('ad_account_id', acctIds)

          if (mediaRows && mediaRows.length > 0) {
            const mediaLookup = new Map<string, typeof mediaRows[0]>()
            for (const mr of mediaRows) {
              mediaLookup.set(mr.media_hash, mr)
            }

            // Build reverse lookup for derivative video IDs (same as loadData)
            const creativeToOriginalHash = new Map<string, string>()
            for (const row of rows) {
              if (row.media_hash && row.creative_id && mediaLookup.has(row.media_hash as string)) {
                creativeToOriginalHash.set(row.creative_id as string, row.media_hash as string)
              }
            }

            for (const row of rows) {
              if (row.media_hash) {
                let media = mediaLookup.get(row.media_hash as string)
                if (!media && row.creative_id) {
                  const originalHash = creativeToOriginalHash.get(row.creative_id as string)
                  if (originalHash) media = mediaLookup.get(originalHash)
                }
                if (media) {
                  if (media.storage_url) {
                    row.storage_url = media.storage_url
                  }
                  if (media.media_type === 'image' && media.url) {
                    row.image_url = media.url
                  }
                  if (media.media_type === 'video' && media.video_thumbnail_url) {
                    row.thumbnail_url = media.video_thumbnail_url
                  }
                }
              }
            }
          }
        }
      } catch (mediaErr) {
        console.error('Media library enrichment failed:', mediaErr)
      }
    }

    // Load Google ad data if feature enabled
    if (FEATURES.GOOGLE_ADS_INTEGRATION) {
      let googleQuery = supabase
        .from('google_ad_data')
        .select('*')
        .eq('user_id', user.id)
        .gte('date_start', dateRange.since)
        .lte('date_start', dateRange.until)

      // Filter by account if specified (Google uses customer_id)
      if (wsAccountIds.length > 0) {
        const googleAccounts = wsAccountIds.filter(id => !id.startsWith('act_'))
        if (googleAccounts.length > 0) {
          googleQuery = googleQuery.in('customer_id', googleAccounts)
        }
      } else if (accountId && !accountId.startsWith('act_')) {
        googleQuery = googleQuery.eq('customer_id', accountId)
      }

      const { data: googleData, error: googleError } = await googleQuery.order('date_start', { ascending: false })

      if (googleData && !googleError) {
        const googleRows = googleData.map(row => ({
          ad_account_id: row.customer_id,
          date_start: row.date_start,
          date_end: row.date_end,
          campaign_name: row.campaign_name,
          campaign_id: row.campaign_id,
          adset_name: row.ad_group_name,
          adset_id: row.ad_group_id,
          ad_name: row.ad_name,
          ad_id: row.ad_id,
          impressions: row.impressions,
          clicks: row.clicks,
          spend: parseFloat(row.spend),
          purchases: row.conversions || 0,
          revenue: parseFloat(row.conversions_value) || 0,
          results: row.results || 0,
          result_value: row.result_value ?? null,
          result_type: row.result_type ?? null,
          status: row.ad_status,
          adset_status: row.ad_group_status,
          campaign_status: row.campaign_status,
          campaign_daily_budget: row.campaign_budget,
          campaign_lifetime_budget: null,
          adset_daily_budget: null,
          adset_lifetime_budget: null,
          _platform: 'google' as const,
          campaign_budget_resource_name: row.campaign_budget_resource_name,
        }))
        rows = [...rows, ...googleRows]
      }
    }

    setData(rows)

    // Cache the relevant subset
    const cacheKey = getCacheKey(accountId, wsAccountIds)
    let cacheData: CSVRow[]

    if (wsAccountIds.length > 0) {
      cacheData = rows.filter(row => wsAccountIds.includes(row.ad_account_id || ''))
    } else if (accountId) {
      cacheData = rows.filter(row => row.ad_account_id === accountId)
    } else {
      cacheData = rows
    }

    const cacheEntry: CacheEntry = {
      data: cacheData,
      datePreset,
      customStartDate,
      customEndDate,
      fetchedAt: Date.now()
    }
    dataCache.set(cacheKey, cacheEntry)
    saveToSessionCache(cacheKey, cacheEntry)
    console.log('[Cache] Cached', cacheData.length, 'rows for', cacheKey)

    return rows
  }

  const loadRules = async (accountId?: string | null) => {
    if (!user) return

    // No account selected - use default rules
    if (!accountId) {
      setRules(DEFAULT_RULES)
      return
    }

    // Load rules for this specific account
    const { data: rulesData, error } = await supabase
      .from('rules')
      .select('*')
      .eq('user_id', user.id)
      .eq('ad_account_id', accountId)
      .single()

    if (rulesData && !error) {
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
    } else {
      // No rules configured for this account yet - use defaults
      setRules(DEFAULT_RULES)
    }
  }

  const handleClearData = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to clear all your ad data?')) return

    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)

    setData([])
    setSelectedCampaigns(new Set())
  }

  // Ref-based guard for sync (state updates are async so we need synchronous check)
  const syncingRef = useRef(false)
  const lastSyncCompletedRef = useRef<number>(0)
  const SYNC_COOLDOWN_MS = 5000 // 5 second cooldown between syncs

  // Sync a specific account (used by sidebar dropdown)
  const handleSyncAccount = async (accountId: string) => {
    if (!user || !canSync) return

    // Prevent duplicate syncs (both state and ref check)
    if (isSyncing || syncingRef.current) return

    // Enforce cooldown between syncs to prevent Meta API returning empty data
    const timeSinceLastSync = Date.now() - lastSyncCompletedRef.current
    if (timeSinceLastSync < SYNC_COOLDOWN_MS && lastSyncCompletedRef.current > 0) {
      console.log(`[Sync] Cooldown active - ${Math.ceil((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining`)
      return
    }

    syncingRef.current = true

    // Clear cache BEFORE sync to force fresh data
    dataCache.delete(accountId)

    setIsSyncing(true)

    try {
      // Determine sync endpoint based on account type
      const isGoogle = isGoogleAccount(accountId)
      const syncEndpoint = isGoogle ? '/api/google/sync' : '/api/meta/sync'

      // Build request body - Google uses different field names
      // Meta sync is append-only (no datePreset needed — sync endpoint determines range)
      const requestBody = isGoogle
        ? {
            userId: user.id,
            customerId: accountId,
            dateStart: datePreset === 'custom' ? customStartDate : undefined,
            dateEnd: datePreset === 'custom' ? customEndDate : undefined,
          }
        : {
            userId: user.id,
            adAccountId: accountId,
          }

      const response = await fetch(syncEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (response.ok) {
        // Silent refresh - don't show loading spinner, preserves table state
        const newData = await loadDataAndCache(accountId)
        setLastSyncTime(new Date())

        // After sync, ensure ABO adsets are selected (they may have been missed on initial load)
        // Google is always CBO so this mainly affects Meta accounts
        if (newData && newData.length > 0) {
          setSelectedCampaigns(prev => {
            const updated = new Set(prev)
            const seenAdsets = new Set<string>()
            newData.forEach(r => {
              // Ensure campaign is selected
              if (!updated.has(r.campaign_name)) {
                updated.add(r.campaign_name)
              }
              // Add ABO adsets that aren't selected yet
              const adsetKey = `${r.campaign_name}::${r.adset_name}`
              if (!seenAdsets.has(adsetKey)) {
                seenAdsets.add(adsetKey)
                const isAbo = (r.adset_daily_budget || r.adset_lifetime_budget) &&
                              !(r.campaign_daily_budget || r.campaign_lifetime_budget)
                if (isAbo && !updated.has(adsetKey)) {
                  updated.add(adsetKey)
                }
              }
            })
            return updated
          })
        }
      } else {
        alert(result.error || 'Sync failed')
      }
    } catch (err) {
      alert('Sync failed. Please try again.')
    }

    lastSyncCompletedRef.current = Date.now()
    syncingRef.current = false
    setIsSyncing(false)
  }

  // Sync all accounts in workspace
  const handleSyncWorkspace = async () => {
    if (!user || !canSync || workspaceAccountIds.length === 0) return
    if (isSyncing || syncingRef.current) return

    // Enforce cooldown between syncs
    const timeSinceLastSync = Date.now() - lastSyncCompletedRef.current
    if (timeSinceLastSync < SYNC_COOLDOWN_MS && lastSyncCompletedRef.current > 0) {
      console.log(`[Sync] Cooldown active - ${Math.ceil((SYNC_COOLDOWN_MS - timeSinceLastSync) / 1000)}s remaining`)
      return
    }

    syncingRef.current = true

    // Clear cache for ALL workspace accounts AND the workspace cache key BEFORE sync
    const workspaceCacheKey = getCacheKey(null, workspaceAccountIds)
    dataCache.delete(workspaceCacheKey)
    for (const accountId of workspaceAccountIds) {
      dataCache.delete(getCacheKey(accountId, []))
    }

    setIsSyncing(true)

    try {
      // Sync each account in the workspace sequentially
      // Route to appropriate endpoint based on account type
      for (const accountId of workspaceAccountIds) {
        const isGoogle = isGoogleAccount(accountId)
        const syncEndpoint = isGoogle ? '/api/google/sync' : '/api/meta/sync'

        // Meta sync is append-only (no datePreset needed — sync endpoint determines range)
        const requestBody = isGoogle
          ? {
              userId: user.id,
              customerId: accountId,
              dateStart: datePreset === 'custom' ? customStartDate : undefined,
              dateEnd: datePreset === 'custom' ? customEndDate : undefined,
            }
          : {
              userId: user.id,
              adAccountId: accountId,
            }

        const response = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const result = await response.json()
          console.error(`Sync failed for ${accountId}:`, result.error)
        }
      }

      // Refresh data after all syncs complete and cache for workspace
      await loadDataAndCache(null, workspaceAccountIds)
      setLastSyncTime(new Date())
    } catch (err) {
      alert('Sync failed. Please try again.')
    }

    lastSyncCompletedRef.current = Date.now()
    syncingRef.current = false
    setIsSyncing(false)
  }

  // Sync using the currently selected account or workspace
  const handleSync = async () => {
    if (workspaceAccountIds.length > 0) {
      await handleSyncWorkspace()
    } else if (selectedAccountId) {
      await handleSyncAccount(selectedAccountId)
    }
  }

  // Handle status change request (opens confirmation modal)
  const handleStatusChangeRequest = (
    entityId: string,
    entityType: 'campaign' | 'adset' | 'ad',
    entityName: string,
    newStatus: 'ACTIVE' | 'PAUSED',
    platform?: 'meta' | 'google',
    accountId?: string | null
  ) => {
    setStatusChangeModal({
      isOpen: true,
      entityId,
      entityType,
      entityName,
      action: newStatus === 'PAUSED' ? 'pause' : 'resume',
      platform,
      accountId,
    })
  }

  // Confirm and execute status change
  const handleStatusChangeConfirm = async () => {
    if (!statusChangeModal || !user) return

    setIsUpdatingStatus(true)

    try {
      const newStatus = statusChangeModal.action === 'pause' ? 'PAUSED' : 'ACTIVE'
      const isGoogle = statusChangeModal.platform === 'google'

      let response: Response

      if (isGoogle) {
        // Google Ads API
        response = await fetch('/api/google/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            customerId: statusChangeModal.accountId,
            entityId: statusChangeModal.entityId,
            entityType: statusChangeModal.entityType,
            status: newStatus,
          }),
        })
      } else {
        // Meta API (default)
        response = await fetch('/api/meta/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            entityId: statusChangeModal.entityId,
            entityType: statusChangeModal.entityType,
            status: newStatus,
          }),
        })
      }

      const result = await response.json()

      if (response.ok) {
        // Refresh data to reflect the change
        await loadData()
        setStatusChangeModal(null)
      } else {
        alert(result.error || 'Failed to update status')
      }
    } catch (err) {
      alert('Failed to update status. Please try again.')
    }

    setIsUpdatingStatus(false)
  }

  // Handle budget change
  const handleBudgetChange = async (
    entityId: string,
    entityType: 'campaign' | 'adset',
    newBudget: number,
    budgetType: 'daily' | 'lifetime',
    oldBudget?: number,
    platform?: 'meta' | 'google',
    accountId?: string | null,
    budgetResourceName?: string
  ) => {
    if (!user) throw new Error('Not authenticated')

    let response: Response

    if (platform === 'google') {
      // Google Ads API - only supports campaign-level budgets
      if (!budgetResourceName) {
        throw new Error('Budget resource name required for Google Ads')
      }
      response = await fetch('/api/google/update-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          customerId: accountId,
          campaignId: entityId,
          budgetResourceName,
          budget: newBudget,
          oldBudget,
        }),
      })
    } else {
      // Meta API (default)
      response = await fetch('/api/meta/update-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId,
          entityType,
          budget: newBudget,
          budgetType,
          oldBudget,
          adAccountId: accountId || selectedAccountId,
        }),
      })
    }

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update budget')
    }

    // Refresh data to reflect the change
    await loadData(false)
  }

  // Row action handlers
  const handleEditEntity = (node: HierarchyNode) => {
    setEditModal({
      entityType: node.type,
      entityId: node.id!,
      entityName: node.name,
      campaignName: node.campaignName,
      adsetId: node.adsetId || undefined,
    })
  }

  const handleInfoEntity = (node: HierarchyNode) => {
    if (node.type === 'campaign') return // Info not available for campaigns
    setInfoModal({
      entityType: node.type as 'adset' | 'ad',
      entityId: node.id!,
      entityName: node.name,
    })
  }

  const handleDuplicateEntity = (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => {
    setDuplicateModal({
      itemType: level,
      itemId: node.id!,
      itemName: node.name,
      parentCampaignId: node.campaignId || undefined,
      parentAdsetId: node.adsetId || undefined,
    })
  }

  const handleDeleteEntity = (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => {
    // Count children for cascade warning
    let childCount: { adsets?: number; ads?: number } | undefined
    if (node.children && node.children.length > 0) {
      if (level === 'campaign') {
        const adsetCount = node.children.length
        const adCount = node.children.reduce((sum, adset) => sum + (adset.children?.length || 0), 0)
        childCount = { adsets: adsetCount, ads: adCount }
      } else if (level === 'adset') {
        childCount = { ads: node.children.length }
      }
    }
    setDeleteModal({
      entityType: level,
      entityId: node.id!,
      entityName: node.name,
      childCount,
    })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteModal || !user) return

    setIsDeleting(true)
    try {
      const response = await fetch('/api/meta/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: deleteModal.entityId,
          entityType: deleteModal.entityType,
        }),
      })

      const result = await response.json()
      console.log('[Delete] Response:', response.ok, result)

      if (response.ok) {
        setDeleteModal(null)
        console.log('[Delete] Calling loadData() to refresh...')
        await loadData()
        console.log('[Delete] loadData() completed')
      } else {
        alert(result.error || 'Failed to delete')
      }
    } catch (err) {
      alert('Failed to delete. Please try again.')
    }
    setIsDeleting(false)
  }

  // Bulk selection handler
  const handleBulkSelectItem = (node: HierarchyNode, level: 'campaign' | 'adset' | 'ad') => {
    if (!node.id) return

    setBulkSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(node.id!)) {
        next.delete(node.id!)
      } else {
        next.set(node.id!, {
          id: node.id!,
          type: level,
          name: node.name,
          status: node.status || 'ACTIVE',
          parentCampaignId: node.campaignId || undefined,
          parentAdsetId: node.adsetId || undefined,
          budget: node.dailyBudget || node.lifetimeBudget || undefined,
          budgetType: node.dailyBudget ? 'daily' : node.lifetimeBudget ? 'lifetime' : undefined,
          isCBO: node.budgetType === 'CBO'
        })
      }
      return next
    })
  }

  const handleBulkClearSelection = () => {
    setBulkSelectedItems(new Map())
  }

  // Bulk pause action
  const handleBulkPause = async () => {
    if (!user || bulkSelectedItems.size === 0) return

    const items = Array.from(bulkSelectedItems.values())
    setBulkLoading(true)
    setBulkLoadingAction('pause')
    setBulkProgress({
      isOpen: true,
      title: 'Pausing items...',
      total: items.length,
      completed: 0,
      failed: 0,
      currentItem: '',
      results: []
    })

    try {
      const response = await fetch('/api/meta/bulk-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entities: items.map(item => ({
            entityId: item.id,
            entityType: item.type,
            name: item.name
          })),
          status: 'PAUSED'
        })
      })

      const result = await response.json()

      if (response.ok) {
        setBulkProgress(prev => prev ? {
          ...prev,
          completed: result.successCount || items.length,
          failed: result.failedCount || 0,
          results: result.results || []
        } : null)
        // Clear selection and reload data
        setBulkSelectedItems(new Map())
        await loadData()
      } else {
        alert(result.error || 'Bulk pause failed')
      }
    } catch (err) {
      alert('Bulk pause failed. Please try again.')
    }

    setBulkLoading(false)
    setBulkLoadingAction(null)
  }

  // Bulk resume action
  const handleBulkResume = async () => {
    if (!user || bulkSelectedItems.size === 0) return

    const items = Array.from(bulkSelectedItems.values())
    setBulkLoading(true)
    setBulkLoadingAction('resume')
    setBulkProgress({
      isOpen: true,
      title: 'Activating items...',
      total: items.length,
      completed: 0,
      failed: 0,
      currentItem: '',
      results: []
    })

    try {
      const response = await fetch('/api/meta/bulk-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entities: items.map(item => ({
            entityId: item.id,
            entityType: item.type,
            name: item.name
          })),
          status: 'ACTIVE'
        })
      })

      const result = await response.json()

      if (response.ok) {
        setBulkProgress(prev => prev ? {
          ...prev,
          completed: result.successCount || items.length,
          failed: result.failedCount || 0,
          results: result.results || []
        } : null)
        // Clear selection and reload data
        setBulkSelectedItems(new Map())
        await loadData()
      } else {
        alert(result.error || 'Bulk activate failed')
      }
    } catch (err) {
      alert('Bulk activate failed. Please try again.')
    }

    setBulkLoading(false)
    setBulkLoadingAction(null)
  }

  // Bulk delete action
  const handleBulkDelete = async () => {
    if (!user || bulkSelectedItems.size === 0) return

    const items = Array.from(bulkSelectedItems.values())
    const confirmed = confirm(`Delete ${items.length} item${items.length > 1 ? 's' : ''}? This cannot be undone.`)
    if (!confirmed) return

    setBulkLoading(true)
    setBulkLoadingAction('delete')
    setBulkProgress({
      isOpen: true,
      title: 'Deleting items...',
      total: items.length,
      completed: 0,
      failed: 0,
      currentItem: '',
      results: []
    })

    try {
      const response = await fetch('/api/meta/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entities: items.map(item => ({
            entityId: item.id,
            entityType: item.type,
            name: item.name
          }))
        })
      })

      const result = await response.json()

      if (response.ok) {
        setBulkProgress(prev => prev ? {
          ...prev,
          completed: result.successCount || items.length,
          failed: result.failedCount || 0,
          results: result.results || []
        } : null)
        // Clear selection and reload data
        setBulkSelectedItems(new Map())
        await loadData()
      } else {
        alert(result.error || 'Bulk delete failed')
      }
    } catch (err) {
      alert('Bulk delete failed. Please try again.')
    }

    setBulkLoading(false)
    setBulkLoadingAction(null)
  }

  // Format time since last sync
  const getTimeSinceSync = () => {
    if (!lastSyncTime) return null
    const seconds = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset)
    if (preset === 'custom') {
      setShowCustomDateInputs(true)
    } else {
      setShowCustomDateInputs(false)
    }
  }

  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setDatePreset('custom')
      setShowDatePicker(false)
      setShowCustomDateInputs(false)
      // Re-query Supabase with custom date range (no sync - data is already stored)
      console.log('[Dashboard] Custom date applied - re-querying Supabase (no sync)')
      loadData(false)
    }
  }

  // Get display label for current date selection
  const getDateLabel = () => {
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} - ${customEndDate}`
    }
    return DATE_PRESETS.find(p => p.value === datePreset)?.label || 'Last 30 Days'
  }
  
  const userPlan = plan

  // Helper to calculate date range from preset for client-side filtering
  // Use local date (not UTC) since Meta returns dates in ad account timezone
  const getDateRange = useMemo(() => {
    const today = new Date()
    const formatDate = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    if (datePreset === 'custom' && customStartDate && customEndDate) {
      return { since: customStartDate, until: customEndDate }
    }

    switch (datePreset) {
      case 'today':
        return { since: formatDate(today), until: formatDate(today) }
      case 'yesterday': {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        return { since: formatDate(yesterday), until: formatDate(yesterday) }
      }
      case 'last_7d': {
        const start = new Date(today)
        start.setDate(start.getDate() - 6)
        return { since: formatDate(start), until: formatDate(today) }
      }
      case 'last_14d': {
        const start = new Date(today)
        start.setDate(start.getDate() - 13)
        return { since: formatDate(start), until: formatDate(today) }
      }
      case 'last_30d': {
        const start = new Date(today)
        start.setDate(start.getDate() - 29)
        return { since: formatDate(start), until: formatDate(today) }
      }
      case 'last_90d': {
        const start = new Date(today)
        start.setDate(start.getDate() - 89)
        return { since: formatDate(start), until: formatDate(today) }
      }
      case 'this_month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1)
        return { since: formatDate(start), until: formatDate(today) }
      }
      case 'last_month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const end = new Date(today.getFullYear(), today.getMonth(), 0)
        return { since: formatDate(start), until: formatDate(end) }
      }
      case 'maximum':
      default: {
        // Maximum: show all data (use very wide date range)
        return { since: '2000-01-01', until: formatDate(today) }
      }
    }
  }, [datePreset, customStartDate, customEndDate])

  // Filter campaigns by selected account OR workspace accounts, then apply KillScale attribution if enabled
  // Also merge in manual events data on top of the attribution
  const accountFilteredData = useMemo(() => {
    const filtered = data.filter(row => {
      // Workspace mode: include all accounts in workspace
      if (workspaceAccountIds.length > 0) {
        return workspaceAccountIds.includes(row.ad_account_id || '')
      }
      // Individual account mode
      if (selectedAccountId && row.ad_account_id && row.ad_account_id !== selectedAccountId) {
        return false
      }
      return true
    })

    // Helper to augment a row with manual event data
    const augmentWithManualEvents = (row: CSVRow) => {
      const manual = row.ad_id ? manualEventsByAd[row.ad_id] : null
      if (!manual) return row
      return {
        ...row,
        revenue: row.revenue + manual.revenue,
        purchases: row.purchases + manual.count,
        results: (row.results || 0) + manual.count,
        result_value: (row.result_value || 0) + manual.revenue,
        // Track manual data separately for the indicator
        _manualRevenue: manual.revenue,
        _manualCount: manual.count
      }
    }

    // If KillScale attribution is active, mark rows and preserve Meta values
    // Priority Merge is applied at the ad level in performance-table.tsx
    // This ensures stats cards and performance table use the same algorithm
    if (isKillScaleActive) {
      return filtered.map(row => {
        return augmentWithManualEvents({
          ...row,
          _ksAttribution: true,
          _metaPurchases: row.purchases || 0,
          _metaRevenue: row.revenue || 0,
        })
      })
    }

    // If Shopify is the revenue source, mark rows for Shopify attribution
    // BUT don't replace values here - the totals calculation handles aggregation correctly
    // by summing Shopify data per unique ad_id (not per daily row)
    // Performance table will also use Shopify attribution for per-ad display
    if (revenueSource === 'shopify') {
      return filtered.map(row => {
        return augmentWithManualEvents({
          ...row,
          _shopifyAttribution: true,
          _metaRevenue: row.revenue || 0,
          _metaPurchases: row.purchases || 0,
          _metaResults: row.results || 0,
        })
      })
    }

    // Non-KillScale mode: use Meta data and add manual events on top
    return filtered.map(augmentWithManualEvents)
  }, [data, selectedAccountId, workspaceAccountIds, isKillScaleActive, multiTouchAttribution, isMultiTouchModel, manualEventsByAd, revenueSource, shopifyAttribution])

  const allCampaigns = useMemo(() =>
    Array.from(new Set(accountFilteredData.map(row => row.campaign_name))),
    [accountFilteredData]
  )

  // Auto-select all campaigns and ABO adsets when data first loads or when switching accounts
  // Only runs on data changes, NOT on selection changes (to avoid re-checking unchecked items)
  // Skip if user manually deselected all
  const prevDataLengthRef = useRef(0)
  useEffect(() => {
    if (accountFilteredData.length === 0) return
    if (userManuallyDeselected.current) return

    // Only run if data actually changed (new data loaded)
    // This prevents re-running when user toggles selection
    const dataChanged = accountFilteredData.length !== prevDataLengthRef.current
    prevDataLengthRef.current = accountFilteredData.length

    // Build the full selection set from current data
    const fullSelection = new Set<string>()
    const seenAdsets = new Set<string>()

    accountFilteredData.forEach(r => {
      // Add campaign
      fullSelection.add(r.campaign_name)

      // Add ABO adsets (adset has budget, campaign doesn't)
      const adsetKey = `${r.campaign_name}::${r.adset_name}`
      if (!seenAdsets.has(adsetKey)) {
        seenAdsets.add(adsetKey)
        const isAbo = (r.adset_daily_budget || r.adset_lifetime_budget) &&
                      !(r.campaign_daily_budget || r.campaign_lifetime_budget)
        if (isAbo) {
          fullSelection.add(adsetKey)
        }
      }
    })

    // If selection is empty, select all (initial load)
    if (selectedCampaigns.size === 0) {
      setSelectedCampaigns(fullSelection)
      return
    }

    // Only check for new campaigns if data actually changed
    if (!dataChanged) return

    // Check if there are new campaigns not in current selection
    // (e.g., Google campaigns loaded after Meta was already selected)
    const currentCampaignNames = new Set(
      Array.from(selectedCampaigns).filter(k => !k.includes('::'))
    )
    const newCampaigns = Array.from(fullSelection)
      .filter(k => !k.includes('::'))
      .filter(k => !currentCampaignNames.has(k))

    if (newCampaigns.length > 0) {
      // Add new campaigns and their ABO adsets to existing selection
      const updated = new Set(selectedCampaigns)
      newCampaigns.forEach(campaignName => {
        updated.add(campaignName)
        // Also add ABO adsets for this campaign
        accountFilteredData.forEach(r => {
          if (r.campaign_name === campaignName) {
            const adsetKey = `${r.campaign_name}::${r.adset_name}`
            const isAbo = (r.adset_daily_budget || r.adset_lifetime_budget) &&
                          !(r.campaign_daily_budget || r.campaign_lifetime_budget)
            if (isAbo) {
              updated.add(adsetKey)
            }
          }
        })
      })
      setSelectedCampaigns(updated)
    }
  }, [accountFilteredData]) // Only depend on data, NOT selection

  const totalCampaigns = allCampaigns.length
  // All plans now have unlimited campaigns
  const getCampaignLimit = () => Infinity
  
  const campaignLimit = getCampaignLimit()
  const isLimited = totalCampaigns > campaignLimit
  const hiddenCampaigns = isLimited ? totalCampaigns - campaignLimit : 0
  
  const visibleCampaigns = isLimited
    ? allCampaigns.slice(0, campaignLimit)
    : allCampaigns
  
  const filteredData = useMemo(() => {
    // Use accountFilteredData which already has:
    // 1. Account filtering applied
    // 2. KillScale attribution merged (if enabled)
    const result = accountFilteredData.filter(row => {
      // Date range filter (client-side filtering for instant response)
      // With daily data (time_increment=1), each row has date_start === date_end for a single day
      if (row.date_start) {
        if (row.date_start < getDateRange.since || row.date_start > getDateRange.until) {
          return false
        }
      }

      // Campaign limit filter
      if (!visibleCampaigns.includes(row.campaign_name)) return false

      // Paused filter
      if (!includePaused) {
        const isPaused =
          row.status?.toUpperCase() === 'PAUSED' ||
          row.adset_status?.toUpperCase() === 'PAUSED' ||
          row.campaign_status?.toUpperCase() === 'PAUSED'
        if (isPaused) return false
      }

      return true
    })

    return result
  }, [accountFilteredData, visibleCampaigns, includePaused, getDateRange])

  const selectedData = useMemo(() =>
    filteredData.filter(row => {
      // Include row if its campaign is selected
      // For stats, we always want all adsets under a selected campaign
      return selectedCampaigns.has(row.campaign_name)
    }),
    [filteredData, selectedCampaigns]
  )
  
  const totals = useMemo(() => {
    // Calculate manual event totals from unique ads in selection
    // We need to do this at the ad level to avoid double-counting across daily rows
    const adsInSelection = new Set(
      selectedData.map(row => row.ad_id).filter((id): id is string => !!id)
    )
    let manualRevenue = 0
    let manualCount = 0
    adsInSelection.forEach(adId => {
      const manual = manualEventsByAd[adId]
      if (manual) {
        manualRevenue += manual.revenue
        manualCount += manual.count
      }
    })

    // When Shopify is the revenue source, use shopifyTotals directly
    // This is the source of truth - don't try to match ad_ids
    if (revenueSource === 'shopify') {
      // Calculate spend from ad platforms (Meta/Google)
      const totalSpend = selectedData.reduce((sum, row) => sum + row.spend, 0)

      // Use shopifyTotals directly - this is the source of truth from Shopify API
      const shopifyRevenue = shopifyTotals?.total_revenue ?? 0
      const shopifyOrders = shopifyTotals?.total_orders ?? 0

      // Calculate other metrics from all selected data (impressions, clicks)
      const impressions = selectedData.reduce((sum, row) => sum + row.impressions, 0)
      const clicks = selectedData.reduce((sum, row) => sum + row.clicks, 0)

      // Add manual events on top of Shopify data
      const totalRevenue = shopifyRevenue + manualRevenue
      const totalOrders = shopifyOrders + manualCount

      const t = {
        spend: totalSpend,
        revenue: totalRevenue,
        purchases: totalOrders,
        results: totalOrders,
        impressions,
        clicks,
        roas: 0,
        cpm: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        cpr: 0,
        aov: 0,
        convRate: 0,
        // Track manual totals for the indicator
        manualRevenue,
        manualCount
      }
      t.roas = t.spend > 0 ? t.revenue / t.spend : 0
      t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0
      t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0
      t.cpa = t.purchases > 0 ? t.spend / t.purchases : 0
      t.cpr = t.results > 0 ? t.spend / t.results : 0
      t.aov = t.purchases > 0 ? t.revenue / t.purchases : 0
      t.convRate = t.clicks > 0 ? (t.purchases / t.clicks) * 100 : 0
      return t
    }

    // When KillScale is active, use Priority Merge Deduplication:
    // - Verified = MIN(KS, Meta) - both saw these → use Meta revenue (typically higher)
    // - KS_only = excess KS saw that Meta missed → use proportional KS revenue
    // - Meta_only = excess Meta saw that KS missed → use proportional Meta revenue
    // - Spend always comes from Meta API for ALL ads
    // Note: Shopify branch above returns early, so this only runs when revenueSource !== 'shopify'
    if (isKillScaleActive && Object.keys(multiTouchAttribution).length > 0) {
      let totalSpend = 0
      let verifiedPurchases = 0
      let verifiedRevenue = 0
      let ksOnlyPurchases = 0
      let ksOnlyRevenue = 0
      let metaOnlyPurchases = 0
      let metaOnlyRevenue = 0

      // Build per-ad Meta totals from daily rows
      // Use preserved _metaPurchases/_metaRevenue (original Meta values before KS replacement)
      const metaByAd = new Map<string, { purchases: number; revenue: number }>()
      selectedData.forEach(row => {
        totalSpend += row.spend
        if (row.ad_id) {
          const existing = metaByAd.get(row.ad_id) || { purchases: 0, revenue: 0 }
          // Use preserved Meta values if available, otherwise fall back to row values
          const rowAny = row as any
          existing.purchases += rowAny._metaPurchases ?? row.purchases ?? 0
          existing.revenue += rowAny._metaRevenue ?? row.revenue ?? 0
          metaByAd.set(row.ad_id, existing)
        }
      })

      // For each ad in selection, apply Priority Merge algorithm
      adsInSelection.forEach(adId => {
        const ksData = multiTouchAttribution[adId]
        const metaData = metaByAd.get(adId)

        const ksCount = ksData?.conversions || 0
        const ksRev = ksData?.revenue || 0
        const metaCount = metaData?.purchases || 0
        const metaRev = metaData?.revenue || 0

        // Verified = both sources saw these (take MIN count, use Meta revenue - typically higher)
        const verified = Math.min(ksCount, metaCount)
        verifiedPurchases += verified
        verifiedRevenue += metaCount > 0 ? (verified / metaCount) * metaRev : 0

        // KS_only = KS saw more than Meta (use proportional KS revenue)
        const ksOnly = Math.max(0, ksCount - metaCount)
        ksOnlyPurchases += ksOnly
        ksOnlyRevenue += ksCount > 0 ? (ksOnly / ksCount) * ksRev : 0

        // Meta_only = Meta saw more than KS (use proportional Meta revenue)
        const metaOnly = Math.max(0, metaCount - ksCount)
        metaOnlyPurchases += metaOnly
        metaOnlyRevenue += metaCount > 0 ? (metaOnly / metaCount) * metaRev : 0
      })

      // Calculate other metrics from all selected data (impressions, clicks)
      const impressions = selectedData.reduce((sum, row) => sum + row.impressions, 0)
      const clicks = selectedData.reduce((sum, row) => sum + row.clicks, 0)

      // Merge all sources: Verified + KS Only + Meta Only + Manual
      const totalRevenue = verifiedRevenue + ksOnlyRevenue + metaOnlyRevenue + manualRevenue
      const totalPurchases = verifiedPurchases + ksOnlyPurchases + metaOnlyPurchases + manualCount

      const t = {
        spend: totalSpend,
        revenue: totalRevenue,
        purchases: totalPurchases,
        results: totalPurchases,
        impressions,
        clicks,
        roas: 0,
        cpm: 0,
        cpc: 0,
        ctr: 0,
        cpa: 0,
        cpr: 0,
        aov: 0,
        convRate: 0,
        // Track manual totals for the indicator
        manualRevenue,
        manualCount
      }
      t.roas = t.spend > 0 ? t.revenue / t.spend : 0
      t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0
      t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0
      t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0
      t.cpa = t.purchases > 0 ? t.spend / t.purchases : 0
      t.cpr = t.results > 0 ? t.spend / t.results : 0
      t.aov = t.purchases > 0 ? t.revenue / t.purchases : 0
      t.convRate = t.clicks > 0 ? (t.purchases / t.clicks) * 100 : 0
      return t
    }

    // Non-KillScale mode: use Meta data as before (manual already included in rows)
    const t = {
      spend: selectedData.reduce((sum, row) => sum + row.spend, 0),
      revenue: selectedData.reduce((sum, row) => sum + row.revenue, 0),
      purchases: selectedData.reduce((sum, row) => sum + row.purchases, 0),
      results: selectedData.reduce((sum, row) => sum + (row.results || 0), 0),
      impressions: selectedData.reduce((sum, row) => sum + row.impressions, 0),
      clicks: selectedData.reduce((sum, row) => sum + row.clicks, 0),
      roas: 0,
      cpm: 0,
      cpc: 0,
      ctr: 0,
      cpa: 0,
      cpr: 0,
      aov: 0,
      convRate: 0,
      // Track manual totals for the indicator
      manualRevenue,
      manualCount
    }
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0
    t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0
    t.cpc = t.clicks > 0 ? t.spend / t.clicks : 0
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0
    t.cpa = t.purchases > 0 ? t.spend / t.purchases : 0
    t.cpr = t.results > 0 ? t.spend / t.results : 0
    t.aov = t.purchases > 0 ? t.revenue / t.purchases : 0
    t.convRate = t.clicks > 0 ? (t.purchases / t.clicks) * 100 : 0
    return t
  }, [selectedData, revenueSource, shopifyAttribution, shopifyTotals, isKillScaleActive, multiTouchAttribution, manualEventsByAd])

  // Calculate blended stats with platform breakdowns
  const blendedStats = useMemo(() => {
    // Build a map of ad_id to platform from the selected data
    const adIdToPlatform = new Map<string, 'meta' | 'google'>()
    selectedData.forEach(row => {
      if (row.ad_id) {
        adIdToPlatform.set(row.ad_id, row._platform || 'meta')
      }
    })

    // Helper to detect platform from ad_id pattern
    // Meta ad IDs: numeric, typically start with "120" (e.g., "120237919524130337")
    // Google ad IDs: numeric but different pattern
    const detectPlatformFromAdId = (adId: string): 'meta' | 'google' | null => {
      // Check if we already know this ad from selected data
      if (adIdToPlatform.has(adId)) {
        return adIdToPlatform.get(adId)!
      }
      // Meta ad IDs are long numeric strings, often starting with "120"
      if (/^\d{15,}$/.test(adId) && adId.startsWith('120')) {
        return 'meta'
      }
      // Google ad IDs are also numeric but shorter (10-12 digits typically)
      if (/^\d{10,14}$/.test(adId)) {
        return 'google'
      }
      // Non-numeric like "link_in_bio" - can't determine platform
      return null
    }

    // Calculate spend by platform
    let metaSpend = 0
    let googleSpend = 0
    selectedData.forEach(row => {
      if (row._platform === 'google') {
        googleSpend += row.spend
      } else {
        metaSpend += row.spend
      }
    })
    const totalSpend = metaSpend + googleSpend

    // Calculate attributed revenue/results by platform (from Shopify attribution)
    // Iterate over ALL Shopify attribution entries and detect platform
    let metaAttributedRevenue = 0
    let metaAttributedResults = 0
    let googleAttributedRevenue = 0
    let googleAttributedResults = 0

    // Iterate over all Shopify attribution entries and match to platform
    // This catches revenue from paused/old ads not in current date selection
    Object.entries(shopifyAttribution).forEach(([adId, shopifyData]) => {
      const platform = detectPlatformFromAdId(adId)
      if (platform === 'google') {
        googleAttributedRevenue += shopifyData.revenue
        googleAttributedResults += shopifyData.orders
      } else if (platform === 'meta') {
        metaAttributedRevenue += shopifyData.revenue
        metaAttributedResults += shopifyData.orders
      }
      // If platform is null (e.g., "link_in_bio"), skip - it stays in "attributed" but not platform-specific
    })

    // Use shopifyTotals for the hero values - this is the source of truth from Shopify
    // The per-platform breakdown shows what we can match to the current ads
    const shopifyTotalRevenue = shopifyTotals?.total_revenue ?? 0
    const shopifyTotalResults = shopifyTotals?.total_orders ?? 0
    const totalAttributedRevenue = shopifyTotals?.attributed_revenue ?? 0
    const totalAttributedResults = shopifyTotals?.attributed_orders ?? 0

    // Calculate ROAS values
    const blendedRoas = totalSpend > 0 ? shopifyTotalRevenue / totalSpend : 0
    const metaRoas = metaSpend > 0 ? metaAttributedRevenue / metaSpend : 0
    const googleRoas = googleSpend > 0 ? googleAttributedRevenue / googleSpend : 0

    // Calculate CPR (cost per result)
    const cpr = shopifyTotalResults > 0 ? totalSpend / shopifyTotalResults : 0

    return {
      spend: {
        total: totalSpend,
        meta: metaSpend,
        google: googleSpend
      },
      revenue: {
        total: shopifyTotalRevenue,
        attributed: totalAttributedRevenue,
        metaAttributed: metaAttributedRevenue,
        googleAttributed: googleAttributedRevenue
      },
      results: {
        total: shopifyTotalResults,
        attributed: totalAttributedResults,
        metaAttributed: metaAttributedResults,
        googleAttributed: googleAttributedResults
      },
      roas: {
        blended: blendedRoas,
        meta: metaRoas,
        google: googleRoas
      },
      cpr
    }
  }, [selectedData, shopifyAttribution, shopifyTotals])

  // Calculate True ROAS when UpPromote is connected (includes affiliate commission in costs)
  const affiliateCommission = FEATURES.UPPROMOTE && hasUppromote && uppromoteTotals ? uppromoteTotals.total_commission : 0
  const totalCosts = blendedStats.spend.total + affiliateCommission
  const trueRoas = totalCosts > 0 ? blendedStats.revenue.total / totalCosts : 0

  const dateRange = {
    start: data.length > 0 ? data[0].date_start : new Date().toISOString().split('T')[0],
    end: data.length > 0 ? data[0].date_end : new Date().toISOString().split('T')[0]
  }
  
  const tableData = filteredData.map(row => ({
    campaign_name: row.campaign_name,
    campaign_id: row.campaign_id,
    adset_name: row.adset_name,
    adset_id: row.adset_id,
    ad_name: row.ad_name,
    ad_id: row.ad_id,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    purchases: row.purchases,
    revenue: row.revenue,
    roas: row.spend > 0 ? row.revenue / row.spend : 0,
    // Results-based tracking
    results: row.results || 0,
    result_value: row.result_value ?? null,
    result_type: row.result_type ?? null,
    status: row.status,
    adset_status: row.adset_status,
    campaign_status: row.campaign_status,
    // Budget fields for CBO/ABO badges
    campaign_daily_budget: row.campaign_daily_budget,
    campaign_lifetime_budget: row.campaign_lifetime_budget,
    adset_daily_budget: row.adset_daily_budget,
    adset_lifetime_budget: row.adset_lifetime_budget,
    // Platform and account info for Google Ads integration
    _platform: row._platform,
    ad_account_id: row.ad_account_id,
    campaign_budget_resource_name: row.campaign_budget_resource_name,
    // Creative ID for thumbnail display
    creative_id: row.creative_id,
    // Creative preview data (from sync - zero API calls)
    thumbnail_url: row.thumbnail_url,
    image_url: row.image_url,
    media_type: row.media_type,
    media_hash: row.media_hash,
    storage_url: row.storage_url,
  }))

  // Build a map of campaign -> ABO adsets for selection cascading
  // Uses accountFilteredData (current account only) not data (all accounts)
  const campaignAboAdsets = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const seenAdsets = new Set<string>()

    accountFilteredData.forEach(row => {
      const adsetKey = `${row.campaign_name}::${row.adset_name}`
      if (!seenAdsets.has(adsetKey)) {
        seenAdsets.add(adsetKey)
        // ABO = adset has budget, campaign doesn't
        const isAbo = (row.adset_daily_budget || row.adset_lifetime_budget) &&
                      !(row.campaign_daily_budget || row.campaign_lifetime_budget)
        if (isAbo) {
          if (!map.has(row.campaign_name)) {
            map.set(row.campaign_name, new Set())
          }
          map.get(row.campaign_name)!.add(adsetKey)
        }
      }
    })
    return map
  }, [accountFilteredData])

  const handleCampaignToggle = (key: string) => {
    const newSelected = new Set(selectedCampaigns)

    // Check if this is an adset key (contains ::)
    if (key.includes('::')) {
      // It's an ABO adset toggle
      const [campaignName] = key.split('::')
      const aboAdsets = campaignAboAdsets.get(campaignName) || new Set()

      if (newSelected.has(key)) {
        // Unselecting this adset
        newSelected.delete(key)
        // If campaign was selected, remove it (now partial)
        // Campaign stays selected only if all its ABO adsets are selected
      } else {
        // Selecting this adset
        newSelected.add(key)
      }

      // Update campaign selection state based on children
      const aboArray = Array.from(aboAdsets)
      const allAboSelected = aboArray.every(k => newSelected.has(k))
      const someAboSelected = aboArray.some(k => newSelected.has(k))

      if (allAboSelected && aboAdsets.size > 0) {
        newSelected.add(campaignName)
      } else if (!someAboSelected) {
        newSelected.delete(campaignName)
      }
      // If someAboSelected but not all, campaign stays in whatever state for partial indicator

    } else {
      // It's a campaign toggle
      const aboAdsets = campaignAboAdsets.get(key) || new Set()

      if (newSelected.has(key)) {
        // Unselecting campaign - also unselect all its ABO adsets
        newSelected.delete(key)
        aboAdsets.forEach(adsetKey => newSelected.delete(adsetKey))
      } else {
        // Selecting campaign - also select all its ABO adsets
        newSelected.add(key)
        aboAdsets.forEach(adsetKey => newSelected.add(adsetKey))
      }
    }

    // If user manually unchecked everything, prevent auto-reselect
    if (newSelected.size === 0) {
      userManuallyDeselected.current = true
    } else {
      // User is making selections, allow future auto-select if needed
      userManuallyDeselected.current = false
    }

    setSelectedCampaigns(newSelected)
  }

  const handleSelectAll = () => {
    // Check if ALL campaigns AND their ABO adsets are selected
    const allFullySelected = visibleCampaigns.every(campaignName => {
      if (!selectedCampaigns.has(campaignName)) return false
      // For ABO campaigns, also check all adsets are selected
      const aboAdsets = campaignAboAdsets.get(campaignName)
      if (aboAdsets && aboAdsets.size > 0) {
        return Array.from(aboAdsets).every(k => selectedCampaigns.has(k))
      }
      return true
    })

    if (allFullySelected) {
      userManuallyDeselected.current = true
      setSelectedCampaigns(new Set())
    } else {
      userManuallyDeselected.current = false
      // Select all campaigns AND their ABO adsets
      const newSelection = new Set<string>()
      visibleCampaigns.forEach(campaignName => {
        newSelection.add(campaignName)
        // Also add ABO adsets for this campaign
        const aboAdsets = campaignAboAdsets.get(campaignName)
        if (aboAdsets) {
          aboAdsets.forEach(adsetKey => newSelection.add(adsetKey))
        }
      })
      setSelectedCampaigns(newSelection)
    }
  }

  // Check if all campaigns are fully selected (including their ABO adsets)
  const allSelected = visibleCampaigns.length > 0 && visibleCampaigns.every(campaignName => {
    if (!selectedCampaigns.has(campaignName)) return false
    const aboAdsets = campaignAboAdsets.get(campaignName)
    if (aboAdsets && aboAdsets.size > 0) {
      return Array.from(aboAdsets).every(k => selectedCampaigns.has(k))
    }
    return true
  })
  const someSelected = visibleCampaigns.some(c => selectedCampaigns.has(c)) && !allSelected
  
  // Count entities - must be before early returns (hooks must be unconditional)
  // Use filteredData so counts reflect what's visible (accounting for campaign limits and paused filter)
  const entityCounts = useMemo(() => {
    const campaigns = new Set(filteredData.map(r => r.campaign_name))
    const adsets = new Set(filteredData.map(r => `${r.campaign_name}|${r.adset_name}`))
    const ads = new Set(filteredData.map(r => `${r.campaign_name}|${r.adset_name}|${r.ad_name}`))
    // Use accounts from context (already filtered to dashboard accounts)
    return { accounts: accounts.length, campaigns: campaigns.size, adsets: adsets.size, ads: ads.size }
  }, [filteredData, accounts])

  // Calculate total daily budgets (CBO + ABO) - only count ACTIVE (non-paused) items
  // CBO = budget at campaign level, ABO = budget at adset level
  // A campaign is CBO if it has campaign_daily_budget but adsets DON'T have their own budgets
  // A campaign is ABO if adsets have their own budgets (adset_daily_budget)
  // NOTE: Paused campaigns are ALWAYS excluded from budget totals (regardless of includePaused toggle)
  const budgetTotals = useMemo(() => {
    let metaCboBudget = 0
    let metaAboBudget = 0
    let googleBudget = 0

    // Track campaigns and their budget type, with platform
    const campaignBudgets = new Map<string, { budget: number; status: string | null | undefined; isCBO: boolean; selected: boolean; platform: 'meta' | 'google' }>()
    const adsetBudgets = new Map<string, { budget: number; status: string | null | undefined; selected: boolean; campaignName: string; campaignStatus: string | null | undefined }>()

    // Filter to current account/workspace first to avoid counting budgets from other accounts
    const currentAccountData = data.filter(row => {
      if (workspaceAccountIds.length > 0) {
        return workspaceAccountIds.includes(row.ad_account_id || '')
      }
      if (selectedAccountId) {
        return row.ad_account_id === selectedAccountId
      }
      return true
    })

    // Process filtered data
    // Use ad_account_id in keys to avoid conflicts when accounts have same campaign names
    currentAccountData.forEach(row => {
      // Determine if this is CBO or ABO based on where budget lives
      // CBO: campaign has budget, adset does NOT have budget
      // ABO: adset has budget (regardless of campaign budget field)
      // Google is ALWAYS CBO (no ABO option for Google Ads campaigns)
      const isCBO = row._platform === 'google' ||
                    (!!(row.campaign_daily_budget || row.campaign_lifetime_budget) &&
                    !(row.adset_daily_budget || row.adset_lifetime_budget))

      // Use account-qualified keys to handle same campaign names across platforms
      const campaignKey = `${row.ad_account_id || ''}|${row.campaign_name}`

      // Track campaign-level budget (only for true CBO campaigns)
      // For Google, always track if budget exists (even if $0, though we only count non-zero in totals)
      const campaignBudget = row.campaign_daily_budget
      if (isCBO && campaignBudget != null && campaignBudget > 0 && !campaignBudgets.has(campaignKey)) {
        campaignBudgets.set(campaignKey, {
          budget: campaignBudget,
          status: row.campaign_status,
          isCBO: true,
          selected: selectedCampaigns.has(row.campaign_name),
          platform: row._platform || 'meta'
        })
      }

      // Track adset-level budgets (ABO)
      const adsetKey = `${row.ad_account_id || ''}|${row.campaign_name}|${row.adset_name}`
      const adsetSelectionKey = `${row.campaign_name}::${row.adset_name}`
      if (row.adset_daily_budget && !adsetBudgets.has(adsetKey)) {
        adsetBudgets.set(adsetKey, {
          budget: row.adset_daily_budget,
          status: row.adset_status,
          selected: selectedCampaigns.has(adsetSelectionKey),
          campaignName: row.campaign_name,
          campaignStatus: row.campaign_status
        })

        // Also track that this campaign is ABO (for status checking)
        if (!campaignBudgets.has(campaignKey)) {
          campaignBudgets.set(campaignKey, {
            budget: 0,
            status: row.campaign_status,
            isCBO: false,
            selected: selectedCampaigns.has(row.campaign_name),
            platform: row._platform || 'meta'
          })
        }
      }
    })

    // Sum CBO budgets (only selected and non-paused) - separate Meta and Google
    campaignBudgets.forEach(({ budget, status, isCBO, selected, platform }) => {
      if (isCBO && selected && status?.toUpperCase() !== 'PAUSED') {
        if (platform === 'google') {
          googleBudget += budget
        } else {
          metaCboBudget += budget
        }
      }
    })

    // Sum ABO budgets (only selected and non-paused, check parent campaign too)
    // Note: ABO is Meta-only (Google is always CBO)
    adsetBudgets.forEach(({ budget, status, selected, campaignStatus }) => {
      if (!selected) return
      if (status?.toUpperCase() !== 'PAUSED' && campaignStatus?.toUpperCase() !== 'PAUSED') {
        metaAboBudget += budget
      }
    })

    return {
      meta: { cbo: metaCboBudget, abo: metaAboBudget },
      google: googleBudget,
      total: metaCboBudget + metaAboBudget + googleBudget
    }
  }, [data, selectedCampaigns, selectedAccountId, workspaceAccountIds])
  
  if (isLoading && !hasLoadedOnce) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-500">Loading your data...</div>
      </div>
    )
  }
  
  const filterButtons: { value: VerdictFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'scale', label: 'Scale' },
    { value: 'watch', label: 'Watch' },
    { value: 'kill', label: 'Kill' },
    { value: 'learn', label: 'Learn' },
  ]

  const currentDatePreset = DATE_PRESETS.find(p => p.value === datePreset)
  
  return (
    <>
      {/* Header row - title left, buttons right, same max-width as cards */}
      <div className="max-w-[1400px] mb-6">
        {/* Row 1: Title with entity counts as subtitle */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
            {/* Entity counts as subtitle */}
            {data.length > 0 ? (
              <div className="flex items-center gap-3 text-sm text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-verdict-scale rounded-full" />
                  <span>{entityCounts.accounts} account{entityCounts.accounts !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-zinc-600">·</span>
                <span>{entityCounts.campaigns} campaign{entityCounts.campaigns !== 1 ? 's' : ''}</span>
                <span className="text-zinc-600">·</span>
                <span>{entityCounts.adsets} ad set{entityCounts.adsets !== 1 ? 's' : ''}</span>
                <span className="text-zinc-600">·</span>
                <span>{entityCounts.ads} ad{entityCounts.ads !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Your Meta Ads performance at a glance</p>
            )}
          </div>

          {/* Action buttons - wrap on mobile, single row on desktop */}
          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
            {data.length > 0 && (
              <>
                {/* Date Picker Dropdown */}
                <div className="relative flex-shrink-0">
                  <DatePickerButton
                    label={getDateLabel()}
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    isOpen={showDatePicker}
                  />

                  <DatePicker
                    isOpen={showDatePicker}
                    onClose={() => {
                      setShowDatePicker(false)
                      setShowCustomDateInputs(false)
                    }}
                    datePreset={datePreset}
                    onPresetChange={handleDatePresetChange}
                    customStartDate={customStartDate}
                    customEndDate={customEndDate}
                    onCustomDateChange={(start, end) => {
                      setCustomStartDate(start)
                      setCustomEndDate(end)
                    }}
                    onApply={handleCustomDateApply}
                  />
                </div>
              </>
            )}

            {/* Sync Button */}
            <button
              onClick={handleSync}
              disabled={!canSync || isSyncing || (!selectedAccountId && workspaceAccountIds.length === 0)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isSyncing
                  ? 'bg-accent/20 border border-accent/50 text-accent'
                  : canSync && (selectedAccountId || workspaceAccountIds.length > 0)
                    ? 'bg-bg-card border border-border text-zinc-300 hover:text-white hover:border-zinc-500'
                    : 'bg-bg-card border border-border text-zinc-600 cursor-not-allowed'
              }`}
              title={!canSync ? 'Sync requires Pro plan' : (!selectedAccountId && workspaceAccountIds.length === 0) ? 'Connect an account first' : workspaceAccountIds.length > 0 ? `Sync ${workspaceAccountIds.length} accounts` : 'Sync from Meta'}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
              {lastSyncTime && !isSyncing && (
                <span className="text-xs text-zinc-500 hidden xl:inline">{getTimeSinceSync()}</span>
              )}
            </button>

            {/* Log Walk-In Button - Pro+ with KillScale pixel only */}
            {isProPlus && isKillScaleActive && currentWorkspaceId && (
              <button
                onClick={() => setShowWalkinModal(true)}
                className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                title="Log a walk-in or offline conversion"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xl:inline">Event</span>
              </button>
            )}

            {/* Starred Ads Badge + Popover */}
            {isProPlus && (
              <StarredAdsPopover
                starredAds={starredAds}
                onBuildPerformanceSet={handleBuildPerformanceSet}
                onUnstarAd={handleUnstarAd}
              />
            )}

            {/* Delete Button - always visible, far right */}
            {data.length > 0 && (
              <button
                onClick={handleClearData}
                className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-bg-card border border-border rounded-lg text-zinc-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
                title="Clear all data"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-border rounded-xl">
          {isSyncing ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mb-4"></div>
              <h2 className="text-xl font-semibold mb-2">Syncing data...</h2>
              <p className="text-zinc-500">Fetching your Meta Ads data</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">📊</div>
              <h2 className="text-xl font-semibold mb-2">No data yet</h2>
              <p className="text-zinc-500 mb-6 text-center max-w-md">
                {canSync && (selectedAccountId || workspaceAccountIds.length > 0)
                  ? 'Click Sync to fetch data from Meta Ads'
                  : 'Connect a Meta Ads account or import CSV data from Settings → Accounts'
                }
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {canSync && (selectedAccountId || workspaceAccountIds.length > 0) ? (
                  <button
                    onClick={handleSync}
                    className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Sync from Meta
                  </button>
                ) : (
                  <Link
                    href="/dashboard/settings/accounts"
                    className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                  >
                    Connect Account
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {isLimited && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                <Lock className="w-5 h-5 text-amber-500" />
                <div>
                  <div className="font-medium text-amber-500">
                    {hiddenCampaigns} campaign{hiddenCampaigns > 1 ? 's' : ''} hidden
                  </div>
                  <div className="text-sm text-zinc-400">
                    {userPlan} plan is limited to {campaignLimit} campaigns. Upgrade to see all your data.
                  </div>
                </div>
              </div>
              <Link 
                href="/pricing"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-sm transition-colors"
              >
                Upgrade Now
              </Link>
            </div>
          )}
          
          {/* KillScale Attribution Indicator */}
          {isKillScaleActive && (
            <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs text-accent font-medium">KillScale Attribution Active</span>
              <span className="text-xs text-zinc-500">
                ({Object.keys(attributionData).length} ads tracked)
              </span>
            </div>
          )}

          {/* Revenue Source Indicator + Workspace Settings */}
          <div className="flex items-center justify-between mb-3 max-w-[1400px]">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {revenueSource === 'shopify' && (
                <>
                  <ShoppingBag className="w-3 h-3 text-green-400" />
                  <span>Revenue from Shopify</span>
                </>
              )}
              {revenueSource === 'pixel' && (
                <>
                  <Activity className="w-3 h-3 text-blue-400" />
                  <span>Revenue from KillScale Pixel</span>
                </>
              )}
              {revenueSource === 'meta' && (
                <span className="text-zinc-500">Revenue from Meta API</span>
              )}
            </div>

            {/* Workspace Stats Settings */}
            {currentWorkspaceId && (
              <div className="relative">
                <button
                  onClick={() => setShowAttributionSettings(!showAttributionSettings)}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-bg-hover rounded-lg transition-colors"
                  title="Stats display settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {showAttributionSettings && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAttributionSettings(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-bg-card border border-border rounded-lg shadow-xl p-3 min-w-[200px]">
                      <div className="text-xs font-medium text-zinc-400 mb-2">Display Settings</div>
                      <label className="flex items-center justify-between gap-3 cursor-pointer group">
                        <span className="text-sm text-zinc-300 group-hover:text-white">Show Attribution</span>
                        <button
                          onClick={() => setShowAttribution(!showAttribution)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            showAttribution ? 'bg-accent' : 'bg-zinc-600'
                          }`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            showAttribution ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </label>
                      <p className="text-xs text-zinc-500 mt-2">
                        {showAttribution ? 'Platform breakdown visible' : 'Platform breakdown hidden'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Primary Stats Row - 4 cards, fixed height */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4 max-w-[1400px]">
            {revenueSource === 'shopify' ? (
              <>
                <PrimaryStatCard
                  label={FEATURES.UPPROMOTE && hasUppromote ? "Total Costs" : "Spend"}
                  value={FEATURES.UPPROMOTE && hasUppromote ? totalCosts : blendedStats.spend.total}
                  prefix="$"
                  platforms={{
                    meta: blendedStats.spend.meta > 0 ? `$${blendedStats.spend.meta.toLocaleString()}` : null,
                    google: blendedStats.spend.google > 0 ? `$${blendedStats.spend.google.toLocaleString()}` : null,
                    ...(FEATURES.UPPROMOTE && hasUppromote && affiliateCommission > 0 ? {
                      affiliate: `$${affiliateCommission.toLocaleString()}`
                    } : {})
                  }}
                />
                <PrimaryStatCard
                  label="Revenue"
                  value={blendedStats.revenue.total}
                  prefix="$"
                  subtitle={blendedStats.results.total > 0
                    ? `${blendedStats.results.total} orders`
                    : undefined
                  }
                  platforms={showAttribution ? {
                    meta: blendedStats.revenue.metaAttributed > 0 ? `$${blendedStats.revenue.metaAttributed.toLocaleString()}` : null,
                    google: blendedStats.revenue.googleAttributed > 0 ? `$${blendedStats.revenue.googleAttributed.toLocaleString()}` : null
                  } : undefined}
                />
                <PrimaryStatCard
                  label={FEATURES.UPPROMOTE && hasUppromote ? "True ROAS" : "ROAS"}
                  value={FEATURES.UPPROMOTE && hasUppromote ? trueRoas.toFixed(2) : blendedStats.roas.blended.toFixed(2)}
                  suffix="x"
                  subtitle={FEATURES.UPPROMOTE && hasUppromote ? "rev ÷ total costs" : "rev ÷ spend"}
                  platforms={(!currentWorkspaceId || showAttribution) ? {
                    meta: blendedStats.roas.meta > 0 ? `${blendedStats.roas.meta.toFixed(2)}x` : null,
                    google: blendedStats.roas.google > 0 ? `${blendedStats.roas.google.toFixed(2)}x` : null
                  } : undefined}
                />
                <BudgetStatCard
                  total={budgetTotals.total}
                  meta={budgetTotals.meta}
                  google={budgetTotals.google}
                />
              </>
            ) : (
              <>
                <PrimaryStatCard
                  label="Spend"
                  value={totals.spend}
                  prefix="$"
                  platforms={{
                    meta: isGoogleAccount(selectedAccountId) ? null : `$${totals.spend.toLocaleString()}`,
                    google: isGoogleAccount(selectedAccountId) ? `$${totals.spend.toLocaleString()}` : null
                  }}
                />
                <PrimaryStatCard
                  label="Revenue"
                  value={totals.revenue}
                  prefix="$"
                  subtitle={totals.results > 0
                    ? `${totals.results} results`
                    : totals.manualCount > 0
                      ? `+${totals.manualCount} manual`
                      : undefined
                  }
                  platforms={(!currentWorkspaceId || showAttribution) ? {
                    meta: isGoogleAccount(selectedAccountId) ? null : `$${totals.revenue.toLocaleString()}`,
                    google: isGoogleAccount(selectedAccountId) ? `$${totals.revenue.toLocaleString()}` : null
                  } : undefined}
                />
                <PrimaryStatCard
                  label="ROAS"
                  value={totals.roas.toFixed(2)}
                  suffix="x"
                  subtitle="rev ÷ spend"
                  platforms={(!currentWorkspaceId || showAttribution) ? {
                    meta: isGoogleAccount(selectedAccountId) ? null : `${totals.roas.toFixed(2)}x`,
                    google: isGoogleAccount(selectedAccountId) ? `${totals.roas.toFixed(2)}x` : null
                  } : undefined}
                />
                <BudgetStatCard
                  total={budgetTotals.total}
                  meta={budgetTotals.meta}
                  google={budgetTotals.google}
                />
              </>
            )}
          </div>

          {/* Secondary Stats Pills */}
          <SecondaryStatsPills
            metrics={[
              { label: 'CPM', value: formatCPM(totals.spend, totals.impressions) },
              { label: 'CPC', value: formatCPC(totals.spend, totals.clicks) },
              { label: 'AOV', value: formatAOV(totals.revenue, totals.purchases) },
              { label: 'Conv', value: formatPercent(totals.convRate) }
            ]}
            expandable
            className="max-w-[1400px]"
          />

          {/* Controls Bar */}
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 lg:gap-4 mb-6 max-w-[1400px]">
            {/* Select All on left */}
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/50"
              />
              Select All
            </label>
            <span className="text-xs text-zinc-500">({selectedCampaigns.size} campaigns)</span>

            {/* Expand/Collapse All Button */}
            <button
              onClick={() => {
                setExpandTrigger(prev => prev + 1)
                setTableExpanded(!tableExpanded)
              }}
              className="px-3 py-1.5 text-xs rounded-lg transition-colors bg-bg-card border border-border text-zinc-300 hover:border-border/50 hover:text-white"
            >
              {tableExpanded ? '⊞ Collapse All' : '⊟ Expand All'}
            </button>

            {/* Budget Selection Indicator */}
            {selectedCampaigns.size < visibleCampaigns.length && selectedCampaigns.size > 0 && (
              <span className="text-xs text-accent">
                Showing stats for {selectedCampaigns.size} of {visibleCampaigns.length} budgets
              </span>
            )}

            {/* Right side controls */}
            <div className="ml-auto flex items-center gap-4">
              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all duration-200 bg-bg-card border-border text-zinc-300 hover:border-border/50"
                >
                  <span className="text-zinc-500">Sort:</span>
                  <span>{sortField === 'name' ? 'Name' : sortField === 'spend' ? 'Spend' : sortField === 'revenue' ? 'Revenue' : sortField === 'roas' ? 'ROAS' : sortField === 'results' ? 'Results' : 'CPR'}</span>
                  <span className="text-zinc-500">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                </button>

                {showSortDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {(['name', 'spend', 'revenue', 'roas', 'results', 'cpr'] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          if (sortField === option) {
                            setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
                          } else {
                            setSortField(option)
                            setSortDirection('desc')
                          }
                          setShowSortDropdown(false)
                        }}
                        className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors ${
                          sortField === option
                            ? 'bg-indigo-500/20 text-indigo-400'
                            : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <span>{option === 'name' ? 'Name' : option === 'spend' ? 'Spend' : option === 'revenue' ? 'Revenue' : option === 'roas' ? 'ROAS' : option === 'results' ? 'Results' : 'CPR'}</span>
                        {sortField === option && (
                          <span className="text-xs">{sortDirection === 'desc' ? '↓ High to Low' : '↑ Low to High'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Include Paused checkbox */}
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
                <input
                  type="checkbox"
                  checked={includePaused}
                  onChange={() => setIncludePaused(!includePaused)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800"
                />
                Include Paused
              </label>

              {/* Simple/Detailed Toggle - hidden on mobile */}
              <div className="hidden lg:flex items-center gap-1 bg-bg-card rounded-lg p-1 border border-border">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    viewMode === 'simple' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Simple
                </button>
                <button
                  onClick={() => setViewMode('detailed')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    viewMode === 'detailed' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Detailed
                </button>
              </div>

              {/* Create button - only show when user can manage Meta ads (not Google) */}
              {canSync && selectedAccountId && !isGoogleAccount(selectedAccountId) && (
                <button
                  onClick={() => { setLaunchWizardEntityType('campaign'); setShowLaunchWizard(true) }}
                  className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </button>
              )}
            </div>
          </div>
          
          <div>
            <PerformanceTable
              data={tableData}
              rules={rules}
              dateRange={dateRange}
              verdictFilter="all"
              includePaused={includePaused}
              viewMode={viewMode}
              selectedCampaigns={selectedCampaigns}
              onCampaignToggle={handleCampaignToggle}
              onSelectAll={handleSelectAll}
              allSelected={allSelected}
              someSelected={someSelected}
              onStatusChange={handleStatusChangeRequest}
              canManageAds={canSync && !!selectedAccountId}
              onBudgetChange={handleBudgetChange}
              highlightEntity={highlightEntity}
              userId={user?.id}
              campaignAboAdsets={campaignAboAdsets}
              lastTouchAttribution={isKillScaleActive && revenueSource !== 'shopify' ? lastTouchAttribution : undefined}
              isMultiTouchModel={isMultiTouchModel}
              shopifyAttribution={revenueSource === 'shopify' ? shopifyAttribution : undefined}
              expandAllTrigger={expandTrigger}
              onExpandedStateChange={setTableExpanded}
              externalSortField={sortField}
              externalSortDirection={sortDirection}
              starredAdIds={starredAdIds}
              starredCreativeIds={starredCreativeIds}
              starredCreativeCounts={starredCreativeCounts}
              onStarAd={handleStarAd}
              onUnstarAd={handleUnstarAd}
              onEditEntity={handleEditEntity}
              onInfoEntity={handleInfoEntity}
              onDuplicateEntity={handleDuplicateEntity}
              onDeleteEntity={handleDeleteEntity}
              bulkSelectedItems={bulkSelectedItems}
              onBulkSelectItem={handleBulkSelectItem}
            />
          </div>
        </>
      )}

      {/* Status Change Confirmation Modal */}
      {statusChangeModal && (
        <StatusChangeModal
          isOpen={statusChangeModal.isOpen}
          onClose={() => setStatusChangeModal(null)}
          onConfirm={handleStatusChangeConfirm}
          entityName={statusChangeModal.entityName}
          entityType={statusChangeModal.entityType}
          action={statusChangeModal.action}
          isLoading={isUpdatingStatus}
        />
      )}

      {/* Edit Entity Modal */}
      {editModal && user && (
        <EditEntityModal
          isOpen={true}
          onClose={() => setEditModal(null)}
          entityType={editModal.entityType}
          entityId={editModal.entityId}
          entityName={editModal.entityName}
          campaignName={editModal.campaignName}
          adsetId={editModal.adsetId}
          adAccountId={selectedAccountId || undefined}
          userId={user.id}
          onUpdate={() => loadData()}
        />
      )}

      {/* Entity Info Modal */}
      {infoModal && user && (
        <EntityInfoModal
          isOpen={true}
          onClose={() => setInfoModal(null)}
          entityType={infoModal.entityType}
          entityId={infoModal.entityId}
          entityName={infoModal.entityName}
          userId={user.id}
        />
      )}

      {/* Inline Duplicate Modal */}
      {duplicateModal && user && selectedAccountId && (
        <InlineDuplicateModal
          isOpen={true}
          onClose={() => setDuplicateModal(null)}
          itemType={duplicateModal.itemType}
          itemId={duplicateModal.itemId}
          itemName={duplicateModal.itemName}
          parentCampaignId={duplicateModal.parentCampaignId}
          parentAdsetId={duplicateModal.parentAdsetId}
          userId={user.id}
          adAccountId={selectedAccountId}
          onComplete={async (result) => {
            setDuplicateModal(null)
            setIncludePaused(true)

            try {
              await fetch('/api/meta/hydrate-new-entity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: user.id,
                  adAccountId: selectedAccountId,
                  entityType: result.entityType,
                  entityId: result.newEntityId,
                })
              })
            } catch (err) {
              console.warn('[Dashboard] Hydrate failed:', err)
            }

            loadData()
          }}
        />
      )}

      {/* Delete Entity Modal */}
      {deleteModal && (
        <DeleteEntityModal
          isOpen={true}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleDeleteConfirm}
          entityName={deleteModal.entityName}
          entityType={deleteModal.entityType}
          childCount={deleteModal.childCount}
          isLoading={isDeleting}
        />
      )}

      {/* Log Walk-In Modal */}
      {currentWorkspaceId && user && (
        <LogWalkinModal
          isOpen={showWalkinModal}
          onClose={() => setShowWalkinModal(false)}
          workspaceId={currentWorkspaceId}
          userId={user.id}
          defaultValue={100}
          onSuccess={() => {
            // Attribution data will refresh on next sync/load
          }}
        />
      )}

      {/* Sync Overlay - shows during initial sync */}
      <SyncOverlay
        isVisible={isSyncing}
        accountName={
          workspaceAccountIds.length > 0
            ? `${workspaceAccountIds.length} accounts`
            : accounts.find(a => a.id === currentAccountId)?.name || currentAccountId || undefined
        }
        platform={
          workspaceAccountIds.length > 0
            ? 'meta'  // Default to Meta for workspace sync (most common)
            : isGoogleAccount(currentAccountId) ? 'google' : 'meta'
        }
      />

      {/* Launch Wizard - Full Screen Overlay */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <div className="min-h-screen px-4 py-8">
            <LaunchWizard
              adAccountId={currentAccountId}
              onComplete={(performanceSetResult) => {
                setShowLaunchWizard(false)
                setIncludePaused(true)
                // Refresh data after creating campaign
                loadData()
                // Show clear stars prompt if this was a Performance Set
                if (performanceSetResult?.usedAdIds && performanceSetResult.usedAdIds.length > 0) {
                  setPerformanceSetAdIds(performanceSetResult.usedAdIds)
                  setShowClearStarsPrompt(true)
                }
              }}
              onCancel={() => setShowLaunchWizard(false)}
              initialEntityType={launchWizardEntityType}
              starredAds={(() => {
                // Calculate star counts by creative_id
                const starCountsByCreative = starredAds.reduce((acc, ad) => {
                  const key = ad.creative_id || ad.ad_name  // Fallback to ad_name if no creative_id
                  acc[key] = (acc[key] || 0) + 1
                  return acc
                }, {} as Record<string, number>)

                return starredAds
                  .map(ad => ({
                    ad_id: ad.ad_id,
                    ad_name: ad.ad_name,
                    adset_id: ad.adset_id,
                    adset_name: ad.adset_name,
                    campaign_id: ad.campaign_id,
                    campaign_name: ad.campaign_name,
                    spend: ad.spend,
                    revenue: ad.revenue,
                    roas: ad.roas,
                    star_count: starCountsByCreative[ad.creative_id || ad.ad_name] || 1
                  }))
                  // Sort by star count (universal performers first), then by ROAS
                  .sort((a, b) => b.star_count - a.star_count || b.roas - a.roas)
              })()}
            />
          </div>
        </div>
      )}

      {/* Clear Stars Prompt - shown after Performance Set creation */}
      {showClearStarsPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Performance Set Created!</h3>
            </div>
            <p className="text-zinc-400 mb-6">
              Your new CBO campaign with {performanceSetAdIds.length} winner{performanceSetAdIds.length !== 1 ? 's' : ''} has been created and is paused for your review.
            </p>
            <p className="text-sm text-zinc-500 mb-4">
              Clear these stars from your list?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowClearStarsPrompt(false)
                  setPerformanceSetAdIds([])
                }}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                Keep Stars
              </button>
              <button
                onClick={async () => {
                  await handleClearStars(performanceSetAdIds)
                  setShowClearStarsPrompt(false)
                  setPerformanceSetAdIds([])
                }}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg font-medium transition-colors"
              >
                Clear Stars
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Toolbar - floating at bottom */}
      <BulkActionToolbar
        selectedItems={bulkSelectedItems}
        onPause={handleBulkPause}
        onResume={handleBulkResume}
        onDelete={handleBulkDelete}
        onScaleBudget={() => {}} // TODO: Implement bulk budget scaling
        onCopyAds={() => {}} // TODO: Implement bulk copy
        onClear={handleBulkClearSelection}
        isLoading={bulkLoading}
        loadingAction={bulkLoadingAction}
      />

      {/* Bulk Operation Progress */}
      {bulkProgress && (
        <BulkOperationProgress
          isOpen={bulkProgress.isOpen}
          title={bulkProgress.title}
          total={bulkProgress.total}
          completed={bulkProgress.completed}
          failed={bulkProgress.failed}
          currentItem={bulkProgress.currentItem}
          results={bulkProgress.results}
          onClose={() => setBulkProgress(null)}
        />
      )}
    </>
  )
}
