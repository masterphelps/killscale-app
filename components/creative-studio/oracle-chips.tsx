'use client'

import {
  Target, RefreshCw, Sparkles, UserCircle, ImagePlus,
  Image as ImageIcon, Film, Video,
} from 'lucide-react'
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
  { label: 'Product \u2192 Ad', icon: Target, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'image', placeholder: 'Paste your product URL...' } },
  { label: 'Product \u2192 Video Ad', icon: Target, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'video', placeholder: 'Paste your product URL...' } },
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      {/* Make Ads column */}
      <div>
        <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-3">Make Ads</h3>
        <div className="space-y-1.5">
          {adChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all group"
              >
                <Icon className="w-4 h-4 text-purple-400/60 group-hover:text-purple-400 transition-colors" />
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Make Content column */}
      <div>
        <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-3">Make Content</h3>
        <div className="space-y-1.5">
          {contentChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all group"
              >
                <Icon className="w-4 h-4 text-cyan-400/60 group-hover:text-cyan-400 transition-colors" />
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
