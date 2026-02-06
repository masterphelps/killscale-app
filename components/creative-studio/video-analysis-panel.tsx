'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Lock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Zap,
  Eye,
  MousePointer,
  TrendingUp,
  Lightbulb,
  MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VideoAnalysis, ScriptSuggestion, AnalysisStatus } from './types'

interface VideoAnalysisPanelProps {
  mediaHash: string
  analysisStatus: AnalysisStatus
  analysis: VideoAnalysis | null
  scriptSuggestions: ScriptSuggestion[] | null
  analyzedAt: string | null
  errorMessage: string | null
  isPro: boolean
  isAnalyzing: boolean
  onAnalyze: () => void
  onReanalyze: () => void
}

function ScoreBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const colorClass = value >= 75
    ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
    : value >= 50
    ? 'text-amber-400 bg-amber-500/20 border-amber-500/30'
    : value >= 25
    ? 'text-orange-400 bg-orange-500/20 border-orange-500/30'
    : 'text-red-400 bg-red-500/20 border-red-500/30'

  const sizeClass = size === 'lg'
    ? 'text-2xl px-4 py-2'
    : size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-3 py-1'

  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-bold font-mono border',
      colorClass,
      sizeClass
    )}>
      {value}
    </span>
  )
}

function FunnelScoreCard({
  icon,
  label,
  score,
  assessment,
  elements,
  improvement,
  timestamp,
  color
}: {
  icon: React.ReactNode
  label: string
  score: number
  assessment: string
  elements: string[]
  improvement: string
  timestamp?: string
  color: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('rounded-xl border p-4', color)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{label}</span>
              {timestamp && (
                <span className="text-xs text-zinc-500">{timestamp}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge value={score} size="sm" />
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 space-y-3"
        >
          <p className="text-sm text-zinc-300">{assessment}</p>

          {elements.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {elements.map((el, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/5 text-zinc-400">
                  {el}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-black/20">
            <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-zinc-300">{improvement}</p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function ScriptCard({ script, index }: { script: ScriptSuggestion; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const [copied, setCopied] = useState(false)

  const copyScript = () => {
    const fullScript = `HOOK:\n${script.script.hook}\n\nBODY:\n${script.script.body}\n\nCTA:\n${script.script.cta}`
    navigator.clipboard.writeText(fullScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="text-left">
          <div className="font-semibold text-white">{script.title}</div>
          <div className="text-xs text-zinc-500">{script.estimatedDuration}</div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-4 pb-4 space-y-4"
        >
          <p className="text-sm text-zinc-400">{script.approach}</p>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-xs font-semibold text-emerald-400 mb-1">HOOK</div>
              <p className="text-sm text-zinc-300">{script.script.hook}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="text-xs font-semibold text-blue-400 mb-1">BODY</div>
              <p className="text-sm text-zinc-300">{script.script.body}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="text-xs font-semibold text-amber-400 mb-1">CTA</div>
              <p className="text-sm text-zinc-300">{script.script.cta}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-900">
            <div className="text-xs font-semibold text-zinc-500 mb-1">Why it works</div>
            <p className="text-sm text-zinc-400">{script.whyItWorks}</p>
          </div>

          <button
            onClick={copyScript}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Script'}
          </button>
        </motion.div>
      )}
    </div>
  )
}

export function VideoAnalysisPanel({
  mediaHash,
  analysisStatus,
  analysis,
  scriptSuggestions,
  analyzedAt,
  errorMessage,
  isPro,
  isAnalyzing,
  onAnalyze,
  onReanalyze
}: VideoAnalysisPanelProps) {
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)

  // Not Pro - show upgrade prompt
  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">AI Video Analysis</h3>
        <p className="text-sm text-zinc-400 mb-6 max-w-sm">
          Get AI-powered insights on your video ads including hook analysis,
          transcript, and script suggestions.
        </p>
        <a
          href="/pricing"
          className="px-6 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors"
        >
          Upgrade to Pro
        </a>
      </div>
    )
  }

  // Not yet analyzed - show analyze button
  if (analysisStatus === 'none' || analysisStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">AI Video Analysis</h3>
        <p className="text-sm text-zinc-400 mb-6 max-w-sm">
          Analyze this video to get AI-powered insights on hook effectiveness,
          audience retention, and new script ideas.
        </p>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className={cn(
            'px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2',
            isAnalyzing
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : 'bg-accent hover:bg-accent-hover text-white'
          )}
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyze Video
            </>
          )}
        </button>
      </div>
    )
  }

  // Currently processing
  if (analysisStatus === 'processing' || isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
          <RefreshCw className="w-8 h-8 text-accent animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Analyzing Video...</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          Our AI is watching and analyzing your video. This usually takes 15-30 seconds.
        </p>
      </div>
    )
  }

  // Error state
  if (analysisStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Analysis Failed</h3>
        <p className="text-sm text-zinc-400 mb-2 max-w-sm">
          {errorMessage || 'Something went wrong while analyzing this video.'}
        </p>
        <button
          onClick={onReanalyze}
          disabled={isAnalyzing}
          className="px-6 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    )
  }

  // Analysis complete - show results
  if (analysisStatus === 'complete' && analysis) {
    return (
      <div className="space-y-6">
        {/* Overall Score & Summary */}
        <div className="rounded-xl bg-gradient-to-br from-accent/20 to-purple-500/20 border border-accent/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <span className="font-semibold text-white">Overall Score</span>
            </div>
            <ScoreBadge value={analysis.overallScore} size="lg" />
          </div>
          <p className="text-sm text-zinc-300">{analysis.summary}</p>
          {analyzedAt && (
            <p className="text-xs text-zinc-500 mt-3">
              Analyzed {new Date(analyzedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Funnel Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Funnel Analysis</h4>

          <FunnelScoreCard
            icon={<Zap className="w-5 h-5 text-emerald-400" />}
            label="Hook"
            score={analysis.hook.score}
            assessment={analysis.hook.assessment}
            elements={analysis.hook.elements}
            improvement={analysis.hook.improvement}
            timestamp={analysis.hook.timestamp}
            color="border-emerald-500/30 bg-emerald-500/5"
          />

          <FunnelScoreCard
            icon={<Eye className="w-5 h-5 text-blue-400" />}
            label="Hold"
            score={analysis.hold.score}
            assessment={analysis.hold.assessment}
            elements={analysis.hold.elements}
            improvement={analysis.hold.improvement}
            color="border-blue-500/30 bg-blue-500/5"
          />

          <FunnelScoreCard
            icon={<MousePointer className="w-5 h-5 text-violet-400" />}
            label="Click"
            score={analysis.click.score}
            assessment={analysis.click.assessment}
            elements={analysis.click.elements}
            improvement={analysis.click.improvement}
            color="border-violet-500/30 bg-violet-500/5"
          />

          <FunnelScoreCard
            icon={<TrendingUp className="w-5 h-5 text-amber-400" />}
            label="Convert"
            score={analysis.convert.score}
            assessment={analysis.convert.assessment}
            elements={analysis.convert.elements}
            improvement={analysis.convert.improvement}
            color="border-amber-500/30 bg-amber-500/5"
          />
        </div>

        {/* Quick Insights */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-xs font-semibold text-emerald-400 mb-1">Top Strength</div>
            <p className="text-sm text-zinc-300">{analysis.topStrength}</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="text-xs font-semibold text-red-400 mb-1">Top Weakness</div>
            <p className="text-sm text-zinc-300">{analysis.topWeakness}</p>
          </div>
        </div>

        {/* Content Analysis */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-white">Content Analysis</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-zinc-500">Style:</span>{' '}
              <span className="text-zinc-300 capitalize">{analysis.visualStyle.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-zinc-500">Speaker:</span>{' '}
              <span className="text-zinc-300 capitalize">{analysis.speakerStyle.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-zinc-500">Tone:</span>{' '}
              <span className="text-zinc-300 capitalize">{analysis.emotionalTone}</span>
            </div>
            <div>
              <span className="text-zinc-500">Duration:</span>{' '}
              <span className="text-zinc-300">{analysis.duration}s</span>
            </div>
          </div>
          <div>
            <span className="text-zinc-500 text-sm">Target Audience:</span>
            <p className="text-sm text-zinc-300 mt-1">{analysis.targetAudience}</p>
          </div>
          <div>
            <span className="text-zinc-500 text-sm">Key Messages:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {analysis.keyMessages.map((msg, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/5 text-zinc-400">
                  {msg}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Wins */}
        {analysis.quickWins && analysis.quickWins.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-semibold text-white">Quick Wins</h4>
            </div>
            <ul className="space-y-2">
              {analysis.quickWins.map((win, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="text-amber-400 mt-0.5">•</span>
                  {win}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript */}
        {analysis.transcript && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden">
            <button
              onClick={() => setTranscriptExpanded(!transcriptExpanded)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-400" />
                <span className="font-semibold text-white">Transcript</span>
              </div>
              {transcriptExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
            </button>
            {transcriptExpanded && (
              <div className="px-4 pb-4">
                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{analysis.transcript}</p>
              </div>
            )}
          </div>
        )}

        {/* Script Suggestions */}
        {scriptSuggestions && scriptSuggestions.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Script Suggestions</h4>
            {scriptSuggestions.map((script, i) => (
              <ScriptCard key={i} script={script} index={i} />
            ))}
          </div>
        )}

        {/* Re-analyze button */}
        <button
          onClick={onReanalyze}
          disabled={isAnalyzing}
          className="w-full py-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className={cn('w-4 h-4', isAnalyzing && 'animate-spin')} />
          Re-analyze Video
        </button>
      </div>
    )
  }

  return null
}
