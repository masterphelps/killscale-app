'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Gift } from 'lucide-react'
import { MetaLogo, GoogleLogo } from './platform-logos'

interface AttributionSplit {
  primaryLabel: string
  primaryValue: string
  primaryColor: string
  secondaryLabel: string
  secondaryValue: string
  barPercent?: number
  barPrimaryColor?: string
  barSecondaryColor?: string
}

interface PrimaryStatCardProps {
  label: string
  value: string | number
  prefix?: string
  suffix?: string
  subtitle?: string
  badge?: { icon: ReactNode; text: string }
  attributionSplit?: AttributionSplit
  platforms?: {
    meta: string | number | null
    google: string | number | null
    affiliate?: string | number | null
  }
  className?: string
}

export function PrimaryStatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  subtitle,
  badge,
  attributionSplit,
  platforms,
  className,
}: PrimaryStatCardProps) {
  const formatValue = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'number') {
      return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
    }
    return val
  }

  const formattedValue = formatValue(value)

  const formatPlatformValue = (val: string | number | null, addPrefix = false): string => {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'number') {
      const formatted = val.toLocaleString(undefined, { maximumFractionDigits: val % 1 === 0 ? 0 : 2 })
      return addPrefix && prefix ? `${prefix}${formatted}` : formatted
    }
    return val
  }

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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl lg:text-3xl font-bold font-mono text-white">
            {prefix}{formattedValue}{suffix}
          </span>
          {badge && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-border/50">
              {badge.icon}
              <span className="text-[10px] text-zinc-400">{badge.text}</span>
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[10px] lg:text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
      </div>

      {/* Attribution Split - shows attributed vs organic breakdown */}
      {attributionSplit && (
        <div className="flex flex-col gap-1.5 mt-2">
          {/* Split bar (Revenue card only) */}
          {attributionSplit.barPercent !== undefined && (
            <div className="flex w-full h-[3px] rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-l-full', attributionSplit.barPrimaryColor || 'bg-emerald-500')}
                style={{ width: `${Math.max(attributionSplit.barPercent, 2)}%` }}
              />
              <div
                className={cn('h-full rounded-r-full', attributionSplit.barSecondaryColor || 'bg-zinc-600')}
                style={{ width: `${Math.max(100 - attributionSplit.barPercent, 2)}%` }}
              />
            </div>
          )}
          {/* Inline label+value pairs */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full', attributionSplit.barPrimaryColor || 'bg-emerald-500')} />
              <span className="text-[10px] text-zinc-500">{attributionSplit.primaryLabel}</span>
              <span className={cn('text-[11px] font-mono font-medium', attributionSplit.primaryColor)}>
                {attributionSplit.primaryValue}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full', attributionSplit.barSecondaryColor || 'bg-zinc-600')} />
              <span className="text-[10px] text-zinc-500">{attributionSplit.secondaryLabel}</span>
              <span className="text-[11px] font-mono font-medium text-zinc-400">
                {attributionSplit.secondaryValue}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Platform Breakdown - only show when platforms prop is provided and at least one has data */}
      {platforms && (platforms.meta !== null || platforms.google !== null || (platforms.affiliate !== undefined && platforms.affiliate !== null)) && (
        <div className="flex flex-col gap-2 pt-3 mt-auto border-t border-border/50">
          {/* Row 1: Meta and Google (only show platforms with data) */}
          <div className="flex items-center gap-4">
            {platforms.meta !== null && (
              <div className="flex items-center gap-1.5">
                <MetaLogo size="sm" />
                <span className="text-xs font-mono text-zinc-400">
                  {formatPlatformValue(platforms.meta, !!prefix)}
                </span>
              </div>
            )}
            {platforms.google !== null && (
              <div className="flex items-center gap-1.5">
                <GoogleLogo size="sm" />
                <span className="text-xs font-mono text-zinc-400">
                  {formatPlatformValue(platforms.google, !!prefix)}
                </span>
              </div>
            )}
          </div>

          {/* Row 2: Affiliate (only if present) */}
          {platforms.affiliate !== undefined && platforms.affiliate !== null && (
            <div className="flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-mono text-zinc-400">
                {formatPlatformValue(platforms.affiliate, !!prefix)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
