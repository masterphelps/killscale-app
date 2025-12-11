'use client'

import { useState } from 'react'
import { Brain, ChevronRight, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AndromedaScoreResult, getScoreColor, getScoreBgColor, getScoreBadgeClasses } from '@/lib/andromeda-score'
import { AndromedaAuditModal } from './andromeda-audit-modal'

type AndromedaScoreCardProps = {
  score: AndromedaScoreResult | null
  isLoading?: boolean
}

export function AndromedaScoreCard({ score, isLoading }: AndromedaScoreCardProps) {
  const [showAudit, setShowAudit] = useState(false)

  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-bg-hover rounded" />
          <div className="h-4 bg-bg-hover rounded w-32" />
        </div>
        <div className="flex items-end gap-3 mb-3">
          <div className="h-10 bg-bg-hover rounded w-16" />
          <div className="h-6 bg-bg-hover rounded w-12" />
        </div>
        <div className="h-2 bg-bg-hover rounded-full" />
      </div>
    )
  }

  if (!score) {
    return null
  }

  const criticalCount = score.issues.filter(i => i.severity === 'critical').length
  const warningCount = score.issues.filter(i => i.severity === 'warning').length

  return (
    <>
      <button
        onClick={() => setShowAudit(true)}
        className="w-full bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors text-left group"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium text-zinc-300">Andromeda Score</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
        </div>

        {/* Score Display */}
        <div className="flex items-end gap-3 mb-3">
          <div className={cn('text-4xl font-bold font-mono', getScoreColor(score.totalScore))}>
            {score.totalScore}
          </div>
          <div className="text-zinc-500 text-lg mb-1">/100</div>
          <div className={cn(
            'ml-auto px-2 py-1 rounded text-xs font-semibold',
            getScoreBadgeClasses(score.totalScore)
          )}>
            {score.label}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-bg-dark rounded-full overflow-hidden mb-3">
          <div
            className={cn('h-full rounded-full transition-all', getScoreBgColor(score.totalScore))}
            style={{ width: `${score.totalScore}%` }}
          />
        </div>

        {/* Issues Summary */}
        <div className="flex items-center gap-3 text-xs">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1 text-verdict-kill">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{criticalCount} critical</span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1 text-verdict-watch">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{warningCount} warning{warningCount > 1 ? 's' : ''}</span>
            </div>
          )}
          {criticalCount === 0 && warningCount === 0 && (
            <div className="flex items-center gap-1 text-verdict-scale">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>All checks passing</span>
            </div>
          )}
        </div>
      </button>

      {/* Full Audit Modal */}
      <AndromedaAuditModal
        isOpen={showAudit}
        onClose={() => setShowAudit(false)}
        score={score}
      />
    </>
  )
}
