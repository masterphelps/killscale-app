'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Loader2, Film, ImageIcon } from 'lucide-react'
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from '../advanced-timeline/hooks/use-new-item-drag'

interface MediaItem {
  id: string
  name: string
  mediaType: 'VIDEO' | 'IMAGE'
  thumbnailUrl?: string
  storageUrl?: string
  width?: number
  height?: number
  fileSize?: number
}

interface MediaPanelProps {
  userId: string
  adAccountId: string
  onAddMedia: (item: MediaItem) => void
  onUpload?: () => void
}

type TypeFilter = 'all' | 'video' | 'image'
type MediaTab = 'media' | 'collections'

/** Individual media card — videos render as <video> paused at 0.1s, images as <img>. Draggable to timeline. */
function MediaItemCard({ item, onAddMedia }: { item: MediaItem; onAddMedia: (item: MediaItem) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // For videos: once metadata loads, seek to 0.1s and pause to show a poster frame
  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = 0.1
    el.pause()
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const isVideo = item.mediaType === 'VIDEO'
    const type = isVideo ? 'video' : 'image'

    // Get duration from video element metadata if available
    let duration = 5 // default
    if (isVideo && videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      duration = videoRef.current.duration
    }

    // For videos, prefer actual video dimensions from the <video> element (videoWidth/videoHeight)
    // over stored dimensions from media_library, which may be thumbnail dimensions (often landscape
    // even for portrait videos). This fixes bounding box aspect ratio issues in the editor preview.
    let actualWidth = item.width
    let actualHeight = item.height
    if (isVideo && videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      actualWidth = videoRef.current.videoWidth
      actualHeight = videoRef.current.videoHeight
    }

    // Build drag data matching the format the timeline expects
    const dragData = {
      isNewItem: true,
      type,
      label: item.name,
      duration,
      data: {
        id: item.id,
        _source: 'killscale',
        _sourceDisplayName: 'KillScale',
        thumbnail: item.thumbnailUrl || '',
        src: item.storageUrl || item.thumbnailUrl || '',
        width: actualWidth,
        height: actualHeight,
      },
    }

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))

    // Set global drag state for timeline ghost preview
    setCurrentNewItemDragType(type)
    setCurrentNewItemDragData(dragData)

    // Create a small drag preview from the thumbnail
    const thumb = e.currentTarget.querySelector('img, video')
    if (thumb) {
      const preview = document.createElement('div')
      preview.style.cssText = 'position:absolute;top:-9999px;width:60px;height:40px;overflow:hidden;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.3)'
      const clone = thumb.cloneNode(true) as HTMLElement
      clone.style.cssText = 'width:80px;height:60px;object-fit:cover'
      preview.appendChild(clone)
      document.body.appendChild(preview)
      e.dataTransfer.setDragImage(preview, 30, 20)
      setTimeout(() => preview.remove(), 0)
    }
  }, [item])

  const handleDragEnd = useCallback(() => {
    setCurrentNewItemDragType(null)
    setCurrentNewItemDragData(null)
  }, [])

  const isVideo = item.mediaType === 'VIDEO'
  // Determine if thumbnailUrl is actually a video file (storage URL fallback)
  const thumbnailIsVideo = item.thumbnailUrl?.match(/\.(mp4|mov|webm|avi)(\?|$)/i)
  const videoSrc = thumbnailIsVideo ? item.thumbnailUrl : (item.storageUrl || item.thumbnailUrl)

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onAddMedia(item)}
      className="relative rounded-lg overflow-hidden border border-border hover:border-purple-500/50 transition-colors group text-left cursor-grab active:cursor-grabbing"
    >
      <div className="aspect-[4/3] bg-bg-card">
        {isVideo && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? <Film className="w-7 h-7 text-zinc-600" /> : <ImageIcon className="w-7 h-7 text-zinc-600" />}
          </div>
        )}
      </div>
      <div className="absolute top-1.5 left-1.5">
        <span className="text-xs px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
          {isVideo ? '\uD83C\uDFAC' : '\uD83D\uDDBC'}
        </span>
      </div>
      <p className="text-xs text-zinc-400 truncate px-2 py-1.5">{item.name}</p>
    </div>
  )
}

export function MediaPanel({ userId, adAccountId, onAddMedia, onUpload }: MediaPanelProps) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [activeTab, setActiveTab] = useState<MediaTab>('media')

  useEffect(() => {
    loadMedia()
  }, [userId, adAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMedia = async () => {
    if (!userId || !adAccountId) return
    setIsLoading(true)
    try {
      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const res = await fetch(`/api/creative-studio/media?userId=${userId}&adAccountId=${cleanAccountId}`)
      if (res.ok) {
        const data = await res.json()
        // Map API response (lowercase mediaType, separate imageUrl/thumbnailUrl) to panel format
        const mapped: MediaItem[] = (data.assets || []).map((a: any) => ({
          id: a.id || a.mediaHash,
          name: a.name || 'Untitled',
          mediaType: (a.mediaType === 'video' ? 'VIDEO' : 'IMAGE') as 'VIDEO' | 'IMAGE',
          thumbnailUrl: a.thumbnailUrl || a.imageUrl || a.storageUrl,
          storageUrl: a.storageUrl,
          width: a.width,
          height: a.height,
          fileSize: a.fileSize,
        }))
        setItems(mapped)
      }
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (typeFilter === 'video') return item.mediaType === 'VIDEO'
    if (typeFilter === 'image') return item.mediaType === 'IMAGE'
    return true
  })

  return (
    <div className="p-3 space-y-3 flex flex-col h-full">
      <div className="flex rounded-lg bg-bg-hover p-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${activeTab === 'media' ? 'bg-bg-card text-white' : 'text-zinc-400'}`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`flex-1 text-sm py-2 rounded-md transition-colors ${activeTab === 'collections' ? 'bg-bg-card text-white' : 'text-zinc-400'}`}
        >
          Collections
        </button>
      </div>

      {activeTab === 'media' && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            {onUpload && (
              <button onClick={onUpload} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-bg-hover hover:bg-bg-card border border-border text-zinc-300 transition-colors">
                <Upload className="w-4 h-4" /> Upload
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {(['all', 'video', 'image'] as TypeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setTypeFilter(filter)}
                className={`text-sm px-3 py-1.5 rounded-full transition-colors capitalize ${
                  typeFilter === filter ? 'bg-purple-600 text-white' : 'bg-bg-hover text-zinc-400 hover:bg-bg-card'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Videos' : 'Images'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-4">No media found</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2.5">
              {filteredItems.map((item) => (
                <MediaItemCard key={item.id} item={item} onAddMedia={onAddMedia} />
              ))}
            </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'collections' && (
        <div className="text-sm text-zinc-500 text-center py-8">
          Collections will appear here.
        </div>
      )}
    </div>
  )
}
