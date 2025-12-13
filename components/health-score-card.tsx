'use client'

import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HealthScoreResult, getHealthScoreColor, getHealthScoreBgColor } from '@/lib/health-score'

type HealthScoreCardProps = {
  score: HealthScoreResult | null
  isLoading?: boolean
}

export function HealthScoreCard({ score, isLoading }: HealthScoreCardProps) {
  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-bg-dark" />
          <div className="h-5 w-32 bg-bg-dark rounded" />
        </div>
        <div className="flex justify-center mb-4">
          <div className="w-32 h-32 rounded-full bg-bg-dark" />
        </div>
        <div className="h-4 w-24 mx-auto bg-bg-dark rounded" />
      </div>
    )
  }

  if (!score) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Health Score</h3>
            <p className="text-sm text-zinc-500">Performance analysis</p>
          </div>
        </div>
        <div className="text-center text-zinc-500 py-8">
          No data available
        </div>
      </div>
    )
  }

  // Get insight message based on score
  const getInsightMessage = () => {
    if (score.totalScore >= 85) {
      return "Your account is performing at peak efficiency"
    } else if (score.totalScore >= 65) {
      return "Good performance with room for optimization"
    } else if (score.totalScore >= 45) {
      return "Performance issues need attention"
    } else {
      return "Critical performance problems detected"
    }
  }

  // Get trend icon
  const getTrendIcon = () => {
    if (score.trend.direction === 'improving') {
      return <TrendingUp className="w-4 h-4 text-verdict-scale" />
    } else if (score.trend.direction === 'declining') {
      return <TrendingDown className="w-4 h-4 text-verdict-kill" />
    }
    return <Minus className="w-4 h-4 text-zinc-400" />
  }

  return (
    <div className="bg-bg-card border border-cyan-500/20 rounded-xl p-6 relative overflow-hidden">
      {/* Subtle cyan gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Health Score</h3>
            <p className="text-sm text-zinc-500">Performance analysis</p>
          </div>
        </div>

        {/* Score Circle */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-bg-dark"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={`${score.totalScore * 3.52} 352`}
                strokeLinecap="round"
                className={getHealthScoreColor(score.totalScore)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-4xl font-bold font-mono', getHealthScoreColor(score.totalScore))}>
                {score.totalScore}
              </span>
              <span className="text-xs text-zinc-500">/ 100</span>
            </div>
          </div>
        </div>

        {/* Label Badge */}
        <div className="flex justify-center mb-4">
          <span className={cn(
            'inline-block px-3 py-1 rounded-full text-sm font-semibold',
            score.totalScore >= 85 ? 'bg-verdict-scale/20 text-verdict-scale' :
            score.totalScore >= 65 ? 'bg-verdict-watch/20 text-verdict-watch' :
            score.totalScore >= 45 ? 'bg-amber-500/20 text-amber-400' :
            'bg-verdict-kill/20 text-verdict-kill'
          )}>
            {score.label}
          </span>
        </div>

        {/* Insight Message */}
        <p className="text-sm text-zinc-400 text-center mb-4">
          {getInsightMessage()}
        </p>

        {/* Trend Indicator */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 pt-4 border-t border-border">
          <div className="flex items-center gap-1">
            {getTrendIcon()}
            <span className={cn(
              'text-sm font-medium',
              score.trend.direction === 'improving' ? 'text-verdict-scale' :
              score.trend.direction === 'declining' ? 'text-verdict-kill' :
              'text-zinc-400'
            )}>
              {score.trend.direction === 'improving'
                ? `ROAS up ${score.trend.changePercent.toFixed(1)}%`
                : score.trend.direction === 'declining'
                ? `ROAS down ${Math.abs(score.trend.changePercent).toFixed(1)}%`
                : 'ROAS stable'}
            </span>
          </div>
          <span className="text-xs text-zinc-500">vs previous</span>
        </div>
      </div>
    </div>
  )
}
