'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Star, X, Rocket, ChevronDown, ChevronRight } from 'lucide-react'
import { cn, formatCurrency, formatROAS } from '@/lib/utils'
import { StarredAd } from '@/lib/supabase'

type StarredAdsPopoverProps = {
  starredAds: StarredAd[]
  starCountMap?: Record<string, number>  // creative_id -> count
  onBuildPerformanceSet: () => void
  onUnstarAd?: (adId: string) => Promise<void>
}

// Group starred ads by creative
type CreativeGroup = {
  creativeId: string
  creativeName: string  // Use first ad name as creative name
  starCount: number
  audiences: string[]  // adset names
  ads: StarredAd[]
  totalSpend: number
  totalRevenue: number
  avgRoas: number
  bestRoas: number
}

export function StarredAdsPopover({ starredAds, starCountMap, onBuildPerformanceSet, onUnstarAd }: StarredAdsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'creative' | 'ad'>('creative')
  const [expandedCreatives, setExpandedCreatives] = useState<Set<string>>(new Set())
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

  // Group ads by creative
  const creativeGroups = useMemo(() => {
    const groups: Record<string, CreativeGroup> = {}

    starredAds.forEach(ad => {
      // Group by creative_id if available, otherwise by ad_name (copied ads often keep same name)
      const key = ad.creative_id || ad.ad_name || ad.ad_id

      if (!groups[key]) {
        groups[key] = {
          creativeId: key,
          creativeName: ad.ad_name,
          starCount: 1,
          audiences: [ad.adset_name],
          ads: [ad],
          totalSpend: ad.spend,
          totalRevenue: ad.revenue,
          avgRoas: ad.roas,
          bestRoas: ad.roas
        }
      } else {
        groups[key].starCount++
        if (!groups[key].audiences.includes(ad.adset_name)) {
          groups[key].audiences.push(ad.adset_name)
        }
        groups[key].ads.push(ad)
        groups[key].totalSpend += ad.spend
        groups[key].totalRevenue += ad.revenue
        groups[key].bestRoas = Math.max(groups[key].bestRoas, ad.roas)
      }
    })

    // Calculate avg ROAS
    Object.values(groups).forEach(group => {
      group.avgRoas = group.totalSpend > 0 ? group.totalRevenue / group.totalSpend : 0
    })

    return Object.values(groups).sort((a, b) => b.starCount - a.starCount)
  }, [starredAds])

  // Separate into universal (3+) and single (1-2)
  const universalCreatives = creativeGroups.filter(g => g.starCount >= 3)
  const singleCreatives = creativeGroups.filter(g => g.starCount < 3)

  const count = starredAds.length
  const creativeCount = creativeGroups.length

  const toggleCreative = (creativeId: string) => {
    setExpandedCreatives(prev => {
      const next = new Set(prev)
      if (next.has(creativeId)) {
        next.delete(creativeId)
      } else {
        next.add(creativeId)
      }
      return next
    })
  }

  return (
    <div className="relative flex-shrink-0">
      {/* Badge Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-all',
          count > 0
            ? universalCreatives.length > 0
              ? 'border-green-500/30 text-green-500 bg-green-500/10 hover:bg-green-500/20'
              : 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20'
            : 'border-zinc-700 text-zinc-500 bg-zinc-800/50 cursor-default'
        )}
        disabled={count === 0}
        title={count > 0 ? `${creativeCount} starred creatives (${count} total stars)` : 'No starred ads'}
      >
        <Star className={cn('w-4 h-4', count > 0 && (universalCreatives.length > 0 ? 'fill-green-500' : 'fill-yellow-500'))} />
        <span className="font-medium">{creativeCount}</span>
        <span className="hidden lg:inline">Starred</span>
      </button>

      {/* Popover */}
      {isOpen && count > 0 && (
        <div
          ref={popoverRef}
          className="fixed lg:absolute right-2 lg:right-0 left-2 lg:left-auto top-16 lg:top-full mt-0 lg:mt-2 lg:w-[420px] bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-dark">
            <div>
              <h3 className="font-semibold text-zinc-200">Starred Creatives</h3>
              <p className="text-xs text-zinc-500">{creativeCount} creatives • {count} total stars</p>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setViewMode('creative')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    viewMode === 'creative' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
                  )}
                >
                  By Creative
                </button>
                <button
                  onClick={() => setViewMode('ad')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    viewMode === 'ad' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'
                  )}
                >
                  By Ad
                </button>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto overscroll-contain">
            {viewMode === 'creative' ? (
              <>
                {/* Universal Performers Section */}
                {universalCreatives.length > 0 && (
                  <div className="border-b border-border">
                    <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                      <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
                        🌟 Universal Performers ({universalCreatives.length})
                      </span>
                      <span className="text-xs text-green-400/70 ml-2">3+ audiences</span>
                    </div>
                    {universalCreatives.map(group => (
                      <CreativeGroupRow
                        key={group.creativeId}
                        group={group}
                        isExpanded={expandedCreatives.has(group.creativeId)}
                        onToggle={() => toggleCreative(group.creativeId)}
                        onUnstarAd={onUnstarAd}
                        isUniversal
                      />
                    ))}
                  </div>
                )}

                {/* Single Audience Section */}
                {singleCreatives.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-zinc-800/50 border-b border-border">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                        ⭐ Single Audience ({singleCreatives.length})
                      </span>
                      <span className="text-xs text-zinc-500 ml-2">1-2 audiences</span>
                    </div>
                    {singleCreatives.map(group => (
                      <CreativeGroupRow
                        key={group.creativeId}
                        group={group}
                        isExpanded={expandedCreatives.has(group.creativeId)}
                        onToggle={() => toggleCreative(group.creativeId)}
                        onUnstarAd={onUnstarAd}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Original Ad View */
              starredAds.slice(0, 15).map((ad) => (
                <div
                  key={ad.id}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 hover:bg-bg-hover transition-colors group"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="text-sm font-medium text-zinc-200 truncate">
                      {ad.ad_name}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {ad.adset_name} • {ad.campaign_name}
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
              ))
            )}
          </div>

          {/* Action Button */}
          <div className="p-3 border-t border-border bg-bg-dark">
            {universalCreatives.length > 0 && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-2 mb-2">
                <p className="text-green-400 text-xs">
                  💡 You have {universalCreatives.length} universal creative{universalCreatives.length > 1 ? 's' : ''} — ideal for Advantage+ campaigns.
                </p>
              </div>
            )}
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

// Creative Group Row Component
function CreativeGroupRow({
  group,
  isExpanded,
  onToggle,
  onUnstarAd,
  isUniversal = false
}: {
  group: CreativeGroup
  isExpanded: boolean
  onToggle: () => void
  onUnstarAd?: (adId: string) => Promise<void>
  isUniversal?: boolean
}) {
  return (
    <div className="border-b border-border/50">
      {/* Main Row */}
      <div
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
          isUniversal ? 'hover:bg-green-500/5' : 'hover:bg-bg-hover'
        )}
      >
        {/* Expand Icon */}
        <button className="text-zinc-500">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Creative Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200 truncate">{group.creativeName}</span>
            <span className={cn(
              'text-xs font-bold px-1.5 py-0.5 rounded',
              isUniversal ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-500'
            )}>
              ⭐×{group.starCount}
            </span>
          </div>
          <div className="text-xs text-zinc-500 truncate mt-0.5">
            {group.audiences.slice(0, 3).join(', ')}
            {group.audiences.length > 3 && ` +${group.audiences.length - 3} more`}
          </div>
        </div>

        {/* Metrics */}
        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Avg: <span className="text-emerald-400 font-mono">{formatROAS(group.avgRoas)}</span></span>
            <span>Best: <span className="text-emerald-400 font-mono">{formatROAS(group.bestRoas)}</span></span>
          </div>
          <div className="text-xs text-zinc-500">
            {formatCurrency(group.totalSpend)} spend
          </div>
        </div>
      </div>

      {/* Expanded: Show individual ads */}
      {isExpanded && (
        <div className="bg-zinc-900/50 border-t border-border/30">
          {group.ads.map(ad => (
            <div
              key={ad.id}
              className="flex items-center justify-between px-4 py-2 pl-12 hover:bg-bg-hover transition-colors group"
            >
              <div className="flex-1 min-w-0 pr-3">
                <div className="text-xs text-zinc-300 truncate">{ad.ad_name}</div>
                <div className="text-xs text-zinc-600 truncate">{ad.adset_name}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-mono text-emerald-400">{formatROAS(ad.roas)}</span>
                {onUnstarAd && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      await onUnstarAd(ad.ad_id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                    title="Remove star"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
