'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
import type { StudioAsset, StudioAssetDetail, VideoAnalysis, ScriptSuggestion } from '@/components/creative-studio/types'
import { TheaterModal } from '@/components/creative-studio'
import { DatePicker, DatePickerButton, DATE_PRESETS } from '@/components/date-picker'
import { CreativeStudioContext } from './creative-studio-context'

// Compute date range from preset (same logic as dashboard)
function getDateRange(preset: string, customStart?: string, customEnd?: string): { since: string; until: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const until = fmt(today)

  switch (preset) {
    case 'today': return { since: until, until }
    case 'yesterday': { const d = new Date(today); d.setDate(d.getDate() - 1); return { since: fmt(d), until: fmt(d) } }
    case 'last_7d': { const d = new Date(today); d.setDate(d.getDate() - 6); return { since: fmt(d), until } }
    case 'last_14d': { const d = new Date(today); d.setDate(d.getDate() - 13); return { since: fmt(d), until } }
    case 'last_30d': { const d = new Date(today); d.setDate(d.getDate() - 29); return { since: fmt(d), until } }
    case 'last_90d': { const d = new Date(today); d.setDate(d.getDate() - 89); return { since: fmt(d), until } }
    case 'this_month': { const d = new Date(today.getFullYear(), today.getMonth(), 1); return { since: fmt(d), until } }
    case 'last_month': { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { since: fmt(s), until: fmt(e) } }
    case 'custom': {
      if (customStart && customEnd) return { since: customStart, until: customEnd }
      const d = new Date(today); d.setDate(d.getDate() - 89); return { since: fmt(d), until }
    }
    default: { const d = new Date(today); d.setDate(d.getDate() - 89); return { since: fmt(d), until } }
  }
}
import type { CreativeStudioContextValue, ActiveAd, CopyVariation } from './creative-studio-context'

export default function CreativeStudioLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan, loading: subscriptionLoading } = useSubscription()
  const pathname = usePathname()

  // Scale and Pro users get access to Pro features
  const isPro = subscriptionLoading || plan === 'Scale' || plan === 'Pro'

  // Hide date picker on Best Copy page (always shows all-time data)
  // Also hide on Media page (has its own date picker in the controls section)
  // Also hide on AI Tasks page (not date-dependent)
  // Also hide on Active page (has its own date picker in the header)
  // Also hide on Ad Studio page (not date-dependent)
  const hideDatePicker = pathname?.includes('/best-copy') || pathname?.includes('/media') || pathname?.includes('/ai-tasks') || pathname?.includes('/active') || pathname?.includes('/ad-studio')

  // Data state
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Active ads state
  const [activeAds, setActiveAds] = useState<ActiveAd[]>([])
  const [activeDailyBudget, setActiveDailyBudget] = useState(0)
  const [isLoadingActiveAds, setIsLoadingActiveAds] = useState(true)

  // Copy variations state
  const [copyVariations, setCopyVariations] = useState<CopyVariation[]>([])
  const [isLoadingCopy, setIsLoadingCopy] = useState(true)

  // Download state (Phase 2 of sync)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 })

  // Date range (default: last 90 days)
  const [datePreset, setDatePreset] = useState('last_90d')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Starred items
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())

  // Video source cache for hover-to-play
  const [videoSources, setVideoSources] = useState<Record<string, string>>({})
  const videoSourceLoadingRef = useRef<Set<string>>(new Set())
  const videoSourcesRef = useRef<Record<string, string>>({})
  videoSourcesRef.current = videoSources

  // Fetch video source on demand (for hover-to-play)
  const fetchVideoSource = useCallback(async (videoId: string) => {
    if (!userRef.current || videoSourcesRef.current[videoId] || videoSourceLoadingRef.current.has(videoId)) return
    videoSourceLoadingRef.current.add(videoId)

    try {
      const res = await fetch(`/api/creative-studio/video-source?userId=${userRef.current.id}&videoId=${videoId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.source) {
          setVideoSources(prev => ({ ...prev, [videoId]: data.source }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch video source:', err)
    }
  }, [])

  // Load data — stable refs prevent re-fetching on context identity changes
  // FRAGILE: loadData MUST use refs with [] deps (CLAUDE.md §6)
  const hasLoadedRef = useRef(false)
  const userRef = useRef(user)
  const accountRef = useRef(currentAccountId)
  const datePresetRef = useRef(datePreset)
  const customStartRef = useRef(customStartDate)
  const customEndRef = useRef(customEndDate)
  userRef.current = user
  accountRef.current = currentAccountId
  datePresetRef.current = datePreset
  customStartRef.current = customStartDate
  customEndRef.current = customEndDate

  const loadData = useCallback(async () => {
    const u = userRef.current
    const acct = accountRef.current
    if (!u || !acct) return
    if (!hasLoadedRef.current) {
      setIsLoading(true)
      setIsLoadingActiveAds(true)
      setIsLoadingCopy(true)
    }

    try {
      const range = getDateRange(datePresetRef.current, customStartRef.current, customEndRef.current)
      const params = new URLSearchParams({
        userId: u.id,
        adAccountId: acct,
        startDate: range.since,
        endDate: range.until,
      })

      // Fetch all data in parallel
      const [assetsRes, starredRes, activeAdsRes, copyRes] = await Promise.all([
        fetch(`/api/creative-studio/media?${params}`),
        fetch(`/api/creative-studio/starred?${params}`),
        fetch(`/api/creative-studio/active-ads?${params}`).catch(() => null),
        fetch(`/api/creative-studio/copy?${params}`).catch(() => null),
      ])

      if (assetsRes.ok) {
        const data = await assetsRes.json()
        const transformed: StudioAsset[] = (data.assets || []).map((a: Record<string, unknown>) => ({
          ...a,
          isStarred: false,
        }))
        setAssets(transformed)
      }
      if (starredRes.ok) {
        const data = await starredRes.json()
        const starredSet = new Set<string>(
          (data.starred || []).map((s: { media_hash: string }) => s.media_hash)
        )
        setStarredIds(starredSet)
      }
      if (activeAdsRes && activeAdsRes.ok) {
        const data = await activeAdsRes.json()
        setActiveAds(data.ads || [])
        setActiveDailyBudget(data.totalDailyBudget || 0)
      }
      if (copyRes && copyRes.ok) {
        const data = await copyRes.json()
        setCopyVariations(data.variations || [])
      }
    } catch (error) {
      console.error('Failed to load creative studio data:', error)
    } finally {
      setIsLoading(false)
      setIsLoadingActiveAds(false)
      setIsLoadingCopy(false)
      hasLoadedRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load when user and account are available, or when account changes
  const lastLoadedAccountRef = useRef<string | null>(null)
  useEffect(() => {
    if (user && currentAccountId) {
      // Only re-fetch if account actually changed (not just context identity)
      if (lastLoadedAccountRef.current !== currentAccountId) {
        // Reset for new account
        if (lastLoadedAccountRef.current !== null) {
          hasLoadedRef.current = false
          setAssets([])
          setActiveAds([])
          setActiveDailyBudget(0)
          setCopyVariations([])
        }
        lastLoadedAccountRef.current = currentAccountId
        loadData()
      }
    }
  }, [user, currentAccountId, loadData])

  // Re-fetch when date range changes
  const lastDateKeyRef = useRef<string>('')
  useEffect(() => {
    const range = getDateRange(datePreset, customStartDate, customEndDate)
    const dateKey = `${range.since}:${range.until}`
    if (lastDateKeyRef.current && lastDateKeyRef.current !== dateKey && hasLoadedRef.current) {
      loadData()
    }
    lastDateKeyRef.current = dateKey
  }, [datePreset, customStartDate, customEndDate, loadData])

  // Handle sync — two-phase
  const handleSync = useCallback(async () => {
    if (!userRef.current || !accountRef.current || isSyncing || isDownloading) return
    const u = userRef.current
    const acct = accountRef.current
    setIsSyncing(true)

    try {
      const cleanAccountId = acct.replace(/^act_/, '')
      await fetch('/api/meta/sync-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, adAccountId: cleanAccountId }),
      })
      await loadData()
    } catch (error) {
      console.error('Phase 1 sync failed:', error)
    } finally {
      setIsSyncing(false)
    }

    // Phase 2: Download files to Supabase Storage (polling loop)
    setIsDownloading(true)
    setDownloadProgress({ completed: 0, total: 0 })

    try {
      let done = false
      let isFirstBatch = true
      while (!done) {
        const res = await fetch('/api/creative-studio/download-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: u.id,
            adAccountId: acct,
            batchSize: 5,
            ...(isFirstBatch && { retryFailed: true }),
          }),
        })
        isFirstBatch = false

        if (!res.ok) {
          console.error('Download media failed:', res.status)
          break
        }

        const result = await res.json()
        setDownloadProgress({ completed: result.completed, total: result.totalItems })
        done = result.done

        if (done) {
          await loadData()
        }
      }
    } catch (error) {
      console.error('Phase 2 download failed:', error)
    } finally {
      setIsDownloading(false)
    }
  }, [isSyncing, isDownloading, loadData])

  // Toggle star
  const toggleStar = useCallback(async (id: string) => {
    if (!userRef.current || !accountRef.current) return

    const asset = assets.find(a => a.id === id)
    if (!asset) return

    const mediaHash = asset.mediaHash
    const isCurrentlyStarred = starredIds.has(mediaHash)

    // Optimistic update
    const newStarred = new Set(starredIds)
    if (isCurrentlyStarred) {
      newStarred.delete(mediaHash)
    } else {
      newStarred.add(mediaHash)
    }
    setStarredIds(newStarred)

    try {
      if (isCurrentlyStarred) {
        await fetch('/api/creative-studio/starred', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userRef.current.id,
            adAccountId: accountRef.current,
            mediaHash,
          }),
        })
      } else {
        await fetch('/api/creative-studio/starred', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userRef.current.id,
            adAccountId: accountRef.current,
            mediaHash,
            mediaType: asset.mediaType,
            thumbnailUrl: asset.thumbnailUrl,
            mediaName: asset.name,
          }),
        })
      }
    } catch (error) {
      console.error('Failed to toggle star:', error)
      setStarredIds(starredIds)
    }
  }, [starredIds, assets])

  // Clear starred
  const clearStarred = useCallback(async () => {
    if (!userRef.current || !accountRef.current) return

    try {
      await fetch('/api/creative-studio/starred', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userRef.current.id,
          adAccountId: accountRef.current,
          clearAll: true,
        }),
      })
      setStarredIds(new Set())
    } catch (error) {
      console.error('Failed to clear starred:', error)
    }
  }, [])

  // Remove asset from local state (for optimistic delete)
  const removeAsset = useCallback((mediaHash: string) => {
    setAssets(prev => prev.filter(a => a.mediaHash !== mediaHash))
    // Also remove from starred if present
    setStarredIds(prev => {
      const next = new Set(prev)
      next.delete(mediaHash)
      return next
    })
  }, [])

  // Theater modal state (shared across all sub-pages)
  const [theaterItem, setTheaterItem] = useState<StudioAsset | null>(null)
  const [theaterDetail, setTheaterDetail] = useState<StudioAssetDetail | null>(null)
  const [isTheaterLoading, setIsTheaterLoading] = useState(false)

  // AI Analysis state (must be before openTheater which uses these)
  const [analysisStatus, setAnalysisStatus] = useState<'none' | 'pending' | 'processing' | 'complete' | 'error'>('none')
  const [analysisData, setAnalysisData] = useState<VideoAnalysis | null>(null)
  const [scriptSuggestions, setScriptSuggestions] = useState<ScriptSuggestion[] | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Load existing analysis when theater opens
  const loadAnalysisStatus = useCallback(async (mediaHash: string) => {
    if (!userRef.current || !accountRef.current) return

    try {
      const params = new URLSearchParams({
        userId: userRef.current.id,
        adAccountId: accountRef.current,
        mediaHash,
      })
      const res = await fetch(`/api/creative-studio/analyze-video?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAnalysisStatus(data.status || 'none')
        if (data.status === 'complete') {
          setAnalysisData(data.analysis)
          setScriptSuggestions(data.scriptSuggestions)
          setAnalyzedAt(data.analyzedAt)
        } else if (data.status === 'error') {
          setAnalysisError(data.errorMessage)
        }
      }
    } catch (err) {
      console.error('Failed to load analysis status:', err)
    }
  }, [])

  const openTheater = useCallback((mediaHash: string) => {
    const asset = assets.find(a => a.mediaHash === mediaHash)
    if (!asset || !userRef.current || !accountRef.current) return
    setTheaterItem(asset)
    setTheaterDetail(null)
    setIsTheaterLoading(true)
    // Reset analysis state
    setAnalysisStatus('none')
    setAnalysisData(null)
    setScriptSuggestions(null)
    setAnalyzedAt(null)
    setAnalysisError(null)

    const params = new URLSearchParams({
      userId: userRef.current.id,
      adAccountId: accountRef.current,
      mediaHash,
    })
    fetch(`/api/creative-studio/media-detail?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTheaterDetail(data) })
      .catch(err => console.error('Failed to load detail data:', err))
      .finally(() => setIsTheaterLoading(false))

    // Load analysis status for videos
    if (asset.mediaType === 'video') {
      loadAnalysisStatus(mediaHash)
    }
  }, [assets, loadAnalysisStatus])

  // Open theater with an asset directly (for Active Ads page where assets may not be in media_library)
  const openTheaterWithAsset = useCallback((asset: StudioAsset) => {
    if (!userRef.current || !accountRef.current) return
    setTheaterItem(asset)
    setTheaterDetail(null)
    setIsTheaterLoading(true)
    // Reset analysis state
    setAnalysisStatus('none')
    setAnalysisData(null)
    setScriptSuggestions(null)
    setAnalyzedAt(null)
    setAnalysisError(null)

    const params = new URLSearchParams({
      userId: userRef.current.id,
      adAccountId: accountRef.current,
      mediaHash: asset.mediaHash,
    })
    fetch(`/api/creative-studio/media-detail?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setTheaterDetail(data) })
      .catch(err => console.error('Failed to load detail data:', err))
      .finally(() => setIsTheaterLoading(false))

    // Load analysis status for videos
    if (asset.mediaType === 'video') {
      loadAnalysisStatus(asset.mediaHash)
    }
  }, [loadAnalysisStatus])

  const closeTheater = useCallback(() => {
    setTheaterItem(null)
    setTheaterDetail(null)
    // Reset analysis state when closing
    setAnalysisStatus('none')
    setAnalysisData(null)
    setScriptSuggestions(null)
    setAnalyzedAt(null)
    setAnalysisError(null)
  }, [])

  // Trigger analysis
  const handleAnalyze = useCallback(async () => {
    if (!theaterItem || !userRef.current || !accountRef.current) return
    if (theaterItem.mediaType !== 'video') return

    setIsAnalyzing(true)
    setAnalysisStatus('processing')
    setAnalysisError(null)

    try {
      const res = await fetch('/api/creative-studio/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userRef.current.id,
          adAccountId: accountRef.current,
          mediaHash: theaterItem.mediaHash,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setAnalysisStatus('error')
        setAnalysisError(data.error || 'Analysis failed')
        return
      }

      setAnalysisStatus('complete')
      setAnalysisData(data.analysis)
      setScriptSuggestions(data.scriptSuggestions)
      setAnalyzedAt(data.analyzedAt)
    } catch (err) {
      setAnalysisStatus('error')
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }, [theaterItem])

  // Re-analyze (force refresh)
  const handleReanalyze = useCallback(async () => {
    // Same as analyze - the API will overwrite existing
    await handleAnalyze()
  }, [handleAnalyze])

  const value: CreativeStudioContextValue = {
    assets,
    isLoading,
    isSyncing,
    isDownloading,
    downloadProgress,
    videoSources,
    fetchVideoSource,
    starredIds,
    toggleStar,
    clearStarred,
    activeAds,
    activeDailyBudget,
    isLoadingActiveAds,
    copyVariations,
    isLoadingCopy,
    datePreset,
    customStartDate,
    customEndDate,
    setDatePreset: (preset: string) => { setDatePreset(preset) },
    setCustomStartDate: (date: string) => { setCustomStartDate(date) },
    setCustomEndDate: (date: string) => { setCustomEndDate(date) },
    showDatePicker,
    setShowDatePicker,
    theaterItem,
    theaterDetail,
    isTheaterLoading,
    openTheater,
    openTheaterWithAsset,
    closeTheater,
    refresh: loadData,
    handleSync,
    removeAsset,
  }

  const getDateLabel = () => {
    if (datePreset === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} – ${customEndDate}`
    }
    return DATE_PRESETS.find(p => p.value === datePreset)?.label || 'Last 90 Days'
  }

  return (
    <CreativeStudioContext.Provider value={value}>
      {/* Date picker bar — hidden on Best Copy page (always all-time) */}
      {!hideDatePicker && (
        <div className="max-w-[1800px] mx-auto px-4 lg:px-8 pt-4">
          <div className="flex justify-end">
            <div className="relative">
              <DatePickerButton
                label={getDateLabel()}
                onClick={() => setShowDatePicker(!showDatePicker)}
                isOpen={showDatePicker}
              />
              <DatePicker
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                datePreset={datePreset}
                onPresetChange={(preset) => {
                  setDatePreset(preset)
                  if (preset !== 'custom') setShowDatePicker(false)
                }}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomDateChange={(start, end) => {
                  setCustomStartDate(start)
                  setCustomEndDate(end)
                }}
                onApply={() => {
                  setDatePreset('custom')
                  setShowDatePicker(false)
                }}
              />
            </div>
          </div>
        </div>
      )}
      {children}
      <TheaterModal
        item={theaterItem}
        isOpen={!!theaterItem}
        onClose={closeTheater}
        detailData={theaterDetail}
        isLoadingDetail={isTheaterLoading}
        isStarred={theaterItem ? starredIds.has(theaterItem.mediaHash) : false}
        onToggleStar={async () => {
          if (theaterItem) await toggleStar(theaterItem.id)
        }}
        // AI Analysis props
        analysisStatus={analysisStatus}
        analysis={analysisData}
        scriptSuggestions={scriptSuggestions}
        analyzedAt={analyzedAt}
        analysisError={analysisError}
        isPro={isPro}
        isAnalyzing={isAnalyzing}
        onAnalyze={handleAnalyze}
        onReanalyze={handleReanalyze}
      />
    </CreativeStudioContext.Provider>
  )
}
