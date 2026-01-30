'use client'

import Masonry from 'react-masonry-css'
import { MediaGalleryCard } from './media-gallery-card'
import { SkeletonCard } from './skeleton-card'
import { EmptyState } from './empty-state'
import type { StudioAsset } from './types'

interface GalleryGridProps {
  items: StudioAsset[]
  isLoading: boolean
  onSelect: (id: string) => void
  onStar: (id: string) => void
  onMenu: (id: string) => void
  onSync?: () => void
  onUpload?: () => void
  videoSources?: Record<string, string>
  onRequestVideoSource?: (videoId: string) => void
}

const breakpointColumns = {
  default: 4,
  1536: 4,  // 2xl
  1280: 3,  // xl
  1024: 3,  // lg
  768: 2,   // md
  640: 1,   // sm
}

export function GalleryGrid({
  items,
  isLoading,
  onSelect,
  onStar,
  onMenu,
  onSync,
  onUpload,
  videoSources,
  onRequestVideoSource,
}: GalleryGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState type="media" onSync={onSync} onUpload={onUpload} />
  }

  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="flex -ml-6 w-auto"
      columnClassName="pl-6 bg-clip-padding"
    >
      {items.map((item, index) => (
        <div key={item.id} className="mb-6">
          <MediaGalleryCard
            item={item}
            index={index}
            onSelect={() => onSelect(item.id)}
            onStar={() => onStar(item.id)}
            onMenuClick={() => onMenu(item.id)}
            videoSourceUrl={item.mediaType === 'video' ? videoSources?.[item.mediaHash] : undefined}
            onRequestVideoSource={item.mediaType === 'video' ? () => onRequestVideoSource?.(item.mediaHash) : undefined}
          />
        </div>
      ))}
    </Masonry>
  )
}
