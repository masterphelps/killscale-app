'use client'

import { cn } from '@/lib/utils'
import type { CopyVariation } from './types'

interface CopyVariationsProps {
  variations: CopyVariation[]
}

export function CopyVariations({ variations }: CopyVariationsProps) {
  // Sort by ROAS descending
  const sortedVariations = [...variations].sort((a, b) => b.roas - a.roas)

  if (sortedVariations.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl p-4">
        <h4 className="text-sm font-medium text-zinc-400 mb-4">Copy Variations</h4>
        <p className="text-sm text-zinc-500 text-center py-4">No copy variations found</p>
      </div>
    )
  }

  return (
    <div className="bg-bg-card rounded-xl p-4">
      <h4 className="text-sm font-medium text-zinc-400 mb-4">
        Copy Variations
        <span className="ml-2 text-xs text-zinc-500">({sortedVariations.length} variants)</span>
      </h4>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Headline
              </th>
              <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Body
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                ROAS
              </th>
              <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Spend
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedVariations.map((variation, index) => (
              <tr
                key={variation.creativeId}
                className={cn(
                  'border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors',
                  index === 0 && 'bg-verdict-scale/5' // Highlight top performer
                )}
              >
                <td className="py-2.5 px-2">
                  <div className="relative group">
                    <span className="text-white truncate block max-w-[180px]">
                      {variation.headline || '(No headline)'}
                    </span>
                    {variation.headline && variation.headline.length > 25 && (
                      <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block bg-bg-dark border border-border rounded-lg p-3 shadow-xl max-w-sm">
                        <p className="text-sm text-white whitespace-pre-wrap">{variation.headline}</p>
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-2">
                  <div className="relative group">
                    <span className="text-zinc-400 truncate block max-w-[200px]">
                      {variation.body || '(No body)'}
                    </span>
                    {variation.body && variation.body.length > 30 && (
                      <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block bg-bg-dark border border-border rounded-lg p-3 shadow-xl max-w-sm">
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{variation.body}</p>
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-2 text-right">
                  <span className={cn(
                    'font-mono font-medium',
                    variation.roas >= 2 ? 'text-verdict-scale' :
                    variation.roas >= 1 ? 'text-verdict-watch' :
                    'text-verdict-kill'
                  )}>
                    {variation.roas.toFixed(2)}x
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right">
                  <span className="text-zinc-300 font-mono">
                    ${variation.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedVariations.length > 0 && sortedVariations[0].roas > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-zinc-500">
            Top performing copy: <span className="text-verdict-scale font-medium">{sortedVariations[0].headline || 'Untitled'}</span>
            {' '}with {sortedVariations[0].roas.toFixed(2)}x ROAS
          </p>
        </div>
      )}
    </div>
  )
}
