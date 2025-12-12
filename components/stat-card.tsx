'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string
  subValue?: string  // Secondary value shown below the main value (e.g., "CPR" for Results)
  change?: { value: number; isPositive: boolean }
  icon?: string
  variant?: 'default' | 'highlight'
  color?: 'default' | 'green' | 'blue' | 'purple' | 'amber' | 'rose'
}

const colorStyles = {
  default: {
    border: 'border-zinc-700/60',
    shadow: 'shadow-lg shadow-black/20',
    gradient: '',
    hoverBorder: 'hover:border-zinc-500'
  },
  green: {
    border: 'border-verdict-scale/30',
    shadow: 'shadow-lg shadow-verdict-scale/10',
    gradient: 'before:absolute before:inset-0 before:bg-gradient-to-br before:from-verdict-scale/10 before:to-transparent before:pointer-events-none',
    hoverBorder: 'hover:border-verdict-scale/50'
  },
  blue: {
    border: 'border-blue-500/30',
    shadow: 'shadow-lg shadow-blue-500/10',
    gradient: 'before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-500/10 before:to-transparent before:pointer-events-none',
    hoverBorder: 'hover:border-blue-500/50'
  },
  purple: {
    border: 'border-purple-500/30',
    shadow: 'shadow-lg shadow-purple-500/10',
    gradient: 'before:absolute before:inset-0 before:bg-gradient-to-br before:from-purple-500/10 before:to-transparent before:pointer-events-none',
    hoverBorder: 'hover:border-purple-500/50'
  },
  amber: {
    border: 'border-amber-500/30',
    shadow: 'shadow-lg shadow-amber-500/10',
    gradient: 'before:absolute before:inset-0 before:bg-gradient-to-br before:from-amber-500/10 before:to-transparent before:pointer-events-none',
    hoverBorder: 'hover:border-amber-500/50'
  },
  rose: {
    border: 'border-rose-500/30',
    shadow: 'shadow-lg shadow-rose-500/10',
    gradient: 'before:absolute before:inset-0 before:bg-gradient-to-br before:from-rose-500/10 before:to-transparent before:pointer-events-none',
    hoverBorder: 'hover:border-rose-500/50'
  }
}

export function StatCard({ label, value, subValue, change, icon, variant = 'default', color = 'default' }: StatCardProps) {
  const styles = colorStyles[color]

  return (
    <div className={cn(
      'relative overflow-hidden rounded-xl p-3 lg:p-5 transition-all duration-300',
      'bg-gradient-to-br from-zinc-800/80 to-zinc-900/90',
      styles.border,
      styles.shadow,
      styles.gradient,
      styles.hoverBorder,
      'hover:shadow-xl',
      variant === 'highlight' && 'border-accent/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]'
    )}>
      <div className="relative">
        <div className="flex items-center gap-1.5 lg:gap-2 mb-1 lg:mb-2">
          {icon && (
            <span className="text-base lg:text-lg drop-shadow-sm">{icon}</span>
          )}
          <span className="text-xs lg:text-sm text-zinc-400 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-xl lg:text-3xl font-bold font-mono text-white">{value}</div>
        {subValue && (
          <div className="text-xs lg:text-sm text-zinc-400 mt-0.5">{subValue}</div>
        )}
        {change && (
          <div className={cn(
            'text-xs mt-2 flex items-center gap-1',
            change.isPositive ? 'text-verdict-scale' : 'text-verdict-kill'
          )}>
            {change.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {change.value.toFixed(1)}% vs last period
          </div>
        )}
      </div>
    </div>
  )
}
