'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { LayoutGrid, List, RefreshCw, Download, Film, Image, Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  GalleryGrid,
  FunnelFilterBar,
  StarredMediaBar,
  TheaterModal,
  MediaTable,
} from '@/components/creative-studio'
import type {
  StudioAsset,
  StudioAssetDetail,
} from '@/components/creative-studio/types'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { uploadImageToMeta, uploadVideoToMeta } from '@/lib/meta-upload'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'

type ViewMode = 'gallery' | 'table'
type SortOption = 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore' | 'spend' | 'roas' | 'revenue' | 'fatigue' | 'adCount' | 'fileSize' | 'syncedAt' | 'name' | 'thumbstopRate' | 'holdRate' | 'ctr' | 'cpc' | 'impressions'

export default function CreativeStudioPage() {
  // Auth & Account
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [sortBy, setSortBy] = useState<SortOption>('hookScore')
  const [sortDesc, setSortDesc] = useState(true)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)


  // Data state
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Funnel filter state — null = inactive, number = score threshold for that stage
  const [funnelThresholds, setFunnelThresholds] = useState<Record<FunnelStage, number | null>>({
    hook: null, hold: null, click: null, convert: null, scale: null,
  })

  // Download state (Phase 2 of sync)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 })

  // Modal state
  const [selectedItem, setSelectedItem] = useState<StudioAsset | null>(null)
  const [detailData, setDetailData] = useState<StudioAssetDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Starred items
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())

  // Launch Wizard state
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])

  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSortDropdown])

  // Video source cache for hover-to-play
  const [videoSources, setVideoSources] = useState<Record<string, string>>({})
  const videoSourceLoadingRef = useRef<Set<string>>(new Set())
  const videoSourcesRef = useRef<Record<string, string>>({})
  videoSourcesRef.current = videoSources

  // Fetch video source on demand (for hover-to-play)
  const fetchVideoSource = useCallback(async (videoId: string) => {
    if (!user || videoSourcesRef.current[videoId] || videoSourceLoadingRef.current.has(videoId)) return
    videoSourceLoadingRef.current.add(videoId)

    try {
      const res = await fetch(`/api/creative-studio/video-source?userId=${user.id}&videoId=${videoId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.source) {
          setVideoSources(prev => ({ ...prev, [videoId]: data.source }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch video source:', err)
    }
  }, [user])

  // Load data — only show skeletons on first load, silently refresh after
  const hasLoadedRef = useRef(false)
  const loadData = useCallback(async () => {
    if (!user || !currentAccountId) return
    if (!hasLoadedRef.current) {
      setIsLoading(true)
    }

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
      })

      const [assetsRes, starredRes] = await Promise.all([
        fetch(`/api/creative-studio/media?${params}`),
        fetch(`/api/creative-studio/starred?${params}`),
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
    } catch (error) {
      console.error('Failed to load creative studio data:', error)
    } finally {
      setIsLoading(false)
      hasLoadedRef.current = true
    }
  }, [user, currentAccountId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle sync — two-phase
  const handleSync = async () => {
    if (!user || !currentAccountId || isSyncing || isDownloading) return
    setIsSyncing(true)

    try {
      const cleanAccountId = currentAccountId.replace(/^act_/, '')
      await fetch('/api/meta/sync-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: cleanAccountId }),
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
            userId: user.id,
            adAccountId: currentAccountId,
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
  }

  // Toggle star
  const handleToggleStar = useCallback(async (id: string) => {
    if (!user || !currentAccountId) return

    // Find asset — id is always the media_library id
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
            userId: user.id,
            adAccountId: currentAccountId,
            mediaHash,
          }),
        })
      } else {
        await fetch('/api/creative-studio/starred', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
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
  }, [user, currentAccountId, starredIds, assets])

  // Load detail data for selected asset
  const loadDetailData = useCallback(async (asset: StudioAsset) => {
    if (!user || !currentAccountId) return
    setIsDetailLoading(true)
    setDetailData(null)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        mediaHash: asset.mediaHash,
      })
      const res = await fetch(`/api/creative-studio/media-detail?${params}`)
      if (res.ok) {
        const data: StudioAssetDetail = await res.json()
        setDetailData(data)
      }
    } catch (error) {
      console.error('Failed to load detail data:', error)
    } finally {
      setIsDetailLoading(false)
    }
  }, [user, currentAccountId])

  // Handle select item
  const handleSelect = useCallback((id: string) => {
    const asset = assets.find(a => a.id === id)
    if (asset) {
      setSelectedItem(asset)
      loadDetailData(asset)
    }
  }, [assets, loadDetailData])

  // Handle table sort (from column header clicks)
  const handleTableSort = useCallback((field: string) => {
    if (field === sortBy) {
      setSortDesc(prev => !prev)
    } else {
      setSortBy(field as SortOption)
      setSortDesc(true)
    }
  }, [sortBy])

  // Handle menu click
  const handleMenuClick = useCallback((id: string) => {
    // TODO: implement menu actions
  }, [])

  // Handle close detail
  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null)
    setDetailData(null)
  }, [])

  // Handle build from starred
  const handleBuildFromStarred = useCallback(() => {
    const starredAssets = assets.filter(a => starredIds.has(a.mediaHash)).slice(0, 6)
    if (starredAssets.length === 0) return

    const creatives = starredAssets.map(a => ({
      preview: a.mediaType === 'video' ? (a.thumbnailUrl || '') : (a.imageUrl || a.storageUrl || ''),
      type: a.mediaType as 'image' | 'video',
      uploaded: true,
      isFromLibrary: true,
      ...(a.mediaType === 'image' ? { imageHash: a.mediaHash } : { videoId: a.mediaHash, thumbnailUrl: a.thumbnailUrl || undefined }),
    }))

    setWizardCreatives(creatives)
    setShowLaunchWizard(true)
  }, [starredIds, assets])

  // Handle clear starred
  const handleClearStarred = useCallback(async () => {
    if (!user || !currentAccountId) return

    try {
      await fetch('/api/creative-studio/starred', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          clearAll: true,
        }),
      })
      setStarredIds(new Set())
    } catch (error) {
      console.error('Failed to clear starred:', error)
    }
  }, [user, currentAccountId])

  // Handle file upload to Meta
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !user || !currentAccountId) return

    setIsUploading(true)
    setUploadProgress('Fetching token...')

    try {
      // Get access token
      const tokenRes = await fetch(`/api/meta/token?userId=${user.id}&adAccountId=${currentAccountId}`)
      if (!tokenRes.ok) throw new Error('Failed to get access token')
      const { accessToken } = await tokenRes.json()

      const cleanAccountId = currentAccountId.replace(/^act_/, '')
      let completed = 0

      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith('video/')
        setUploadProgress(`Uploading ${completed + 1}/${files.length}: ${file.name}`)

        if (isVideo) {
          await uploadVideoToMeta(file, accessToken, cleanAccountId, (progress) => {
            setUploadProgress(`Uploading ${completed + 1}/${files.length}: ${file.name} (${progress}%)`)
          })
        } else {
          await uploadImageToMeta(file, accessToken, cleanAccountId)
        }
        completed++
      }

      setUploadProgress('Syncing...')
      await handleSync()
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setIsUploading(false)
      setUploadProgress('')
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [user, currentAccountId, handleSync])

  // Funnel filter handlers
  const toggleFunnelFilter = useCallback((stage: FunnelStage) => {
    setFunnelThresholds(prev => ({
      ...prev,
      [stage]: prev[stage] !== null ? null : 75, // default to 75 when activating
    }))
  }, [])

  const setFunnelThreshold = useCallback((stage: FunnelStage, value: number) => {
    setFunnelThresholds(prev => ({
      ...prev,
      [stage]: value, // setting a threshold also activates the filter
    }))
  }, [])

  const clearFunnelFilters = useCallback(() => {
    setFunnelThresholds({ hook: null, hold: null, click: null, convert: null, scale: null })
  }, [])

  // Compute scale threshold (median spend x 2) from assets with spend data
  const scaleThreshold = useMemo(() => {
    const spends = assets
      .filter(a => a.hasPerformanceData && a.spend > 0)
      .map(a => a.spend)
      .sort((a, b) => a - b)
    if (spends.length === 0) return 0
    const mid = Math.floor(spends.length / 2)
    const median = spends.length % 2 === 0
      ? (spends[mid - 1] + spends[mid]) / 2
      : spends[mid]
    return median * 2
  }, [assets])

  // Funnel stats — computed from pre-funnel-filtered assets (respects search/type/fatigue/hasData filters but NOT funnel filters)
  const preFunnelAssets = useMemo(() => assets, [assets])

  const funnelStats = useMemo(() => {
    const withData = preFunnelAssets.filter(a => a.hasPerformanceData)
    const total = withData.length
    const t = (stage: FunnelStage) => funnelThresholds[stage] ?? 75
    return {
      hook: { good: withData.filter(a => (a.hookScore ?? 0) >= t('hook')).length, total },
      hold: { good: withData.filter(a => (a.holdScore ?? 0) >= t('hold')).length, total },
      click: { good: withData.filter(a => (a.clickScore ?? 0) >= t('click')).length, total },
      convert: { good: withData.filter(a => (a.convertScore ?? 0) >= t('convert')).length, total },
      scale: { good: withData.filter(a => a.spend >= scaleThreshold).length, total },
    }
  }, [preFunnelAssets, scaleThreshold, funnelThresholds])

  // Filter and sort all assets
  const filteredAssets = useMemo(() => {
    let items = [...assets]

    // Funnel stage filters (additive AND, per-stage thresholds)
    const activeStages = (Object.entries(funnelThresholds) as [FunnelStage, number | null][])
      .filter(([, v]) => v !== null)
    if (activeStages.length > 0) {
      items = items.filter(item => {
        for (const [stage, threshold] of activeStages) {
          if (stage === 'hook' && (item.hookScore ?? 0) < threshold!) return false
          if (stage === 'hold' && (item.holdScore ?? 0) < threshold!) return false
          if (stage === 'click' && (item.clickScore ?? 0) < threshold!) return false
          if (stage === 'convert' && (item.convertScore ?? 0) < threshold!) return false
          if (stage === 'scale' && item.spend < scaleThreshold) return false
        }
        return true
      })
    }

    // Sort
    items.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'hookScore': comparison = (a.hookScore ?? -1) - (b.hookScore ?? -1); break
        case 'holdScore': comparison = (a.holdScore ?? -1) - (b.holdScore ?? -1); break
        case 'clickScore': comparison = (a.clickScore ?? -1) - (b.clickScore ?? -1); break
        case 'convertScore': comparison = (a.convertScore ?? -1) - (b.convertScore ?? -1); break
        case 'spend': comparison = a.spend - b.spend; break
        case 'roas': comparison = a.roas - b.roas; break
        case 'revenue': comparison = a.revenue - b.revenue; break
        case 'fatigue': comparison = a.fatigueScore - b.fatigueScore; break
        case 'adCount': comparison = a.adCount - b.adCount; break
        case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
        case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
        case 'thumbstopRate': comparison = (a.thumbstopRate ?? -1) - (b.thumbstopRate ?? -1); break
        case 'holdRate': comparison = (a.holdRate ?? -1) - (b.holdRate ?? -1); break
        case 'ctr': comparison = a.ctr - b.ctr; break
        case 'cpc': comparison = a.cpc - b.cpc; break
        case 'impressions': comparison = a.impressions - b.impressions; break
      }
      return sortDesc ? -comparison : comparison
    })

    return items.map(item => ({
      ...item,
      isStarred: starredIds.has(item.mediaHash),
    }))
  }, [assets, funnelThresholds, scaleThreshold, sortBy, sortDesc, starredIds])

  // Split filtered assets into videos and images for sectioned display
  const videos = useMemo(() => filteredAssets.filter(a => a.mediaType === 'video'), [filteredAssets])
  const images = useMemo(() => filteredAssets.filter(a => a.mediaType === 'image'), [filteredAssets])

  // Show loading state while waiting for auth/account
  if (!user || !currentAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Creative Studio</h1>
            <p className="text-zinc-500 mt-1">
              Analyze creative performance and build from your winners
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isDownloading && (
              <span className="text-sm text-zinc-400">
                <Download className="w-4 h-4 inline mr-1 animate-pulse" />
                Downloading... {downloadProgress.completed}/{downloadProgress.total}
              </span>
            )}
            {isUploading && (
              <span className="text-sm text-zinc-400">
                <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                {uploadProgress}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-accent hover:bg-accent-hover text-white',
                isUploading && 'opacity-50 cursor-wait'
              )}
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <button
              onClick={handleSync}
              disabled={isSyncing || isDownloading}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-bg-card border border-border hover:border-zinc-600',
                (isSyncing || isDownloading) && 'opacity-50 cursor-wait'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing...' : isDownloading ? 'Downloading...' : 'Sync Media'}
            </button>
          </div>
        </div>

        {/* Funnel Filters + Sort Controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
        >
          {/* Left: Funnel pills — always rendered to avoid layout flash */}
          <div className="w-full lg:flex-1 lg:min-w-0">
            <FunnelFilterBar
              thresholds={funnelThresholds}
              onToggle={toggleFunnelFilter}
              onSetThreshold={setFunnelThreshold}
              onClear={clearFunnelFilters}
              stats={funnelStats}
            />
          </div>

          {/* Right: Sort + View Toggle */}
          <div className="flex items-center justify-between lg:justify-end gap-3 flex-shrink-0">
            <div className="relative" ref={sortDropdownRef}>
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all duration-200 bg-bg-card border-border text-zinc-300 hover:border-border/50"
              >
                <span className="text-zinc-500">Sort:</span>
                <span>{
                  sortBy === 'hookScore' ? 'Hook' :
                  sortBy === 'holdScore' ? 'Hold' :
                  sortBy === 'clickScore' ? 'Click' :
                  sortBy === 'convertScore' ? 'Convert' :
                  sortBy === 'spend' ? 'Scale' :
                  sortBy === 'roas' ? 'ROAS' :
                  sortBy === 'revenue' ? 'Revenue' :
                  sortBy === 'fatigue' ? 'Fatigue' :
                  sortBy === 'adCount' ? 'Usage' :
                  sortBy === 'fileSize' ? 'File Size' :
                  sortBy === 'syncedAt' ? 'Date Synced' : sortBy
                }</span>
                <span className="text-zinc-500">{sortDesc ? '↓' : '↑'}</span>
              </button>

              {showSortDropdown && (
                <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {([
                    { value: 'hookScore', label: 'Hook' },
                    { value: 'holdScore', label: 'Hold' },
                    { value: 'clickScore', label: 'Click' },
                    { value: 'convertScore', label: 'Convert' },
                    { value: 'spend', label: 'Scale' },
                    { value: 'roas', label: 'ROAS' },
                    { value: 'revenue', label: 'Revenue' },
                    { value: 'fatigue', label: 'Fatigue' },
                    { value: 'adCount', label: 'Usage' },
                    { value: 'fileSize', label: 'File Size' },
                    { value: 'syncedAt', label: 'Date Synced' },
                  ] as const).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        if (sortBy === option.value) {
                          setSortDesc(!sortDesc)
                        } else {
                          setSortBy(option.value as SortOption)
                          setSortDesc(true)
                        }
                        setShowSortDropdown(false)
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors ${
                        sortBy === option.value
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.value && (
                        <span className="text-xs">{sortDesc ? '↓ High to Low' : '↑ Low to High'}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              <button
                onClick={() => setViewMode('gallery')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'gallery'
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
                title="Gallery view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'table'
                    ? 'bg-accent text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
                title="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="text-sm text-zinc-500">
          {filteredAssets.length} assets
          {Object.entries(funnelThresholds).some(([, v]) => v !== null) &&
            ` filtered by ${Object.entries(funnelThresholds).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v}+`).join(' + ')}`}
        </div>

        {/* Content — single view with Videos + Images sections */}
        <div>
          {viewMode === 'gallery' ? (
            isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] bg-bg-card border border-border rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
                  <Image className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No media assets</h3>
                <p className="text-sm text-zinc-500 mb-4">
                  Sync your ad account to load media from Meta
                </p>
                <button
                  onClick={handleSync}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  Sync Media
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Videos Section */}
                {videos.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Film className="w-5 h-5 text-purple-400" />
                      <h2 className="text-lg font-semibold text-white">
                        Videos ({videos.length})
                      </h2>
                    </div>
                    <GalleryGrid
                      items={videos}
                      isLoading={false}
                      onSelect={handleSelect}
                      onStar={handleToggleStar}
                      onMenu={handleMenuClick}
                      videoSources={videoSources}
                      onRequestVideoSource={fetchVideoSource}
                    />
                  </div>
                )}

                {/* Images Section */}
                {images.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Image className="w-5 h-5 text-blue-400" />
                      <h2 className="text-lg font-semibold text-white">
                        Images ({images.length})
                      </h2>
                    </div>
                    <GalleryGrid
                      items={images}
                      isLoading={false}
                      onSelect={handleSelect}
                      onStar={handleToggleStar}
                      onMenu={handleMenuClick}
                      videoSources={videoSources}
                      onRequestVideoSource={fetchVideoSource}
                    />
                  </div>
                )}
              </div>
            )
          ) : (
            <MediaTable
              items={filteredAssets}
              isLoading={isLoading}
              sortField={sortBy}
              sortDirection={sortDesc ? 'desc' : 'asc'}
              onSort={handleTableSort}
              onSelect={(id) => handleSelect(id)}
              onStar={(id) => handleToggleStar(id)}
              starredIds={starredIds}
            />
          )}
        </div>
      </div>

      {/* Starred Media Bar */}
      <StarredMediaBar
        starredCount={starredIds.size}
        onBuildAds={handleBuildFromStarred}
        onClear={handleClearStarred}
      />

      {/* Launch Wizard */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={() => setShowLaunchWizard(false)}
            onCancel={() => setShowLaunchWizard(false)}
            initialEntityType="campaign"
            preloadedCreatives={wizardCreatives}
          />
        </div>
      )}

      {/* Theater Modal */}
      <TheaterModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={handleCloseDetail}
        detailData={detailData}
        isLoadingDetail={isDetailLoading}
        isStarred={selectedItem ? starredIds.has(selectedItem.mediaHash) : false}
        onToggleStar={async () => {
          if (selectedItem) {
            await handleToggleStar(selectedItem.id)
          }
        }}
        onBuildNewAds={() => {
          if (!selectedItem) return
          const a = selectedItem
          const creative = {
            preview: a.mediaType === 'video' ? (a.thumbnailUrl || '') : (a.imageUrl || a.storageUrl || ''),
            type: a.mediaType as 'image' | 'video',
            uploaded: true,
            isFromLibrary: true,
            ...(a.mediaType === 'image' ? { imageHash: a.mediaHash } : { videoId: a.mediaHash, thumbnailUrl: a.thumbnailUrl || undefined }),
          }
          setWizardCreatives([creative])
          setSelectedItem(null)
          setDetailData(null)
          setShowLaunchWizard(true)
        }}
      />
    </div>
  )
}
