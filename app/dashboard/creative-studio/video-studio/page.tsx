'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  Video,
  Upload,
  Link as LinkIcon,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Clock,
  Sparkles,
  ImagePlus,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoStylePicker } from '@/components/creative-studio/video-style-picker'
import { PromptBuilder } from '@/components/creative-studio/prompt-builder'
import { VideoJobCard } from '@/components/creative-studio/video-job-card'
import { generatePromptSections, buildSoraPrompt } from '@/lib/video-prompt-templates'
import type { VideoStyle, PromptSections, VideoJob } from '@/remotion/types'

export default function VideoStudioPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()

  // Step tracking
  const [step, setStep] = useState(1) // 1: Input, 2: Style & Prompt, 3: Generate

  // Step 1: Input
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload')
  const [productImageBase64, setProductImageBase64] = useState<string | null>(null)
  const [productImageMimeType, setProductImageMimeType] = useState<string | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const [productUrl, setProductUrl] = useState('')
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2: Style & Prompt
  const [videoStyle, setVideoStyle] = useState<VideoStyle | null>(null)
  const [promptSections, setPromptSections] = useState<PromptSections>({
    scene: '', subject: '', action: '', product: '', mood: '',
  })
  const [duration, setDuration] = useState<8 | 12>(8)

  // Step 3: Generate
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentJob, setCurrentJob] = useState<VideoJob | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Credit display
  const [credits, setCredits] = useState<{ remaining: number; totalAvailable: number } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.remaining !== undefined) setCredits({ remaining: d.remaining, totalAvailable: d.totalAvailable }) })
      .catch(() => {})
  }, [user?.id])

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setProductImageBase64(base64)
      setProductImageMimeType(file.type)
      setProductImagePreview(result)
    }
    reader.readAsDataURL(file)
  }, [])

  // Handle product URL analysis
  const handleAnalyzeUrl = useCallback(async () => {
    if (!productUrl.trim()) return
    setIsAnalyzing(true)
    try {
      const res = await fetch('/api/creative-studio/analyze-product-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      })
      const data = await res.json()
      if (data.product) {
        setProductName(data.product.name || '')
        setProductDescription(data.product.description || '')
        if (data.imageBase64) {
          setProductImageBase64(data.imageBase64)
          setProductImageMimeType(data.imageMimeType || 'image/jpeg')
          setProductImagePreview(`data:${data.imageMimeType || 'image/jpeg'};base64,${data.imageBase64}`)
        }
      }
    } catch (err) {
      console.error('Failed to analyze URL:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }, [productUrl])

  // When style is selected, auto-generate prompt sections
  useEffect(() => {
    if (videoStyle) {
      const sections = generatePromptSections(videoStyle, productName, productDescription)
      setPromptSections(sections)
    }
  }, [videoStyle, productName, productDescription])

  // Poll for video job status
  const startPolling = useCallback((jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    pollIntervalRef.current = setInterval(async () => {
      if (!user?.id) return
      try {
        const res = await fetch(`/api/creative-studio/video-status?jobId=${jobId}&userId=${user.id}`)
        const data = await res.json()

        setCurrentJob(prev => prev ? { ...prev, ...data, id: prev.id } : prev)

        if (data.status === 'complete' || data.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }, 5000)
  }, [user?.id])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!user?.id || !currentAccountId || !videoStyle) return

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const fullPrompt = buildSoraPrompt(promptSections)

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: fullPrompt,
          videoStyle,
          durationSeconds: duration,
          productImageBase64,
          productImageMimeType,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setGenerateError(data.error || 'Failed to start video generation')
        return
      }

      // Create job object
      const job: VideoJob = {
        id: data.jobId,
        user_id: user.id,
        ad_account_id: currentAccountId,
        prompt: fullPrompt,
        video_style: videoStyle,
        duration_seconds: duration,
        status: data.status || 'generating',
        progress_pct: 0,
        credit_cost: data.creditCost || 50,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setCurrentJob(job)
      setStep(3)
      startPolling(data.jobId)

      // Update credits
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - 50) } : prev)
    } catch (err) {
      setGenerateError('Failed to generate video')
    } finally {
      setIsGenerating(false)
    }
  }, [user?.id, currentAccountId, videoStyle, promptSections, duration, productImageBase64, productImageMimeType, startPolling])

  const canProceedStep1 = productName.trim() || productImageBase64
  const canProceedStep2 = videoStyle && promptSections.action.trim()

  return (
    <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Video className="w-7 h-7 text-purple-400" />
            Video Studio
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Create AI-generated video ads with professional overlays</p>
        </div>
        {credits && (
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
            <Sparkles className="w-3 h-3" />
            {credits.remaining} credits remaining — Video (50 cr)
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { num: 1, label: 'Product Info' },
          { num: 2, label: 'Style & Prompt' },
          { num: 3, label: 'Generate' },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              step >= num ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'
            )}>
              {num}
            </div>
            <span className={cn('text-sm', step >= num ? 'text-white' : 'text-zinc-500')}>{label}</span>
            {num < 3 && <ArrowRight className="w-4 h-4 text-zinc-600 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Product Input */}
      {step === 1 && (
        <div className="max-w-2xl">
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Product Information</h2>

            {/* Input mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('upload')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'upload' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Upload className="w-4 h-4" />
                Upload Image
              </button>
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'url' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <LinkIcon className="w-4 h-4" />
                Product URL
              </button>
            </div>

            {inputMode === 'upload' ? (
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {productImagePreview ? (
                  <div className="relative w-48 h-48 rounded-lg overflow-hidden border border-border">
                    <img src={productImagePreview} alt="Product" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setProductImageBase64(null); setProductImagePreview(null); setProductImageMimeType(null) }}
                      className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white text-xs hover:bg-black/70"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-48 h-48 rounded-lg border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:border-purple-500/50 hover:text-purple-400 transition-colors"
                  >
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs">Upload product image</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder="https://yourstore.com/product"
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!productUrl.trim() || isAnalyzing}
                    className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 text-sm font-medium hover:bg-purple-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Analyze
                  </button>
                </div>
              </div>
            )}

            {/* Product details */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1 block">Product Name</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g., Premium Beard Oil"
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1 block">Brief Description</label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="e.g., All-natural beard oil with jojoba and argan, tames flyaways and promotes growth"
                  rows={2}
                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="mt-6 flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Style & Prompt */}
      {step === 2 && (
        <div className="max-w-3xl">
          <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to product info
          </button>

          <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Choose Video Style</h2>
            <VideoStylePicker selected={videoStyle} onSelect={setVideoStyle} />
          </div>

          {videoStyle && (
            <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Refine Your Prompt</h2>
              <p className="text-sm text-zinc-400 mb-4">
                We generated a prompt based on your product and style. Edit each section to customize the video.
              </p>
              <PromptBuilder sections={promptSections} onChange={setPromptSections} />
            </div>
          )}

          {videoStyle && (
            <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Duration</h2>
              <div className="flex gap-3">
                {([8, 12] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      duration === d
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-border hover:border-zinc-600'
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    {d} seconds
                  </button>
                ))}
              </div>
            </div>
          )}

          {generateError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {generateError}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canProceedStep2 || isGenerating || (credits !== null && credits.remaining < 50)}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting generation...
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                Generate Video (50 credits)
              </>
            )}
          </button>
        </div>
      )}

      {/* Step 3: Generation Progress / Result */}
      {step === 3 && currentJob && (
        <div className="max-w-lg">
          <button onClick={() => { setStep(2); setCurrentJob(null) }} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Generate another
          </button>

          <VideoJobCard
            job={currentJob}
            onEdit={(id) => {
              // Navigate to video editor
              window.location.href = `/dashboard/creative-studio/video-editor?jobId=${id}`
            }}
          />

          {(currentJob.status === 'generating' || currentJob.status === 'queued') && (
            <div className="mt-4 p-4 bg-bg-card border border-border rounded-xl">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>This will appear in <strong className="text-white">AI Tasks</strong> when ready — you can leave this page.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
