'use client'

import { Star, Play, ChevronUp, ChevronDown, Image, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioAsset, FatigueStatus } from './types'

interface MediaTableProps {
  items: StudioAsset[]
  isLoading: boolean
  sortField: string
  sortDirection: 'asc' | 'desc'
  onSort: (field: string) => void
  onSelect: (id: string) => void
  onStar: (id: string) => void
  starredIds: Set<string>
}

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-600'
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  if (score >= 25) return 'text-orange-400'
  return 'text-red-400'
}

function getFatigueColor(status: FatigueStatus): string {
  const colors: Record<FatigueStatus, string> = {
    fresh: 'text-emerald-400',
    healthy: 'text-lime-400',
    warning: 'text-amber-400',
    fatiguing: 'text-orange-400',
    fatigued: 'text-red-400',
  }
  return colors[status]
}

function getFatigueLabel(status: FatigueStatus): string {
  const labels: Record<FatigueStatus, string> = {
    fresh: 'Fresh',
    healthy: 'Healthy',
    warning: 'Warning',
    fatiguing: 'Fatiguing',
    fatigued: 'Fatigued',
  }
  return labels[status]
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function SortIcon({ field, sortField, sortDirection }: { field: string; sortField: string; sortDirection: 'asc' | 'desc' }) {
  if (field !== sortField) return null
  return sortDirection === 'desc'
    ? <ChevronDown className="w-3 h-3 text-accent" />
    : <ChevronUp className="w-3 h-3 text-accent" />
}

function ScoreCell({ score }: { score: number | null }) {
  return (
    <span className={cn('font-mono text-sm font-semibold', getScoreColor(score))}>
      {score !== null ? score : '--'}
    </span>
  )
}

interface ColumnDef {
  key: string
  label: string
  hideClass?: string
  width: string
  align?: 'center' | 'left' | 'right'
}

const columns: ColumnDef[] = [
  { key: 'star', label: '', width: 'w-9' },
  { key: 'thumbnail', label: '', width: 'w-10' },
  { key: 'name', label: 'Name', width: 'flex-1 min-w-[180px]', align: 'left' },
  { key: 'hookScore', label: 'Hook', width: 'w-14', hideClass: 'hidden lg:flex', align: 'center' },
  { key: 'holdScore', label: 'Hold', width: 'w-14', hideClass: 'hidden lg:flex', align: 'center' },
  { key: 'clickScore', label: 'Click', width: 'w-14', hideClass: 'hidden lg:flex', align: 'center' },
  { key: 'convertScore', label: 'Conv', width: 'w-14', hideClass: 'hidden lg:flex', align: 'center' },
  { key: 'thumbstopRate', label: 'T-stop', width: 'w-[72px]', hideClass: 'hidden xl:block', align: 'right' },
  { key: 'holdRate', label: 'Hold%', width: 'w-[72px]', hideClass: 'hidden xl:block', align: 'right' },
  { key: 'ctr', label: 'CTR', width: 'w-16', hideClass: 'hidden lg:block', align: 'right' },
  { key: 'cpc', label: 'CPC', width: 'w-16', hideClass: 'hidden lg:block', align: 'right' },
  { key: 'spend', label: 'Spend', width: 'w-[72px]', align: 'right' },
  { key: 'impressions', label: 'Impr', width: 'w-[72px]', hideClass: 'hidden lg:block', align: 'right' },
  { key: 'fatigue', label: 'Fatigue', width: 'w-[72px]', hideClass: 'hidden lg:block', align: 'center' },
  { key: 'adCount', label: 'Ads', width: 'w-12', hideClass: 'hidden xl:block', align: 'center' },
]

const sortableKeys = new Set([
  'name', 'hookScore', 'holdScore', 'clickScore', 'convertScore',
  'thumbstopRate', 'holdRate', 'ctr', 'cpc', 'spend', 'impressions',
  'fatigue', 'adCount',
])

export function MediaTable({
  items,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  onSelect,
  onStar,
  starredIds,
}: MediaTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-bg-card border border-border rounded-xl h-14 flex items-center px-4 gap-3"
          >
            <div className="w-9 h-5 bg-zinc-800 rounded" />
            <div className="w-10 h-10 bg-zinc-800 rounded-lg" />
            <div className="flex-1 h-4 bg-zinc-800 rounded max-w-[200px]" />
            <div className="hidden lg:block w-14 h-4 bg-zinc-800 rounded" />
            <div className="hidden lg:block w-14 h-4 bg-zinc-800 rounded" />
            <div className="hidden lg:block w-14 h-4 bg-zinc-800 rounded" />
            <div className="hidden lg:block w-14 h-4 bg-zinc-800 rounded" />
            <div className="w-[72px] h-4 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mb-4">
          <Image className="w-8 h-8 text-zinc-600" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No media assets</h3>
        <p className="text-sm text-zinc-500">No assets match the current filters</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header Row */}
      <div className="bg-bg-dark rounded-xl p-3 border border-border/50 flex items-center gap-3">
        {columns.map((col) => {
          const isSortable = sortableKeys.has(col.key)
          const isActive = col.key === sortField
          return (
            <div
              key={col.key}
              className={cn(
                col.width,
                col.hideClass,
                col.align === 'center' && 'justify-center',
                col.align === 'right' && 'justify-end',
                'flex items-center gap-1 flex-shrink-0',
                isSortable && 'cursor-pointer select-none hover:text-zinc-300',
              )}
              onClick={isSortable ? () => onSort(col.key) : undefined}
            >
              <span className={cn(
                'text-xs uppercase tracking-wide',
                isActive ? 'text-accent font-semibold' : 'text-zinc-500'
              )}>
                {col.label}
              </span>
              {isSortable && <SortIcon field={col.key} sortField={sortField} sortDirection={sortDirection} />}
            </div>
          )
        })}
      </div>

      {/* Data Rows */}
      {items.map((item) => {
        const isVideo = item.mediaType === 'video'
        const isStarred = starredIds.has(item.mediaHash)
        const thumbnailUrl = item.storageUrl || item.imageUrl || item.thumbnailUrl

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'bg-bg-card border border-border rounded-xl px-4 py-3',
              'hover:bg-bg-hover cursor-pointer transition-colors',
              'flex items-center gap-3'
            )}
          >
            {/* Star */}
            <div className="w-9 flex-shrink-0 flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStar(item.id)
                }}
                className={cn(
                  'p-1.5 rounded-lg transition-all duration-200',
                  isStarred
                    ? 'text-amber-400 bg-amber-500/20'
                    : 'text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10'
                )}
              >
                <Star
                  className="w-4 h-4"
                  fill={isStarred ? 'currentColor' : 'none'}
                  strokeWidth={isStarred ? 0 : 2}
                />
              </button>
            </div>

            {/* Thumbnail */}
            <div className="w-10 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-900 relative">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {isVideo ? (
                    <Film className="w-4 h-4 text-zinc-700" />
                  ) : (
                    <Image className="w-4 h-4 text-zinc-700" />
                  )}
                </div>
              )}
              {isVideo && thumbnailUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                    <Play className="w-2.5 h-2.5 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              )}
            </div>

            {/* Name + Type */}
            <div className="flex-1 min-w-[180px] min-w-0">
              <div className="text-sm text-white font-medium truncate">
                {item.name || 'Untitled'}
              </div>
              <span className={cn(
                'inline-block mt-0.5 px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wide',
                isVideo ? 'text-purple-400 bg-purple-500/15' : 'text-blue-400 bg-blue-500/15'
              )}>
                {item.mediaType}
              </span>
            </div>

            {/* Hook Score */}
            <div className="w-14 hidden lg:flex justify-center flex-shrink-0">
              <ScoreCell score={isVideo ? item.hookScore : null} />
            </div>

            {/* Hold Score */}
            <div className="w-14 hidden lg:flex justify-center flex-shrink-0">
              <ScoreCell score={isVideo ? item.holdScore : null} />
            </div>

            {/* Click Score */}
            <div className="w-14 hidden lg:flex justify-center flex-shrink-0">
              <ScoreCell score={item.clickScore} />
            </div>

            {/* Convert Score */}
            <div className="w-14 hidden lg:flex justify-center flex-shrink-0">
              <ScoreCell score={item.convertScore} />
            </div>

            {/* Thumbstop Rate */}
            <div className="w-[72px] hidden xl:block text-right flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                {item.thumbstopRate !== null ? `${item.thumbstopRate.toFixed(1)}%` : '--'}
              </span>
            </div>

            {/* Hold Rate */}
            <div className="w-[72px] hidden xl:block text-right flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                {item.holdRate !== null ? `${item.holdRate.toFixed(1)}%` : '--'}
              </span>
            </div>

            {/* CTR */}
            <div className="w-16 hidden lg:block text-right flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                {item.ctr.toFixed(2)}%
              </span>
            </div>

            {/* CPC */}
            <div className="w-16 hidden lg:block text-right flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                ${item.cpc.toFixed(2)}
              </span>
            </div>

            {/* Spend */}
            <div className="w-[72px] text-right flex-shrink-0">
              <span className="font-mono text-sm text-white">
                {formatCurrency(item.spend)}
              </span>
            </div>

            {/* Impressions */}
            <div className="w-[72px] hidden lg:block text-right flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                {formatCompact(item.impressions)}
              </span>
            </div>

            {/* Fatigue */}
            <div className="w-[72px] hidden lg:block text-center flex-shrink-0">
              {item.hasPerformanceData ? (
                <span className={cn('text-xs font-medium', getFatigueColor(item.fatigueStatus))}>
                  {getFatigueLabel(item.fatigueStatus)}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">--</span>
              )}
            </div>

            {/* Ads Count */}
            <div className="w-12 hidden xl:block text-center flex-shrink-0">
              <span className="font-mono text-xs text-zinc-400">
                {item.adCount}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
