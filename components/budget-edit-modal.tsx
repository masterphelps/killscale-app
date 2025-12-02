'use client'

import { useState, useEffect, useRef } from 'react'
import { X, DollarSign, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type BudgetEditModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (newBudget: number, budgetType: 'daily' | 'lifetime') => Promise<void>
  entityName: string
  entityType: 'campaign' | 'adset'
  currentBudgetType: 'daily' | 'lifetime'
  currentBudget: number
}

export function BudgetEditModal({
  isOpen,
  onClose,
  onSave,
  entityName,
  entityType,
  currentBudgetType,
  currentBudget,
}: BudgetEditModalProps) {
  const [budget, setBudget] = useState(currentBudget.toString())
  const [budgetType, setBudgetType] = useState<'daily' | 'lifetime'>(currentBudgetType)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setBudget(currentBudget.toString())
      setBudgetType(currentBudgetType)
      setError(null)
      // Focus input after a short delay to allow modal animation
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [isOpen, currentBudget, currentBudgetType])

  const handleSave = async () => {
    const numericBudget = parseFloat(budget)

    if (isNaN(numericBudget) || numericBudget <= 0) {
      setError('Please enter a valid budget amount')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await onSave(numericBudget, budgetType)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const ModalContent = () => (
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
          {budgetType === 'daily' && (
            <p className="text-xs text-zinc-500 mt-2">
              This amount will be spent each day
            </p>
          )}
          {budgetType === 'lifetime' && (
            <p className="text-xs text-zinc-500 mt-2">
              Total amount to spend over the campaign lifetime
            </p>
          )}
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
          <ModalContent />
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
          <ModalContent />
        </div>
      </div>
    </>
  )
}
