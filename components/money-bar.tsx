'use client'

import { useMemo } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

type MoneyBarProps = {
  losingBudget: number      // Budget on ads with ROAS < 1.0
  neutralBudget: number     // Budget on ads with 1.0 <= ROAS < scale_roas
  profitableBudget: number  // Budget on ads with ROAS >= scale_roas
  totalDailyBudget: number
}

export function MoneyBar({
  losingBudget,
  neutralBudget,
  profitableBudget,
  totalDailyBudget
}: MoneyBarProps) {
  const percentages = useMemo(() => {
    if (totalDailyBudget === 0) {
      return { losing: 0, neutral: 100, profitable: 0 }
    }

    const losing = Math.round((losingBudget / totalDailyBudget) * 100)
    const profitable = Math.round((profitableBudget / totalDailyBudget) * 100)
    const neutral = 100 - losing - profitable

    return { losing, neutral: Math.max(0, neutral), profitable }
  }, [losingBudget, neutralBudget, profitableBudget, totalDailyBudget])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Determine the primary message based on what's most significant
  const getMessage = () => {
    if (percentages.losing >= 20) {
      return `${percentages.losing}% of your budget is on ads losing money`
    } else if (percentages.losing >= 10) {
      return `${percentages.losing}% of your budget could be reallocated`
    } else if (percentages.profitable >= 50) {
      return `${percentages.profitable}% of your budget is highly profitable`
    } else if (percentages.losing === 0 && percentages.profitable === 0) {
      return `Your budget is currently breaking even`
    } else if (percentages.losing === 0) {
      return `No budget is being lost — ${percentages.profitable}% is profitable`
    } else {
      return `${percentages.neutral}% of your budget is performing at target`
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">
          Your <span className="text-white font-semibold font-mono">{formatCurrency(totalDailyBudget)}/day</span> budget
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between mb-4">
        {/* Losing */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-verdict-kill/20 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-verdict-kill" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide">Losing</div>
            <div className="text-lg font-bold font-mono text-verdict-kill">
              {formatCurrency(losingBudget)}
            </div>
          </div>
        </div>

        {/* Neutral */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center">
            <Minus className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide">Breaking Even</div>
            <div className="text-lg font-bold font-mono text-zinc-300">
              {formatCurrency(neutralBudget)}
            </div>
          </div>
        </div>

        {/* Profitable */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-verdict-scale/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-verdict-scale" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wide">Profitable</div>
            <div className="text-lg font-bold font-mono text-verdict-scale">
              {formatCurrency(profitableBudget)}
            </div>
          </div>
        </div>
      </div>

      {/* The Bar */}
      <div className="relative h-8 rounded-full overflow-hidden bg-bg-dark flex">
        {/* Losing (Red) */}
        {percentages.losing > 0 && (
          <div
            className="h-full bg-gradient-to-r from-verdict-kill to-verdict-kill/80 transition-all duration-700 ease-out flex items-center justify-center"
            style={{ width: `${percentages.losing}%` }}
          >
            {percentages.losing >= 8 && (
              <span className="text-xs font-semibold text-white/90">{percentages.losing}%</span>
            )}
          </div>
        )}

        {/* Neutral (Gray) */}
        {percentages.neutral > 0 && (
          <div
            className="h-full bg-gradient-to-r from-zinc-600 to-zinc-700 transition-all duration-700 ease-out flex items-center justify-center"
            style={{ width: `${percentages.neutral}%` }}
          >
            {percentages.neutral >= 12 && (
              <span className="text-xs font-semibold text-white/70">{percentages.neutral}%</span>
            )}
          </div>
        )}

        {/* Profitable (Green) */}
        {percentages.profitable > 0 && (
          <div
            className="h-full bg-gradient-to-r from-verdict-scale/80 to-verdict-scale transition-all duration-700 ease-out flex items-center justify-center"
            style={{ width: `${percentages.profitable}%` }}
          >
            {percentages.profitable >= 8 && (
              <span className="text-xs font-semibold text-white/90">{percentages.profitable}%</span>
            )}
          </div>
        )}
      </div>

      {/* Message */}
      <div className="mt-3 text-sm text-zinc-400 text-center">
        {getMessage()}
      </div>
    </div>
  )
}
