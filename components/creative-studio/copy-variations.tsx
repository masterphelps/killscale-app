'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CopyVariation } from './types'

interface CopyVariationsProps {
  variations: CopyVariation[]
}

export function CopyVariations({ variations }: CopyVariationsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Sort by ROAS descending
  const sortedVariations = [...variations].sort((a, b) => b.roas - a.roas)

  // Filter out variations with no copy at all
  const withCopy = sortedVariations.filter(v => v.headline || v.body)

  if (withCopy.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl p-4">
        <p className="text-sm text-zinc-500 text-center py-4">No copy variations found</p>
      </div>
    )
  }

  return (
    <div className="bg-bg-card rounded-xl p-4 space-y-2">
      {withCopy.map((variation, index) => {
        const isExpanded = expandedId === variation.creativeId

        return (
          <motion.div
            key={variation.creativeId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              'border rounded-lg transition-colors',
              index === 0 ? 'border-verdict-scale/30 bg-verdict-scale/5' : 'border-border/50 bg-bg-dark/50',
            )}
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : variation.creativeId)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              {/* Rank badge */}
              <span className={cn(
                'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                index === 0
                  ? 'bg-verdict-scale/20 text-verdict-scale'
                  : 'bg-zinc-800 text-zinc-400',
              )}>
                {index + 1}
              </span>

              {/* Headline */}
              <span className={cn(
                'flex-1 text-sm truncate',
                variation.headline ? 'text-white' : 'text-zinc-500 italic',
              )}>
                {variation.headline || '(No headline)'}
              </span>

              {/* ROAS + Spend */}
              <span className={cn(
                'flex-shrink-0 text-sm font-mono font-medium',
                variation.roas >= 2 ? 'text-verdict-scale' :
                variation.roas >= 1 ? 'text-verdict-watch' :
                'text-verdict-kill'
              )}>
                {variation.roas.toFixed(2)}x
              </span>
              <span className="flex-shrink-0 text-xs text-zinc-500 font-mono w-16 text-right">
                ${variation.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>

              {/* Chevron */}
              <ChevronDown className={cn(
                'w-4 h-4 text-zinc-500 transition-transform flex-shrink-0',
                isExpanded && 'rotate-180',
              )} />
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3 ml-9">
                    {variation.headline && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Headline</div>
                        <p className="text-sm text-white whitespace-pre-wrap">{variation.headline}</p>
                      </div>
                    )}
                    {variation.body && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Primary Text</div>
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{variation.body}</p>
                      </div>
                    )}
                    <div className="flex gap-6 pt-1">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">ROAS</div>
                        <span className={cn(
                          'text-sm font-mono font-medium',
                          variation.roas >= 2 ? 'text-verdict-scale' :
                          variation.roas >= 1 ? 'text-verdict-watch' :
                          'text-verdict-kill'
                        )}>
                          {variation.roas.toFixed(2)}x
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Spend</div>
                        <span className="text-sm text-zinc-300 font-mono">
                          ${variation.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Revenue</div>
                        <span className="text-sm text-zinc-300 font-mono">
                          ${variation.revenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
