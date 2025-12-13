'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Search, Image as ImageIcon, Video, Film, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaCard } from './media-card'
import { MediaPreviewModal } from './media-preview-modal'
import type { MediaImage, MediaVideo } from '@/app/api/meta/media/route'

type MediaItem = (MediaImage & { mediaType: 'image' }) | (MediaVideo & { mediaType: 'video' })

interface MediaLibraryModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  adAccountId: string
  selectedItems: MediaItem[]
  onSelectionChange: (items: MediaItem[]) => void
  maxSelection?: number
  allowedTypes?: ('image' | 'video')[]
  disabledIds?: string[] // IDs of items that are already in use
}

type FilterType = 'all' | 'images' | 'videos'

export function MediaLibraryModal({
  isOpen,
  onClose,
  userId,
  adAccountId,
  selectedItems,
  onSelectionChange,
  maxSelection,
  allowedTypes = ['image', 'video'],
  disabledIds = []
}: MediaLibraryModalProps) {
  const [images, setImages] = useState<MediaImage[]>([])
  const [videos, setVideos] = useState<MediaVideo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)

  // Local selection state for internal management
  const [localSelection, setLocalSelection] = useState<MediaItem[]>(selectedItems)

  // Sync local selection with prop changes
  useEffect(() => {
    setLocalSelection(selectedItems)
  }, [selectedItems])

  // Fetch media library
  const fetchMedia = useCallback(async () => {
    if (!userId || !adAccountId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        userId,
        adAccountId,
        type: 'all'
      })

      const response = await fetch(`/api/meta/media?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch media')
      }

      setImages(data.images || [])
      setVideos(data.videos || [])
    } catch (err) {
      console.error('Media fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load media library')
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewItem) {
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
  }, [isOpen, previewItem, onClose])

  // Combined and filtered items
  const allItems: MediaItem[] = useMemo(() => {
    const imageItems: MediaItem[] = allowedTypes.includes('image')
      ? images.map(img => ({ ...img, mediaType: 'image' as const }))
      : []
    const videoItems: MediaItem[] = allowedTypes.includes('video')
      ? videos.map(vid => ({ ...vid, mediaType: 'video' as const }))
      : []

    let combined = [...imageItems, ...videoItems]

    // Filter by type
    if (filterType === 'images') {
      combined = combined.filter(item => item.mediaType === 'image')
    } else if (filterType === 'videos') {
      combined = combined.filter(item => item.mediaType === 'video')
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      combined = combined.filter(item => {
        const name = item.mediaType === 'video'
          ? (item as MediaVideo & { mediaType: 'video' }).title
          : (item as MediaImage & { mediaType: 'image' }).name
        return name.toLowerCase().includes(query)
      })
    }

    // Sort by date (newest first)
    combined.sort((a, b) =>
      new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
    )

    return combined
  }, [images, videos, filterType, searchQuery, allowedTypes])

  // Toggle selection
  const handleToggleSelection = useCallback((item: MediaItem) => {
    setLocalSelection(prev => {
      const isSelected = prev.some(s => s.id === item.id)
      if (isSelected) {
        return prev.filter(s => s.id !== item.id)
      } else {
        if (maxSelection && prev.length >= maxSelection) {
          // Replace the oldest selection
          return [...prev.slice(1), item]
        }
        return [...prev, item]
      }
    })
  }, [maxSelection])

  // Handle preview selection (from preview modal)
  const handlePreviewSelect = useCallback(() => {
    if (previewItem) {
      handleToggleSelection(previewItem)
    }
  }, [previewItem, handleToggleSelection])

  // Confirm selection and close
  const handleConfirm = () => {
    onSelectionChange(localSelection)
    onClose()
  }

  // Check if item is selected
  const isItemSelected = useCallback((item: MediaItem) => {
    return localSelection.some(s => s.id === item.id)
  }, [localSelection])

  // Check if item is disabled
  const isItemDisabled = useCallback((item: MediaItem) => {
    return disabledIds.includes(item.id)
  }, [disabledIds])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-4 lg:inset-8 z-50 flex flex-col bg-bg-card rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Media Library</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Select media from your Meta ad account
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
        <div className="flex flex-col lg:flex-row gap-4 p-4 lg:px-6 border-b border-zinc-800">
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

          {/* Filter tabs */}
          <div className="flex gap-1 bg-bg-hover rounded-lg p-1">
            <button
              onClick={() => setFilterType('all')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filterType === 'all'
                  ? "bg-bg-card text-white"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Film className="w-4 h-4" />
              All
            </button>
            {allowedTypes.includes('image') && (
              <button
                onClick={() => setFilterType('images')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  filterType === 'images'
                    ? "bg-bg-card text-white"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <ImageIcon className="w-4 h-4" />
                Images
              </button>
            )}
            {allowedTypes.includes('video') && (
              <button
                onClick={() => setFilterType('videos')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  filterType === 'videos'
                    ? "bg-bg-card text-white"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                <Video className="w-4 h-4" />
                Videos
              </button>
            )}
          </div>

          {/* Selection count */}
          {localSelection.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="px-2 py-1 bg-accent/20 text-accent rounded-md font-medium">
                {localSelection.length} selected
              </span>
              {maxSelection && (
                <span className="text-zinc-600">/ {maxSelection} max</span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm text-zinc-500">Loading media library...</p>
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
          ) : allItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <FolderOpen className="w-12 h-12 text-zinc-600" />
              <div className="text-center">
                <p className="text-sm text-zinc-400">
                  {searchQuery ? 'No media matches your search' : 'No media in your library'}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {searchQuery ? 'Try a different search term' : 'Upload media to get started'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {allItems.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  isSelected={isItemSelected(item)}
                  isDisabled={isItemDisabled(item)}
                  onSelect={() => handleToggleSelection(item)}
                  onPreview={() => setPreviewItem(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 lg:px-6 border-t border-zinc-800 bg-bg-card">
          <p className="text-xs text-zinc-600">
            {allItems.length} items
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={localSelection.length === 0}
              className={cn(
                "px-6 py-2 text-sm font-medium rounded-lg transition-colors",
                localSelection.length > 0
                  ? "bg-accent hover:bg-accent-hover text-white"
                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              )}
            >
              Add {localSelection.length > 0 ? `(${localSelection.length})` : ''} to Ad
            </button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      <MediaPreviewModal
        item={previewItem}
        isOpen={!!previewItem}
        isSelected={previewItem ? isItemSelected(previewItem) : false}
        onClose={() => setPreviewItem(null)}
        onSelect={handlePreviewSelect}
      />
    </>
  )
}
