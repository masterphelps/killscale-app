'use client'

import { cn } from '@/lib/utils'
import { Verdict, getVerdictDisplay } from '@/lib/supabase'

type VerdictBadgeProps = {
  verdict: Verdict
  size?: 'sm' | 'md'
}

export function VerdictBadge({ verdict, size = 'md' }: VerdictBadgeProps) {
  const { label, icon } = getVerdictDisplay(verdict)
  
  return (
    <span className={cn(
      'inline-flex items-center justify-center gap-1 font-semibold uppercase tracking-wide rounded-md border whitespace-nowrap',
      size === 'sm' ? 'text-[10px] px-2 py-0.5 min-w-[60px]' : 'text-xs px-2.5 py-1 min-w-[70px]',
      {
        'bg-verdict-scale-bg text-verdict-scale border-verdict-scale/30': verdict === 'scale',
        'bg-verdict-watch-bg text-verdict-watch border-verdict-watch/30': verdict === 'watch',
        'bg-verdict-kill-bg text-verdict-kill border-verdict-kill/30': verdict === 'kill',
        'bg-verdict-learn-bg text-verdict-learn border-verdict-learn/30': verdict === 'learn',
        'bg-zinc-800/50 text-zinc-500 border-zinc-700/30': verdict === 'off',
      }
    )}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  )
}
