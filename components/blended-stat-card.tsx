'use client'

import { ReactNode } from 'react'
import { MetaLogo, GoogleLogo, ShopifyLogo, TikTokLogo, KillScaleLogo } from './platform-logos'

type Platform = 'meta' | 'google' | 'shopify' | 'tiktok' | 'killscale'

interface PlatformValue {
  platform: Platform
  value: string | number
  percentage?: number
}

interface BlendedStatCardProps {
  // Header
  label: string
  icon?: ReactNode

  // Hero value
  value: string | number
  valuePrefix?: string  // e.g. "$" for currency
  valueSuffix?: string  // e.g. "x" for ROAS
  subtitle?: string     // e.g. "from Shopify"

  // Change indicator
  change?: number
  changeLabel?: string

  // Platform breakdown section
  breakdown?: {
    label?: string      // e.g. "Ad-Attributed" or "Platform Spend"
    items: PlatformValue[]
    totalValue?: string | number  // Optional total for attributed section
    totalPercentage?: number      // e.g. "27%" of total
  }

  // Styling
  glowColor?: 'blue' | 'green' | 'purple' | 'amber' | 'rose'
}

const glowColors = {
  blue: 'shadow-blue-500/20',
  green: 'shadow-emerald-500/20',
  purple: 'shadow-violet-500/20',
  amber: 'shadow-amber-500/20',
  rose: 'shadow-rose-500/20'
}

const LogoComponents: Record<Platform, typeof MetaLogo> = {
  meta: MetaLogo,
  google: GoogleLogo,
  shopify: ShopifyLogo,
  tiktok: TikTokLogo,
  killscale: KillScaleLogo
}

export function BlendedStatCard({
  label,
  icon,
  value,
  valuePrefix = '',
  valueSuffix = '',
  subtitle,
  change,
  changeLabel,
  breakdown,
  glowColor = 'blue'
}: BlendedStatCardProps) {
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value

  return (
    <div className={`bg-zinc-900/80 backdrop-blur-sm rounded-xl p-4 border border-zinc-800 shadow-lg ${glowColors[glowColor]}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-zinc-400">{icon}</span>}
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</span>
      </div>

      {/* Hero Value */}
      <div className="mb-2">
        <div className="text-3xl font-bold font-mono text-white">
          {valuePrefix}{formattedValue}{valueSuffix}
        </div>
        {subtitle && (
          <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>
        )}
      </div>

      {/* Change Indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1 mb-3">
          <span className={`text-sm font-medium ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-zinc-500">{changeLabel}</span>
          )}
        </div>
      )}

      {/* Platform Breakdown Section */}
      {breakdown && breakdown.items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-700/50">
          {/* Breakdown header with optional total */}
          {(breakdown.label || breakdown.totalValue !== undefined) && (
            <div className="flex items-center justify-between mb-2">
              {breakdown.label && (
                <span className="text-xs text-zinc-500">{breakdown.label}</span>
              )}
              {breakdown.totalValue !== undefined && (
                <span className="text-xs text-zinc-400">
                  {typeof breakdown.totalValue === 'number'
                    ? breakdown.totalValue.toLocaleString()
                    : breakdown.totalValue}
                  {breakdown.totalPercentage !== undefined && (
                    <span className="text-zinc-500 ml-1">({breakdown.totalPercentage}%)</span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-4">
            {breakdown.items.map((item, i) => {
              const Logo = LogoComponents[item.platform]
              const displayValue = typeof item.value === 'number'
                ? item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : item.value

              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <Logo size="sm" />
                    <span className="text-sm font-mono text-zinc-300">{displayValue}</span>
                  </div>
                  {item.percentage !== undefined && (
                    <span className="text-xs text-zinc-500">{item.percentage}%</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Spend Card - shows total spend with platform breakdown
interface SpendCardProps {
  total: number
  meta?: number
  google?: number
  tiktok?: number
  change?: number
}

export function SpendCard({ total, meta = 0, google = 0, tiktok = 0, change }: SpendCardProps) {
  const items: PlatformValue[] = []
  const totalSpend = meta + google + tiktok || total

  if (meta > 0) {
    items.push({
      platform: 'meta',
      value: `$${meta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      percentage: Math.round((meta / totalSpend) * 100)
    })
  }
  if (google > 0) {
    items.push({
      platform: 'google',
      value: `$${google.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      percentage: Math.round((google / totalSpend) * 100)
    })
  }
  if (tiktok > 0) {
    items.push({
      platform: 'tiktok',
      value: `$${tiktok.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      percentage: Math.round((tiktok / totalSpend) * 100)
    })
  }

  return (
    <BlendedStatCard
      label="Total Spend"
      icon={<DollarIcon />}
      value={total}
      valuePrefix="$"
      change={change}
      changeLabel="vs prev"
      breakdown={items.length > 0 ? { items } : undefined}
      glowColor="blue"
    />
  )
}

// Revenue Card - shows Shopify total with attributed breakdown
interface RevenueCardProps {
  total: number
  attributed: number
  metaAttributed?: number
  googleAttributed?: number
  change?: number
}

export function RevenueCard({ total, attributed, metaAttributed = 0, googleAttributed = 0, change }: RevenueCardProps) {
  const items: PlatformValue[] = []

  if (metaAttributed > 0) {
    items.push({
      platform: 'meta',
      value: `$${metaAttributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    })
  }
  if (googleAttributed > 0) {
    items.push({
      platform: 'google',
      value: `$${googleAttributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    })
  }

  const attrPercentage = total > 0 ? Math.round((attributed / total) * 100) : 0

  return (
    <BlendedStatCard
      label="Total Revenue"
      icon={<TrendingUpIcon />}
      value={total}
      valuePrefix="$"
      subtitle="from Shopify"
      change={change}
      changeLabel="vs prev"
      breakdown={items.length > 0 ? {
        label: 'Ad-Attributed',
        totalValue: `$${attributed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        totalPercentage: attrPercentage,
        items
      } : undefined}
      glowColor="green"
    />
  )
}

// ROAS Card - shows blended ROAS with per-platform breakdown
interface RoasCardProps {
  blended: number
  metaRoas?: number
  googleRoas?: number
  change?: number
}

export function RoasCard({ blended, metaRoas, googleRoas, change }: RoasCardProps) {
  const items: PlatformValue[] = []

  if (metaRoas !== undefined && metaRoas > 0) {
    items.push({
      platform: 'meta',
      value: `${metaRoas.toFixed(2)}x`
    })
  }
  if (googleRoas !== undefined && googleRoas > 0) {
    items.push({
      platform: 'google',
      value: `${googleRoas.toFixed(2)}x`
    })
  }

  return (
    <BlendedStatCard
      label="Blended ROAS"
      icon={<ChartIcon />}
      value={blended.toFixed(2)}
      valueSuffix="x"
      subtitle="Total Rev / Total Spend"
      change={change}
      changeLabel="vs prev"
      breakdown={items.length > 0 ? {
        label: 'Platform ROAS (attributed)',
        items
      } : undefined}
      glowColor="purple"
    />
  )
}

// Results Card - shows total results with attributed breakdown
interface ResultsCardProps {
  total: number
  attributed: number
  metaAttributed?: number
  googleAttributed?: number
  change?: number
}

export function ResultsCard({ total, attributed, metaAttributed = 0, googleAttributed = 0, change }: ResultsCardProps) {
  const items: PlatformValue[] = []

  if (metaAttributed > 0) {
    items.push({
      platform: 'meta',
      value: metaAttributed
    })
  }
  if (googleAttributed > 0) {
    items.push({
      platform: 'google',
      value: googleAttributed
    })
  }

  const attrPercentage = total > 0 ? Math.round((attributed / total) * 100) : 0

  return (
    <BlendedStatCard
      label="Total Results"
      icon={<TargetIcon />}
      value={total}
      subtitle="from Shopify"
      change={change}
      changeLabel="vs prev"
      breakdown={items.length > 0 ? {
        label: 'Ad-Attributed',
        totalValue: attributed,
        totalPercentage: attrPercentage,
        items
      } : undefined}
      glowColor="amber"
    />
  )
}

// CPR Card - shows cost per result
interface CprCardProps {
  value: number
  change?: number
}

export function CprCard({ value, change }: CprCardProps) {
  return (
    <BlendedStatCard
      label="Cost per Result"
      icon={<ReceiptIcon />}
      value={value.toFixed(2)}
      valuePrefix="$"
      subtitle="per result"
      change={change}
      changeLabel="vs prev"
      glowColor="rose"
    />
  )
}

// Budget Card - shows daily budgets with platform breakdown
interface BudgetCardProps {
  total: number
  meta?: {
    cbo: number
    abo: number
  }
  google?: number
}

export function BudgetCard({ total, meta, google }: BudgetCardProps) {
  return (
    <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl p-4 border border-zinc-800 shadow-lg shadow-blue-500/10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-zinc-400"><CalendarIcon /></span>
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Daily Budgets</span>
      </div>

      {/* Hero Value */}
      <div className="mb-3">
        <div className="text-3xl font-bold font-mono text-white">
          ${total.toLocaleString()}/day
        </div>
      </div>

      {/* Platform Breakdown */}
      <div className="mt-3 pt-3 border-t border-zinc-700/50 space-y-3">
        {/* Meta breakdown with CBO/ABO */}
        {meta && (meta.cbo > 0 || meta.abo > 0) && (
          <div className="flex items-start gap-2">
            <MetaLogo size="sm" />
            <div className="flex-1">
              <span className="text-xs text-zinc-400">Meta</span>
              <div className="flex items-center gap-3 mt-1">
                {meta.cbo > 0 && (
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500">CBO</span>
                    <span className="text-sm font-mono text-zinc-300">${meta.cbo.toLocaleString()}</span>
                  </div>
                )}
                {meta.abo > 0 && (
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500">ABO</span>
                    <span className="text-sm font-mono text-zinc-300">${meta.abo.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Google - just total */}
        {google !== undefined && google > 0 && (
          <div className="flex items-center gap-2">
            <GoogleLogo size="sm" />
            <div className="flex-1">
              <span className="text-xs text-zinc-400">Google</span>
              <div className="mt-1">
                <span className="text-sm font-mono text-zinc-300">${google.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Simple icon components
function DollarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function TrendingUpIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
