'use client'

import { useState, useMemo } from 'react'
import { X, TrendingUp, TrendingDown, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BudgetEntity {
  id: string
  name: string
  type: 'campaign' | 'adset'
  currentBudget: number
  budgetType: 'daily' | 'lifetime'
  isCBO?: boolean
}

interface BulkBudgetModalProps {
  isOpen: boolean
  onClose: () => void
  entities: BudgetEntity[]
  onConfirm: (percentage: number) => Promise<void>
}

const PRESET_PERCENTAGES = [-20, -10, 10, 20, 50]

export function BulkBudgetModal({
  isOpen,
  onClose,
  entities,
  onConfirm
}: BulkBudgetModalProps) {
  const [percentage, setPercentage] = useState<number>(20)
  const [customPercentage, setCustomPercentage] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [useCustom, setUseCustom] = useState(false)

  // Calculate new budgets
  const calculations = useMemo(() => {
    const activePercentage = useCustom ? parseFloat(customPercentage) || 0 : percentage
    const multiplier = 1 + (activePercentage / 100)

    let totalOld = 0
    let totalNew = 0
    const items = entities.map(entity => {
      const newBudget = Math.round(entity.currentBudget * multiplier * 100) / 100
      totalOld += entity.currentBudget
      totalNew += newBudget
      return {
        ...entity,
        newBudget,
        change: newBudget - entity.currentBudget
      }
    })

    return {
      items,
      totalOld,
      totalNew,
      totalChange: totalNew - totalOld,
      percentage: activePercentage
    }
  }, [entities, percentage, customPercentage, useCustom])

  // Check for mixed CBO/ABO
  const hasCBO = entities.some(e => e.isCBO)
  const hasABO = entities.some(e => !e.isCBO)
  const isMixed = hasCBO && hasABO

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm(calculations.percentage)
      onClose()
    } catch (err) {
      console.error('Budget scale error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const formatBudget = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">Scale Budgets</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white hover:bg-bg-hover rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Mixed CBO/ABO warning */}
          {isMixed && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-400">
                You've selected both campaigns (CBO) and ad sets (ABO). Budget changes will apply at their respective levels.
              </p>
            </div>
          )}

          {/* Percentage selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Scale by percentage
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_PERCENTAGES.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setPercentage(p)
                    setUseCustom(false)
                  }}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    !useCustom && percentage === p
                      ? p > 0
                        ? "bg-verdict-scale text-white"
                        : "bg-red-500 text-white"
                      : "bg-bg-hover text-zinc-300 hover:bg-bg-hover/80"
                  )}
                >
                  {p > 0 ? `+${p}%` : `${p}%`}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={customPercentage}
                  onChange={(e) => {
                    setCustomPercentage(e.target.value)
                    setUseCustom(true)
                  }}
                  onFocus={() => setUseCustom(true)}
                  placeholder="Custom"
                  className={cn(
                    "w-20 px-3 py-2 rounded-lg text-sm font-medium bg-bg-hover border transition-colors",
                    useCustom
                      ? "border-accent text-white"
                      : "border-transparent text-zinc-300"
                  )}
                />
                <span className="text-zinc-400">%</span>
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Preview ({entities.length} item{entities.length > 1 ? 's' : ''})
            </label>
            <div className="bg-bg-dark rounded-lg border border-border max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg-dark">
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-medium text-zinc-400">Name</th>
                    <th className="text-right p-2 font-medium text-zinc-400">Current</th>
                    <th className="text-right p-2 font-medium text-zinc-400">New</th>
                  </tr>
                </thead>
                <tbody>
                  {calculations.items.map(item => (
                    <tr key={item.id} className="border-b border-border/50 last:border-0">
                      <td className="p-2 truncate max-w-[200px]">
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-[10px] px-1 py-0.5 rounded font-medium",
                            item.type === 'campaign'
                              ? "bg-hierarchy-campaign/20 text-hierarchy-campaign"
                              : "bg-hierarchy-adset/20 text-hierarchy-adset"
                          )}>
                            {item.type === 'campaign' ? 'C' : 'AS'}
                          </span>
                          <span className="truncate">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right text-zinc-400">
                        {formatBudget(item.currentBudget)}
                      </td>
                      <td className="p-2 text-right">
                        <span className={cn(
                          "font-medium",
                          item.change > 0 ? "text-verdict-scale" : item.change < 0 ? "text-red-400" : "text-zinc-300"
                        )}>
                          {formatBudget(item.newBudget)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total impact */}
          <div className="flex items-center justify-between p-3 bg-bg-dark rounded-lg border border-border">
            <span className="text-sm text-zinc-400">Total Budget Impact</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">{formatBudget(calculations.totalOld)}</span>
              <span className="text-zinc-500">→</span>
              <span className={cn(
                "font-semibold flex items-center gap-1",
                calculations.totalChange > 0 ? "text-verdict-scale" : calculations.totalChange < 0 ? "text-red-400" : "text-zinc-300"
              )}>
                {calculations.totalChange > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : calculations.totalChange < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : null}
                {formatBudget(calculations.totalNew)}
              </span>
              <span className={cn(
                "text-sm",
                calculations.totalChange > 0 ? "text-verdict-scale" : calculations.totalChange < 0 ? "text-red-400" : "text-zinc-400"
              )}>
                ({calculations.percentage > 0 ? '+' : ''}{calculations.percentage}%)
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || calculations.percentage === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              calculations.percentage > 0
                ? "bg-verdict-scale hover:bg-verdict-scale/90 text-white"
                : "bg-red-500 hover:bg-red-500/90 text-white",
              (isLoading || calculations.percentage === 0) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {calculations.percentage > 0 ? 'Increase' : 'Decrease'} Budgets
          </button>
        </div>
      </div>
    </div>
  )
}
