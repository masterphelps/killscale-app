# Ad Oracle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Ad Studio landing page (9 mode cards + unlabeled open prompt bar) with a single Oracle input box powered by Claude Haiku intent detection, plus two-column suggestion chips.

**Architecture:** New Oracle Box and Chips components replace the landing page render block (lines 3001–3407 of ad-studio/page.tsx). A new `/api/creative-studio/oracle-route` endpoint handles Claude Haiku intent classification. All existing mode views, handlers, and downstream flows remain unchanged — the Oracle only replaces HOW the user enters a mode, not what happens after.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Claude Haiku (via Anthropic SDK), Lucide icons

**Design doc:** `docs/plans/2026-03-01-ad-oracle-design.md`

---

### Task 1: Create Oracle Route API

**Files:**
- Create: `app/api/creative-studio/oracle-route/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface OracleRequest {
  text: string
  outputType: 'ad' | 'content'
  format: 'image' | 'video'
  hasImage: boolean
}

interface OracleResponse {
  workflow: 'create' | 'clone' | 'inspiration' | 'upload'
    | 'url-to-video' | 'ugc-video' | 'image-to-video'
    | 'open-prompt' | 'text-to-video'
  productUrl?: string
  competitorUrl?: string
  prompt?: string
  format: 'image' | 'video'
  outputType: 'ad' | 'content'
}

const SYSTEM_PROMPT = `You are a router for an ad creation tool called KillScale Ad Studio. Given user input and their selected toggles, classify their intent and extract any URLs.

Available workflows:
- "create": User has a product URL and wants image ads with copy (headlines, primary text, descriptions)
- "clone": User wants to copy/remix a competitor's ad style. Keywords: clone, like, similar to, inspired by, remix, copy style
- "inspiration": User wants to browse example ads for inspiration. Keywords: inspiration, browse, examples, gallery, ideas
- "upload": User has their own image and wants to turn it into an ad
- "url-to-video": User has a product URL and wants AI video ad concepts with overlays
- "ugc-video": User wants a UGC (user-generated content) style testimonial video. Keywords: UGC, testimonial, talking head, influencer, creator, review
- "image-to-video": User has an image and wants to animate it into a video
- "text-to-video": User has a text description and wants a video ad with director's review
- "open-prompt": User wants raw content (no ad copy structure). Used when outputType is "content"

Routing rules:
1. If outputType is "content", always return "open-prompt" regardless of other signals
2. If hasImage is true and format is "image", return "upload"
3. If hasImage is true and format is "video", return "image-to-video"
4. If text contains a URL and format is "image", return "create"
5. If text contains a URL and format is "video" and NO UGC keywords, return "url-to-video"
6. If text contains a URL and format is "video" and HAS UGC keywords, return "ugc-video"
7. If text mentions cloning/copying a competitor, return "clone"
8. If text asks for inspiration/examples/browsing, return "inspiration"
9. If text is a creative brief with NO URL and format is "image", return "create"
10. If text is a creative brief with NO URL and format is "video", return "text-to-video"

Extract any URLs found in the text. If there are two URLs, the first is likely the product URL and the second is the competitor URL.

Strip routing-intent language from the prompt field — return only the creative brief portion.

Return ONLY valid JSON matching this schema:
{
  "workflow": string,
  "productUrl": string | null,
  "competitorUrl": string | null,
  "prompt": string | null,
  "format": "image" | "video",
  "outputType": "ad" | "content"
}`

export async function POST(req: NextRequest) {
  try {
    const body: OracleRequest = await req.json()
    const { text, outputType, format, hasImage } = body

    if (!text?.trim() && !hasImage) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 })
    }

    // Fast path: if content mode, skip Claude call
    if (outputType === 'content') {
      const urlMatch = text.match(/https?:\/\/[^\s]+/)
      return NextResponse.json({
        workflow: 'open-prompt',
        productUrl: urlMatch?.[0] || null,
        prompt: text.trim(),
        format,
        outputType,
      })
    }

    // Fast path: image attached
    if (hasImage && format === 'image') {
      return NextResponse.json({
        workflow: 'upload',
        prompt: text.trim() || null,
        format,
        outputType,
      })
    }

    if (hasImage && format === 'video') {
      return NextResponse.json({
        workflow: 'image-to-video',
        prompt: text.trim() || null,
        format,
        outputType,
      })
    }

    // Claude Haiku classification for ambiguous inputs
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Input text: "${text}"\nOutput type toggle: ${outputType}\nFormat toggle: ${format}\nHas attached image: ${hasImage}`,
      }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Fallback: use toggles directly
      const urlMatch = text.match(/https?:\/\/[^\s]+/)
      return NextResponse.json({
        workflow: urlMatch
          ? (format === 'video' ? 'url-to-video' : 'create')
          : (format === 'video' ? 'text-to-video' : 'create'),
        productUrl: urlMatch?.[0] || null,
        prompt: text.trim(),
        format,
        outputType,
      })
    }

    const result: OracleResponse = JSON.parse(jsonMatch[0])

    // Validate workflow value
    const validWorkflows = [
      'create', 'clone', 'inspiration', 'upload',
      'url-to-video', 'ugc-video', 'image-to-video',
      'open-prompt', 'text-to-video',
    ]
    if (!validWorkflows.includes(result.workflow)) {
      result.workflow = format === 'video' ? 'text-to-video' : 'create'
    }

    // Ensure format/outputType match toggles (user toggles override Claude)
    result.format = format
    result.outputType = outputType

    return NextResponse.json(result)
  } catch (err) {
    console.error('Oracle route error:', err)
    // Fallback: simple toggle-based routing
    const body: OracleRequest = await req.json().catch(() => ({
      text: '', outputType: 'ad' as const, format: 'image' as const, hasImage: false,
    }))
    return NextResponse.json({
      workflow: body.format === 'video' ? 'text-to-video' : 'create',
      prompt: body.text?.trim() || null,
      format: body.format,
      outputType: body.outputType,
    })
  }
}
```

**Step 2: Verify the endpoint compiles**

Run: `npx tsc --noEmit app/api/creative-studio/oracle-route/route.ts` or `npm run build` (check for type errors)

**Step 3: Commit**

```bash
git add app/api/creative-studio/oracle-route/route.ts
git commit -m "feat: add Oracle route API for Claude-powered intent classification"
```

---

### Task 2: Create Oracle Box Component

**Files:**
- Create: `components/creative-studio/oracle-box.tsx`

**Step 1: Build the component**

The Oracle Box is the main input. It contains:
- A large textarea
- Image attachment button (opens file picker or Media Library)
- Two toggle pills: Ad/Content and Image/Video
- Submit button
- Auto-suggest dropdown (client-side keyword matching)
- Drag-and-drop image support
- Loading state during Oracle classification

```typescript
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Paperclip, Loader2, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Auto-suggest definitions — keyword patterns → suggestion label + target workflow
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
              <span className="text-purple-400">→</span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add shimmer keyframe to globals.css**

Add after the existing keyframes in `app/globals.css`:

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-shimmer {
  animation: shimmer 1.5s ease-in-out infinite;
}
```

**Step 3: Commit**

```bash
git add components/creative-studio/oracle-box.tsx app/globals.css
git commit -m "feat: add Oracle Box component with toggles, image attach, auto-suggest"
```

---

### Task 3: Create Oracle Chips Component

**Files:**
- Create: `components/creative-studio/oracle-chips.tsx`

**Step 1: Build the component**

```typescript
'use client'

import {
  Target, RefreshCw, Sparkles, UserCircle, ImagePlus,
  Image as ImageIcon, Film, Video,
} from 'lucide-react'
import type { OracleOutputType, OracleFormat } from './oracle-box'

interface ChipDef {
  label: string
  icon: React.ElementType
  group: 'ads' | 'content'
  action:
    | { type: 'focus'; outputType: OracleOutputType; format: OracleFormat; placeholder: string }
    | { type: 'workflow'; workflow: string }
    | { type: 'file'; outputType: OracleOutputType; format: OracleFormat; placeholder: string }
}

const chips: ChipDef[] = [
  // Make Ads
  { label: 'Product → Ad', icon: Target, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'image', placeholder: 'Paste your product URL...' } },
  { label: 'Product → Video Ad', icon: Target, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'video', placeholder: 'Paste your product URL...' } },
  { label: 'Clone Ad', icon: RefreshCw, group: 'ads', action: { type: 'workflow', workflow: 'clone' } },
  { label: 'Inspiration', icon: Sparkles, group: 'ads', action: { type: 'workflow', workflow: 'inspiration' } },
  { label: 'UGC Video Ad', icon: UserCircle, group: 'ads', action: { type: 'focus', outputType: 'ad', format: 'video', placeholder: 'Paste your product URL for a UGC video...' } },
  { label: 'Image → Ad', icon: ImagePlus, group: 'ads', action: { type: 'file', outputType: 'ad', format: 'image', placeholder: 'Drop an image or paste a URL...' } },
  // Make Content
  { label: 'Generate Image', icon: ImageIcon, group: 'content', action: { type: 'focus', outputType: 'content', format: 'image', placeholder: 'Describe the image you want...' } },
  { label: 'Generate Video', icon: Film, group: 'content', action: { type: 'focus', outputType: 'content', format: 'video', placeholder: 'Describe the video you want...' } },
  { label: 'Image → Video', icon: Video, group: 'content', action: { type: 'file', outputType: 'content', format: 'video', placeholder: 'Drop an image and describe the animation...' } },
]

interface OracleChipsProps {
  onChipAction: (action: ChipDef['action']) => void
}

export function OracleChips({ onChipAction }: OracleChipsProps) {
  const adChips = chips.filter(c => c.group === 'ads')
  const contentChips = chips.filter(c => c.group === 'content')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      {/* Make Ads column */}
      <div>
        <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-3">Make Ads</h3>
        <div className="space-y-1.5">
          {adChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all group"
              >
                <Icon className="w-4 h-4 text-purple-400/60 group-hover:text-purple-400 transition-colors" />
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Make Content column */}
      <div>
        <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-3">Make Content</h3>
        <div className="space-y-1.5">
          {contentChips.map((chip) => {
            const Icon = chip.icon
            return (
              <button
                key={chip.label}
                onClick={() => onChipAction(chip.action)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-all group"
              >
                <Icon className="w-4 h-4 text-cyan-400/60 group-hover:text-cyan-400 transition-colors" />
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export type { ChipDef }
```

**Step 2: Export both components from the barrel**

In `components/creative-studio/index.ts`, add:

```typescript
export { OracleBox } from './oracle-box'
export type { OracleSubmission, OracleOutputType, OracleFormat } from './oracle-box'
export { OracleChips } from './oracle-chips'
export type { ChipDef } from './oracle-chips'
```

**Step 3: Commit**

```bash
git add components/creative-studio/oracle-chips.tsx components/creative-studio/index.ts
git commit -m "feat: add Oracle Chips component with two-column suggestion layout"
```

---

### Task 4: Integrate Oracle into Ad Studio Landing Page

This is the core task. Replace the landing page render block (lines 3001–3407) with Oracle Box + Chips.

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx` (lines 3001–3407 — the `if (!mode)` landing block)

**Step 1: Add imports at top of file**

Add these imports alongside existing ones (near line 1-39):

```typescript
import { OracleBox, type OracleSubmission } from '@/components/creative-studio/oracle-box'
import { OracleChips, type ChipDef } from '@/components/creative-studio/oracle-chips'
```

**Step 2: Add Oracle state variables**

Add near the other state declarations (after line 447):

```typescript
// Oracle state
const [oracleLoading, setOracleLoading] = useState(false)
const [oraclePlaceholder, setOraclePlaceholder] = useState<string | undefined>(undefined)
const oracleFileRef = useRef<HTMLInputElement>(null)
```

**Step 3: Add Oracle submit handler**

Add near the other handlers (before `resetToModeSelection` around line 1738):

```typescript
// Oracle submit — send to Claude Haiku for intent classification, then route to workflow
const handleOracleSubmit = useCallback(async (submission: OracleSubmission) => {
  setOracleLoading(true)
  try {
    const res = await fetch('/api/creative-studio/oracle-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: submission.text,
        outputType: submission.outputType,
        format: submission.format,
        hasImage: !!submission.image,
      }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Failed to classify intent')

    // Pre-populate data based on what Oracle extracted
    const { workflow, productUrl, prompt } = result

    // Store attached image for flows that need it
    if (submission.image) {
      setOpenPromptSourceImage({
        base64: submission.image.base64,
        mimeType: submission.image.mimeType,
        preview: submission.image.preview,
      })
    }

    // Route to the appropriate workflow
    switch (workflow) {
      case 'create':
        setMode('create')
        if (productUrl) {
          setProductUrl(productUrl)
          // Auto-trigger URL analysis after mode renders
          setTimeout(() => handleAnalyzeProduct?.(), 100)
        }
        break

      case 'clone':
        setMode('clone')
        if (productUrl) setProductUrl(productUrl)
        break

      case 'inspiration':
        setMode('inspiration')
        break

      case 'upload':
        // If we have an attached image, go straight to upload mode with it
        if (submission.image) {
          setUploadedImage(submission.image.preview)
          setUploadedImageBase64(submission.image.base64)
          setUploadedImageMimeType(submission.image.mimeType)
          if (prompt) setUploadPrompt(prompt)
        }
        setMode('upload')
        break

      case 'url-to-video':
        setMode('url-to-video')
        // URLToVideo component accepts initialProductUrl prop — set via state
        if (productUrl) setProductUrl(productUrl)
        break

      case 'ugc-video':
        setMode('ugc-video')
        if (productUrl) setProductUrl(productUrl)
        break

      case 'text-to-video':
        // Direct page — pass prompt as query param
        router.push(
          `/dashboard/creative-studio/direct${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}`
        )
        break

      case 'image-to-video':
        setMode('image-to-video')
        // ImageToVideo component will pick up openPromptSourceImage
        break

      case 'open-prompt':
        if (prompt) setOpenPromptText(prompt)
        setOpenPromptMediaType(submission.format)
        // For content mode, trigger generation directly
        if (submission.text.trim()) {
          setMode('open-prompt')
          // Let the existing handleOpenPromptGenerate pick up the state
          setTimeout(() => {
            const btn = document.getElementById('open-prompt-generate-btn')
            btn?.click()
          }, 200)
        } else {
          setMode('open-prompt')
        }
        break

      default:
        // Fallback: treat as create
        setMode('create')
        if (productUrl) setProductUrl(productUrl)
    }
  } catch (err) {
    console.error('Oracle routing error:', err)
    // Fallback: go to create mode
    setMode('create')
  } finally {
    setOracleLoading(false)
  }
}, [router])
```

**Step 4: Add chip action handler**

```typescript
// Oracle chip action — handle different chip types
const handleOracleChipAction = useCallback((action: ChipDef['action']) => {
  switch (action.type) {
    case 'focus':
      setOraclePlaceholder(action.placeholder)
      // Set toggles will be handled by OracleBox internally when it submits
      // Just focus the textarea
      setTimeout(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('[data-oracle-input]')
        textarea?.focus()
      }, 50)
      break

    case 'workflow':
      // Jump directly to the workflow
      if (action.workflow === 'clone') {
        setMode('clone')
      } else if (action.workflow === 'inspiration') {
        setMode('inspiration')
      }
      break

    case 'file':
      setOraclePlaceholder(action.placeholder)
      // Open file picker
      oracleFileRef.current?.click()
      break
  }
}, [])
```

**Step 5: Replace the landing page render block**

Replace lines 3001–3407 (the entire `if (!mode) { return (...) }` block) with:

```typescript
// Oracle landing page
if (!mode) {
  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-10">

          {/* Header */}
          <div className="text-center pt-4 lg:pt-8">
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Ad Studio</h1>
            <p className="text-zinc-500 text-sm mt-1">Create ads and content with AI</p>
          </div>

          {/* Oracle Box */}
          <OracleBox
            onSubmit={handleOracleSubmit}
            onDirectWorkflow={(workflow) => {
              if (workflow === 'clone') setMode('clone')
              else if (workflow === 'inspiration') setMode('inspiration')
              else if (workflow === 'ugc-video') setMode('ugc-video')
              else if (workflow === 'image-to-video') setMode('image-to-video')
            }}
            isLoading={oracleLoading}
            placeholder={oraclePlaceholder}
          />

          {/* Hidden file input for chip file actions */}
          <input
            ref={oracleFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1]
                setOpenPromptSourceImage({
                  base64,
                  mimeType: file.type,
                  preview: URL.createObjectURL(file),
                })
                setMode('upload')
              }
              reader.readAsDataURL(file)
            }}
          />

          {/* Suggestion Chips */}
          <OracleChips onChipAction={handleOracleChipAction} />

        </div>
      </div>

      {/* Keep MediaLibraryModal for any flows that need it */}
      <MediaLibraryModal
        isOpen={openPromptShowLibrary}
        onClose={() => setOpenPromptShowLibrary(false)}
        adAccountId={currentAccountId || ''}
        onSelect={async (media: MediaImage) => {
          setOpenPromptDownloadingLibrary(true)
          try {
            const imgRes = await fetch(media.url)
            const blob = await imgRes.blob()
            const reader = new FileReader()
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1]
              setOpenPromptSourceImage({
                base64,
                mimeType: blob.type || 'image/jpeg',
                preview: media.url,
              })
              setOpenPromptShowLibrary(false)
            }
            reader.readAsDataURL(blob)
          } catch {
            setOpenPromptShowLibrary(false)
          } finally {
            setOpenPromptDownloadingLibrary(false)
          }
        }}
        mode="images"
      />
    </div>
  )
}
```

**Step 6: Add `data-oracle-input` attribute to the textarea in OracleBox**

In `components/creative-studio/oracle-box.tsx`, add `data-oracle-input` to the textarea element so the chip focus handler can find it:

```typescript
<textarea
  ref={textareaRef}
  data-oracle-input
  // ... rest of props
/>
```

**Step 7: Verify build**

Run: `npm run build`

Expected: Types compile successfully. The landing page now shows Oracle Box + Chips instead of the old cards.

**Step 8: Commit**

```bash
git add app/dashboard/creative-studio/ad-studio/page.tsx components/creative-studio/oracle-box.tsx
git commit -m "feat: integrate Oracle Box + Chips into Ad Studio landing page"
```

---

### Task 5: Handle Direct Page Prompt Passthrough

The Oracle routes `text-to-video` by pushing to `/dashboard/creative-studio/direct?prompt=...`. The direct page needs to read this.

**Files:**
- Modify: `app/dashboard/creative-studio/direct/page.tsx`

**Step 1: Read prompt from URL params**

Find where `directConceptPrompt` state is declared and add URL param reading:

```typescript
const searchParams = useSearchParams()
const [directConceptPrompt, setDirectConceptPrompt] = useState(
  searchParams?.get('prompt') || ''
)
```

If `useSearchParams` is not already imported, add it. If the state already exists, just change the initial value to read from the URL param.

**Step 2: Commit**

```bash
git add app/dashboard/creative-studio/direct/page.tsx
git commit -m "feat: support prompt passthrough from Oracle to Direct Studio"
```

---

### Task 6: Clean Up and Polish

**Files:**
- Modify: `app/dashboard/creative-studio/ad-studio/page.tsx`
- Modify: `components/creative-studio/oracle-box.tsx`

**Step 1: Remove dead code**

The old landing page card components and their associated styles can be removed if they're not used elsewhere. The open prompt bar state variables that were ONLY used in the landing page render block may now be partially redundant — check if `openPromptText`, `openPromptMediaType`, etc. are still needed for the `mode === 'open-prompt'` view (they are — keep them).

Check if any imports became unused after removing the card grid (e.g., specific Lucide icons like `PlusCircle`, `Type`, `Clapperboard` that were only used on the cards). Remove unused imports.

**Step 2: Test all 11 paths manually**

| Test | Input | Expected |
|---|---|---|
| Paste URL + Ad + Image | `https://example.com/product` | Routes to `create`, URL pre-filled |
| Paste URL + Ad + Video | `https://example.com/product` + Video toggle | Routes to `url-to-video` |
| Type "clone nike's ad" | Free text | Routes to `clone` |
| Type "UGC testimonial" + Video | Free text | Routes to `ugc-video` |
| Type "inspiration" | Free text | Routes to `inspiration` (gallery) |
| Drop image + Ad + Image | Attach image | Routes to `upload` |
| Drop image + Video | Attach image | Routes to `image-to-video` |
| Type prompt + Content + Image | Free text | Routes to `open-prompt` (image) |
| Type prompt + Content + Video | Free text | Routes to `open-prompt` (video) |
| Type prompt + Ad + Video | Free text (no URL) | Routes to `text-to-video` (direct page) |
| Click "Product → Ad" chip | — | Focuses Oracle, sets Ad + Image |
| Click "Clone Ad" chip | — | Jumps to clone mode |
| Click "Inspiration" chip | — | Jumps to inspiration gallery |
| Click "UGC Video Ad" chip | — | Focuses Oracle, sets Ad + Video |

**Step 3: Final build verification**

Run: `npm run build`

Expected: Clean compile, no type errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up unused imports and dead code from old landing page"
```

---

## Summary

| Task | What | New/Modify |
|---|---|---|
| 1 | Oracle Route API (Claude Haiku classification) | New: `app/api/creative-studio/oracle-route/route.ts` |
| 2 | Oracle Box Component (input, toggles, auto-suggest) | New: `components/creative-studio/oracle-box.tsx` |
| 3 | Oracle Chips Component (two-column shortcuts) | New: `components/creative-studio/oracle-chips.tsx` |
| 4 | Integrate into Ad Studio landing page | Modify: `ad-studio/page.tsx` (replace lines 3001–3407) |
| 5 | Direct page prompt passthrough | Modify: `direct/page.tsx` (read URL param) |
| 6 | Clean up + test all 11 paths | Modify: multiple files (dead code removal) |

**No changes to:** Existing mode views, API endpoints, downstream flows, session restoration, AI Tasks page.
