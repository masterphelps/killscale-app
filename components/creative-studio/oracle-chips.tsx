'use client'

import {
  Target, RefreshCw, Sparkles, UserCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleInputMode } from './oracle-types'

export interface ChipDef {
  label: string
  icon: React.ElementType
  action:
    | { type: 'focus'; mode: OracleInputMode; placeholder: string }
    | { type: 'workflow'; workflow: string }
    | { type: 'attach'; mode: OracleInputMode }
    | { type: 'switch-mode'; mode: OracleInputMode }
}

// KS mode chips (5) — row of 2 + row of 3
const ksChipsRow1: ChipDef[] = [
  { label: 'Create Image Ad', icon: Target, action: { type: 'workflow', workflow: 'create' } },
  { label: 'Create Video Ad', icon: Target, action: { type: 'workflow', workflow: 'url-to-video' } },
]
const ksChipsRow2: ChipDef[] = [
  { label: 'Clone Ad', icon: RefreshCw, action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, action: { type: 'workflow', workflow: 'inspiration' } },
  { label: 'UGC Video Ad', icon: UserCircle, action: { type: 'workflow', workflow: 'ugc-video' } },
]

// Image mode chips — filtered subset
const imageChips: ChipDef[] = [
  { label: 'Create Image Ad', icon: Target, action: { type: 'workflow', workflow: 'create' } },
  { label: 'Clone Ad', icon: RefreshCw, action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, action: { type: 'workflow', workflow: 'inspiration' } },
]

// Video mode chips — filtered subset
const videoChips: ChipDef[] = [
  { label: 'Create Video Ad', icon: Target, action: { type: 'workflow', workflow: 'url-to-video' } },
  { label: 'UGC Video Ad', icon: UserCircle, action: { type: 'workflow', workflow: 'ugc-video' } },
]

const chipSets: Record<OracleInputMode, { rows: ChipDef[][]; heading: string; accentColor: string }> = {
  ks: { rows: [ksChipsRow1, ksChipsRow2], heading: 'Quick Start', accentColor: 'purple' },
  image: { rows: [imageChips], heading: 'Quick Start', accentColor: 'blue' },
  video: { rows: [videoChips], heading: 'Quick Start', accentColor: 'emerald' },
}

interface OracleChipsProps {
  mode: OracleInputMode
  onChipAction: (action: ChipDef['action']) => void
}

export function OracleChips({ mode, onChipAction }: OracleChipsProps) {
  const { rows, heading, accentColor } = chipSets[mode]

  const hoverBg = accentColor === 'purple' ? 'hover:bg-purple-500/[0.08] hover:border-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.08)]'
    : accentColor === 'blue' ? 'hover:bg-blue-500/[0.08] hover:border-blue-500/20 hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]'
    : 'hover:bg-emerald-500/[0.08] hover:border-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]'

  const iconBg = accentColor === 'purple' ? 'bg-purple-500/10 group-hover:bg-purple-500/20'
    : accentColor === 'blue' ? 'bg-blue-500/10 group-hover:bg-blue-500/20'
    : 'bg-emerald-500/10 group-hover:bg-emerald-500/20'

  const iconColor = accentColor === 'purple' ? 'text-purple-400'
    : accentColor === 'blue' ? 'text-blue-400'
    : 'text-emerald-400'

  const renderChip = (chip: ChipDef) => {
    const Icon = chip.icon
    return (
      <button
        key={chip.label}
        onClick={() => onChipAction(chip.action)}
        className={cn(
          'group relative flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
          'bg-white/[0.03] border border-white/[0.06]',
          'text-zinc-300 hover:text-white',
          hoverBg,
        )}
      >
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors', iconBg)}>
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>
        <span className="truncate">{chip.label}</span>
      </button>
    )
  }

  return (
    <div data-tour="oracle-chips">
      <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">{heading}</h3>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className={cn('grid gap-2', row.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {row.map(renderChip)}
          </div>
        ))}
      </div>
    </div>
  )
}
