'use client'

import { cn } from '@/lib/utils'
import { Gift } from 'lucide-react'
import { MetaLogo, GoogleLogo } from './platform-logos'

interface PrimaryStatCardProps {
  label: string
  value: string | number
  prefix?: string
  suffix?: string
  subtitle?: string
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
        <span className="text-2xl lg:text-3xl font-bold font-mono text-white">
          {prefix}{formattedValue}{suffix}
        </span>
        {subtitle && (
          <p className="text-[10px] lg:text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
      </div>

      {/* Platform Breakdown - only show when platforms prop is provided */}
      {platforms && (
        <div className="flex flex-col gap-2 pt-3 mt-auto border-t border-border/50">
          {/* Row 1: Meta and Google */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <MetaLogo size="sm" />
              <span className="text-xs font-mono text-zinc-400">
                {formatPlatformValue(platforms.meta, !!prefix)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <GoogleLogo size="sm" />
              <span className="text-xs font-mono text-zinc-400">
                {formatPlatformValue(platforms.google, !!prefix)}
              </span>
            </div>
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
