'use client'

import { useState, useRef, useEffect } from 'react'
import { Star, X, Rocket } from 'lucide-react'
import { cn, formatCurrency, formatROAS } from '@/lib/utils'
import { StarredAd } from '@/lib/supabase'

type StarredAdsPopoverProps = {
  starredAds: StarredAd[]
  onBuildPerformanceSet: () => void
  onUnstarAd?: (adId: string) => Promise<void>
}

export function StarredAdsPopover({ starredAds, onBuildPerformanceSet, onUnstarAd }: StarredAdsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const count = starredAds.length

  return (
    <div className="relative flex-shrink-0">
      {/* Badge Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-all',
          count > 0
            ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
            : 'border-zinc-700 text-zinc-500 bg-zinc-800/50 cursor-default'
        )}
        disabled={count === 0}
        title={count > 0 ? `${count} starred ads` : 'No starred ads'}
      >
        <Star className={cn('w-4 h-4', count > 0 && 'fill-yellow-500')} />
        <span className="font-medium">{count}</span>
        <span className="hidden lg:inline">Starred</span>
      </button>

      {/* Popover */}
      {isOpen && count > 0 && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-96 bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-dark">
            <h3 className="font-semibold text-zinc-200">Starred Ads ({count})</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Starred Ads List */}
          <div className="max-h-64 overflow-y-auto">
            {starredAds.slice(0, 10).map((ad) => (
              <div
                key={ad.id}
                className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors group"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {ad.ad_name}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {ad.campaign_name}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-mono font-semibold text-emerald-400">
                      {formatROAS(ad.roas)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatCurrency(ad.spend)}
                    </div>
                  </div>
                  {onUnstarAd && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await onUnstarAd(ad.ad_id)
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                      title="Remove from starred"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {count > 10 && (
              <div className="px-4 py-2 text-xs text-zinc-500 text-center">
                +{count - 10} more starred ads
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="p-3 border-t border-border bg-bg-dark">
            <button
              onClick={() => {
                setIsOpen(false)
                onBuildPerformanceSet()
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white font-medium rounded-lg transition-colors"
            >
              <Rocket className="w-4 h-4" />
              Build Performance Set
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
