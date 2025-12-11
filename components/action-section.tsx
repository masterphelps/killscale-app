'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Square, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Verdict } from '@/lib/supabase'

export type ActionItem = {
  id: string
  name: string
  entityType: 'campaign' | 'adset' | 'ad'
  entityId: string
  parentName?: string  // Campaign name for adsets, Adset name for ads
  spend: number
  roas?: number
  dailyBudget?: number
  daysInState?: number  // Days since entering this verdict state
}

type ActionSectionProps = {
  verdict: Verdict
  items: ActionItem[]
  metric?: string  // e.g., "-$127/day" or "+$89/day est"
  subtitle?: string  // e.g., "4 ads hovering near thresholds"
  actions?: {
    label: string
    variant: 'primary' | 'danger' | 'success'
    onClick: (selectedIds: string[]) => void
    bulkLabel?: string  // e.g., "Kill All"
  }[]
  defaultExpanded?: boolean
  scalePercentage?: number  // For Scale section to show +20%
}

const VERDICT_CONFIG: Record<Verdict, { icon: string; label: string; color: string; bg: string }> = {
  scale: {
    icon: '🟢',
    label: 'READY TO SCALE',
    color: 'text-verdict-scale',
    bg: 'bg-verdict-scale/10 border-verdict-scale/30'
  },
  watch: {
    icon: '👀',
    label: 'WATCH LIST',
    color: 'text-verdict-watch',
    bg: 'bg-verdict-watch/10 border-verdict-watch/30'
  },
  kill: {
    icon: '🔴',
    label: 'KILL NOW',
    color: 'text-verdict-kill',
    bg: 'bg-verdict-kill/10 border-verdict-kill/30'
  },
  learn: {
    icon: '📚',
    label: 'LEARNING',
    color: 'text-verdict-learn',
    bg: 'bg-verdict-learn/10 border-verdict-learn/30'
  }
}

export function ActionSection({
  verdict,
  items,
  metric,
  subtitle,
  actions,
  defaultExpanded = true,
  scalePercentage = 20
}: ActionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const config = VERDICT_CONFIG[verdict]
  const hasItems = items.length > 0

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleAction = (action: NonNullable<typeof actions>[0], useBulk: boolean) => {
    const ids = useBulk ? items.map(i => i.id) : Array.from(selectedIds)
    action.onClick(ids)
    setSelectedIds(new Set())
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className={cn('rounded-xl border', config.bg)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{config.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('font-semibold', config.color)}>
                {config.label}
              </span>
              <span className="text-zinc-400">({items.length})</span>
            </div>
            {subtitle && (
              <div className="text-xs text-zinc-500">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {metric && (
            <span className={cn('text-sm font-mono font-semibold', config.color)}>
              {metric}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && hasItems && (
        <div className="border-t border-white/10">
          {/* Select All */}
          {actions && actions.length > 0 && (
            <div className="px-4 py-2 border-b border-white/5 flex items-center">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-300"
              >
                {selectedIds.size === items.length ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>Select all</span>
              </button>
            </div>
          )}

          {/* Items List */}
          <div className="divide-y divide-white/5">
            {items.map(item => (
              <div
                key={item.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors"
              >
                {/* Checkbox */}
                {actions && actions.length > 0 && (
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className="flex-shrink-0"
                  >
                    {selectedIds.has(item.id) ? (
                      <CheckSquare className="w-4 h-4 text-accent" />
                    ) : (
                      <Square className="w-4 h-4 text-zinc-500" />
                    )}
                  </button>
                )}

                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{item.name}</div>
                  {item.parentName && (
                    <div className="text-xs text-zinc-500 truncate">{item.parentName}</div>
                  )}
                </div>

                {/* Metrics based on verdict type */}
                <div className="flex items-center gap-4 text-sm">
                  {verdict === 'kill' && (
                    <>
                      <div className="text-right">
                        <div className="text-verdict-kill font-mono">
                          {formatCurrency(item.spend / Math.max(1, item.daysInState || 7))}/day
                        </div>
                        <div className="text-xs text-zinc-500">bleeding</div>
                      </div>
                      {item.daysInState && (
                        <div className="text-zinc-400 text-xs w-16 text-right">
                          {item.daysInState} days
                        </div>
                      )}
                    </>
                  )}

                  {verdict === 'scale' && (
                    <>
                      <div className="text-right">
                        <div className="text-verdict-scale font-mono">
                          {item.roas?.toFixed(1)}x
                        </div>
                        <div className="text-xs text-zinc-500">ROAS</div>
                      </div>
                      {item.dailyBudget && (
                        <div className="text-right text-xs">
                          <div className="text-zinc-400">
                            {formatCurrency(item.dailyBudget)} → {formatCurrency(item.dailyBudget * (1 + scalePercentage / 100))}
                          </div>
                          <div className="text-verdict-scale">(+{scalePercentage}%)</div>
                        </div>
                      )}
                    </>
                  )}

                  {verdict === 'watch' && item.roas && (
                    <div className="text-right">
                      <div className="text-verdict-watch font-mono">{item.roas.toFixed(1)}x</div>
                      <div className="text-xs text-zinc-500">ROAS</div>
                    </div>
                  )}

                  {verdict === 'learn' && (
                    <div className="text-right">
                      <div className="text-zinc-400 font-mono">{formatCurrency(item.spend)}</div>
                      <div className="text-xs text-zinc-500">spent</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          {actions && actions.length > 0 && (
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              {actions.map((action, i) => {
                const hasSelection = selectedIds.size > 0
                const allSelected = selectedIds.size === items.length

                return (
                  <button
                    key={i}
                    onClick={() => hasSelection && handleAction(action, false)}
                    disabled={!hasSelection}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      // Light style when nothing selected (disabled)
                      !hasSelection && action.variant === 'danger' && 'bg-verdict-kill/20 text-verdict-kill/50 cursor-not-allowed',
                      !hasSelection && action.variant === 'success' && 'bg-verdict-scale/20 text-verdict-scale/50 cursor-not-allowed',
                      !hasSelection && action.variant === 'primary' && 'bg-accent/20 text-accent/50 cursor-not-allowed',
                      // Full style when items selected
                      hasSelection && action.variant === 'danger' && 'bg-verdict-kill text-white hover:bg-verdict-kill/80',
                      hasSelection && action.variant === 'success' && 'bg-verdict-scale text-white hover:bg-verdict-scale/80',
                      hasSelection && action.variant === 'primary' && 'bg-accent text-white hover:bg-accent/80'
                    )}
                  >
                    {hasSelection
                      ? `${action.label} (${selectedIds.size}${allSelected ? ' - All' : ''})`
                      : action.bulkLabel || action.label
                    }
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {isExpanded && !hasItems && (
        <div className="px-4 py-6 text-center text-sm text-zinc-500 border-t border-white/10">
          No items in this category
        </div>
      )}
    </div>
  )
}
