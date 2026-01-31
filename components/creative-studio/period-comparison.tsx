'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PeriodData {
  roas: number
  ctr: number
  cpm: number
  thumbstopRate?: number
  holdRate?: number
}

interface PeriodComparisonProps {
  earlyPeriod: PeriodData
  recentPeriod: PeriodData
}

export function PeriodComparison({ earlyPeriod, recentPeriod }: PeriodComparisonProps) {
  // Calculate percentage changes
  const calculateChange = (early: number, recent: number) => {
    if (early === 0) return recent > 0 ? 100 : 0
    return ((recent - early) / early) * 100
  }

  const hasVideoData = (earlyPeriod.thumbstopRate !== undefined && earlyPeriod.thumbstopRate !== null) ||
    (recentPeriod.thumbstopRate !== undefined && recentPeriod.thumbstopRate !== null)

  const changes: Record<string, number> = {
    roas: calculateChange(earlyPeriod.roas, recentPeriod.roas),
    ctr: calculateChange(earlyPeriod.ctr, recentPeriod.ctr),
    cpm: calculateChange(earlyPeriod.cpm, recentPeriod.cpm),
  }

  // For ROAS, CTR, Thumbstop, Hold: higher is better. For CPM, lower is better.
  const isPositive: Record<string, boolean> = {
    roas: changes.roas >= 0,
    ctr: changes.ctr >= 0,
    cpm: changes.cpm <= 0, // Lower CPM is good
  }

  if (hasVideoData) {
    changes.thumbstopRate = calculateChange(earlyPeriod.thumbstopRate || 0, recentPeriod.thumbstopRate || 0)
    changes.holdRate = calculateChange(earlyPeriod.holdRate || 0, recentPeriod.holdRate || 0)
    isPositive.thumbstopRate = changes.thumbstopRate >= 0
    isPositive.holdRate = changes.holdRate >= 0
  }

  const metrics: Array<{ key: string; label: string; format: (v: number) => string; suffix: string }> = [
    { key: 'roas', label: 'ROAS', format: (v: number) => v.toFixed(2), suffix: 'x' },
    { key: 'ctr', label: 'CTR', format: (v: number) => v.toFixed(2), suffix: '%' },
    { key: 'cpm', label: 'CPM', format: (v: number) => `$${v.toFixed(2)}`, suffix: '' },
  ]

  if (hasVideoData) {
    metrics.push(
      { key: 'thumbstopRate', label: 'Thumbstop', format: (v: number) => v.toFixed(1), suffix: '%' },
      { key: 'holdRate', label: 'Hold Rate', format: (v: number) => v.toFixed(1), suffix: '%' },
    )
  }

  return (
    <div className="bg-bg-card rounded-xl p-4">
      {/* Title provided by parent Section wrapper */}

      <div className="grid grid-cols-2 gap-4">
        {/* Early Period */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            First 7 Days
          </div>
          {metrics.map((metric, index) => {
            const val = (earlyPeriod as unknown as Record<string, number | undefined>)[metric.key] ?? 0
            return (
              <motion.div
                key={metric.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex justify-between items-center"
              >
                <span className="text-xs text-zinc-500">{metric.label}</span>
                <span className="text-sm font-mono text-white">
                  {metric.format(val)}{metric.suffix}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* Recent Period */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Last 7 Days
          </div>
          {metrics.map((metric, index) => {
            const val = (recentPeriod as unknown as Record<string, number | undefined>)[metric.key] ?? 0
            const change = changes[metric.key]
            const positive = isPositive[metric.key]

            return (
              <motion.div
                key={metric.key}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex justify-between items-center"
              >
                <span className="text-xs text-zinc-500">{metric.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-white">
                    {metric.format(val)}{metric.suffix}
                  </span>
                  {change !== 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className={cn(
                        'flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded',
                        positive
                          ? 'text-verdict-scale bg-verdict-scale/10'
                          : 'text-verdict-kill bg-verdict-kill/10'
                      )}
                    >
                      {positive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>{Math.abs(change).toFixed(0)}%</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
