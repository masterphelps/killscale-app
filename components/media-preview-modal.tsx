'use client'

import { useEffect, useRef, useCallback } from 'react'
import { X, Download, Check, Clock, Maximize2, Image as ImageIcon, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize, formatDuration, formatDate } from '@/lib/utils'
import type { MediaImage, MediaVideo } from '@/app/api/meta/media/route'

type MediaItem = (MediaImage & { mediaType: 'image' }) | (MediaVideo & { mediaType: 'video' })

interface MediaPreviewModalProps {
  item: MediaItem | null
  isOpen: boolean
  isSelected: boolean
  onClose: () => void
  onSelect: () => void
}

export function MediaPreviewModal({ item, isOpen, isSelected, onClose, onSelect }: MediaPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  // Autoplay video when modal opens
  useEffect(() => {
    if (isOpen && item?.mediaType === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, that's okay
      })
    }
  }, [isOpen, item])

  if (!isOpen || !item) return null

  const isVideo = item.mediaType === 'video'
  const name = isVideo ? (item as MediaVideo & { mediaType: 'video' }).title : (item as MediaImage & { mediaType: 'image' }).name
  const size = isVideo ? 0 : (item as MediaImage & { mediaType: 'image' }).bytes
  const duration = isVideo ? (item as MediaVideo & { mediaType: 'video' }).length : 0
  const width = item.width
  const height = item.height
  const sourceUrl = isVideo
    ? (item as MediaVideo & { mediaType: 'video' }).source
    : (item as MediaImage & { mediaType: 'image' }).url

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleSelectClick = () => {
    onSelect()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Content container */}
      <div className="flex flex-col lg:flex-row max-w-6xl w-full mx-4 gap-6">
        {/* Media preview */}
        <div className="flex-1 flex items-center justify-center">
          {isVideo ? (
            <video
              ref={videoRef}
              src={sourceUrl}
              controls
              autoPlay
              muted
              playsInline
              className="max-w-full max-h-[70vh] rounded-lg shadow-2xl"
            >
              Your browser does not support video playback.
            </video>
          ) : (
            <img
              src={sourceUrl}
              alt={name}
              className="max-w-full max-h-[70vh] rounded-lg shadow-2xl object-contain"
            />
          )}
        </div>

        {/* Info panel */}
        <div className="lg:w-80 bg-bg-card rounded-xl p-6 flex flex-col gap-6">
          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-white truncate" title={name}>
              {name}
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              {formatDate(item.createdTime)}
            </p>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              {isVideo ? (
                <Video className="w-4 h-4 text-zinc-500" />
              ) : (
                <ImageIcon className="w-4 h-4 text-zinc-500" />
              )}
              <span className="text-zinc-400">
                {isVideo ? 'Video' : 'Image'}
              </span>
            </div>

            {size > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Download className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">{formatFileSize(size)}</span>
              </div>
            )}

            {duration > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">{formatDuration(duration)}</span>
              </div>
            )}

            {(width > 0 && height > 0) && (
              <div className="flex items-center gap-3 text-sm">
                <Maximize2 className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">{width} × {height}</span>
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Select button */}
          <button
            onClick={handleSelectClick}
            className={cn(
              "w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2",
              isSelected
                ? "bg-accent/20 text-accent border border-accent"
                : "bg-accent hover:bg-accent-hover text-white"
            )}
          >
            {isSelected ? (
              <>
                <Check className="w-5 h-5" />
                Selected
              </>
            ) : (
              'Select for Ad'
            )}
          </button>

          {/* Hint */}
          <p className="text-xs text-zinc-600 text-center">
            Press Esc or click outside to close
          </p>
        </div>
      </div>
    </div>
  )
}
