'use client'

import { useState } from 'react'
import { AISection } from './ai-section'

interface CaptionsPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
  currentStyle: string
  onStyleChange: (style: string) => void
}

const CAPTION_PRESETS = [
  { id: 'capcut', name: 'Black Block', description: 'White text on dark background', textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.7)', highlightColor: '#facc15' },
  { id: 'bold', name: 'Bold Impact', description: 'Uppercase, high contrast', textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.85)', highlightColor: '#f59e0b' },
  { id: 'clean', name: 'Clean Glass', description: 'Frosted glass effect', textColor: '#ffffff', bgColor: 'rgba(255,255,255,0.1)', highlightColor: '#14b8a6' },
  { id: 'minimal', name: 'Minimal', description: 'No background, keyword highlight', textColor: '#ffffff', bgColor: 'transparent', highlightColor: '#3b82f6' },
  { id: 'wordflash', name: 'Word Flash', description: 'Animated single-word highlight', textColor: '#facc15', bgColor: 'transparent', highlightColor: '#facc15' },
  { id: 'promopunch', name: 'Promo Punch', description: 'Red keyword pop, bold text', textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.6)', highlightColor: '#ef4444' },
]

export function CaptionsPanel({ onAIGenerate, isAIGenerating, currentStyle, onStyleChange }: CaptionsPanelProps) {
  const [activeTab, setActiveTab] = useState<'style' | 'content'>('style')

  return (
    <div className="p-3 space-y-3">
      <div className="flex rounded-lg bg-white/5 p-1">
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'style' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
        >
          Style
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'content' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
        >
          Content
        </button>
      </div>

      <AISection
        onGenerate={(instruction) => onAIGenerate(instruction)}
        isGenerating={isAIGenerating}
        placeholder="Custom caption instructions..."
        quickActions={[
          { label: 'Generate captions from audio', instruction: 'Generate captions from the video audio' },
        ]}
      />

      {activeTab === 'style' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 px-1">Presets</p>
          {CAPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onStyleChange(preset.id)}
              className={`w-full rounded-lg overflow-hidden border transition-colors ${
                currentStyle === preset.id ? 'border-purple-500' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="h-16 flex items-center justify-center" style={{ backgroundColor: '#18181b' }}>
                <span
                  className="text-sm font-semibold px-2 py-1 rounded"
                  style={{
                    color: preset.textColor,
                    backgroundColor: preset.bgColor,
                    textTransform: preset.id === 'bold' ? 'uppercase' : undefined,
                  }}
                >
                  Hey there! This is <span style={{ color: preset.highlightColor, fontWeight: 800 }}>KillScale</span>
                </span>
              </div>
              <div className="px-3 py-2 bg-white/5">
                <p className="text-sm text-white text-left">{preset.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTab === 'content' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 text-center py-8">
            Generate captions first using the AI section above, then edit them here.
          </p>
        </div>
      )}
    </div>
  )
}
