'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Upload, ImagePlus, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  Clapperboard, RefreshCw, Plus, Minus, Download, Pencil, X, Play,
  FolderOpen, Clipboard
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ScenePlan } from '@/lib/video-prompt-templates'
import type { VideoJob } from '@/remotion/types'

// ── Constants ─────────────────────────────────────────────────────────────────
const VEO_EXTENSION_STEP = 7

const QUALITY_COSTS = {
  standard: { base: 20, extension: 30 },
  premium: { base: 50, extension: 75 },
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ImageToVideoProps {
  userId: string
  adAccountId: string
  credits: { remaining: number; totalAvailable: number } | null
  onCreditsChanged: () => void
  onBack: () => void
  onOpenMediaLibrary: () => void
  onImageFromLibrary?: { base64: string; mimeType: string; preview: string } | null
}

export default function ImageToVideo({
  userId,
  adAccountId,
  credits,
  onCreditsChanged,
  onBack,
  onOpenMediaLibrary,
  onImageFromLibrary,
}: ImageToVideoProps) {
  // ── Image + Prompt state ──────────────────────────────────────────────────
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [prompt, setPrompt] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Scene Plan state ──────────────────────────────────────────────────────
  const [planningScene, setPlanningScene] = useState(false)
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  // ── Director's Review editable fields ─────────────────────────────────────
  const [editScene, setEditScene] = useState('')
  const [editMood, setEditMood] = useState('')
  const [editVideoPrompt, setEditVideoPrompt] = useState('')
  const [editExtensionPrompts, setEditExtensionPrompts] = useState<string[]>([])
  const [editHook, setEditHook] = useState('')
  const [editCta, setEditCta] = useState('')
  const [editDialogue, setEditDialogue] = useState('')
  const [quality, setQuality] = useState<'standard' | 'premium'>('standard')
  const [overlaysEnabled, setOverlaysEnabled] = useState(true)
  const [showVeoPrompt, setShowVeoPrompt] = useState(true)
  const [showExtensions, setShowExtensions] = useState(false)

  // ── Generation state ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null)
  const [canvasId, setCanvasId] = useState<string | null>(null)

  // ── Accept image from parent (media library) ─────────────────────────────
  useEffect(() => {
    if (onImageFromLibrary) {
      setImage(onImageFromLibrary)
    }
  }, [onImageFromLibrary])

  // ── Populate edit fields when scenePlan arrives ───────────────────────────
  useEffect(() => {
    if (scenePlan) {
      setEditScene(scenePlan.scene || '')
      setEditMood(scenePlan.mood || '')
      setEditVideoPrompt(scenePlan.videoPrompt || '')
      setEditExtensionPrompts(scenePlan.extensionPrompts || [])
      setEditHook(scenePlan.overlay?.hook || '')
      setEditCta(scenePlan.overlay?.cta || 'Shop Now')
      setEditDialogue(scenePlan.dialogue || '')
      setShowExtensions(!!(scenePlan.extensionPrompts?.length))
    }
  }, [scenePlan])

  // ── File handling helpers ─────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setImage({
        base64,
        mimeType: file.type,
        preview: result,
      })
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) processFile(file)
        break
      }
    }
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  // ── Plan Scene ────────────────────────────────────────────────────────────
  const handlePlanScene = useCallback(async () => {
    if (!prompt.trim() || !image) return
    setPlanningScene(true)
    setPlanError(null)
    setScenePlan(null)

    try {
      const res = await fetch('/api/creative-studio/plan-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), hasSourceImage: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPlanError(data.error || 'Failed to plan scene')
        return
      }
      setScenePlan(data)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to plan scene')
    } finally {
      setPlanningScene(false)
    }
  }, [prompt, image])

  // ── Credit cost calculation ───────────────────────────────────────────────
  const costs = QUALITY_COSTS[quality]
  const extensionCount = editExtensionPrompts.length
  const creditCost = costs.base + extensionCount * costs.extension
  const estimatedDuration = 8 + extensionCount * VEO_EXTENSION_STEP
  const canAfford = credits ? credits.remaining >= creditCost : true

  // ── Generate Video ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!image || !userId || !adAccountId) return

    setGenerating(true)
    setGenerateError(null)

    try {
      const isExtended = extensionCount > 0
      const apiProvider = isExtended ? 'veo-ext' : 'veo'
      const duration = 8 + extensionCount * VEO_EXTENSION_STEP

      // Create canvas if first generation
      let currentCanvasId = canvasId
      if (!currentCanvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            adAccountId,
            productUrl: null,
            productKnowledge: { name: 'Image to Video' },
            concepts: [{
              title: 'Image to Video',
              angle: 'Custom',
              logline: prompt.slice(0, 80),
              visualMetaphor: `AI-directed animation - ${editScene}`,
              whyItWorks: 'Custom directed video brings your image to life.',
              videoPrompt: editVideoPrompt,
              overlay: {
                hook: editHook,
                captions: [],
                cta: editCta,
              },
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          currentCanvasId = canvasData.canvas.id
          setCanvasId(currentCanvasId)
        }
      }

      // Build overlay config if enabled
      const overlayConfig = overlaysEnabled ? {
        hook: editHook ? {
          line1: editHook,
          startSec: 0,
          endSec: 2,
          animation: 'pop' as const,
        } : undefined,
        cta: editCta ? {
          buttonText: editCta,
          startSec: Math.max(duration - 3, 0),
          animation: 'pop' as const,
        } : undefined,
        style: 'clean' as const,
      } : undefined

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          adAccountId,
          prompt: editVideoPrompt,
          dialogue: editDialogue || null,
          videoStyle: 'image-to-video',
          durationSeconds: duration,
          productName: 'Image to Video',
          provider: apiProvider,
          quality,
          canvasId: currentCanvasId || null,
          adIndex: 0,
          targetDurationSeconds: isExtended ? duration : undefined,
          extensionPrompts: isExtended ? editExtensionPrompts : undefined,
          overlayConfig,
          productImageBase64: image.base64,
          productImageMimeType: image.mimeType,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate video')
      }

      // Set initial job state from response
      setVideoJob({
        id: data.jobId,
        user_id: userId,
        ad_account_id: adAccountId,
        prompt: editVideoPrompt,
        video_style: 'image-to-video',
        duration_seconds: duration,
        status: 'queued',
        progress_pct: 0,
        credit_cost: creditCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      onCreditsChanged()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate video')
    } finally {
      setGenerating(false)
    }
  }, [image, userId, adAccountId, prompt, editScene, editVideoPrompt, editDialogue, editExtensionPrompts, editHook, editCta, overlaysEnabled, quality, canvasId, extensionCount, creditCost, onCreditsChanged])

  // ── Video polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoJob || videoJob.status === 'complete' || videoJob.status === 'failed') return

    const poll = async () => {
      try {
        const res = await fetch(`/api/creative-studio/video-status?jobId=${videoJob.id}&userId=${userId}`)
        const data = await res.json()
        if (data.status) {
          setVideoJob(prev => prev ? {
            ...prev,
            status: data.status,
            progress_pct: data.progress_pct ?? prev.progress_pct,
            final_video_url: data.final_video_url ?? prev.final_video_url,
            raw_video_url: data.raw_video_url ?? prev.raw_video_url,
            thumbnail_url: data.thumbnail_url ?? prev.thumbnail_url,
            error_message: data.error_message ?? prev.error_message,
            overlay_config: data.overlay_config ?? prev.overlay_config,
          } : prev)
        }
      } catch {
        // Silently retry on next interval
      }
    }

    poll() // Immediate first poll
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [videoJob?.id, videoJob?.status, userId])

  // ── Reset all state ───────────────────────────────────────────────────────
  const resetAll = () => {
    setImage(null)
    setPrompt('')
    setScenePlan(null)
    setPlanError(null)
    setEditScene('')
    setEditMood('')
    setEditVideoPrompt('')
    setEditExtensionPrompts([])
    setEditHook('')
    setEditCta('')
    setEditDialogue('')
    setQuality('standard')
    setOverlaysEnabled(true)
    setGenerating(false)
    setGenerateError(null)
    setVideoJob(null)
    setCanvasId(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24" onPaste={handlePaste}>
      <div className="px-4 lg:px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">
                Image to Video
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 rounded">
                VEO 3.1
              </span>
            </div>
            <p className="text-zinc-500 mt-1 ml-7">
              Upload an image and describe what should happen
            </p>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Phase 3: Video Result */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {videoJob && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              {(videoJob.status === 'queued' || videoJob.status === 'generating' || videoJob.status === 'extending' || videoJob.status === 'rendering') && (
                <div className="flex flex-col items-center py-12 text-center">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    </div>
                    {videoJob.progress_pct > 0 && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums">
                        {Math.round(videoJob.progress_pct)}%
                      </div>
                    )}
                  </div>
                  <p className="text-white font-medium">Generating your video...</p>
                  <p className="text-zinc-500 text-sm mt-1">
                    {videoJob.status === 'extending' ? 'Extending video...' : 'This usually takes 2-5 minutes'}
                  </p>

                  {/* Small image preview */}
                  {image && (
                    <div className="mt-6 w-24 h-24 rounded-lg overflow-hidden border border-zinc-700/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.preview} alt="Source" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              {videoJob.status === 'complete' && videoJob.final_video_url && (
                <div className="space-y-4">
                  <div className="aspect-[9/16] max-h-[60vh] mx-auto rounded-xl overflow-hidden bg-black">
                    <video
                      src={videoJob.final_video_url}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={videoJob.final_video_url}
                      download={`image-to-video-${videoJob.id}.mp4`}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-500 text-black font-medium hover:bg-emerald-400 transition-colors text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                    <Link
                      href={`/dashboard/creative-studio/video-editor?jobId=${videoJob.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-colors text-sm"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit in Video Editor
                    </Link>
                  </div>

                  <button
                    onClick={resetAll}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    New Video
                  </button>
                </div>
              )}

              {videoJob.status === 'failed' && (
                <div className="flex flex-col items-center py-12 text-center">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                  <p className="text-white font-medium mb-1">Generation Failed</p>
                  <p className="text-zinc-500 text-sm mb-6">
                    {videoJob.error_message || 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setVideoJob(null)
                        setGenerateError(null)
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors text-sm"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={resetAll}
                      className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors text-sm"
                    >
                      Start Over
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Phase 2: Director's Review */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {scenePlan && !videoJob && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              {/* Image preview thumbnail */}
              {image && (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-700/50 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.preview} alt="Source" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Reference Image</p>
                    <p className="text-xs text-zinc-500">First frame of your video</p>
                  </div>
                </div>
              )}

              {/* Director's Review amber panel */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                  <Clapperboard className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-300">Director&apos;s Review</span>
                  <span className="ml-auto text-xs text-amber-400/60">Edit before generating</span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Scene */}
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Scene</label>
                    <input
                      type="text"
                      value={editScene}
                      onChange={(e) => setEditScene(e.target.value)}
                      className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Mood */}
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Mood</label>
                    <input
                      type="text"
                      value={editMood}
                      onChange={(e) => setEditMood(e.target.value)}
                      className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  {/* Quality Selector */}
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-2 block">Quality</label>
                    <div className="flex gap-2">
                      {(['standard', 'premium'] as const).map(q => {
                        const isActive = quality === q
                        const qCosts = QUALITY_COSTS[q]
                        const totalCost = qCosts.base + extensionCount * qCosts.extension
                        return (
                          <button
                            key={q}
                            onClick={() => setQuality(q)}
                            className={cn(
                              'flex-1 px-3 py-2 rounded-lg border transition-all text-left',
                              isActive
                                ? 'bg-indigo-500/10 border-indigo-500/40'
                                : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn('text-xs font-medium', isActive ? 'text-indigo-300' : 'text-zinc-400')}>
                                {q === 'standard' ? 'Standard' : 'Premium'}
                              </span>
                              <span className="text-[10px] text-zinc-500">{q === 'standard' ? '720p' : '1080p'}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-0.5">{totalCost} credits</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Veo Prompt (first 8s) */}
                  <details className="group" open={showVeoPrompt}>
                    <summary
                      className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      onClick={(e) => { e.preventDefault(); setShowVeoPrompt(!showVeoPrompt) }}
                    >
                      <ChevronRight className={cn('w-3 h-3 transition-transform', showVeoPrompt && 'rotate-90')} />
                      Veo Prompt (first 8s)
                    </summary>
                    {showVeoPrompt && (
                      <textarea
                        value={editVideoPrompt}
                        onChange={(e) => setEditVideoPrompt(e.target.value)}
                        className="w-full mt-2 bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                        rows={8}
                      />
                    )}
                  </details>

                  {/* Extension Prompts */}
                  <details className="group" open={showExtensions}>
                    <summary
                      className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      onClick={(e) => { e.preventDefault(); setShowExtensions(!showExtensions) }}
                    >
                      <ChevronRight className={cn('w-3 h-3 transition-transform', showExtensions && 'rotate-90')} />
                      Extension Prompts ({extensionCount})
                    </summary>
                    {showExtensions && (
                      <div className="mt-2 space-y-2">
                        {editExtensionPrompts.map((ep, idx) => (
                          <div key={idx}>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs text-zinc-500">Segment {idx + 2} ({8 + (idx + 1) * 7 - 6}s - {8 + (idx + 1) * 7}s)</label>
                              <button
                                onClick={() => {
                                  const updated = editExtensionPrompts.filter((_, i) => i !== idx)
                                  setEditExtensionPrompts(updated)
                                }}
                                className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                            <textarea
                              value={ep}
                              onChange={(e) => {
                                const updated = [...editExtensionPrompts]
                                updated[idx] = e.target.value
                                setEditExtensionPrompts(updated)
                              }}
                              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                              rows={4}
                            />
                          </div>
                        ))}
                        {extensionCount < 3 && (
                          <button
                            onClick={() => {
                              setEditExtensionPrompts([...editExtensionPrompts, 'Continue from previous shot. '])
                              setShowExtensions(true)
                            }}
                            className="flex items-center gap-1.5 text-xs text-amber-400/70 hover:text-amber-300 transition-colors py-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add extension (+7s)
                          </button>
                        )}
                      </div>
                    )}
                  </details>

                  {/* Dialogue (optional) */}
                  {editDialogue ? (
                    <div>
                      <label className="text-xs font-medium text-zinc-400 mb-1 block">Dialogue <span className="text-zinc-600 font-normal">(spoken in video)</span></label>
                      <textarea
                        value={editDialogue}
                        onChange={(e) => setEditDialogue(e.target.value)}
                        className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-y"
                        rows={2}
                        placeholder="e.g. This changed everything for my skin"
                      />
                      <button
                        onClick={() => setEditDialogue('')}
                        className="text-xs text-zinc-600 hover:text-zinc-400 mt-1 transition-colors"
                      >
                        Remove dialogue
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditDialogue('...')}
                      className="text-xs text-amber-400/60 hover:text-amber-300 transition-colors"
                    >
                      + Add dialogue
                    </button>
                  )}

                  {/* Overlays toggle */}
                  <div className="flex items-center justify-between py-2 border-t border-amber-500/10">
                    <span className="text-xs font-medium text-amber-300/80">Text Overlays</span>
                    <button
                      onClick={() => setOverlaysEnabled(!overlaysEnabled)}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors',
                        overlaysEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                      )}
                    >
                      <div className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        overlaysEnabled ? 'left-[18px]' : 'left-0.5'
                      )} />
                    </button>
                  </div>

                  {/* Hook + CTA (shown when overlays enabled) */}
                  {overlaysEnabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">Hook Text <span className="text-zinc-600 font-normal">(first 2s)</span></label>
                        <input
                          type="text"
                          value={editHook}
                          onChange={(e) => setEditHook(e.target.value)}
                          className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                          placeholder="e.g. See the Difference"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">CTA Button</label>
                        <input
                          type="text"
                          value={editCta}
                          onChange={(e) => setEditCta(e.target.value)}
                          className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                          placeholder="e.g. Shop Now"
                        />
                      </div>
                    </div>
                  )}

                  {/* Budget line */}
                  <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-white tabular-nums">{estimatedDuration}s video</p>
                      <p className="text-xs text-zinc-500">
                        Veo 3.1 {quality === 'premium' ? 'Standard' : 'Fast'} {' '}
                        {extensionCount === 0 ? 'Single clip' : `8s base + ${extensionCount} extension${extensionCount > 1 ? 's' : ''}`}
                        {' · '}{quality === 'premium' ? '1080p' : '720p'}
                      </p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className={cn('text-sm font-bold tabular-nums', canAfford ? 'text-amber-400' : 'text-red-400')}>
                        {creditCost} credits
                      </p>
                      {credits && (
                        <p className="text-xs text-zinc-500">{credits.remaining} remaining</p>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  {generateError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {generateError}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleGenerate}
                      disabled={generating || !canAfford}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating {estimatedDuration}s video...
                        </>
                      ) : (
                        <>
                          <Clapperboard className="w-4 h-4" />
                          Action! ({creditCost} credits)
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => { setScenePlan(null); handlePlanScene() }}
                      disabled={planningScene || generating}
                      className="px-4 py-3 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      title="Rewrite script"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Phase 1: Image + Prompt Input */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {!scenePlan && !planningScene && !videoJob && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-6">
              {/* Image Upload Area */}
              {!image ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
                    isDragging
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : 'border-zinc-700/50 hover:border-zinc-600 bg-zinc-800/20'
                  )}
                >
                  <Upload className={cn('w-10 h-10 mb-3', isDragging ? 'text-emerald-400' : 'text-zinc-500')} />
                  <p className="text-sm font-medium text-white mb-1">
                    Drop an image here or click to browse
                  </p>
                  <p className="text-xs text-zinc-500 mb-4">
                    PNG, JPG, or WebP
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenMediaLibrary()
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Media Library
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative aspect-square max-h-[300px] mx-auto rounded-xl overflow-hidden border border-zinc-700/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.preview}
                      alt="Selected image"
                      className="w-full h-full object-contain bg-zinc-900"
                    />
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      Replace
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenMediaLibrary()
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Library
                    </button>
                    <button
                      onClick={() => setImage(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700/50 text-xs text-red-400 hover:bg-zinc-700 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}

              {/* Prompt Textarea */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">
                  Describe what should happen
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. The product spins slowly as golden light cascades across it, then the camera pulls back to reveal a modern kitchen setting..."
                  className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-y"
                  rows={3}
                />
              </div>

              {/* Error */}
              {planError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {planError}
                </div>
              )}

              {/* Write Script button */}
              <button
                onClick={handlePlanScene}
                disabled={!image || !prompt.trim() || planningScene}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-500 text-black font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Pencil className="w-4 h-4" />
                Write Script · 0 credits
              </button>
            </div>
          )}

          {/* Planning Scene loading state */}
          {planningScene && !videoJob && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex flex-col items-center py-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-4" />
                <p className="text-white font-medium">Writing your script...</p>
                <p className="text-zinc-500 text-sm mt-1">AI is planning the scene segments</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
