'use client'

import { useState, useMemo } from 'react'
import { TrendingDown, TrendingUp, ChevronDown, ChevronUp, Pause, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/privacy-mode'

export type ActionCardItem = {
  id: string
  name: string
  entityType: 'campaign' | 'adset'
  entityId: string
  parentName?: string
  spend: number
  roas: number
  dailyBudget?: number
  budgetType?: 'CBO' | 'ABO'
}

type ActionCardsProps = {
  killItems: ActionCardItem[]
  scaleItems: ActionCardItem[]
  scalePercentage: number
  onKill: (selectedIds: string[]) => Promise<void>
  onScale: (selectedIds: string[]) => Promise<void>
  isLoading?: boolean
}

const STACK_THRESHOLD = 5 // Stack vertically if either list exceeds this
const INITIAL_VISIBLE = 5

export function ActionCards({
  killItems,
  scaleItems,
  scalePercentage,
  onKill,
  onScale,
  isLoading
}: ActionCardsProps) {
  const shouldStack = killItems.length > STACK_THRESHOLD || scaleItems.length > STACK_THRESHOLD

  return (
    <div className={cn(
      'gap-4 mb-6',
      shouldStack ? 'flex flex-col' : 'grid grid-cols-1 lg:grid-cols-2'
    )}>
      <KillCard
        items={killItems}
        onKill={onKill}
        isLoading={isLoading}
        fullWidth={shouldStack}
      />
      <ScaleCard
        items={scaleItems}
        scalePercentage={scalePercentage}
        onScale={onScale}
        isLoading={isLoading}
        fullWidth={shouldStack}
      />
    </div>
  )
}

type KillCardProps = {
  items: ActionCardItem[]
  onKill: (selectedIds: string[]) => Promise<void>
  isLoading?: boolean
  fullWidth?: boolean
}

function KillCard({ items, onKill, isLoading, fullWidth }: KillCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isPrivacyMode } = usePrivacyMode()

  // Privacy mode helper for entity names
  const maskEntityName = (name: string, entityType: 'campaign' | 'adset', index: number): string => {
    if (!isPrivacyMode) return name
    return entityType === 'campaign' ? `Campaign ${index + 1}` : `Ad Set ${index + 1}`
  }

  const visibleItems = expanded ? items : items.slice(0, INITIAL_VISIBLE)
  const hasMore = items.length > INITIAL_VISIBLE

  const totalWastedPerDay = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.dailyBudget || 0), 0)
  }, [items])

  const totalWastedPerMonth = totalWastedPerDay * 30

  const selectedWastedPerMonth = useMemo(() => {
    return Array.from(selectedIds).reduce((sum, id) => {
      const item = items.find(i => i.id === id)
      return sum + ((item?.dailyBudget || 0) * 30)
    }, 0)
  }, [selectedIds, items])

  const handleToggle = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleKill = async () => {
    if (selectedIds.size === 0) return
    setIsSubmitting(true)
    try {
      await onKill(Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  if (items.length === 0) {
    return (
      <div className={cn(
        'bg-bg-card border border-border rounded-xl p-6',
        fullWidth ? 'w-full' : ''
      )}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-verdict-scale/20 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-verdict-scale" />
          </div>
          <div>
            <h3 className="font-semibold text-white">No Bleeding Budgets</h3>
            <p className="text-sm text-zinc-500">All your budgets are performing above threshold</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-bg-card border border-verdict-kill/30 rounded-xl p-5 relative overflow-hidden',
      fullWidth ? 'w-full' : '',
      'shadow-[0_0_30px_-5px_rgba(239,68,68,0.15)]'
    )}>
      {/* Red glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-verdict-kill/5 to-transparent pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-verdict-kill/20 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-5 h-5 text-verdict-kill" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Wasted Spend</h3>
              <p className="text-sm text-zinc-500">{items.length} budget{items.length !== 1 ? 's' : ''} bleeding</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg sm:text-2xl font-bold font-mono text-verdict-kill">
              {formatCurrency(totalWastedPerDay)}/day
            </div>
            <div className="text-xs sm:text-sm text-zinc-500">
              {formatCurrency(totalWastedPerMonth)}/mo
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className={cn(
          'space-y-2 mb-4',
          fullWidth && items.length > 5 ? 'grid grid-cols-1 lg:grid-cols-2 gap-2 space-y-0' : ''
        )}>
          {visibleItems.map((item, index) => (
            <label
              key={item.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                selectedIds.has(item.id)
                  ? 'bg-verdict-kill/20 border border-verdict-kill/40'
                  : 'bg-bg-dark/50 border border-transparent hover:border-border'
              )}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => handleToggle(item.id)}
                className="w-4 h-4 rounded border-zinc-600 text-verdict-kill focus:ring-verdict-kill/50 bg-bg-dark"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">{maskEntityName(item.name, item.entityType, index)}</div>
                <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-1 sm:gap-2">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    item.budgetType === 'CBO' ? 'bg-hierarchy-campaign/20 text-hierarchy-campaign' : 'bg-hierarchy-adset/20 text-hierarchy-adset'
                  )}>
                    {item.budgetType || 'ABO'}
                  </span>
                  <span>{formatCurrency(item.dailyBudget || 0)}/day</span>
                  <span className="text-verdict-kill">{item.roas.toFixed(1)}x</span>
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Show More */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 text-sm text-zinc-400 hover:text-white flex items-center justify-center gap-1 transition-colors mb-4"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show all {items.length} <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === items.length && items.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-zinc-600 text-verdict-kill focus:ring-verdict-kill/50 bg-bg-dark"
            />
            <span className="text-sm text-zinc-400">Select all</span>
          </label>

          <button
            onClick={handleKill}
            disabled={selectedIds.size === 0 || isSubmitting || isLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
              selectedIds.size > 0
                ? 'bg-verdict-kill text-white hover:bg-verdict-kill/80'
                : 'bg-bg-dark text-zinc-500 cursor-not-allowed'
            )}
          >
            <Pause className="w-4 h-4" />
            {selectedIds.size > 0 ? `Pause ${selectedIds.size} Selected` : 'Select budgets'}
          </button>
        </div>

        {/* Impact Summary */}
        {selectedIds.size > 0 && (
          <div className="mt-4 pt-4 border-t border-border text-center">
            <span className="text-sm text-zinc-400">If paused today: </span>
            <span className="text-sm font-semibold text-verdict-scale">
              {formatCurrency(selectedWastedPerMonth)} saved this month
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

type ScaleCardProps = {
  items: ActionCardItem[]
  scalePercentage: number
  onScale: (selectedIds: string[]) => Promise<void>
  isLoading?: boolean
  fullWidth?: boolean
}

function ScaleCard({ items, scalePercentage, onScale, isLoading, fullWidth }: ScaleCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isPrivacyMode } = usePrivacyMode()

  // Privacy mode helper for entity names
  const maskEntityName = (name: string, entityType: 'campaign' | 'adset', index: number): string => {
    if (!isPrivacyMode) return name
    return entityType === 'campaign' ? `Campaign ${index + 1}` : `Ad Set ${index + 1}`
  }

  const visibleItems = expanded ? items : items.slice(0, INITIAL_VISIBLE)
  const hasMore = items.length > INITIAL_VISIBLE

  // Calculate potential profit from scaling
  const totalOpportunityPerDay = useMemo(() => {
    return items.reduce((sum, item) => {
      if (item.dailyBudget && item.roas > 1) {
        const extraDailySpend = item.dailyBudget * (scalePercentage / 100)
        const extraDailyProfit = extraDailySpend * (item.roas - 1)
        return sum + extraDailyProfit
      }
      return sum
    }, 0)
  }, [items, scalePercentage])

  const totalOpportunityPerMonth = totalOpportunityPerDay * 30

  const selectedOpportunityPerMonth = useMemo(() => {
    return Array.from(selectedIds).reduce((sum, id) => {
      const item = items.find(i => i.id === id)
      if (item?.dailyBudget && item.roas > 1) {
        const extraDailySpend = item.dailyBudget * (scalePercentage / 100)
        const extraDailyProfit = extraDailySpend * (item.roas - 1)
        return sum + (extraDailyProfit * 30)
      }
      return sum
    }, 0)
  }, [selectedIds, items, scalePercentage])

  const handleToggle = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleScale = async () => {
    if (selectedIds.size === 0) return
    setIsSubmitting(true)
    try {
      await onScale(Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  if (items.length === 0) {
    return (
      <div className={cn(
        'bg-bg-card border border-border rounded-xl p-6',
        fullWidth ? 'w-full' : ''
      )}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-700/50 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">No Budgets Ready to Scale</h3>
            <p className="text-sm text-zinc-500">Keep optimizing - winners will appear here</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-bg-card border border-verdict-scale/30 rounded-xl p-5 relative overflow-hidden',
      fullWidth ? 'w-full' : '',
      'shadow-[0_0_30px_-5px_rgba(34,197,94,0.15)]'
    )}>
      {/* Green glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-verdict-scale/5 to-transparent pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-verdict-scale/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-verdict-scale" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Profit Potential</h3>
              <p className="text-sm text-zinc-500">{items.length} ready to scale</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg sm:text-2xl font-bold font-mono text-verdict-scale">
              +{formatCurrency(totalOpportunityPerDay)}/day
            </div>
            <div className="text-xs sm:text-sm text-zinc-500">
              +{formatCurrency(totalOpportunityPerMonth)}/mo
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className={cn(
          'space-y-2 mb-4',
          fullWidth && items.length > 5 ? 'grid grid-cols-1 lg:grid-cols-2 gap-2 space-y-0' : ''
        )}>
          {visibleItems.map((item, index) => {
            const newBudget = Math.round((item.dailyBudget || 0) * (1 + scalePercentage / 100))
            return (
              <label
                key={item.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                  selectedIds.has(item.id)
                    ? 'bg-verdict-scale/20 border border-verdict-scale/40'
                    : 'bg-bg-dark/50 border border-transparent hover:border-border'
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => handleToggle(item.id)}
                  className="w-4 h-4 rounded border-zinc-600 text-verdict-scale focus:ring-verdict-scale/50 bg-bg-dark"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{maskEntityName(item.name, item.entityType, index)}</div>
                  <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-1 sm:gap-2">
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium',
                      item.budgetType === 'CBO' ? 'bg-hierarchy-campaign/20 text-hierarchy-campaign' : 'bg-hierarchy-adset/20 text-hierarchy-adset'
                    )}>
                      {item.budgetType || 'ABO'}
                    </span>
                    <span>
                      {formatCurrency(item.dailyBudget || 0)} → {formatCurrency(newBudget)}
                    </span>
                    <span className="text-verdict-scale">{item.roas.toFixed(1)}x</span>
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Show More */}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 text-sm text-zinc-400 hover:text-white flex items-center justify-center gap-1 transition-colors mb-4"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show all {items.length} <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === items.length && items.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-zinc-600 text-verdict-scale focus:ring-verdict-scale/50 bg-bg-dark"
            />
            <span className="text-sm text-zinc-400">Select all</span>
          </label>

          <button
            onClick={handleScale}
            disabled={selectedIds.size === 0 || isSubmitting || isLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
              selectedIds.size > 0
                ? 'bg-verdict-scale text-white hover:bg-verdict-scale/80'
                : 'bg-bg-dark text-zinc-500 cursor-not-allowed'
            )}
          >
            <Zap className="w-4 h-4" />
            {selectedIds.size > 0 ? `Scale ${selectedIds.size} +${scalePercentage}%` : 'Select budgets'}
          </button>
        </div>

        {/* Impact Summary */}
        {selectedIds.size > 0 && (
          <div className="mt-4 pt-4 border-t border-border text-center">
            <span className="text-sm text-zinc-400">If scaled today: </span>
            <span className="text-sm font-semibold text-verdict-scale">
              +{formatCurrency(selectedOpportunityPerMonth)}/mo projected profit
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
