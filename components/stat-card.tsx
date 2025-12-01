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
    <div className="bg-bg-card border border-border rounded-xl p-3 lg:p-5">
      <div className="text-xs lg:text-sm text-zinc-400 mb-1 lg:mb-2 flex items-center gap-1 lg:gap-2">
        {icon && <span className="text-sm lg:text-base">{icon}</span>}
        {label}
      </div>
      <div className="text-xl lg:text-3xl font-bold font-mono truncate">{value}</div>
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
