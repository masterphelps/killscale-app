'use client'

import { useState, useEffect, useRef } from 'react'
import { X, DollarSign, Loader2, TrendingUp, TrendingDown, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const COOLDOWN_DAYS = 3

type BudgetEditModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (newBudget: number, budgetType: 'daily' | 'lifetime') => Promise<void>
  entityName: string
  entityType: 'campaign' | 'adset'
  entityId: string
  currentBudgetType: 'daily' | 'lifetime'
  currentBudget: number
  scalePercentage?: number
  userId?: string
}

type BudgetHistory = {
  lastChange: {
    old_budget: number
    new_budget: number
    changed_at: string
  } | null
  daysSinceChange: number | null
}

export function BudgetEditModal({
  isOpen,
  onClose,
  onSave,
  entityName,
  entityType,
  entityId,
  currentBudgetType,
  currentBudget,
  scalePercentage = 20,
  userId,
}: BudgetEditModalProps) {
  const [budget, setBudget] = useState(currentBudget.toString())
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>(currentBudgetType)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<BudgetHistory | null>(null)
  const [showCooldownWarning, setShowCooldownWarning] = useState(false)
  const [pendingBudget, setPendingBudget] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Calculate quick scale amounts
  const scaleUpAmount = Math.round(currentBudget * (1 + scalePercentage / 100) * 100) / 100
  const scaleDownAmount = Math.round(currentBudget * (1 - scalePercentage / 100) * 100) / 100

  // Fetch budget history when modal opens
  useEffect(() => {
    if (isOpen && userId && entityId) {
      fetchBudgetHistory()
    }
  }, [isOpen, userId, entityId])

  const fetchBudgetHistory = async () => {
    if (!userId || !entityId) return

    setIsLoadingHistory(true)
    try {
      const response = await fetch(
        `/api/budget-history?userId=${userId}&entityType=${entityType}&entityId=${entityId}`
      )
      if (response.ok) {
        const data = await response.json()
        setHistory(data)
      }
    } catch (err) {
      console.error('Failed to fetch budget history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setBudget(currentBudget.toString())
      setBudgetType(currentBudgetType)
      setError(null)
      setShowCooldownWarning(false)
      setPendingBudget(null)
      // Focus input after a short delay to allow modal animation
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [isOpen, currentBudget, currentBudgetType])

  const handleQuickScale = (direction: 'up' | 'down') => {
    const newBudget = direction === 'up' ? scaleUpAmount : scaleDownAmount
    attemptBudgetChange(newBudget)
  }

  const handleSave = async () => {
    const numericBudget = parseFloat(budget)

    if (isNaN(numericBudget) || numericBudget <= 0) {
      setError('Please enter a valid budget amount')
      return
    }

    attemptBudgetChange(numericBudget)
  }

  const attemptBudgetChange = (newBudget: number) => {
    // Check cooldown
    if (history && history.daysSinceChange !== null && history.daysSinceChange < COOLDOWN_DAYS) {
      setPendingBudget(newBudget)
      setShowCooldownWarning(true)
    } else {
      proceedWithSave(newBudget)
    }
  }

  const proceedWithSave = async (newBudget: number) => {
    setIsLoading(true)
    setError(null)
    setShowCooldownWarning(false)

    try {
      await onSave(newBudget, budgetType)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCooldownConfirm = () => {
    if (pendingBudget !== null) {
      proceedWithSave(pendingBudget)
    }
  }

  const handleCooldownCancel = () => {
    setShowCooldownWarning(false)
    setPendingBudget(null)
  }

  if (!isOpen) return null

  // Cooldown warning overlay
  if (showCooldownWarning) {
    const daysRemaining = COOLDOWN_DAYS - (history?.daysSinceChange ?? 0)

    const warningContent = (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold text-white">Scale Too Soon?</h3>
        </div>

        <p className="text-zinc-400 mb-2">
          Budget was changed <span className="text-white font-medium">{history?.daysSinceChange} day{history?.daysSinceChange !== 1 ? 's' : ''} ago</span>.
        </p>

        <p className="text-zinc-400 mb-4">
          Scaling too fast can destabilize Andromeda and hurt performance.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
          <p className="text-sm text-amber-400">
            <Clock className="w-4 h-4 inline mr-1" />
            Recommended: Wait {daysRemaining} more day{daysRemaining !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCooldownCancel}
            className="flex-1 py-3 px-4 bg-bg-hover text-zinc-300 rounded-lg font-medium hover:text-white transition-colors"
          >
            Wait
          </button>
          <button
            onClick={handleCooldownConfirm}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Scale Anyway'
            )}
          </button>
        </div>
      </div>
    )

    return (
      <>
        {/* Mobile: Bottom sheet */}
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={handleCooldownCancel} />
          <div className="relative w-full bg-bg-card rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            {warningContent}
            <div className="h-6" />
          </div>
        </div>

        {/* Desktop: Centered modal */}
        <div className="hidden lg:block">
          <div className="fixed inset-0 bg-black/50 z-50" onClick={handleCooldownCancel} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            {warningContent}
          </div>
        </div>
      </>
    )
  }

  const modalContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-white">Edit Budget</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-bg-hover rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Entity info */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">
            {entityType === 'campaign' ? 'Campaign' : 'Ad Set'}
          </div>
          <div className="text-sm text-white font-medium truncate" title={entityName}>
            {entityName}
          </div>
          <div className="text-sm text-zinc-400 mt-1">
            Current: ${currentBudget.toFixed(2)}/{currentBudgetType === 'daily' ? 'day' : 'lifetime'}
          </div>
        </div>

        {/* Cooldown info */}
        {!isLoadingHistory && history && history.daysSinceChange !== null && (
          <div className={cn(
            "mb-4 p-3 rounded-lg border text-sm",
            history.daysSinceChange < COOLDOWN_DAYS
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-verdict-scale/10 border-verdict-scale/30"
          )}>
            <div className="flex items-center gap-2">
              <Clock className={cn(
                "w-4 h-4",
                history.daysSinceChange < COOLDOWN_DAYS ? "text-amber-500" : "text-verdict-scale"
              )} />
              <span className={history.daysSinceChange < COOLDOWN_DAYS ? "text-amber-400" : "text-verdict-scale"}>
                Last changed: {history.daysSinceChange} day{history.daysSinceChange !== 1 ? 's' : ''} ago
              </span>
            </div>
            {history.daysSinceChange < COOLDOWN_DAYS && (
              <p className="text-xs text-amber-400/80 mt-1 ml-6">
                Wait {COOLDOWN_DAYS - history.daysSinceChange} more day{COOLDOWN_DAYS - history.daysSinceChange !== 1 ? 's' : ''} recommended
              </p>
            )}
          </div>
        )}

        {/* Quick scale buttons */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Quick Scale</div>
          <div className="flex gap-3">
            <button
              onClick={() => handleQuickScale('down')}
              disabled={isLoading || scaleDownAmount <= 0}
              className="flex-1 py-4 px-4 bg-bg-hover border border-border rounded-lg hover:border-red-500/50 transition-colors disabled:opacity-50 group"
            >
              <div className="flex items-center justify-center gap-2 text-red-400 group-hover:text-red-300">
                <TrendingDown className="w-5 h-5" />
                <span className="font-semibold">↓ {scalePercentage}%</span>
              </div>
              <div className="text-lg font-mono text-white mt-1">${scaleDownAmount.toFixed(2)}</div>
            </button>
            <button
              onClick={() => handleQuickScale('up')}
              disabled={isLoading}
              className="flex-1 py-4 px-4 bg-bg-hover border border-border rounded-lg hover:border-verdict-scale/50 transition-colors disabled:opacity-50 group"
            >
              <div className="flex items-center justify-center gap-2 text-verdict-scale group-hover:text-green-300">
                <TrendingUp className="w-5 h-5" />
                <span className="font-semibold">↑ {scalePercentage}%</span>
              </div>
              <div className="text-lg font-mono text-white mt-1">${scaleUpAmount.toFixed(2)}</div>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-bg-card px-3 text-xs text-zinc-500 uppercase">or set manually</span>
          </div>
        </div>

        {/* Budget type toggle */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Budget Type</div>
          <div className="flex gap-2">
            <button
              onClick={() => setBudgetType('daily')}
              className={cn(
                'flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors border',
                budgetType === 'daily'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-hover text-zinc-400 border-border hover:text-white'
              )}
            >
              Daily
            </button>
            <button
              onClick={() => setBudgetType('lifetime')}
              className={cn(
                'flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors border',
                budgetType === 'lifetime'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-hover text-zinc-400 border-border hover:text-white'
              )}
            >
              Lifetime
            </button>
          </div>
        </div>

        {/* Budget input */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
            {budgetType === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
          </div>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              min="1"
              step="1"
              className="w-full pl-10 pr-4 py-4 bg-bg-dark border border-border rounded-lg text-white text-xl font-mono focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-bg-hover text-zinc-300 rounded-lg font-medium hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Budget'
            )}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile: Bottom sheet */}
      <div className="lg:hidden fixed inset-0 z-50 flex items-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* Sheet */}
        <div className="relative w-full bg-bg-card rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
          {modalContent}
          {/* Safe area padding for iOS */}
          <div className="h-6" />
        </div>
      </div>

      {/* Desktop: Centered modal */}
      <div className="hidden lg:block">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

        {/* Modal */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {modalContent}
        </div>
      </div>
    </>
  )
}
