'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

interface QuickAction {
  label: string
  instruction: string
}

interface AISectionProps {
  quickActions?: QuickAction[]
  placeholder?: string
  onGenerate: (instruction: string) => Promise<void>
  isGenerating: boolean
}

export function AISection({ quickActions, placeholder = 'Describe what you want...', onGenerate, isGenerating }: AISectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [prompt, setPrompt] = useState('')

  const handleGenerate = async (instruction: string) => {
    if (!instruction.trim() || isGenerating) return
    await onGenerate(instruction)
    setPrompt('')
  }

  return (
    <div className="border-b border-white/10 pb-3 mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-white/5 rounded-lg transition-colors"
      >
        <Sparkles className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-400">AI</span>
        {isExpanded ? <ChevronUp className="w-3 h-3 ml-auto text-zinc-500" /> : <ChevronDown className="w-3 h-3 ml-auto text-zinc-500" />}
      </button>

      {isExpanded && (
        <div className="px-3 pt-2 space-y-2">
          {quickActions?.map((action) => (
            <button
              key={action.label}
              onClick={() => handleGenerate(action.instruction)}
              disabled={isGenerating}
              className="w-full text-left text-sm px-3 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 transition-colors disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin inline mr-2" /> : <Sparkles className="w-3 h-3 inline mr-2" />}
              {action.label}
            </button>
          ))}
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate(prompt)}
              placeholder={placeholder}
              disabled={isGenerating}
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
            />
            <button
              onClick={() => handleGenerate(prompt)}
              disabled={!prompt.trim() || isGenerating}
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
