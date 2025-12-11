'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HealthScoreResult } from '@/lib/health-score'

type Recommendation = {
  priority: number
  action: 'KILL' | 'SCALE' | 'WATCH' | 'OPTIMIZE' | 'CONSOLIDATE'
  target: string
  targetId?: string  // Entity ID for actionable recommendations
  targetType: 'campaign' | 'adset' | 'account'  // No 'creative' - recommendations only at budget level
  summary: string
  reason: string
  currentBudget?: number  // For SCALE actions
}

type AIRecommendations = {
  accountSummary: string
  biggestOpportunity: { summary: string; potential: string }
  biggestRisk: { summary: string; impact: string }
  recommendations: Recommendation[]
}

type AIHealthRecommendationsProps = {
  userId: string
  healthScore: HealthScoreResult | null
  isLoading?: boolean
  scalePercentage?: number  // For scaling (default 20%)
  onKill?: (entityType: 'campaign' | 'adset', entityId: string) => Promise<void>
  onScale?: (entityType: 'campaign' | 'adset', entityId: string, newBudget: number) => Promise<void>
}

const ACTION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  KILL: { bg: 'bg-verdict-kill/20', text: 'text-verdict-kill', border: 'border-verdict-kill/30' },
  SCALE: { bg: 'bg-verdict-scale/20', text: 'text-verdict-scale', border: 'border-verdict-scale/30' },
  WATCH: { bg: 'bg-verdict-watch/20', text: 'text-verdict-watch', border: 'border-verdict-watch/30' },
  OPTIMIZE: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  CONSOLIDATE: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' }
}

const CACHE_KEY = 'health-ai-recommendations'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function AIHealthRecommendations({
  userId,
  healthScore,
  isLoading: parentLoading,
  scalePercentage = 20,
  onKill,
  onScale
}: AIHealthRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<AIRecommendations | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)  // Track which action is loading

  // Load cached recommendations on mount
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      try {
        const { data, timestamp, scoreHash } = JSON.parse(cached)
        const isExpired = Date.now() - timestamp > CACHE_DURATION
        const currentHash = healthScore ? `${healthScore.totalScore}-${healthScore.creatives.length}` : ''

        if (!isExpired && scoreHash === currentHash) {
          setRecommendations(data)
          return
        }
      } catch {
        localStorage.removeItem(CACHE_KEY)
      }
    }

    // Fetch fresh if no valid cache
    if (healthScore && !parentLoading) {
      fetchRecommendations()
    }
  }, [healthScore?.totalScore, parentLoading])

  const fetchRecommendations = async (isRefresh = false) => {
    if (!healthScore || !userId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/health-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          healthScore,
          isRefresh
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to get recommendations')
      }

      const data = await response.json()

      if (data.recommendations) {
        setRecommendations(data.recommendations)

        // Cache the recommendations
        const scoreHash = `${healthScore.totalScore}-${healthScore.creatives.length}`
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: data.recommendations,
          timestamp: Date.now(),
          scoreHash
        }))
      }
    } catch (err) {
      console.error('Failed to fetch AI recommendations:', err)
      setError(err instanceof Error ? err.message : 'Failed to load recommendations')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Kill action
  const handleKill = async (rec: Recommendation) => {
    if (!onKill || !rec.targetId || rec.targetType === 'account') return

    setActionLoading(`kill-${rec.targetId}`)
    try {
      await onKill(rec.targetType, rec.targetId)
      // Remove from recommendations after successful kill
      if (recommendations) {
        setRecommendations({
          ...recommendations,
          recommendations: recommendations.recommendations.filter(r => r.targetId !== rec.targetId)
        })
      }
    } catch (err) {
      console.error('Failed to kill:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Handle Scale action
  const handleScale = async (rec: Recommendation) => {
    if (!onScale || !rec.targetId || rec.targetType === 'account' || !rec.currentBudget) return

    const newBudget = Math.round(rec.currentBudget * (1 + scalePercentage / 100) * 100) / 100

    setActionLoading(`scale-${rec.targetId}`)
    try {
      await onScale(rec.targetType, rec.targetId, newBudget)
      // Remove from recommendations after successful scale
      if (recommendations) {
        setRecommendations({
          ...recommendations,
          recommendations: recommendations.recommendations.filter(r => r.targetId !== rec.targetId)
        })
      }
    } catch (err) {
      console.error('Failed to scale:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Check if an action can be taken
  const canTakeAction = (rec: Recommendation) => {
    if (rec.targetType === 'account') return false
    if (!rec.targetId) return false
    if (rec.action === 'KILL' && onKill) return true
    if (rec.action === 'SCALE' && onScale && rec.currentBudget) return true
    return false
  }

  if (parentLoading || !healthScore) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-bg-dark" />
          <div className="h-5 w-40 bg-bg-dark rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-16 bg-bg-dark rounded-lg" />
          <div className="h-16 bg-bg-dark rounded-lg" />
          <div className="h-16 bg-bg-dark rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-card border border-purple-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">AI Recommendations</h3>
              <p className="text-sm text-zinc-500">Powered by Claude</p>
            </div>
          </div>
          <button
            onClick={() => fetchRecommendations(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="text-center py-8">
            <AlertTriangle className="w-10 h-10 text-verdict-kill mx-auto mb-3" />
            <p className="text-sm text-zinc-400">{error}</p>
            <button
              onClick={() => fetchRecommendations()}
              className="mt-4 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {isLoading && !recommendations && (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Analyzing your account...</p>
          </div>
        )}

        {recommendations && !error && (
          <div className="space-y-4">
            {/* Account Summary */}
            <div className="text-sm text-zinc-300 leading-relaxed">
              {recommendations.accountSummary}
            </div>

            {/* Opportunity & Risk Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Biggest Opportunity */}
              <div className="bg-verdict-scale/10 border border-verdict-scale/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-verdict-scale" />
                  <span className="text-xs font-medium text-verdict-scale uppercase tracking-wide">Opportunity</span>
                </div>
                <p className="text-sm text-white mb-1">{recommendations.biggestOpportunity.summary}</p>
                <p className="text-xs text-verdict-scale font-mono">{recommendations.biggestOpportunity.potential}</p>
              </div>

              {/* Biggest Risk */}
              <div className="bg-verdict-kill/10 border border-verdict-kill/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-verdict-kill" />
                  <span className="text-xs font-medium text-verdict-kill uppercase tracking-wide">Risk</span>
                </div>
                <p className="text-sm text-white mb-1">{recommendations.biggestRisk.summary}</p>
                <p className="text-xs text-verdict-kill font-mono">{recommendations.biggestRisk.impact}</p>
              </div>
            </div>

            {/* Recommendations List */}
            <div>
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Priority Actions</h4>
              <div className="space-y-2">
                {recommendations.recommendations.map((rec, index) => {
                  const style = ACTION_STYLES[rec.action] || ACTION_STYLES.WATCH
                  const isActionable = canTakeAction(rec)
                  const isKillLoading = actionLoading === `kill-${rec.targetId}`
                  const isScaleLoading = actionLoading === `scale-${rec.targetId}`
                  const newBudget = rec.currentBudget
                    ? Math.round(rec.currentBudget * (1 + scalePercentage / 100) * 100) / 100
                    : 0

                  return (
                    <div
                      key={index}
                      className={cn(
                        'rounded-lg p-3 border',
                        style.bg,
                        style.border
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          style.bg,
                          style.text
                        )}>
                          {rec.priority}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-xs font-bold uppercase', style.text)}>{rec.action}</span>
                            <span className="text-sm text-white truncate">{rec.target}</span>
                            <span className="text-xs text-zinc-500">({rec.targetType})</span>
                          </div>
                          <p className="text-sm text-zinc-300">{rec.summary}</p>
                          <p className="text-xs text-zinc-500 mt-1">{rec.reason}</p>

                          {/* Action Button */}
                          {isActionable && (
                            <div className="mt-3 flex items-center gap-2">
                              {rec.action === 'KILL' && (
                                <button
                                  onClick={() => handleKill(rec)}
                                  disabled={isKillLoading || !!actionLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-verdict-kill text-white text-xs font-medium rounded-lg hover:bg-verdict-kill/80 transition-colors disabled:opacity-50"
                                >
                                  {isKillLoading ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                  Pause Now
                                </button>
                              )}
                              {rec.action === 'SCALE' && rec.currentBudget && (
                                <button
                                  onClick={() => handleScale(rec)}
                                  disabled={isScaleLoading || !!actionLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-verdict-scale text-white text-xs font-medium rounded-lg hover:bg-verdict-scale/80 transition-colors disabled:opacity-50"
                                >
                                  {isScaleLoading ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <TrendingUp className="w-3 h-3" />
                                  )}
                                  Scale +{scalePercentage}% (${rec.currentBudget} → ${newBudget})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
