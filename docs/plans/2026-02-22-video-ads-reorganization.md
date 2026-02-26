# Video Ads Reorganization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 7 scattered video creation entry points into 4 clean modes organized by primary input (URL, Text, Image, UGC), all on the Ad Studio page.

**Architecture:** Each new video mode is a self-contained component file (`components/creative-studio/url-to-video.tsx`, `image-to-video.tsx`) to prevent the ad-studio page (~6600 LOC) from becoming unmaintainable. Modes receive shared state (user, accountId, credits) as props and manage their own internal state. Text-to-Video and UGC reuse existing inline code with minimal rewiring.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Supabase, Google Veo 3.1 (video gen), OpenAI GPT 5.2 (script planning)

**Design Doc:** `docs/plans/2026-02-22-video-ads-reorganization-design.md`

---

## Phase 1: Landing Page + Easy Modes (Text-to-Video, UGC)

### Task 1: Add "Video Ads" section to landing page

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx` (landing page section, ~line 3198-3281)

**Step 1: Add new mode type values**

In the `mode` state type union (near line 175), add new mode values:

```typescript
// Existing modes:
// 'create' | 'clone' | 'inspiration' | 'upload' | 'product-video' | 'ugc-video' | 'open-prompt'
// Add:
// | 'text-to-video' | 'image-to-video' | 'url-to-video'
```

Find the `useState` for `mode` and add the three new values to its type.

**Step 2: Add Video Ads section JSX**

Insert a new section between the Guided Image Ads section and the existing Guided Video Ads section. Find the `{/* Guided Video Ads */}` comment (around line 3198) and add ABOVE it:

```tsx
{/* ── Video Ads ─────────────────────────────── */}
<div className="space-y-4">
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2">
      <Video className="w-5 h-5 text-green-400" />
      <h2 className="text-lg font-semibold text-white">Video Ads</h2>
    </div>
    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 rounded-full">New</span>
  </div>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {/* URL to Video */}
    <button
      onClick={() => setMode('url-to-video')}
      className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
        <Link2 className="w-5 h-5 text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">URL to Video</p>
        <p className="text-xs text-zinc-500 mt-0.5">Product URL → AI concepts or your own vision</p>
      </div>
    </button>

    {/* Text to Video */}
    <button
      onClick={() => {
        setMode('open-prompt')
        setOpenPromptMediaType('video')
      }}
      className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
        <Type className="w-5 h-5 text-purple-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">Text to Video</p>
        <p className="text-xs text-zinc-500 mt-0.5">Describe any scene → AI directs & generates</p>
      </div>
    </button>

    {/* Image to Video */}
    <button
      onClick={() => setMode('image-to-video')}
      className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
        <ImagePlus className="w-5 h-5 text-emerald-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">Image to Video</p>
        <p className="text-xs text-zinc-500 mt-0.5">Upload or pick image → animate with AI</p>
      </div>
    </button>

    {/* UGC Video */}
    <button
      onClick={() => setMode('ugc-video')}
      className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
        <UserCircle className="w-5 h-5 text-amber-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">UGC Video</p>
        <p className="text-xs text-zinc-500 mt-0.5">AI presenter delivers your product testimonial</p>
      </div>
    </button>
  </div>
</div>
```

**Step 3: Mark old Guided Video Ads as legacy**

Find the Guided Video Ads section header. Add `(Legacy)` to the title and reduce visual prominence:

```tsx
<h2 className="text-lg font-semibold text-zinc-500">Guided Video Ads (Legacy)</h2>
```

Add a small note below the header:
```tsx
<p className="text-xs text-zinc-600">These modes are being replaced by Video Ads above</p>
```

**Step 4: Ensure needed Lucide icons are imported**

Check imports at top of file. Add if missing: `Link2`, `Type`, `ImagePlus`, `UserCircle`.

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean build (Text-to-Video wires to existing open-prompt mode, UGC wires to existing ugc-video mode, URL-to-Video and Image-to-Video are new modes that won't render anything yet since no `if (mode === 'url-to-video')` block exists — clicking them will just show a blank step-2 page).

**Step 6: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: add Video Ads section with 4 mode cards on landing page"
```

---

### Task 2: Add reset logic for new modes

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Update resetToModeSelection**

Find `resetToModeSelection` function. It already resets existing mode state. No new state to reset yet (URL-to-Video and Image-to-Video will manage their own state in separate components). Just ensure the mode resets:

The function already calls `setMode(null)` which handles this.

**Step 2: Add placeholder render blocks for new modes**

Find the section where modes render (look for `if (mode === 'product-video')` pattern). Add placeholder blocks:

```tsx
{/* URL to Video */}
{mode === 'url-to-video' && (
  <div className="flex flex-col items-center py-16 text-center">
    <Link2 className="w-12 h-12 text-blue-400 mb-4" />
    <p className="text-white font-medium">URL to Video</p>
    <p className="text-zinc-500 text-sm mt-1">Coming soon — enter a product URL to generate video concepts</p>
    <button onClick={resetToModeSelection} className="mt-6 text-sm text-blue-400 hover:text-blue-300">
      ← Back
    </button>
  </div>
)}

{/* Image to Video */}
{mode === 'image-to-video' && (
  <div className="flex flex-col items-center py-16 text-center">
    <ImagePlus className="w-12 h-12 text-emerald-400 mb-4" />
    <p className="text-white font-medium">Image to Video</p>
    <p className="text-zinc-500 text-sm mt-1">Coming soon — upload an image to animate with AI</p>
    <button onClick={resetToModeSelection} className="mt-6 text-sm text-emerald-400 hover:text-emerald-300">
      ← Back
    </button>
  </div>
)}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. Clicking URL-to-Video and Image-to-Video cards now shows placeholder pages with back buttons.

**Step 4: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: add placeholder render blocks for url-to-video and image-to-video modes"
```

---

## Phase 2: Image-to-Video Mode

### Task 3: Create Image-to-Video component — image input step

**Files:**
- Create: `components/creative-studio/image-to-video.tsx`
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx` (replace placeholder)

**Step 1: Create component file**

Create `components/creative-studio/image-to-video.tsx` with the image upload step:

```tsx
'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ImagePlus, Upload, Library, Loader2, ArrowLeft, Trash2, Clapperboard, ChevronDown, ChevronUp, Plus, Minus, RefreshCw, Sparkles, Eye, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScenePlan } from '@/lib/video-prompt-templates'
import type { VideoJob } from '@/remotion/types'

// Re-export for ad-studio to use
export interface ImageToVideoProps {
  userId: string
  adAccountId: string
  credits: { remaining: number; totalAvailable: number } | null
  onCreditsChanged: () => void
  onBack: () => void
}

export default function ImageToVideo({ userId, adAccountId, credits, onCreditsChanged, onBack }: ImageToVideoProps) {
  // ── Image Input State ──────────────────────────────────────────────
  const [image, setImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [prompt, setPrompt] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Scene Planning State ───────────────────────────────────────────
  const [planningScene, setPlanningScene] = useState(false)
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)

  // ── Director's Review Editable State ───────────────────────────────
  const [editScene, setEditScene] = useState('')
  const [editMood, setEditMood] = useState('')
  const [editVideoPrompt, setEditVideoPrompt] = useState('')
  const [editExtensionPrompts, setEditExtensionPrompts] = useState<string[]>([])
  const [editHook, setEditHook] = useState('')
  const [editCta, setEditCta] = useState('')
  const [editDialogue, setEditDialogue] = useState('')
  const [quality, setQuality] = useState<'standard' | 'premium'>('standard')
  const [overlaysEnabled, setOverlaysEnabled] = useState(true)
  const [showVeoPrompt, setShowVeoPrompt] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)

  // ── Video Generation State ─────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null)
  const [canvasId, setCanvasId] = useState<string | null>(null)

  // ── Populate editable fields when scene plan arrives ────────────────
  useEffect(() => {
    if (!scenePlan) return
    setEditScene(scenePlan.scene || '')
    setEditMood(scenePlan.mood || '')
    setEditVideoPrompt(scenePlan.videoPrompt || '')
    setEditExtensionPrompts(scenePlan.extensionPrompts || [])
    setEditHook(scenePlan.overlay?.hook || '')
    setEditCta(scenePlan.overlay?.cta || 'Shop Now')
    setEditDialogue(scenePlan.dialogue || '')
  }, [scenePlan])

  // ── Image Upload Handlers ──────────────────────────────────────────
  const handleFileUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) {
      setPlanError('Image must be under 10MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      setImage({ base64, mimeType: file.type, preview: URL.createObjectURL(file) })
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) handleFileUpload(file)
        break
      }
    }
  }, [handleFileUpload])

  // ── Credit Cost ────────────────────────────────────────────────────
  const creditCost = useMemo(() => {
    if (!scenePlan) return 0
    const dur = scenePlan.estimatedDuration || 8
    const extensions = dur > 8 ? Math.round((dur - 8) / 7) : 0
    const costs = quality === 'standard' ? { base: 20, ext: 30 } : { base: 50, ext: 75 }
    return costs.base + extensions * costs.ext
  }, [scenePlan, quality])

  // ── Scene Planner Call ─────────────────────────────────────────────
  const handlePlanScene = useCallback(async () => {
    if (!image || !prompt.trim()) return
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
      if (!res.ok) throw new Error(data.error || 'Failed to plan scene')
      setScenePlan(data)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Scene planning failed')
    } finally {
      setPlanningScene(false)
    }
  }, [image, prompt])

  // ── Video Generation ───────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!scenePlan || !image || !userId || !adAccountId) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const dur = editExtensionPrompts.length > 0 ? 8 + editExtensionPrompts.length * 7 : 8
      const isExtended = dur > 8
      const provider = isExtended ? 'veo-ext' : 'veo'

      // Create canvas for AI Tasks
      let cId = canvasId
      if (!cId) {
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
              angle: 'Image to Video',
              logline: prompt.slice(0, 80),
              visualMetaphor: `AI-directed — ${editScene}`,
              whyItWorks: 'Direct image-to-video generation with AI scene planning',
              videoPrompt: editVideoPrompt,
              overlay: overlaysEnabled ? { hook: editHook, captions: [], cta: editCta } : { hook: '', captions: [], cta: '' },
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          cId = canvasData.canvas.id
          setCanvasId(cId)
        }
      }

      // Build overlay config
      const baseDuration = isExtended ? 8 : dur
      const overlayConfig = overlaysEnabled ? {
        style: 'clean' as const,
        hook: { line1: editHook, startSec: 0, endSec: 2, animation: 'fade' as const, fontSize: 48, fontWeight: 700, position: 'top' as const },
        cta: { buttonText: editCta, startSec: Math.max(baseDuration - 2, baseDuration * 0.8), animation: 'slide' as const, fontSize: 28 },
      } : undefined

      // Generate video
      const videoBody: Record<string, unknown> = {
        userId,
        adAccountId,
        prompt: editVideoPrompt,
        dialogue: editDialogue || undefined,
        videoStyle: 'image-to-video',
        durationSeconds: dur,
        productName: 'Image to Video',
        provider,
        quality,
        canvasId: cId || null,
        adIndex: 0,
        targetDurationSeconds: isExtended ? dur : undefined,
        extensionPrompts: isExtended ? editExtensionPrompts : undefined,
        overlayConfig,
        productImageBase64: image.base64,
        productImageMimeType: image.mimeType,
      }

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoBody),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate video')

      setVideoJob({ id: data.jobId || data.id, status: 'queued' } as VideoJob)
      onCreditsChanged()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [scenePlan, image, userId, adAccountId, editVideoPrompt, editExtensionPrompts, editDialogue, editHook, editCta, quality, overlaysEnabled, canvasId, prompt, editScene, onCreditsChanged])

  // ── Duration from edit state ───────────────────────────────────────
  const duration = editExtensionPrompts.length > 0 ? 8 + editExtensionPrompts.length * 7 : (scenePlan?.estimatedDuration || 8)

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" onPaste={handlePaste}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </button>
        <div className="flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">Image to Video</h2>
        </div>
      </div>

      {/* ── Step 1: Image + Prompt Input ────────────────────────────── */}
      {!scenePlan && !planningScene && !videoJob && (
        <div className="space-y-4">
          {/* Image upload area */}
          {!image ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer',
                isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 hover:border-zinc-600'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-zinc-500" />
              <p className="text-sm text-zinc-400">Drag & drop an image, paste from clipboard, or click to upload</p>
              <div className="flex gap-2 mt-2">
                <span className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 border border-zinc-700">Upload File</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setMediaLibraryOpen(true) }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 border border-zinc-700 hover:border-emerald-500/40 flex items-center gap-1.5"
                >
                  <Library className="w-3.5 h-3.5" /> Media Library
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
              <img src={image.preview} alt="Selected" className="w-full max-h-64 object-contain bg-black" />
              <button
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-2 left-2 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  Replace
                </button>
                <button
                  onClick={() => setMediaLibraryOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-black/60 text-xs text-white hover:bg-black/80 flex items-center gap-1"
                >
                  <Library className="w-3 h-3" /> Library
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
              />
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Describe what should happen</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Product rotating slowly on marble surface, camera orbiting with soft light..."
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
              rows={3}
            />
          </div>

          {/* Error */}
          {planError && (
            <p className="text-sm text-red-400">{planError}</p>
          )}

          {/* Write Script button */}
          <button
            onClick={handlePlanScene}
            disabled={!image || !prompt.trim()}
            className={cn(
              'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
              image && prompt.trim()
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            <Sparkles className="w-4 h-4" />
            Write Script · 0 credits
          </button>
        </div>
      )}

      {/* ── Planning Spinner ────────────────────────────────────────── */}
      {planningScene && (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-white font-medium">Planning your scene...</p>
          <p className="text-zinc-500 text-sm">AI is analyzing duration and segmenting prompts</p>
        </div>
      )}

      {/* ── Director's Review ───────────────────────────────────────── */}
      {scenePlan && !videoJob && !planningScene && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <Clapperboard className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Director&apos;s Review</span>
            <span className="ml-auto text-xs text-amber-400/60">Edit before generating</span>
          </div>

          <div className="p-4 space-y-4">
            {/* Image preview (small) */}
            {image && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <img src={image.preview} alt="" className="w-16 h-16 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate">Reference Image</p>
                  <p className="text-xs text-zinc-600">Will be sent to Veo as visual reference</p>
                </div>
              </div>
            )}

            {/* Scene */}
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1 block flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Scene
              </label>
              <input
                value={editScene}
                onChange={(e) => setEditScene(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Mood */}
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1 block">Mood</label>
              <input
                value={editMood}
                onChange={(e) => setEditMood(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Quality selector */}
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-2 block">Quality</label>
              <div className="flex gap-2">
                {(['standard', 'premium'] as const).map((q) => (
                  <button key={q} onClick={() => setQuality(q)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      quality === q
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200'
                    )}>
                    {q === 'standard' ? 'Standard (720p)' : 'Premium (1080p)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Veo Prompt (collapsible) */}
            <div>
              <button
                onClick={() => setShowVeoPrompt(!showVeoPrompt)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
              >
                {showVeoPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Veo Prompt (first 8s)
              </button>
              {showVeoPrompt && (
                <textarea
                  value={editVideoPrompt}
                  onChange={(e) => setEditVideoPrompt(e.target.value)}
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-xs font-mono focus:outline-none focus:border-amber-500/50 resize-none"
                  rows={6}
                />
              )}
            </div>

            {/* Extension Prompts (collapsible) */}
            {editExtensionPrompts.length > 0 && (
              <div>
                <button
                  onClick={() => setShowExtensions(!showExtensions)}
                  className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                >
                  {showExtensions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  Extension Prompts ({editExtensionPrompts.length})
                </button>
                {showExtensions && (
                  <div className="space-y-2 mt-2">
                    {editExtensionPrompts.map((ext, i) => (
                      <div key={i} className="flex gap-2">
                        <textarea
                          value={ext}
                          onChange={(e) => {
                            const updated = [...editExtensionPrompts]
                            updated[i] = e.target.value
                            setEditExtensionPrompts(updated)
                          }}
                          className="flex-1 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-xs font-mono focus:outline-none focus:border-amber-500/50 resize-none"
                          rows={3}
                        />
                        <button
                          onClick={() => setEditExtensionPrompts(editExtensionPrompts.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add/remove extension */}
            {editExtensionPrompts.length < 3 && (
              <button
                onClick={() => setEditExtensionPrompts([...editExtensionPrompts, 'Continue from previous shot. '])}
                className="text-xs text-amber-400/60 hover:text-amber-400 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add extension (+7s)
              </button>
            )}

            {/* Dialogue (optional) */}
            {editDialogue && (
              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Dialogue</label>
                <textarea
                  value={editDialogue}
                  onChange={(e) => setEditDialogue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-sm focus:outline-none focus:border-amber-500/50 resize-none"
                  rows={2}
                />
              </div>
            )}

            {/* Overlays toggle */}
            <div className="flex items-center justify-between pt-1 border-t border-amber-500/10">
              <div>
                <p className="text-xs font-medium text-amber-300/80">Text Overlays</p>
                <p className="text-xs text-zinc-600">Hook text + CTA baked into video</p>
              </div>
              <button
                onClick={() => setOverlaysEnabled(!overlaysEnabled)}
                className={cn('w-10 h-5 rounded-full transition-colors relative',
                  overlaysEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                )}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  overlaysEnabled ? 'left-5' : 'left-0.5'
                )} />
              </button>
            </div>

            {/* Hook + CTA inputs (when overlays enabled) */}
            {overlaysEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1 block">Hook (0-2s)</label>
                  <input
                    value={editHook}
                    onChange={(e) => setEditHook(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="Watch This"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1 block">CTA</label>
                  <input
                    value={editCta}
                    onChange={(e) => setEditCta(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700/30 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="Shop Now"
                  />
                </div>
              </div>
            )}

            {/* Budget line */}
            <div className="flex items-center justify-between pt-3 border-t border-amber-500/10">
              <div className="text-xs text-zinc-500">
                Veo 3.1 {quality === 'standard' ? 'Fast' : 'Standard'} · {duration}s · {creditCost} credits
              </div>
              {credits && (
                <div className="text-xs text-zinc-600">
                  {credits.remaining} credits remaining
                </div>
              )}
            </div>

            {/* Error */}
            {generateError && (
              <p className="text-sm text-red-400">{generateError}</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating || !credits || credits.remaining < creditCost}
                className={cn(
                  'flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                  generating || !credits || credits.remaining < creditCost
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                )}
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                ) : (
                  <>🎬 Action! · {creditCost} credits</>
                )}
              </button>
              <button
                onClick={() => { setScenePlan(null); setPlanError(null) }}
                className="p-3 rounded-xl border border-zinc-700 hover:border-amber-500/30 text-zinc-400 hover:text-amber-400 transition-all"
                title="Rewrite script"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Video Result (polling card) ─────────────────────────────── */}
      {videoJob && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6 text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <p className="text-white font-medium">Generating your video...</p>
          <p className="text-zinc-500 text-sm mt-1">This usually takes 1-3 minutes</p>
          {/* TODO: Wire up video polling from parent or shared hook */}
        </div>
      )}

      {/* Media Library Modal — lazy import to avoid circular deps */}
      {/* Rendered by parent ad-studio page, triggered via callback */}
    </div>
  )
}
```

**Step 2: Wire component into ad-studio**

In `ad-studio/page.tsx`, add the import near the top:
```typescript
import ImageToVideo from '@/components/creative-studio/image-to-video'
```

Replace the `image-to-video` placeholder block with:
```tsx
{mode === 'image-to-video' && (
  <ImageToVideo
    userId={user?.id || ''}
    adAccountId={currentAccountId || ''}
    credits={aiUsage ? { remaining: aiUsage.remaining, totalAvailable: aiUsage.totalAvailable } : null}
    onCreditsChanged={() => { refreshCredits(); notifyCreditsChanged() }}
    onBack={resetToModeSelection}
  />
)}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. Image-to-Video card → shows upload area + prompt → Write Script → Director's Review → Generate.

**Step 4: Manual test**

1. Click Image to Video card
2. Upload an image (or drag & drop)
3. Type a prompt
4. Click "Write Script" → should call plan-scene API → Director's Review appears
5. Edit fields → click "Action!" → should generate video

**Step 5: Commit**

```bash
git add components/creative-studio/image-to-video.tsx app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: add Image-to-Video mode with upload + scene planner + Director's Review"
```

---

### Task 4: Add Media Library integration to Image-to-Video

**Files:**
- Modify: `components/creative-studio/image-to-video.tsx`
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Add Media Library modal rendering**

The Media Library modal needs `userId` and `adAccountId` which the component already has. However, the `MediaLibraryModal` component may have complex imports. To keep things clean, have the parent ad-studio page render the modal and pass a callback.

Add to `ImageToVideoProps`:
```typescript
onOpenMediaLibrary: () => void
```

In the Image-to-Video component, replace the `setMediaLibraryOpen(true)` calls with `onOpenMediaLibrary()`.

In ad-studio page, add state and handler:
```typescript
const [i2vMediaLibraryOpen, setI2vMediaLibraryOpen] = useState(false)
```

Pass to component:
```tsx
<ImageToVideo
  ...
  onOpenMediaLibrary={() => setI2vMediaLibraryOpen(true)}
/>
```

Render the modal (reuse existing `MediaLibraryModal` import — it's likely already imported for other modes):
```tsx
{i2vMediaLibraryOpen && (
  <MediaLibraryModal
    isOpen={i2vMediaLibraryOpen}
    onClose={() => setI2vMediaLibraryOpen(false)}
    userId={user?.id || ''}
    adAccountId={currentAccountId || ''}
    selectedItems={[]}
    maxSelection={1}
    allowedTypes={['image']}
    onSelectionChange={(items) => {
      // Convert MediaItem to base64 for Image-to-Video
      // The media library items have URLs, not base64
      // Need to fetch the image and convert
      if (items[0]) {
        // TODO: Wire selected media library item to Image-to-Video state
      }
      setI2vMediaLibraryOpen(false)
    }}
  />
)}
```

**Note:** The Media Library returns items with URLs, not base64. The Image-to-Video component needs base64 for the generate-video API. The simplest approach: add an `onImageSelected` callback prop to ImageToVideo that the parent calls when a media library item is selected, passing the image URL. The component then fetches and converts to base64. Alternatively, the generate-video API can accept a URL directly for Veo. Check existing patterns for how the Product Video mode handles this.

**Step 2: Verify build and test**

Run: `npm run build`
Test: Click Media Library button → modal opens → select image → modal closes → image appears in upload area.

**Step 3: Commit**

```bash
git add components/creative-studio/image-to-video.tsx app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: add Media Library integration to Image-to-Video mode"
```

---

## Phase 3: URL-to-Video Mode

This is the largest mode. It ports Video Studio (concepts + pills) and Direct (custom concept + Director's Review) into a single component with a toggle.

### Task 5: Create URL-to-Video component — product input step

**Files:**
- Create: `components/creative-studio/url-to-video.tsx`

**Step 1: Create component with product input UI**

Port the product URL input + manual entry toggle from `video-studio/page.tsx` (lines 926-1087 in direct, similar in video-studio). The component manages its own state.

Key state to port:
```typescript
// Product input
const [inputMode, setInputMode] = useState<'url' | 'manual'>('url')
const [productUrl, setProductUrl] = useState('')
const [isAnalyzing, setIsAnalyzing] = useState(false)
const [analyzeError, setAnalyzeError] = useState<string | null>(null)
const [hasAnalyzed, setHasAnalyzed] = useState(false)

// Product knowledge
const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge | null>(null)
const [productImages, setProductImages] = useState<ProductImage[]>([])
const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)
const [includeProductImage, setIncludeProductImage] = useState(true)

// Pill pools
const [pools, setPools] = useState<Record<PillCategory, string[]>>({
  name: [], description: [], features: [], benefits: [],
  keyMessages: [], testimonials: [], painPoints: [],
})
const [selected, setSelected] = useState<Record<PillCategory, number[]>>({
  name: [], description: [], features: [], benefits: [],
  keyMessages: [], testimonials: [], painPoints: [],
})
const [extraContext, setExtraContext] = useState({ targetAudience: '', category: '', uniqueSellingPoint: '' })
const [videoIntel, setVideoIntel] = useState({ motionOpportunities: [], sensoryDetails: [], visualHooks: [] })
```

Port the `handleAnalyzeUrl` function from `video-studio/page.tsx` — it calls `/api/creative-studio/analyze-product-url` and populates pools.

Port the product input UI: URL input + "Analyze" button, manual entry fields, pill selector grid.

**Step 2: Add sub-mode toggle**

After product analysis (step 2), show a toggle:
```tsx
const [subMode, setSubMode] = useState<'concepts' | 'direct'>('concepts')

// Toggle UI
<div className="flex gap-1 p-1 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
  <button
    onClick={() => setSubMode('concepts')}
    className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-all',
      subMode === 'concepts' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
    )}>
    Generate Concepts
  </button>
  <button
    onClick={() => setSubMode('direct')}
    className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-all',
      subMode === 'direct' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
    )}>
    Direct
  </button>
</div>
```

**Step 3: Wire into ad-studio page**

Replace the `url-to-video` placeholder with:
```tsx
import URLToVideo from '@/components/creative-studio/url-to-video'

{mode === 'url-to-video' && (
  <URLToVideo
    userId={user?.id || ''}
    adAccountId={currentAccountId || ''}
    credits={aiUsage ? { remaining: aiUsage.remaining, totalAvailable: aiUsage.totalAvailable } : null}
    onCreditsChanged={() => { refreshCredits(); notifyCreditsChanged() }}
    onBack={resetToModeSelection}
  />
)}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: URL-to-Video card → shows product URL input → analyze → pill selector → toggle (concepts/direct). Neither sub-mode renders anything yet.

**Step 5: Commit**

```bash
git add components/creative-studio/url-to-video.tsx app/dashboard/creative-studio/ad-studio/page.tsx
git commit -m "feat: add URL-to-Video component with product input + pill selector + sub-mode toggle"
```

---

### Task 6: URL-to-Video — Generate Concepts sub-mode

**Files:**
- Modify: `components/creative-studio/url-to-video.tsx`

**Step 1: Port concept generation**

Port from `video-studio/page.tsx`:
- `handleGenerateConcepts()` — calls `/api/creative-studio/generate-ad-concepts`
- `concepts` state array
- `expandedConcept` accordion state
- `conceptError` state
- Video style selector (cinematic/product/macro/conceptual/documentary)
- Canvas creation + persistence

**Step 2: Port concept cards UI**

Port the concept card rendering from `video-studio/page.tsx`:
- Collapsed card: title, angle badge, logline, "Why It Works"
- Expanded card: script fields (scene, subject, action, mood), overlays, video player
- Inline video generation: quality selector + generate button per card
- Video carousel with version dots
- "+7 sec" extend button
- Edit concept mode

Port the concept color scheme:
```typescript
const CONCEPT_COLORS = [
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', ... },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', ... },
  // ... 8 total
]
```

**Step 3: Port video generation handler**

Port `handleGenerate()` from `video-studio/page.tsx` — builds the video body and calls `/api/creative-studio/generate-video`.

**Step 4: Port job polling**

Port `refreshJobs()` and the polling interval from `video-studio/page.tsx`.

**Step 5: Port "Add Concept" system**

Port the add concept UI: "AI Generate" / "Prompt" / "Custom" sub-modes.

**Step 6: Verify build and test**

Run: `npm run build`
Test: URL-to-Video → analyze URL → select pills → "Generate Concepts" toggle → 4 concept cards appear → expand card → generate video.

**Step 7: Commit**

```bash
git add components/creative-studio/url-to-video.tsx
git commit -m "feat: add Generate Concepts sub-mode to URL-to-Video"
```

---

### Task 7: URL-to-Video — Direct sub-mode

**Files:**
- Modify: `components/creative-studio/url-to-video.tsx`

**Step 1: Port Direct concept prompt**

Port from `direct/page.tsx`:
- Concept prompt textarea ("Describe your video concept")
- `handleWriteConcept()` — calls `/api/creative-studio/generate-direct-concept`
- `directResult` state (DirectConceptResult)

**Step 2: Port Director's Review panel**

Port from `direct/page.tsx` (lines 1151-1443):
- Editable fields: scene, subject, action, mood, Veo prompt, extension prompts, overlays, ad copy
- Quality selector
- Budget line
- "Generate Video" + "Rewrite Concept" buttons

**Step 3: Port Direct video generation**

Port the generate handler that converts edited fields → AdConcept → calls generate-video API.

**Step 4: Verify build and test**

Run: `npm run build`
Test: URL-to-Video → analyze → "Direct" toggle → textarea → "Write Concept" → Director's Review → edit → "Action!" → generates video.

**Step 5: Commit**

```bash
git add components/creative-studio/url-to-video.tsx
git commit -m "feat: add Direct sub-mode with Director's Review to URL-to-Video"
```

---

## Phase 4: Polish & Verification

### Task 8: Video polling integration

**Files:**
- Modify: `components/creative-studio/image-to-video.tsx`
- Modify: `components/creative-studio/url-to-video.tsx`

**Step 1: Add video job polling to Image-to-Video**

After video generation starts, the component needs to poll `/api/creative-studio/video-status` to get updates. Port the polling pattern from ad-studio:

```typescript
// Poll for video status
useEffect(() => {
  if (!videoJob || videoJob.status === 'complete' || videoJob.status === 'failed') return
  const interval = setInterval(async () => {
    const res = await fetch('/api/creative-studio/video-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, adAccountId, jobId: videoJob.id }),
    })
    const data = await res.json()
    if (data.job) setVideoJob(data.job)
  }, 15000)
  return () => clearInterval(interval)
}, [videoJob, userId, adAccountId])
```

When job completes, show the video player with Download/Edit buttons.

**Step 2: Add completed video UI to Image-to-Video**

Show video player when `videoJob.status === 'complete'`:
- 9:16 video player
- Download button
- "Edit in Video Editor" link
- "New Video" button (reset to image input)

**Step 3: Verify URL-to-Video polling**

URL-to-Video already handles polling via the ported `refreshJobs()` function. Verify it works end-to-end.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add components/creative-studio/image-to-video.tsx components/creative-studio/url-to-video.tsx
git commit -m "feat: add video polling and completion UI to new video modes"
```

---

### Task 9: Full integration test + cleanup

**Files:**
- Possibly modify: `app/dashboard/creative-studio/ad-studio/page.tsx`

**Step 1: Test all 4 modes end-to-end**

1. **Text-to-Video:** Click card → lands on Open Prompt with video selected → type prompt → "Write Script" → Director's Review → "Action!" → video generates
2. **Image-to-Video:** Click card → upload image → type prompt → "Write Script" → Director's Review → "Action!" → video generates
3. **UGC Video:** Click card → configure actor → enter product → "Write Script" → Director's Review → "Action!" → video generates
4. **URL-to-Video (Concepts):** Click card → enter URL → analyze → select pills → "Generate Concepts" → 4 cards → expand → generate → video plays
5. **URL-to-Video (Direct):** Same setup → "Direct" toggle → type concept → "Write Concept" → Director's Review → "Action!" → video generates

**Step 2: Verify legacy section still works**

Click each card in the "Guided Video Ads (Legacy)" section and confirm they still function identically.

**Step 3: Verify back navigation**

Each mode's back button returns to the landing page with all sections visible.

**Step 4: Verify credit display**

Credit costs display correctly in all Director's Review panels. Budget lines update when switching quality.

**Step 5: Final build**

Run: `npm run build`
Expected: Clean build with no type errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete Video Ads reorganization — 4 modes on Ad Studio page"
```

---

## Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Landing page cards + legacy label | Small |
| 2 | Placeholder render blocks + reset | Small |
| 3 | Image-to-Video component (full) | Large |
| 4 | Media Library integration | Medium |
| 5 | URL-to-Video product input + pills | Large |
| 6 | URL-to-Video Generate Concepts | Large |
| 7 | URL-to-Video Direct sub-mode | Medium |
| 8 | Video polling + completion UI | Medium |
| 9 | Full integration test + cleanup | Small |

**Total new files:** 2 (`image-to-video.tsx`, `url-to-video.tsx`)
**Modified files:** 1 (`ad-studio/page.tsx` — landing page + mode wiring)
**Existing API routes used:** `plan-scene`, `generate-video`, `video-status`, `analyze-product-url`, `generate-ad-concepts`, `generate-direct-concept`, `video-canvas`
**No new API routes needed.**
