'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string
  change?: { value: number; isPositive: boolean }
  icon?: string
}

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="text-sm text-zinc-400 mb-2 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="text-3xl font-bold font-mono">{value}</div>
      {change && (
        <div className={cn(
          'text-xs mt-2 flex items-center gap-1',
          change.isPositive ? 'text-verdict-scale' : 'text-verdict-cut'
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
  )
}
