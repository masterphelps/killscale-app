'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

type StarButtonProps = {
  isStarred: boolean
  onToggle: () => Promise<void>
  className?: string
}

export function StarButton({ isStarred, onToggle, className }: StarButtonProps) {
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

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-lg border transition-all flex-shrink-0',
        loading && 'opacity-50 cursor-wait',
        isStarred
          ? 'border-yellow-500/50 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
          : 'border-zinc-600 text-zinc-500 hover:border-yellow-500/30 hover:text-yellow-500/70 hover:bg-yellow-500/10',
        className
      )}
      title={isStarred ? 'Unstar ad' : 'Star ad for Performance Set'}
    >
      <Star
        className={cn(
          'w-4 h-4 transition-all',
          loading && 'animate-pulse',
          isStarred && 'fill-yellow-500'
        )}
      />
    </button>
  )
}
