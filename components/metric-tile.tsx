'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MetaLogo, GoogleLogo, ShopifyLogo } from './platform-logos'

// =============================================================================
// METRIC TILE - Modern glassmorphism-lite stat cards
// =============================================================================

interface MetricTileProps {
  label: string
  value: string | number
  prefix?: string
  suffix?: string
  subtitle?: string
  change?: number
  changeLabel?: string
  footer?: ReactNode
  size?: 'default' | 'compact'
  className?: string
}

export function MetricTile({
  label,
  value,
  prefix = '',
  suffix = '',
  subtitle,
  change,
  changeLabel,
  footer,
  size = 'default',
  className,
}: MetricTileProps) {
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value

  return (
    <div
      className={cn(
        // Structure
        'relative rounded-xl overflow-hidden',
        size === 'default' ? 'p-4 lg:p-5' : 'p-3 lg:p-4',

        // Match existing card style
        'bg-bg-card',
        'border border-border',

        className
      )}
    >
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] lg:text-[11px] font-medium text-zinc-500 uppercase tracking-widest">
          {label}
        </span>
        {change !== undefined && (
          <span
            className={cn(
              'text-[10px] lg:text-xs font-medium',
              change >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            {changeLabel && (
              <span className="text-zinc-600 ml-1">{changeLabel}</span>
            )}
          </span>
        )}
      </div>

      {/* Hero Value */}
      <div className="mb-1">
        <span
          className={cn(
            'font-bold font-mono text-white tracking-tight',
            size === 'default' ? 'text-2xl lg:text-3xl' : 'text-xl lg:text-2xl'
          )}
        >
          {prefix}{formattedValue}{suffix}
        </span>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-[10px] lg:text-xs text-zinc-500">{subtitle}</p>
      )}

      {/* Footer (platform breakdown, etc.) */}
      {footer && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          {footer}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// PLATFORM BREAKDOWN - Compact inline badges
// =============================================================================

interface PlatformBreakdownProps {
  items: Array<{
    platform: 'meta' | 'google' | 'shopify'
    value: string
    label?: string
  }>
  className?: string
}

export function PlatformBreakdown({ items, className }: PlatformBreakdownProps) {
  const logos = {
    meta: MetaLogo,
    google: GoogleLogo,
    shopify: ShopifyLogo,
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {items.map((item, i) => {
        const Logo = logos[item.platform]
        return (
          <div key={i} className="flex items-center gap-1.5">
            <Logo size="sm" />
            <span className="text-xs font-mono text-zinc-400">{item.value}</span>
            {item.label && (
              <span className="text-[10px] text-zinc-600">{item.label}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// ATTRIBUTION INFO - Shows attributed vs total
// =============================================================================

interface AttributionInfoProps {
  label?: string
  attributed: string | number
  percentage?: number
  platforms?: Array<{
    platform: 'meta' | 'google'
    value: string
  }>
}

export function AttributionInfo({ label = 'Attributed', attributed, percentage, platforms }: AttributionInfoProps) {
  const formattedAttr = typeof attributed === 'number'
    ? attributed.toLocaleString()
    : attributed

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
        <span className="text-xs font-mono text-zinc-400">
          {formattedAttr}
          {percentage !== undefined && (
            <span className="text-zinc-600 ml-1">({percentage}%)</span>
          )}
        </span>
      </div>
      {platforms && platforms.length > 0 && (
        <PlatformBreakdown
          items={platforms.map(p => ({ platform: p.platform, value: p.value }))}
        />
      )}
    </div>
  )
}

// =============================================================================
// SPEND TILE
// =============================================================================

interface SpendTileProps {
  total: number
  meta?: number
  google?: number
  change?: number
}

export function SpendTile({ total, meta = 0, google = 0, change }: SpendTileProps) {
  const platforms: Array<{ platform: 'meta' | 'google'; value: string }> = []

  if (meta > 0) {
    platforms.push({ platform: 'meta', value: `$${meta.toLocaleString(undefined, { maximumFractionDigits: 0 })}` })
  }
  if (google > 0) {
    platforms.push({ platform: 'google', value: `$${google.toLocaleString(undefined, { maximumFractionDigits: 0 })}` })
  }

  return (
    <MetricTile
      label="Total Spend"
      value={total}
      prefix="$"
      change={change}
      footer={platforms.length > 0 ? <PlatformBreakdown items={platforms} /> : undefined}
    />
  )
}

// =============================================================================
// REVENUE TILE
// =============================================================================

interface RevenueTileProps {
  total: number
  attributed?: number
  metaAttributed?: number
  googleAttributed?: number
  change?: number
}

export function RevenueTile({ total, attributed = 0, metaAttributed = 0, googleAttributed = 0, change }: RevenueTileProps) {
  const platforms: Array<{ platform: 'meta' | 'google'; value: string }> = []

  if (metaAttributed > 0) {
    platforms.push({ platform: 'meta', value: `$${metaAttributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}` })
  }
  if (googleAttributed > 0) {
    platforms.push({ platform: 'google', value: `$${googleAttributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}` })
  }

  const attrPercentage = total > 0 && attributed > 0 ? Math.round((attributed / total) * 100) : undefined

  return (
    <MetricTile
      label="Revenue"
      value={total}
      prefix="$"
      subtitle="from Shopify"
      change={change}
      footer={
        attributed > 0 ? (
          <AttributionInfo
            attributed={`$${attributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            percentage={attrPercentage}
            platforms={platforms}
          />
        ) : undefined
      }
    />
  )
}

// =============================================================================
// ROAS TILE
// =============================================================================

interface RoasTileProps {
  blended: number
  metaRoas?: number
  googleRoas?: number
  change?: number
}

export function RoasTile({ blended, metaRoas, googleRoas, change }: RoasTileProps) {
  const platforms: Array<{ platform: 'meta' | 'google'; value: string }> = []

  if (metaRoas !== undefined && metaRoas > 0) {
    platforms.push({ platform: 'meta', value: `${metaRoas.toFixed(2)}x` })
  }
  if (googleRoas !== undefined && googleRoas > 0) {
    platforms.push({ platform: 'google', value: `${googleRoas.toFixed(2)}x` })
  }

  return (
    <MetricTile
      label="Blended ROAS"
      value={blended.toFixed(2)}
      suffix="x"
      subtitle="revenue / spend"
      change={change}
      footer={platforms.length > 0 ? (
        <div className="space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Platform ROAS</span>
          <PlatformBreakdown items={platforms} />
        </div>
      ) : undefined}
    />
  )
}

// =============================================================================
// RESULTS TILE
// =============================================================================

interface ResultsTileProps {
  total: number
  attributed?: number
  metaAttributed?: number
  googleAttributed?: number
  change?: number
}

export function ResultsTile({ total, attributed = 0, metaAttributed = 0, googleAttributed = 0, change }: ResultsTileProps) {
  const platforms: Array<{ platform: 'meta' | 'google'; value: string }> = []

  if (metaAttributed > 0) {
    platforms.push({ platform: 'meta', value: metaAttributed.toLocaleString() })
  }
  if (googleAttributed > 0) {
    platforms.push({ platform: 'google', value: googleAttributed.toLocaleString() })
  }

  const attrPercentage = total > 0 && attributed > 0 ? Math.round((attributed / total) * 100) : undefined

  return (
    <MetricTile
      label="Results"
      value={total}
      subtitle="from Shopify"
      change={change}
      footer={
        attributed > 0 ? (
          <AttributionInfo
            attributed={attributed}
            percentage={attrPercentage}
            platforms={platforms}
          />
        ) : undefined
      }
    />
  )
}

// =============================================================================
// CPR TILE
// =============================================================================

interface CprTileProps {
  value: number
  change?: number
}

export function CprTile({ value, change }: CprTileProps) {
  return (
    <MetricTile
      label="Cost per Result"
      value={value > 0 ? value.toFixed(2) : '—'}
      prefix={value > 0 ? '$' : ''}
      subtitle="spend / results"
      change={change}
    />
  )
}

// =============================================================================
// BUDGET TILE
// =============================================================================

interface BudgetTileProps {
  total: number
  meta?: {
    cbo: number
    abo: number
  }
  google?: number
}

export function BudgetTile({ total, meta, google }: BudgetTileProps) {
  return (
    <MetricTile
      label="Daily Budgets"
      value={total}
      prefix="$"
      suffix="/day"
      footer={
        <div className="space-y-2">
          {/* Meta breakdown with CBO/ABO */}
          {meta && (meta.cbo > 0 || meta.abo > 0) && (
            <div className="flex items-center gap-3">
              <MetaLogo size="sm" />
              <div className="flex items-center gap-3">
                {meta.cbo > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">CBO</span>
                    <span className="text-xs font-mono text-zinc-400">${meta.cbo.toLocaleString()}</span>
                  </div>
                )}
                {meta.abo > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">ABO</span>
                    <span className="text-xs font-mono text-zinc-400">${meta.abo.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Google */}
          {google !== undefined && google > 0 && (
            <div className="flex items-center gap-3">
              <GoogleLogo size="sm" />
              <span className="text-xs font-mono text-zinc-400">${google.toLocaleString()}</span>
            </div>
          )}
        </div>
      }
    />
  )
}

// =============================================================================
// SIMPLE METRIC TILE - For secondary stats (CPM, CPC, AOV, etc.)
// =============================================================================

interface SimpleMetricTileProps {
  label: string
  value: string
  subtitle?: string
  change?: number
}

export function SimpleMetricTile({ label, value, subtitle, change }: SimpleMetricTileProps) {
  return (
    <MetricTile
      label={label}
      value={value}
      subtitle={subtitle}
      change={change}
      size="compact"
    />
  )
}
