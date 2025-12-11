'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Brain, AlertCircle, AlertTriangle, CheckCircle, ChevronRight, ExternalLink, Sparkles, Send, Loader2, MessageCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AndromedaScoreResult, AndromedaFactor, IssueSeverity, getScoreColor, getScoreBgColor, getScoreBadgeClasses } from '@/lib/andromeda-score'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type CachedAnalysis = {
  content: string
  timestamp: number
  scoreHash: string
}

const CACHE_KEY = 'killscale_andromeda_ai_analysis'
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

// Generate a simple hash of score data to detect changes
function getScoreHash(score: AndromedaScoreResult): string {
  return `${score.totalScore}-${Object.values(score.factors).map(f => f.score).join('-')}-${score.issues.length}`
}

type AndromedaAuditModalProps = {
  isOpen: boolean
  onClose: () => void
  score: AndromedaScoreResult
}

const FACTOR_LABELS: Record<AndromedaFactor, { name: string; description: string }> = {
  cbo: {
    name: 'CBO Adoption',
    description: 'Use Campaign Budget Optimization to let Meta allocate spend'
  },
  creative: {
    name: 'Creative Volume',
    description: 'Ad sets with 4+ creatives (8-15 is ideal for Andromeda)'
  },
  adsets: {
    name: 'Structure Consolidation',
    description: 'Ideally 1 ad set per campaign (max 3 for Andromeda)'
  },
  learning: {
    name: 'Learning Phase',
    description: 'Ad sets with 25+ conversions/week (exited learning)'
  },
  stability: {
    name: 'Scaling Discipline',
    description: 'Budget changes within 15-20% (prevents learning reset)'
  }
}

const SEVERITY_CONFIG: Record<IssueSeverity, { icon: typeof AlertCircle; color: string; bg: string }> = {
  critical: {
    icon: AlertCircle,
    color: 'text-verdict-kill',
    bg: 'bg-verdict-kill/10 border-verdict-kill/30'
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-verdict-watch',
    bg: 'bg-verdict-watch/10 border-verdict-watch/30'
  },
  passing: {
    icon: CheckCircle,
    color: 'text-verdict-scale',
    bg: 'bg-verdict-scale/10 border-verdict-scale/30'
  }
}

export function AndromedaAuditModal({ isOpen, onClose, score }: AndromedaAuditModalProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isLoadingChat, setIsLoadingChat] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Load cached analysis when modal opens
  // Only fetch from API if cache is expired or score changed
  useEffect(() => {
    if (isOpen) {
      // Always try to load from cache first (it's fast)
      loadOrFetchAnalysis()
    } else {
      // Reset chat when closing, but keep analysis cached in localStorage
      setChatMessages([])
      setChatInput('')
      setShowChat(false)
    }
  }, [isOpen])

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  // Load from cache or fetch new analysis
  const loadOrFetchAnalysis = () => {
    // Skip if already loading
    if (isLoadingAI) return

    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed: CachedAnalysis = JSON.parse(cached)
        const now = Date.now()
        const isExpired = now - parsed.timestamp > CACHE_DURATION_MS
        const scoreChanged = parsed.scoreHash !== getScoreHash(score)

        // Use cache if not expired and score hasn't changed
        if (!isExpired && !scoreChanged) {
          setAiAnalysis(parsed.content)
          setLastAnalyzedAt(new Date(parsed.timestamp))
          return
        }
      }
    } catch (err) {
      // Cache read failed, fetch fresh
      console.error('Failed to read AI cache:', err)
    }

    // Only fetch if we don't have valid cached analysis
    fetchAIAnalysis(false)
  }

  const fetchAIAnalysis = async (isManualRefresh: boolean = false) => {
    setIsLoadingAI(true)
    setAiError(null)

    try {
      const response = await fetch('/api/andromeda-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreData: score,
          isRefresh: isManualRefresh
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get AI analysis')
      }

      const data = await response.json()
      const now = Date.now()

      // Cache the analysis
      const cacheData: CachedAnalysis = {
        content: data.content,
        timestamp: now,
        scoreHash: getScoreHash(score)
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))

      setAiAnalysis(data.content)
      setLastAnalyzedAt(new Date(now))
    } catch (err) {
      console.error('AI analysis error:', err)
      setAiError('Could not load AI analysis')
    } finally {
      setIsLoadingAI(false)
    }
  }

  const handleRefreshAnalysis = () => {
    fetchAIAnalysis(true)
  }

  // Format time since last analysis
  const getTimeSinceAnalysis = () => {
    if (!lastAnalyzedAt) return null
    const hours = Math.floor((Date.now() - lastAnalyzedAt.getTime()) / (1000 * 60 * 60))
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isLoadingChat) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoadingChat(true)

    try {
      const response = await fetch('/api/andromeda-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scoreData: score,
          chatHistory: chatMessages,
          userQuestion: userMessage
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (err) {
      console.error('Chat error:', err)
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setIsLoadingChat(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isOpen) return null

  const criticalIssues = score.issues.filter(i => i.severity === 'critical')
  const warningIssues = score.issues.filter(i => i.severity === 'warning')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-purple-400" />
            <div>
              <h2 className="text-lg font-semibold">Andromeda Optimization Audit</h2>
              <p className="text-xs text-zinc-500">Account structure analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {/* Overall Score */}
          <div className="flex items-center gap-6 mb-8">
            <div className="relative">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-bg-dark"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${score.totalScore * 2.64} 264`}
                  className={getScoreColor(score.totalScore)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn('text-2xl font-bold font-mono', getScoreColor(score.totalScore))}>
                  {score.totalScore}
                </span>
              </div>
            </div>
            <div>
              <div className={cn(
                'inline-block px-3 py-1 rounded-lg text-sm font-semibold mb-2',
                getScoreBadgeClasses(score.totalScore)
              )}>
                {score.label}
              </div>
              <p className="text-sm text-zinc-400">
                {score.totalScore >= 90 ? 'Your account structure is optimized for Andromeda ML.' :
                 score.totalScore >= 70 ? 'Good structure with minor improvements possible.' :
                 score.totalScore >= 50 ? 'Significant structural issues affecting performance.' :
                 'Critical issues are hurting your ad performance.'}
              </p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="mb-8 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-semibold text-purple-300 uppercase tracking-wide">
                  AI Analysis
                </h3>
                {lastAnalyzedAt && !isLoadingAI && (
                  <span className="text-xs text-zinc-500">
                    · {getTimeSinceAnalysis()}
                  </span>
                )}
              </div>
              {aiAnalysis && !isLoadingAI && (
                <button
                  onClick={handleRefreshAnalysis}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-purple-300 bg-bg-dark/50 hover:bg-bg-dark rounded-lg transition-colors"
                  title="Refresh analysis with latest data"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Audit</span>
                </button>
              )}
            </div>

            {isLoadingAI && (
              <div className="flex items-center gap-3 text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Analyzing your account structure...</span>
              </div>
            )}

            {aiError && (
              <p className="text-sm text-zinc-500">{aiError}</p>
            )}

            {aiAnalysis && (
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {aiAnalysis}
              </div>
            )}
          </div>

          {/* Factor Breakdown */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
              Score Breakdown
            </h3>
            <div className="space-y-3">
              {(Object.entries(score.factors) as [AndromedaFactor, typeof score.factors.cbo][]).map(([key, factor]) => {
                // Skip factors with 0 weight (e.g., CBO for CSV uploads)
                if (factor.weight === 0) {
                  return (
                    <div key={key} className="bg-bg-dark rounded-lg p-4 opacity-60">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{FACTOR_LABELS[key].name}</div>
                          <div className="text-xs text-zinc-500">{factor.details}</div>
                        </div>
                        <span className="text-sm text-zinc-500">N/A</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={key} className="bg-bg-dark rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-medium text-white">{FACTOR_LABELS[key].name}</div>
                        <div className="text-xs text-zinc-500">{FACTOR_LABELS[key].description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-lg font-mono font-semibold', getScoreColor(factor.score))}>
                          {factor.score}
                        </span>
                        <span className="text-xs text-zinc-500">({(factor.weight * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', getScoreBgColor(factor.score))}
                        style={{ width: `${factor.score}%` }}
                      />
                    </div>
                    <div className="text-xs text-zinc-400 mt-2">{factor.details}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Issues */}
          {criticalIssues.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-verdict-kill uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Critical Issues ({criticalIssues.length})
              </h3>
              <div className="space-y-2">
                {criticalIssues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {warningIssues.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-verdict-watch uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings ({warningIssues.length})
              </h3>
              <div className="space-y-2">
                {warningIssues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {criticalIssues.length === 0 && warningIssues.length === 0 && (
            <div className="bg-verdict-scale/10 border border-verdict-scale/30 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-verdict-scale flex-shrink-0" />
              <div>
                <div className="font-medium text-verdict-scale">All Checks Passing</div>
                <div className="text-sm text-zinc-400">
                  Your account structure follows Andromeda best practices.
                </div>
              </div>
            </div>
          )}

          {/* Ask AI Chat Section */}
          <div className="mt-8 border-t border-border pt-6">
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mb-4"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Ask AI about your account</span>
              <ChevronRight className={cn('w-4 h-4 transition-transform', showChat && 'rotate-90')} />
            </button>

            {showChat && (
              <div className="space-y-4">
                {/* Chat Messages */}
                {chatMessages.length > 0 && (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg p-3 text-sm',
                          msg.role === 'user'
                            ? 'bg-accent/20 text-white ml-8'
                            : 'bg-bg-dark text-zinc-300 mr-8'
                        )}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {isLoadingChat && (
                      <div className="bg-bg-dark rounded-lg p-3 text-sm text-zinc-400 mr-8 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="How should I consolidate my ad sets?"
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isLoadingChat}
                    className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          <a
            href="https://www.facebook.com/business/help/1064676474113744"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:text-accent-hover flex items-center gap-1"
          >
            Learn more about Meta&apos;s Andromeda ML
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </>
  )
}

function IssueCard({ issue }: { issue: AndromedaScoreResult['issues'][0] }) {
  const config = SEVERITY_CONFIG[issue.severity]
  const Icon = config.icon

  return (
    <div className={cn('rounded-lg border p-4', config.bg)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white">{issue.message}</div>
          {issue.entityName && (
            <div className="text-xs text-zinc-500 mt-0.5">Entity: {issue.entityName}</div>
          )}
          <div className="text-sm text-zinc-400 mt-2 flex items-start gap-1">
            <ChevronRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <span>{issue.recommendation}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
