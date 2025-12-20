'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Upload, Lock, Trash2, RefreshCw, UserPlus } from 'lucide-react'
import { StatCard, BudgetCard, StatIcons } from '@/components/stat-card'
import { PerformanceTable } from '@/components/performance-table'
import { CSVUpload } from '@/components/csv-upload'
import { StatusChangeModal } from '@/components/confirm-modal'
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
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

// Helper to get cache key
const getCacheKey = (accountId: string | null, workspaceAccountIds: string[]): string => {
  if (workspaceAccountIds.length > 0) {
    return `workspace:${workspaceAccountIds.sort().join(',')}`
  }
  return accountId || 'none'
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

export default function DashboardPage() {
  const [data, setData] = useState<CSVRow[]>([])
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [showUpload, setShowUpload] = useState(false)
  const [isLoading, setIsLoading] = useState(false) // Start false, only show on first load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false) // Track if we've ever loaded
  const hasTriggeredInitialSync = useRef(false) // Track if we've triggered auto-sync on first load
  const isFirstSessionLoad = useRef(typeof window !== 'undefined' && !sessionStorage.getItem('ks_session_synced')) // Fresh login detection
  const userManuallyDeselected = useRef(false) // Track if user manually deselected all
  const [pendingInitialSync, setPendingInitialSync] = useState<string | null>(null) // Account ID to sync on first load
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all')
  const [includePaused, setIncludePaused] = useState(true)
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
  } | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [highlightEntity, setHighlightEntity] = useState<{
    type: 'campaign' | 'adset' | 'ad'
    name: string
    campaignName?: string
    adsetName?: string
  } | null>(null)
  const [showWalkinModal, setShowWalkinModal] = useState(false)
  const [starredAds, setStarredAds] = useState<StarredAd[]>([])
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [launchWizardEntityType, setLaunchWizardEntityType] = useState<'campaign' | 'adset' | 'ad' | 'performance-set'>('campaign')
  const [showClearStarsPrompt, setShowClearStarsPrompt] = useState(false)
  const [performanceSetAdIds, setPerformanceSetAdIds] = useState<string[]>([])
  const { plan } = useSubscription()
  const { user } = useAuth()
  const { currentAccountId, accounts, workspaceAccountIds, currentWorkspaceId } = useAccount()
  const { isKillScaleActive, attributionData, lastTouchAttribution, multiTouchAttribution, isMultiTouchModel, refreshAttribution } = useAttribution()
  const searchParams = useSearchParams()

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

  // Load starred ads when account changes
  const loadStarredAds = async (accountId: string) => {
    if (!user?.id) return
    try {
      const response = await fetch(`/api/starred?userId=${user.id}&adAccountId=${accountId}`)
      if (response.ok) {
        const data = await response.json()
        setStarredAds(data.starred || [])
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
          spend: ad.spend,
          revenue: ad.revenue,
          roas: ad.roas
        })
      })
      if (response.ok) {
        const data = await response.json()
        setStarredAds(prev => [...prev, data.starred])
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
  
  // Initial data load - triggers 30-day sync if no data exists
  useEffect(() => {
    if (!user) return

    const initialLoad = async () => {
      // First load data from Supabase
      await loadData()

      // Check if we should trigger initial sync (only once per page load)
      if (hasTriggeredInitialSync.current) return

      const accountToSync = currentAccountId || accounts[0]?.id
      if (!accountToSync || accounts.length === 0) return

      // Check cache validity for current account/workspace
      const cacheKey = getCacheKey(currentAccountId, workspaceAccountIds)
      const cached = dataCache.get(cacheKey)
      const hasFreshCache = cached && isCacheValid(cached, 'last_30d')

      // Only sync on fresh login (new session)
      // If we've already synced this session, just load from Supabase - don't hit Meta API again
      const hasSessionSync = sessionStorage.getItem('ks_session_synced')
      if (isFirstSessionLoad.current && !hasSessionSync) {
        hasTriggeredInitialSync.current = true
        sessionStorage.setItem('ks_session_synced', 'true')
        console.log('[Dashboard] Fresh session - triggering initial sync')
        setDatePreset('last_30d')
        setPendingInitialSync(accountToSync)
      } else {
        console.log('[Dashboard] Already synced this session - loading from Supabase only')
      }
    }

    initialLoad()
  }, [user?.id, accounts.length]) // Include accounts.length to re-run when accounts load

  // Track when we're executing the initial sync (to prevent Effect 4 from double-syncing)
  const isExecutingInitialSyncRef = useRef(false)

  // Execute pending initial sync (separate effect to ensure datePreset is updated)
  useEffect(() => {
    if (pendingInitialSync && datePreset === 'last_30d' && !isSyncing) {
      console.log('[Dashboard] Executing initial 30-day sync for', pendingInitialSync)
      isExecutingInitialSyncRef.current = true
      setPendingInitialSync(null) // Clear before executing to prevent loops
      handleSyncAccount(pendingInitialSync)
      // Reset the flag after a delay to allow the sync to complete
      setTimeout(() => {
        isExecutingInitialSyncRef.current = false
      }, 2000)
    }
  }, [pendingInitialSync, datePreset, isSyncing])

  // Check cache when switching accounts/workspaces
  useEffect(() => {
    if (!user) return
    // Skip cache check if no account/workspace selected
    if (!currentAccountId && workspaceAccountIds.length === 0) return

    const cacheKey = getCacheKey(currentAccountId, workspaceAccountIds)
    const cached = dataCache.get(cacheKey)

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
    console.log('[Dashboard] Attribution effect running, isKillScaleActive:', isKillScaleActive)
    if (!isKillScaleActive) return

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
      until = formatDate(today)
    }

    console.log('[Dashboard] Calling refreshAttribution with:', { since, until })
    refreshAttribution(since, until)
  }, [isKillScaleActive, datePreset, customStartDate, customEndDate, refreshAttribution])

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
  const isInitialMount = useRef(true)

  // NOTE: Meta's presets (last_30d, last_7d, etc) are COMPLETE days - they don't include today
  // Only "today" preset has truly live data. Removed misleading "Live" indicator.

  // NOTE: Sync uses the selected date range from the date picker
  // Track if user has manually changed the date preset (vs component mount/navigation)
  const userChangedDatePreset = useRef(false)

  // Smart sync when date preset changes - only sync if USER changed it and cache can't serve
  useEffect(() => {
    // Skip initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (!selectedAccountId || !user) return
    if (datePreset === 'custom') return // Custom dates handled by handleCustomDateApply
    if (pendingInitialSync) return // Initial sync will handle this
    if (isExecutingInitialSyncRef.current) return // Don't double-sync during initial load

    // Only sync if user explicitly changed the date preset
    // This prevents syncs from component remount/navigation
    if (!userChangedDatePreset.current) {
      console.log('[Dashboard] Date preset effect skipped - not a user change')
      return
    }
    userChangedDatePreset.current = false // Reset after handling

    // Check if current cache can serve this request
    const cachedEntry = dataCache.get(selectedAccountId)
    if (cachedEntry && isCacheValid(cachedEntry, datePreset)) {
      // Cache covers this range - no sync needed, client-side filtering handles it
      return
    }

    // Need larger range than cached - sync new data
    // Debounce to avoid rapid syncs when clicking through presets
    const timeout = setTimeout(() => {
      // Double-check we're not in initial sync when timeout fires
      if (isExecutingInitialSyncRef.current) return
      handleSyncAccount(selectedAccountId)
    }, 500)

    return () => clearTimeout(timeout)
  }, [datePreset, selectedAccountId, user])

  const loadData = async (showLoading = true) => {
    if (!user) return
    
    // Only show loading spinner on very first load (never loaded before)
    if (showLoading && !hasLoadedOnce) {
      setIsLoading(true)
    }
    
    const { data: adData, error } = await supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .order('date_start', { ascending: false })

    if (adData && !error) {
      const rows = adData.map(row => ({
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
        // Budget fields for CBO/ABO detection
        campaign_daily_budget: row.campaign_daily_budget,
        campaign_lifetime_budget: row.campaign_lifetime_budget,
        adset_daily_budget: row.adset_daily_budget,
        adset_lifetime_budget: row.adset_lifetime_budget,
      }))
      setData(rows)

      // Note: Campaign selection is now handled by the useEffect that watches accountFilteredData
      // This ensures selection is always for the currently selected account
    }
    setHasLoadedOnce(true)
    setIsLoading(false)
  }

  // Load data and cache for specific account or workspace
  const loadDataAndCache = async (accountId: string | null, wsAccountIds: string[] = []) => {
    if (!user) return

    const { data: adData, error } = await supabase
      .from('ad_data')
      .select('*')
      .eq('user_id', user.id)
      .order('date_start', { ascending: false })

    if (adData && !error) {
      const rows = adData.map(row => ({
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
        campaign_daily_budget: row.campaign_daily_budget,
        campaign_lifetime_budget: row.campaign_lifetime_budget,
        adset_daily_budget: row.adset_daily_budget,
        adset_lifetime_budget: row.adset_lifetime_budget,
      }))

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

      dataCache.set(cacheKey, {
        data: cacheData,
        datePreset,
        customStartDate,
        customEndDate,
        fetchedAt: Date.now()
      })
      console.log('[Cache] Cached', cacheData.length, 'rows for', cacheKey)

      return rows
    }
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

  const handleUpload = async (rows: CSVRow[]) => {
    if (!user) return
    
    setIsSaving(true)
    
    // Delete all existing data
    await supabase
      .from('ad_data')
      .delete()
      .eq('user_id', user.id)

    const insertData = rows.map(row => ({
      user_id: user.id,
      source: 'csv',  // Mark as CSV data
      date_start: row.date_start,
      date_end: row.date_end,
      campaign_name: row.campaign_name,
      adset_name: row.adset_name,
      ad_name: row.ad_name,
      impressions: row.impressions,
      clicks: row.clicks,
      spend: row.spend,
      purchases: row.purchases,
      revenue: row.revenue,
      // CSV data doesn't have status - leave as null/default
    }))

    const { error } = await supabase
      .from('ad_data')
      .insert(insertData)

    if (!error) {
      setData(rows)
      const campaigns = new Set(rows.map(r => r.campaign_name))
      setSelectedCampaigns(campaigns)
    } else {
      console.error('Error saving data:', error)
      alert('Error saving data. Please try again.')
    }
    
    setIsSaving(false)
    setShowUpload(false)
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
      // Note: The API handles deletion, no need to delete here
      // Use the selected date preset from the date picker
      const response = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: accountId,
          datePreset: datePreset,
          ...(datePreset === 'custom' && customStartDate && customEndDate ? {
            customStartDate,
            customEndDate,
          } : {}),
        }),
      })
      
      const result = await response.json()
      
      if (response.ok) {
        // Silent refresh - don't show loading spinner, preserves table state
        const newData = await loadDataAndCache(accountId)
        setLastSyncTime(new Date())

        // After sync, ensure ABO adsets are selected (they may have been missed on initial load)
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

    // Clear cache for ALL workspace accounts BEFORE sync
    for (const accountId of workspaceAccountIds) {
      dataCache.delete(accountId)
    }

    setIsSyncing(true)

    try {
      // Sync each account in the workspace sequentially
      for (const accountId of workspaceAccountIds) {
        const response = await fetch('/api/meta/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: accountId,
            datePreset: datePreset,
            ...(datePreset === 'custom' && customStartDate && customEndDate ? {
              customStartDate,
              customEndDate,
            } : {}),
          }),
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
    newStatus: 'ACTIVE' | 'PAUSED'
  ) => {
    setStatusChangeModal({
      isOpen: true,
      entityId,
      entityType,
      entityName,
      action: newStatus === 'PAUSED' ? 'pause' : 'resume'
    })
  }

  // Confirm and execute status change
  const handleStatusChangeConfirm = async () => {
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
        }),
      })
      
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
    oldBudget?: number
  ) => {
    if (!user) throw new Error('Not authenticated')

    const response = await fetch('/api/meta/update-budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        entityId,
        entityType,
        budget: newBudget,
        budgetType,
        oldBudget,
        adAccountId: selectedAccountId
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update budget')
    }

    // Refresh data to reflect the change
    await loadData(false)
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
    userChangedDatePreset.current = true // Mark as user-initiated change
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
      // Trigger sync for custom date range
      if (canSync && (selectedAccountId || workspaceAccountIds.length > 0)) {
        handleSync()
      }
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

    // If KillScale attribution is active, REPLACE all attribution data with KillScale pixel data
    // NO META FALLBACK - if no KillScale data for an ad, show 0 conversions
    // Use multiTouchAttribution for ad-level data (fractional for multi-touch models)
    if (isKillScaleActive) {
      // Debug: log Meta ad IDs for comparison with attribution data
      const metaAdIds = Array.from(new Set(filtered.map(r => r.ad_id).filter((id): id is string => !!id)))
      const attrAdIds = Object.keys(multiTouchAttribution)
      const matches = metaAdIds.filter(id => multiTouchAttribution[id])
      console.log('[KS Attribution] Active - replacing all data:', {
        metaAdIds: metaAdIds.slice(0, 10), // First 10
        attrAdIds,
        matches,
        matchCount: matches.length,
        totalAds: metaAdIds.length,
        isMultiTouchModel
      })

      return filtered.map(row => {
        // Get KillScale attribution for this ad (fractional for multi-touch)
        const adAttribution = row.ad_id ? multiTouchAttribution[row.ad_id] : null
        const newRevenue = adAttribution?.revenue ?? 0
        const newPurchases = adAttribution?.conversions ?? 0
        const newRoas = row.spend > 0 ? newRevenue / row.spend : 0

        return {
          ...row,
          purchases: newPurchases,
          revenue: newRevenue,
          // Also update results for results-based tracking
          results: newPurchases,
          result_value: newRevenue,
          // Recalculate ROAS with KillScale data
          _ksRoas: newRoas,
          _ksAttribution: true  // Flag to indicate KillScale attribution is active
        }
      })
    }

    return filtered
  }, [data, selectedAccountId, workspaceAccountIds, isKillScaleActive, multiTouchAttribution, isMultiTouchModel])

  const allCampaigns = useMemo(() =>
    Array.from(new Set(accountFilteredData.map(row => row.campaign_name))),
    [accountFilteredData]
  )

  // Auto-select all campaigns and ABO adsets when selection is empty but we have data
  // This runs on initial load and after account switches (when we reset selection)
  // Skip if user manually deselected all
  useEffect(() => {
    if (selectedCampaigns.size === 0 && accountFilteredData.length > 0 && !userManuallyDeselected.current) {
      const selection = new Set<string>()
      const seenAdsets = new Set<string>()

      accountFilteredData.forEach(r => {
        // Add campaign
        selection.add(r.campaign_name)

        // Add ABO adsets (adset has budget, campaign doesn't)
        const adsetKey = `${r.campaign_name}::${r.adset_name}`
        if (!seenAdsets.has(adsetKey)) {
          seenAdsets.add(adsetKey)
          const isAbo = (r.adset_daily_budget || r.adset_lifetime_budget) &&
                        !(r.campaign_daily_budget || r.campaign_lifetime_budget)
          if (isAbo) {
            selection.add(adsetKey)
          }
        }
      })
      setSelectedCampaigns(selection)
    }
  }, [accountFilteredData, selectedCampaigns.size])

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
    return accountFilteredData.filter(row => {
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
  }, [accountFilteredData, visibleCampaigns, includePaused, getDateRange])
  
  const selectedData = useMemo(() =>
    filteredData.filter(row => {
      // Check if this is an ABO adset (adset has budget, campaign doesn't)
      const isAbo = (row.adset_daily_budget || row.adset_lifetime_budget) &&
                    !(row.campaign_daily_budget || row.campaign_lifetime_budget)

      if (isAbo) {
        // For ABO: include if the specific adset is selected (campaign selection is implicit)
        const adsetKey = `${row.campaign_name}::${row.adset_name}`
        return selectedCampaigns.has(adsetKey)
      } else {
        // For CBO: include if campaign is selected
        return selectedCampaigns.has(row.campaign_name)
      }
    }),
    [filteredData, selectedCampaigns]
  )
  
  const totals = useMemo(() => {
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
      convRate: 0
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
  }, [selectedData])
  
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

    setSelectedCampaigns(newSelected)
  }

  const handleSelectAll = () => {
    // Check if all campaigns are selected (ABO adsets don't affect this check)
    const allCampaignsSelected = visibleCampaigns.every(c => selectedCampaigns.has(c))

    if (allCampaignsSelected) {
      userManuallyDeselected.current = true
      setSelectedCampaigns(new Set())
    } else {
      userManuallyDeselected.current = false
      // Select all campaigns and their ABO adsets
      const newSelected = new Set<string>(visibleCampaigns)
      visibleCampaigns.forEach(campaignName => {
        const aboAdsets = campaignAboAdsets.get(campaignName)
        if (aboAdsets) {
          aboAdsets.forEach(adsetKey => newSelected.add(adsetKey))
        }
      })
      setSelectedCampaigns(newSelected)
    }
  }

  const allSelected = visibleCampaigns.length > 0 && visibleCampaigns.every(c => selectedCampaigns.has(c))
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

  // Calculate total daily budgets (CBO + ABO) - only count active (non-paused) items
  // CBO = budget at campaign level, ABO = budget at adset level
  // A campaign is CBO if it has campaign_daily_budget but adsets DON'T have their own budgets
  // A campaign is ABO if adsets have their own budgets (adset_daily_budget)
  const budgetTotals = useMemo(() => {
    let cboBudget = 0
    let aboBudget = 0

    // Track campaigns and their budget type
    const campaignBudgets = new Map<string, { budget: number; status: string | null | undefined; isCBO: boolean; selected: boolean }>()
    const adsetBudgets = new Map<string, { budget: number; status: string | null | undefined; selected: boolean; campaignName: string; campaignStatus: string | null | undefined }>()

    // Process ALL data to build budget maps, then filter by selection
    data.forEach(row => {
      // Determine if this is CBO or ABO based on where budget lives
      // CBO: campaign has budget, adset does NOT have budget
      // ABO: adset has budget (regardless of campaign budget field)
      const isCBO = !!(row.campaign_daily_budget || row.campaign_lifetime_budget) &&
                    !(row.adset_daily_budget || row.adset_lifetime_budget)

      // Track campaign-level budget (only for true CBO campaigns)
      if (isCBO && row.campaign_daily_budget && !campaignBudgets.has(row.campaign_name)) {
        campaignBudgets.set(row.campaign_name, {
          budget: row.campaign_daily_budget,
          status: row.campaign_status,
          isCBO: true,
          selected: selectedCampaigns.has(row.campaign_name)
        })
      }

      // Track adset-level budgets (ABO)
      const adsetKey = `${row.campaign_name}|${row.adset_name}`
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
        if (!campaignBudgets.has(row.campaign_name)) {
          campaignBudgets.set(row.campaign_name, {
            budget: 0,
            status: row.campaign_status,
            isCBO: false,
            selected: selectedCampaigns.has(row.campaign_name)
          })
        }
      }
    })

    // Sum CBO budgets (only selected and non-paused)
    campaignBudgets.forEach(({ budget, status, isCBO, selected }) => {
      if (isCBO && selected && status?.toUpperCase() !== 'PAUSED') {
        cboBudget += budget
      }
    })

    // Sum ABO budgets (only selected and non-paused, check parent campaign too)
    adsetBudgets.forEach(({ budget, status, selected, campaignStatus }) => {
      if (!selected) return

      if (status?.toUpperCase() !== 'PAUSED' && campaignStatus?.toUpperCase() !== 'PAUSED') {
        aboBudget += budget
      }
    })

    return {
      cbo: cboBudget,
      abo: aboBudget,
      total: cboBudget + aboBudget
    }
  }, [data, selectedCampaigns])
  
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
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
            <p className="text-zinc-500">Your Meta Ads performance at a glance</p>
          </div>
          
          {/* Entity counts next to Dashboard */}
          {data.length > 0 && (
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-verdict-scale rounded-full" />
                <span className="text-zinc-400">{entityCounts.accounts} account{entityCounts.accounts !== 1 ? 's' : ''}</span>
              </div>
              <div className="w-px h-3 bg-border" />
              <span className="text-zinc-400">{entityCounts.campaigns} campaign{entityCounts.campaigns !== 1 ? 's' : ''}</span>
              <div className="w-px h-3 bg-border" />
              <span className="text-zinc-400">{entityCounts.adsets} ad set{entityCounts.adsets !== 1 ? 's' : ''}</span>
              <div className="w-px h-3 bg-border" />
              <span className="text-zinc-400">{entityCounts.ads} ad{entityCounts.ads !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 overflow-x-auto">
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

          {/* Sync Button - now shows syncing state more prominently */}
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
            {isSyncing ? <span className="hidden sm:inline">Syncing...</span> : <span className="hidden sm:inline">Sync</span>}
            {lastSyncTime && !isSyncing && (
              <span className="text-xs text-zinc-500 hidden lg:inline">{getTimeSinceSync()}</span>
            )}
          </button>

          {/* Log Walk-In Button - Pro+ with KillScale pixel only */}
          {isProPlus && isKillScaleActive && currentWorkspaceId && (
            <button
              onClick={() => setShowWalkinModal(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
              title="Log a walk-in or offline conversion"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden lg:inline">Walk-In</span>
            </button>
          )}

          {/* Starred Ads Badge + Popover - for building Performance Sets */}
          {isProPlus && (
            <StarredAdsPopover
              starredAds={starredAds}
              onBuildPerformanceSet={handleBuildPerformanceSet}
              onUnstarAd={handleUnstarAd}
            />
          )}

          <button
            onClick={() => setShowUpload(true)}
            className="flex-shrink-0 hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden lg:inline">CSV</span>
          </button>

          {/* Delete Button - far right */}
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
              <p className="text-zinc-500 mb-6">
                {canSync && (selectedAccountId || workspaceAccountIds.length > 0)
                  ? 'Click Sync to fetch data from Meta Ads, or upload a CSV'
                  : 'Upload a CSV export from Meta Ads to get started'
                }
              </p>
              <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                {canSync && (selectedAccountId || workspaceAccountIds.length > 0) && (
                  <button
                    onClick={handleSync}
                    className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Sync from Meta
                  </button>
                )}
                <button
                  onClick={() => setShowUpload(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    canSync && (selectedAccountId || workspaceAccountIds.length > 0)
                      ? 'bg-bg-card border border-border text-zinc-300 hover:text-white hover:border-zinc-500'
                      : 'bg-accent hover:bg-accent-hover text-white'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload CSV</span>
                </button>
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
          
          {/* Campaign Selection Indicator */}
          {selectedCampaigns.size < visibleCampaigns.length && selectedCampaigns.size > 0 && (
            <div className="mb-4 px-4 py-2 bg-accent/10 border border-accent/30 rounded-lg flex items-center justify-between">
              <div className="text-sm text-accent">
                Showing stats for {selectedCampaigns.size} of {visibleCampaigns.length} campaigns
              </div>
              <button 
                onClick={() => setSelectedCampaigns(new Set(visibleCampaigns))}
                className="text-xs text-accent hover:text-white transition-colors"
              >
                Select All
              </button>
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

          {/* Primary Stats Row - responsive grid with min/max constraints */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-4 min-w-[600px] lg:min-w-[900px] max-w-[1400px]">
            <StatCard
              label="Total Spend"
              value={formatCurrency(totals.spend)}
              icon={StatIcons.spend}
              glow="blue"
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(totals.revenue)}
              icon={StatIcons.revenue}
              glow="green"
            />
            <StatCard
              label="ROAS"
              value={formatROAS(totals.roas)}
              icon={StatIcons.roas}
              glow="purple"
            />
            <StatCard
              label="Results"
              value={formatNumber(totals.results)}
              icon={StatIcons.results}
              glow="amber"
            />
            <StatCard
              label="CPR/CPA"
              value={totals.cpr > 0 ? formatCurrency(totals.cpr) : '—'}
              icon={StatIcons.cpr}
              glow="rose"
            />
            </div>
          </div>

          {/* Secondary Stats Row - hidden on mobile, visible on larger screens */}
          <div className="overflow-x-auto">
            <div className="hidden lg:grid grid-cols-5 gap-4 mb-8 min-w-[900px] max-w-[1400px]">
            {/* Daily Budgets - left bookend */}
            <BudgetCard
              totalBudget={formatCurrency(budgetTotals.total)}
              cboBudget={formatCurrency(budgetTotals.cbo)}
              aboBudget={formatCurrency(budgetTotals.abo)}
            />

            {/* Middle metrics */}
            <StatCard
              label="CPM"
              value={formatCPM(totals.spend, totals.impressions)}
              icon={StatIcons.cpm}
              glow="cyan"
            />
            <StatCard
              label="CPC"
              value={formatCPC(totals.spend, totals.clicks)}
              icon={StatIcons.cpc}
              glow="blue"
            />
            <StatCard
              label="AOV"
              value={formatAOV(totals.revenue, totals.purchases)}
              icon={StatIcons.aov}
              glow="green"
            />

            {/* Conv Rate - right bookend */}
            <StatCard
              label="Conv Rate"
              value={formatPercent(totals.convRate)}
              icon={StatIcons.convRate}
              glow="amber"
            />
            </div>
          </div>

          {/* Controls Bar - matching mockup exactly */}
          <div className="flex items-center gap-4 mb-6 min-w-[900px] max-w-[1400px]">
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
            </div>
          </div>
          
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
            lastTouchAttribution={isKillScaleActive ? lastTouchAttribution : undefined}
            isMultiTouchModel={isMultiTouchModel}
            expandAllTrigger={expandTrigger}
            onExpandedStateChange={setTableExpanded}
            externalSortField={sortField}
            externalSortDirection={sortDirection}
            starredAdIds={starredAdIds}
            onStarAd={handleStarAd}
            onUnstarAd={handleUnstarAd}
          />
        </>
      )}
      
      {showUpload && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowUpload(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-bg-sidebar border border-border rounded-xl p-6 z-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold"><span className="hidden sm:inline">Upload CSV</span></h2>
              <button 
                onClick={() => setShowUpload(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
            <CSVUpload onUpload={handleUpload} isLoading={isSaving} />
            {isSaving && (
              <div className="mt-4 text-center text-sm text-zinc-500">
                Saving your data...
              </div>
            )}
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
      />

      {/* Launch Wizard - Full Screen Overlay */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <div className="min-h-screen px-4 py-8">
            <LaunchWizard
              adAccountId={currentAccountId}
              onComplete={(performanceSetResult) => {
                setShowLaunchWizard(false)
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
              starredAds={starredAds.map(ad => ({
                ad_id: ad.ad_id,
                ad_name: ad.ad_name,
                adset_id: ad.adset_id,
                adset_name: ad.adset_name,
                campaign_id: ad.campaign_id,
                campaign_name: ad.campaign_name,
                spend: ad.spend,
                revenue: ad.revenue,
                roas: ad.roas
              }))}
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
    </>
  )
}
