'use client'

import { X, CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OperationResult {
  id: string
  name: string
  success: boolean
  error?: string
}

interface BulkOperationProgressProps {
  isOpen: boolean
  title: string
  total: number
  completed: number
  failed: number
  currentItem?: string
  results: OperationResult[]
  onClose: () => void
  onRetryFailed?: () => void
}

export function BulkOperationProgress({
  isOpen,
  title,
  total,
  completed,
  failed,
  currentItem,
  results,
  onClose,
  onRetryFailed
}: BulkOperationProgressProps) {
  if (!isOpen) return null

  const succeeded = completed - failed
  const isComplete = completed === total
  const progress = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">{title}</h3>
          {isComplete && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-white hover:bg-bg-hover rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-4">
          <div className="h-2 bg-bg-hover rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300 ease-out",
                failed > 0 ? "bg-gradient-to-r from-verdict-scale to-red-500" : "bg-verdict-scale"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className="text-zinc-400">
              {isComplete ? 'Complete' : `Processing ${completed + 1} of ${total}`}
            </span>
            <span className="text-zinc-400">
              {succeeded} succeeded{failed > 0 && <span className="text-red-400">, {failed} failed</span>}
            </span>
          </div>
        </div>

        {/* Current item */}
        {!isComplete && currentItem && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span className="truncate">{currentItem}</span>
            </div>
          </div>
        )}

        {/* Results list */}
        {results.length > 0 && (
          <div className="px-4 py-2 max-h-60 overflow-y-auto">
            <div className="space-y-1">
              {results.map((result) => (
                <div
                  key={result.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                    result.success ? "bg-verdict-scale/10" : "bg-red-500/10"
                  )}
                >
                  {result.success ? (
                    <CheckCircle2 className="w-4 h-4 text-verdict-scale flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                  <span className={cn(
                    "truncate",
                    result.success ? "text-verdict-scale" : "text-red-400"
                  )}>
                    {result.name}
                  </span>
                  {result.error && (
                    <span className="text-xs text-red-400/70 truncate ml-auto">
                      {result.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          {isComplete && failed > 0 && onRetryFailed && (
            <button
              onClick={onRetryFailed}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Failed ({failed})
            </button>
          )}
          {isComplete && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
