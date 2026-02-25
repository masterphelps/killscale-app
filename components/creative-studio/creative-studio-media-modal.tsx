'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Search, Image as ImageIcon, Video, Film, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioAsset } from '@/components/creative-studio/types'

export interface SelectedMediaItem {
  storageUrl: string
  url: string
  mediaType: 'image' | 'video'
  name: string | null
  width: number | null
  height: number | null
  thumbnailUrl: string | null
  mediaHash: string
  sourceType: string | null
}

interface CreativeStudioMediaModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  adAccountId: string
  onSelect: (item: SelectedMediaItem) => void
  allowedTypes?: ('image' | 'video')[]
}

type MediaTypeFilter = 'all' | 'images' | 'videos'
type SourceFilter = 'all' | 'meta' | 'ai'

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function getScoreBgColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500/15'
  if (score >= 50) return 'bg-amber-500/15'
  if (score >= 25) return 'bg-orange-500/15'
  return 'bg-red-500/15'
}

export function CreativeStudioMediaModal({
  isOpen,
  onClose,
  userId,
  adAccountId,
  onSelect,
  allowedTypes,
}: CreativeStudioMediaModalProps) {
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  // Fetch media from Creative Studio API
  const fetchMedia = useCallback(async () => {
    if (!userId || !adAccountId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ userId, adAccountId })
      const res = await fetch(`/api/creative-studio/media?${params}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch media')
      }

      setAssets(data.assets || [])
    } catch (err) {
      console.error('Creative Studio media fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setIsLoading(false)
    }
  }, [userId, adAccountId])

  // Fetch when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchMedia()
    }
  }, [isOpen, fetchMedia])

  // Reset filters when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setMediaTypeFilter('all')
      setSourceFilter('all')
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Filtered assets
  const filteredAssets = useMemo(() => {
    let result = assets

    // Pre-filter by allowedTypes prop
    if (allowedTypes && allowedTypes.length > 0) {
      result = result.filter(a => allowedTypes.includes(a.mediaType))
    }

    // Media type filter
    if (mediaTypeFilter === 'images') {
      result = result.filter(a => a.mediaType === 'image')
    } else if (mediaTypeFilter === 'videos') {
      result = result.filter(a => a.mediaType === 'video')
    }

    // Source filter
    if (sourceFilter === 'meta') {
      result = result.filter(a => !a.sourceType || a.sourceType === 'meta')
    } else if (sourceFilter === 'ai') {
      result = result.filter(a => a.sourceType && a.sourceType !== 'meta')
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a => a.name && a.name.toLowerCase().includes(query))
    }

    return result
  }, [assets, allowedTypes, mediaTypeFilter, sourceFilter, searchQuery])

  // Handle card click
  const handleSelect = useCallback((asset: StudioAsset) => {
    const resolvedUrl = asset.storageUrl || asset.imageUrl || ''
    const item: SelectedMediaItem = {
      storageUrl: asset.storageUrl || '',
      url: resolvedUrl,
      mediaType: asset.mediaType,
      name: asset.name,
      width: asset.width,
      height: asset.height,
      thumbnailUrl: asset.thumbnailUrl,
      mediaHash: asset.mediaHash,
      sourceType: asset.sourceType || null,
    }
    onSelect(item)
    onClose()
  }, [onSelect, onClose])

  // Determine which type pills to show
  const showImageFilter = !allowedTypes || allowedTypes.includes('image')
  const showVideoFilter = !allowedTypes || allowedTypes.includes('video')

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 lg:inset-8 z-50 flex flex-col bg-bg-card rounded-2xl overflow-hidden shadow-2xl max-w-6xl mx-auto" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-white">Media Library</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Select media from your Creative Studio catalog
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 p-4 lg:px-6 border-b border-zinc-800 shrink-0">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-hover border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Media type pills */}
          <div className="flex gap-1 bg-bg-hover rounded-lg p-1">
            <button
              onClick={() => setMediaTypeFilter('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                mediaTypeFilter === 'all'
                  ? 'bg-bg-card text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              <Film className="w-3.5 h-3.5" />
              All
            </button>
            {showImageFilter && (
              <button
                onClick={() => setMediaTypeFilter('images')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  mediaTypeFilter === 'images'
                    ? 'bg-bg-card text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Images
              </button>
            )}
            {showVideoFilter && (
              <button
                onClick={() => setMediaTypeFilter('videos')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  mediaTypeFilter === 'videos'
                    ? 'bg-bg-card text-white'
                    : 'text-zinc-400 hover:text-white'
                )}
              >
                <Video className="w-3.5 h-3.5" />
                Videos
              </button>
            )}
          </div>

          {/* Source pills */}
          <div className="flex gap-1 bg-bg-hover rounded-lg p-1">
            <button
              onClick={() => setSourceFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                sourceFilter === 'all'
                  ? 'bg-bg-card text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              All Sources
            </button>
            <button
              onClick={() => setSourceFilter('meta')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                sourceFilter === 'meta'
                  ? 'bg-bg-card text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              Meta
            </button>
            <button
              onClick={() => setSourceFilter('ai')}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                sourceFilter === 'ai'
                  ? 'bg-bg-card text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              AI Generated
            </button>
          </div>
        </div>

        {/* Grid area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm text-zinc-500">Loading media catalog...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchMedia}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FolderOpen className="w-12 h-12 text-zinc-600" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  {searchQuery ? 'No media matches your search' : 'No media found'}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {searchQuery ? 'Try a different search term' : 'Sync media from your ad account in Creative Studio'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className="group relative flex flex-col bg-bg-dark rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-600 hover:ring-1 hover:ring-accent/30 transition-all text-left"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-zinc-900 overflow-hidden">
                    {(asset.mediaType === 'image' ? asset.imageUrl : asset.thumbnailUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(asset.mediaType === 'image' ? asset.imageUrl : asset.thumbnailUrl) || ''}
                        alt={asset.name || 'Media'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {asset.mediaType === 'video' ? (
                          <Video className="w-10 h-10 text-zinc-700" />
                        ) : (
                          <ImageIcon className="w-10 h-10 text-zinc-700" />
                        )}
                      </div>
                    )}

                    {/* Video icon overlay */}
                    {asset.mediaType === 'video' && (
                      <div className="absolute top-2 right-2 p-1 bg-black/60 rounded">
                        <Video className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2.5 flex flex-col gap-1.5">
                    {/* Name */}
                    <p className="text-xs text-white truncate">
                      {asset.name || 'Untitled'}
                    </p>

                    {/* Source badge */}
                    <div className="flex items-center gap-1.5">
                      {(!asset.sourceType || asset.sourceType === 'meta') ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
                          Meta
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
                          AI
                        </span>
                      )}
                    </div>

                    {/* Score badges */}
                    {(asset.hookScore !== null || asset.holdScore !== null || asset.clickScore !== null || asset.convertScore !== null) && (
                      <div className="flex flex-wrap gap-1">
                        {asset.hookScore !== null && (
                          <span className={cn('inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold', getScoreBgColor(asset.hookScore), getScoreColor(asset.hookScore))}>
                            H:{asset.hookScore}
                          </span>
                        )}
                        {asset.holdScore !== null && (
                          <span className={cn('inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold', getScoreBgColor(asset.holdScore), getScoreColor(asset.holdScore))}>
                            Hd:{asset.holdScore}
                          </span>
                        )}
                        {asset.clickScore !== null && (
                          <span className={cn('inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold', getScoreBgColor(asset.clickScore), getScoreColor(asset.clickScore))}>
                            Cl:{asset.clickScore}
                          </span>
                        )}
                        {asset.convertScore !== null && (
                          <span className={cn('inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold', getScoreBgColor(asset.convertScore), getScoreColor(asset.convertScore))}>
                            Cv:{asset.convertScore}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 lg:px-6 border-t border-zinc-800 shrink-0">
          <p className="text-xs text-zinc-600">
            {filteredAssets.length} {filteredAssets.length === 1 ? 'item' : 'items'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
