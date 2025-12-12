'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Upload, Lock, Trash2, RefreshCw } from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import { PerformanceTable } from '@/components/performance-table'
import { CSVUpload } from '@/components/csv-upload'
import { StatusChangeModal } from '@/components/confirm-modal'
import { DatePicker, DatePickerButton, DATE_PRESETS } from '@/components/date-picker'
import { CSVRow } from '@/lib/csv-parser'
import { Rules } from '@/lib/supabase'
import { formatCurrency, formatNumber, formatROAS, formatDateRange } from '@/lib/utils'
import { useSubscription } from '@/lib/subscription'
import { useAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const FREE_CAMPAIGN_LIMIT = 2
const STARTER_CAMPAIGN_LIMIT = 10

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

type MetaConnection = {
  ad_accounts: { id: string; name: string; in_dashboard?: boolean }[]
  selected_account_id: string | null
}

export default function DashboardPage() {
  const [data, setData] = useState<CSVRow[]>([])
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [showUpload, setShowUpload] = useState(false)
  const [isLoading, setIsLoading] = useState(false) // Start false, only show on first load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false) // Track if we've ever loaded
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
  const [connection, setConnection] = useState<MetaConnection | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple') // Simple by default
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
  const { plan } = useSubscription()
  const { user } = useAuth()
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
  
  const canSync = true // All plans can sync via Meta API
  
  useEffect(() => {
    if (user) {
      loadData()
      loadConnection()
    }
  }, [user?.id]) // Use user.id to avoid re-fetching when Supabase refreshes the session token on tab focus

  // Load rules when account changes
  useEffect(() => {
    if (user && connection) {
      const accountId = connection.selected_account_id ||
        connection.ad_accounts?.find(a => a.in_dashboard)?.id
      loadRules(accountId)
    }
  }, [user?.id, connection?.selected_account_id])

  // Reload connection and rules when account is switched from sidebar
  useEffect(() => {
    const handleAccountsUpdated = () => {
      if (user) {
        loadConnection()
      }
    }
    window.addEventListener('meta-accounts-updated', handleAccountsUpdated)
    return () => window.removeEventListener('meta-accounts-updated', handleAccountsUpdated)
  }, [user?.id])

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

  const loadConnection = async () => {
    if (!user) return
    
    const { data, error } = await supabase
      .from('meta_connections')
      .select('ad_accounts, selected_account_id')
      .eq('user_id', user.id)
      .single()
    
    if (data && !error) {
      setConnection(data)
    }
  }

  const selectedAccountId = connection?.selected_account_id ||
    connection?.ad_accounts?.find(a => a.in_dashboard)?.id

  // Track previous account to detect actual switches (not initial load)
  const prevAccountIdRef = useRef<string | undefined>(undefined)

  // Reset campaign selection when switching accounts (not on initial load)
  useEffect(() => {
    if (selectedAccountId) {
      // Only reset if this is an actual switch (not initial load)
      if (prevAccountIdRef.current && prevAccountIdRef.current !== selectedAccountId) {
        setSelectedCampaigns(new Set())
      }
      prevAccountIdRef.current = selectedAccountId
    }
  }, [selectedAccountId])

  // Track if this is the initial mount (to prevent auto-sync on page load)
  const isInitialMount = useRef(true)

  // Compute if we're viewing "live" data (date range includes today)
  const isLive = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    
    // Presets that include today
    const livePresets = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'maximum']
    
    if (datePreset === 'custom') {
      // Custom range is live if end date is today or later
      return customEndDate >= today
    }
    
    return livePresets.includes(datePreset)
  }, [datePreset, customEndDate])

  // NOTE: Sync uses the selected date range from the date picker
  // When user changes date preset, they need to click Sync to fetch new data
  // Client-side filtering allows instant switching within the synced range
  useEffect(() => {
    // Just track mount state for other effects
    if (isInitialMount.current) {
      isInitialMount.current = false
    }
  }, [datePreset])

  // Auto-refresh every 5 minutes when viewing live data
  useEffect(() => {
    if (!isLive || !canSync || !selectedAccountId) return
    
    const interval = setInterval(() => {
      handleSyncAccount(selectedAccountId)
    }, 5 * 60 * 1000) // 5 minutes
    
    return () => clearInterval(interval)
  }, [isLive, canSync, selectedAccountId])

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
        revenue: parseFloat(row.revenue),
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

  const loadRules = async (accountId?: string | null) => {
    if (!user) return

    // Load rules for the specific account, or user-level if no account
    let query = supabase
      .from('rules')
      .select('*')
      .eq('user_id', user.id)

    if (accountId) {
      query = query.eq('ad_account_id', accountId)
    } else {
      query = query.is('ad_account_id', null)
    }

    const { data: rulesData, error } = await query.single()

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
      // No account-specific rules, use defaults
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

  // Sync a specific account (used by sidebar dropdown)
  const handleSyncAccount = async (accountId: string) => {
    if (!user || !canSync) return

    // Prevent duplicate syncs (both state and ref check)
    if (isSyncing || syncingRef.current) return
    syncingRef.current = true

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
        // Refresh connection in background (don't await - prevents potential hanging)
        loadConnection()
        // Silent refresh - don't show loading spinner, preserves table state
        await loadData(false)
        setLastSyncTime(new Date())
      } else {
        alert(result.error || 'Sync failed')
      }
    } catch (err) {
      alert('Sync failed. Please try again.')
    }

    syncingRef.current = false
    setIsSyncing(false)
  }

  // Sync using the currently selected account
  const handleSync = async () => {
    if (!selectedAccountId) return
    await handleSyncAccount(selectedAccountId)
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
      if (canSync && selectedAccountId) {
        handleSyncAccount(selectedAccountId)
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
  const getDateRange = useMemo(() => {
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

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

  // Filter campaigns by selected account first
  const accountFilteredData = useMemo(() => {
    return data.filter(row => {
      if (selectedAccountId && row.ad_account_id && row.ad_account_id !== selectedAccountId) {
        return false
      }
      return true
    })
  }, [data, selectedAccountId])

  const allCampaigns = useMemo(() =>
    Array.from(new Set(accountFilteredData.map(row => row.campaign_name))),
    [accountFilteredData]
  )

  // Auto-select all campaigns and ABO adsets when selection is empty but we have data
  // This runs on initial load and after account switches (when we reset selection)
  useEffect(() => {
    if (selectedCampaigns.size === 0 && accountFilteredData.length > 0) {
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
  const getCampaignLimit = () => {
    if (userPlan === 'Free') return FREE_CAMPAIGN_LIMIT
    if (userPlan === 'Starter') return STARTER_CAMPAIGN_LIMIT
    return Infinity
  }
  
  const campaignLimit = getCampaignLimit()
  const isLimited = totalCampaigns > campaignLimit
  const hiddenCampaigns = isLimited ? totalCampaigns - campaignLimit : 0
  
  const visibleCampaigns = isLimited
    ? allCampaigns.slice(0, campaignLimit)
    : allCampaigns
  
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Account filter - only show data for the selected account
      if (selectedAccountId && row.ad_account_id && row.ad_account_id !== selectedAccountId) {
        return false
      }

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
  }, [data, visibleCampaigns, includePaused, getDateRange, selectedAccountId])
  
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
  const campaignAboAdsets = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const seenAdsets = new Set<string>()

    data.forEach(row => {
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
  }, [data])

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
      setSelectedCampaigns(new Set())
    } else {
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
    const accounts = connection?.ad_accounts?.filter(a => a.in_dashboard)?.length || 0
    return { accounts, campaigns: campaigns.size, adsets: adsets.size, ads: ads.size }
  }, [filteredData, connection])

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
        
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          {data.length > 0 && (
            <>
              {/* Live/Historical Indicator */}
              {canSync && selectedAccountId && (
                isLive ? (
                  <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    <span className="text-sm text-green-400">Live</span>
                  </div>
                ) : (
                  <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-zinc-500/10 border border-zinc-500/30 rounded-lg">
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
                    </span>
                    <span className="text-sm text-zinc-400">Historical</span>
                  </div>
                )
              )}

              {/* Date Picker Dropdown */}
              <div className="relative">
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
            disabled={!canSync || isSyncing || !selectedAccountId}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSyncing
                ? 'bg-accent/20 border border-accent/50 text-accent'
                : canSync && selectedAccountId
                  ? 'bg-bg-card border border-border text-zinc-300 hover:text-white hover:border-zinc-500'
                  : 'bg-bg-card border border-border text-zinc-600 cursor-not-allowed'
            }`}
            title={!canSync ? 'Sync requires Pro plan' : !selectedAccountId ? 'Connect an account first' : 'Sync from Meta'}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? <span className="hidden sm:inline">Syncing...</span> : <span className="hidden sm:inline">Sync</span>}
            {lastSyncTime && !isSyncing && (
              <span className="text-xs text-zinc-500">{getTimeSinceSync()}</span>
            )}
          </button>
          
          <button 
            onClick={() => setShowUpload(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Upload CSV</span>
          </button>

          {/* Delete Button - far right */}
          {data.length > 0 && (
            <button 
              onClick={handleClearData}
              className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:border-red-400/50 transition-colors"
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
                {canSync && selectedAccountId 
                  ? 'Click Sync to fetch data from Meta Ads, or upload a CSV'
                  : 'Upload a CSV export from Meta Ads to get started'
                }
              </p>
              <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                {canSync && selectedAccountId && (
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
                    canSync && selectedAccountId
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
          
          {/* Primary Stats Row - responsive grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-4">
            <StatCard
              label="Total Spend"
              value={formatCurrency(totals.spend)}
              icon="💰"
              color="blue"
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(totals.revenue)}
              icon="💵"
              color="green"
            />
            <StatCard
              label="ROAS"
              value={formatROAS(totals.roas)}
              icon="📈"
              color="purple"
            />
            <StatCard
              label="Results"
              value={formatNumber(totals.results)}
              icon="🎯"
              color="amber"
            />
            {/* Daily Budgets tile */}
            <div className="relative overflow-hidden rounded-xl p-3 lg:p-5 col-span-2 lg:col-span-1 transition-all duration-300 bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 hover:border-indigo-500/50 hover:shadow-xl">
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
                  <span className="text-base lg:text-lg drop-shadow-sm">🎯</span>
                  <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide">Daily Budgets</span>
                </div>
                <div className="text-xl lg:text-3xl font-bold font-mono text-white mb-2">
                  {formatCurrency(budgetTotals.total)}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-hierarchy-campaign rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                    <span className="text-zinc-500">CBO</span>
                    <span className="text-zinc-300 font-mono">{formatCurrency(budgetTotals.cbo)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-hierarchy-adset rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)]"></span>
                    <span className="text-zinc-500">ABO</span>
                    <span className="text-zinc-300 font-mono">{formatCurrency(budgetTotals.abo)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Secondary Stats Row - hidden on mobile, visible on larger screens */}
          <div className="hidden lg:grid grid-cols-6 gap-4 mb-8">
            <StatCard 
              label="CPM" 
              value={formatCPM(totals.spend, totals.impressions)}
              icon="👁️"
            />
            <StatCard 
              label="CPC" 
              value={formatCPC(totals.spend, totals.clicks)}
              icon="👆"
            />
            <StatCard 
              label="CTR" 
              value={formatPercent(totals.ctr)}
              icon="🎯"
            />
            <StatCard
              label="CPR"
              value={totals.cpr > 0 ? formatCurrency(totals.cpr) : '—'}
              icon="💳"
            />
            <StatCard 
              label="AOV" 
              value={formatAOV(totals.revenue, totals.purchases)}
              icon="🧾"
            />
            <StatCard 
              label="Conv Rate" 
              value={formatPercent(totals.convRate)}
              icon="✅"
            />
          </div>
          
          {/* Verdict Filters - scrollable on mobile */}
          <div className="mb-4">
            {/* Mobile: Filter label with Paused toggle */}
            <div className="flex items-center justify-between mb-2 lg:hidden">
              <span className="text-sm text-zinc-500">Filter:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIncludePaused(!includePaused)}
                  className={`relative w-9 h-5 rounded-full transition-all ${
                    includePaused ? 'bg-zinc-600' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      includePaused ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </button>
                <span className={`text-sm ${includePaused ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  Paused
                </span>
              </div>
            </div>

            {/* Filter buttons row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 lg:overflow-visible">
              {/* Desktop: Filter label inline */}
              <span className="text-sm text-zinc-500 mr-2 flex-shrink-0 hidden lg:inline">Filter:</span>
              {filterButtons.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setVerdictFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex-shrink-0 ${
                    verdictFilter === filter.value
                      ? filter.value === 'all'
                        ? 'bg-zinc-700 border-zinc-600 text-white'
                        : filter.value === 'scale'
                          ? 'bg-verdict-scale/20 border-verdict-scale/50 text-verdict-scale'
                          : filter.value === 'watch'
                            ? 'bg-verdict-watch/20 border-verdict-watch/50 text-verdict-watch'
                            : filter.value === 'kill'
                              ? 'bg-verdict-kill/20 border-verdict-kill/50 text-verdict-kill'
                              : 'bg-verdict-learn/20 border-verdict-learn/50 text-verdict-learn'
                      : 'bg-bg-card border-border text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  {filter.label}
                </button>
              ))}

              {/* Desktop: Include Paused Toggle */}
              <div className="hidden lg:flex items-center gap-2 ml-4 pl-4 border-l border-border flex-shrink-0">
                <button
                  onClick={() => setIncludePaused(!includePaused)}
                  className={`relative w-9 h-5 rounded-full transition-all ${
                    includePaused ? 'bg-zinc-600' : 'bg-zinc-800'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      includePaused ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </button>
                <span className={`text-sm ${includePaused ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  Include Paused
                </span>
              </div>

              {/* Desktop only: Simple/Detailed Toggle */}
              <div className="hidden lg:flex items-center gap-1 ml-4 pl-4 border-l border-border flex-shrink-0">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-2.5 py-1 text-xs rounded-l-md border transition-colors ${
                    viewMode === 'simple'
                      ? 'bg-accent border-accent text-white'
                      : 'bg-bg-card border-border text-zinc-400 hover:text-white'
                  }`}
                >
                  Simple
                </button>
                <button
                  onClick={() => setViewMode('detailed')}
                  className={`px-2.5 py-1 text-xs rounded-r-md border border-l-0 transition-colors ${
                    viewMode === 'detailed'
                      ? 'bg-accent border-accent text-white'
                      : 'bg-bg-card border-border text-zinc-400 hover:text-white'
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
            verdictFilter={verdictFilter}
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
    </>
  )
}
