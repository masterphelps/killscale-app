'use client'

import { useState } from 'react'
import { Check, Play, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFileSize, formatDuration, formatDate } from '@/lib/utils'
import type { MediaImage, MediaVideo } from '@/app/api/meta/media/route'

type MediaItem = (MediaImage & { mediaType: 'image' }) | (MediaVideo & { mediaType: 'video' })

interface MediaCardProps {
  item: MediaItem
  isSelected: boolean
  isDisabled?: boolean
  onSelect: () => void
  onPreview: () => void
}

export function MediaCard({ item, isSelected, isDisabled, onSelect, onPreview }: MediaCardProps) {
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isVideo = item.mediaType === 'video'
  const thumbnailUrl = isVideo ? (item as MediaVideo & { mediaType: 'video' }).thumbnailUrl : (item as MediaImage & { mediaType: 'image' }).url
  const name = isVideo ? (item as MediaVideo & { mediaType: 'video' }).title : (item as MediaImage & { mediaType: 'image' }).name
  const size = isVideo ? 0 : (item as MediaImage & { mediaType: 'image' }).bytes
  const duration = isVideo ? (item as MediaVideo & { mediaType: 'video' }).length : 0

  const handleClick = () => {
    if (isDisabled) return
    onSelect()
  }

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onPreview()
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative rounded-xl overflow-hidden border-2 transition-all duration-150 cursor-pointer group",
        isSelected && "border-accent ring-2 ring-accent/20",
        !isSelected && !isDisabled && "border-transparent hover:border-zinc-600",
        isDisabled && "opacity-50 cursor-not-allowed",
        isHovered && !isDisabled && "scale-[1.02]"
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-square bg-bg-hover relative overflow-hidden">
        {thumbnailUrl && !imageError ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-zinc-600" />
          </div>
        )}

        {/* Video play button overlay */}
        {isVideo && (
          <button
            onClick={handlePlayClick}
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
              isHovered ? "opacity-100" : "opacity-70"
            )}
          >
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 hover:scale-110 transition-all">
              <Play className="w-6 h-6 text-white ml-1" fill="white" />
            </div>
          </button>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center shadow-lg">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Video duration badge */}
        {isVideo && duration > 0 && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white font-mono">
            {formatDuration(duration)}
          </div>
        )}

        {/* Disabled overlay */}
        {isDisabled && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-xs text-white bg-black/60 px-2 py-1 rounded">In use</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 bg-bg-card">
        <p className="text-sm font-medium truncate" title={name}>
          {name}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-zinc-500">
            {size > 0 ? formatFileSize(size) : (isVideo ? 'Video' : 'Image')}
          </span>
          <span className="text-xs text-zinc-600">
            {formatDate(item.createdTime)}
          </span>
        </div>
      </div>
    </div>
  )
}
