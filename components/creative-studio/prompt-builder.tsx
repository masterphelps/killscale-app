'use client'

import type { PromptSections } from '@/remotion/types'

interface PromptBuilderProps {
  sections: PromptSections
  onChange: (sections: PromptSections) => void
}

const SECTION_CONFIG = [
  { key: 'scene' as const, label: 'Scene', placeholder: 'Describe the setting and environment...', icon: '🏠' },
  { key: 'subject' as const, label: 'Subject', placeholder: 'Describe the person or subject (leave empty for product-only)...', icon: '👤' },
  { key: 'action' as const, label: 'Action', placeholder: 'What happens in the video...', icon: '🎬' },
  { key: 'product' as const, label: 'Product', placeholder: 'How the product appears and is featured...', icon: '📦' },
  { key: 'mood' as const, label: 'Mood', placeholder: 'Lighting, color tone, energy level...', icon: '🎨' },
]

export function PromptBuilder({ sections, onChange }: PromptBuilderProps) {
  const updateSection = (key: keyof PromptSections, value: string) => {
    onChange({ ...sections, [key]: value })
  }

  return (
    <div className="space-y-3">
      {SECTION_CONFIG.map(({ key, label, placeholder, icon }) => (
        <div key={key}>
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-1.5">
            <span>{icon}</span>
            {label}
          </label>
          <textarea
            value={sections[key]}
            onChange={(e) => updateSection(key, e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>
      ))}
    </div>
  )
}
