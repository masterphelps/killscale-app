'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { LayoutGrid, Zap, Trophy, FileText, ArrowRight, Film, Image as ImageIcon, Sparkles, Eye, MousePointer, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useCreativeStudio } from './creative-studio-context'
import { ScoreDistributionChart } from '@/components/creative-studio/score-distribution-chart'
import { AIInsightsCard } from '@/components/creative-studio/ai-insights-card'
import type { VideoAnalysis } from '@/components/creative-studio/types'

function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' }) {
  if (score === null) return <span className="text-zinc-600">--</span>
  const cls = score >= 75 ? 'bg-emerald-500/20 text-emerald-400' :
    score >= 50 ? 'bg-amber-500/20 text-amber-400' :
    score >= 25 ? 'bg-orange-500/20 text-orange-400' :
    'bg-red-500/20 text-red-400'
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-md font-bold',
      cls,
      size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
    )}>
      {score}
    </span>
  )
}

interface AnalysisItem {
  id: string
  mediaHash: string
  status: string
  analysis: VideoAnalysis | null
}

export default function CreativeStudioOverview() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { assets, isLoading, activeAds, activeDailyBudget, copyVariations } = useCreativeStudio()

  // AI Analyses state
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [isLoadingAnalyses, setIsLoadingAnalyses] = useState(true)

  // Fetch AI analyses
  const loadAnalyses = useCallback(async () => {
    if (!user || !currentAccountId) return
    setIsLoadingAnalyses(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        status: 'complete',
        limit: '100'
      })
      const res = await fetch(`/api/creative-studio/video-analyses?${params}`)
      const data = await res.json()
      if (data.analyses) {
        setAnalyses(data.analyses)
      }
    } catch (err) {
      console.error('Failed to load analyses:', err)
    } finally {
      setIsLoadingAnalyses(false)
    }
  }, [user, currentAccountId])

  useEffect(() => {
    loadAnalyses()
  }, [loadAnalyses])

  // Aggregate AI scores from completed analyses
  const aiScores = useMemo(() => {
    const complete = analyses.filter(a => a.status === 'complete' && a.analysis)
    if (complete.length === 0) return null

    const hookScores = complete.map(a => a.analysis!.hook.score).filter(s => s !== null && s !== undefined)
    const holdScores = complete.map(a => a.analysis!.hold.score).filter(s => s !== null && s !== undefined)
    const clickScores = complete.map(a => a.analysis!.click.score).filter(s => s !== null && s !== undefined)
    const convertScores = complete.map(a => a.analysis!.convert.score).filter(s => s !== null && s !== undefined)

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    return {
      hook: avg(hookScores),
      hold: avg(holdScores),
      click: avg(clickScores),
      convert: avg(convertScores),
      analyzedCount: complete.length
    }
  }, [analyses])

  // Stats
  const stats = useMemo(() => {
    const withData = assets.filter(a => a.hasPerformanceData)
    const videos = assets.filter(a => a.mediaType === 'video')
    const images = assets.filter(a => a.mediaType === 'image')

    return {
      totalAssets: assets.length,
      videoCount: videos.length,
      imageCount: images.length,
      withDataCount: withData.length,
      totalSpend: Math.round(withData.reduce((s, a) => s + a.spend, 0) * 100) / 100,
      totalRevenue: Math.round(withData.reduce((s, a) => s + a.revenue, 0) * 100) / 100,
    }
  }, [assets])

  // Top 3 per category
  const topHook = useMemo(() =>
    [...assets].filter(a => a.hookScore !== null).sort((a, b) => (b.hookScore ?? 0) - (a.hookScore ?? 0)).slice(0, 3),
    [assets]
  )
  const topHold = useMemo(() =>
    [...assets].filter(a => a.holdScore !== null).sort((a, b) => (b.holdScore ?? 0) - (a.holdScore ?? 0)).slice(0, 3),
    [assets]
  )
  const topClick = useMemo(() =>
    [...assets].filter(a => a.clickScore !== null).sort((a, b) => (b.clickScore ?? 0) - (a.clickScore ?? 0)).slice(0, 3),
    [assets]
  )
  const topConvert = useMemo(() =>
    [...assets].filter(a => a.convertScore !== null).sort((a, b) => (b.convertScore ?? 0) - (a.convertScore ?? 0)).slice(0, 3),
    [assets]
  )

  if (!user || !currentAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white">Creative Studio</h1>
          <p className="text-zinc-500 mt-1">
            Overview of your creative performance
          </p>
        </div>

        {/* System Status Bar */}
        {isLoading ? (
          <div className="h-16 bg-bg-card border border-border rounded-xl animate-pulse" />
        ) : (
          <div className="bg-bg-card border border-border rounded-xl px-6 py-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Total Assets</span>
                <span className="text-white font-bold">{stats.totalAssets}</span>
                <span className="flex items-center gap-2 text-zinc-400">
                  <Film className="w-3 h-3 text-purple-400" /> {stats.videoCount}
                  <ImageIcon className="w-3 h-3 text-blue-400 ml-1" /> {stats.imageCount}
                </span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">With Performance Data</span>
                <span className="text-white font-bold">{stats.withDataCount}</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Total Spend</span>
                <span className="text-white font-bold">${stats.totalSpend.toLocaleString()}</span>
              </div>
              <div className="hidden sm:block w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">Ads</span>
                <span className="text-white font-bold">{activeAds.length}</span>
              </div>
              {aiScores && (
                <>
                  <div className="hidden sm:block w-px h-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-accent" />
                    <span className="text-zinc-500">AI Analyzed</span>
                    <span className="text-white font-bold">{aiScores.analyzedCount}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Score Cards */}
        {!isLoadingAnalyses && aiScores && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Hook Score */}
            <div className={cn(
              'rounded-xl border p-5 transition-all',
              aiScores.hook !== null && aiScores.hook >= 75 ? 'border-emerald-500/30 bg-emerald-500/5' :
              aiScores.hook !== null && aiScores.hook >= 50 ? 'border-amber-500/30 bg-amber-500/5' :
              aiScores.hook !== null && aiScores.hook >= 25 ? 'border-orange-500/30 bg-orange-500/5' :
              'border-border bg-bg-card'
            )}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-400">Hook</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'text-4xl font-bold',
                  aiScores.hook !== null && aiScores.hook >= 75 ? 'text-emerald-400' :
                  aiScores.hook !== null && aiScores.hook >= 50 ? 'text-amber-400' :
                  aiScores.hook !== null && aiScores.hook >= 25 ? 'text-orange-400' :
                  'text-red-400'
                )}>
                  {aiScores.hook ?? '--'}
                </span>
                <span className="text-xs text-zinc-500">avg score</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">First 3 seconds attention</p>
            </div>

            {/* Hold Score */}
            <div className={cn(
              'rounded-xl border p-5 transition-all',
              aiScores.hold !== null && aiScores.hold >= 75 ? 'border-blue-500/30 bg-blue-500/5' :
              aiScores.hold !== null && aiScores.hold >= 50 ? 'border-amber-500/30 bg-amber-500/5' :
              aiScores.hold !== null && aiScores.hold >= 25 ? 'border-orange-500/30 bg-orange-500/5' :
              'border-border bg-bg-card'
            )}>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-zinc-400">Hold</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'text-4xl font-bold',
                  aiScores.hold !== null && aiScores.hold >= 75 ? 'text-blue-400' :
                  aiScores.hold !== null && aiScores.hold >= 50 ? 'text-amber-400' :
                  aiScores.hold !== null && aiScores.hold >= 25 ? 'text-orange-400' :
                  'text-red-400'
                )}>
                  {aiScores.hold ?? '--'}
                </span>
                <span className="text-xs text-zinc-500">avg score</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Viewer retention quality</p>
            </div>

            {/* Click Score */}
            <div className={cn(
              'rounded-xl border p-5 transition-all',
              aiScores.click !== null && aiScores.click >= 75 ? 'border-violet-500/30 bg-violet-500/5' :
              aiScores.click !== null && aiScores.click >= 50 ? 'border-amber-500/30 bg-amber-500/5' :
              aiScores.click !== null && aiScores.click >= 25 ? 'border-orange-500/30 bg-orange-500/5' :
              'border-border bg-bg-card'
            )}>
              <div className="flex items-center gap-2 mb-3">
                <MousePointer className="w-5 h-5 text-violet-400" />
                <span className="text-sm font-medium text-zinc-400">Click</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'text-4xl font-bold',
                  aiScores.click !== null && aiScores.click >= 75 ? 'text-violet-400' :
                  aiScores.click !== null && aiScores.click >= 50 ? 'text-amber-400' :
                  aiScores.click !== null && aiScores.click >= 25 ? 'text-orange-400' :
                  'text-red-400'
                )}>
                  {aiScores.click ?? '--'}
                </span>
                <span className="text-xs text-zinc-500">avg score</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">CTA effectiveness</p>
            </div>

            {/* Convert Score */}
            <div className={cn(
              'rounded-xl border p-5 transition-all',
              aiScores.convert !== null && aiScores.convert >= 75 ? 'border-amber-500/30 bg-amber-500/5' :
              aiScores.convert !== null && aiScores.convert >= 50 ? 'border-amber-500/30 bg-amber-500/5' :
              aiScores.convert !== null && aiScores.convert >= 25 ? 'border-orange-500/30 bg-orange-500/5' :
              'border-border bg-bg-card'
            )}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-zinc-400">Convert</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  'text-4xl font-bold',
                  aiScores.convert !== null && aiScores.convert >= 75 ? 'text-amber-400' :
                  aiScores.convert !== null && aiScores.convert >= 50 ? 'text-amber-400' :
                  aiScores.convert !== null && aiScores.convert >= 25 ? 'text-orange-400' :
                  'text-red-400'
                )}>
                  {aiScores.convert ?? '--'}
                </span>
                <span className="text-xs text-zinc-500">avg score</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Purchase persuasion</p>
            </div>
          </div>
        )}

        {/* No analyses yet prompt */}
        {!isLoadingAnalyses && !aiScores && (
          <Link
            href="/dashboard/creative-studio/ai-tasks"
            className="block bg-gradient-to-r from-accent/10 to-purple-500/10 border border-accent/30 rounded-xl p-6 hover:border-accent/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Get AI Creative Insights</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Analyze your videos with AI to get Hook, Hold, Click, and Convert scores plus script suggestions.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-500 ml-auto" />
            </div>
          </Link>
        )}

        {/* AI Creative Insights */}
        {!isLoading && user && currentAccountId && (
          <AIInsightsCard
            userId={user.id}
            adAccountId={currentAccountId}
            assets={assets}
            copyVariations={copyVariations}
            activeAdsCount={activeAds.length}
          />
        )}

        {/* Score Distribution Charts */}
        {!isLoading && assets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreDistributionChart items={assets} scoreField="hookScore" color="#10b981" label="Hook" />
            <ScoreDistributionChart items={assets} scoreField="holdScore" color="#3b82f6" label="Hold" />
            <ScoreDistributionChart items={assets} scoreField="clickScore" color="#8b5cf6" label="Click" />
            <ScoreDistributionChart items={assets} scoreField="convertScore" color="#f59e0b" label="Convert" />
          </div>
        )}

        {/* Mini Leaderboards */}
        {!isLoading && assets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Top Hook */}
            <div className="bg-bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-emerald-400">Top Hook</h3>
                <Link href="/dashboard/creative-studio/best-ads" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  See all <ArrowRight className="w-3 h-3 inline" />
                </Link>
              </div>
              <div className="space-y-2">
                {topHook.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-500 w-4">{i + 1}</span>
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-900 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {(item.thumbnailUrl || item.imageUrl) && <img src={(item.thumbnailUrl || item.imageUrl)!} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-xs text-zinc-300 truncate flex-1">{item.name || 'Untitled'}</span>
                    <ScoreBadge score={item.hookScore} size="sm" />
                  </div>
                ))}
                {topHook.length === 0 && <p className="text-xs text-zinc-600">No video data yet</p>}
              </div>
            </div>

            {/* Top Hold */}
            <div className="bg-bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-blue-400">Top Hold</h3>
                <Link href="/dashboard/creative-studio/best-ads" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  See all <ArrowRight className="w-3 h-3 inline" />
                </Link>
              </div>
              <div className="space-y-2">
                {topHold.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-500 w-4">{i + 1}</span>
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-900 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {(item.thumbnailUrl || item.imageUrl) && <img src={(item.thumbnailUrl || item.imageUrl)!} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-xs text-zinc-300 truncate flex-1">{item.name || 'Untitled'}</span>
                    <ScoreBadge score={item.holdScore} size="sm" />
                  </div>
                ))}
                {topHold.length === 0 && <p className="text-xs text-zinc-600">No video data yet</p>}
              </div>
            </div>

            {/* Top Click */}
            <div className="bg-bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-violet-400">Top Click</h3>
                <Link href="/dashboard/creative-studio/best-ads" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  See all <ArrowRight className="w-3 h-3 inline" />
                </Link>
              </div>
              <div className="space-y-2">
                {topClick.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-500 w-4">{i + 1}</span>
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-900 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {(item.thumbnailUrl || item.imageUrl) && <img src={(item.thumbnailUrl || item.imageUrl)!} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-xs text-zinc-300 truncate flex-1">{item.name || 'Untitled'}</span>
                    <ScoreBadge score={item.clickScore} size="sm" />
                  </div>
                ))}
                {topClick.length === 0 && <p className="text-xs text-zinc-600">No scored data yet</p>}
              </div>
            </div>

            {/* Top Convert */}
            <div className="bg-bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-amber-400">Top Convert</h3>
                <Link href="/dashboard/creative-studio/best-ads" className="text-xs text-zinc-500 hover:text-white transition-colors">
                  See all <ArrowRight className="w-3 h-3 inline" />
                </Link>
              </div>
              <div className="space-y-2">
                {topConvert.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-500 w-4">{i + 1}</span>
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-900 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {(item.thumbnailUrl || item.imageUrl) && <img src={(item.thumbnailUrl || item.imageUrl)!} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-xs text-zinc-300 truncate flex-1">{item.name || 'Untitled'}</span>
                    <ScoreBadge score={item.convertScore} size="sm" />
                  </div>
                ))}
                {topConvert.length === 0 && <p className="text-xs text-zinc-600">No scored data yet</p>}
              </div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/creative-studio/active"
            className="bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors group"
          >
            <Zap className="w-5 h-5 text-amber-400 mb-2" />
            <h3 className="text-sm font-medium text-white group-hover:text-accent transition-colors">Ads</h3>
            <p className="text-xs text-zinc-500 mt-1">View all active individual ads with scores</p>
          </Link>
          <Link
            href="/dashboard/creative-studio/media"
            className="bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors group"
          >
            <LayoutGrid className="w-5 h-5 text-blue-400 mb-2" />
            <h3 className="text-sm font-medium text-white group-hover:text-accent transition-colors">Media</h3>
            <p className="text-xs text-zinc-500 mt-1">Browse assets grouped by media</p>
          </Link>
          <Link
            href="/dashboard/creative-studio/best-ads"
            className="bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors group"
          >
            <Trophy className="w-5 h-5 text-emerald-400 mb-2" />
            <h3 className="text-sm font-medium text-white group-hover:text-accent transition-colors">Best Ads</h3>
            <p className="text-xs text-zinc-500 mt-1">Top performing ads leaderboard</p>
          </Link>
          <Link
            href="/dashboard/creative-studio/best-copy"
            className="bg-bg-card border border-border rounded-xl p-4 hover:border-zinc-600 transition-colors group"
          >
            <FileText className="w-5 h-5 text-violet-400 mb-2" />
            <h3 className="text-sm font-medium text-white group-hover:text-accent transition-colors">Copy</h3>
            <p className="text-xs text-zinc-500 mt-1">Top ad copy variations</p>
          </Link>
        </div>

        {/* Loading placeholder */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-zinc-500 text-sm">Loading creative data...</div>
          </div>
        )}
      </div>
    </div>
  )
}
