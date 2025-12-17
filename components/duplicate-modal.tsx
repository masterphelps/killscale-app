'use client'

import { useState, useMemo } from 'react'
import { X, Copy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DuplicateItem {
  id: string
  type: 'campaign' | 'adset' | 'ad'
  name: string
  parentCampaignId?: string
  parentAdsetId?: string
}

interface DuplicateModalProps {
  isOpen: boolean
  onClose: () => void
  items: DuplicateItem[]
  onConfirm: (options: {
    newNames: Record<string, string>
    createPaused: boolean
  }) => Promise<void>
}

export function DuplicateModal({
  isOpen,
  onClose,
  items,
  onConfirm
}: DuplicateModalProps) {
  // Generate initial names with " - Copy" suffix
  const initialNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const item of items) {
      names[item.id] = `${item.name} - Copy`
    }
    return names
  }, [items])

  const [newNames, setNewNames] = useState<Record<string, string>>(initialNames)
  const [createPaused, setCreatePaused] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  // Reset names when items change
  useMemo(() => {
    setNewNames(initialNames)
  }, [initialNames])

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm({ newNames, createPaused })
      onClose()
    } catch (err) {
      console.error('Duplicate error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const updateName = (id: string, name: string) => {
    setNewNames(prev => ({ ...prev, [id]: name }))
  }

  // Count by type
  const campaignCount = items.filter(i => i.type === 'campaign').length
  const adsetCount = items.filter(i => i.type === 'adset').length
  const adCount = items.filter(i => i.type === 'ad').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold">Duplicate {items.length} item{items.length > 1 ? 's' : ''}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white hover:bg-bg-hover rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            {campaignCount > 0 && (
              <span className="px-2 py-0.5 bg-hierarchy-campaign/20 text-hierarchy-campaign rounded">
                {campaignCount} campaign{campaignCount > 1 ? 's' : ''}
              </span>
            )}
            {adsetCount > 0 && (
              <span className="px-2 py-0.5 bg-hierarchy-adset/20 text-hierarchy-adset rounded">
                {adsetCount} ad set{adsetCount > 1 ? 's' : ''}
              </span>
            )}
            {adCount > 0 && (
              <span className="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded">
                {adCount} ad{adCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Name editing */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              New names
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                    item.type === 'campaign'
                      ? "bg-hierarchy-campaign/20 text-hierarchy-campaign"
                      : item.type === 'adset'
                        ? "bg-hierarchy-adset/20 text-hierarchy-adset"
                        : "bg-zinc-700 text-zinc-300"
                  )}>
                    {item.type === 'campaign' ? 'Campaign' : item.type === 'adset' ? 'Ad Set' : 'Ad'}
                  </span>
                  <input
                    type="text"
                    value={newNames[item.id] || ''}
                    onChange={(e) => updateName(item.id, e.target.value)}
                    className="flex-1 px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
                    placeholder="Enter new name"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createPaused"
              checked={createPaused}
              onChange={(e) => setCreatePaused(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-bg-dark text-accent focus:ring-accent"
            />
            <label htmlFor="createPaused" className="text-sm text-zinc-300">
              Create as paused (recommended)
            </label>
          </div>

          {/* Info */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
            <p>
              {campaignCount > 0 && "Campaigns will be duplicated with all their ad sets and ads. "}
              {adsetCount > 0 && "Ad sets will be duplicated with all their ads. "}
              {adCount > 0 && "Ads will be duplicated with their creatives. "}
              All settings, targeting, and creatives will be copied.
            </p>
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
            disabled={isLoading || items.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors",
              (isLoading || items.length === 0) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
        </div>
      </div>
    </div>
  )
}
