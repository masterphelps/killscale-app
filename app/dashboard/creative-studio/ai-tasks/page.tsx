'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
import { motion } from 'framer-motion'
import {
  Sparkles,
  RefreshCw,
  Lock,
  Film,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Zap,
  Eye,
  MousePointer,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  Copy,
  Check,
  X,
  FileText,
  Wand2,
  Package,
  ImagePlus,
  ExternalLink,
  Download,
  FolderPlus,
  Send,
  Megaphone,
  Loader2,
} from 'lucide-react'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { VideoAnalysis, ScriptSuggestion } from '@/components/creative-studio/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnalysisItem {
  id: string
  mediaHash: string
  videoName: string
  thumbnailUrl: string | null
  storageUrl: string | null
  overallScore: number | null
  status: 'pending' | 'processing' | 'complete' | 'error'
  analysis: VideoAnalysis | null
  scriptSuggestions: ScriptSuggestion[] | null
  transcript: string | null
  analyzedAt: string | null
  createdAt: string
  errorMessage: string | null
}

interface AdStudioSession {
  id: string
  user_id: string
  ad_account_id: string
  product_url: string | null
  product_info: {
    name?: string
    description?: string
    price?: string
    features?: string[]
    imageUrl?: string
    brand?: string
  } | null
  competitor_company: {
    name?: string
    pageId?: string
    logoUrl?: string
  } | null
  competitor_ad: {
    page_name?: string
    ad_creative_bodies?: string[]
    ad_creative_link_titles?: string[]
  } | null
  generated_ads: Array<{
    headline: string
    primaryText: string
    description: string
    angle: string
    whyItWorks: string
  }>
  generated_images: Array<{
    adIndex: number
    versionIndex: number
    storageUrl: string
    mediaHash: string
  }>
  image_style: string | null
  status: string
  created_at: string
  updated_at: string
}

// ─── Helper Components ───────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: AnalysisItem['status'] }) {
  const config = {
    pending: { icon: Clock, label: 'Pending', color: 'text-zinc-400 bg-zinc-500/20', animate: false },
    processing: { icon: RefreshCw, label: 'Processing', color: 'text-blue-400 bg-blue-500/20', animate: true },
    complete: { icon: CheckCircle2, label: 'Complete', color: 'text-emerald-400 bg-emerald-500/20', animate: false },
    error: { icon: AlertCircle, label: 'Error', color: 'text-red-400 bg-red-500/20', animate: false },
  }

  const { icon: Icon, label, color, animate } = config[status] || config.pending

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium', color)}>
      <Icon className={cn('w-3 h-3', animate && 'animate-spin')} />
      {label}
    </span>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// ─── Video Analysis Components ───────────────────────────────────────────────

function FunnelScoreCard({
  icon,
  label,
  score,
  assessment,
  elements,
  improvement,
  timestamp,
  color,
  defaultExpanded = false
}: {
  icon: React.ReactNode
  label: string
  score: number
  assessment: string
  elements: string[]
  improvement: string
  timestamp?: string
  color: string
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

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

  const copyScript = (e: React.MouseEvent) => {
    e.stopPropagation()
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
          <div className="font-semibold text-white text-sm">{script.title}</div>
          <div className="text-xs text-zinc-500">{script.estimatedDuration}</div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-zinc-400">{script.approach}</p>

          <div className="space-y-2">
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
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors text-sm"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Script'}
          </button>
        </div>
      )}
    </div>
  )
}

function AnalysisDetailPanel({
  item,
  onClose
}: {
  item: AnalysisItem
  onClose?: () => void
}) {
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const analysis = item.analysis
  const scriptSuggestions = item.scriptSuggestions

  if (item.status === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Analyzing Video...</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          Our AI is watching and analyzing your video. This usually takes 15-30 seconds.
        </p>
      </div>
    )
  }

  if (item.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Analysis Failed</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          {item.errorMessage || 'Something went wrong while analyzing this video.'}
        </p>
      </div>
    )
  }

  if (item.status === 'pending' || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center mb-4">
          <Clock className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Pending Analysis</h3>
        <p className="text-sm text-zinc-400 max-w-sm">
          This video is queued for analysis.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {onClose && (
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {item.storageUrl && (
        <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900">
          <video
            src={item.storageUrl}
            poster={item.thumbnailUrl || undefined}
            controls
            className="w-full h-full object-contain"
          />
        </div>
      )}

      <div className="rounded-xl bg-gradient-to-br from-accent/20 to-purple-500/20 border border-accent/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-white text-lg">{item.videoName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-sm text-zinc-400">Overall Score</span>
            </div>
          </div>
          <ScoreBadge value={analysis.overallScore} size="lg" />
        </div>
        <p className="text-sm text-zinc-300">{analysis.summary}</p>
      </div>

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
          defaultExpanded
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-xs font-semibold text-emerald-400 mb-1">Top Strength</div>
          <p className="text-sm text-zinc-300">{analysis.topStrength}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="text-xs font-semibold text-red-400 mb-1">Top Weakness</div>
          <p className="text-sm text-zinc-300">{analysis.topWeakness}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-white">Content Analysis</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-zinc-500">Style:</span>{' '}
            <span className="text-zinc-300 capitalize">{analysis.visualStyle?.replace('_', ' ')}</span>
          </div>
          <div>
            <span className="text-zinc-500">Speaker:</span>{' '}
            <span className="text-zinc-300 capitalize">{analysis.speakerStyle?.replace('_', ' ')}</span>
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
        {analysis.targetAudience && (
          <div>
            <span className="text-zinc-500 text-sm">Target Audience:</span>
            <p className="text-sm text-zinc-300 mt-1">{analysis.targetAudience}</p>
          </div>
        )}
        {analysis.keyMessages && analysis.keyMessages.length > 0 && (
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
        )}
      </div>

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

      {scriptSuggestions && scriptSuggestions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Script Suggestions</h4>
          {scriptSuggestions.map((script, i) => (
            <ScriptCard key={i} script={script} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnalysisListItem({
  item,
  isSelected,
  onClick
}: {
  item: AnalysisItem
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors',
        isSelected ? 'bg-accent/15 ring-1 ring-accent/50' : 'hover:bg-zinc-800/50'
      )}
    >
      <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-4 h-4 text-zinc-600" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate leading-tight">{item.videoName}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.status === 'complete' && item.overallScore !== null ? (
            <ScoreBadge value={item.overallScore} size="sm" />
          ) : (
            <StatusBadge status={item.status} />
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Ad Studio Session Components ────────────────────────────────────────────

function AdSessionListItem({
  session,
  isSelected,
  onClick
}: {
  session: AdStudioSession
  isSelected: boolean
  onClick: () => void
}) {
  const productName = session.product_info?.name || 'Untitled Product'
  const competitorName = session.competitor_company?.name || session.competitor_ad?.page_name || 'Unknown'
  const adCount = session.generated_ads?.length || 0
  const imageCount = session.generated_images?.length || 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors',
        isSelected ? 'bg-purple-500/15 ring-1 ring-purple-500/50' : 'hover:bg-zinc-800/50'
      )}
    >
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
        <Wand2 className="w-5 h-5 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate leading-tight">{productName}</div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
          <span>vs {competitorName}</span>
          <span>•</span>
          <span>{adCount} ads</span>
          {imageCount > 0 && (
            <>
              <span>•</span>
              <span>{imageCount} images</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

interface GeneratedImage {
  base64?: string
  storageUrl?: string
  mediaHash?: string
  mimeType: string
}

interface SessionImage {
  adIndex: number
  versionIndex: number
  storageUrl: string
  mediaHash?: string
  mimeType?: string
  base64?: string
}

function AdSessionDetailPanel({
  session,
  onClose,
  onSessionUpdate
}: {
  session: AdStudioSession
  onClose?: () => void
  onSessionUpdate?: (updatedSession: AdStudioSession) => void
}) {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Save copy state
  const [savingCopyIndex, setSavingCopyIndex] = useState<number | null>(null)
  const [savedCopyIds, setSavedCopyIds] = useState<Record<number, boolean>>({})

  // AI generation usage tracking
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; status: string } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(res => res.json())
      .then(data => { if (data.limit !== undefined) setAiUsage(data) })
      .catch(() => {})
  }, [user?.id])

  // Image generation state - stores array of versions per ad
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<number, GeneratedImage[]>>({})
  const [currentImageVersion, setCurrentImageVersion] = useState<Record<number, number>>({})
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const [imageStyle, setImageStyle] = useState<'lifestyle' | 'product' | 'minimal' | 'bold'>(
    (session.image_style as 'lifestyle' | 'product' | 'minimal' | 'bold') || 'lifestyle'
  )
  const [hdText, setHdText] = useState(false) // Use Gemini 3 Pro for better text rendering

  // Track session images for persistence
  const [sessionImages, setSessionImages] = useState<SessionImage[]>(
    (session.generated_images as SessionImage[]) || []
  )

  // Image adjustment
  const [adjustmentPrompts, setAdjustmentPrompts] = useState<Record<number, string>>({})
  const [adjustingImageIndex, setAdjustingImageIndex] = useState<number | null>(null)

  // Saving to media library
  const [savingToLibrary, setSavingToLibrary] = useState<Record<number, boolean>>({})
  const [savedToLibrary, setSavedToLibrary] = useState<Record<string, boolean>>({})

  // Create ad wizard
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [wizardCopy, setWizardCopy] = useState<{ primaryText?: string; headline?: string; description?: string } | null>(null)
  const [creatingAd, setCreatingAd] = useState<Record<number, boolean>>({})

  // Load existing images from session on mount
  useEffect(() => {
    const existingImages = (session.generated_images as SessionImage[]) || []
    if (existingImages.length > 0) {
      // Group images by adIndex
      const imagesByAd: Record<number, GeneratedImage[]> = {}
      const alreadySaved: Record<string, boolean> = {}

      existingImages.forEach((img) => {
        if (!imagesByAd[img.adIndex]) {
          imagesByAd[img.adIndex] = []
        }
        const versionIndex = imagesByAd[img.adIndex].length
        imagesByAd[img.adIndex].push({
          storageUrl: img.storageUrl,
          mediaHash: img.mediaHash,
          mimeType: img.mimeType || 'image/png',
        })
        // Mark as already saved if it has mediaHash
        if (img.mediaHash) {
          alreadySaved[`${img.adIndex}-${versionIndex}`] = true
        }
      })
      setGeneratedImages(imagesByAd)
      setSessionImages(existingImages)
      setSavedToLibrary(alreadySaved)
    }
  }, [session.id]) // Only run when session changes

  // Save images to session when they change
  const saveImagesToSession = useCallback(async (newSessionImages: SessionImage[]) => {
    if (!user?.id) return

    try {
      const res = await fetch('/api/creative-studio/ad-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          sessionId: session.id,
          generatedImages: newSessionImages,
        }),
      })

      if (res.ok) {
        setSessionImages(newSessionImages)
      }
    } catch (err) {
      console.error('[AITasks] Failed to save images:', err)
    }
  }, [user?.id, session.id])

  const copyToClipboard = (ad: AdStudioSession['generated_ads'][0], index: number) => {
    const text = `Headline: ${ad.headline}\n\nPrimary Text: ${ad.primaryText}\n\nDescription: ${ad.description}`
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleSaveCopy = useCallback(async (ad: AdStudioSession['generated_ads'][0], index: number) => {
    if (!user?.id || !currentAccountId) return
    if (savedCopyIds[index]) return

    setSavingCopyIndex(index)
    try {
      const res = await fetch('/api/creative-studio/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description,
          angle: ad.angle,
          sessionId: session.id,
        }),
      })

      if (res.ok) {
        setSavedCopyIds(prev => ({ ...prev, [index]: true }))
      }
    } catch (err) {
      console.error('Failed to save copy:', err)
    } finally {
      setSavingCopyIndex(null)
    }
  }, [user?.id, currentAccountId, savedCopyIds, session.id])

  // Generate image for an ad
  const handleGenerateImage = useCallback(async (ad: AdStudioSession['generated_ads'][0], index: number) => {
    if (!session.product_info || !user?.id || !currentAccountId) return

    setGeneratingImageIndex(index)
    setImageErrors(prev => ({ ...prev, [index]: '' }))

    try {
      // 1. Generate image
      const requestBody: Record<string, unknown> = {
        userId: user.id,
        adCopy: {
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description,
          angle: ad.angle,
        },
        product: session.product_info,
        style: imageStyle,
        aspectRatio: '1:1',
        hdText,
      }

      const res = await fetch('/api/creative-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429 && data.limit) {
          setAiUsage({ used: data.used, limit: data.limit, status: data.status })
        }
        setImageErrors(prev => ({ ...prev, [index]: data.error || 'Failed to generate image' }))
        return
      }

      // Optimistically update usage counter
      setAiUsage(prev => prev ? { ...prev, used: prev.used + 1 } : prev)

      const newImage: GeneratedImage = {
        base64: data.image.base64,
        mimeType: data.image.mimeType,
      }

      // 2. Upload to storage for persistence (NOT to media library)
      const saveRes = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad - ${ad.angle} - ${session.id}`,
          userId: user.id,
          saveToLibrary: false,
        }),
      })

      const saveData = await saveRes.json()

      if (saveRes.ok && saveData.storageUrl) {
        newImage.storageUrl = saveData.storageUrl

        // 3. Calculate version index
        const existingImages = generatedImages[index] || []
        const versionIndex = existingImages.length

        // 4. Save to session for persistence
        const newSessionImage: SessionImage = {
          adIndex: index,
          versionIndex,
          storageUrl: saveData.storageUrl,
          mediaHash: saveData.mediaHash,
          mimeType: data.image.mimeType,
        }
        const updatedSessionImages = [...sessionImages, newSessionImage]
        await saveImagesToSession(updatedSessionImages)
      }

      // 5. Update local state
      setGeneratedImages(prev => {
        const existing = prev[index] || []
        return { ...prev, [index]: [...existing, newImage] }
      })
      setCurrentImageVersion(prev => {
        const existing = generatedImages[index] || []
        return { ...prev, [index]: existing.length } // Point to the new image
      })
    } catch (err) {
      setImageErrors(prev => ({ ...prev, [index]: 'Failed to generate image' }))
    } finally {
      setGeneratingImageIndex(null)
    }
  }, [session.product_info, session.id, imageStyle, hdText, user?.id, currentAccountId, generatedImages, sessionImages, saveImagesToSession])

  // Adjust an existing image
  const handleAdjustImage = useCallback(async (adIndex: number) => {
    if (!user?.id || !currentAccountId) return

    const images = generatedImages[adIndex]
    const currentVersion = currentImageVersion[adIndex] ?? 0
    const currentImage = images?.[currentVersion]
    const prompt = adjustmentPrompts[adIndex]

    if (!currentImage || !prompt?.trim()) return

    // Need base64 to adjust - if we only have storageUrl, we can't adjust
    if (!currentImage.base64) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Cannot adjust saved images - generate a new one first' }))
      return
    }

    setAdjustingImageIndex(adIndex)
    setImageErrors(prev => ({ ...prev, [adIndex]: '' }))

    try {
      const res = await fetch('/api/creative-studio/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImage.base64,
          imageMimeType: currentImage.mimeType,
          adjustmentPrompt: prompt,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setImageErrors(prev => ({ ...prev, [adIndex]: data.error || 'Failed to adjust image' }))
        return
      }

      const newImage: GeneratedImage = {
        base64: data.image.base64,
        mimeType: data.image.mimeType,
      }

      // Upload to storage for persistence (NOT to media library)
      const saveRes = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad Adjusted - ${session.id}`,
          userId: user.id,
          saveToLibrary: false,
        }),
      })

      const saveData = await saveRes.json()

      if (saveRes.ok && saveData.storageUrl) {
        newImage.storageUrl = saveData.storageUrl

        // Save to session
        const versionIndex = (generatedImages[adIndex] || []).length
        const newSessionImage: SessionImage = {
          adIndex,
          versionIndex,
          storageUrl: saveData.storageUrl,
          mediaHash: saveData.mediaHash,
          mimeType: data.image.mimeType,
        }
        const updatedSessionImages = [...sessionImages, newSessionImage]
        await saveImagesToSession(updatedSessionImages)
      }

      setGeneratedImages(prev => {
        const newImages = [...(prev[adIndex] || []), newImage]
        setTimeout(() => {
          setCurrentImageVersion(curr => ({
            ...curr,
            [adIndex]: newImages.length - 1
          }))
        }, 0)
        return { ...prev, [adIndex]: newImages }
      })
      setAdjustmentPrompts(prev => ({ ...prev, [adIndex]: '' }))
    } catch (err) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to adjust image' }))
    } finally {
      setAdjustingImageIndex(null)
    }
  }, [generatedImages, currentImageVersion, adjustmentPrompts, user?.id, currentAccountId, session.id, sessionImages, saveImagesToSession])

  // Navigate between versions
  const navigateVersion = (adIndex: number, direction: 'prev' | 'next') => {
    const images = generatedImages[adIndex]
    if (!images || images.length <= 1) return

    const current = currentImageVersion[adIndex] ?? 0
    const newVersion = direction === 'prev'
      ? Math.max(0, current - 1)
      : Math.min(images.length - 1, current + 1)

    setCurrentImageVersion(prev => ({ ...prev, [adIndex]: newVersion }))
  }

  // Save image to media library (explicit user action - uploads to Meta + media_library)
  const handleSaveToLibrary = useCallback(async (adIndex: number, ad: AdStudioSession['generated_ads'][0]) => {
    if (!currentAccountId || !user?.id) return

    const images = generatedImages[adIndex]
    const versionIndex = currentImageVersion[adIndex] ?? 0
    const image = images?.[versionIndex]
    if (!image) return

    const saveKey = `${adIndex}-${versionIndex}`
    if (savedToLibrary[saveKey]) return

    // If already has mediaHash, it was already saved to Meta/library
    if (image.mediaHash) {
      setSavedToLibrary(prev => ({ ...prev, [saveKey]: true }))
      return
    }

    if (!image.base64) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Image data not available - please regenerate' }))
      return
    }

    setSavingToLibrary(prev => ({ ...prev, [adIndex]: true }))

    try {
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: image.base64,
          mimeType: image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad - ${ad.angle} - ${new Date().toLocaleDateString()}`,
          userId: user.id,
          saveToLibrary: true,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      // Update image with Meta hash so Create Ad can use it
      setGeneratedImages(prev => {
        const imgs = [...(prev[adIndex] || [])]
        if (imgs[versionIndex]) {
          imgs[versionIndex] = { ...imgs[versionIndex], mediaHash: data.mediaHash, storageUrl: data.storageUrl }
        }
        return { ...prev, [adIndex]: imgs }
      })

      setSavedToLibrary(prev => ({ ...prev, [saveKey]: true }))
    } catch (err) {
      console.error('Failed to save to library:', err)
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to save to library' }))
    } finally {
      setSavingToLibrary(prev => ({ ...prev, [adIndex]: false }))
    }
  }, [currentAccountId, user?.id, generatedImages, currentImageVersion, savedToLibrary])

  // Download image
  const downloadImage = (image: GeneratedImage, adIndex: number, versionIndex: number) => {
    const link = document.createElement('a')
    if (image.base64) {
      link.href = `data:${image.mimeType};base64,${image.base64}`
    } else if (image.storageUrl) {
      link.href = image.storageUrl
    } else {
      return
    }
    link.download = `ad-image-${adIndex + 1}-v${versionIndex + 1}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Create ad - save to library first (needs Meta hash), then open wizard
  const handleCreateAd = useCallback(async (adIndex: number, ad: AdStudioSession['generated_ads'][0]) => {
    if (!currentAccountId || !user?.id) return

    const images = generatedImages[adIndex]
    const versionIndex = currentImageVersion[adIndex] ?? 0
    const image = images?.[versionIndex]
    if (!image) return

    setCreatingAd(prev => ({ ...prev, [adIndex]: true }))

    try {
      let storageUrl: string
      let mediaHash: string

      // If already saved to library (has Meta hash), reuse it
      if (image.mediaHash && image.storageUrl) {
        storageUrl = image.storageUrl
        mediaHash = image.mediaHash
      } else if (image.base64) {
        // Upload to Meta + media library for ad creation
        const res = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: image.base64,
            mimeType: image.mimeType,
            adAccountId: currentAccountId,
            name: `AI Ad - ${ad.angle} - ${new Date().toLocaleDateString()}`,
            userId: user.id,
            saveToLibrary: true,
          }),
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save')

        storageUrl = data.storageUrl
        mediaHash = data.mediaHash

        const saveKey = `${adIndex}-${versionIndex}`
        setSavedToLibrary(prev => ({ ...prev, [saveKey]: true }))
      } else {
        throw new Error('No image data available - please regenerate')
      }

      const creative: Creative = {
        preview: storageUrl,
        type: 'image',
        uploaded: true,
        isFromLibrary: true,
        imageHash: mediaHash,
      }

      setWizardCreatives([creative])
      setWizardCopy({
        primaryText: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
      })
      setShowLaunchWizard(true)
    } catch (err) {
      console.error('Failed to create ad:', err)
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to save image for ad creation' }))
    } finally {
      setCreatingAd(prev => ({ ...prev, [adIndex]: false }))
    }
  }, [currentAccountId, user?.id, generatedImages, currentImageVersion])

  return (
    <div className="space-y-6">
      {onClose && (
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-purple-400 uppercase tracking-wider">Product</span>
            </div>
            <h3 className="font-semibold text-white text-lg">{session.product_info?.name || 'Untitled'}</h3>
            {session.product_info?.description && (
              <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{session.product_info.description}</p>
            )}
          </div>
          {session.product_info?.price && (
            <span className="text-lg font-bold text-white">{session.product_info.price}</span>
          )}
        </div>
        {session.product_url && (
          <a
            href={session.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
          >
            View Product <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Competitor Info */}
      {(session.competitor_company || session.competitor_ad) && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Inspired By</span>
          </div>
          <div className="font-medium text-white">
            {session.competitor_company?.name || session.competitor_ad?.page_name || 'Unknown Competitor'}
          </div>
          {session.competitor_ad?.ad_creative_bodies?.[0] && (
            <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
              {session.competitor_ad.ad_creative_bodies[0]}
            </p>
          )}
        </div>
      )}

      {/* Generated Ads Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Generated Ad Copy ({session.generated_ads?.length || 0})
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Image style:</span>
          <select
            value={imageStyle}
            onChange={(e) => setImageStyle(e.target.value as typeof imageStyle)}
            className="bg-bg-dark border border-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
          >
            <option value="lifestyle">Lifestyle</option>
            <option value="product">Product</option>
            <option value="minimal">Minimal</option>
            <option value="bold">Bold</option>
          </select>
          {/* HD Text Toggle */}
          <button
            onClick={() => setHdText(!hdText)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
              hdText
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-bg-dark text-zinc-500 border-border hover:text-zinc-300'
            )}
            title="Use HD model for better text rendering (slower)"
          >
            <span className="text-[10px]">Aa</span>
            HD Text
          </button>
        </div>
      </div>

      {/* AI Generation Usage */}
      {aiUsage && (
        <div className={cn(
          'flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-fit',
          aiUsage.used >= aiUsage.limit
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-zinc-800 text-zinc-400'
        )}>
          <ImagePlus className="w-3 h-3" />
          {aiUsage.used >= aiUsage.limit
            ? `Image generation limit reached (${aiUsage.limit}${aiUsage.status === 'active' ? '/mo' : ' total'})`
            : `${aiUsage.limit - aiUsage.used} image generation${aiUsage.limit - aiUsage.used !== 1 ? 's' : ''} remaining${aiUsage.status === 'active' ? ' this month' : ''}`
          }
        </div>
      )}

      {/* Generated Ads Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {session.generated_ads?.map((ad, index) => {
          const images = generatedImages[index]
          const rawVersion = currentImageVersion[index] ?? 0
          const safeVersion = images ? Math.max(0, Math.min(rawVersion, images.length - 1)) : 0
          const currentImage = images?.[safeVersion]

          return (
            <div key={index} className="rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden">
              <div className="p-4 space-y-3">
                {/* Angle badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent font-semibold">
                    {ad.angle}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSaveCopy(ad, index)}
                      disabled={savingCopyIndex === index || savedCopyIds[index]}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        savedCopyIds[index]
                          ? 'text-emerald-400'
                          : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                      )}
                      title={savedCopyIds[index] ? 'Saved to Copy library' : 'Save to Copy library'}
                    >
                      {savingCopyIndex === index ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : savedCopyIds[index] ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => copyToClipboard(ad, index)}
                      className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                      title="Copy ad copy"
                    >
                      {copiedIndex === index ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Headline */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Headline</div>
                  <div className="text-white font-semibold">{ad.headline}</div>
                </div>

                {/* Primary Text */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Primary Text</div>
                  <div className="text-zinc-300 text-sm whitespace-pre-wrap">{ad.primaryText}</div>
                </div>

                {/* Description */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Description</div>
                  <div className="text-zinc-400 text-sm">{ad.description}</div>
                </div>

                {/* Why it works */}
                <div className="pt-3 border-t border-border">
                  <div className="text-xs text-emerald-400 mb-1">Why it works</div>
                  <div className="text-zinc-500 text-sm">{ad.whyItWorks}</div>
                </div>

                {/* Image Generation Section */}
                <div className="pt-3 border-t border-border">
                  {currentImage ? (
                    <div className="space-y-3">
                      {/* Header with version indicator */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-500">
                          Generated Image
                          {images && images.length > 1 && (
                            <span className="ml-2 text-zinc-400">
                              (Version {safeVersion + 1} of {images.length})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Image carousel */}
                      <div className="relative">
                        {/* Navigation arrows */}
                        {images && images.length > 1 && (
                          <>
                            <button
                              onClick={() => navigateVersion(index, 'prev')}
                              disabled={safeVersion === 0}
                              className={cn(
                                'absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors',
                                safeVersion === 0 && 'opacity-30 cursor-not-allowed'
                              )}
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => navigateVersion(index, 'next')}
                              disabled={safeVersion >= images.length - 1}
                              className={cn(
                                'absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors',
                                safeVersion >= images.length - 1 && 'opacity-30 cursor-not-allowed'
                              )}
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </>
                        )}

                        {/* Current image */}
                        <img
                          src={currentImage.storageUrl || `data:${currentImage.mimeType};base64,${currentImage.base64}`}
                          alt={`Generated ad image for ${ad.angle}`}
                          className="w-full rounded-lg border border-border"
                        />

                        {/* Version dots */}
                        {images && images.length > 1 && (
                          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {images.map((_, vIdx) => (
                              <button
                                key={vIdx}
                                onClick={() => setCurrentImageVersion(prev => ({ ...prev, [index]: vIdx }))}
                                className={cn(
                                  'w-2 h-2 rounded-full transition-colors',
                                  vIdx === safeVersion ? 'bg-white' : 'bg-white/40 hover:bg-white/60'
                                )}
                              />
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="absolute bottom-2 right-2 flex gap-2">
                          <button
                            onClick={() => downloadImage(currentImage, index, safeVersion)}
                            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                            title="Download image"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSaveToLibrary(index, ad)}
                            disabled={savingToLibrary[index] || savedToLibrary[`${index}-${safeVersion}`]}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              savedToLibrary[`${index}-${safeVersion}`]
                                ? 'bg-emerald-500/60 text-white'
                                : 'bg-black/60 hover:bg-black/80 text-white'
                            )}
                            title={savedToLibrary[`${index}-${safeVersion}`] ? 'Saved to library' : 'Add to Media Library'}
                          >
                            {savingToLibrary[index] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : savedToLibrary[`${index}-${safeVersion}`] ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <FolderPlus className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleGenerateImage(ad, index)}
                            disabled={generatingImageIndex !== null || adjustingImageIndex !== null}
                            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                            title="Generate new version"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCreateAd(index, ad)}
                            disabled={creatingAd[index] || generatingImageIndex !== null || adjustingImageIndex !== null}
                            className="p-2 rounded-lg bg-accent/80 hover:bg-accent text-white transition-colors"
                            title="Create Ad"
                          >
                            {creatingAd[index] ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Megaphone className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Adjust Image Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={adjustmentPrompts[index] || ''}
                          onChange={(e) => setAdjustmentPrompts(prev => ({ ...prev, [index]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleAdjustImage(index)}
                          placeholder="Adjust image... (e.g., 'make background blue')"
                          className="flex-1 bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                          disabled={adjustingImageIndex !== null || generatingImageIndex !== null}
                        />
                        <button
                          onClick={() => handleAdjustImage(index)}
                          disabled={!adjustmentPrompts[index]?.trim() || adjustingImageIndex !== null || generatingImageIndex !== null}
                          className={cn(
                            'px-3 py-2 rounded-lg transition-colors flex items-center gap-1',
                            'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                            (!adjustmentPrompts[index]?.trim() || adjustingImageIndex !== null || generatingImageIndex !== null) && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {adjustingImageIndex === index ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {imageErrors[index] && (
                        <div className="flex items-center gap-2 text-red-400 text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {imageErrors[index]}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No images - show generate button */
                    <div className="space-y-2">
                      <button
                        onClick={() => handleGenerateImage(ad, index)}
                        disabled={generatingImageIndex !== null || (aiUsage != null && aiUsage.used >= aiUsage.limit)}
                        className={cn(
                          'w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                          'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                          (generatingImageIndex !== null || (aiUsage != null && aiUsage.used >= aiUsage.limit)) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {generatingImageIndex === index ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating Image...
                          </>
                        ) : (
                          <>
                            <ImagePlus className="w-4 h-4" />
                            Generate Image
                          </>
                        )}
                      </button>
                      {imageErrors[index] && (
                        <div className="flex items-center gap-2 text-red-400 text-xs">
                          <AlertCircle className="w-3 h-3" />
                          {imageErrors[index]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Metadata */}
      <div className="text-xs text-zinc-500 text-center">
        Created {formatRelativeTime(session.created_at)}
        {session.image_style && ` • Style: ${session.image_style}`}
      </div>

      {/* Launch Wizard for creating ads */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)
            }}
            onCancel={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)
            }}
            initialEntityType="ad"
            preloadedCreatives={wizardCreatives}
            initialCopy={wizardCopy || undefined}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

type SelectedItemType = 'session' | 'analysis' | null

export default function AITasksPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan } = useSubscription()

  // Section expansion state
  const [adGenExpanded, setAdGenExpanded] = useState(true)
  const [videoExpanded, setVideoExpanded] = useState(true)

  // Track which type of item is selected
  const [selectedType, setSelectedType] = useState<SelectedItemType>(null)

  // Video analysis state
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [isLoadingAnalyses, setIsLoadingAnalyses] = useState(true)
  const [analysisTotal, setAnalysisTotal] = useState(0)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)

  // Ad Studio sessions state
  const [sessions, setSessions] = useState<AdStudioSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Mobile expanded view
  const [mobileExpandedItem, setMobileExpandedItem] = useState<{ type: SelectedItemType; id: string } | null>(null)

  const isPro = !!plan

  const selectedAnalysis = analyses.find(a => a.id === selectedAnalysisId) || null
  const selectedSession = sessions.find(s => s.id === selectedSessionId) || null

  // Load video analyses
  const loadAnalyses = useCallback(async () => {
    if (!user || !currentAccountId) return

    setIsLoadingAnalyses(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
        limit: '50',
        offset: '0'
      })

      const res = await fetch(`/api/creative-studio/video-analyses?${params}`)
      const data = await res.json()

      if (data.analyses) {
        setAnalyses(data.analyses)
        setAnalysisTotal(data.total)
      }
    } catch (err) {
      console.error('Failed to load analyses:', err)
    } finally {
      setIsLoadingAnalyses(false)
    }
  }, [user, currentAccountId])

  // Load Ad Studio sessions
  const loadSessions = useCallback(async () => {
    if (!user || !currentAccountId) return

    setIsLoadingSessions(true)
    try {
      const params = new URLSearchParams({
        userId: user.id,
        adAccountId: currentAccountId,
      })

      const res = await fetch(`/api/creative-studio/ad-session?${params}`)
      const data = await res.json()

      if (data.sessions) {
        setSessions(data.sessions)
        // Auto-select first session if we have sessions
        if (data.sessions.length > 0 && !selectedSessionId && !selectedAnalysisId) {
          setSelectedSessionId(data.sessions[0].id)
          setSelectedType('session')
        }
      }
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setIsLoadingSessions(false)
    }
  }, [user, currentAccountId, selectedSessionId, selectedAnalysisId])

  useEffect(() => {
    loadAnalyses()
    loadSessions()
  }, [loadAnalyses, loadSessions])

  // Poll for video analysis updates
  useEffect(() => {
    const hasProcessing = analyses.some(a => a.status === 'processing')
    if (!hasProcessing) return

    const interval = setInterval(loadAnalyses, 5000)
    return () => clearInterval(interval)
  }, [analyses, loadAnalyses])

  // Handlers for selecting items
  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setSelectedAnalysisId(null)
    setSelectedType('session')
    if (window.innerWidth < 1024) {
      setMobileExpandedItem({ type: 'session', id: sessionId })
    }
  }

  const handleSelectAnalysis = (analysisId: string) => {
    setSelectedAnalysisId(analysisId)
    setSelectedSessionId(null)
    setSelectedType('analysis')
    if (window.innerWidth < 1024) {
      setMobileExpandedItem({ type: 'analysis', id: analysisId })
    }
  }

  // Not Pro - show upgrade prompt
  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-purple-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">AI Tasks</h1>
        <p className="text-zinc-400 mb-8 max-w-md">
          Access AI-powered video analysis and ad generation history.
          Upgrade to Pro to unlock this feature.
        </p>
        <Link
          href="/pricing"
          className="px-8 py-3 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors"
        >
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  const isLoading = isLoadingAnalyses || isLoadingSessions
  const isEmpty = sessions.length === 0 && analyses.length === 0

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="px-4 lg:px-6 pt-2 pb-4 flex-shrink-0">
        <h1 className="text-2xl lg:text-3xl font-bold text-white">AI Tasks</h1>
        <p className="text-zinc-400 mt-1 text-sm">Your AI-generated ad copy and video analyses</p>
      </div>

      {/* Loading state */}
      {isLoading && isEmpty && (
        <div className="p-4 lg:p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No AI tasks yet</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm">
            Use Ad Studio to generate ad copy or analyze videos in Creative Suite.
          </p>
          <Link
            href="/dashboard/creative-studio/ad-studio"
            className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-medium transition-colors"
          >
            Open Ad Studio
          </Link>
        </div>
      )}

      {/* Main content - Master/Detail layout */}
      {!isEmpty && (
        <div className="flex-1 flex min-h-0">
          {/* Left column - List with collapsible sections */}
          <div className={cn(
            'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-border flex flex-col overflow-hidden',
            mobileExpandedItem && 'hidden lg:flex'
          )}>
            <div className="flex-1 overflow-y-auto">
              {/* Ad Generation Section */}
              <div className="border-b border-border">
                <button
                  onClick={() => setAdGenExpanded(!adGenExpanded)}
                  className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white">Ad Generation</span>
                    {sessions.length > 0 && (
                      <span className="text-xs text-zinc-500">({sessions.length})</span>
                    )}
                  </div>
                  {adGenExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {adGenExpanded && (
                  <div className="pb-2">
                    {isLoadingSessions && sessions.length === 0 ? (
                      <div className="px-2 space-y-1">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-xs text-zinc-500 mb-2">No ad generations yet</p>
                        <Link
                          href="/dashboard/creative-studio/ad-studio"
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Open Ad Studio →
                        </Link>
                      </div>
                    ) : (
                      <div className="px-2 space-y-1">
                        {sessions.map((session) => (
                          <AdSessionListItem
                            key={session.id}
                            session={session}
                            isSelected={selectedType === 'session' && session.id === selectedSessionId}
                            onClick={() => handleSelectSession(session.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Video Analysis Section */}
              <div>
                <button
                  onClick={() => setVideoExpanded(!videoExpanded)}
                  className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium text-white">Video Analysis</span>
                    {analysisTotal > 0 && (
                      <span className="text-xs text-zinc-500">({analysisTotal})</span>
                    )}
                  </div>
                  {videoExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {videoExpanded && (
                  <div className="pb-2">
                    {isLoadingAnalyses && analyses.length === 0 ? (
                      <div className="px-2 space-y-1">
                        {[1, 2].map((i) => (
                          <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : analyses.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-xs text-zinc-500 mb-2">No video analyses yet</p>
                        <Link
                          href="/dashboard/creative-studio/media"
                          className="text-xs text-accent hover:text-accent-hover"
                        >
                          Browse Media →
                        </Link>
                      </div>
                    ) : (
                      <div className="px-2 space-y-1">
                        {analyses.map((item) => (
                          <AnalysisListItem
                            key={item.id}
                            item={item}
                            isSelected={selectedType === 'analysis' && item.id === selectedAnalysisId}
                            onClick={() => handleSelectAnalysis(item.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column - Detail panel */}
          <div className="hidden lg:block flex-1 overflow-y-auto">
            {selectedType === 'session' && selectedSession ? (
              <div className="max-w-4xl mx-auto p-6">
                <AdSessionDetailPanel session={selectedSession} />
              </div>
            ) : selectedType === 'analysis' && selectedAnalysis ? (
              <div className="max-w-4xl mx-auto p-6">
                <AnalysisDetailPanel item={selectedAnalysis} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Select a task</h3>
                <p className="text-sm text-zinc-500">Click on an item from the list to view details</p>
              </div>
            )}
          </div>

          {/* Mobile expanded view */}
          {mobileExpandedItem && (
            <div className="lg:hidden fixed inset-0 z-50 bg-bg-dark overflow-y-auto">
              <div className="p-4 pt-14">
                <button
                  onClick={() => setMobileExpandedItem(null)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
                {mobileExpandedItem.type === 'session' && sessions.find(s => s.id === mobileExpandedItem.id) && (
                  <AdSessionDetailPanel
                    session={sessions.find(s => s.id === mobileExpandedItem.id)!}
                    onClose={() => setMobileExpandedItem(null)}
                  />
                )}
                {mobileExpandedItem.type === 'analysis' && analyses.find(a => a.id === mobileExpandedItem.id) && (
                  <AnalysisDetailPanel
                    item={analyses.find(a => a.id === mobileExpandedItem.id)!}
                    onClose={() => setMobileExpandedItem(null)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
