'use client'

import { cn } from '@/lib/utils'
import { Verdict, getVerdictDisplay, getStatusLabel } from '@/lib/supabase'
import { Pause } from 'lucide-react'

type VerdictBadgeProps = {
  verdict: Verdict
  status?: string | null
  size?: 'sm' | 'md'
}

export function VerdictBadge({ verdict, status, size = 'md' }: VerdictBadgeProps) {
  const { label, icon } = getVerdictDisplay(verdict)
  const statusLabel = getStatusLabel(status)
  const isPaused = statusLabel !== null
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'inline-flex items-center justify-center gap-1 font-semibold uppercase tracking-wide rounded-md border whitespace-nowrap',
        size === 'sm' ? 'text-[10px] px-2 py-0.5 min-w-[60px]' : 'text-xs px-2.5 py-1 min-w-[70px]',
        isPaused ? 'opacity-50' : '',
        {
          'bg-verdict-scale-bg text-verdict-scale border-verdict-scale/30': verdict === 'scale',
          'bg-verdict-watch-bg text-verdict-watch border-verdict-watch/30': verdict === 'watch',
          'bg-verdict-kill-bg text-verdict-kill border-verdict-kill/30': verdict === 'kill',
          'bg-verdict-learn-bg text-verdict-learn border-verdict-learn/30': verdict === 'learn',
        }
      )}>
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      {isPaused && (
        <span className={cn(
          'inline-flex items-center gap-0.5 text-zinc-500 bg-zinc-800/50 border border-zinc-700/50 rounded-md',
          size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
        )}>
          <Pause className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
          <span>{statusLabel}</span>
        </span>
      )}
    </div>
  )
}
