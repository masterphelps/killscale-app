'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Paperclip, Loader2, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Auto-suggest definitions — keyword patterns -> suggestion label + target workflow
const SUGGESTIONS = [
  { keywords: ['clone', 'copy', 'like', 'similar', 'remix', 'competitor'], label: 'Clone a competitor\'s ad', workflow: 'clone' as const },
  { keywords: ['ugc', 'testimonial', 'talking head', 'influencer', 'creator', 'review'], label: 'Create a UGC video ad', workflow: 'ugc-video' as const },
  { keywords: ['inspir', 'browse', 'example', 'gallery', 'idea'], label: 'Browse inspiration gallery', workflow: 'inspiration' as const },
  { keywords: ['animate', 'motion', 'bring to life'], label: 'Animate an image into video', workflow: 'image-to-video' as const },
]

export type OracleOutputType = 'ad' | 'content'
export type OracleFormat = 'image' | 'video'

export interface OracleSubmission {
  text: string
  outputType: OracleOutputType
  format: OracleFormat
  image?: { base64: string; mimeType: string; preview: string } | null
}

interface OracleBoxProps {
  onSubmit: (submission: OracleSubmission) => void
  onDirectWorkflow: (workflow: string) => void
  isLoading: boolean
  placeholder?: string
}

export function OracleBox({ onSubmit, onDirectWorkflow, isLoading, placeholder }: OracleBoxProps) {
  const [text, setText] = useState('')
  const [outputType, setOutputType] = useState<OracleOutputType>('ad')
  const [format, setFormat] = useState<OracleFormat>('image')
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [activeSuggestions, setActiveSuggestions] = useState<typeof SUGGESTIONS>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-suggest based on keywords
  useEffect(() => {
    if (!text.trim()) {
      setActiveSuggestions([])
      return
    }
    const lower = text.toLowerCase()
    const matches = SUGGESTIONS.filter(s => s.keywords.some(k => lower.includes(k)))
    setActiveSuggestions(matches)
  }, [text])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  const handleSubmit = useCallback(() => {
    if ((!text.trim() && !image) || isLoading) return
    onSubmit({ text: text.trim(), outputType, format, image })
  }, [text, outputType, format, image, isLoading, onSubmit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setImage({ base64, mimeType: file.type, preview: URL.createObjectURL(file) })
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleSuggestionClick = (suggestion: typeof SUGGESTIONS[0]) => {
    onDirectWorkflow(suggestion.workflow)
    setActiveSuggestions([])
  }

  const defaultPlaceholder = placeholder || 'Describe what you want to create, paste a product URL, or drop an image...'

  return (
    <div className="relative w-full">
      {/* Main input container */}
      <div
        className={cn(
          'relative rounded-2xl border transition-all duration-200',
          isDragOver
            ? 'border-purple-500/50 bg-purple-500/5'
            : 'border-zinc-700/50 bg-white/[0.03] hover:border-zinc-600/50',
          isLoading && 'opacity-70 pointer-events-none'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Image preview */}
        {image && (
          <div className="px-4 pt-3 flex items-center gap-2">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-700/50">
              <img src={image.preview} alt="Attached" className="w-full h-full object-cover" />
              <button
                onClick={() => setImage(null)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <span className="text-xs text-zinc-500">Image attached</span>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-oracle-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={defaultPlaceholder}
          rows={1}
          className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 px-4 pt-4 pb-2 resize-none focus:outline-none"
        />

        {/* Bottom row: attach + toggles + submit */}
        <div className="flex items-center justify-between px-3 pb-3">
          {/* Left: attach image */}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors"
              title="Attach image"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* Right: toggles + submit */}
          <div className="flex items-center gap-2">
            {/* Output type toggle */}
            <div className="flex items-center bg-white/[0.05] rounded-lg p-0.5">
              <button
                onClick={() => setOutputType('ad')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  outputType === 'ad' ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Ad
              </button>
              <button
                onClick={() => setOutputType('content')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  outputType === 'content' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Content
              </button>
            </div>

            {/* Format toggle */}
            <div className="flex items-center bg-white/[0.05] rounded-lg p-0.5">
              <button
                onClick={() => setFormat('image')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  format === 'image' ? 'bg-blue-500/20 text-blue-300' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Image
              </button>
              <button
                onClick={() => setFormat('video')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  format === 'video' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                Video
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={(!text.trim() && !image) || isLoading}
              className={cn(
                'p-2 rounded-lg transition-all',
                (!text.trim() && !image) || isLoading
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Loading shimmer overlay */}
        {isLoading && (
          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent animate-shimmer" />
          </div>
        )}
      </div>

      {/* Auto-suggest dropdown */}
      {activeSuggestions.length > 0 && !isLoading && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-bg-card border border-zinc-700/50 rounded-xl overflow-hidden shadow-xl z-20">
          {activeSuggestions.map((s) => (
            <button
              key={s.workflow}
              onClick={() => handleSuggestionClick(s)}
              className="w-full px-4 py-3 text-left text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors flex items-center gap-3"
            >
              <span className="text-purple-400">&#8594;</span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
