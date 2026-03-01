'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Paperclip, Loader2, X, Upload, Library } from 'lucide-react'
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
export type OracleImage = { base64: string; mimeType: string; preview: string }

export interface OracleSubmission {
  text: string
  outputType: OracleOutputType
  format: OracleFormat
  images: OracleImage[]
}

const MAX_IMAGES = 2

interface OracleBoxProps {
  onSubmit: (submission: OracleSubmission) => void
  onDirectWorkflow: (workflow: string) => void
  onOpenLibrary: () => void
  isLoading: boolean
  placeholder?: string
  initialImage?: OracleImage | null
  initialOutputType?: OracleOutputType
  initialFormat?: OracleFormat
  openAttachMenu?: boolean
  onAttachMenuOpened?: () => void
}

export function OracleBox({ onSubmit, onDirectWorkflow, onOpenLibrary, isLoading, placeholder, initialImage, initialOutputType, initialFormat, openAttachMenu: openAttachMenuProp, onAttachMenuOpened }: OracleBoxProps) {
  const [text, setText] = useState('')
  const [outputType, setOutputType] = useState<OracleOutputType>(initialOutputType || 'ad')
  const [format, setFormat] = useState<OracleFormat>(initialFormat || 'image')
  const [images, setImages] = useState<OracleImage[]>(initialImage ? [initialImage] : [])
  const [activeSuggestions, setActiveSuggestions] = useState<typeof SUGGESTIONS>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Sync state when initial props change (e.g. returning from open-prompt with image)
  useEffect(() => {
    if (initialImage) setImages(prev => {
      // Don't duplicate if already there
      if (prev.some(p => p.preview === initialImage.preview)) return prev
      return prev.length >= MAX_IMAGES ? [prev[0], initialImage] : [...prev, initialImage]
    })
    if (initialOutputType) setOutputType(initialOutputType)
    if (initialFormat) setFormat(initialFormat)
  }, [initialImage, initialOutputType, initialFormat])

  // Open attach menu when triggered externally (e.g. "Image → Ad" chip)
  useEffect(() => {
    if (openAttachMenuProp) {
      setShowAttachMenu(true)
      onAttachMenuOpened?.()
    }
  }, [openAttachMenuProp, onAttachMenuOpened])

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
    if ((!text.trim() && images.length === 0) || isLoading) return
    onSubmit({ text: text.trim(), outputType, format, images })
    setText('')
    setImages([])
  }, [text, outputType, format, images, isLoading, onSubmit])

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

  const defaultPlaceholder = placeholder || 'Describe what you want to create, paste a product URL, or drop an image...'

  return (
    <div className="relative w-full">
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-oracle-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={defaultPlaceholder}
          rows={2}
          className="w-full bg-transparent text-sm text-white placeholder:text-zinc-400 px-4 pt-4 pb-2 resize-none focus:outline-none"
        />

        {/* Bottom row: attach + toggles + submit */}
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

          {/* Right: toggles + submit */}
          <div className="flex items-center gap-2">
            {/* Output type toggle */}
            <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5">
              <button
                onClick={() => setOutputType('ad')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  outputType === 'ad' ? 'bg-purple-500/25 text-purple-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Ad
              </button>
              <button
                onClick={() => setOutputType('content')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  outputType === 'content' ? 'bg-cyan-500/25 text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Content
              </button>
            </div>

            {/* Format toggle */}
            <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5">
              <button
                onClick={() => setFormat('image')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  format === 'image' ? 'bg-blue-500/25 text-blue-300' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                Image
              </button>
              <button
                onClick={() => setFormat('video')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  format === 'video' ? 'bg-emerald-500/25 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
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
