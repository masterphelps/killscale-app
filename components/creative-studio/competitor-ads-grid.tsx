'use client'

import { useEffect, useRef, useCallback } from 'react'
import Masonry from 'react-masonry-css'
import { Loader2 } from 'lucide-react'
import { CompetitorAdCard } from './competitor-ad-card'
import { SkeletonCard } from './skeleton-card'
import type { CompetitorAd } from './types'

interface CompetitorAdsGridProps {
  ads: CompetitorAd[]
  isLoading: boolean
  hasMore: boolean
  onLoadMore: () => void
  onSelect: (ad: CompetitorAd) => void
}

const breakpointColumns = {
  default: 4,
  1536: 4,  // 2xl
  1280: 3,  // xl
  1024: 3,  // lg
  768: 2,   // md
  640: 1,   // sm
}

export function CompetitorAdsGrid({
  ads,
  isLoading,
  hasMore,
  onLoadMore,
  onSelect,
}: CompetitorAdsGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingMore = useRef(false)

  // Infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !isLoadingMore.current && !isLoading) {
        isLoadingMore.current = true
        onLoadMore()
        // Reset after a short delay to prevent rapid calls
        setTimeout(() => {
          isLoadingMore.current = false
        }, 1000)
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    })

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [handleObserver])

  if (isLoading && ads.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      </div>
    )
  }

  if (ads.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">No ads found for this company</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <Masonry
        breakpointCols={breakpointColumns}
        className="flex -ml-6 w-auto"
        columnClassName="pl-6 bg-clip-padding"
      >
        {ads.map((ad, index) => (
          <div key={ad.id} className="mb-6">
            <CompetitorAdCard
              ad={ad}
              index={index}
              onClick={() => onSelect(ad)}
            />
          </div>
        ))}
      </Masonry>

      {/* Load More Trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading more ads...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
