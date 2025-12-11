'use client'

import { DollarSign, Image, PiggyBank, TrendingUp, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HealthScoreResult, HealthFactor, getHealthScoreColor, getHealthScoreBgColor } from '@/lib/health-score'

type HealthScoreBreakdownProps = {
  score: HealthScoreResult | null
  isLoading?: boolean
}

const FACTOR_CONFIG: Record<HealthFactor, { label: string; icon: React.ReactNode; description: string }> = {
  budgetEfficiency: {
    label: 'Budget Efficiency',
    icon: <DollarSign className="w-4 h-4" />,
    description: 'Spend on profitable ads'
  },
  creativeHealth: {
    label: 'Creative Health',
    icon: <Image className="w-4 h-4" />,
    description: 'Fatigue detection'
  },
  profitability: {
    label: 'Profitability',
    icon: <PiggyBank className="w-4 h-4" />,
    description: 'Overall ROAS'
  },
  trendDirection: {
    label: 'Trend',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Performance trajectory'
  }
}

export function HealthScoreBreakdown({ score, isLoading }: HealthScoreBreakdownProps) {
  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-5 w-40 bg-bg-dark rounded mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-bg-dark rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!score) {
    return null
  }

  const getFactorIcon = (percentage: number) => {
    if (percentage >= 80) {
      return <CheckCircle className="w-4 h-4 text-verdict-scale" />
    } else if (percentage >= 50) {
      return <AlertTriangle className="w-4 h-4 text-verdict-watch" />
    } else {
      return <AlertCircle className="w-4 h-4 text-verdict-kill" />
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-6">
      <h3 className="font-semibold text-white mb-4">Factor Breakdown</h3>

      <div className="space-y-3">
        {(Object.entries(score.factors) as [HealthFactor, typeof score.factors.budgetEfficiency][]).map(([key, factor]) => {
          const config = FACTOR_CONFIG[key]
          if (!config) return null // Skip unknown factors
          const percentage = (factor.score / factor.maxPoints) * 100

          return (
            <div
              key={key}
              className="bg-bg-dark/50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    percentage >= 80 ? 'bg-verdict-scale/20 text-verdict-scale' :
                    percentage >= 50 ? 'bg-verdict-watch/20 text-verdict-watch' :
                    'bg-verdict-kill/20 text-verdict-kill'
                  )}>
                    {config.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{config.label}</div>
                    <div className="text-xs text-zinc-500">{config.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-lg font-bold font-mono',
                    getHealthScoreColor(percentage)
                  )}>
                    {factor.score}
                  </span>
                  <span className="text-sm text-zinc-500">/ {factor.maxPoints}</span>
                  {getFactorIcon(percentage)}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-bg-hover rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    percentage >= 85 ? 'bg-verdict-scale' :
                    percentage >= 65 ? 'bg-verdict-watch' :
                    percentage >= 45 ? 'bg-amber-500' :
                    'bg-verdict-kill'
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {/* Details */}
              <div className="mt-2 text-xs text-zinc-400">
                {factor.details}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
