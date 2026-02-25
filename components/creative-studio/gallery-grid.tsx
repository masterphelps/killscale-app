'use client'

import Masonry from 'react-masonry-css'
import { cn } from '@/lib/utils'
import { MediaGalleryCard } from './media-gallery-card'
import { SkeletonCard } from './skeleton-card'
import { EmptyState } from './empty-state'
import type { StudioAsset } from './types'

interface GalleryGridProps {
  items: StudioAsset[]
  isLoading: boolean
  onSelect: (id: string) => void
  onStar?: (id: string) => void
  onMenu?: (id: string, e: React.MouseEvent) => void
  onSync?: () => void
  onUpload?: () => void
  videoSources?: Record<string, string>
  onRequestVideoSource?: (videoId: string) => void
  // Optional props for customization (used by Active Ads, Best Ads pages)
  rankMode?: boolean
  customMetrics?: (item: StudioAsset) => { label: string; value: string }[]
  textContent?: (item: StudioAsset) => string | undefined
  subtitle?: (item: StudioAsset) => string | undefined
  minimal?: boolean
}

const defaultBreakpoints = {
  default: 4,
  1536: 4,  // 2xl
  1280: 3,  // xl
  1024: 3,  // lg
  768: 2,   // md
  640: 1,   // sm
}

const minimalBreakpoints = {
  default: 5,
  1536: 5,   // 2xl
  1280: 4,   // xl
  1024: 3,   // lg
  768: 2,    // md
  640: 1,    // sm
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
  rankMode,
  customMetrics,
  textContent,
  subtitle,
  minimal,
}: GalleryGridProps) {
  if (isLoading) {
    return (
      <div className={minimal ? '' : 'max-w-[1200px] mx-auto'}>
        <div className={cn(
          'grid',
          minimal
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
        )}>
          {Array.from({ length: minimal ? 10 : 8 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState type="media" onSync={onSync} onUpload={onUpload} />
  }

  return (
    <div className={minimal ? '' : 'max-w-[1200px] mx-auto'}>
      <Masonry
        breakpointCols={minimal ? minimalBreakpoints : defaultBreakpoints}
        className={minimal ? 'flex -ml-4 w-auto' : 'flex -ml-6 w-auto'}
        columnClassName={minimal ? 'pl-4 bg-clip-padding' : 'pl-6 bg-clip-padding'}
      >
        {items.map((item, index) => (
          <div key={item.id} className={minimal ? 'mb-4' : 'mb-6'}>
            <MediaGalleryCard
              item={item}
              index={index}
              onSelect={() => onSelect(item.id)}
              onStar={onStar ? () => onStar(item.id) : undefined}
              onMenuClick={onMenu ? (e) => onMenu(item.id, e) : undefined}
              videoSourceUrl={item.mediaType === 'video' ? videoSources?.[item.mediaHash] : undefined}
              onRequestVideoSource={item.mediaType === 'video' ? () => onRequestVideoSource?.(item.mediaHash) : undefined}
              rankBadge={rankMode ? index + 1 : undefined}
              customMetrics={customMetrics ? customMetrics(item) : undefined}
              textContent={textContent ? textContent(item) : undefined}
              subtitle={subtitle ? subtitle(item) : undefined}
              minimal={minimal}
            />
          </div>
        ))}
      </Masonry>
    </div>
  )
}
