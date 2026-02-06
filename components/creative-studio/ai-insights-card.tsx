'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Trophy, Zap, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioAsset, CopyVariation as CopyVariationType } from './types'
import type { CopyVariation as ContextCopyVariation } from '@/app/dashboard/creative-studio/creative-studio-context'

interface StageInsight {
  headline: string
  insight: string
  winner: string
  opportunity: string
  recommendation: string
}

interface CreativeInsights {
  overall: string
  stages: {
    hook: StageInsight
    hold: StageInsight
    click: StageInsight
    convert: StageInsight
  }
  biggestWin: { summary: string; impact: string }
  biggestOpportunity: { summary: string; potential: string }
}

interface Props {
  userId: string
  adAccountId: string
  assets: StudioAsset[]
  copyVariations: ContextCopyVariation[]
  activeAdsCount: number
}

const CACHE_KEY_PREFIX = 'ks_creative_insights_'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

const STAGE_COLORS = {
  hook: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  hold: { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  click: { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  convert: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
}

const STAGE_LABELS = {
  hook: 'Hook',
  hold: 'Hold',
  click: 'Click',
  convert: 'Convert',
}

export function AIInsightsCard({ userId, adAccountId, assets, copyVariations, activeAdsCount }: Props) {
  const [insights, setInsights] = useState<CreativeInsights | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(['hook', 'hold', 'click', 'convert']))
  const [showFullCard, setShowFullCard] = useState(true)

  const cacheKey = `${CACHE_KEY_PREFIX}${adAccountId}`

  // Compute summary data from assets
  const summary = useMemo(() => {
    const withData = assets.filter(a => a.hasPerformanceData)
    const videos = assets.filter(a => a.mediaType === 'video')
    const images = assets.filter(a => a.mediaType === 'image')

    // Compute averages
    const hookScores = withData.filter(a => a.hookScore !== null).map(a => a.hookScore!)
    const holdScores = withData.filter(a => a.holdScore !== null).map(a => a.holdScore!)
    const clickScores = withData.filter(a => a.clickScore !== null).map(a => a.clickScore!)
    const convertScores = withData.filter(a => a.convertScore !== null).map(a => a.convertScore!)

    const avgHook = hookScores.length > 0 ? Math.round(hookScores.reduce((s, v) => s + v, 0) / hookScores.length) : null
    const avgHold = holdScores.length > 0 ? Math.round(holdScores.reduce((s, v) => s + v, 0) / holdScores.length) : null
    const avgClick = clickScores.length > 0 ? Math.round(clickScores.reduce((s, v) => s + v, 0) / clickScores.length) : null
    const avgConvert = convertScores.length > 0 ? Math.round(convertScores.reduce((s, v) => s + v, 0) / convertScores.length) : null

    // Score distributions [0-24, 25-49, 50-74, 75-100]
    const getDistribution = (scores: number[]) => {
      const dist = [0, 0, 0, 0]
      scores.forEach(s => {
        if (s < 25) dist[0]++
        else if (s < 50) dist[1]++
        else if (s < 75) dist[2]++
        else dist[3]++
      })
      return dist
    }

    // Top/bottom performers (sorted by score, filtered by $50+ spend)
    const getTopPerformers = (scoreKey: 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore') => {
      return withData
        .filter(a => a[scoreKey] !== null && a.spend >= 50)
        .sort((a, b) => (b[scoreKey] ?? 0) - (a[scoreKey] ?? 0))
        .slice(0, 3)
        .map(a => ({ name: a.name || 'Untitled', score: a[scoreKey]!, spend: a.spend }))
    }

    // Bottom performers: high spend but low score (biggest opportunities)
    const getBottomPerformers = (scoreKey: 'hookScore' | 'holdScore' | 'clickScore' | 'convertScore') => {
      return withData
        .filter(a => a[scoreKey] !== null && a.spend >= 100 && (a[scoreKey] ?? 100) < 50)
        .sort((a, b) => b.spend - a.spend) // Sort by spend descending (highest wasted spend first)
        .slice(0, 3)
        .map(a => ({ name: a.name || 'Untitled', score: a[scoreKey]!, spend: a.spend }))
    }

    // Copy insights
    const copyWithSpend = copyVariations.filter(c => c.spend >= 50)
    const topHeadline = copyWithSpend
      .filter(c => c.headline)
      .sort((a, b) => b.roas - a.roas)[0]
    const topPrimaryText = copyWithSpend
      .filter(c => c.primaryText)
      .sort((a, b) => b.roas - a.roas)[0]

    // Fatigue breakdown
    const fatigueBreakdown = {
      healthy: withData.filter(a => a.fatigueStatus === 'healthy' || a.fatigueStatus === 'fresh').length,
      warning: withData.filter(a => a.fatigueStatus === 'warning').length,
      fatiguing: withData.filter(a => a.fatigueStatus === 'fatiguing').length,
      fatigued: withData.filter(a => a.fatigueStatus === 'fatigued').length,
    }

    return {
      totalAssets: assets.length,
      videoCount: videos.length,
      imageCount: images.length,
      totalSpend: Math.round(withData.reduce((s, a) => s + a.spend, 0) * 100) / 100,
      totalRevenue: Math.round(withData.reduce((s, a) => s + a.revenue, 0) * 100) / 100,
      avgScores: { hook: avgHook, hold: avgHold, click: avgClick, convert: avgConvert },
      scoreDistributions: {
        hook: getDistribution(hookScores),
        hold: getDistribution(holdScores),
        click: getDistribution(clickScores),
        convert: getDistribution(convertScores),
      },
      topPerformers: {
        hook: getTopPerformers('hookScore'),
        hold: getTopPerformers('holdScore'),
        click: getTopPerformers('clickScore'),
        convert: getTopPerformers('convertScore'),
      },
      bottomPerformers: {
        hook: getBottomPerformers('hookScore'),
        hold: getBottomPerformers('holdScore'),
        click: getBottomPerformers('clickScore'),
        convert: getBottomPerformers('convertScore'),
      },
      copyInsights: {
        totalVariations: copyVariations.length,
        topHeadline: topHeadline ? { text: topHeadline.headline!, roas: topHeadline.roas, spend: topHeadline.spend } : null,
        topPrimaryText: topPrimaryText ? { text: topPrimaryText.primaryText!, roas: topPrimaryText.roas, spend: topPrimaryText.spend } : null,
      },
      activeAdsCount,
      fatigueBreakdown,
    }
  }, [assets, copyVariations, activeAdsCount])

  // Check cache on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { insights: cachedInsights, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          setInsights(cachedInsights)
          return
        }
      } catch {
        // Invalid cache, ignore
      }
    }
    // No valid cache, fetch
    fetchInsights()
  }, [adAccountId])

  const fetchInsights = async () => {
    if (assets.length === 0) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/creative-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adAccountId, summary }),
      })

      if (!res.ok) {
        const errData = await res.json()
        if (res.status === 403) {
          setError(errData.error || 'Pro plan required')
        } else {
          setError(errData.error || 'Failed to fetch insights')
        }
        return
      }

      const data = await res.json()
      if (data.insights) {
        setInsights(data.insights)
        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
          insights: data.insights,
          timestamp: Date.now(),
        }))
      } else {
        setError('Invalid response from AI')
      }
    } catch (err) {
      console.error('Failed to fetch creative insights:', err)
      setError('Failed to connect to AI service')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = () => {
    localStorage.removeItem(cacheKey)
    fetchInsights()
  }

  const toggleStage = (stage: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev)
      if (next.has(stage)) {
        next.delete(stage)
      } else {
        next.add(stage)
      }
      return next
    })
  }

  // Not enough data
  if (assets.length === 0 || summary.totalSpend < 50) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">AI Creative Insights</h2>
        </div>
        <p className="text-sm text-zinc-500">
          Need at least $50 in ad spend to generate meaningful insights. Current spend: ${summary.totalSpend.toFixed(0)}
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">AI Creative Insights</h2>
        </div>
        <div className="space-y-4">
          <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-zinc-800 rounded animate-pulse w-1/2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="h-24 bg-zinc-800 rounded animate-pulse" />
            <div className="h-24 bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state (including Pro plan required)
  if (error) {
    const isPlanError = error.includes('Pro plan')
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">AI Creative Insights</h2>
          {isPlanError && (
            <span className="ml-auto flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
              <Lock className="w-3 h-3" /> Pro
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-400">{error}</p>
        {!isPlanError && (
          <button
            onClick={handleRefresh}
            className="mt-3 text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        )}
      </div>
    )
  }

  // No insights yet
  if (!insights) {
    return null
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 lg:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">AI Creative Insights</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh insights"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
            <button
              onClick={() => setShowFullCard(!showFullCard)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors lg:hidden"
            >
              {showFullCard ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Overall summary */}
        <p className="text-sm text-zinc-300 mt-3">{insights.overall}</p>
      </div>

      {/* Collapsible content */}
      <div className={cn(!showFullCard && 'hidden lg:block')}>
        {/* Biggest Win & Opportunity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 lg:p-6 border-b border-border">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wide">Biggest Win</span>
            </div>
            <p className="text-sm text-white">{insights.biggestWin.summary}</p>
            <p className="text-xs text-emerald-400 mt-1">{insights.biggestWin.impact}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">Biggest Opportunity</span>
            </div>
            <p className="text-sm text-white">{insights.biggestOpportunity.summary}</p>
            <p className="text-xs text-amber-400 mt-1">{insights.biggestOpportunity.potential}</p>
          </div>
        </div>

        {/* Funnel Stages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 lg:p-6">
          {(['hook', 'hold', 'click', 'convert'] as const).map(stage => {
            const stageInsight = insights.stages[stage]
            const colors = STAGE_COLORS[stage]
            const isExpanded = expandedStages.has(stage)

            return (
              <div
                key={stage}
                className={cn(
                  'rounded-lg border p-4 transition-colors',
                  colors.bg,
                  colors.border
                )}
              >
                {/* Stage header */}
                <button
                  onClick={() => toggleStage(stage)}
                  className="w-full flex items-center justify-between mb-2"
                >
                  <span className={cn('text-sm font-semibold', colors.text)}>
                    {STAGE_LABELS[stage]}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className={cn('w-4 h-4', colors.text)} />
                  ) : (
                    <ChevronDown className={cn('w-4 h-4', colors.text)} />
                  )}
                </button>

                {/* Headline (always visible) */}
                <p className="text-xs text-zinc-300 mb-2">{stageInsight.headline}</p>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    {/* Insight */}
                    <div>
                      <p className="text-xs text-zinc-400">{stageInsight.insight}</p>
                    </div>

                    {/* Winner */}
                    {stageInsight.winner && stageInsight.winner !== 'Insufficient data' && (
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-400 text-xs mt-0.5">W</span>
                        <p className="text-xs text-zinc-300">{stageInsight.winner}</p>
                      </div>
                    )}

                    {/* Opportunity */}
                    {stageInsight.opportunity && stageInsight.opportunity !== 'Insufficient data' && (
                      <div className="flex items-start gap-2">
                        <span className="text-amber-400 text-xs mt-0.5">!</span>
                        <p className="text-xs text-zinc-300">{stageInsight.opportunity}</p>
                      </div>
                    )}

                    {/* Recommendation */}
                    {stageInsight.recommendation && (
                      <div className="pt-2 border-t border-white/5">
                        <p className="text-xs text-zinc-400">
                          <span className={cn('font-medium', colors.text)}>Rec:</span> {stageInsight.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
