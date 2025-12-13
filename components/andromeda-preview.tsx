'use client'

import { Brain, ChevronRight, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AndromedaScoreResult, AndromedaFactor, getScoreColor, getScoreBgColor } from '@/lib/andromeda-score'

type AndromedaPreviewProps = {
  score: AndromedaScoreResult | null
  isLoading?: boolean
  onViewAudit: () => void
}

const FACTOR_LABELS: Record<AndromedaFactor, string> = {
  cbo: 'CBO',
  creative: 'Creatives',
  adsets: 'Structure',
  learning: 'Learning',
  stability: 'Scaling'
}

export function AndromedaPreview({ score, isLoading, onViewAudit }: AndromedaPreviewProps) {
  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-5 mb-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-bg-dark" />
          <div className="h-5 w-48 bg-bg-dark rounded" />
        </div>
        <div className="h-20 bg-bg-dark rounded-lg" />
      </div>
    )
  }

  if (!score) {
    return null
  }

  const criticalCount = score.issues.filter(i => i.severity === 'critical').length
  const warningCount = score.issues.filter(i => i.severity === 'warning').length

  // Generate insight message based on score and issues
  const getInsightMessage = () => {
    if (score.totalScore >= 90) {
      return "Your account structure is optimized for Meta's algorithm"
    } else if (score.totalScore >= 70) {
      if (criticalCount > 0) {
        return `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} may be limiting your performance`
      }
      return "Good structure with minor improvements possible"
    } else if (score.totalScore >= 50) {
      return "Your account structure may be costing you 10-20% in efficiency"
    } else {
      return "Critical structure issues are likely hurting your ROAS significantly"
    }
  }

  // Get factor status icon
  const getFactorIcon = (factorScore: number) => {
    if (factorScore >= 80) {
      return <CheckCircle className="w-3.5 h-3.5 text-verdict-scale" />
    } else if (factorScore >= 50) {
      return <AlertTriangle className="w-3.5 h-3.5 text-verdict-watch" />
    } else {
      return <AlertCircle className="w-3.5 h-3.5 text-verdict-kill" />
    }
  }

  return (
    <div className="bg-bg-card border border-purple-500/20 rounded-xl p-6 mb-6 relative overflow-hidden h-full flex flex-col">
      {/* Subtle purple gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none" />

      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Andromeda Health</h3>
              <p className="text-sm text-zinc-500">Account structure analysis</p>
            </div>
          </div>

          <button
            onClick={onViewAudit}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition-colors"
          >
            View Audit
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Main Content - fills space */}
        <div className="flex-1 flex flex-col justify-between py-2">
          {/* Score + Label + Message Row */}
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Score Circle - smaller on mobile */}
            <div className="relative flex-shrink-0">
              <svg className="w-20 h-20 sm:w-32 sm:h-32 transform -rotate-90">
                <circle
                  cx="50%"
                  cy="50%"
                  r="40%"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-bg-dark"
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r="40%"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${score.totalScore * 2.51} 251`}
                  strokeLinecap="round"
                  className={getScoreColor(score.totalScore)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn('text-2xl sm:text-4xl font-bold font-mono', getScoreColor(score.totalScore))}>
                  {score.totalScore}
                </span>
                <span className="text-[10px] sm:text-xs text-zinc-500">/ 100</span>
              </div>
            </div>

            {/* Label + Insight */}
            <div className="flex-1 min-w-0">
              <div className={cn(
                'inline-block px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold mb-2',
                score.totalScore >= 90 ? 'bg-verdict-scale/20 text-verdict-scale' :
                score.totalScore >= 70 ? 'bg-verdict-watch/20 text-verdict-watch' :
                score.totalScore >= 50 ? 'bg-orange-500/20 text-orange-400' :
                'bg-verdict-kill/20 text-verdict-kill'
              )}>
                {score.label}
              </div>
              <p className="text-xs sm:text-sm text-zinc-300">{getInsightMessage()}</p>

              {/* Issue counts */}
              {(criticalCount > 0 || warningCount > 0) && (
                <div className="flex items-center gap-2 sm:gap-3 mt-2">
                  {criticalCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-verdict-kill">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {criticalCount} critical
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-verdict-watch">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {warningCount} warning{warningCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Factor Mini-Gauges - at bottom, scrollable on mobile */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4 sm:mt-0">
            {(Object.entries(score.factors) as [AndromedaFactor, typeof score.factors.cbo][]).map(([key, factor]) => {
              // Skip factors with 0 weight
              if (factor.weight === 0) {
                return (
                  <div key={key} className="bg-bg-dark/50 rounded-lg p-2 text-center opacity-50">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                      {FACTOR_LABELS[key]}
                    </div>
                    <div className="text-sm font-mono text-zinc-500">N/A</div>
                  </div>
                )
              }

              return (
                <div key={key} className="bg-bg-dark/50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                    {FACTOR_LABELS[key]}
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn('text-sm font-mono font-semibold', getScoreColor(factor.score))}>
                      {factor.score}
                    </span>
                    {getFactorIcon(factor.score)}
                  </div>
                  {/* Mini progress bar */}
                  <div className="h-1 bg-bg-hover rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', getScoreBgColor(factor.score))}
                      style={{ width: `${factor.score}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
