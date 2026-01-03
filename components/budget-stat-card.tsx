'use client'

import { cn } from '@/lib/utils'
import { MetaLogo, GoogleLogo } from './platform-logos'

interface BudgetStatCardProps {
  label?: string
  total: number
  meta?: {
    cbo: number
    abo: number
  } | null
  google?: number | null
  className?: string
}

export function BudgetStatCard({
  label = 'Budget',
  total,
  meta,
  google,
  className,
}: BudgetStatCardProps) {
  const formatCurrency = (val: number): string => {
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }

  const hasMeta = meta && (meta.cbo > 0 || meta.abo > 0)
  const hasGoogle = google !== null && google !== undefined && google > 0

  return (
    <div
      className={cn(
        'rounded-xl p-4 lg:p-5',
        'bg-bg-card border border-border',
        'flex flex-col min-h-[140px]',
        className
      )}
    >
      {/* Label */}
      <span className="text-[10px] lg:text-[11px] text-zinc-500 uppercase tracking-widest mb-2">
        {label}
      </span>

      {/* Hero Value */}
      <div className="flex-1">
        <span className="text-2xl lg:text-3xl font-bold font-mono text-white">
          {formatCurrency(total)}/day
        </span>
      </div>

      {/* Platform Breakdown - always show both M: and G: */}
      <div className="flex flex-col gap-2 pt-3 mt-auto border-t border-border/50">
        {/* Meta with CBO/ABO */}
        <div className="flex items-center gap-2">
          <MetaLogo size="sm" />
          {hasMeta ? (
            <div className="flex items-center gap-3">
              {meta!.cbo > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-600">CBO</span>
                  <span className="text-xs font-mono text-zinc-400">{formatCurrency(meta!.cbo)}</span>
                </div>
              )}
              {meta!.abo > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-600">ABO</span>
                  <span className="text-xs font-mono text-zinc-400">{formatCurrency(meta!.abo)}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs font-mono text-zinc-400">—</span>
          )}
        </div>

        {/* Google */}
        <div className="flex items-center gap-2">
          <GoogleLogo size="sm" />
          <span className="text-xs font-mono text-zinc-400">
            {hasGoogle ? formatCurrency(google!) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
