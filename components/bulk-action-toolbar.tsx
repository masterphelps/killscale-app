'use client'

import { useState } from 'react'
import { Play, Pause, Trash2, Copy, TrendingUp, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectedItem {
  id: string
  type: 'campaign' | 'adset' | 'ad'
  name: string
  status: string
  parentCampaignId?: string
  parentAdsetId?: string
  budget?: number
  budgetType?: 'daily' | 'lifetime'
  isCBO?: boolean
}

interface BulkActionToolbarProps {
  selectedItems: Map<string, SelectedItem>
  onPause: () => void
  onResume: () => void
  onDelete: () => void
  onDuplicate: () => void
  onScaleBudget: () => void
  onCopyAds: () => void
  onClear: () => void
  isLoading: boolean
  loadingAction?: 'pause' | 'resume' | 'delete' | 'duplicate' | 'scale' | 'copy' | null
}

export function BulkActionToolbar({
  selectedItems,
  onPause,
  onResume,
  onDelete,
  onDuplicate,
  onScaleBudget,
  onCopyAds,
  onClear,
  isLoading,
  loadingAction
}: BulkActionToolbarProps) {
  const items = Array.from(selectedItems.values())
  const count = items.length

  if (count === 0) return null

  // Calculate what's selected
  const hasAds = items.some(item => item.type === 'ad')
  const hasBudgetItems = items.some(item =>
    (item.type === 'campaign' && item.isCBO && item.budget) ||
    (item.type === 'adset' && item.budget)
  )
  const allPaused = items.every(item => item.status === 'PAUSED')
  const allActive = items.every(item => item.status === 'ACTIVE')
  const mixedStatus = !allPaused && !allActive

  // Count by type
  const campaignCount = items.filter(i => i.type === 'campaign').length
  const adsetCount = items.filter(i => i.type === 'adset').length
  const adCount = items.filter(i => i.type === 'ad').length

  // Build selection summary
  const parts: string[] = []
  if (campaignCount > 0) parts.push(`${campaignCount} campaign${campaignCount > 1 ? 's' : ''}`)
  if (adsetCount > 0) parts.push(`${adsetCount} ad set${adsetCount > 1 ? 's' : ''}`)
  if (adCount > 0) parts.push(`${adCount} ad${adCount > 1 ? 's' : ''}`)
  const selectionSummary = parts.join(', ')

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 bg-bg-card/95 backdrop-blur-lg border border-border rounded-full px-4 py-2 shadow-2xl">
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <span className="bg-accent text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {count}
          </span>
          <span className="text-sm text-zinc-400 hidden sm:inline">
            {selectionSummary}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Pause/Resume based on selection state */}
          {(allPaused || mixedStatus) && (
            <button
              onClick={onResume}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                "bg-verdict-scale/20 text-verdict-scale hover:bg-verdict-scale/30",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              title="Activate selected"
            >
              {loadingAction === 'resume' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Activate</span>
            </button>
          )}

          {(allActive || mixedStatus) && (
            <button
              onClick={onPause}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              title="Pause selected"
            >
              {loadingAction === 'pause' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Pause</span>
            </button>
          )}

          {/* Duplicate */}
          <button
            onClick={onDuplicate}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            title="Duplicate selected"
          >
            {loadingAction === 'duplicate' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Duplicate</span>
          </button>

          {/* Scale Budget - only show if budget items selected */}
          {hasBudgetItems && (
            <button
              onClick={onScaleBudget}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              title="Scale budget"
            >
              {loadingAction === 'scale' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Scale</span>
            </button>
          )}

          {/* Copy Ads - only show if ads selected */}
          {hasAds && (
            <button
              onClick={onCopyAds}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              title="Copy ads to another ad set"
            >
              {loadingAction === 'copy' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Copy to...</span>
            </button>
          )}

          {/* Delete */}
          <button
            onClick={onDelete}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              "bg-red-500/20 text-red-400 hover:bg-red-500/30",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
            title="Delete selected"
          >
            {loadingAction === 'delete' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>

        {/* Clear selection */}
        <button
          onClick={onClear}
          disabled={isLoading}
          className="p-1.5 text-zinc-500 hover:text-white hover:bg-bg-hover rounded-full transition-colors ml-1"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
