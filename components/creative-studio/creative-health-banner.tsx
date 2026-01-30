'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Layers, Activity, Zap, Clock, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CreativeHealthScore } from './types'

interface CreativeHealthBannerProps {
  healthScore: CreativeHealthScore
  className?: string
}

const statusColors = {
  excellent: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    badge: 'bg-green-500/20 text-green-400',
    progress: 'bg-green-500',
    text: 'text-green-400',
  },
  good: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-400',
    progress: 'bg-blue-500',
    text: 'text-blue-400',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-400',
    progress: 'bg-amber-500',
    text: 'text-amber-400',
  },
  critical: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-400',
    progress: 'bg-red-500',
    text: 'text-red-400',
  },
}

const factorIcons = {
  diversity: Layers,
  fatigue: Activity,
  winnerHealth: Zap,
  freshPipeline: Clock,
}

const factorLabels = {
  diversity: 'Diversity',
  fatigue: 'Fatigue',
  winnerHealth: 'Winner Health',
  freshPipeline: 'Fresh Pipeline',
}

function ProgressBar({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', colorClass)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function getScoreColor(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export function CreativeHealthBanner({ healthScore, className }: CreativeHealthBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const colors = statusColors[healthScore.status]

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        colors.bg,
        colors.border,
        className
      )}
    >
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-4">
          {/* Score display */}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{healthScore.score}</span>
            <span className="text-sm text-zinc-500">/100</span>
          </div>

          {/* Status badge */}
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium uppercase', colors.badge)}>
            {healthScore.status}
          </span>

          <span className="text-sm text-zinc-400 hidden sm:inline">
            Creative Health Score
          </span>
        </div>

        <ChevronDown
          className={cn(
            'w-5 h-5 text-zinc-400 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Divider */}
              <div className="h-px bg-zinc-800" />

              {/* Factor breakdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(healthScore.factors).map(([key, factor]) => {
                  const factorKey = key as keyof typeof factorIcons
                  const Icon = factorIcons[factorKey]
                  const label = factorLabels[factorKey]

                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-zinc-400" />
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                        <span className="text-sm font-bold">{factor.score}</span>
                      </div>
                      <ProgressBar value={factor.score} colorClass={getScoreColor(factor.score)} />
                      <p className="text-xs text-zinc-500">{factor.detail}</p>
                    </div>
                  )
                })}
              </div>

              {/* Recommendations */}
              {healthScore.recommendations.length > 0 && (
                <>
                  <div className="h-px bg-zinc-800" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      <span>Recommendations</span>
                    </div>
                    <ul className="space-y-1.5">
                      {healthScore.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                          <span className="text-zinc-600 mt-0.5">-</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
