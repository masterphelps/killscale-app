'use client'

import { AlertTriangle, Pause, Play, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ConfirmModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText: string
  confirmType: 'danger' | 'success' | 'warning'
  isLoading?: boolean
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  confirmType,
  isLoading = false
}: ConfirmModalProps) {
  if (!isOpen) return null

  const buttonClass = {
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-500 hover:bg-green-600 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-black'
  }[confirmType]

  const iconClass = {
    danger: 'text-red-500',
    success: 'text-green-500',
    warning: 'text-amber-500'
  }[confirmType]

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-sidebar border border-border rounded-xl p-6 z-50 shadow-xl">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-4', 
          confirmType === 'danger' ? 'bg-red-500/20' : 
          confirmType === 'success' ? 'bg-green-500/20' : 'bg-amber-500/20'
        )}>
          <AlertTriangle className={cn('w-6 h-6', iconClass)} />
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm mb-6">{message}</p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
              buttonClass
            )}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </>
  )
}

// Specific modal for pause/resume actions
type StatusChangeModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  entityName: string
  entityType: 'campaign' | 'adset' | 'ad'
  action: 'pause' | 'resume'
  isLoading?: boolean
}

export function StatusChangeModal({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  entityType,
  action,
  isLoading = false
}: StatusChangeModalProps) {
  if (!isOpen) return null

  const isPause = action === 'pause'
  const entityLabel = entityType === 'adset' ? 'ad set' : entityType

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-sidebar border border-border rounded-xl p-6 z-50 shadow-xl">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mb-4', 
          isPause ? 'bg-amber-500/20' : 'bg-green-500/20'
        )}>
          {isPause ? (
            <Pause className="w-6 h-6 text-amber-500" />
          ) : (
            <Play className="w-6 h-6 text-green-500" />
          )}
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold mb-2">
          {isPause ? 'Pause' : 'Resume'} {entityLabel}?
        </h2>
        <p className="text-zinc-400 text-sm mb-2">
          {isPause 
            ? `This will pause the ${entityLabel} on Meta Ads. No more spend will occur until you resume it.`
            : `This will resume the ${entityLabel} on Meta Ads. It will start spending again based on your budget settings.`
          }
        </p>
        <div className="bg-bg-card border border-border rounded-lg px-3 py-2 mb-6">
          <span className="text-xs text-zinc-500 uppercase">{entityLabel}</span>
          <div className="text-sm font-medium truncate">{entityName}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50',
              isPause 
                ? 'bg-amber-500 hover:bg-amber-600 text-black'
                : 'bg-green-500 hover:bg-green-600 text-white'
            )}
          >
            {isLoading ? (
              'Processing...'
            ) : (
              <>
                {isPause ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPause ? 'Pause' : 'Resume'}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}

// Modal for delete actions with cascade warning
type DeleteEntityModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  entityName: string
  entityType: 'campaign' | 'adset' | 'ad'
  childCount?: { adsets?: number; ads?: number }
  isLoading?: boolean
}

export function DeleteEntityModal({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  entityType,
  childCount,
  isLoading = false
}: DeleteEntityModalProps) {
  if (!isOpen) return null

  const entityLabel = entityType === 'adset' ? 'ad set' : entityType

  // Build cascade warning message
  let cascadeMessage = ''
  if (entityType === 'campaign' && childCount) {
    const parts = []
    if (childCount.adsets && childCount.adsets > 0) {
      parts.push(`${childCount.adsets} ad set${childCount.adsets !== 1 ? 's' : ''}`)
    }
    if (childCount.ads && childCount.ads > 0) {
      parts.push(`${childCount.ads} ad${childCount.ads !== 1 ? 's' : ''}`)
    }
    if (parts.length > 0) {
      cascadeMessage = `This will also delete ${parts.join(' and ')}.`
    }
  } else if (entityType === 'adset' && childCount?.ads && childCount.ads > 0) {
    cascadeMessage = `This will also delete ${childCount.ads} ad${childCount.ads !== 1 ? 's' : ''}.`
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-sidebar border border-border rounded-xl p-6 z-50 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold mb-2">
          Delete {entityLabel}?
        </h2>
        <p className="text-zinc-400 text-sm mb-2">
          This action cannot be undone. The {entityLabel} will be permanently deleted from Meta Ads.
        </p>
        {cascadeMessage && (
          <p className="text-red-400 text-sm mb-2 font-medium">
            {cascadeMessage}
          </p>
        )}
        <div className="bg-bg-card border border-border rounded-lg px-3 py-2 mb-6">
          <span className="text-xs text-zinc-500 uppercase">{entityLabel}</span>
          <div className="text-sm font-medium truncate">{entityName}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-bg-card border border-border rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              'Deleting...'
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
