'use client'

import {
  Target, RefreshCw, Sparkles, UserCircle, ImagePlus,
  Image as ImageIcon, Film,
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

// KS mode chips (8) — full Oracle pipeline
const ksChips: ChipDef[] = [
  { label: 'Product \u2192 Ad', icon: Target, action: { type: 'workflow', workflow: 'create' } },
  { label: 'Product \u2192 Video Ad', icon: Target, action: { type: 'workflow', workflow: 'url-to-video' } },
  { label: 'Clone Ad', icon: RefreshCw, action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, action: { type: 'workflow', workflow: 'inspiration' } },
  { label: 'UGC Video Ad', icon: UserCircle, action: { type: 'workflow', workflow: 'ugc-video' } },
  { label: 'Image \u2192 Ad', icon: ImagePlus, action: { type: 'workflow', workflow: 'upload' } },
  { label: 'Generate Image', icon: ImageIcon, action: { type: 'switch-mode', mode: 'image' } },
  { label: 'Generate Video', icon: Film, action: { type: 'switch-mode', mode: 'video' } },
]

// Image mode chips — filtered subset of KS chips relevant to image workflows
const imageChips: ChipDef[] = [
  { label: 'Product \u2192 Ad', icon: Target, action: { type: 'workflow', workflow: 'create' } },
  { label: 'Clone Ad', icon: RefreshCw, action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, action: { type: 'workflow', workflow: 'inspiration' } },
  { label: 'Image \u2192 Ad', icon: ImagePlus, action: { type: 'workflow', workflow: 'upload' } },
]

// Video mode chips — filtered subset of KS chips relevant to video workflows
const videoChips: ChipDef[] = [
  { label: 'Product \u2192 Video Ad', icon: Target, action: { type: 'workflow', workflow: 'url-to-video' } },
  { label: 'UGC Video Ad', icon: UserCircle, action: { type: 'workflow', workflow: 'ugc-video' } },
]

const chipSets: Record<OracleInputMode, { chips: ChipDef[]; heading: string; accentColor: string }> = {
  ks: { chips: ksChips, heading: 'Quick Start', accentColor: 'purple' },
  image: { chips: imageChips, heading: 'Quick Start', accentColor: 'blue' },
  video: { chips: videoChips, heading: 'Quick Start', accentColor: 'emerald' },
}

interface OracleChipsProps {
  mode: OracleInputMode
  onChipAction: (action: ChipDef['action']) => void
}

export function OracleChips({ mode, onChipAction }: OracleChipsProps) {
  const { chips, heading, accentColor } = chipSets[mode]

  const hoverBg = accentColor === 'purple' ? 'hover:bg-purple-500/[0.08] hover:border-purple-500/20 hover:shadow-[0_0_20px_rgba(168,85,247,0.08)]'
    : accentColor === 'blue' ? 'hover:bg-blue-500/[0.08] hover:border-blue-500/20 hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]'
    : 'hover:bg-emerald-500/[0.08] hover:border-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]'

  const iconBg = accentColor === 'purple' ? 'bg-purple-500/10 group-hover:bg-purple-500/20'
    : accentColor === 'blue' ? 'bg-blue-500/10 group-hover:bg-blue-500/20'
    : 'bg-emerald-500/10 group-hover:bg-emerald-500/20'

  const iconColor = accentColor === 'purple' ? 'text-purple-400'
    : accentColor === 'blue' ? 'text-blue-400'
    : 'text-emerald-400'

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">{heading}</h3>
      <div className="grid grid-cols-2 gap-2">
        {chips.map((chip) => {
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
        })}
      </div>
    </div>
  )
}
