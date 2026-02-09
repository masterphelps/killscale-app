'use client'

import { VIDEO_STYLES, type VideoStyle } from '@/remotion/types'

interface VideoStylePickerProps {
  selected: VideoStyle | null
  onSelect: (style: VideoStyle) => void
}

export function VideoStylePicker({ selected, onSelect }: VideoStylePickerProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {VIDEO_STYLES.map((style) => (
        <button
          key={style.id}
          onClick={() => onSelect(style.id)}
          className={`relative p-4 rounded-xl border text-left transition-all ${
            selected === style.id
              ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
              : 'border-border bg-bg-card hover:bg-bg-hover hover:border-zinc-600'
          }`}
        >
          <div className="text-2xl mb-2">{style.icon}</div>
          <div className="text-sm font-medium text-white">{style.label}</div>
          <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{style.description}</div>
          {selected === style.id && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
      ))}
    </div>
  )
}
