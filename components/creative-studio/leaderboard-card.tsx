'use client'

import { cn } from '@/lib/utils'

interface LeaderboardCardProps {
  rank: number
  title: string
  subtitle?: string
  thumbnailUrl?: string | null
  mediaType?: 'image' | 'video'
  metrics: { label: string; value: string }[]
  score: number | null
  scoreLabel: string
  scoreColor: string  // tailwind bg class like 'bg-emerald-500'
}

const rankColors: Record<number, string> = {
  1: 'from-amber-500 to-amber-600',
  2: 'from-zinc-300 to-zinc-400',
  3: 'from-amber-700 to-amber-800',
}

export function LeaderboardCard({
  rank,
  title,
  subtitle,
  thumbnailUrl,
  mediaType,
  metrics,
  score,
  scoreLabel,
  scoreColor,
}: LeaderboardCardProps) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 flex gap-4 items-start">
      {/* Rank badge */}
      <div className={cn(
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
        rank <= 3
          ? `bg-gradient-to-br ${rankColors[rank] || 'from-zinc-600 to-zinc-700'} text-white`
          : 'bg-zinc-800 text-zinc-400'
      )}>
        {rank}
      </div>

      {/* Thumbnail */}
      {thumbnailUrl && (
        <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-zinc-900 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
          {mediaType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-white truncate">{title}</h4>
        {subtitle && <p className="text-xs text-zinc-500 truncate mt-0.5">{subtitle}</p>}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {metrics.map((m, i) => (
            <span key={i} className="text-xs text-zinc-400">
              <span className="text-zinc-500">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      </div>

      {/* Score badge */}
      {score !== null && (
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white',
            score >= 75 ? 'bg-emerald-500/20 text-emerald-400' :
            score >= 50 ? 'bg-amber-500/20 text-amber-400' :
            score >= 25 ? 'bg-orange-500/20 text-orange-400' :
            'bg-red-500/20 text-red-400'
          )}>
            {score}
          </div>
          <span className="text-[10px] text-zinc-500">{scoreLabel}</span>
        </div>
      )}
    </div>
  )
}
