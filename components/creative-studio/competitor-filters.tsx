'use client'

import { Film, Image, Layers, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MediaTypeFilter = 'all' | 'video' | 'image' | 'carousel' | 'text'
export type DaysActiveFilter = 'all' | '0-7' | '7-30' | '30-90' | '90+'
export type StatusFilter = 'all' | 'active' | 'inactive'

interface CompetitorFiltersProps {
  mediaType: MediaTypeFilter
  daysActive: DaysActiveFilter
  status: StatusFilter
  onMediaTypeChange: (value: MediaTypeFilter) => void
  onDaysActiveChange: (value: DaysActiveFilter) => void
  onStatusChange: (value: StatusFilter) => void
  activeFiltersCount: number
  onClearAll: () => void
}

export function CompetitorFilters({
  mediaType,
  daysActive,
  status,
  onMediaTypeChange,
  onDaysActiveChange,
  onStatusChange,
  activeFiltersCount,
  onClearAll,
}: CompetitorFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Media Type */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Media:</span>
        <select
          value={mediaType}
          onChange={(e) => onMediaTypeChange(e.target.value as MediaTypeFilter)}
          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="all">All Types</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="carousel">Carousel</option>
          <option value="text">Text Only</option>
        </select>
      </div>

      {/* Days Active */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Running:</span>
        <select
          value={daysActive}
          onChange={(e) => onDaysActiveChange(e.target.value as DaysActiveFilter)}
          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="all">Any Duration</option>
          <option value="0-7">0-7 days</option>
          <option value="7-30">7-30 days</option>
          <option value="30-90">30-90 days</option>
          <option value="90+">90+ days</option>
        </select>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Status:</span>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Clear Filters */}
      {activeFiltersCount > 0 && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-3 h-3" />
          Clear ({activeFiltersCount})
        </button>
      )}
    </div>
  )
}

// Helper to filter ads based on current filters
export function filterCompetitorAds<T extends {
  mediaType: 'image' | 'video' | 'carousel' | 'text'
  daysActive: number
  isActive: boolean
}>(
  ads: T[],
  filters: {
    mediaType: MediaTypeFilter
    daysActive: DaysActiveFilter
    status: StatusFilter
  }
): T[] {
  return ads.filter((ad) => {
    // Media type filter
    if (filters.mediaType !== 'all' && ad.mediaType !== filters.mediaType) {
      return false
    }

    // Days active filter
    if (filters.daysActive !== 'all') {
      const days = ad.daysActive
      switch (filters.daysActive) {
        case '0-7':
          if (days > 7) return false
          break
        case '7-30':
          if (days < 7 || days > 30) return false
          break
        case '30-90':
          if (days < 30 || days > 90) return false
          break
        case '90+':
          if (days < 90) return false
          break
      }
    }

    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'active' && !ad.isActive) return false
      if (filters.status === 'inactive' && ad.isActive) return false
    }

    return true
  })
}
