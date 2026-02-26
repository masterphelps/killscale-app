'use client'

import { AISection } from './ai-section'

interface TextPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
  onAddText?: (preset: { label: string; fontSize: number; fontWeight: string }) => void
}

const TEXT_PRESETS = [
  { label: 'Headline', fontSize: 72, fontWeight: 'bold' },
  { label: 'Subheadline', fontSize: 48, fontWeight: 'semibold' },
  { label: 'Body Text', fontSize: 32, fontWeight: 'normal' },
  { label: 'Description', fontSize: 24, fontWeight: 'normal' },
]

export function TextPanel({ onAIGenerate, isAIGenerating, onAddText }: TextPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Add text overlay: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe text you want..."
        quickActions={[
          { label: 'Add hook text', instruction: 'Add a bold hook text overlay in the first 2 seconds' },
        ]}
      />
      <div className="space-y-2.5">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onAddText?.(preset)}
            className="w-full text-center py-3.5 rounded-lg bg-bg-hover hover:bg-bg-card border border-border transition-colors"
            style={{
              fontSize: `${Math.min(preset.fontSize / 4, 20)}px`,
              fontWeight: preset.fontWeight === 'bold' ? 700 : preset.fontWeight === 'semibold' ? 600 : 400,
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
