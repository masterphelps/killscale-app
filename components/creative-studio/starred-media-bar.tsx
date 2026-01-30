'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Star, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarredMediaBarProps {
  starredCount: number
  onBuildAds: () => void
  onClear: () => void
  className?: string
}

export function StarredMediaBar({
  starredCount,
  onBuildAds,
  onClear,
  className,
}: StarredMediaBarProps) {
  return (
    <AnimatePresence>
      {starredCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-4 px-4 py-3',
            'bg-zinc-900/95 backdrop-blur-lg border border-zinc-700 rounded-2xl shadow-2xl',
            className
          )}
        >
          {/* Star count */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <span className="text-sm font-medium">
              <span className="text-white">{starredCount}</span>
              <span className="text-zinc-400 ml-1">starred</span>
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-zinc-700" />

          {/* Build Ads button */}
          <button
            onClick={onBuildAds}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl',
              'bg-accent hover:bg-accent/90',
              'text-white text-sm font-medium',
              'transition-colors'
            )}
          >
            <Sparkles className="w-4 h-4" />
            <span>Build Ads from {starredCount} Starred</span>
          </button>

          {/* Clear button */}
          <button
            onClick={onClear}
            className={cn(
              'flex items-center gap-1 px-3 py-2 rounded-xl',
              'bg-zinc-800 hover:bg-zinc-700',
              'text-zinc-400 hover:text-white text-sm',
              'transition-colors'
            )}
          >
            <X className="w-4 h-4" />
            <span>Clear</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
