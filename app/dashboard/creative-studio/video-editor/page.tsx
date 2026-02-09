'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { Player, type PlayerRef } from '@remotion/player'
import { AdOverlay } from '@/remotion/AdOverlay'
import type { OverlayConfig, HookOverlay, CaptionOverlay, CTAOverlay, GraphicOverlay, OverlayStyle } from '@/remotion/types'
import {
  Play,
  Pause,
  RotateCcw,
  Type,
  MessageSquare,
  MousePointerClick,
  Image as ImageIcon,
  Palette,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  Loader2,
  ArrowLeft,
  Volume2,
  VolumeX,
  History,
  Download,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FPS = 30
const STYLE_OPTIONS: { value: OverlayStyle; label: string }[] = [
  { value: 'capcut', label: 'CapCut' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
  { value: 'clean', label: 'Clean' },
]

const ANIMATION_OPTIONS = [
  { value: 'pop' as const, label: 'Pop (Spring)' },
  { value: 'fade' as const, label: 'Fade In' },
  { value: 'slide' as const, label: 'Slide Up' },
]

const POSITION_OPTIONS = [
  { value: 'top_left' as const, label: 'Top Left' },
  { value: 'top_right' as const, label: 'Top Right' },
  { value: 'bottom_left' as const, label: 'Bottom Left' },
  { value: 'bottom_right' as const, label: 'Bottom Right' },
  { value: 'center' as const, label: 'Center' },
]

export default function VideoEditorPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')

  const playerRef = useRef<PlayerRef>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isMuted, setIsMuted] = useState(true)

  // Video source
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Overlay config
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    style: 'capcut',
    brandColor: '#10B981',
    accentColor: '#6366F1',
  })

  // Panel open states
  const [openPanel, setOpenPanel] = useState<string | null>('hook')

  // Version history
  const [versions, setVersions] = useState<Array<{ id: string; version: number; overlay_config: OverlayConfig; render_status: string; created_at: string }>>([])
  const [activeVersion, setActiveVersion] = useState<number | null>(null)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)

  // Save to library
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)
  const [videoStyle, setVideoStyle] = useState('')

  // Load video job data
  useEffect(() => {
    if (!jobId || !user?.id) return

    const loadJob = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/creative-studio/video-status?jobId=${jobId}&userId=${user.id}`)
        const data = await res.json()
        if (data.raw_video_url) {
          setVideoUrl(data.raw_video_url)
        }
        // If job has overlay config, load it
        // We'd fetch full job data here
        const jobRes = await fetch('/api/creative-studio/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId }),
        })
        const jobData = await jobRes.json()
        const job = (jobData.jobs || []).find((j: any) => j.id === jobId)
        if (job) {
          setDurationSec(job.duration_seconds || 10)
          setVideoStyle(job.video_style || '')
          if (job.overlay_config) {
            setOverlayConfig(job.overlay_config)
          }
        }

        // Load version history
        loadVersions()
      } catch (err) {
        console.error('Failed to load video:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadJob()
  }, [jobId, user?.id, currentAccountId])

  // Track current frame
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const handler = () => {
      setCurrentFrame(player.getCurrentFrame())
    }
    player.addEventListener('frameupdate', handler)
    player.addEventListener('play', () => setIsPlaying(true))
    player.addEventListener('pause', () => setIsPlaying(false))

    return () => {
      player.removeEventListener('frameupdate', handler)
    }
  }, [videoUrl])

  const totalFrames = useMemo(() => Math.round(durationSec * FPS), [durationSec])
  const currentTimeSec = currentFrame / FPS

  // Overlay update helpers
  const updateHook = useCallback((hook: HookOverlay | undefined) => {
    setOverlayConfig(prev => ({ ...prev, hook }))
  }, [])

  const updateCTA = useCallback((cta: CTAOverlay | undefined) => {
    setOverlayConfig(prev => ({ ...prev, cta }))
  }, [])

  const updateCaptions = useCallback((captions: CaptionOverlay[]) => {
    setOverlayConfig(prev => ({ ...prev, captions }))
  }, [])

  const updateGraphics = useCallback((graphics: GraphicOverlay[]) => {
    setOverlayConfig(prev => ({ ...prev, graphics }))
  }, [])

  // Load overlay versions
  const loadVersions = useCallback(async () => {
    if (!jobId || !user?.id) return
    setIsLoadingVersions(true)
    try {
      const res = await fetch(`/api/creative-studio/overlay-versions?videoJobId=${jobId}&userId=${user.id}`)
      const data = await res.json()
      if (data.versions) {
        setVersions(data.versions)
      }
    } catch (err) {
      console.error('Failed to load versions:', err)
    } finally {
      setIsLoadingVersions(false)
    }
  }, [jobId, user?.id])

  // Load a specific version's overlay config
  const loadVersion = useCallback((version: { version: number; overlay_config: OverlayConfig }) => {
    setOverlayConfig(version.overlay_config)
    setActiveVersion(version.version)
  }, [])

  // Save to media library
  const handleSaveToLibrary = useCallback(async () => {
    if (!jobId || !user?.id || !currentAccountId) return
    setIsSavingToLibrary(true)
    try {
      const res = await fetch('/api/creative-studio/save-video-to-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoJobId: jobId,
          userId: user.id,
          adAccountId: currentAccountId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSavedToLibrary(true)
      } else {
        alert(`Failed to save: ${data.error}`)
      }
    } catch (err) {
      console.error('Save to library failed:', err)
    } finally {
      setIsSavingToLibrary(false)
    }
  }, [jobId, user?.id, currentAccountId])

  // Playback controls
  const togglePlay = () => {
    playerRef.current?.toggle()
  }

  const seekToStart = () => {
    playerRef.current?.seekTo(0)
    playerRef.current?.pause()
  }

  const seekTo = (sec: number) => {
    playerRef.current?.seekTo(Math.round(sec * FPS))
  }

  // Save/render
  const handleSave = useCallback(async () => {
    if (!jobId || !user?.id) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/creative-studio/render-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoJobId: jobId,
          overlayConfig,
          userId: user.id,
        }),
      })
      const data = await res.json()
      if (data.status === 'saved') {
        setActiveVersion(data.version)
        loadVersions() // Refresh version list
      } else if (data.error) {
        alert(`Save failed: ${data.error}`)
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [jobId, overlayConfig, user?.id, loadVersions])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    )
  }

  if (!videoUrl) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6">
        <p className="text-zinc-400">No video found. Generate a video first in Video Studio.</p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AdOverlayComp = AdOverlay as any

  return (
    <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-4">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOverlayConfig({ style: overlayConfig.style, brandColor: overlayConfig.brandColor, accentColor: overlayConfig.accentColor })}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={handleSaveToLibrary}
            disabled={isSavingToLibrary || savedToLibrary}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              savedToLibrary
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 disabled:opacity-50'
            )}
          >
            {isSavingToLibrary ? <Loader2 className="w-4 h-4 animate-spin" /> : savedToLibrary ? <CheckCircle className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {savedToLibrary ? 'Saved' : 'Save to Library'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Overlay
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ─── Left: Preview Player ─────────────────────────────────── */}
        <div>
          <div className="bg-black rounded-xl overflow-hidden relative" style={{ maxHeight: '70vh' }}>
            <div className="mx-auto" style={{ aspectRatio: '9/16', maxHeight: '65vh' }}>
              <Player
                ref={playerRef}
                component={AdOverlayComp}
                durationInFrames={totalFrames}
                fps={FPS}
                compositionWidth={1080}
                compositionHeight={1920}
                style={{ width: '100%', height: '100%' }}
                inputProps={{
                  videoUrl,
                  durationInSeconds: durationSec,
                  overlayConfig,
                }}
              />
            </div>
          </div>

          {/* Playback controls */}
          <div className="mt-3 bg-bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-3">
              <button onClick={seekToStart} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={togglePlay} className="p-2 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button
                onClick={() => { setIsMuted(!isMuted); if (playerRef.current) isMuted ? playerRef.current.unmute() : playerRef.current.mute() }}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Scrubber */}
              <div className="flex-1 relative group">
                <input
                  type="range"
                  min={0}
                  max={totalFrames}
                  value={currentFrame}
                  onChange={(e) => seekTo(Number(e.target.value) / FPS)}
                  className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                />
              </div>

              {/* Timecode */}
              <span className="text-xs font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                {currentTimeSec.toFixed(1)}s / {durationSec}s
              </span>
            </div>

            {/* Mini timeline showing overlay positions */}
            <div className="mt-2 h-6 relative bg-zinc-800/50 rounded overflow-hidden">
              {overlayConfig.hook && (
                <div
                  className="absolute top-0 h-2 bg-amber-500/40 rounded-sm"
                  style={{
                    left: `${(overlayConfig.hook.startSec / durationSec) * 100}%`,
                    width: `${((overlayConfig.hook.endSec - overlayConfig.hook.startSec) / durationSec) * 100}%`,
                  }}
                  title="Hook"
                />
              )}
              {overlayConfig.captions?.map((c, i) => (
                <div
                  key={i}
                  className="absolute top-2 h-2 bg-blue-500/40 rounded-sm"
                  style={{
                    left: `${(c.startSec / durationSec) * 100}%`,
                    width: `${((c.endSec - c.startSec) / durationSec) * 100}%`,
                  }}
                  title={`Caption: ${c.text.slice(0, 20)}`}
                />
              ))}
              {overlayConfig.cta && (
                <div
                  className="absolute top-4 h-2 bg-emerald-500/40 rounded-sm"
                  style={{
                    left: `${(overlayConfig.cta.startSec / durationSec) * 100}%`,
                    width: `${((durationSec - overlayConfig.cta.startSec) / durationSec) * 100}%`,
                  }}
                  title="CTA"
                />
              )}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
                style={{ left: `${(currentTimeSec / durationSec) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* ─── Right: Overlay Controls ──────────────────────────────── */}
        <div className="space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Style Preset */}
          <Panel
            title="Style Preset"
            icon={<Palette className="w-4 h-4" />}
            isOpen={openPanel === 'style'}
            onToggle={() => setOpenPanel(openPanel === 'style' ? null : 'style')}
          >
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOverlayConfig(prev => ({ ...prev, style: opt.value }))}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    overlayConfig.style === opt.value
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-border hover:border-zinc-600'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <ColorField label="Brand Color" value={overlayConfig.brandColor || '#10B981'} onChange={v => setOverlayConfig(p => ({ ...p, brandColor: v }))} />
              <ColorField label="Accent Color" value={overlayConfig.accentColor || '#6366F1'} onChange={v => setOverlayConfig(p => ({ ...p, accentColor: v }))} />
            </div>
          </Panel>

          {/* Hook Text */}
          <Panel
            title="Hook Text"
            icon={<Type className="w-4 h-4" />}
            isOpen={openPanel === 'hook'}
            onToggle={() => setOpenPanel(openPanel === 'hook' ? null : 'hook')}
          >
            {overlayConfig.hook ? (
              <div className="space-y-3">
                <TextField label="Line 1" value={overlayConfig.hook.line1} onChange={v => updateHook({ ...overlayConfig.hook!, line1: v })} />
                <TextField label="Line 2 (optional)" value={overlayConfig.hook.line2 || ''} onChange={v => updateHook({ ...overlayConfig.hook!, line2: v || undefined })} />
                <ColorField label="Line 2 Color" value={overlayConfig.hook.line2Color || overlayConfig.brandColor || '#10B981'} onChange={v => updateHook({ ...overlayConfig.hook!, line2Color: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Start (sec)" value={overlayConfig.hook.startSec} onChange={v => updateHook({ ...overlayConfig.hook!, startSec: v })} min={0} max={durationSec} step={0.5} />
                  <NumberField label="End (sec)" value={overlayConfig.hook.endSec} onChange={v => updateHook({ ...overlayConfig.hook!, endSec: v })} min={0} max={durationSec} step={0.5} />
                </div>
                <SelectField label="Animation" value={overlayConfig.hook.animation} options={ANIMATION_OPTIONS} onChange={v => updateHook({ ...overlayConfig.hook!, animation: v as any })} />
                <button onClick={() => { updateHook(undefined); seekTo(0) }} className="text-xs text-red-400 hover:text-red-300">Remove Hook</button>
              </div>
            ) : (
              <button
                onClick={() => updateHook({ line1: 'Your hook text here', startSec: 0, endSec: 3, animation: 'pop' })}
                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
              >
                <Plus className="w-4 h-4" />
                Add Hook Text
              </button>
            )}
          </Panel>

          {/* Captions */}
          <Panel
            title="Captions"
            icon={<MessageSquare className="w-4 h-4" />}
            isOpen={openPanel === 'captions'}
            onToggle={() => setOpenPanel(openPanel === 'captions' ? null : 'captions')}
          >
            {(overlayConfig.captions || []).map((caption, i) => (
              <div key={i} className="mb-3 pb-3 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500">Caption {i + 1}</span>
                  <button
                    onClick={() => {
                      const caps = [...(overlayConfig.captions || [])]
                      caps.splice(i, 1)
                      updateCaptions(caps)
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <TextField label="Text" value={caption.text} onChange={v => {
                  const caps = [...(overlayConfig.captions || [])]
                  caps[i] = { ...caps[i], text: v }
                  updateCaptions(caps)
                }} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NumberField label="Start" value={caption.startSec} onChange={v => {
                    const caps = [...(overlayConfig.captions || [])]
                    caps[i] = { ...caps[i], startSec: v }
                    updateCaptions(caps)
                  }} min={0} max={durationSec} step={0.5} />
                  <NumberField label="End" value={caption.endSec} onChange={v => {
                    const caps = [...(overlayConfig.captions || [])]
                    caps[i] = { ...caps[i], endSec: v }
                    updateCaptions(caps)
                  }} min={0} max={durationSec} step={0.5} />
                </div>
                <TextField label="Highlight Word" value={caption.highlightWord || ''} onChange={v => {
                  const caps = [...(overlayConfig.captions || [])]
                  caps[i] = { ...caps[i], highlightWord: v || undefined }
                  updateCaptions(caps)
                }} />
              </div>
            ))}
            <button
              onClick={() => {
                const lastEnd = overlayConfig.captions?.length
                  ? overlayConfig.captions[overlayConfig.captions.length - 1].endSec
                  : (overlayConfig.hook?.endSec || 0)
                updateCaptions([
                  ...(overlayConfig.captions || []),
                  { text: 'New caption', startSec: lastEnd, endSec: Math.min(lastEnd + 2.5, durationSec) },
                ])
              }}
              className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
            >
              <Plus className="w-4 h-4" />
              Add Caption
            </button>
          </Panel>

          {/* CTA */}
          <Panel
            title="Call to Action"
            icon={<MousePointerClick className="w-4 h-4" />}
            isOpen={openPanel === 'cta'}
            onToggle={() => setOpenPanel(openPanel === 'cta' ? null : 'cta')}
          >
            {overlayConfig.cta ? (
              <div className="space-y-3">
                <TextField label="Button Text" value={overlayConfig.cta.buttonText} onChange={v => updateCTA({ ...overlayConfig.cta!, buttonText: v })} />
                <TextField label="Brand Name" value={overlayConfig.cta.brandName || ''} onChange={v => updateCTA({ ...overlayConfig.cta!, brandName: v || undefined })} />
                <ColorField label="Button Color" value={overlayConfig.cta.buttonColor || overlayConfig.brandColor || '#10B981'} onChange={v => updateCTA({ ...overlayConfig.cta!, buttonColor: v })} />
                <NumberField label="Appears at (sec)" value={overlayConfig.cta.startSec} onChange={v => updateCTA({ ...overlayConfig.cta!, startSec: v })} min={0} max={durationSec} step={0.5} />
                <SelectField label="Animation" value={overlayConfig.cta.animation} options={ANIMATION_OPTIONS} onChange={v => updateCTA({ ...overlayConfig.cta!, animation: v as any })} />
                <button onClick={() => updateCTA(undefined)} className="text-xs text-red-400 hover:text-red-300">Remove CTA</button>
              </div>
            ) : (
              <button
                onClick={() => updateCTA({ buttonText: 'SHOP NOW', startSec: Math.max(0, durationSec - 3), animation: 'pop' })}
                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
              >
                <Plus className="w-4 h-4" />
                Add CTA
              </button>
            )}
          </Panel>

          {/* Graphics */}
          <Panel
            title="Graphics & Logo"
            icon={<ImageIcon className="w-4 h-4" />}
            isOpen={openPanel === 'graphics'}
            onToggle={() => setOpenPanel(openPanel === 'graphics' ? null : 'graphics')}
          >
            {(overlayConfig.graphics || []).map((graphic, i) => (
              <div key={i} className="mb-3 pb-3 border-b border-border/50 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 capitalize">{graphic.type.replace(/_/g, ' ')}</span>
                  <button
                    onClick={() => {
                      const gfx = [...(overlayConfig.graphics || [])]
                      gfx.splice(i, 1)
                      updateGraphics(gfx)
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {(graphic.type === 'lower_third' || graphic.type === 'watermark') && (
                  <TextField label="Text" value={graphic.text || ''} onChange={v => {
                    const gfx = [...(overlayConfig.graphics || [])]
                    gfx[i] = { ...gfx[i], text: v }
                    updateGraphics(gfx)
                  }} />
                )}
                <TextField label="Image URL" value={graphic.imageUrl || ''} onChange={v => {
                  const gfx = [...(overlayConfig.graphics || [])]
                  gfx[i] = { ...gfx[i], imageUrl: v || undefined }
                  updateGraphics(gfx)
                }} />
                <SelectField label="Position" value={graphic.position} options={POSITION_OPTIONS} onChange={v => {
                  const gfx = [...(overlayConfig.graphics || [])]
                  gfx[i] = { ...gfx[i], position: v as any }
                  updateGraphics(gfx)
                }} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NumberField label="Start" value={graphic.startSec} onChange={v => {
                    const gfx = [...(overlayConfig.graphics || [])]
                    gfx[i] = { ...gfx[i], startSec: v }
                    updateGraphics(gfx)
                  }} min={0} max={durationSec} step={0.5} />
                  <NumberField label="End" value={graphic.endSec} onChange={v => {
                    const gfx = [...(overlayConfig.graphics || [])]
                    gfx[i] = { ...gfx[i], endSec: v }
                    updateGraphics(gfx)
                  }} min={0} max={durationSec} step={0.5} />
                </div>
              </div>
            ))}
            <button
              onClick={() => updateGraphics([
                ...(overlayConfig.graphics || []),
                { type: 'logo', position: 'top_right', startSec: 0, endSec: durationSec, opacity: 0.8 },
              ])}
              className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
            >
              <Plus className="w-4 h-4" />
              Add Graphic
            </button>
          </Panel>

          {/* Version History */}
          <Panel
            title={`Version History${versions.length ? ` (${versions.length})` : ''}`}
            icon={<History className="w-4 h-4" />}
            isOpen={openPanel === 'versions'}
            onToggle={() => setOpenPanel(openPanel === 'versions' ? null : 'versions')}
          >
            {isLoadingVersions ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                <span className="text-sm text-zinc-500">Loading...</span>
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-zinc-500 py-2">No saved versions yet. Click &quot;Save Overlay&quot; to create one.</p>
            ) : (
              <div className="space-y-2">
                {/* Current / unsaved */}
                <button
                  onClick={() => { setActiveVersion(null) }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    activeVersion === null
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-zinc-800 text-zinc-400 border border-border hover:border-zinc-600'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Current (unsaved)</span>
                  </div>
                </button>
                {versions.map(v => (
                  <button
                    key={v.id}
                    onClick={() => loadVersion(v)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                      activeVersion === v.version
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-border hover:border-zinc-600'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">v{v.version}</span>
                      <span className="text-xs text-zinc-500">
                        {new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {v.overlay_config.hook ? 'Hook' : ''}{v.overlay_config.captions?.length ? ` · ${v.overlay_config.captions.length} captions` : ''}{v.overlay_config.cta ? ' · CTA' : ''}
                      {!v.overlay_config.hook && !v.overlay_config.captions?.length && !v.overlay_config.cta ? 'Style only' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

// ─── Reusable Panel / Field Components ────────────────────────────────────

function Panel({ title, icon, isOpen, onToggle, children }: {
  title: string
  icon: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-bg-hover transition-colors">
        {icon}
        <span className="text-sm font-medium text-white flex-1 text-left">{title}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-2">
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-dark border border-border rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
      />
    </div>
  )
}

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full bg-bg-dark border border-border rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-500 flex-1">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 bg-bg-dark border border-border rounded px-2 py-1 text-xs text-white font-mono focus:outline-none"
      />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="mt-2">
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-dark border border-border rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
