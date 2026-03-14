'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Paperclip, Loader2, X, Upload, Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OracleInputMode } from './oracle-types'

const KS_ROTATING_PROMPTS = [
  'I want to make an ad for a product...',
  'Let\'s make a new video ad...',
  'I need new ad copy for a video in my library...',
  'I have a rough idea for an ad and need to brainstorm...',
  'Help me come up with creative angles for my product...',
  'I want to clone a competitor\'s ad style...',
  'Turn this product page into a scroll-stopping ad...',
  'I need a UGC-style testimonial video...',
  'Generate some fresh ad concepts for my best seller...',
  'Help me refresh a fatigued ad with a new angle...',
]

// Auto-suggest definitions — keyword patterns -> suggestion label + target workflow
const SUGGESTIONS = [
  // Ad creation (KS mode)
  { keywords: ['product', 'ad for', 'make an ad', 'create ad', 'new ad'], label: 'Product → Ad', workflow: 'create' as const, modes: ['ks'] as OracleInputMode[] },
  { keywords: ['video ad', 'product video', 'video from'], label: 'Product → Video Ad', workflow: 'url-to-video' as const, modes: ['ks'] as OracleInputMode[] },
  { keywords: ['clone', 'copy', 'like', 'similar', 'remix', 'competitor'], label: 'Clone a competitor\'s ad', workflow: 'clone' as const, modes: ['ks'] as OracleInputMode[] },
  { keywords: ['inspir', 'browse', 'example', 'gallery', 'idea'], label: 'Browse inspiration gallery', workflow: 'inspiration' as const, modes: ['ks'] as OracleInputMode[] },
  { keywords: ['ugc', 'testimonial', 'talking head', 'influencer', 'creator', 'review'], label: 'UGC Video Ad', workflow: 'ugc-video' as const, modes: ['ks'] as OracleInputMode[] },
  { keywords: ['animate', 'motion', 'bring to life', 'image to video'], label: 'Animate image → video', workflow: 'image-to-video' as const, modes: ['ks'] as OracleInputMode[] },
  // Image mode
  { keywords: ['product shot', 'product photo', 'packshot'], label: 'Product Shot', workflow: 'open-prompt-image' as const, modes: ['image'] as OracleInputMode[] },
  { keywords: ['lifestyle', 'scene', 'setting'], label: 'Lifestyle Scene', workflow: 'open-prompt-image' as const, modes: ['image'] as OracleInputMode[] },
  // Video mode
  { keywords: ['demo', 'showcase', 'product demo'], label: 'Product Demo', workflow: 'text-to-video' as const, modes: ['video'] as OracleInputMode[] },
  { keywords: ['cinematic', 'epic', 'dramatic'], label: 'Cinematic Video', workflow: 'text-to-video' as const, modes: ['video'] as OracleInputMode[] },
]

// Keep deprecated type exports for backwards compat (re-exported from index.ts)
export type OracleOutputType = 'ad' | 'content'
export type OracleFormat = 'image' | 'video'
export type OracleImage = { base64: string; mimeType: string; preview: string }

export interface OracleSubmission {
  text: string
  mode: OracleInputMode
  images: OracleImage[]
  // Deprecated fields kept for transition — derived from mode
  outputType: OracleOutputType
  format: OracleFormat
}

const MAX_IMAGES = 3

interface OracleBoxProps {
  onSubmit: (submission: OracleSubmission) => void
  onDirectWorkflow: (workflow: string) => void
  onOpenLibrary: () => void
  isLoading: boolean
  placeholder?: string
  initialImage?: OracleImage | null
  initialMode?: OracleInputMode
  onModeChange?: (mode: OracleInputMode) => void
  openAttachMenu?: boolean
  onAttachMenuOpened?: () => void
  // Deprecated — kept for session restoration compat
  initialOutputType?: OracleOutputType
  initialFormat?: OracleFormat
}

function modeToLegacy(mode: OracleInputMode): { outputType: OracleOutputType; format: OracleFormat } {
  switch (mode) {
    case 'image': return { outputType: 'content', format: 'image' }
    case 'video': return { outputType: 'content', format: 'video' }
    default: return { outputType: 'ad', format: 'image' }
  }
}

function legacyToMode(outputType?: OracleOutputType, format?: OracleFormat): OracleInputMode | undefined {
  if (!outputType && !format) return undefined
  if (outputType === 'content' && format === 'video') return 'video'
  if (outputType === 'content') return 'image'
  return 'ks'
}

export function OracleBox({ onSubmit, onDirectWorkflow, onOpenLibrary, isLoading, placeholder, initialImage, initialMode, onModeChange, initialOutputType, initialFormat, openAttachMenu: openAttachMenuProp, onAttachMenuOpened }: OracleBoxProps) {
  const resolvedInitialMode = initialMode || legacyToMode(initialOutputType, initialFormat) || 'image'
  const [text, setText] = useState('')
  const [mode, setMode] = useState<OracleInputMode>(resolvedInitialMode)
  const [images, setImages] = useState<OracleImage[]>(initialImage ? [initialImage] : [])
  const [activeSuggestions, setActiveSuggestions] = useState<typeof SUGGESTIONS>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync state when initial props change
  useEffect(() => {
    if (initialImage) setImages(prev => {
      if (prev.some(p => p.preview === initialImage.preview)) return prev
      return prev.length >= MAX_IMAGES ? [prev[0], initialImage] : [...prev, initialImage]
    })
    const newMode = initialMode || legacyToMode(initialOutputType, initialFormat)
    if (newMode) setMode(newMode)
  }, [initialImage, initialMode, initialOutputType, initialFormat])

  // Open attach menu when triggered externally
  useEffect(() => {
    if (openAttachMenuProp) {
      setShowAttachMenu(true)
      onAttachMenuOpened?.()
    }
  }, [openAttachMenuProp, onAttachMenuOpened])

  // Auto-suggest based on keywords, filtered by mode
  useEffect(() => {
    if (!text.trim()) {
      setActiveSuggestions([])
      return
    }
    const lower = text.toLowerCase()
    const matches = SUGGESTIONS.filter(s =>
      s.modes.includes(mode) && s.keywords.some(k => lower.includes(k))
    )
    setActiveSuggestions(matches)
  }, [text, mode])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  const handleModeChange = useCallback((newMode: OracleInputMode) => {
    setMode(newMode)
    onModeChange?.(newMode)
  }, [onModeChange])

  const handleSubmit = useCallback(() => {
    if ((!text.trim() && images.length === 0) || isLoading) return
    const legacy = modeToLegacy(mode)
    onSubmit({ text: text.trim(), mode, images, outputType: legacy.outputType, format: legacy.format })
    setText('')
    setImages([])
  }, [text, mode, images, isLoading, onSubmit])

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
      const newImage: OracleImage = { base64, mimeType: file.type, preview: URL.createObjectURL(file) }
      setImages(prev => prev.length >= MAX_IMAGES ? [...prev.slice(1), newImage] : [...prev, newImage])
    }
    reader.readAsDataURL(file)
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
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

  // Rotating placeholder for KS mode
  const [rotatingIndex, setRotatingIndex] = useState(0)
  const [rotatingVisible, setRotatingVisible] = useState(true)
  const useRotating = mode === 'ks' && !text && !placeholder && images.length === 0
  useEffect(() => {
    if (!useRotating) return
    const cycle = setInterval(() => {
      setRotatingVisible(false)
      setTimeout(() => {
        setRotatingIndex(prev => (prev + 1) % KS_ROTATING_PROMPTS.length)
        setRotatingVisible(true)
      }, 200)
    }, 2000)
    return () => clearInterval(cycle)
  }, [useRotating])

  const defaultPlaceholder = placeholder || (
    mode === 'image' ? 'Describe the image you want to create...' :
    mode === 'video' ? 'Describe the video scene you want...' :
    ''
  )

  return (
    <div data-tour="oracle-box" className="relative w-full">
      {/* Main input container */}
      <div
        className={cn(
          'relative rounded-2xl border transition-all duration-200 shadow-lg shadow-black/20',
          isDragOver
            ? 'border-purple-500/50 bg-purple-500/5'
            : 'border-zinc-600/40 bg-white/[0.05] hover:border-purple-500/20 focus-within:border-purple-500/30',
          isLoading && 'opacity-70 pointer-events-none'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Image previews */}
        {images.length > 0 && (
          <div className="px-4 pt-3 flex items-center gap-2">
            {images.map((img, i) => (
              <div key={img.preview} className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-700/50 shrink-0">
                <img src={img.preview} alt={`Attached ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-black/80 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <span className="text-xs text-zinc-500">
              {images.length === 1 ? '1 image' : `${images.length} images`}
              {images.length < MAX_IMAGES && ' · drop or attach another'}
            </span>
          </div>
        )}

        {/* Textarea with rotating placeholder */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            data-oracle-input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={useRotating ? '' : defaultPlaceholder}
            rows={2}
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-400 px-4 pt-4 pb-2 resize-none focus:outline-none"
          />
          {useRotating && (
            <div
              className="absolute left-4 top-4 text-sm text-zinc-400 pointer-events-none transition-opacity duration-200"
              style={{ opacity: rotatingVisible ? 1 : 0 }}
            >
              {KS_ROTATING_PROMPTS[rotatingIndex]}
            </div>
          )}
        </div>

        {/* Bottom row: attach + mode selector + submit */}
        <div className="flex items-center justify-between px-3 pb-3">
          {/* Left: attach image */}
          <div className="relative flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { e.target.files?.[0] && handleFileSelect(e.target.files[0]); setShowAttachMenu(false) }}
            />
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                images.length >= MAX_IMAGES
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
              )}
              title={images.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
              disabled={images.length >= MAX_IMAGES}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Attach menu dropdown */}
            {showAttachMenu && images.length < MAX_IMAGES && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAttachMenu(false)} />
                <div className="absolute left-0 bottom-full mb-2 bg-bg-card border border-zinc-700/50 rounded-xl overflow-hidden shadow-xl z-20 w-48">
                  <button
                    onClick={() => { fileRef.current?.click() }}
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors flex items-center gap-2.5"
                  >
                    <Upload className="w-4 h-4 text-zinc-500" />
                    Upload Image
                  </button>
                  <button
                    onClick={() => { setShowAttachMenu(false); onOpenLibrary() }}
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/[0.05] transition-colors flex items-center gap-2.5"
                  >
                    <Library className="w-4 h-4 text-zinc-500" />
                    Media Library
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right: three-state mode selector + submit */}
          <div className="flex items-center gap-2">
            {/* Mode selector: KS / Image / Video */}
            <div data-tour="oracle-mode-toggle" className="flex items-center bg-white/[0.06] rounded-lg p-0.5">
              {/* KS mode hidden — re-enable by removing this comment wrapper */}
              {/* <button
                onClick={() => handleModeChange('ks')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  mode === 'ks' ? 'bg-purple-500/25 text-purple-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <span className="mr-1">&#10022;</span>KS
              </button> */}
              <button
                onClick={() => handleModeChange('image')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  mode === 'image' ? 'bg-blue-500/25 text-blue-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Image
              </button>
              <button
                onClick={() => handleModeChange('video')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  mode === 'video' ? 'bg-emerald-500/25 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Video
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={(!text.trim() && images.length === 0) || isLoading}
              className={cn(
                'p-2 rounded-lg transition-all',
                (!text.trim() && images.length === 0) || isLoading
                  ? 'bg-zinc-700/50 text-zinc-500 cursor-not-allowed'
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
              key={s.workflow + s.label}
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
