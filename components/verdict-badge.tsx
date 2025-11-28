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
      'inline-flex items-center gap-1 font-semibold uppercase tracking-wide rounded-md border',
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
      {
        'bg-verdict-scale-bg text-verdict-scale border-verdict-scale/30': verdict === 'scale',
        'bg-verdict-watch-bg text-verdict-watch border-verdict-watch/30': verdict === 'watch',
        'bg-verdict-cut-bg text-verdict-cut border-verdict-cut/30': verdict === 'cut',
        'bg-verdict-learn-bg text-verdict-learn border-verdict-learn/30': verdict === 'learn',
      }
    )}>
      {icon} {label}
    </span>
  )
}
