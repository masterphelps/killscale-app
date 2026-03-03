'use client'

import { useRef, useEffect, useState } from 'react'
import { Sparkles, ArrowRight, Video, ImageIcon, Pencil, RotateCcw, Loader2, Zap, Star, Target, MessageCircle, Lightbulb, Users, Tag, ChevronDown, ChevronUp, Upload, FolderOpen, Copy, Download, ExternalLink, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleMessage, OracleOption, OracleContextCard, OracleTier } from './oracle-types'

// Rotating research status messages
const RESEARCH_MESSAGES = [
  'Visiting the site...',
  'Reading the page...',
  'Gathering product details...',
  'Looking through photos...',
  'Reading specifications...',
  'Checking reviews...',
  'Analyzing pricing...',
  'Identifying key features...',
  'Understanding the brand...',
]

const THINKING_MESSAGES = {
  haiku: ['KS is thinking...'],
  sonnet: ['KS is thinking...'],
  opus: [
    'KS Creative is thinking...',
    'Exploring creative angles...',
    'Considering visual concepts...',
  ],
}

function useRotatingStatus(isActive: boolean, messages: string[], intervalMs = 2200) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!isActive) { setIndex(0); return }
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % messages.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [isActive, messages, intervalMs])
  return messages[index]
}

// Tier color config
const TIER_COLORS = {
  haiku: {
    label: 'text-purple-400',
    icon: 'text-purple-400',
    bubble: 'border-white/[0.06]',
    optionBg: 'bg-purple-500/15 border-purple-500/25',
    optionText: 'text-purple-300',
    optionHover: 'hover:bg-purple-500/25 hover:text-purple-200',
    tag: 'KS',
  },
  sonnet: {
    label: 'text-purple-400',
    icon: 'text-purple-400',
    bubble: 'border-white/[0.06]',
    optionBg: 'bg-purple-500/15 border-purple-500/25',
    optionText: 'text-purple-300',
    optionHover: 'hover:bg-purple-500/25 hover:text-purple-200',
    tag: 'KS',
  },
  opus: {
    label: 'text-fuchsia-300',
    icon: 'text-fuchsia-300',
    bubble: 'border-fuchsia-500/15',
    optionBg: 'bg-purple-500/15 border-purple-500/25',
    optionText: 'text-purple-300',
    optionHover: 'hover:bg-purple-500/25 hover:text-purple-200',
    tag: 'KS Creative',
  },
} as const

function getTierColors(tier?: OracleTier) {
  return TIER_COLORS[tier || 'sonnet']
}

interface OracleChatThreadProps {
  messages: OracleMessage[]
  currentTier: OracleTier
  onOptionClick: (option: OracleOption) => void
  onPromptAction: (action: 'generate' | 'edit' | 'startOver', prompt?: string, format?: string) => void
  isSending: boolean
  isResearching?: boolean
  onMediaUpload?: (messageId: string, mediaType: 'image' | 'video' | 'any') => void
  onMediaLibrary?: (messageId: string, mediaType: 'image' | 'video' | 'any') => void
  onCreditConfirm?: (messageId: string) => void
  onCreditCancel?: (messageId: string) => void
  onOpenInEditor?: (config: Record<string, unknown>, videoUrl?: string) => void
  onSaveCopy?: (ad: { headline: string; primaryText: string; description?: string; angle?: string }) => void
}

export function OracleChatThread({ messages, currentTier, onOptionClick, onPromptAction, isSending, isResearching, onMediaUpload, onMediaLibrary, onCreditConfirm, onCreditCancel, onOpenInEditor, onSaveCopy }: OracleChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [previewMedia, setPreviewMedia] = useState<{ url: string; preview?: string; type: string; name: string } | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  const sendingColors = getTierColors(currentTier)

  return (
    <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700/50">
      {messages.map((msg) => {
        const colors = getTierColors(msg.tier)

        return (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-blue-500/20 text-white'
                : cn('bg-white/[0.05] text-zinc-200 border', colors.bubble)
            )}>
              {/* Oracle label — tier-aware */}
              {msg.role === 'oracle' && !msg.isEscalating && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className={cn('w-3.5 h-3.5', colors.icon)} />
                  <span className={cn('text-[11px] font-semibold uppercase tracking-wider', colors.label)}>
                    {colors.tag}
                  </span>
                </div>
              )}

              {/* Escalation transition */}
              {msg.isEscalating && (
                <div className="flex items-center gap-3 py-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                    </div>
                    <div className="w-8 border-t border-dashed border-zinc-600" />
                    <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
                    <div className="w-8 border-t border-dashed border-zinc-600" />
                    <div className="w-6 h-6 rounded-full bg-fuchsia-500/20 flex items-center justify-center animate-pulse">
                      <Sparkles className="w-3 h-3 text-fuchsia-300" />
                    </div>
                  </div>
                  <span className="text-sm text-fuchsia-300/80 italic">Switching to Creative Director...</span>
                </div>
              )}

              {/* Media attachments on user messages */}
              {msg.mediaAttachments && msg.mediaAttachments.length > 0 && (
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  {msg.mediaAttachments.map((media, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewMedia(media)}
                      className="relative w-20 h-20 rounded-lg overflow-hidden border border-zinc-700/50 bg-zinc-800/50 shrink-0 group cursor-pointer hover:border-purple-500/40 transition-colors"
                    >
                      {media.type === 'video' ? (
                        <video
                          src={`${media.url || media.preview}#t=0.3`}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={media.preview || media.url}
                          alt={media.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {media.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Video className="w-5 h-5 text-white/80" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Message text */}
              {msg.content && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Context cards */}
              {msg.contextCards && msg.contextCards.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.contextCards.map((card, i) => (
                    <ContextCardDisplay
                      key={i}
                      card={card}
                      messageId={msg.id}
                      onCreditConfirm={onCreditConfirm}
                      onCreditCancel={onCreditCancel}
                      onOpenInEditor={onOpenInEditor}
                      onSaveCopy={onSaveCopy}
                    />
                  ))}
                </div>
              )}

              {/* Media request buttons */}
              {msg.mediaRequest && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onMediaUpload?.(msg.id, msg.mediaRequest!.type)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 text-sm font-medium transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </button>
                  <button
                    onClick={() => onMediaLibrary?.(msg.id, msg.mediaRequest!.type)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700/50 text-zinc-300 hover:bg-zinc-700/70 border border-zinc-600/50 text-sm font-medium transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Media Library
                  </button>
                </div>
              )}

              {/* Prompt preview — always fuchsia (Opus territory) */}
              {msg.promptPreview && (
                <div className="mt-3 bg-black/30 border border-fuchsia-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-fuchsia-300" />
                    <span className="text-xs font-semibold text-fuchsia-300 uppercase tracking-wider">Ready to generate</span>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{msg.promptPreview.prompt}&rdquo;</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onPromptAction('generate', msg.promptPreview!.prompt, msg.promptPreview!.format)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium transition-colors"
                    >
                      {msg.promptPreview.format === 'video' ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      Generate {msg.promptPreview.format === 'video' ? 'Video' : 'Image'}
                    </button>
                    <button
                      onClick={() => onPromptAction('edit', msg.promptPreview!.prompt, msg.promptPreview!.format)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-sm transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => onPromptAction('startOver')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-sm transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Start Over
                    </button>
                  </div>
                </div>
              )}

              {/* Clickable options — tier-aware + escalation glow */}
              {msg.options && msg.options.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {msg.options.map((opt) => {
                    const isEscalation = opt.escalates
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onOptionClick(opt)}
                        className={cn(
                          'px-3.5 py-1.5 rounded-lg border text-sm transition-colors',
                          isEscalation
                            ? 'bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300 hover:bg-fuchsia-500/30 hover:text-fuchsia-200'
                            : cn(colors.optionBg, colors.optionText, colors.optionHover)
                        )}
                      >
                        {isEscalation && <Sparkles className="w-3 h-3 inline mr-1.5 -mt-0.5" />}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Sending indicator — tier-aware with rotating status */}
      {isSending && (
        <SendingIndicator
          tier={currentTier}
          isResearching={isResearching}
          colors={sendingColors}
        />
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function SendingIndicator({ tier, isResearching, colors }: { tier: OracleTier; isResearching?: boolean; colors: ReturnType<typeof getTierColors> }) {
  const researchStatus = useRotatingStatus(!!isResearching, RESEARCH_MESSAGES, 2200)
  const thinkingStatus = useRotatingStatus(!isResearching, THINKING_MESSAGES[tier] || THINKING_MESSAGES.sonnet, 3000)
  const status = isResearching ? researchStatus : thinkingStatus

  return (
    <div className="flex justify-start">
      <div className={cn('bg-white/[0.05] border rounded-2xl px-4 py-3 flex items-center gap-2', colors.bubble)}>
        <Loader2 className={cn('w-4 h-4 animate-spin', colors.icon)} />
        <span className="text-sm text-zinc-400 transition-opacity duration-300">
          {status}
        </span>
      </div>
    </div>
  )
}

function ProductDetailSection({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-purple-400 shrink-0" />
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</span>
      </div>
      {children}
    </div>
  )
}

function AdCopyCardGroup({ ads, onSaveCopy }: {
  ads: Array<{ headline: string; primaryText: string; description?: string; angle: string; whyItWorks?: string }>
  onSaveCopy?: (ad: { headline: string; primaryText: string; description?: string; angle?: string }) => void
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set())

  const handleCopy = (ad: typeof ads[0], idx: number) => {
    const text = `${ad.headline}\n\n${ad.primaryText}${ad.description ? `\n\n${ad.description}` : ''}`
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleSave = (ad: typeof ads[0], idx: number) => {
    onSaveCopy?.(ad)
    setSavedIdx(prev => new Set(prev).add(idx))
  }

  return (
    <div className="mt-2 space-y-2">
      {ads.map((ad, i) => {
        const isExpanded = expandedIdx === i
        return (
          <div key={i} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden">
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              className="w-full p-3 text-left hover:bg-zinc-700/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">{ad.headline}</div>
                  {!isExpanded && <div className="text-xs text-zinc-400 line-clamp-2 mt-1">{ad.primaryText}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded">{ad.angle}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
                </div>
              </div>
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-zinc-700/30 pt-3">
                <div className="text-sm text-zinc-300 whitespace-pre-wrap">{ad.primaryText}</div>
                {ad.description && (
                  <div className="text-xs text-zinc-500">Link description: {ad.description}</div>
                )}
                {ad.whyItWorks && (
                  <div className="text-xs text-zinc-500 italic">{ad.whyItWorks}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(ad, i) }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    <Copy className="w-3 h-3" /> {copiedIdx === i ? 'Copied!' : 'Copy'}
                  </button>
                  {onSaveCopy && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSave(ad, i) }}
                      disabled={savedIdx.has(i)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors",
                        savedIdx.has(i)
                          ? "text-emerald-400 bg-emerald-500/10 cursor-default"
                          : "text-zinc-300 bg-zinc-700/50 hover:bg-zinc-700"
                      )}
                    >
                      <Star className="w-3 h-3" /> {savedIdx.has(i) ? 'Saved' : 'Save to Library'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ContextCardDisplay({ card, messageId, onCreditConfirm, onCreditCancel, onOpenInEditor, onSaveCopy }: {
  card: OracleContextCard
  messageId: string
  onCreditConfirm?: (messageId: string) => void
  onCreditCancel?: (messageId: string) => void
  onOpenInEditor?: (config: Record<string, unknown>, videoUrl?: string) => void
  onSaveCopy?: (ad: { headline: string; primaryText: string; description?: string; angle?: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)

  // --- tool-loading ---
  if (card.type === 'tool-loading') {
    return (
      <div className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
        <div>
          <div className="text-sm text-purple-300 font-medium capitalize">{String(card.data.tool || '').replace(/_/g, ' ')}...</div>
          <div className="text-xs text-zinc-500">{String(card.data.reason || '')}</div>
        </div>
      </div>
    )
  }

  // --- tool-error ---
  if (card.type === 'tool-error') {
    return (
      <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
        <div className="text-sm text-red-300">{String(card.data.error || 'Something went wrong')}</div>
      </div>
    )
  }

  // --- video-analysis ---
  if (card.type === 'video-analysis') {
    const analysis = card.data.analysis as Record<string, unknown> | undefined
    const transcript = (analysis?.transcript as string) || (card.data.transcript as string) || ''
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3 space-y-2">
        <div className="text-xs font-medium text-zinc-400">Video Analysis</div>
        {transcript ? (
          <div className="text-xs text-zinc-500 italic line-clamp-3">&quot;{transcript}&quot;</div>
        ) : null}
        {analysis ? (
          <div className="flex gap-2 flex-wrap">
            {(['hook', 'hold', 'click', 'convert'] as const).map(stage => {
              const stageData = analysis[stage] as { score?: number } | undefined
              const score = stageData?.score
              if (score == null) return null
              const color = score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : score >= 25 ? 'text-orange-400' : 'text-red-400'
              return (
                <span key={stage} className={`text-xs font-medium ${color} bg-zinc-700/50 px-2 py-0.5 rounded capitalize`}>
                  {stage}: {score}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  // --- overlay-preview ---
  if (card.type === 'overlay-preview') {
    const jobId = card.data.jobId as string | undefined
    const videoUrl = card.data.videoUrl as string | undefined
    const handleEditInEditor = () => {
      if (jobId) {
        // Standard pattern: navigate with ?jobId= (same as Video Studio, Direct Studio, etc.)
        if (onOpenInEditor) {
          onOpenInEditor({ jobId }, videoUrl)
        } else {
          window.location.href = `/dashboard/creative-studio/video-editor?jobId=${jobId}&from=oracle`
        }
      } else if (videoUrl) {
        // Fallback if job creation failed
        if (onOpenInEditor) {
          onOpenInEditor({}, videoUrl)
        } else {
          window.location.href = `/dashboard/creative-studio/video-editor?videoUrl=${encodeURIComponent(videoUrl)}&from=oracle`
        }
      }
    }
    return (
      <div className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-purple-400">Overlay Ready</div>
          {card.data.style ? <span className="text-[10px] font-medium px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">{String(card.data.style)}</span> : null}
        </div>
        {card.data.hookText ? (
          <div className="text-sm text-white font-semibold">&quot;{String(card.data.hookText)}&quot;</div>
        ) : null}
        <div className="flex gap-3 text-xs text-zinc-400">
          {card.data.captionCount != null ? <span>{String(card.data.captionCount)} captions</span> : null}
          {card.data.ctaText ? <span>CTA: &quot;{String(card.data.ctaText)}&quot;</span> : null}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleEditInEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit in Video Editor
          </button>
        </div>
      </div>
    )
  }

  // --- ad-copy ---
  if (card.type === 'ad-copy') {
    return <AdCopyCardGroup ads={card.data.ads as Array<{ headline: string; primaryText: string; description?: string; angle: string; whyItWorks?: string }> || []} onSaveCopy={onSaveCopy} />
  }

  // --- image-result ---
  if (card.type === 'image-result') {
    const image = card.data.image as { base64?: string; mimeType?: string } | undefined
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 overflow-hidden">
        {image?.base64 ? (
          <img
            src={`data:${image.mimeType || 'image/png'};base64,${image.base64}`}
            alt="Generated"
            className="w-full max-h-80 object-contain bg-zinc-900"
          />
        ) : null}
        <div className="p-2 flex gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-700/50 rounded transition-colors">
            <Download className="w-3 h-3" /> Save
          </button>
          <button className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-700/50 rounded transition-colors">
            <ExternalLink className="w-3 h-3" /> Edit
          </button>
        </div>
      </div>
    )
  }

  // --- video-result ---
  if (card.type === 'video-result') {
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
        <div className="flex items-center gap-3">
          {card.data.status === 'generating' ? (
            <>
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              <div>
                <div className="text-sm text-white">Generating video...</div>
                <div className="text-xs text-zinc-500">This usually takes 2-5 minutes</div>
              </div>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="text-sm text-white">Video ready</div>
            </>
          )}
        </div>
        {card.data.creditCost ? (
          <div className="text-xs text-amber-400 mt-2">{String(card.data.creditCost)} credits used</div>
        ) : null}
      </div>
    )
  }

  // --- media-attached ---
  if (card.type === 'media-attached') {
    return (
      <div className="mt-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2 flex items-center gap-3 max-w-xs">
        <div className="w-10 h-10 rounded bg-zinc-700/50 flex items-center justify-center shrink-0">
          {card.data.type === 'video'
            ? <Video className="w-4 h-4 text-zinc-400" />
            : <ImageIcon className="w-4 h-4 text-zinc-400" />
          }
        </div>
        <div className="min-w-0">
          <div className="text-sm text-white truncate">{String(card.data.name || 'Media')}</div>
          <div className="text-xs text-zinc-500 capitalize">{String(card.data.type || 'file')}</div>
        </div>
      </div>
    )
  }

  // --- credit-confirm ---
  if (card.type === 'credit-confirm') {
    return (
      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-medium text-amber-300">Generate for {String(card.data.credits)} credits?</div>
        </div>
        <div className="text-xs text-zinc-400 mb-3">{String(card.data.reason || '')}</div>
        <div className="flex gap-2">
          <button
            onClick={() => onCreditConfirm?.(messageId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => onCreditCancel?.(messageId)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-700/50 hover:bg-zinc-700/70 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // --- product ---
  if (card.type === 'product') {
    // Data may be { product: {...}, productImages: [...] } or flat { name, price, ... }
    const raw = card.data as Record<string, unknown>
    const d = (raw.product || raw) as Record<string, unknown>
    const pageQuality = d.pageQuality as string | undefined
    const name = (d.name as string) || 'Product'
    const price = d.price as string | undefined
    const currency = d.currency as string | undefined
    const category = d.category as string | undefined
    const brand = d.brand as string | undefined
    const description = d.description as string | undefined

    const features = (d.features as string[]) || []
    const benefits = (d.benefits as string[]) || []
    const painPoints = (d.painPoints as string[]) || []
    const testimonials = (d.testimonialPoints as string[]) || []
    const keyMessages = (d.keyMessages as string[]) || []
    const usp = d.uniqueSellingPoint as string | undefined
    const audience = d.targetAudience as string | undefined
    const visualHooks = (d.visualHooks as string[]) || []

    const hasDetails = features.length > 0 || benefits.length > 0 || painPoints.length > 0
      || testimonials.length > 0 || keyMessages.length > 0 || usp || audience || visualHooks.length > 0

    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ArrowRight className="w-3 h-3 text-purple-400" />
          <span className="text-xs font-medium text-zinc-400">Product research</span>
          {pageQuality === 'minimal' && (
            <span className="text-[10px] text-amber-400/70 ml-1">(limited — site may need JavaScript)</span>
          )}
        </div>

        {/* Name + Price + Category */}
        <div>
          <p className="text-sm font-semibold text-white">{name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {price && (
              <span className="text-xs text-zinc-300">{currency ? `${currency} ` : ''}{price}</span>
            )}
            {category && (
              <span className="text-[10px] text-zinc-500 bg-white/[0.05] px-1.5 py-0.5 rounded">{category}</span>
            )}
            {brand && brand !== name && (
              <span className="text-[10px] text-zinc-500">by {brand}</span>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
        )}

        {/* USP callout */}
        {usp && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1.5">
            <p className="text-xs text-purple-300"><Lightbulb className="w-3 h-3 inline mr-1 -mt-0.5" />{usp}</p>
          </div>
        )}

        {/* Expandable details */}
        {hasDetails && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Less detail' : 'Full breakdown'}
            </button>

            {expanded && (
              <div className="space-y-3 pt-1 border-t border-white/[0.06]">
                {/* Key Messages / Taglines */}
                {keyMessages.length > 0 && (
                  <ProductDetailSection icon={Tag} label="Key Messages">
                    <div className="flex flex-wrap gap-1.5">
                      {keyMessages.map((kmsg, i) => (
                        <span key={i} className="text-[11px] text-zinc-300 bg-white/[0.06] px-2 py-1 rounded-md italic">&ldquo;{kmsg}&rdquo;</span>
                      ))}
                    </div>
                  </ProductDetailSection>
                )}

                {/* Features */}
                {features.length > 0 && (
                  <ProductDetailSection icon={Star} label="Features">
                    <ul className="space-y-0.5">
                      {features.map((f, i) => (
                        <li key={i} className="text-xs text-zinc-400 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-purple-500/40">{f}</li>
                      ))}
                    </ul>
                  </ProductDetailSection>
                )}

                {/* Benefits */}
                {benefits.length > 0 && (
                  <ProductDetailSection icon={ArrowRight} label="Benefits">
                    <ul className="space-y-0.5">
                      {benefits.map((b, i) => (
                        <li key={i} className="text-xs text-zinc-400 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-green-500/40">{b}</li>
                      ))}
                    </ul>
                  </ProductDetailSection>
                )}

                {/* Target Audience */}
                {audience && (
                  <ProductDetailSection icon={Users} label="Target Audience">
                    <p className="text-xs text-zinc-400">{audience}</p>
                  </ProductDetailSection>
                )}

                {/* Pain Points */}
                {painPoints.length > 0 && (
                  <ProductDetailSection icon={Target} label="Pain Points Addressed">
                    <ul className="space-y-0.5">
                      {painPoints.map((p, i) => (
                        <li key={i} className="text-xs text-zinc-400 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-amber-500/40">{p}</li>
                      ))}
                    </ul>
                  </ProductDetailSection>
                )}

                {/* Testimonials */}
                {testimonials.length > 0 && (
                  <ProductDetailSection icon={MessageCircle} label="What People Are Saying">
                    <div className="space-y-1">
                      {testimonials.map((t, i) => (
                        <p key={i} className="text-xs text-zinc-400 italic pl-2 border-l-2 border-purple-500/30">&ldquo;{t}&rdquo;</p>
                      ))}
                    </div>
                  </ProductDetailSection>
                )}

                {/* Visual Hooks */}
                {visualHooks.length > 0 && (
                  <ProductDetailSection icon={Lightbulb} label="Visual Ad Ideas">
                    <ul className="space-y-0.5">
                      {visualHooks.map((v, i) => (
                        <li key={i} className="text-xs text-zinc-400 pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-fuchsia-500/40">{v}</li>
                      ))}
                    </ul>
                  </ProductDetailSection>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return null
}
