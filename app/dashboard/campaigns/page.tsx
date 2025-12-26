'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, Plus, Play, Pause, ExternalLink, Loader2, Sparkles, ChevronRight, ChevronDown, Image as ImageIcon, Video, Trash2, X, Pencil, Square, CheckSquare, Copy } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useSubscription } from '@/lib/subscription'
import { useAccount } from '@/lib/account'
import { usePrivacyMode } from '@/lib/privacy-mode'
import { createClient } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { LaunchWizard } from '@/components/launch-wizard'
import { DeleteEntityModal } from '@/components/confirm-modal'
import { CreativePreviewTooltip } from '@/components/creative-preview-tooltip'
import { EditEntityModal } from '@/components/edit-entity-modal'
import { UtmIndicator } from '@/components/utm-indicator'
import { BulkActionToolbar, SelectedItem } from '@/components/bulk-action-toolbar'
import { BulkOperationProgress } from '@/components/bulk-operation-progress'
import { BulkBudgetModal } from '@/components/bulk-budget-modal'
import { DuplicateModal } from '@/components/duplicate-modal'
import { CopyAdsModal } from '@/components/copy-ads-modal'
import { InlineDuplicateModal } from '@/components/inline-duplicate-modal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface MetaCampaign {
  id: string
  name: string
  status: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  objective?: string
}

interface KillScaleCampaign {
  campaign_id: string
  budget_type: 'cbo' | 'abo'
  daily_budget: number
  created_at: string
  ad_ids: string[]
}

interface CombinedCampaign extends MetaCampaign {
  isKillScaleCreated: boolean
  killScaleData?: KillScaleCampaign
}

interface AdSet {
  id: string
  name: string
  status: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  optimizationGoal?: string
}

interface Ad {
  id: string
  name: string
  status: string
  creative: {
    id: string
    name?: string
    thumbnailUrl?: string
    imageUrl?: string
    hasCreative: boolean
  } | null
}

interface Creative {
  id: string
  name?: string
  thumbnailUrl?: string
  imageUrl?: string
  previewUrl?: string
  videoSource?: string
  mediaType: 'image' | 'video' | 'unknown'
}

export default function LaunchPage() {
  const router = useRouter()
  const { user } = useAuth()
  useSubscription() // Keep hook for future use
  const { currentAccountId, loading: accountLoading, currentWorkspaceId, workspaceAccountIds } = useAccount()
  const { isPrivacyMode, maskText } = usePrivacyMode()

  // Helper to mask names in privacy mode
  const maskName = (name: string, type: 'campaign' | 'adset' | 'ad', index: number = 0) => {
    if (!isPrivacyMode) return name
    const prefixes = { campaign: 'Campaign', adset: 'Ad Set', ad: 'Ad' }
    return `${prefixes[type]} ${index + 1}`
  }

  const [campaigns, setCampaigns] = useState<CombinedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    entityId: string
    entityType: 'campaign' | 'adset' | 'ad'
    entityName: string
    childCount?: { adsets?: number; ads?: number }
    parentCampaignId?: string
    parentAdSetId?: string
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Creative preview modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean
    previewUrl: string
    mediaType: 'image' | 'video' | 'unknown'
    name: string
  } | null>(null)

  // Edit modal state
  const [editModal, setEditModal] = useState<{
    isOpen: boolean
    entityType: 'campaign' | 'adset' | 'ad'
    entityId: string
    entityName: string
    campaignName?: string
    adsetId?: string
    adAccountId?: string
  } | null>(null)

  // Explorer state
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set())
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set())
  const [adSetsData, setAdSetsData] = useState<Record<string, AdSet[]>>({})
  const [adsData, setAdsData] = useState<Record<string, Ad[]>>({})
  const [creativesData, setCreativesData] = useState<Record<string, Creative>>({})
  const [loadingAdSets, setLoadingAdSets] = useState<Set<string>>(new Set())
  const [loadingAds, setLoadingAds] = useState<Set<string>>(new Set())
  const [loadingCreatives, setLoadingCreatives] = useState<Set<string>>(new Set())
  // Ref to track creatives we've already loaded or started loading (avoids stale closures)
  const loadedCreativesRef = useRef<Set<string>>(new Set())

  // UTM tracking status
  const [utmStatus, setUtmStatus] = useState<Record<string, boolean>>({})
  const [utmLoading, setUtmLoading] = useState(false)
  const utmFetchedForAccount = useRef<string | null>(null) // Track which account we've fetched UTM for

  // UTM cache helpers (5 minute TTL)
  const UTM_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  const getUtmCacheKey = (accountId: string) => `ks_utm_cache_${accountId}`

  const getUtmFromCache = (accountId: string): Record<string, boolean> | null => {
    try {
      const cached = sessionStorage.getItem(getUtmCacheKey(accountId))
      if (!cached) return null
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp > UTM_CACHE_TTL) {
        sessionStorage.removeItem(getUtmCacheKey(accountId))
        return null
      }
      return data
    } catch {
      return null
    }
  }

  const setUtmToCache = (accountId: string, data: Record<string, boolean>) => {
    try {
      sessionStorage.setItem(getUtmCacheKey(accountId), JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch {
      // Ignore storage errors
    }
  }

  // Bulk selection state
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkLoadingAction, setBulkLoadingAction] = useState<'pause' | 'resume' | 'delete' | 'duplicate' | 'scale' | 'copy' | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{
    isOpen: boolean
    title: string
    total: number
    completed: number
    failed: number
    currentItem?: string
    results: Array<{ id: string; name: string; success: boolean; error?: string }>
  } | null>(null)
  const [bulkBudgetModalOpen, setBulkBudgetModalOpen] = useState(false)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [copyAdsModalOpen, setCopyAdsModalOpen] = useState(false)
  const [inlineDuplicateModal, setInlineDuplicateModal] = useState<{
    isOpen: boolean
    itemType: 'campaign' | 'adset' | 'ad'
    itemId: string
    itemName: string
    parentCampaignId?: string
    parentAdsetId?: string
  } | null>(null)

  // Track the last loaded account to detect changes
  const [lastLoadedAccountId, setLastLoadedAccountId] = useState<string | null>(null)

  // Restore UTM from cache when account is available (handles client-side navigation)
  const hasRestoredUtmCache = useRef(false)
  useEffect(() => {
    // Only try to restore once per mount, and only if we don't have UTM data
    if (currentAccountId && !hasRestoredUtmCache.current && Object.keys(utmStatus).length === 0) {
      const cachedUtm = getUtmFromCache(currentAccountId)
      if (cachedUtm) {
        console.log('[UTM] Restored from sessionStorage cache')
        setUtmStatus(cachedUtm)
        utmFetchedForAccount.current = currentAccountId
        hasRestoredUtmCache.current = true
      }
    }
  }, [currentAccountId, utmStatus])

  // Load campaigns when account changes
  useEffect(() => {
    if (currentAccountId && user && currentAccountId !== lastLoadedAccountId) {
      // Clear cached data from previous account
      setExpandedCampaigns(new Set())
      setExpandedAdSets(new Set())
      setAdSetsData({})
      setAdsData({})
      setCreativesData({})
      loadedCreativesRef.current = new Set() // Clear loaded creatives ref
      setCampaigns([])
      setSelectedItems(new Map()) // Clear selection on account change

      // Check UTM cache BEFORE clearing state - restore from cache if available
      const cachedUtm = getUtmFromCache(currentAccountId)
      if (cachedUtm) {
        console.log('[UTM] Restored from cache on mount for', currentAccountId)
        setUtmStatus(cachedUtm)
        utmFetchedForAccount.current = currentAccountId
      } else {
        setUtmStatus({})
        utmFetchedForAccount.current = null // Reset UTM fetch tracking for new account
      }

      setLastLoadedAccountId(currentAccountId)
      loadCampaigns()
    } else if (!accountLoading && !currentAccountId) {
      setLoading(false)
    }
  }, [currentAccountId, user, accountLoading, lastLoadedAccountId])

  const loadCampaigns = async () => {
    if (!user || !currentAccountId) return

    setLoading(true)
    try {
      // Fetch all campaigns from Meta API
      const metaRes = await fetch(`/api/meta/campaigns?userId=${user.id}&adAccountId=${currentAccountId}`)
      const metaData = await metaRes.json()
      const metaCampaigns: MetaCampaign[] = metaData.campaigns || []

      // Fetch KillScale-created campaigns
      const { data: ksData } = await supabase
        .from('campaign_creations')
        .select('campaign_id, budget_type, daily_budget, created_at, ad_ids')
        .eq('user_id', user.id)
        .eq('ad_account_id', currentAccountId)

      const ksCampaignIds = new Set((ksData || []).map(k => k.campaign_id))
      const ksMap = new Map((ksData || []).map(k => [k.campaign_id, k]))

      // Combine the data
      const combined: CombinedCampaign[] = metaCampaigns.map(mc => ({
        ...mc,
        isKillScaleCreated: ksCampaignIds.has(mc.id),
        killScaleData: ksMap.get(mc.id)
      }))

      // Sort: ACTIVE first, then PAUSED, alphabetically within each group
      combined.sort((a, b) => {
        // Active campaigns come first
        if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
        if (a.status !== 'ACTIVE' && b.status === 'ACTIVE') return 1
        // Within same status, sort alphabetically
        return a.name.localeCompare(b.name)
      })

      setCampaigns(combined)

      // Always fetch adsets/ads data for display (needed for UTM counts)
      // But use cached UTM status to avoid the expensive sync API call
      const cachedUtm = getUtmFromCache(currentAccountId)
      if (cachedUtm && Object.keys(cachedUtm).length > 0) {
        console.log('[UTM] Using cached UTM status for', currentAccountId)
        setUtmStatus(cachedUtm)
        utmFetchedForAccount.current = currentAccountId
        // Still need to fetch adsets/ads for display - just skip the UTM sync call
        loadAdSetsAndAdsOnly(combined.map(c => c.id))
      } else if (utmFetchedForAccount.current !== currentAccountId) {
        // No cache - fetch everything including UTM status
        console.log('[UTM] No cache found, fetching from API')
        utmFetchedForAccount.current = currentAccountId
        loadAllAdsForUtmStatus(combined.map(c => c.id))
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load adsets/ads only (when UTM cache exists) - skips the expensive UTM sync call
  const loadAdSetsAndAdsOnly = async (campaignIds: string[]) => {
    if (!user || !currentAccountId || campaignIds.length === 0) return

    try {
      // Fetch all adsets for all campaigns in parallel
      const adsetPromises = campaignIds.map(async (campaignId) => {
        const res = await fetch(`/api/meta/adsets?userId=${user.id}&campaignId=${campaignId}`)
        const data = await res.json()
        return { campaignId, adsets: data.adsets || [] }
      })

      const adsetResults = await Promise.all(adsetPromises)

      // Store adsets data
      const newAdSetsData: Record<string, AdSet[]> = {}
      const allAdSetIds: string[] = []
      for (const result of adsetResults) {
        newAdSetsData[result.campaignId] = result.adsets
        allAdSetIds.push(...result.adsets.map((as: AdSet) => as.id))
      }
      setAdSetsData(prev => ({ ...prev, ...newAdSetsData }))

      // Fetch all ads for all adsets in parallel
      const adPromises = allAdSetIds.map(async (adSetId) => {
        const res = await fetch(`/api/meta/ads?userId=${user.id}&adsetId=${adSetId}`)
        const data = await res.json()
        return { adSetId, ads: data.ads || [] }
      })

      const adResults = await Promise.all(adPromises)

      // Store ads data
      const newAdsData: Record<string, Ad[]> = {}
      for (const result of adResults) {
        newAdsData[result.adSetId] = result.ads
      }
      setAdsData(prev => ({ ...prev, ...newAdsData }))
    } catch (err) {
      console.error('Failed to load adsets/ads:', err)
    }
  }

  // Load all ads for all campaigns to get UTM status upfront
  const loadAllAdsForUtmStatus = async (campaignIds: string[]) => {
    if (!user || !currentAccountId || campaignIds.length === 0) return

    setUtmLoading(true)
    try {
      // Fetch all adsets for all campaigns in parallel
      const adsetPromises = campaignIds.map(async (campaignId) => {
        const res = await fetch(`/api/meta/adsets?userId=${user.id}&campaignId=${campaignId}`)
        const data = await res.json()
        return { campaignId, adsets: data.adsets || [] }
      })

      const adsetResults = await Promise.all(adsetPromises)

      // Store adsets data
      const newAdSetsData: Record<string, AdSet[]> = {}
      const allAdSetIds: string[] = []
      for (const result of adsetResults) {
        newAdSetsData[result.campaignId] = result.adsets
        allAdSetIds.push(...result.adsets.map((as: AdSet) => as.id))
      }
      setAdSetsData(prev => ({ ...prev, ...newAdSetsData }))

      // Fetch all ads for all adsets in parallel
      const adPromises = allAdSetIds.map(async (adSetId) => {
        const res = await fetch(`/api/meta/ads?userId=${user.id}&adsetId=${adSetId}`)
        const data = await res.json()
        return { adSetId, ads: data.ads || [] }
      })

      const adResults = await Promise.all(adPromises)

      // Store ads data and collect all ad IDs
      const newAdsData: Record<string, Ad[]> = {}
      const allAdIds: string[] = []
      for (const result of adResults) {
        newAdsData[result.adSetId] = result.ads
        allAdIds.push(...result.ads.map((ad: Ad) => ad.id))
      }
      setAdsData(prev => ({ ...prev, ...newAdsData }))

      // Now fetch UTM status for all ads
      if (allAdIds.length > 0) {
        console.log('[UTM] Fetching UTM status for', allAdIds.length, 'ads')
        const res = await fetch('/api/meta/sync-utm-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, adIds: allAdIds })
        })
        const result = await res.json()
        if (result.success) {
          setUtmStatus(result.utmStatus)
          // Cache the result
          setUtmToCache(currentAccountId, result.utmStatus)
          console.log('[UTM] Cached UTM status for', currentAccountId)
        }
      }
    } catch (err) {
      console.error('Failed to load ads for UTM status:', err)
    } finally {
      setUtmLoading(false)
    }
  }

  const handleStatusToggle = async (campaign: CombinedCampaign) => {
    if (!user) return

    const newStatus = campaign.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED'
    setUpdatingStatus(campaign.id)

    try {
      const res = await fetch('/api/meta/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: campaign.id,
          entityType: 'campaign',
          status: newStatus
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update status')
      }

      // Update local state
      setCampaigns(prev =>
        prev.map(c =>
          c.id === campaign.id ? { ...c, status: newStatus } : c
        )
      )

      // If KillScale-created, also update the DB record
      if (campaign.isKillScaleCreated) {
        await supabase
          .from('campaign_creations')
          .update({
            status: newStatus,
            activated_at: newStatus === 'ACTIVE' ? new Date().toISOString() : null
          })
          .eq('campaign_id', campaign.id)
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Generic status toggle for ad sets and ads
  const handleEntityStatusToggle = async (
    entityId: string,
    entityType: 'adset' | 'ad',
    currentStatus: string,
    parentCampaignId: string,
    parentAdSetId?: string
  ) => {
    if (!user) return

    const newStatus = currentStatus === 'PAUSED' ? 'ACTIVE' : 'PAUSED'
    setUpdatingStatus(entityId)

    try {
      const res = await fetch('/api/meta/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId,
          entityType,
          status: newStatus
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update status')
      }

      // Update local state
      if (entityType === 'adset') {
        setAdSetsData(prev => ({
          ...prev,
          [parentCampaignId]: prev[parentCampaignId]?.map(as =>
            as.id === entityId ? { ...as, status: newStatus } : as
          ) || []
        }))
      } else if (entityType === 'ad' && parentAdSetId) {
        setAdsData(prev => ({
          ...prev,
          [parentAdSetId]: prev[parentAdSetId]?.map(ad =>
            ad.id === entityId ? { ...ad, status: newStatus } : ad
          ) || []
        }))
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!user || !deleteModal) return

    setDeleting(true)
    try {
      const res = await fetch('/api/meta/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          entityId: deleteModal.entityId,
          entityType: deleteModal.entityType
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }

      // Update local state based on entity type
      if (deleteModal.entityType === 'campaign') {
        setCampaigns(prev => prev.filter(c => c.id !== deleteModal.entityId))
        // Also remove cached ad sets and ads for this campaign
        setAdSetsData(prev => {
          const next = { ...prev }
          delete next[deleteModal.entityId]
          return next
        })
      } else if (deleteModal.entityType === 'adset' && deleteModal.parentCampaignId) {
        setAdSetsData(prev => ({
          ...prev,
          [deleteModal.parentCampaignId!]: prev[deleteModal.parentCampaignId!]?.filter(
            as => as.id !== deleteModal.entityId
          ) || []
        }))
        // Also remove cached ads for this ad set
        setAdsData(prev => {
          const next = { ...prev }
          delete next[deleteModal.entityId]
          return next
        })
      } else if (deleteModal.entityType === 'ad' && deleteModal.parentAdSetId) {
        setAdsData(prev => ({
          ...prev,
          [deleteModal.parentAdSetId!]: prev[deleteModal.parentAdSetId!]?.filter(
            ad => ad.id !== deleteModal.entityId
          ) || []
        }))
      }

      setDeleteModal(null)
    } catch (err) {
      console.error('Failed to delete:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const handleWizardComplete = () => {
    setShowWizard(false)
    loadCampaigns()
  }

  // Determine if campaign is CBO (budget at campaign level) or ABO (budget at ad set level)
  const getBudgetType = (campaign: CombinedCampaign): 'CBO' | 'ABO' => {
    // If campaign has budget, it's CBO
    if (campaign.dailyBudget || campaign.lifetimeBudget) {
      return 'CBO'
    }
    // Otherwise it's ABO (budget at ad set level)
    return 'ABO'
  }

  // Format objective for display
  const formatObjective = (objective?: string): string => {
    if (!objective) return ''
    // Convert OUTCOME_SALES -> Sales, OUTCOME_LEADS -> Leads, etc.
    return objective
      .replace('OUTCOME_', '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  // Toggle campaign expansion
  const toggleCampaign = async (campaignId: string) => {
    const newExpanded = new Set(expandedCampaigns)
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId)
    } else {
      newExpanded.add(campaignId)
      // Load ad sets if not already loaded
      if (!adSetsData[campaignId]) {
        await loadAdSets(campaignId)
      }
    }
    setExpandedCampaigns(newExpanded)
  }

  // Toggle ad set expansion
  const toggleAdSet = async (adSetId: string) => {
    const newExpanded = new Set(expandedAdSets)
    if (newExpanded.has(adSetId)) {
      newExpanded.delete(adSetId)
    } else {
      newExpanded.add(adSetId)
      // Load ads if not already loaded
      if (!adsData[adSetId]) {
        await loadAds(adSetId)
      }
    }
    setExpandedAdSets(newExpanded)
  }

  // Load ad sets for a campaign
  const loadAdSets = async (campaignId: string) => {
    if (!user || !currentAccountId) return

    setLoadingAdSets(prev => new Set(prev).add(campaignId))
    try {
      const res = await fetch(`/api/meta/adsets?userId=${user.id}&campaignId=${campaignId}&adAccountId=${currentAccountId}`)
      const data = await res.json()
      if (data.adsets) {
        setAdSetsData(prev => ({ ...prev, [campaignId]: data.adsets }))
      }
    } catch (err) {
      console.error('Failed to load ad sets:', err)
    } finally {
      setLoadingAdSets(prev => {
        const next = new Set(prev)
        next.delete(campaignId)
        return next
      })
    }
  }

  // Load ads for an ad set
  const loadAds = async (adSetId: string) => {
    if (!user || !currentAccountId) return

    setLoadingAds(prev => new Set(prev).add(adSetId))
    try {
      const res = await fetch(`/api/meta/ads?userId=${user.id}&adsetId=${adSetId}&adAccountId=${currentAccountId}`)
      const data = await res.json()
      if (data.ads) {
        setAdsData(prev => ({ ...prev, [adSetId]: data.ads }))
        // Load creatives for ads that have them
        // Use ref to check if already loaded (avoids stale closures)
        for (const ad of data.ads) {
          if (ad.creative?.id && !loadedCreativesRef.current.has(ad.creative.id)) {
            loadCreative(ad.creative.id)
          }
        }
        // Fetch UTM status for the loaded ads
        const adIds = data.ads.map((ad: Ad) => ad.id)
        fetchUtmStatus(adIds)
      }
    } catch (err) {
      console.error('Failed to load ads:', err)
    } finally {
      setLoadingAds(prev => {
        const next = new Set(prev)
        next.delete(adSetId)
        return next
      })
    }
  }

  // Load creative details
  const loadCreative = async (creativeId: string) => {
    // Use ref for immediate check (avoids stale closures)
    if (!user || loadedCreativesRef.current.has(creativeId)) return

    // Mark as loading immediately using ref
    loadedCreativesRef.current.add(creativeId)
    setLoadingCreatives(prev => new Set(prev).add(creativeId))

    try {
      const res = await fetch(`/api/meta/creative?userId=${user.id}&creativeId=${creativeId}`)
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
  }

  // Fetch UTM status for ads (incremental - only fetches ads not in state/cache)
  const fetchUtmStatus = async (adIds: string[]) => {
    if (!user || !currentAccountId || adIds.length === 0) return

    // Filter out ads we already have status for
    const newAdIds = adIds.filter(id => !(id in utmStatus))
    if (newAdIds.length === 0) return

    setUtmLoading(true)
    try {
      const res = await fetch('/api/meta/sync-utm-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, adIds: newAdIds })
      })
      const result = await res.json()
      if (result.success) {
        const newStatus = { ...utmStatus, ...result.utmStatus }
        setUtmStatus(newStatus)
        // Update cache with merged data
        setUtmToCache(currentAccountId, newStatus)
      }
    } catch (err) {
      console.error('Failed to fetch UTM status:', err)
    } finally {
      setUtmLoading(false)
    }
  }

  // Calculate UTM counts for a campaign
  const getCampaignUtmCounts = (campaignId: string): { tracked: number; total: number } => {
    const adSets = adSetsData[campaignId] || []
    let tracked = 0
    let total = 0
    for (const adSet of adSets) {
      const ads = adsData[adSet.id] || []
      for (const ad of ads) {
        total++
        if (utmStatus[ad.id]) tracked++
      }
    }
    return { tracked, total }
  }

  // Calculate UTM counts for an adset
  const getAdSetUtmCounts = (adSetId: string): { tracked: number; total: number } => {
    const ads = adsData[adSetId] || []
    let tracked = 0
    let total = ads.length
    for (const ad of ads) {
      if (utmStatus[ad.id]) tracked++
    }
    return { tracked, total }
  }

  // Selection handlers
  const toggleSelection = (item: SelectedItem) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.set(item.id, item)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedItems(new Map())
  }

  // Bulk operation handlers
  const handleBulkPause = async () => {
    if (!user || selectedItems.size === 0) return

    const items = Array.from(selectedItems.values())
    setBulkLoading(true)
    setBulkLoadingAction('pause')
    setBulkProgress({
      isOpen: true,
      title: 'Pausing items...',
      total: items.length,
      completed: 0,
      failed: 0,
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

      setBulkProgress({
        isOpen: true,
        title: 'Pause Complete',
        total: result.total,
        completed: result.total,
        failed: result.failed,
        results: result.results.map((r: any) => ({
          id: r.entityId,
          name: r.name || r.entityId,
          success: r.success,
          error: r.error
        }))
      })

      // Update local state for succeeded items
      if (result.succeeded > 0) {
        const succeededIds = new Set(result.results.filter((r: any) => r.success).map((r: any) => r.entityId))

        // Update campaigns
        setCampaigns(prev => prev.map(c =>
          succeededIds.has(c.id) ? { ...c, status: 'PAUSED' } : c
        ))

        // Update adsets
        setAdSetsData(prev => {
          const next = { ...prev }
          for (const campaignId of Object.keys(next)) {
            next[campaignId] = next[campaignId].map(as =>
              succeededIds.has(as.id) ? { ...as, status: 'PAUSED' } : as
            )
          }
          return next
        })

        // Update ads
        setAdsData(prev => {
          const next = { ...prev }
          for (const adsetId of Object.keys(next)) {
            next[adsetId] = next[adsetId].map(ad =>
              succeededIds.has(ad.id) ? { ...ad, status: 'PAUSED' } : ad
            )
          }
          return next
        })

        clearSelection()
      }
    } catch (err) {
      console.error('Bulk pause error:', err)
      setBulkProgress(prev => prev ? {
        ...prev,
        title: 'Pause Failed',
        completed: prev.total,
        failed: prev.total
      } : null)
    } finally {
      setBulkLoading(false)
      setBulkLoadingAction(null)
    }
  }

  const handleBulkResume = async () => {
    if (!user || selectedItems.size === 0) return

    const items = Array.from(selectedItems.values())
    setBulkLoading(true)
    setBulkLoadingAction('resume')
    setBulkProgress({
      isOpen: true,
      title: 'Activating items...',
      total: items.length,
      completed: 0,
      failed: 0,
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

      setBulkProgress({
        isOpen: true,
        title: 'Activation Complete',
        total: result.total,
        completed: result.total,
        failed: result.failed,
        results: result.results.map((r: any) => ({
          id: r.entityId,
          name: r.name || r.entityId,
          success: r.success,
          error: r.error
        }))
      })

      // Update local state for succeeded items
      if (result.succeeded > 0) {
        const succeededIds = new Set(result.results.filter((r: any) => r.success).map((r: any) => r.entityId))

        // Update campaigns
        setCampaigns(prev => prev.map(c =>
          succeededIds.has(c.id) ? { ...c, status: 'ACTIVE' } : c
        ))

        // Update adsets
        setAdSetsData(prev => {
          const next = { ...prev }
          for (const campaignId of Object.keys(next)) {
            next[campaignId] = next[campaignId].map(as =>
              succeededIds.has(as.id) ? { ...as, status: 'ACTIVE' } : as
            )
          }
          return next
        })

        // Update ads
        setAdsData(prev => {
          const next = { ...prev }
          for (const adsetId of Object.keys(next)) {
            next[adsetId] = next[adsetId].map(ad =>
              succeededIds.has(ad.id) ? { ...ad, status: 'ACTIVE' } : ad
            )
          }
          return next
        })

        clearSelection()
      }
    } catch (err) {
      console.error('Bulk resume error:', err)
      setBulkProgress(prev => prev ? {
        ...prev,
        title: 'Activation Failed',
        completed: prev.total,
        failed: prev.total
      } : null)
    } finally {
      setBulkLoading(false)
      setBulkLoadingAction(null)
    }
  }

  const handleBulkDelete = async () => {
    if (!user || selectedItems.size === 0) return

    const items = Array.from(selectedItems.values())

    // Show confirmation
    const confirmMessage = `Are you sure you want to delete ${items.length} item${items.length > 1 ? 's' : ''}? This action cannot be undone.`
    if (!confirm(confirmMessage)) return

    setBulkLoading(true)
    setBulkLoadingAction('delete')
    setBulkProgress({
      isOpen: true,
      title: 'Deleting items...',
      total: items.length,
      completed: 0,
      failed: 0,
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

      setBulkProgress({
        isOpen: true,
        title: 'Delete Complete',
        total: result.total,
        completed: result.total,
        failed: result.failed,
        results: result.results.map((r: any) => ({
          id: r.entityId,
          name: r.name || r.entityId,
          success: r.success,
          error: r.error
        }))
      })

      // Remove deleted items from local state
      if (result.succeeded > 0) {
        const deletedIds = new Set(result.results.filter((r: any) => r.success).map((r: any) => r.entityId))

        // Remove campaigns
        setCampaigns(prev => prev.filter(c => !deletedIds.has(c.id)))

        // Remove adsets and their cached data
        setAdSetsData(prev => {
          const next = { ...prev }
          for (const campaignId of Object.keys(next)) {
            next[campaignId] = next[campaignId].filter(as => !deletedIds.has(as.id))
          }
          return next
        })

        // Remove ads
        setAdsData(prev => {
          const next = { ...prev }
          for (const adsetId of Object.keys(next)) {
            next[adsetId] = next[adsetId].filter(ad => !deletedIds.has(ad.id))
          }
          return next
        })

        clearSelection()
      }
    } catch (err) {
      console.error('Bulk delete error:', err)
      setBulkProgress(prev => prev ? {
        ...prev,
        title: 'Delete Failed',
        completed: prev.total,
        failed: prev.total
      } : null)
    } finally {
      setBulkLoading(false)
      setBulkLoadingAction(null)
    }
  }

  const handleBulkDuplicate = () => {
    setDuplicateModalOpen(true)
  }

  const handleDuplicateConfirm = async (options: { newNames: Record<string, string>; createPaused: boolean }) => {
    if (!user || !currentAccountId) return

    const items = Array.from(selectedItems.values())
    const copyStatus = options.createPaused ? 'PAUSED' : 'ACTIVE'

    setBulkLoading(true)
    setBulkLoadingAction('duplicate')
    setDuplicateModalOpen(false)
    setBulkProgress({
      isOpen: true,
      title: 'Duplicating items...',
      total: items.length,
      completed: 0,
      failed: 0,
      results: []
    })

    const results: Array<{ id: string; name: string; success: boolean; error?: string }> = []
    let succeeded = 0
    let failed = 0

    // Process items sequentially to avoid rate limits
    for (const item of items) {
      const newName = options.newNames[item.id]

      try {
        let response: Response
        let endpoint: string

        switch (item.type) {
          case 'campaign':
            endpoint = '/api/meta/duplicate-campaign'
            response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                adAccountId: currentAccountId,
                sourceCampaignId: item.id,
                newName,
                copyStatus
              })
            })
            break

          case 'adset':
            endpoint = '/api/meta/duplicate-adset'
            response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                adAccountId: currentAccountId,
                sourceAdsetId: item.id,
                targetCampaignId: item.parentCampaignId,
                newName,
                copyStatus
              })
            })
            break

          case 'ad':
            endpoint = '/api/meta/duplicate-ad'
            response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                adAccountId: currentAccountId,
                sourceAdId: item.id,
                targetAdsetId: item.parentAdsetId,
                newName,
                copyStatus
              })
            })
            break

          default:
            throw new Error(`Unknown item type: ${item.type}`)
        }

        const result = await response.json()

        if (result.error) {
          results.push({ id: item.id, name: item.name, success: false, error: result.error })
          failed++
        } else {
          const successMessage = item.type === 'campaign'
            ? `→ ${result.newCampaignName} (${result.adsetsCopied} ad sets, ${result.adsCopied} ads)`
            : item.type === 'adset'
              ? `→ ${result.newAdsetName} (${result.adsCopied} ads)`
              : `→ ${result.newAdName}`
          results.push({ id: item.id, name: `${item.name} ${successMessage}`, success: true })
          succeeded++
        }
      } catch (err) {
        results.push({
          id: item.id,
          name: item.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
        failed++
      }

      // Update progress
      setBulkProgress(prev => prev ? {
        ...prev,
        completed: results.length,
        failed,
        results
      } : null)

      // Small delay between items
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setBulkProgress({
      isOpen: true,
      title: 'Duplication Complete',
      total: items.length,
      completed: items.length,
      failed,
      results
    })

    // Reload campaigns to show new items
    if (succeeded > 0) {
      await loadCampaigns()
      clearSelection()
    }

    setBulkLoading(false)
    setBulkLoadingAction(null)
  }

  const handleBulkScaleBudget = () => {
    setBulkBudgetModalOpen(true)
  }

  const handleBulkScaleBudgetConfirm = async (percentage: number) => {
    if (!user || !currentAccountId) return

    // Filter to only items with budgets
    const budgetItems = Array.from(selectedItems.values()).filter(item =>
      item.budget && item.budgetType && (item.type === 'campaign' || item.type === 'adset')
    )

    if (budgetItems.length === 0) return

    setBulkLoading(true)
    setBulkLoadingAction('scale')
    setBulkBudgetModalOpen(false)
    setBulkProgress({
      isOpen: true,
      title: 'Scaling budgets...',
      total: budgetItems.length,
      completed: 0,
      failed: 0,
      results: []
    })

    try {
      const response = await fetch('/api/meta/bulk-budget-scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          entities: budgetItems.map(item => ({
            entityId: item.id,
            entityType: item.type,
            name: item.name,
            currentBudget: item.budget,
            budgetType: item.budgetType
          })),
          scalePercentage: percentage
        })
      })

      const result = await response.json()

      setBulkProgress({
        isOpen: true,
        title: 'Budget Scaling Complete',
        total: result.total,
        completed: result.total,
        failed: result.failed,
        results: result.results.map((r: any) => ({
          id: r.entityId,
          name: `${r.name || r.entityId} ($${r.oldBudget} → $${r.newBudget})`,
          success: r.success,
          error: r.error
        }))
      })

      // Update local state for succeeded items
      if (result.succeeded > 0) {
        const updatedBudgets = new Map(
          result.results
            .filter((r: any) => r.success)
            .map((r: any) => [r.entityId, r.newBudget])
        )

        // Update campaigns
        setCampaigns(prev => prev.map(c => {
          const newBudget = updatedBudgets.get(c.id) as number | undefined
          if (newBudget !== undefined) {
            if (c.dailyBudget !== null) {
              return { ...c, dailyBudget: newBudget }
            } else {
              return { ...c, lifetimeBudget: newBudget }
            }
          }
          return c
        }))

        // Update adsets
        setAdSetsData(prev => {
          const next = { ...prev }
          for (const campaignId of Object.keys(next)) {
            next[campaignId] = next[campaignId].map(as => {
              const newBudget = updatedBudgets.get(as.id) as number | undefined
              if (newBudget !== undefined) {
                if (as.dailyBudget !== null) {
                  return { ...as, dailyBudget: newBudget }
                } else {
                  return { ...as, lifetimeBudget: newBudget }
                }
              }
              return as
            })
          }
          return next
        })

        clearSelection()
      }
    } catch (err) {
      console.error('Bulk budget scale error:', err)
      setBulkProgress(prev => prev ? {
        ...prev,
        title: 'Budget Scaling Failed',
        completed: prev.total,
        failed: prev.total
      } : null)
    } finally {
      setBulkLoading(false)
      setBulkLoadingAction(null)
    }
  }

  const handleBulkCopyAds = () => {
    setCopyAdsModalOpen(true)
  }

  const handleCopyAdsComplete = async () => {
    // Reload campaigns to show new items
    await loadCampaigns()
    clearSelection()
  }

  // Open inline duplicate modal
  const openInlineDuplicateModal = (
    type: 'campaign' | 'adset' | 'ad',
    id: string,
    name: string,
    parentCampaignId?: string,
    parentAdsetId?: string
  ) => {
    setInlineDuplicateModal({
      isOpen: true,
      itemType: type,
      itemId: id,
      itemName: name,
      parentCampaignId,
      parentAdsetId
    })
  }

  // Show wizard
  if (showWizard && currentAccountId) {
    return (
      <LaunchWizard
        adAccountId={currentAccountId}
        onComplete={handleWizardComplete}
        onCancel={() => setShowWizard(false)}
      />
    )
  }

  // Loading state
  if (loading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  // Workspace selected - need individual account for launching
  if (currentWorkspaceId && !currentAccountId && !loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Rocket className="w-8 h-8 text-zinc-500" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Select an Individual Account</h1>
        <p className="text-zinc-400 mb-6">
          Workspaces show combined data. To create or manage campaigns, select an individual ad account from the sidebar dropdown.
        </p>
      </div>
    )
  }

  // No account selected
  if (!currentAccountId && !loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Rocket className="w-8 h-8 text-zinc-500" />
        </div>
        <h1 className="text-2xl font-bold mb-4">No Ad Account Selected</h1>
        <p className="text-zinc-400 mb-6">
          Select an ad account from the sidebar to view and create campaigns.
        </p>
        <button
          onClick={() => router.push('/dashboard/connect')}
          className="text-accent hover:underline"
        >
          Connect an account →
        </button>
      </div>
    )
  }

  // Main view
  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Rocket className="w-7 h-7 text-accent" />
            Launch
          </h1>
          <p className="text-zinc-500 mt-1">
            Manage and create campaigns
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Launch New Campaign</span>
          <span className="sm:hidden">New Campaign</span>
        </button>
      </div>

      {/* Empty state */}
      {campaigns.length === 0 && !loading && (
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-20 h-20 bg-gradient-to-br from-accent/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Rocket className="w-10 h-10 text-accent" />
          </div>
          <h2 className="text-2xl font-bold mb-4">No Campaigns Yet</h2>
          <p className="text-zinc-400 mb-8 max-w-md mx-auto">
            Launch your first Andromeda-compliant campaign in 60 seconds.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Launch Campaign
          </button>
        </div>
      )}

      {/* Campaigns List */}
      {campaigns.length > 0 && (
        <div className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            </div>
          )}
          {campaigns.map((campaign) => {
            const isExpanded = expandedCampaigns.has(campaign.id)
            const campaignAdSets = adSetsData[campaign.id] || []
            const isLoadingAdSets = loadingAdSets.has(campaign.id)

            return (
              <div key={campaign.id} className="bg-bg-card border border-border rounded-xl overflow-hidden">
                {/* Campaign Row */}
                <div
                  className={cn(
                    "p-3 sm:p-4 cursor-pointer hover:bg-bg-hover/50 transition-colors",
                    isExpanded && "border-b border-border"
                  )}
                  onClick={() => toggleCampaign(campaign.id)}
                >
                  {/* Mobile: Stack layout / Desktop: Row layout */}
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                    {/* Selection checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const isCBO = getBudgetType(campaign) === 'CBO'
                        toggleSelection({
                          id: campaign.id,
                          type: 'campaign',
                          name: campaign.name,
                          status: campaign.status,
                          budget: campaign.dailyBudget || campaign.lifetimeBudget || undefined,
                          budgetType: campaign.dailyBudget ? 'daily' : campaign.lifetimeBudget ? 'lifetime' : undefined,
                          isCBO
                        })
                      }}
                      className="p-1 hover:bg-bg-hover rounded transition-colors flex-shrink-0 mt-0.5 sm:mt-0"
                    >
                      {selectedItems.has(campaign.id) ? (
                        <CheckSquare className="w-4 h-4 text-accent" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                      )}
                    </button>
                    <button className="p-1 hover:bg-bg-hover rounded transition-colors flex-shrink-0 mt-0.5 sm:mt-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      {/* Campaign name and badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="hidden sm:inline px-1.5 py-0.5 bg-hierarchy-campaign/20 text-hierarchy-campaign text-xs font-medium rounded">
                          Campaign
                        </span>
                        <h3 className="font-semibold truncate max-w-[200px] sm:max-w-none">{maskName(campaign.name, 'campaign', campaigns.indexOf(campaign))}</h3>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium uppercase",
                          campaign.status === 'ACTIVE'
                            ? "bg-verdict-scale/20 text-verdict-scale"
                            : "bg-zinc-700 text-zinc-400"
                        )}>
                          {campaign.status}
                        </span>
                        {campaign.isKillScaleCreated && (
                          <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">
                            <Sparkles className="w-3 h-3" />
                            KillScale
                          </span>
                        )}
                        {/* UTM Tracking Status */}
                        {(() => {
                          const counts = getCampaignUtmCounts(campaign.id)
                          return counts.total > 0 ? (
                            <UtmIndicator
                              tracked={counts.tracked}
                              total={counts.total}
                              loading={utmLoading}
                            />
                          ) : null
                        })()}
                      </div>
                      {/* Meta info row */}
                      <div className="flex items-center gap-2 sm:gap-3 text-sm text-zinc-500 mt-1 sm:ml-[74px]">
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          getBudgetType(campaign) === 'CBO'
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                        )}>
                          {getBudgetType(campaign)}
                        </span>
                        {campaign.objective && (
                          <span className="hidden sm:inline">{formatObjective(campaign.objective)}</span>
                        )}
                      </div>
                    </div>
                    {/* Action buttons - icon only on mobile */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleStatusToggle(campaign)}
                        disabled={updatingStatus === campaign.id}
                        className={cn(
                          "flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition-colors",
                          campaign.status === 'PAUSED'
                            ? "bg-verdict-scale/20 text-verdict-scale hover:bg-verdict-scale/30"
                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                        )}
                      >
                        {updatingStatus === campaign.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : campaign.status === 'PAUSED' ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Activate</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Pause</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setEditModal({
                          isOpen: true,
                          entityType: 'campaign',
                          entityId: campaign.id,
                          entityName: campaign.name
                        })}
                        className="p-2 text-zinc-500 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title="Edit campaign"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openInlineDuplicateModal('campaign', campaign.id, campaign.name)}
                        className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Duplicate campaign"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const adSetCount = adSetsData[campaign.id]?.length || 0
                          const adCount = Object.values(adsData)
                            .flat()
                            .filter(ad => adSetsData[campaign.id]?.some(as => adsData[as.id]?.includes(ad)))
                            .length || 0
                          setDeleteModal({
                            isOpen: true,
                            entityId: campaign.id,
                            entityType: 'campaign',
                            entityName: campaign.name,
                            childCount: { adsets: adSetCount, ads: adCount }
                          })
                        }}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <a
                        href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${currentAccountId?.replace('act_', '')}&selected_campaign_ids=${campaign.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:flex p-2 text-zinc-500 hover:text-white hover:bg-bg-hover rounded-lg transition-colors"
                        title="View in Ads Manager"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Ad Sets (expanded) */}
                {isExpanded && (
                  <div className="bg-bg-dark/50">
                    {isLoadingAdSets ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-accent" />
                      </div>
                    ) : campaignAdSets.length === 0 ? (
                      <div className="py-6 text-center text-zinc-500 text-sm">
                        No ad sets found
                      </div>
                    ) : (
                      campaignAdSets.map((adSet, adSetIdx) => {
                        const isAdSetExpanded = expandedAdSets.has(adSet.id)
                        const adSetAds = adsData[adSet.id] || []
                        const isLoadingAdSetAds = loadingAds.has(adSet.id)

                        return (
                          <div key={adSet.id} className="border-t border-border/50">
                            {/* Ad Set Row */}
                            <div
                              className="pl-4 sm:pl-10 pr-3 sm:pr-4 py-3 cursor-pointer hover:bg-bg-hover/30 transition-colors"
                              onClick={() => toggleAdSet(adSet.id)}
                            >
                              <div className="flex items-start sm:items-center gap-2">
                                {/* Selection checkbox */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleSelection({
                                      id: adSet.id,
                                      type: 'adset',
                                      name: adSet.name,
                                      status: adSet.status,
                                      parentCampaignId: campaign.id,
                                      budget: adSet.dailyBudget || adSet.lifetimeBudget || undefined,
                                      budgetType: adSet.dailyBudget ? 'daily' : adSet.lifetimeBudget ? 'lifetime' : undefined,
                                      isCBO: false
                                    })
                                  }}
                                  className="p-1 hover:bg-bg-hover rounded transition-colors flex-shrink-0"
                                >
                                  {selectedItems.has(adSet.id) ? (
                                    <CheckSquare className="w-4 h-4 text-accent" />
                                  ) : (
                                    <Square className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                                  )}
                                </button>
                                <button className="p-1 hover:bg-bg-hover rounded transition-colors flex-shrink-0">
                                  {isAdSetExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-zinc-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="hidden sm:inline px-1.5 py-0.5 bg-hierarchy-adset/20 text-hierarchy-adset text-xs font-medium rounded">
                                      Ad Set
                                    </span>
                                    <span className="font-medium truncate max-w-[150px] sm:max-w-none">{maskName(adSet.name, 'adset', adSetIdx)}</span>
                                    <span className={cn(
                                      "px-2 py-0.5 rounded text-xs font-medium uppercase",
                                      adSet.status === 'ACTIVE'
                                        ? "bg-verdict-scale/20 text-verdict-scale"
                                        : "bg-zinc-700 text-zinc-400"
                                    )}>
                                      {adSet.status}
                                    </span>
                                    {/* UTM Tracking Status */}
                                    {(() => {
                                      const counts = getAdSetUtmCounts(adSet.id)
                                      return counts.total > 0 ? (
                                        <UtmIndicator
                                          tracked={counts.tracked}
                                          total={counts.total}
                                          loading={utmLoading}
                                        />
                                      ) : null
                                    })()}
                                  </div>
                                  {(adSet.dailyBudget || adSet.lifetimeBudget) && (
                                    <div className="flex items-center gap-2 text-sm text-zinc-500 mt-0.5">
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                        ABO
                                      </span>
                                      <span>
                                        {adSet.dailyBudget ? `$${adSet.dailyBudget}/day` : `$${adSet.lifetimeBudget} lifetime`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {/* Ad Set Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleEntityStatusToggle(adSet.id, 'adset', adSet.status, campaign.id)}
                                    disabled={updatingStatus === adSet.id}
                                    className={cn(
                                      "p-1.5 rounded-lg transition-colors",
                                      adSet.status === 'PAUSED'
                                        ? "text-green-500 hover:bg-green-500/20"
                                        : "text-amber-500 hover:bg-amber-500/20"
                                    )}
                                    title={adSet.status === 'PAUSED' ? 'Activate' : 'Pause'}
                                  >
                                    {updatingStatus === adSet.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : adSet.status === 'PAUSED' ? (
                                      <Play className="w-4 h-4" />
                                    ) : (
                                      <Pause className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditModal({
                                      isOpen: true,
                                      entityType: 'adset',
                                      entityId: adSet.id,
                                      entityName: adSet.name,
                                      campaignName: campaign.name
                                    })}
                                    className="p-1.5 text-zinc-500 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                                    title="Edit ad set"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openInlineDuplicateModal('adset', adSet.id, adSet.name, campaign.id)}
                                    className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                    title="Duplicate ad set"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const adCount = adsData[adSet.id]?.length || 0
                                      setDeleteModal({
                                        isOpen: true,
                                        entityId: adSet.id,
                                        entityType: 'adset',
                                        entityName: adSet.name,
                                        childCount: { ads: adCount },
                                        parentCampaignId: campaign.id
                                      })
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Delete ad set"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Ads (expanded) */}
                            {isAdSetExpanded && (
                              <div className="bg-bg-dark/30">
                                {isLoadingAdSetAds ? (
                                  <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                                  </div>
                                ) : adSetAds.length === 0 ? (
                                  <div className="py-4 text-center text-zinc-500 text-sm">
                                    No ads found
                                  </div>
                                ) : (
                                  adSetAds.map((ad, adIdx) => {
                                    const creative = ad.creative?.id ? creativesData[ad.creative.id] : null
                                    const isLoadingCreative = ad.creative?.id ? loadingCreatives.has(ad.creative.id) : false
                                    const previewUrl = creative?.previewUrl || creative?.thumbnailUrl || creative?.imageUrl || ad.creative?.thumbnailUrl || ad.creative?.imageUrl
                                    const maskedAdName = maskName(ad.name, 'ad', adIdx)

                                    return (
                                      <div key={ad.id} className="pl-6 sm:pl-20 pr-3 sm:pr-4 py-3 border-t border-border/30 hover:bg-bg-hover/20 transition-colors">
                                        <div className="flex items-center gap-2 sm:gap-3">
                                          {/* Selection checkbox */}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              toggleSelection({
                                                id: ad.id,
                                                type: 'ad',
                                                name: ad.name,
                                                status: ad.status,
                                                parentCampaignId: campaign.id,
                                                parentAdsetId: adSet.id
                                              })
                                            }}
                                            className="p-1 hover:bg-bg-hover rounded transition-colors flex-shrink-0"
                                          >
                                            {selectedItems.has(ad.id) ? (
                                              <CheckSquare className="w-4 h-4 text-accent" />
                                            ) : (
                                              <Square className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                                            )}
                                          </button>
                                          {/* Creative Preview with Tooltip */}
                                          <CreativePreviewTooltip
                                            previewUrl={previewUrl}
                                            mediaType={creative?.mediaType}
                                            alt={maskedAdName}
                                            onFullPreview={() => {
                                              const playbackUrl = creative?.mediaType === 'video' && creative?.videoSource
                                                ? creative.videoSource
                                                : previewUrl
                                              if (playbackUrl) {
                                                setPreviewModal({
                                                  isOpen: true,
                                                  previewUrl: playbackUrl,
                                                  mediaType: creative?.mediaType || 'unknown',
                                                  name: maskedAdName
                                                })
                                              }
                                            }}
                                          >
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-bg-hover flex-shrink-0 overflow-hidden">
                                              {isLoadingCreative ? (
                                                <div className="w-full h-full flex items-center justify-center">
                                                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                                                </div>
                                              ) : previewUrl ? (
                                                <img
                                                  src={previewUrl}
                                                  alt={maskedAdName}
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                  {creative?.mediaType === 'video' ? (
                                                    <Video className="w-5 h-5 text-zinc-600" />
                                                  ) : (
                                                    <ImageIcon className="w-5 h-5 text-zinc-600" />
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </CreativePreviewTooltip>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="hidden sm:inline px-1.5 py-0.5 bg-zinc-700 text-zinc-300 text-xs font-medium rounded">
                                                Ad
                                              </span>
                                              <span className="font-medium truncate max-w-[120px] sm:max-w-none">{maskedAdName}</span>
                                              <span className={cn(
                                                "px-2 py-0.5 rounded text-xs font-medium uppercase",
                                                ad.status === 'ACTIVE'
                                                  ? "bg-verdict-scale/20 text-verdict-scale"
                                                  : "bg-zinc-700 text-zinc-400"
                                              )}>
                                                {ad.status}
                                              </span>
                                              {/* UTM Tracking Status */}
                                              <UtmIndicator
                                                tracked={utmStatus[ad.id] ? 1 : 0}
                                                total={1}
                                                loading={utmLoading}
                                              />
                                            </div>
                                          </div>
                                          {/* Ad Actions */}
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                              onClick={() => handleEntityStatusToggle(ad.id, 'ad', ad.status, campaign.id, adSet.id)}
                                              disabled={updatingStatus === ad.id}
                                              className={cn(
                                                "p-1.5 rounded-lg transition-colors",
                                                ad.status === 'PAUSED'
                                                    ? "text-green-500 hover:bg-green-500/20"
                                                    : "text-amber-500 hover:bg-amber-500/20"
                                                )}
                                                title={ad.status === 'PAUSED' ? 'Activate' : 'Pause'}
                                              >
                                                {updatingStatus === ad.id ? (
                                                  <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : ad.status === 'PAUSED' ? (
                                                  <Play className="w-4 h-4" />
                                                ) : (
                                                  <Pause className="w-4 h-4" />
                                                )}
                                              </button>
                                              <button
                                                onClick={() => setEditModal({
                                                  isOpen: true,
                                                  entityType: 'ad',
                                                  entityId: ad.id,
                                                  entityName: ad.name,
                                                  campaignName: campaign.name,
                                                  adsetId: adSet.id,
                                                  adAccountId: currentAccountId || undefined
                                                })}
                                                className="p-1.5 text-zinc-500 hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                                                title="Edit ad"
                                              >
                                                <Pencil className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => openInlineDuplicateModal('ad', ad.id, ad.name, campaign.id, adSet.id)}
                                                className="p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                title="Duplicate ad"
                                              >
                                                <Copy className="w-4 h-4" />
                                              </button>
                                              <button
                                                onClick={() => setDeleteModal({
                                                  isOpen: true,
                                                  entityId: ad.id,
                                                  entityType: 'ad',
                                                  entityName: ad.name,
                                                  parentCampaignId: campaign.id,
                                                  parentAdSetId: adSet.id
                                                })}
                                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Delete ad"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      {/* Delete Modal */}
      <DeleteEntityModal
        isOpen={deleteModal?.isOpen || false}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        entityName={deleteModal?.entityName || ''}
        entityType={deleteModal?.entityType || 'campaign'}
        childCount={deleteModal?.childCount}
        isLoading={deleting}
      />

      {/* Edit Modal */}
      <EditEntityModal
        isOpen={editModal?.isOpen || false}
        onClose={() => setEditModal(null)}
        entityType={editModal?.entityType || 'campaign'}
        entityId={editModal?.entityId || ''}
        entityName={editModal?.entityName || ''}
        campaignName={editModal?.campaignName}
        adsetId={editModal?.adsetId}
        adAccountId={editModal?.adAccountId}
        userId={user?.id || ''}
        onUpdate={loadCampaigns}
      />

      {/* Creative Full Preview Modal */}
      {previewModal?.isOpen && (
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
            {previewModal.mediaType === 'video' ? (
              <video
                src={previewModal.previewUrl}
                controls
                autoPlay
                muted
                playsInline
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              >
                Your browser does not support video playback.
              </video>
            ) : (
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

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedItems={selectedItems}
        onPause={handleBulkPause}
        onResume={handleBulkResume}
        onDelete={handleBulkDelete}
        onDuplicate={handleBulkDuplicate}
        onScaleBudget={handleBulkScaleBudget}
        onCopyAds={handleBulkCopyAds}
        onClear={clearSelection}
        isLoading={bulkLoading}
        loadingAction={bulkLoadingAction}
      />

      {/* Bulk Operation Progress Modal */}
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

      {/* Bulk Budget Modal */}
      <BulkBudgetModal
        isOpen={bulkBudgetModalOpen}
        onClose={() => setBulkBudgetModalOpen(false)}
        entities={Array.from(selectedItems.values())
          .filter(item => item.budget && item.budgetType && (item.type === 'campaign' || item.type === 'adset'))
          .map(item => ({
            id: item.id,
            name: item.name,
            type: item.type as 'campaign' | 'adset',
            currentBudget: item.budget!,
            budgetType: item.budgetType!,
            isCBO: item.isCBO
          }))}
        onConfirm={handleBulkScaleBudgetConfirm}
      />

      {/* Duplicate Modal */}
      <DuplicateModal
        isOpen={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        items={Array.from(selectedItems.values()).map(item => ({
          id: item.id,
          type: item.type,
          name: item.name,
          parentCampaignId: item.parentCampaignId,
          parentAdsetId: item.parentAdsetId
        }))}
        onConfirm={handleDuplicateConfirm}
      />

      {/* Copy Ads Modal */}
      {currentAccountId && user && (
        <CopyAdsModal
          isOpen={copyAdsModalOpen}
          onClose={() => setCopyAdsModalOpen(false)}
          selectedAds={Array.from(selectedItems.values())
            .filter(item => item.type === 'ad')
            .map(item => {
              // Find the campaign and adset names
              const adsetId = item.parentAdsetId || ''
              const campaignId = item.parentCampaignId || ''
              const campaign = campaigns.find(c => c.id === campaignId)
              const adsets = adSetsData[campaignId] || []
              const adset = adsets.find(as => as.id === adsetId)
              return {
                id: item.id,
                name: item.name,
                adsetId,
                adsetName: adset?.name || 'Unknown Ad Set',
                campaignId,
                campaignName: campaign?.name || 'Unknown Campaign'
              }
            })}
          userId={user.id}
          adAccountId={currentAccountId}
          onComplete={handleCopyAdsComplete}
        />
      )}

      {/* Inline Duplicate Modal */}
      {currentAccountId && user && inlineDuplicateModal && (
        <InlineDuplicateModal
          isOpen={inlineDuplicateModal.isOpen}
          onClose={() => setInlineDuplicateModal(null)}
          itemType={inlineDuplicateModal.itemType}
          itemId={inlineDuplicateModal.itemId}
          itemName={inlineDuplicateModal.itemName}
          parentCampaignId={inlineDuplicateModal.parentCampaignId}
          parentAdsetId={inlineDuplicateModal.parentAdsetId}
          userId={user.id}
          adAccountId={currentAccountId}
          onComplete={loadCampaigns}
        />
      )}
    </div>
  )
}
