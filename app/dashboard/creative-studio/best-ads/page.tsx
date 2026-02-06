'use client'

import { useState, useMemo, useCallback } from 'react'
import { Trophy } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { FunnelFilterBar, GalleryGrid, StarredMediaBar } from '@/components/creative-studio'
import { useCreativeStudio } from '../creative-studio-context'
import type { ActiveAd } from '../creative-studio-context'
import { activeAdToStudioAsset } from '@/lib/creative-studio-mappers'
import type { StudioAsset } from '@/components/creative-studio/types'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'
type ScoreField = 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore'

const BUCKET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e']
const SCORE_LABELS: Record<ScoreField, string> = {
  hookScore: 'Hook',
  holdScore: 'Hold',
  clickScore: 'Click',
  convertScore: 'Convert',
}

const formatCurrency = (val: number) => {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
  return `$${val.toFixed(0)}`
}

export default function BestAdsPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { activeAds, isLoadingActiveAds, assets, videoSources, fetchVideoSource, starredIds, toggleStar, clearStarred, openTheaterWithAsset } = useCreativeStudio()

  const [scoreField, setScoreField] = useState<ScoreField>('convertScore')
  const [topX, setTopX] = useState(6)

  const [funnelThresholds, setFunnelThresholds] = useState<Record<FunnelStage, number | null>>({
    hook: null, hold: null, click: null, convert: null, scale: null,
  })

  // Build media_hash → asset lookup for resolving URLs and fatigue
  const mediaMap = useMemo(() => {
    const map = new Map<string, { storageUrl: string | null; imageUrl: string | null; thumbnailUrl: string | null }>()
    for (const a of assets) {
      if (a.mediaHash) {
        map.set(a.mediaHash, { storageUrl: a.storageUrl, imageUrl: a.imageUrl, thumbnailUrl: a.thumbnailUrl })
      }
    }
    return map
  }, [assets])

  const fatigueMap = useMemo(() => {
    const map = new Map<string, { fatigueScore: number; fatigueStatus: 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued' }>()
    for (const a of assets) {
      if (a.mediaHash) {
        map.set(a.mediaHash, { fatigueScore: a.fatigueScore, fatigueStatus: a.fatigueStatus })
      }
    }
    return map
  }, [assets])

  const resolveMedia = useCallback((ad: ActiveAd) => {
    if (ad.media_hash) {
      const asset = mediaMap.get(ad.media_hash)
      if (asset && (asset.storageUrl || asset.imageUrl || asset.thumbnailUrl)) {
        return asset
      }
    }
    if (ad.storageUrl || ad.imageUrl || ad.thumbnailUrl) {
      return { storageUrl: ad.storageUrl, imageUrl: ad.imageUrl, thumbnailUrl: ad.thumbnailUrl }
    }
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

  const scoredAds = useMemo(() => {
    let items = [...activeAds].filter(a => a.spend > 0)

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

    // Scored items first (by score desc), then unscored by spend desc
    return items.sort((a, b) => {
      const aScore = a[scoreField]
      const bScore = b[scoreField]
      if (aScore !== null && bScore === null) return -1
      if (aScore === null && bScore !== null) return 1
      if (aScore !== null && bScore !== null) return bScore - aScore
      return b.spend - a.spend
    })
  }, [activeAds, scoreField, funnelThresholds, scaleThreshold])

  const topAds = useMemo(() => scoredAds.slice(0, topX), [scoredAds, topX])

  // Map to StudioAsset[] for GalleryGrid
  const galleryItems = useMemo(() => {
    return topAds.map(ad => {
      const item = activeAdToStudioAsset(ad, resolveMedia(ad))
      item.isStarred = starredIds.has(item.id)
      const fatigue = ad.media_hash ? fatigueMap.get(ad.media_hash) : null
      if (fatigue) {
        item.fatigueScore = fatigue.fatigueScore
        item.fatigueStatus = fatigue.fatigueStatus
      }
      return item
    })
  }, [topAds, resolveMedia, starredIds, fatigueMap])

  const distributionData = useMemo(() => {
    const buckets = [{ name: '0-25', count: 0 }, { name: '25-50', count: 0 }, { name: '50-75', count: 0 }, { name: '75-100', count: 0 }]
    for (const a of scoredAds) {
      const s = a[scoreField] ?? 0
      if (s < 25) buckets[0].count++
      else if (s < 50) buckets[1].count++
      else if (s < 75) buckets[2].count++
      else buckets[3].count++
    }
    return buckets
  }, [scoredAds, scoreField])

  const summaryStats = useMemo(() => {
    if (galleryItems.length === 0) return { avgScore: 0, totalSpend: 0, bestName: '-' }
    const scores = galleryItems.map(a => a[scoreField] ?? 0)
    return {
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      totalSpend: galleryItems.reduce((sum, a) => sum + a.spend, 0),
      bestName: galleryItems[0]?.name || 'Untitled',
    }
  }, [galleryItems, scoreField])

  const getCustomMetrics = useCallback((item: StudioAsset) => {
    const ad = topAds.find(a => a.ad_id === item.id)
    return [
      { label: 'ROAS', value: `${item.roas.toFixed(2)}x` },
      { label: 'CPA', value: ad && ad.cpa > 0 ? `$${ad.cpa.toFixed(2)}` : '\u2014' },
      { label: 'Spend', value: formatCurrency(item.spend) },
    ]
  }, [topAds])

  const getSubtitle = useCallback((item: StudioAsset) => {
    const ad = topAds.find(a => a.ad_id === item.id)
    return ad?.campaign_name || undefined
  }, [topAds])

  if (!user || !currentAccountId) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-zinc-500">Loading...</div></div>
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Constrained content area - matches gallery width */}
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Best Ads</h1>
            <p className="text-zinc-500 mt-1">Top-performing creative assets ranked by score</p>
          </div>

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

          <div className="flex items-center gap-3 flex-shrink-0">
            <select
              value={scoreField}
              onChange={e => setScoreField(e.target.value as ScoreField)}
              className="bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-zinc-300"
            >
              {Object.entries(SCORE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label} Score</option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-bg-card border border-border rounded-lg">
              {[3, 6, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setTopX(n)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm transition-colors',
                    topX === n ? 'bg-accent text-white' : 'text-zinc-400 hover:text-white'
                  )}
                >
                  Top {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoadingActiveAds ? (
          <div className="space-y-4">
            <div className="h-40 bg-bg-card border border-border rounded-2xl animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-48 bg-bg-card border border-border rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : scoredAds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Trophy className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No ads with spend</h3>
            <p className="text-sm text-zinc-500">No creative assets have spend in the selected date range</p>
          </div>
        ) : (
          <>
            {/* Summary + Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">Top {topX} Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500">Avg {SCORE_LABELS[scoreField]}</div>
                    <div className={`text-2xl font-bold ${summaryStats.avgScore >= 75 ? 'text-green-400' : summaryStats.avgScore >= 50 ? 'text-amber-400' : 'text-orange-400'}`}>
                      {summaryStats.avgScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Total Spend</div>
                    <div className="text-2xl font-bold text-white">${summaryStats.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Best Performer</div>
                    <div className="text-sm font-medium text-white truncate mt-1">{summaryStats.bestName}</div>
                  </div>
                </div>
              </div>

              <div className="bg-bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">{SCORE_LABELS[scoreField]} Score Distribution</h3>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={distributionData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 12, color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {distributionData.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Leaderboard — shared gallery cards */}
            <GalleryGrid
              items={galleryItems}
              isLoading={false}
              onSelect={(id) => {
                const item = galleryItems.find(a => a.id === id)
                if (item) openTheaterWithAsset(item)
              }}
              onStar={(id) => toggleStar(id)}
              videoSources={videoSources}
              onRequestVideoSource={fetchVideoSource}
              rankMode
              customMetrics={getCustomMetrics}
              subtitle={getSubtitle}
            />
          </>
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
    </div>
  )
}
