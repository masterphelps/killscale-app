'use client'

import { cn } from '@/lib/utils'
import type { AudiencePerformance, FatigueStatus } from './types'

interface AudienceBreakdownProps {
  audiences: AudiencePerformance[]
}

const fatigueStatusConfig: Record<FatigueStatus, { label: string; className: string }> = {
  fresh: {
    label: 'Fresh',
    className: 'bg-cyan-500/20 text-cyan-400',
  },
  healthy: {
    label: 'Healthy',
    className: 'bg-verdict-scale/20 text-verdict-scale',
  },
  warning: {
    label: 'Warning',
    className: 'bg-verdict-watch/20 text-verdict-watch',
  },
  fatiguing: {
    label: 'Fatiguing',
    className: 'bg-orange-500/20 text-orange-400',
  },
  fatigued: {
    label: 'Fatigued',
    className: 'bg-verdict-kill/20 text-verdict-kill',
  },
}

export function AudienceBreakdown({ audiences }: AudienceBreakdownProps) {
  // Sort by ROAS descending
  const sortedAudiences = [...audiences].sort((a, b) => b.roas - a.roas)

  if (sortedAudiences.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl p-4">
        <h4 className="text-sm font-medium text-zinc-400 mb-4">Audience Breakdown</h4>
        <p className="text-sm text-zinc-500 text-center py-4">No audience data available</p>
      </div>
    )
  }

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <h4 className="text-sm font-medium text-zinc-400 mb-4">Audience Breakdown</h4>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Ad Set
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                ROAS
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Spend
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Fatigue
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAudiences.map((audience) => {
              const statusConfig = fatigueStatusConfig[audience.fatigueStatus]

              return (
                <tr
                  key={audience.adsetId}
                  className="border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors"
                >
                  <td className="py-2.5 px-2">
                    <span className="text-white font-medium truncate block max-w-[200px]" title={audience.adsetName}>
                      {audience.adsetName}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className={cn(
                      'font-mono',
                      audience.roas >= 2 ? 'text-verdict-scale' :
                      audience.roas >= 1 ? 'text-verdict-watch' :
                      'text-verdict-kill'
                    )}>
                      {audience.roas.toFixed(2)}x
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className="text-zinc-300 font-mono">
                      ${audience.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded-full text-xs font-medium',
                      statusConfig.className
                    )}>
                      {statusConfig.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
