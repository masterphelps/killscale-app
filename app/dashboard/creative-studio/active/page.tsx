'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Zap, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { FunnelFilterBar, GalleryGrid, StarredMediaBar } from '@/components/creative-studio'
import { DatePicker, DatePickerButton, DATE_PRESETS } from '@/components/date-picker'
import { LaunchWizard } from '@/components/launch-wizard'
import { useCreativeStudio } from '../creative-studio-context'
import type { ActiveAd } from '../creative-studio-context'
import { activeAdToStudioAsset } from '@/lib/creative-studio-mappers'
import type { StudioAsset } from '@/components/creative-studio/types'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'
type SortField = 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore' | 'spend' | 'roas'
type StatusFilter = 'all' | 'active' | 'paused'

interface ResolvedMedia {
  storageUrl: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
}

const formatCurrency = (val: number) => {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
  return `$${val.toFixed(2)}`
}

export default function ActiveAdsPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const {
    activeAds,
    isLoadingActiveAds,
    assets,
    videoSources,
    fetchVideoSource,
    openTheaterWithAsset,
    starredIds,
    toggleStar,
    clearStarred,
    datePreset,
    setDatePreset,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    showDatePicker,
    setShowDatePicker,
  } = useCreativeStudio()

  // Build media_hash → asset lookup from the SAME assets array the media page uses
  const mediaMap = useMemo(() => {
    const map = new Map<string, { storageUrl: string | null; imageUrl: string | null; thumbnailUrl: string | null }>()
    for (const a of assets) {
      if (a.mediaHash) {
        map.set(a.mediaHash, {
          storageUrl: a.storageUrl,
          imageUrl: a.imageUrl,
          thumbnailUrl: a.thumbnailUrl,
        })
      }
    }
    return map
  }, [assets])

  // Resolve media URLs for an ad — try media_library (via assets) first,
  // then API-provided URLs, then ad_data fallbacks
  const resolveMedia = useCallback((ad: ActiveAd): ResolvedMedia => {
    // 1. From assets context (same source as media page)
    if (ad.media_hash) {
      const asset = mediaMap.get(ad.media_hash)
      if (asset && (asset.storageUrl || asset.imageUrl || asset.thumbnailUrl)) {
        return asset
      }
    }
    // 2. From API enrichment (media_library lookup server-side)
    if (ad.storageUrl || ad.imageUrl || ad.thumbnailUrl) {
      return { storageUrl: ad.storageUrl, imageUrl: ad.imageUrl, thumbnailUrl: ad.thumbnailUrl }
    }
    // 3. Fallback to ad_data Meta CDN URLs (thumbnail_url / image_url with underscores)
    if (ad.thumbnail_url || ad.image_url) {
      const isVideo = ad.media_type === 'video' || !!ad.video_id
      return {
        storageUrl: null,
        imageUrl: isVideo ? null : (ad.image_url || ad.thumbnail_url),
        thumbnailUrl: isVideo ? (ad.thumbnail_url || ad.image_url) : null,
      }
    }
    return { storageUrl: null, imageUrl: null, thumbnailUrl: null }
  }, [mediaMap])

  const [sortBy, setSortBy] = useState<SortField>('spend')
  const [sortDesc, setSortDesc] = useState(true)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSortDropdown])

  const [funnelThresholds, setFunnelThresholds] = useState<Record<FunnelStage, number | null>>({
    hook: null, hold: null, click: null, convert: null, scale: null,
  })

  const scaleThreshold = useMemo(() => {
    const spends = activeAds.filter(a => a.spend > 0).map(a => a.spend).sort((a, b) => a - b)
    if (spends.length === 0) return 0
    const mid = Math.floor(spends.length / 2)
    return (spends.length % 2 === 0 ? (spends[mid - 1] + spends[mid]) / 2 : spends[mid]) * 2
  }, [activeAds])

  const funnelStats = useMemo(() => {
    const total = activeAds.length
    const t = (stage: FunnelStage) => funnelThresholds[stage] ?? 75
    return {
      hook: { good: activeAds.filter(a => (a.hookScore ?? 0) >= t('hook')).length, total },
      hold: { good: activeAds.filter(a => (a.holdScore ?? 0) >= t('hold')).length, total },
      click: { good: activeAds.filter(a => (a.clickScore ?? 0) >= t('click')).length, total },
      convert: { good: activeAds.filter(a => (a.convertScore ?? 0) >= t('convert')).length, total },
      scale: { good: activeAds.filter(a => a.spend >= scaleThreshold).length, total },
    }
  }, [activeAds, scaleThreshold, funnelThresholds])

  const toggleFunnelFilter = useCallback((stage: FunnelStage) => {
    setFunnelThresholds(prev => ({ ...prev, [stage]: prev[stage] !== null ? null : 75 }))
  }, [])

  const setFunnelThreshold = useCallback((stage: FunnelStage, value: number) => {
    setFunnelThresholds(prev => ({ ...prev, [stage]: value }))
  }, [])

  const clearFunnelFilters = useCallback(() => {
    setFunnelThresholds({ hook: null, hold: null, click: null, convert: null, scale: null })
  }, [])

  // Status counts for filter tabs
  const statusCounts = useMemo(() => ({
    all: activeAds.length,
    active: activeAds.filter(a => a.status === 'ACTIVE').length,
    paused: activeAds.filter(a => a.status === 'PAUSED').length,
  }), [activeAds])

  const filteredAds = useMemo(() => {
    let items = [...activeAds]

    // Apply status filter
    if (statusFilter === 'active') {
      items = items.filter(a => a.status === 'ACTIVE')
    } else if (statusFilter === 'paused') {
      items = items.filter(a => a.status === 'PAUSED')
    }

    const activeStages = (Object.entries(funnelThresholds) as [FunnelStage, number | null][]).filter(([, v]) => v !== null)
    if (activeStages.length > 0) {
      items = items.filter(item => {
        for (const [stage, threshold] of activeStages) {
          if (stage === 'hook' && (item.hookScore ?? 0) < threshold!) return false
          if (stage === 'hold' && (item.holdScore ?? 0) < threshold!) return false
          if (stage === 'click' && (item.clickScore ?? 0) < threshold!) return false
          if (stage === 'convert' && (item.convertScore ?? 0) < threshold!) return false
          if (stage === 'scale' && item.spend < scaleThreshold) return false
        }
        return true
      })
    }

    items.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'hookScore': cmp = (a.hookScore ?? -1) - (b.hookScore ?? -1); break
        case 'holdScore': cmp = (a.holdScore ?? -1) - (b.holdScore ?? -1); break
        case 'clickScore': cmp = (a.clickScore ?? -1) - (b.clickScore ?? -1); break
        case 'convertScore': cmp = (a.convertScore ?? -1) - (b.convertScore ?? -1); break
        case 'spend': cmp = a.spend - b.spend; break
        case 'roas': cmp = a.roas - b.roas; break
      }
      return sortDesc ? -cmp : cmp
    })

    return items
  }, [activeAds, statusFilter, funnelThresholds, scaleThreshold, sortBy, sortDesc])

  // Build media_hash → fatigue lookup from assets (which have fatigue calculated)
  const fatigueMap = useMemo(() => {
    const map = new Map<string, { fatigueScore: number; fatigueStatus: 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued' }>()
    for (const a of assets) {
      if (a.mediaHash) {
        map.set(a.mediaHash, { fatigueScore: a.fatigueScore, fatigueStatus: a.fatigueStatus })
      }
    }
    return map
  }, [assets])

  // Map ActiveAd[] → StudioAsset[] for GalleryGrid
  const galleryItems = useMemo(() => {
    return filteredAds.map(ad => {
      const item = activeAdToStudioAsset(ad, resolveMedia(ad))
      // Enrich with fatigue data from assets
      const fatigue = ad.media_hash ? fatigueMap.get(ad.media_hash) : null
      if (fatigue) {
        item.fatigueScore = fatigue.fatigueScore
        item.fatigueStatus = fatigue.fatigueStatus
      }
      // Mark starred state
      item.isStarred = starredIds.has(item.id)
      return item
    })
  }, [filteredAds, resolveMedia, fatigueMap, starredIds])

  // Build lookup from id (ad_id) to gallery item for theater open
  const galleryItemMap = useMemo(() => {
    const map = new Map<string, typeof galleryItems[number]>()
    for (const item of galleryItems) map.set(item.id, item)
    return map
  }, [galleryItems])

  const getCustomMetrics = useCallback((item: StudioAsset) => {
    // Find the original ad to get purchases/CPA
    const ad = filteredAds.find(a => a.ad_id === item.id)
    return [
      { label: 'ROAS', value: `${item.roas.toFixed(2)}x` },
      { label: 'CPA', value: ad && ad.cpa > 0 ? `$${ad.cpa.toFixed(2)}` : '\u2014' },
      { label: 'Spend', value: formatCurrency(item.spend) },
    ]
  }, [filteredAds])

  const getSubtitle = useCallback((item: StudioAsset) => {
    const ad = filteredAds.find(a => a.ad_id === item.id)
    return ad?.campaign_name || undefined
  }, [filteredAds])

  if (!user || !currentAccountId) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-zinc-500">Loading...</div></div>
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Constrained content area - matches gallery width */}
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">Ads</h1>
              <p className="text-zinc-500 mt-1">Individual ads with performance scores</p>
            </div>
            <button
              onClick={() => setShowLaunchWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          </div>

          {/* Funnel Filters + Sort Controls */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="w-full lg:flex-1 lg:min-w-0">
              <FunnelFilterBar
                thresholds={funnelThresholds}
                onToggle={toggleFunnelFilter}
                onSetThreshold={setFunnelThreshold}
                onClear={clearFunnelFilters}
                stats={funnelStats}
              />
            </div>

            <div className="flex items-center justify-between lg:justify-end gap-3 flex-shrink-0">
              {/* Date Picker */}
              <div className="relative">
                <DatePickerButton
                  label={
                    datePreset === 'custom' && customStartDate && customEndDate
                      ? `${customStartDate} – ${customEndDate}`
                      : DATE_PRESETS.find(p => p.value === datePreset)?.label || 'Last 90 Days'
                  }
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  isOpen={showDatePicker}
                />
                <DatePicker
                  isOpen={showDatePicker}
                  onClose={() => setShowDatePicker(false)}
                  datePreset={datePreset}
                  onPresetChange={(preset) => {
                    setDatePreset(preset)
                    if (preset !== 'custom') setShowDatePicker(false)
                  }}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onCustomDateChange={(start, end) => {
                    setCustomStartDate(start)
                    setCustomEndDate(end)
                  }}
                  onApply={() => {
                    setDatePreset('custom')
                    setShowDatePicker(false)
                  }}
                />
              </div>

              {/* Status Filter Dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-bg-card border border-border rounded-xl px-4 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent"
              >
                <option value="active">Active ({statusCounts.active})</option>
                <option value="paused">Paused ({statusCounts.paused})</option>
                <option value="all">All ({statusCounts.all})</option>
              </select>

              {/* Sort Dropdown */}
              <div className="relative" ref={sortDropdownRef}>
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all duration-200 bg-bg-card border-border text-zinc-300 hover:border-border/50"
                >
                  <span className="text-zinc-500">Sort:</span>
                  <span>{
                    sortBy === 'hookScore' ? 'Hook' :
                    sortBy === 'holdScore' ? 'Hold' :
                    sortBy === 'clickScore' ? 'Click' :
                    sortBy === 'convertScore' ? 'Convert' :
                    sortBy === 'spend' ? 'Spend' :
                    sortBy === 'roas' ? 'ROAS' : sortBy
                  }</span>
                  <span className="text-zinc-500">{sortDesc ? '↓' : '↑'}</span>
                </button>

                {showSortDropdown && (
                  <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-2 w-48 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {([
                      { value: 'spend', label: 'Spend' },
                      { value: 'roas', label: 'ROAS' },
                      { value: 'hookScore', label: 'Hook' },
                      { value: 'holdScore', label: 'Hold' },
                      { value: 'clickScore', label: 'Click' },
                      { value: 'convertScore', label: 'Convert' },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          if (sortBy === option.value) {
                            setSortDesc(!sortDesc)
                          } else {
                            setSortBy(option.value as SortField)
                            setSortDesc(true)
                          }
                          setShowSortDropdown(false)
                        }}
                        className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between transition-colors ${
                          sortBy === option.value
                            ? 'bg-indigo-500/20 text-indigo-400'
                            : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                          <span className="text-xs">{sortDesc ? '↓ High to Low' : '↑ Low to High'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        <div className="text-sm text-zinc-500">
          {filteredAds.length} {statusFilter === 'all' ? 'ads' : statusFilter === 'active' ? 'active ads' : 'paused ads'}
        </div>

        {isLoadingActiveAds ? (
          <GalleryGrid items={[]} isLoading={true} onSelect={() => {}} />
        ) : filteredAds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Zap className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No {statusFilter === 'all' ? 'ads' : statusFilter === 'active' ? 'active ads' : 'paused ads'}
            </h3>
            <p className="text-sm text-zinc-500">
              {statusFilter === 'all'
                ? 'No ads found for this account'
                : statusFilter === 'active'
                ? 'No active ads found for this account'
                : 'No paused ads found for this account'}
            </p>
          </div>
        ) : (
          <GalleryGrid
            items={galleryItems}
            isLoading={false}
            onSelect={(id) => {
              const item = galleryItemMap.get(id)
              if (item) openTheaterWithAsset(item)
            }}
            onStar={(id) => toggleStar(id)}
            videoSources={videoSources}
            onRequestVideoSource={fetchVideoSource}
            customMetrics={getCustomMetrics}
            subtitle={getSubtitle}
          />
        )}
        </div>
      </div>

      {/* Starred Media Bar */}
      <StarredMediaBar
        starredCount={starredIds.size}
        onBuildAds={() => {
          // TODO: Open launch wizard with starred items
          console.log('Build ads from starred:', Array.from(starredIds))
        }}
        onClear={clearStarred}
      />

      {/* Launch Wizard - Full Screen Overlay */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <div className="min-h-screen px-4 py-8">
            <LaunchWizard
              adAccountId={currentAccountId}
              onComplete={() => setShowLaunchWizard(false)}
              onCancel={() => setShowLaunchWizard(false)}
              initialEntityType="campaign"
            />
          </div>
        </div>
      )}
    </div>
  )
}
