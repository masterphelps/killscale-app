'use client'

import { cn } from '@/lib/utils'
import { Verdict } from '@/lib/supabase'

type VerdictBadgeProps = {
  verdict: Verdict
  size?: 'sm' | 'md'
}

export function VerdictBadge({ verdict, size = 'md' }: VerdictBadgeProps) {
  const labels: Record<Verdict, string> = {
    scale: 'SCALE',
    watch: 'WATCH',
    kill: 'KILL',
    learn: 'LEARN',
  }

  return (
    <span className={cn(
      'inline-flex items-center justify-center font-bold uppercase tracking-wide rounded-lg border whitespace-nowrap text-center',
      size === 'sm' ? 'text-[10px] px-2.5 py-1 min-w-[60px]' : 'text-xs px-3 py-1.5 min-w-[70px]',
      {
        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': verdict === 'scale',
        'bg-amber-500/10 text-amber-400 border-amber-500/20': verdict === 'watch',
        'bg-red-500/10 text-red-400 border-red-500/20': verdict === 'kill',
        'bg-zinc-500/10 text-zinc-400 border-zinc-500/20': verdict === 'learn',
      }
    )}>
      {labels[verdict]}
    </span>
  )
}
