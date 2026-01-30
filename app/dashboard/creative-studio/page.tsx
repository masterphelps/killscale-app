'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, List, Search, RefreshCw, Download, Film, Image } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  GalleryGrid,
  CreativeHealthBanner,
  StarredMediaBar,
  TheaterModal,
} from '@/components/creative-studio'
import type {
  StudioAsset,
  StudioAssetDetail,
  CreativeHealthScore,
  FatigueStatus,
} from '@/components/creative-studio/types'

type ViewMode = 'gallery' | 'table'
type SortOption = 'roas' | 'spend' | 'revenue' | 'fatigue' | 'adCount' | 'thumbstopRate' | 'holdRate' | 'hookScore' | 'fileSize' | 'syncedAt' | 'name'
type MediaTypeFilter = 'all' | 'image' | 'video'
type HasDataFilter = 'all' | 'with_spend' | 'unused'

export default function CreativeStudioPage() {
  // Auth & Account
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [sortBy, setSortBy] = useState<SortOption>('roas')
  const [sortDesc, setSortDesc] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFatigue, setFilterFatigue] = useState<FatigueStatus | 'all'>('all')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all')
  const [hasDataFilter, setHasDataFilter] = useState<HasDataFilter>('all')

  // Data state
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [healthScore, setHealthScore] = useState<CreativeHealthScore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Download state (Phase 2 of sync)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 })

  // Modal state
  const [selectedItem, setSelectedItem] = useState<StudioAsset | null>(null)
  const [detailData, setDetailData] = useState<StudioAssetDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  // Starred items
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())

  // Video source cache for hover-to-play
  const [videoSources, setVideoSources] = useState<Record<string, string>>({})
  const videoSourceLoadingRef = useRef<Set<string>>(new Set())

  // Fetch video source on demand (for hover-to-play)
  const fetchVideoSource = useCallback(async (videoId: string) => {
    if (!user || videoSources[videoId] || videoSourceLoadingRef.current.has(videoId)) return
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
  }, [user, videoSources])

  // Load data
  const loadData = useCallback(async () => {
    if (!user || !currentAccountId) return
    setIsLoading(true)

    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
      })

      const [assetsRes, healthRes, starredRes] = await Promise.all([
        fetch(`/api/creative-studio/media?${params}`),
        fetch(`/api/creative-studio/health?${params}`),
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
      if (healthRes.ok) {
        const data = await healthRes.json()
        setHealthScore(data)
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

  // Handle menu click
  const handleMenuClick = useCallback((id: string) => {
    console.log('Menu clicked for:', id)
  }, [])

  // Handle close detail
  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null)
    setDetailData(null)
  }, [])

  // Handle build from starred
  const handleBuildFromStarred = useCallback(() => {
    console.log('Build from starred:', Array.from(starredIds))
  }, [starredIds])

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

  // Filter and sort all assets
  const filteredAssets = useMemo(() => {
    let items = [...assets]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      items = items.filter(item => {
        if (item.name) return item.name.toLowerCase().includes(query)
        return false
      })
    }

    // Media type filter
    if (mediaTypeFilter !== 'all') {
      items = items.filter(item => item.mediaType === mediaTypeFilter)
    }

    // Fatigue filter
    if (filterFatigue !== 'all') {
      items = items.filter(item => item.fatigueStatus === filterFatigue)
    }

    // Has data filter
    if (hasDataFilter === 'with_spend') {
      items = items.filter(item => item.hasPerformanceData)
    } else if (hasDataFilter === 'unused') {
      items = items.filter(item => !item.hasPerformanceData)
    }

    // Sort
    items.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'roas': comparison = a.roas - b.roas; break
        case 'spend': comparison = a.spend - b.spend; break
        case 'revenue': comparison = a.revenue - b.revenue; break
        case 'fatigue': comparison = a.fatigueScore - b.fatigueScore; break
        case 'adCount': comparison = a.adCount - b.adCount; break
        case 'thumbstopRate': comparison = (a.thumbstopRate ?? -1) - (b.thumbstopRate ?? -1); break
        case 'holdRate': comparison = (a.holdRate ?? -1) - (b.holdRate ?? -1); break
        case 'hookScore': comparison = (a.hookScore ?? -1) - (b.hookScore ?? -1); break
        case 'fileSize': comparison = (a.fileSize || 0) - (b.fileSize || 0); break
        case 'syncedAt': comparison = (a.syncedAt || '').localeCompare(b.syncedAt || ''); break
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break
      }
      return sortDesc ? -comparison : comparison
    })

    return items.map(item => ({
      ...item,
      isStarred: starredIds.has(item.mediaHash),
    }))
  }, [assets, searchQuery, mediaTypeFilter, filterFatigue, hasDataFilter, sortBy, sortDesc, starredIds])

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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
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
        </motion.div>

        {/* Health Score Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {isLoading ? (
            <div className="h-16 bg-bg-card border border-border rounded-xl animate-pulse" />
          ) : healthScore ? (
            <CreativeHealthBanner healthScore={healthScore} />
          ) : null}
        </motion.div>

        {/* Controls Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          {/* Left: Sort */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={cn(
                'bg-bg-card border border-border rounded-lg px-3 py-2',
                'text-sm text-white',
                'focus:outline-none focus:border-accent'
              )}
            >
              <option value="roas">Sort: ROAS</option>
              <option value="spend">Sort: Spend</option>
              <option value="revenue">Sort: Revenue</option>
              <option value="fatigue">Sort: Fatigue</option>
              <option value="adCount">Sort: Usage</option>
              <option value="thumbstopRate">Sort: Thumbstop</option>
              <option value="holdRate">Sort: Hold Rate</option>
              <option value="hookScore">Sort: Hook Score</option>
              <option value="fileSize">Sort: File Size</option>
              <option value="syncedAt">Sort: Date Synced</option>
            </select>

            {/* Filters */}
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as MediaTypeFilter)}
              className={cn(
                'bg-bg-card border border-border rounded-lg px-3 py-2',
                'text-sm text-white',
                'focus:outline-none focus:border-accent'
              )}
            >
              <option value="all">All Types</option>
              <option value="video">Videos</option>
              <option value="image">Images</option>
            </select>

            <select
              value={filterFatigue}
              onChange={(e) => setFilterFatigue(e.target.value as FatigueStatus | 'all')}
              className={cn(
                'bg-bg-card border border-border rounded-lg px-3 py-2',
                'text-sm text-white',
                'focus:outline-none focus:border-accent'
              )}
            >
              <option value="all">All Status</option>
              <option value="fresh">Fresh</option>
              <option value="healthy">Healthy</option>
              <option value="warning">Warning</option>
              <option value="fatiguing">Fatiguing</option>
              <option value="fatigued">Fatigued</option>
            </select>

            <select
              value={hasDataFilter}
              onChange={(e) => setHasDataFilter(e.target.value as HasDataFilter)}
              className={cn(
                'bg-bg-card border border-border rounded-lg px-3 py-2',
                'text-sm text-white',
                'focus:outline-none focus:border-accent'
              )}
            >
              <option value="all">All Assets</option>
              <option value="with_spend">With Spend</option>
              <option value="unused">Unused</option>
            </select>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className={cn(
                  'w-48 lg:w-64 bg-bg-card border border-border rounded-lg pl-10 pr-4 py-2',
                  'text-sm text-white placeholder:text-zinc-600',
                  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50'
                )}
              />
            </div>

            {/* View Toggle */}
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
        </motion.div>

        {/* Results Count */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-zinc-500"
        >
          {filteredAssets.length} assets
          {mediaTypeFilter !== 'all' && ` (${mediaTypeFilter}s)`}
          {searchQuery && ` matching "${searchQuery}"`}
          {filterFatigue !== 'all' && ` with ${filterFatigue} status`}
          {hasDataFilter === 'with_spend' && ' with spend data'}
          {hasDataFilter === 'unused' && ' (unused)'}
        </motion.div>

        {/* Content — single view with Videos + Images sections */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
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
                {(mediaTypeFilter === 'all' || mediaTypeFilter === 'video') && videos.length > 0 && (
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
                {(mediaTypeFilter === 'all' || mediaTypeFilter === 'image') && images.length > 0 && (
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
            <div className="p-8 text-center text-zinc-500">
              Table view coming soon. Use gallery view for now.
            </div>
          )}
        </motion.div>
      </div>

      {/* Starred Media Bar */}
      <StarredMediaBar
        starredCount={starredIds.size}
        onBuildAds={handleBuildFromStarred}
        onClear={handleClearStarred}
      />

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
          console.log('Build new ads from:', selectedItem)
        }}
      />
    </div>
  )
}
