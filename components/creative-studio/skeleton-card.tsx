'use client'

import { motion } from 'framer-motion'

interface SkeletonCardProps {
  index: number
}

export function SkeletonCard({ index }: SkeletonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl overflow-hidden bg-bg-card border border-border"
    >
      {/* Media skeleton */}
      <div className="aspect-[4/3] bg-gradient-to-br from-zinc-800 to-zinc-900 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Content skeleton */}
      <div className="p-4 space-y-3">
        {/* ROAS badge and spend amount */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-20 rounded-lg bg-zinc-800 animate-pulse" />
          <div className="h-5 w-16 rounded bg-zinc-800 animate-pulse" />
        </div>

        {/* Headline text */}
        <div className="h-4 w-3/4 rounded bg-zinc-800 animate-pulse" />

        {/* Bottom row: stats and buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="h-4 w-24 rounded bg-zinc-800 animate-pulse" />
          <div className="flex gap-1">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 animate-pulse" />
            <div className="h-8 w-8 rounded-lg bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
