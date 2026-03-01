'use client'

import { useRef, useEffect } from 'react'
import { Sparkles, ArrowRight, Video, ImageIcon, Pencil, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleMessage, OracleOption, OracleContextCard } from './oracle-types'

interface OracleChatThreadProps {
  messages: OracleMessage[]
  onOptionClick: (option: OracleOption) => void
  onPromptAction: (action: 'generate' | 'edit' | 'startOver', prompt?: string, format?: string) => void
  isSending: boolean
}

export function OracleChatThread({ messages, onOptionClick, onPromptAction, isSending }: OracleChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  return (
    <div className="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700/50">
      {messages.map((msg) => (
        <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
          <div className={cn(
            'max-w-[85%] rounded-2xl px-4 py-3',
            msg.role === 'user'
              ? 'bg-purple-500/20 text-white'
              : 'bg-white/[0.05] text-zinc-200 border border-white/[0.06]'
          )}>
            {/* Oracle label */}
            {msg.role === 'oracle' && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">KS</span>
              </div>
            )}

            {/* Escalation message */}
            {msg.isEscalating && (
              <div className="flex items-center gap-2 py-2 mb-2 border-b border-purple-500/20">
                <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                </div>
                <span className="text-sm text-purple-300 italic">Putting on my creative director hat...</span>
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

            {/* Prompt preview */}
            {msg.promptPreview && (
              <div className="mt-3 bg-black/30 border border-purple-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Ready to generate</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{msg.promptPreview.prompt}&rdquo;</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onPromptAction('generate', msg.promptPreview!.prompt, msg.promptPreview!.format)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
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

            {/* Clickable options */}
            {msg.options && msg.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {msg.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onOptionClick(opt)}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-sm text-purple-300 hover:bg-purple-500/25 hover:text-purple-200 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Sending indicator */}
      {isSending && (
        <div className="flex justify-start">
          <div className="bg-white/[0.05] border border-white/[0.06] rounded-2xl px-4 py-3 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            <span className="text-sm text-zinc-400">KS is thinking...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function ContextCardDisplay({ card }: { card: OracleContextCard }) {
  if (card.type === 'product') {
    const d = card.data as Record<string, string>
    return (
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
        <div className="flex items-center gap-2 mb-1">
          <ArrowRight className="w-3 h-3 text-purple-400" />
          <span className="text-xs font-medium text-zinc-400">Product detected</span>
        </div>
        <p className="text-sm font-medium text-white">{d.name || 'Product'}</p>
        {d.price && <p className="text-xs text-zinc-400 mt-0.5">{d.price}</p>}
        {d.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{d.description}</p>}
      </div>
    )
  }
  return null
}
