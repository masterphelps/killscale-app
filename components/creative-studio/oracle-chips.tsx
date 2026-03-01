'use client'

import {
  Target, RefreshCw, Sparkles, UserCircle, ImagePlus,
  Image as ImageIcon, Film, Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleOutputType, OracleFormat } from './oracle-box'

export interface ChipDef {
  label: string
  icon: React.ElementType
  group: 'ads' | 'content'
  action:
    | { type: 'focus'; outputType: OracleOutputType; format: OracleFormat; placeholder: string }
    | { type: 'workflow'; workflow: string }
    | { type: 'file'; outputType: OracleOutputType; format: OracleFormat; placeholder: string }
}

const chips: ChipDef[] = [
  // Make Ads
  { label: 'Product \u2192 Ad', icon: Target, group: 'ads', action: { type: 'workflow', workflow: 'create' } },
  { label: 'Product \u2192 Video Ad', icon: Target, group: 'ads', action: { type: 'workflow', workflow: 'url-to-video' } },
  { label: 'Clone Ad', icon: RefreshCw, group: 'ads', action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, group: 'ads', action: { type: 'workflow', workflow: 'inspiration' } },
  { label: 'UGC Video Ad', icon: UserCircle, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'video', placeholder: 'Paste your product URL for a UGC video...' } },
  { label: 'Image \u2192 Ad', icon: ImagePlus, group: 'ads', action: { type: 'file', outputType: 'ad', format: 'image', placeholder: 'Drop an image or paste a URL...' } },
  // Make Content
  { label: 'Generate Image', icon: ImageIcon, group: 'content', action: { type: 'focus', outputType: 'content', format: 'image', placeholder: 'Describe the image you want...' } },
  { label: 'Generate Video', icon: Film, group: 'content', action: { type: 'focus', outputType: 'content', format: 'video', placeholder: 'Describe the video you want...' } },
  { label: 'Image \u2192 Video', icon: Video, group: 'content', action: { type: 'file', outputType: 'content', format: 'video', placeholder: 'Drop an image and describe the animation...' } },
]

interface OracleChipsProps {
  onChipAction: (action: ChipDef['action']) => void
}

export function OracleChips({ onChipAction }: OracleChipsProps) {
  const adChips = chips.filter(c => c.group === 'ads')
  const contentChips = chips.filter(c => c.group === 'content')

  return (
    <div className="space-y-6">
      {/* Make Ads */}
      <div>
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">Make Ads</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {adChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className={cn(
                  'group relative flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  'bg-white/[0.03] border border-white/[0.06]',
                  'text-zinc-300 hover:text-white',
                  'hover:bg-purple-500/[0.08] hover:border-purple-500/20',
                  'hover:shadow-[0_0_20px_rgba(168,85,247,0.08)]',
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 group-hover:bg-purple-500/20 transition-colors">
                  <Icon className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <span className="truncate">{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Make Content */}
      <div>
        <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">Make Content</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {contentChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className={cn(
                  'group relative flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  'bg-white/[0.03] border border-white/[0.06]',
                  'text-zinc-300 hover:text-white',
                  'hover:bg-cyan-500/[0.08] hover:border-cyan-500/20',
                  'hover:shadow-[0_0_20px_rgba(6,182,212,0.08)]',
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                  <Icon className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="truncate">{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
