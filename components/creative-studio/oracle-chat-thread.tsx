'use client'

import { useRef, useEffect, useState } from 'react'
import { Sparkles, ArrowRight, Video, ImageIcon, Pencil, RotateCcw, Loader2, Zap, Star, Target, MessageCircle, Lightbulb, Users, Tag, ChevronDown, ChevronUp } from 'lucide-react'
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
}

export function OracleChatThread({ messages, currentTier, onOptionClick, onPromptAction, isSending, isResearching }: OracleChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

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

              {/* Message text */}
              {msg.content && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* Context cards */}
              {msg.contextCards && msg.contextCards.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.contextCards.map((card, i) => (
                    <ContextCardDisplay key={i} card={card} />
                  ))}
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

function ContextCardDisplay({ card }: { card: OracleContextCard }) {
  const [expanded, setExpanded] = useState(false)

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
                      {keyMessages.map((msg, i) => (
                        <span key={i} className="text-[11px] text-zinc-300 bg-white/[0.06] px-2 py-1 rounded-md italic">&ldquo;{msg}&rdquo;</span>
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
