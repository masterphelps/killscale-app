'use client'

import { useState, useMemo, useCallback } from 'react'
import { FileText, X, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { FunnelFilterBar, GalleryGrid } from '@/components/creative-studio'
import { useCreativeStudio } from '../creative-studio-context'
import { copyVariationToStudioAsset } from '@/lib/creative-studio-mappers'
import type { StudioAsset } from '@/components/creative-studio/types'
import type { CopyVariation } from '../creative-studio-context'

type FunnelStage = 'hook' | 'hold' | 'click' | 'convert' | 'scale'
type ScoreField = 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore'

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

export default function BestCopyPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { copyVariations, isLoadingCopy } = useCreativeStudio()

  const [scoreField, setScoreField] = useState<ScoreField>('convertScore')
  const [selectedVariation, setSelectedVariation] = useState<CopyVariation | null>(null)
  const [copiedField, setCopiedField] = useState<'headline' | 'primaryText' | null>(null)

  const [funnelThresholds, setFunnelThresholds] = useState<Record<FunnelStage, number | null>>({
    hook: null, hold: null, click: null, convert: null, scale: null,
  })

  const scaleThreshold = useMemo(() => {
    const spends = copyVariations.filter(v => v.spend > 0).map(v => v.spend).sort((a, b) => a - b)
    if (spends.length === 0) return 0
    const mid = Math.floor(spends.length / 2)
    return (spends.length % 2 === 0 ? (spends[mid - 1] + spends[mid]) / 2 : spends[mid]) * 2
  }, [copyVariations])

  const funnelStats = useMemo(() => {
    const total = copyVariations.length
    const t = (stage: FunnelStage) => funnelThresholds[stage] ?? 75
    return {
      hook: { good: copyVariations.filter(v => (v.hookScore ?? 0) >= t('hook')).length, total },
      hold: { good: copyVariations.filter(v => (v.holdScore ?? 0) >= t('hold')).length, total },
      click: { good: copyVariations.filter(v => (v.clickScore ?? 0) >= t('click')).length, total },
      convert: { good: copyVariations.filter(v => (v.convertScore ?? 0) >= t('convert')).length, total },
      scale: { good: copyVariations.filter(v => v.spend >= scaleThreshold).length, total },
    }
  }, [copyVariations, scaleThreshold, funnelThresholds])

  const toggleFunnelFilter = useCallback((stage: FunnelStage) => {
    setFunnelThresholds(prev => ({ ...prev, [stage]: prev[stage] !== null ? null : 75 }))
  }, [])
  const setFunnelThreshold = useCallback((stage: FunnelStage, value: number) => {
    setFunnelThresholds(prev => ({ ...prev, [stage]: value }))
  }, [])
  const clearFunnelFilters = useCallback(() => {
    setFunnelThresholds({ hook: null, hold: null, click: null, convert: null, scale: null })
  }, [])

  const filteredVariations = useMemo(() => {
    let items = [...copyVariations]

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

    // Sort by selected score field (scored items first), then by spend as tiebreaker
    items.sort((a, b) => {
      const aScore = a[scoreField]
      const bScore = b[scoreField]
      // Scored items sort before unscored
      if (aScore !== null && bScore === null) return -1
      if (aScore === null && bScore !== null) return 1
      if (aScore !== null && bScore !== null) return bScore - aScore
      return b.spend - a.spend
    })
    return items
  }, [copyVariations, funnelThresholds, scaleThreshold, scoreField])

  const galleryItems = useMemo(() => {
    return filteredVariations.map(v => copyVariationToStudioAsset(v))
  }, [filteredVariations])

  const getCustomMetrics = useCallback((item: StudioAsset) => {
    const variation = filteredVariations.find(v => v.key === item.id)
    return [
      { label: 'Ads', value: `${variation?.adCount ?? item.adCount}` },
      { label: 'ROAS', value: `${item.roas.toFixed(2)}x` },
      { label: 'Spend', value: formatCurrency(item.spend) },
    ]
  }, [filteredVariations])

  const getTextContent = useCallback((item: StudioAsset) => {
    const variation = filteredVariations.find(v => v.key === item.id)
    return variation?.primaryText || undefined
  }, [filteredVariations])

  const handleSelectVariation = useCallback((id: string) => {
    const variation = filteredVariations.find(v => v.key === id)
    if (variation) setSelectedVariation(variation)
  }, [filteredVariations])

  const handleCopyText = useCallback(async (text: string, field: 'headline' | 'primaryText') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  if (!user || !currentAccountId) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-zinc-500">Loading...</div></div>
  }

  return (
    <div className="min-h-screen">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Constrained content area - matches gallery width */}
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Copy</h1>
            <p className="text-zinc-500 mt-1">Top-performing ad copy variations ranked by score</p>
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
          </div>
        </div>

        {isLoadingCopy ? (
          <GalleryGrid items={[]} isLoading={true} onSelect={() => {}} />
        ) : filteredVariations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No copy variations</h3>
            <p className="text-sm text-zinc-500">
              Ad copy text will appear here after a sync. Copy needs at least $50 in spend to receive scores.
            </p>
          </div>
        ) : (
          <GalleryGrid
            items={galleryItems}
            isLoading={false}
            onSelect={handleSelectVariation}
            customMetrics={getCustomMetrics}
            textContent={getTextContent}
          />
        )}
        </div>

        {/* Copy Detail Modal */}
        {selectedVariation && (
          <>
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setSelectedVariation(null)}
            />
            <div className="fixed inset-4 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-full lg:max-w-2xl lg:max-h-[80vh] bg-bg-card border border-border rounded-2xl z-50 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-accent" />
                  <h2 className="text-lg font-semibold text-white">Copy Details</h2>
                </div>
                <button
                  onClick={() => setSelectedVariation(null)}
                  className="p-2 hover:bg-bg-hover rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Headline */}
                {selectedVariation.headline && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Headline</label>
                      <button
                        onClick={() => handleCopyText(selectedVariation.headline!, 'headline')}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-bg-hover rounded transition-colors"
                      >
                        {copiedField === 'headline' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-green-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-4 bg-bg-dark border border-border rounded-xl">
                      <p className="text-white font-medium">{selectedVariation.headline}</p>
                    </div>
                  </div>
                )}

                {/* Primary Text */}
                {selectedVariation.primaryText && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Primary Text</label>
                      <button
                        onClick={() => handleCopyText(selectedVariation.primaryText!, 'primaryText')}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-bg-hover rounded transition-colors"
                      >
                        {copiedField === 'primaryText' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-green-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-4 bg-bg-dark border border-border rounded-xl">
                      <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed">{selectedVariation.primaryText}</p>
                    </div>
                  </div>
                )}

                {/* Description (if available) */}
                {selectedVariation.description && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Description</label>
                    <div className="p-4 bg-bg-dark border border-border rounded-xl">
                      <p className="text-zinc-300">{selectedVariation.description}</p>
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Performance</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-bg-dark border border-border rounded-xl">
                      <div className="text-xs text-zinc-500">Ads Using</div>
                      <div className="text-lg font-semibold text-white">{selectedVariation.adCount}</div>
                    </div>
                    <div className="p-3 bg-bg-dark border border-border rounded-xl">
                      <div className="text-xs text-zinc-500">Spend</div>
                      <div className="text-lg font-semibold text-white">{formatCurrency(selectedVariation.spend)}</div>
                    </div>
                    <div className="p-3 bg-bg-dark border border-border rounded-xl">
                      <div className="text-xs text-zinc-500">ROAS</div>
                      <div className="text-lg font-semibold text-white">{selectedVariation.roas.toFixed(2)}x</div>
                    </div>
                    <div className="p-3 bg-bg-dark border border-border rounded-xl">
                      <div className="text-xs text-zinc-500">CTR</div>
                      <div className="text-lg font-semibold text-white">{selectedVariation.ctr.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>

                {/* Ad Names */}
                {selectedVariation.adNames && selectedVariation.adNames.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Used In Ads</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedVariation.adNames.map((name, i) => (
                        <span key={i} className="px-2 py-1 bg-bg-dark border border-border rounded-lg text-xs text-zinc-400">
                          {name}
                        </span>
                      ))}
                      {selectedVariation.adCount > selectedVariation.adNames.length && (
                        <span className="px-2 py-1 text-xs text-zinc-500">
                          +{selectedVariation.adCount - selectedVariation.adNames.length} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    selectedVariation.isActive
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-zinc-500/20 text-zinc-400'
                  )}>
                    {selectedVariation.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
