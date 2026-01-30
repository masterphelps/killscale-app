'use client'

import { Film, RefreshCw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  type: 'creative' | 'media'
  onSync?: () => void
  onUpload?: () => void
}

export function EmptyState({ type, onSync, onUpload }: EmptyStateProps) {
  const isCreative = type === 'creative'

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-6">
        <Film className="w-10 h-10 text-zinc-500" />
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-white mb-2">
        No {isCreative ? 'creatives' : 'media'} found
      </h3>

      {/* Description */}
      <p className="text-zinc-400 text-center max-w-md mb-8">
        {isCreative
          ? 'Sync your Meta ad account to analyze creative performance and identify your winning ads.'
          : 'Sync your Meta ad account to see all your media assets and their performance across campaigns.'}
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl',
            'bg-accent hover:bg-accent-hover text-white',
            'font-medium text-sm transition-colors'
          )}
        >
          <RefreshCw className="w-4 h-4" />
          Sync Now
        </button>

        <button
          onClick={onUpload}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl',
            'bg-bg-card hover:bg-bg-hover text-zinc-300',
            'border border-border hover:border-zinc-600',
            'font-medium text-sm transition-colors'
          )}
        >
          <Upload className="w-4 h-4" />
          Upload CSV
        </button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-zinc-600 mt-6">
        Make sure your Meta account is connected in Settings
      </p>
    </div>
  )
}
