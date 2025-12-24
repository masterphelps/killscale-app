'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

type StarButtonProps = {
  isStarred: boolean
  onToggle: () => Promise<void>
  className?: string
  starCount?: number  // How many times this creative is starred across audiences
}

export function StarButton({ isStarred, onToggle, className, starCount }: StarButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (loading) return

    setLoading(true)
    try {
      await onToggle()
    } finally {
      setLoading(false)
    }
  }

  const isUniversal = starCount && starCount >= 3

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'relative w-8 h-8 flex items-center justify-center rounded-lg border transition-all flex-shrink-0',
        loading && 'opacity-50 cursor-wait',
        isStarred
          ? isUniversal
            ? 'border-green-500/50 text-green-500 bg-green-500/10 hover:bg-green-500/20'
            : 'border-yellow-500/50 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
          : 'border-zinc-600 text-zinc-500 hover:border-yellow-500/30 hover:text-yellow-500/70 hover:bg-yellow-500/10',
        className
      )}
      title={
        isUniversal
          ? `Universal performer - starred in ${starCount} audiences`
          : isStarred
            ? starCount && starCount > 1
              ? `Starred in ${starCount} audiences`
              : 'Unstar ad'
            : 'Star ad for Performance Set'
      }
    >
      <Star
        className={cn(
          'w-4 h-4 transition-all',
          loading && 'animate-pulse',
          isStarred && (isUniversal ? 'fill-green-500' : 'fill-yellow-500')
        )}
      />
      {/* Star count badge - shows when creative is starred in multiple audiences */}
      {starCount && starCount > 1 && (
        <span
          className={cn(
            'absolute -top-1 -right-1 text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold',
            isUniversal
              ? 'bg-green-500 text-white'
              : 'bg-yellow-500 text-black'
          )}
        >
          {starCount}
        </span>
      )}
    </button>
  )
}
