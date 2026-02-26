# Video Editor Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reskin the video editor to a Creatify-style full-screen layout with a thin icon sidebar, 5 flyout panels (Media, Text, Audio, Captions, CTA), AI natural language input in every panel, and Pixabay background music.

**Architecture:** Modify RVE's `default-sidebar.tsx` to replace the existing panel set with 5 KillScale-specific panels. Each panel gets an AI section component that calls the existing `/api/creative-studio/generate-overlay` endpoint. The main app sidebar is hidden via dashboard layout detection. A new Pixabay music proxy route provides background music browsing.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, RVE (React Video Editor), Pixabay Music API, OpenAI Whisper/TTS (existing)

**Design doc:** `docs/plans/2026-02-25-video-editor-redesign-design.md`

---

### Task 1: Full-Screen Layout — Hide Main App Sidebar

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx`

**Context:** The dashboard layout always renders `<Sidebar />` (the main KillScale nav). The video editor needs the full viewport. The Creative Studio layout already hides its own header via `pathname?.includes('/video-editor')` — we follow the same pattern.

**Step 1: Add pathname detection to dashboard layout**

In `app/dashboard/layout.tsx`, inside `DashboardContent`, add `usePathname()` import and detection:

```typescript
import { useRouter, usePathname } from 'next/navigation'

function DashboardContent({ children, sidebarOpen, setSidebarOpen }: { ... }) {
  const { isCollapsed } = useSidebar()
  const pathname = usePathname()
  const isFullScreen = pathname?.includes('/video-editor')

  // If full-screen mode, render children only with no sidebar/mobile header
  if (isFullScreen) {
    return <main className="min-h-screen bg-bg-dark">{children}</main>
  }

  // ... existing sidebar + mobile header + main content layout
```

**Step 2: Update video editor page to use full viewport height**

In `app/dashboard/creative-studio/video-editor/page.tsx`, find the outer wrapper div. Change:

```typescript
// Before:
<div className="flex flex-col h-[calc(100vh-4rem)]">

// After:
<div className="flex flex-col h-screen">
```

**Step 3: Verify by running dev server**

Run: `npm run dev`
Navigate to: `http://localhost:3000/dashboard/creative-studio/video-editor?jobId=<any-job-id>`
Expected: Full viewport, no KillScale sidebar on left. Back button still works.

**Step 4: Build verify**

Run: `rm -rf .next && npm run build`
Expected: Clean build, no type errors.

**Step 5: Commit**

```bash
git add app/dashboard/layout.tsx app/dashboard/creative-studio/video-editor/page.tsx
git commit -m "feat: full-screen video editor — hide main sidebar"
```

---

### Task 2: Reusable AI Section Component

**Files:**
- Create: `lib/rve/components/panels/ai-section.tsx`

**Context:** Every sidebar panel will have a collapsible AI section at the top with a purple sparkle icon, optional quick-action buttons, and a natural language text input. Build this as a reusable component first.

**Step 1: Create the AI section component**

```typescript
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
```

**Step 2: Build verify**

Run: `rm -rf .next && npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add lib/rve/components/panels/ai-section.tsx
git commit -m "feat: reusable AI section component for editor sidebar panels"
```

---

### Task 3: Text Panel

**Files:**
- Create: `lib/rve/components/panels/text-panel.tsx`

**Context:** Simple panel with 4 text preset buttons (Headline, Subheadline, Body Text, Description) plus the AI section. Clicking a preset adds a `TextOverlay` to the timeline. Uses `useEditorContext()` from RVE to add overlays.

**Step 1: Create the text panel**

```typescript
'use client'

import { useEditorContext } from '../../contexts/editor-context'
import { OverlayType } from '../../types'
import { AISection } from './ai-section'
import { v4 as uuidv4 } from 'uuid'

interface TextPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
}

const TEXT_PRESETS = [
  { label: 'Headline', fontSize: 72, fontWeight: 'bold' as const },
  { label: 'Subheadline', fontSize: 48, fontWeight: 'semibold' as const },
  { label: 'Body Text', fontSize: 32, fontWeight: 'normal' as const },
  { label: 'Description', fontSize: 24, fontWeight: 'normal' as const },
]

export function TextPanel({ onAIGenerate, isAIGenerating }: TextPanelProps) {
  const { setOverlays, overlays, playerRef } = useEditorContext()

  const addTextOverlay = (preset: typeof TEXT_PRESETS[number]) => {
    const currentFrame = playerRef?.current?.getCurrentFrame?.() ?? 0
    const fps = 30
    const durationFrames = 3 * fps // 3 seconds default

    const newOverlay = {
      id: uuidv4(),
      type: OverlayType.TEXT as const,
      content: preset.label,
      from: currentFrame,
      durationInFrames: durationFrames,
      left: 50, // center
      top: 50,
      width: 80,
      height: 15,
      row: 0,
      rotation: 0,
      isDragging: false,
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
      fontFamily: 'Inter',
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center' as const,
    }

    setOverlays([...overlays, newOverlay])
  }

  return (
    <div className="p-3 space-y-2">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Add text overlay: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe text you want..."
        quickActions={[
          { label: 'Add hook text', instruction: 'Add a bold hook text overlay in the first 2 seconds' },
        ]}
      />
      <div className="space-y-2">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => addTextOverlay(preset)}
            className="w-full text-center py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            style={{ fontSize: `${Math.min(preset.fontSize / 4, 20)}px`, fontWeight: preset.fontWeight === 'bold' ? 700 : preset.fontWeight === 'semibold' ? 600 : 400 }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Build verify**

Run: `rm -rf .next && npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add lib/rve/components/panels/text-panel.tsx
git commit -m "feat: text panel with presets and AI section"
```

---

### Task 4: Audio Panel (Voiceover + Pixabay Music)

**Files:**
- Create: `app/api/creative-studio/music-search/route.ts`
- Create: `lib/rve/components/panels/audio-panel.tsx`

**Context:** The Audio panel has two sections: Voiceover (moved from header — 6 OpenAI TTS voices, generate button) and Background Music (new — Pixabay Music API with search and genre filters). The voiceover callbacks come from the page level via props.

**Step 1: Create the Pixabay music search API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || ''
const PIXABAY_MUSIC_URL = 'https://pixabay.com/api/videos/music/'  // Placeholder — Pixabay doesn't have a public music API

// NOTE: Pixabay doesn't actually have a music API. Use their audio search endpoint
// or alternatively use a free royalty-free music source. For now, we'll use their
// search API to find audio content, or hardcode a curated set.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const genre = searchParams.get('genre') || ''
  const page = searchParams.get('page') || '1'

  try {
    // Pixabay audio API
    const params = new URLSearchParams({
      key: PIXABAY_API_KEY,
      q: q || genre,
      page,
      per_page: '20',
    })

    const response = await fetch(`https://pixabay.com/api/?${params}&media_type=music`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      // Fallback: return empty set if API unavailable
      return NextResponse.json({ tracks: [], total: 0 })
    }

    const data = await response.json()

    const tracks = (data.hits || []).map((hit: any) => ({
      id: String(hit.id),
      title: hit.tags?.split(',')[0]?.trim() || 'Untitled',
      artist: hit.user || 'Unknown',
      duration: hit.duration || 0,
      previewUrl: hit.videos?.tiny?.url || hit.previewURL || '',
      downloadUrl: hit.largeImageURL || '', // placeholder
      genre: genre || 'all',
      thumbnailUrl: hit.previewURL || '',
    }))

    return NextResponse.json({ tracks, total: data.totalHits || 0 })
  } catch (error) {
    console.error('Music search error:', error)
    return NextResponse.json({ tracks: [], total: 0 })
  }
}
```

Note: The Pixabay music API integration may need adjustment based on their actual endpoint. The component is built to work with any track list format. If Pixabay's API doesn't support music search well, we can swap to a curated set stored in Supabase or use another free provider.

**Step 2: Create the Audio panel component**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Play, Pause, Volume2 } from 'lucide-react'
import { AISection } from './ai-section'

interface Track {
  id: string
  title: string
  artist: string
  duration: number
  previewUrl: string
  genre: string
}

interface AudioPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
  // Voiceover props (moved from header)
  voices: { id: string; label: string }[]
  selectedVoice: string
  onSelectVoice: (voiceId: string) => void
  onGenerateVoiceover: () => Promise<void>
  isGeneratingVoiceover: boolean
  hasVoiceover: boolean
  // Music callback
  onAddMusic: (trackUrl: string, title: string, duration: number) => void
}

const GENRE_FILTERS = ['All', 'Upbeat', 'Chill', 'Electronic', 'Acoustic', 'Cinematic', 'Lo-fi']

export function AudioPanel({
  onAIGenerate, isAIGenerating,
  voices, selectedVoice, onSelectVoice, onGenerateVoiceover, isGeneratingVoiceover, hasVoiceover,
  onAddMusic,
}: AudioPanelProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [isLoadingTracks, setIsLoadingTracks] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeGenre, setActiveGenre] = useState('All')
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    loadTracks()
  }, [activeGenre])

  const loadTracks = async (query?: string) => {
    setIsLoadingTracks(true)
    try {
      const params = new URLSearchParams()
      if (query || searchQuery) params.set('q', query || searchQuery)
      if (activeGenre !== 'All') params.set('genre', activeGenre.toLowerCase())
      const res = await fetch(`/api/creative-studio/music-search?${params}`)
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch (e) {
      console.error('Failed to load music:', e)
    } finally {
      setIsLoadingTracks(false)
    }
  }

  const togglePlayPreview = (track: Track) => {
    if (playingTrackId === track.id) {
      audioRef.current?.pause()
      setPlayingTrackId(null)
    } else {
      if (audioRef.current) audioRef.current.pause()
      const audio = new Audio(track.previewUrl)
      audio.play()
      audio.onended = () => setPlayingTrackId(null)
      audioRef.current = audio
      setPlayingTrackId(track.id)
    }
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="p-3 space-y-4">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Audio: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe audio you want..."
      />

      {/* Voiceover Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">Voiceover</h3>
        <select
          value={selectedVoice}
          onChange={(e) => onSelectVoice(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={onGenerateVoiceover}
          disabled={isGeneratingVoiceover}
          className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isGeneratingVoiceover ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <Volume2 className="w-4 h-4 inline mr-2" />}
          {hasVoiceover ? 'Regenerate Voiceover' : 'Generate Voiceover'}
        </button>
      </div>

      {/* Background Music Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-300">Background Music</h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadTracks()}
          placeholder="Search music..."
          className="w-full text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {GENRE_FILTERS.map((genre) => (
            <button
              key={genre}
              onClick={() => setActiveGenre(genre)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                activeGenre === genre
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {isLoadingTracks ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : tracks.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">No tracks found</p>
          ) : (
            tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer group"
                onClick={() => onAddMusic(track.previewUrl, track.title, track.duration)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlayPreview(track) }}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600/50 transition-colors"
                >
                  {playingTrackId === track.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{track.title}</p>
                  <p className="text-xs text-zinc-500">{track.artist}</p>
                </div>
                <span className="text-xs text-zinc-500 flex-shrink-0">{formatDuration(track.duration)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Build verify**

Run: `rm -rf .next && npm run build`
Expected: Clean build.

**Step 4: Commit**

```bash
git add app/api/creative-studio/music-search/route.ts lib/rve/components/panels/audio-panel.tsx
git commit -m "feat: audio panel with voiceover + Pixabay music browser"
```

---

### Task 5: Captions Panel

**Files:**
- Create: `lib/rve/components/panels/captions-panel.tsx`

**Context:** Two-tab panel: Style (visual caption style presets) and Content (editable transcript segments). The AI section includes a "Generate Captions" quick action that triggers Whisper transcription. Style changes apply to the `OverlayConfig.style` field via the generate-overlay endpoint.

**Step 1: Create the captions panel**

```typescript
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
      {/* Tab toggle */}
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
              {/* Visual preview */}
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
          <p className="text-xs text-zinc-500 px-1">Caption content editing will show here after captions are generated.</p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Build verify and commit**

```bash
rm -rf .next && npm run build
git add lib/rve/components/panels/captions-panel.tsx
git commit -m "feat: captions panel with style presets and AI section"
```

---

### Task 6: CTA Panel

**Files:**
- Create: `lib/rve/components/panels/cta-panel.tsx`

**Context:** Shows pre-designed CTA overlay templates in a 2-column visual grid. Clicking a template adds a CTA overlay to the timeline. The AI section accepts natural language CTA instructions.

**Step 1: Create the CTA panel**

```typescript
'use client'

import { AISection } from './ai-section'

interface CTAPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
  onAddCTA: (template: CTATemplate) => void
}

interface CTATemplate {
  id: string
  label: string
  text: string
  buttonColor: string
  textColor: string
  style: 'pill' | 'block' | 'outline' | 'gradient'
}

const CTA_TEMPLATES: CTATemplate[] = [
  { id: 'buy-red', label: 'Buy Now', text: 'BUY NOW', buttonColor: '#ef4444', textColor: '#ffffff', style: 'pill' },
  { id: 'shop-blue', label: 'Shop Now', text: 'SHOP NOW', buttonColor: '#3b82f6', textColor: '#ffffff', style: 'pill' },
  { id: 'learn-green', label: 'Learn More', text: 'LEARN MORE', buttonColor: '#22c55e', textColor: '#ffffff', style: 'pill' },
  { id: 'signup-purple', label: 'Sign Up', text: 'SIGN UP FREE', buttonColor: '#8b5cf6', textColor: '#ffffff', style: 'pill' },
  { id: 'get-offer', label: 'Get Offer', text: 'GET 50% OFF', buttonColor: '#f59e0b', textColor: '#000000', style: 'block' },
  { id: 'try-free', label: 'Try Free', text: 'TRY IT FREE', buttonColor: '#06b6d4', textColor: '#ffffff', style: 'outline' },
  { id: 'order-gradient', label: 'Order Now', text: 'ORDER NOW', buttonColor: 'linear-gradient(135deg, #ec4899, #8b5cf6)', textColor: '#ffffff', style: 'gradient' },
  { id: 'swipe-up', label: 'Swipe Up', text: 'SWIPE UP ↑', buttonColor: '#ffffff', textColor: '#000000', style: 'pill' },
]

export function CTAPanel({ onAIGenerate, isAIGenerating, onAddCTA }: CTAPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Create CTA: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe CTA you want..."
        quickActions={[
          { label: 'Add end-screen CTA', instruction: 'Add a call-to-action button at the end of the video' },
        ]}
      />

      <p className="text-xs text-zinc-500 px-1">Templates</p>
      <div className="grid grid-cols-2 gap-2">
        {CTA_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onAddCTA(template)}
            className="rounded-lg overflow-hidden border border-white/10 hover:border-white/20 transition-colors"
          >
            <div className="h-20 flex items-center justify-center bg-zinc-900">
              <span
                className="text-xs font-bold px-4 py-2 rounded-full"
                style={{
                  background: template.style === 'gradient' ? template.buttonColor : template.style === 'outline' ? 'transparent' : template.buttonColor,
                  color: template.textColor,
                  border: template.style === 'outline' ? `2px solid ${template.buttonColor}` : 'none',
                  borderRadius: template.style === 'block' ? '4px' : '9999px',
                }}
              >
                {template.text}
              </span>
            </div>
            <div className="px-2 py-1.5 bg-white/5">
              <p className="text-xs text-zinc-400 text-center">{template.label}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Build verify and commit**

```bash
rm -rf .next && npm run build
git add lib/rve/components/panels/cta-panel.tsx
git commit -m "feat: CTA panel with templates and AI section"
```

---

### Task 7: Media Panel

**Files:**
- Create: `lib/rve/components/panels/media-panel.tsx`

**Context:** The Media panel reuses the media gallery infrastructure from the Creative Studio. It shows the user's media library (videos + images) with type filter pills and collections. Since this panel lives inside RVE's sidebar, it needs to fetch media data independently (not from CreativeStudioContext, which the editor page doesn't consume). Click a media item to add it to the timeline.

**Step 1: Create the Media panel**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Upload, Loader2, Film, ImageIcon } from 'lucide-react'

interface MediaItem {
  id: string
  name: string
  mediaType: 'VIDEO' | 'IMAGE'
  thumbnailUrl?: string
  storageUrl?: string
  width?: number
  height?: number
  fileSize?: number
}

interface MediaPanelProps {
  userId: string
  adAccountId: string
  onAddMedia: (item: MediaItem) => void
  onUpload?: () => void
}

type TypeFilter = 'all' | 'video' | 'image'
type MediaTab = 'media' | 'collections'

export function MediaPanel({ userId, adAccountId, onAddMedia, onUpload }: MediaPanelProps) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [activeTab, setActiveTab] = useState<MediaTab>('media')
  const [collections, setCollections] = useState<any[]>([])

  useEffect(() => {
    loadMedia()
  }, [userId, adAccountId])

  const loadMedia = async () => {
    if (!userId || !adAccountId) return
    setIsLoading(true)
    try {
      const cleanAccountId = adAccountId.replace(/^act_/, '')
      const res = await fetch(`/api/creative-studio/media?userId=${userId}&adAccountId=${cleanAccountId}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.assets || [])
      }
    } catch (e) {
      console.error('Failed to load media:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (typeFilter === 'video') return item.mediaType === 'VIDEO'
    if (typeFilter === 'image') return item.mediaType === 'IMAGE'
    return true
  })

  return (
    <div className="p-3 space-y-3">
      {/* Tab toggle */}
      <div className="flex rounded-lg bg-white/5 p-1">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'media' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('collections')}
          className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'collections' ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
        >
          Collections
        </button>
      </div>

      {activeTab === 'media' && (
        <>
          {/* Upload + filters */}
          <div className="flex items-center gap-2">
            {onUpload && (
              <button onClick={onUpload} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {(['all', 'video', 'image'] as TypeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setTypeFilter(filter)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors capitalize ${
                  typeFilter === filter ? 'bg-purple-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'video' ? 'Videos' : 'Images'}
              </button>
            ))}
          </div>

          {/* Media grid */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
          ) : filteredItems.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">No media found</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAddMedia(item)}
                  className="relative rounded-lg overflow-hidden border border-white/10 hover:border-purple-500/50 transition-colors group"
                >
                  <div className="aspect-[4/3] bg-zinc-900">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.mediaType === 'VIDEO' ? <Film className="w-6 h-6 text-zinc-600" /> : <ImageIcon className="w-6 h-6 text-zinc-600" />}
                      </div>
                    )}
                  </div>
                  {/* Type badge */}
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm">
                      {item.mediaType === 'VIDEO' ? '🎬' : '🖼'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate px-1.5 py-1">{item.name}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'collections' && (
        <div className="text-xs text-zinc-500 text-center py-4">
          <p>Collections</p>
          {/* Collections will be loaded from the same API */}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Build verify and commit**

```bash
rm -rf .next && npm run build
git add lib/rve/components/panels/media-panel.tsx
git commit -m "feat: media panel with library browser and type filters"
```

---

### Task 8: Wire Panels into RVE Sidebar

**Files:**
- Modify: `lib/rve/types/index.ts`
- Modify: `lib/rve/components/shared/default-sidebar.tsx`
- Modify: `lib/rve/components/react-video-editor.tsx`
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx`

**Context:** This is the integration task. We replace the existing `navigationItems` array and `renderActivePanel()` switch with our 5 new panels. We add new `OverlayType` enum values for CTA and Media panels. We thread callbacks from the page through `ReactVideoEditor` → `DefaultSidebar` → panel components.

**Step 1: Add new OverlayType values**

In `lib/rve/types/index.ts`, add to the enum:

```typescript
export enum OverlayType {
  // ... existing values
  CTA = "cta",
  MEDIA = "media",
}
```

**Step 2: Add new props to ReactVideoEditorProps**

In `lib/rve/components/react-video-editor.tsx`, extend the props interface:

```typescript
export interface ReactVideoEditorProps extends Omit<ReactVideoEditorProviderProps, 'children'> {
  // ... existing props
  // New panel callbacks
  onAddCTA?: (template: any) => void
  onAddMedia?: (item: any) => void
  onAddMusic?: (trackUrl: string, title: string, duration: number) => void
  onStyleChange?: (style: string) => void
  currentCaptionStyle?: string
  // Voiceover (moved from page header to sidebar)
  voices?: { id: string; label: string }[]
  selectedVoice?: string
  onSelectVoice?: (voiceId: string) => void
  onGenerateVoiceover?: () => Promise<void>
  isGeneratingVoiceover?: boolean
  hasVoiceover?: boolean
  // Media panel
  userId?: string
  adAccountId?: string
}
```

Pass these new props through to `DefaultSidebar` in the render method.

**Step 3: Rewrite `navigationItems` in `default-sidebar.tsx`**

Replace the existing array with 5 KillScale panels:

```typescript
import { FolderOpen, Type, Music, Subtitles, MousePointerClick } from 'lucide-react'
import { MediaPanel } from '../panels/media-panel'
import { TextPanel } from '../panels/text-panel'
import { AudioPanel } from '../panels/audio-panel'
import { CaptionsPanel } from '../panels/captions-panel'
import { CTAPanel } from '../panels/cta-panel'

const navigationItems = [
  { title: 'Media', icon: FolderOpen, panel: OverlayType.MEDIA, type: OverlayType.MEDIA },
  { title: 'Text', icon: Type, panel: OverlayType.TEXT, type: OverlayType.TEXT },
  { title: 'Audio', icon: Music, panel: OverlayType.SOUND, type: OverlayType.SOUND },
  { title: 'Captions', icon: Subtitles, panel: OverlayType.CAPTION, type: OverlayType.CAPTION },
  { title: 'CTA', icon: MousePointerClick, panel: OverlayType.CTA, type: OverlayType.CTA },
]
```

**Step 4: Rewrite `renderActivePanel()` in `default-sidebar.tsx`**

```typescript
const renderActivePanel = () => {
  switch (activePanel) {
    case OverlayType.MEDIA:
      return <MediaPanel userId={userId} adAccountId={adAccountId} onAddMedia={onAddMedia} />
    case OverlayType.TEXT:
      return <TextPanel onAIGenerate={onAIGenerate} isAIGenerating={isAIGenerating} />
    case OverlayType.SOUND:
      return <AudioPanel
        onAIGenerate={onAIGenerate} isAIGenerating={isAIGenerating}
        voices={voices} selectedVoice={selectedVoice} onSelectVoice={onSelectVoice}
        onGenerateVoiceover={onGenerateVoiceover} isGeneratingVoiceover={isGeneratingVoiceover}
        hasVoiceover={hasVoiceover} onAddMusic={onAddMusic}
      />
    case OverlayType.CAPTION:
      return <CaptionsPanel
        onAIGenerate={onAIGenerate} isAIGenerating={isAIGenerating}
        currentStyle={currentCaptionStyle} onStyleChange={onStyleChange}
      />
    case OverlayType.CTA:
      return <CTAPanel onAIGenerate={onAIGenerate} isAIGenerating={isAIGenerating} onAddCTA={onAddCTA} />
    case OverlayType.SETTINGS:
      return <SettingsPanel />
    default:
      return null
  }
}
```

**Step 5: Update `default-sidebar.tsx` icon sizing**

Make sidebar icons match KillScale's main app icon size. In the icon rendering section, update the icon `className` from `h-4 w-4` (or whatever current size) to `h-5 w-5`. Remove `showIconTitles` text under icons if it makes the strip too wide — just tooltips instead.

**Step 6: Remove Settings from footer**

The hardcoded Settings gear in the footer is not needed for KillScale's use case. Remove it or move to the icon strip if still needed.

**Step 7: Update video editor page**

In `app/dashboard/creative-studio/video-editor/page.tsx`:

1. **Remove header buttons:** Delete the "Add Voice" dropdown, "Add Media" button. Keep Versions, Save, Library, Export (in that order).

2. **Move voiceover state to props:** The existing `selectedVoice`, `onGenerateVoiceover`, etc. state stays in the page but gets passed down as new props to `<ReactVideoEditor>`:

```typescript
<ReactVideoEditor
  // ... existing props
  // New panel props
  voices={VOICE_OPTIONS}
  selectedVoice={selectedVoice}
  onSelectVoice={setSelectedVoice}
  onGenerateVoiceover={handleGenerateVoiceover}
  isGeneratingVoiceover={isGeneratingVoiceover}
  hasVoiceover={hasVoiceover}
  onAddCTA={handleAddCTA}
  onAddMedia={handleAddMedia}
  onAddMusic={handleAddMusic}
  onStyleChange={handleStyleChange}
  currentCaptionStyle={currentCaptionStyle}
  userId={user?.id}
  adAccountId={currentAccountId}
/>
```

3. **Add new handler functions:** `handleAddCTA`, `handleAddMedia`, `handleAddMusic`, `handleStyleChange` — these dispatch overlays via `ks-inject-overlays` or update the overlay config.

4. **Update `disabledPanels`** — remove the current list (we're replacing all panels anyway). Or set to empty `[]`.

5. **Reorder header buttons:** Versions | Save | Library | Export (rightmost).

**Step 8: Build verify**

Run: `rm -rf .next && npm run build`
Expected: Clean build, no type errors.

**Step 9: Commit**

```bash
git add lib/rve/types/index.ts lib/rve/components/shared/default-sidebar.tsx lib/rve/components/react-video-editor.tsx app/dashboard/creative-studio/video-editor/page.tsx
git commit -m "feat: wire Creatify-style sidebar panels into video editor"
```

---

### Task 9: Add Caption Style Types to Remotion

**Files:**
- Modify: `remotion/types.ts`
- Modify: `lib/rve-bridge.ts`

**Context:** Add the two new caption style presets (`wordflash`, `promopunch`) to the `OverlayStyle` type so they can be stored and rendered. The rve-bridge needs to handle them in the conversion.

**Step 1: Update OverlayStyle type**

In `remotion/types.ts`, find the `OverlayStyle` type and add the new values:

```typescript
export type OverlayStyle = 'capcut' | 'minimal' | 'bold' | 'clean' | 'wordflash' | 'promopunch'
```

**Step 2: Add style presets to AdOverlay**

In `remotion/AdOverlay.tsx`, add entries to `STYLE_PRESETS` for `wordflash` and `promopunch`:

```typescript
wordflash: {
  hook: { bg: 'transparent', text: '#facc15', highlight: '#facc15' },
  caption: { bg: 'transparent', text: '#ffffff', highlight: '#facc15' },
  cta: { bg: '#facc15', text: '#000000' },
  font: 'Inter',
},
promopunch: {
  hook: { bg: 'rgba(0,0,0,0.6)', text: '#ffffff', highlight: '#ef4444' },
  caption: { bg: 'rgba(0,0,0,0.6)', text: '#ffffff', highlight: '#ef4444' },
  cta: { bg: '#ef4444', text: '#ffffff' },
  font: 'Inter',
},
```

**Step 3: Build verify and commit**

```bash
rm -rf .next && npm run build
git add remotion/types.ts remotion/AdOverlay.tsx lib/rve-bridge.ts
git commit -m "feat: add wordflash and promopunch caption style presets"
```

---

### Task 10: Visual Polish and Build Verify

**Files:**
- Modify: `lib/rve/components/shared/default-sidebar.tsx` (icon sizing, tooltip styling)
- Modify: `app/dashboard/creative-studio/video-editor/page.tsx` (header cleanup)

**Context:** Final pass to ensure the sidebar icon sizing matches the main app, tooltips work, the header is clean with the right button order, and everything builds.

**Step 1: Verify icon sizing**

In `default-sidebar.tsx`, ensure all sidebar nav icons use `className="h-5 w-5"` to match the main app sidebar. Verify tooltips appear on hover (not inline labels — cleaner like Creatify).

**Step 2: Verify header button order**

In the page header, ensure the right side reads left-to-right: Versions | Save | Library | Export.

**Step 3: Test full flow in dev server**

Run: `npm run dev`
Navigate to video editor with a job ID.
Verify:
- No main KillScale sidebar visible
- 5 icon sidebar on left (Media, Text, Audio, Captions, CTA)
- Clicking each icon opens its flyout panel
- Clicking again closes it
- AI section visible in each panel with sparkle icon
- Header shows: Back | Name | Versions | Save | Library | Export
- Timeline at bottom (RVE's existing timeline, unchanged)

**Step 4: Final build**

Run: `rm -rf .next && npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: video editor Creatify-style redesign complete"
```
