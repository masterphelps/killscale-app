'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import type { OverlayConfig, VideoComposition } from '@/remotion/types'
import { OverlayType } from '@/lib/rve/types'
import type { Overlay, ClipOverlay } from '@/lib/rve/types'
import { ReactVideoEditor, type SiblingClip } from '@/lib/rve/components/react-video-editor'
import { stubRenderer } from '@/lib/rve/stub-renderer'
import { overlayConfigToRVEOverlays, rveOverlaysToOverlayConfig } from '@/lib/rve-bridge'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import type { AdConcept } from '@/lib/video-prompt-templates'
import {
  ArrowLeft,
  Save,
  Loader2,
  Download,
  CheckCircle,
  History,
  ChevronDown,
  Mic,
  Megaphone,
} from 'lucide-react'

const VOICES = [
  { id: 'onyx', label: 'Onyx', desc: 'Deep, authoritative' },
  { id: 'nova', label: 'Nova', desc: 'Warm, friendly' },
  { id: 'alloy', label: 'Alloy', desc: 'Neutral, balanced' },
  { id: 'echo', label: 'Echo', desc: 'Smooth, clear' },
  { id: 'fable', label: 'Fable', desc: 'Expressive, storytelling' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Bright, energetic' },
] as const

const FPS = 30

export default function VideoEditorPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const searchParams = useSearchParams()
  const router = useRouter()
  const jobId = searchParams.get('jobId')
  const compositionIdParam = searchParams.get('compositionId')

  // Composition state
  const [compositionId, setCompositionId] = useState<string | null>(compositionIdParam)
  const [isComposition, setIsComposition] = useState(!!compositionIdParam)

  // Video source data
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [durationSec, setDurationSec] = useState(10)
  const [initialOverlays, setInitialOverlays] = useState<Overlay[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Back-navigation context (canvas + concept index from job)
  const [backCanvasId, setBackCanvasId] = useState<string | null>(null)
  const [backConceptIndex, setBackConceptIndex] = useState<number | null>(null)

  // Save state
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)

  // Version history
  const [versions, setVersions] = useState<Array<{
    id: string; version: number; overlay_config: OverlayConfig; render_status: string; created_at: string
  }>>([])
  const [activeVersion, setActiveVersion] = useState<number | null>(null)
  const [showVersions, setShowVersions] = useState(false)

  // AI state
  const [isGenerating, setIsGenerating] = useState(false)
  const [cachedTranscript, setCachedTranscript] = useState<{
    text: string; words: { word: string; start: number; end: number }[]
  } | null>(null)

  // Script prompt for TTS voiceover
  const [scriptPrompt, setScriptPrompt] = useState<string | null>(null)

  // Voiceover state
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('onyx')
  const [showVoiceMenu, setShowVoiceMenu] = useState(false)
  const [hasVoiceover, setHasVoiceover] = useState(false)

  // Launch Wizard state
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [wizardCopy, setWizardCopy] = useState<{ primaryText?: string; headline?: string; description?: string } | null>(null)
  const [isPreparingLaunch, setIsPreparingLaunch] = useState(false)

  // Sibling concept videos (from same canvas)
  const [siblingClips, setSiblingClips] = useState<SiblingClip[]>([])
  const [appendedSiblings, setAppendedSiblings] = useState<Set<string>>(new Set())
  const currentOverlaysRef = useRef<Overlay[]>([])
  const siblingClipsRef = useRef<SiblingClip[]>([])

  // Track existing overlay config for iterative AI generation
  const overlayConfigRef = useRef<OverlayConfig | undefined>(undefined)

  // Track canvas info for composition creation
  const canvasIdRef = useRef<string | null>(null)

  // Load composition data
  useEffect(() => {
    if (!compositionIdParam || !user?.id) return

    const loadComposition = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/creative-studio/video-composition?compositionId=${compositionIdParam}&userId=${user.id}`)
        const data = await res.json()

        if (!data.composition) {
          console.error('Composition not found')
          setIsLoading(false)
          return
        }

        const comp: VideoComposition = data.composition
        setCompositionId(comp.id)
        setIsComposition(true)
        setBackCanvasId(comp.canvasId)
        canvasIdRef.current = comp.canvasId

        // Load source jobs to get video URLs
        const jobsRes = await fetch('/api/creative-studio/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, canvasId: comp.canvasId }),
        })
        const jobsData = await jobsRes.json()
        const allJobs = jobsData.jobs || []

        // Find the first source job for primary video
        const sourceJobs = comp.sourceJobIds
          .map((sid: string) => allJobs.find((j: any) => j.id === sid))
          .filter(Boolean)

        if (sourceJobs.length === 0) {
          console.error('No source jobs found for composition')
          setIsLoading(false)
          return
        }

        const primaryJob = sourceJobs[0]
        const primaryVideoUrl = primaryJob.raw_video_url
        const primaryDuration = primaryJob.duration_seconds || 10

        if (!primaryVideoUrl) {
          setIsLoading(false)
          return
        }

        // Total duration from composition or calculate
        const totalDuration = comp.durationSeconds || sourceJobs.reduce((sum: number, j: any) => sum + (j.duration_seconds || 8), 0)

        setVideoUrl(primaryVideoUrl)
        setDurationSec(totalDuration)

        if (comp.overlayConfig) {
          overlayConfigRef.current = comp.overlayConfig
          if (comp.overlayConfig.voiceoverUrl) {
            setHasVoiceover(true)
          }
        }

        // Convert the overlay config to RVE overlays
        const rveOverlays = overlayConfigToRVEOverlays(
          comp.overlayConfig || { style: 'clean' },
          primaryVideoUrl,
          primaryDuration,
          FPS,
        )

        // For multi-clip compositions, we need to add the appended clips
        // The appendedClips from overlayConfig should be handled by overlayConfigToRVEOverlays
        setInitialOverlays(rveOverlays)

        // Mark source jobs as appended (except the first which is the primary)
        const appendedSet = new Set<string>()
        for (let i = 1; i < comp.sourceJobIds.length; i++) {
          appendedSet.add(comp.sourceJobIds[i])
        }
        setAppendedSiblings(appendedSet)

        // Load sibling clips from same canvas
        loadSiblings(comp.canvasId, sourceJobs[0].id)

        // Load versions
        loadCompositionVersions()
      } catch (err) {
        console.error('Failed to load composition:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadComposition()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionIdParam, user?.id])

  // Load video job data — single GET request (overlay_config now included in GET response)
  useEffect(() => {
    if (!jobId || !user?.id || compositionIdParam) return

    const loadJob = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/creative-studio/video-status?jobId=${jobId}&userId=${user.id}`)
        const data = await res.json()

        const rawVideoUrl: string | null = data.raw_video_url || null
        const jobDuration = data.duration_seconds || 10
        const overlayConfig: OverlayConfig | undefined = data.overlay_config

        if (overlayConfig) {
          overlayConfigRef.current = overlayConfig
          if (overlayConfig.voiceoverUrl) {
            setHasVoiceover(true)
          }
        }
        if (data.prompt) {
          setScriptPrompt(data.prompt)
        }

        if (rawVideoUrl) {
          setVideoUrl(rawVideoUrl)
          setDurationSec(jobDuration)

          // Convert OverlayConfig to RVE overlays
          const rveOverlays = overlayConfigToRVEOverlays(
            overlayConfig || { style: 'clean' },
            rawVideoUrl,
            jobDuration,
            FPS,
          )
          setInitialOverlays(rveOverlays)
        }

        // Load versions
        loadVersions()

        // Load sibling concept videos if this job came from a canvas
        if (data.canvas_id) {
          setBackCanvasId(data.canvas_id)
          canvasIdRef.current = data.canvas_id
          if (data.ad_index != null) setBackConceptIndex(data.ad_index)
          loadSiblings(data.canvas_id, jobId!)
        }
      } catch (err) {
        console.error('Failed to load video:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadJob()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, user?.id])

  // Load overlay versions (job mode)
  const loadVersions = useCallback(async () => {
    if (!jobId || !user?.id) return
    try {
      const res = await fetch(`/api/creative-studio/overlay-versions?videoJobId=${jobId}&userId=${user.id}`)
      const data = await res.json()
      if (data.versions) {
        setVersions(data.versions)
      }
    } catch (err) {
      console.error('Failed to load versions:', err)
    }
  }, [jobId, user?.id])

  // Load overlay versions (composition mode)
  const loadCompositionVersions = useCallback(async () => {
    const cid = compositionIdParam || compositionId
    if (!cid || !user?.id) return
    try {
      const res = await fetch(`/api/creative-studio/overlay-versions?compositionId=${cid}&userId=${user.id}`)
      const data = await res.json()
      if (data.versions) {
        setVersions(data.versions)
      }
    } catch (err) {
      console.error('Failed to load composition versions:', err)
    }
  }, [compositionIdParam, compositionId, user?.id])

  // Load sibling concept videos from the same canvas
  const loadSiblings = useCallback(async (canvasId: string, currentJobId: string) => {
    if (!user?.id) return
    try {
      // Fetch all jobs from this canvas (includes overlay_config when canvasId filter is used)
      const jobsRes = await fetch('/api/creative-studio/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, canvasId }),
      })
      const jobsData = await jobsRes.json()

      // Fetch canvas for concept titles
      const canvasRes = await fetch(`/api/creative-studio/video-canvas?userId=${user.id}&canvasId=${canvasId}`)
      const canvasData = await canvasRes.json()
      const concepts: Array<{ title?: string; conceptTitle?: string }> = canvasData.canvas?.concepts || []

      // Filter to completed siblings (exclude current job)
      const siblings: SiblingClip[] = (jobsData.jobs || [])
        .filter((j: any) => j.id !== currentJobId && j.status === 'complete' && j.raw_video_url)
        .map((j: any) => {
          const conceptIdx = j.ad_index ?? 0
          const concept = concepts[conceptIdx]
          return {
            jobId: j.id,
            adIndex: conceptIdx,
            conceptTitle: concept?.title || concept?.conceptTitle || j.product_name || `Concept ${conceptIdx + 1}`,
            rawVideoUrl: j.raw_video_url,
            durationSeconds: j.duration_seconds || 8,
            overlayConfig: j.overlay_config || undefined,
          }
        })

      setSiblingClips(siblings)
    } catch (err) {
      console.error('Failed to load siblings:', err)
    }
  }, [user?.id])

  // Keep siblingClipsRef in sync
  useEffect(() => { siblingClipsRef.current = siblingClips }, [siblingClips])

  // Keep currentOverlaysRef in sync via ks-overlays-raw events
  // Also sync appendedSiblings: re-enable "Add" when a clip is deleted from the timeline
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ overlays: Overlay[] }>
      if (customEvent.detail?.overlays) {
        const overlays = customEvent.detail.overlays
        currentOverlaysRef.current = overlays

        // Build set of video URLs currently on the timeline
        const timelineUrls = new Set<string>()
        for (const o of overlays) {
          if (o.type === OverlayType.VIDEO && 'src' in o) {
            timelineUrls.add((o as ClipOverlay).src)
          }
        }

        // Sync appendedSiblings: only mark siblings whose video URL is on the timeline
        const siblings = siblingClipsRef.current
        if (siblings.length > 0) {
          const onTimeline = new Set<string>()
          for (const s of siblings) {
            if (timelineUrls.has(s.rawVideoUrl)) {
              onTimeline.add(s.jobId)
            }
          }
          setAppendedSiblings(prev => {
            // Only update if different to avoid unnecessary re-renders
            if (prev.size !== onTimeline.size || ![...Array.from(onTimeline)].every(id => prev.has(id))) {
              return onTimeline
            }
            return prev
          })
        }
      }
    }
    window.addEventListener('ks-overlays-raw', handler)
    return () => window.removeEventListener('ks-overlays-raw', handler)
  }, [])

  // Append a sibling concept video to the timeline
  const handleAppendSibling = useCallback(async (sibling: SiblingClip) => {
    const current = currentOverlaysRef.current
    if (!current.length) return

    // Find the row and latest end frame of existing VIDEO overlays
    let lastEndFrame = 0
    let videoRow = 5
    for (const o of current) {
      if (o.type === OverlayType.VIDEO) {
        videoRow = o.row
        const end = o.from + o.durationInFrames
        if (end > lastEndFrame) lastEndFrame = end
      }
    }

    // Create the new clip overlay on the same row as existing videos
    const clipDurationFrames = Math.round(sibling.durationSeconds * FPS)
    const newClip: ClipOverlay = {
      id: Date.now(),
      type: OverlayType.VIDEO,
      content: sibling.rawVideoUrl,
      src: sibling.rawVideoUrl,
      from: lastEndFrame,
      durationInFrames: clipDurationFrames,
      left: 0,
      top: 0,
      width: 1080,
      height: 1920,
      row: videoRow,
      isDragging: false,
      rotation: 0,
      styles: { objectFit: 'cover', volume: 1 },
    }

    // If the sibling has an overlay config, convert to RVE overlays and time-shift
    const timeShiftedOverlays: Overlay[] = []
    if (sibling.overlayConfig) {
      const subOverlays = overlayConfigToRVEOverlays(
        sibling.overlayConfig,
        sibling.rawVideoUrl,
        sibling.durationSeconds,
        FPS,
      )
      for (const sub of subOverlays) {
        // Skip the VIDEO overlay (we already have the clip)
        if (sub.type === OverlayType.VIDEO) continue
        // Time-shift to align with the appended clip's position
        sub.from += lastEndFrame
        sub.id = Date.now() + Math.random() * 10000 // unique ID
        timeShiftedOverlays.push(sub)
      }
    }

    // Inject all overlays into the editor
    const allOverlays = [...current, newClip, ...timeShiftedOverlays]
    const event = new CustomEvent('ks-inject-overlays', { detail: { overlays: allOverlays } })
    window.dispatchEvent(event)

    // Rebuild overlayConfigRef from the full overlay set so save/composition
    // captures the sibling's hook, captions, and CTA (the OverlayBridge skips
    // emission during injection, so we must update the ref manually)
    const updatedConfig = rveOverlaysToOverlayConfig(allOverlays, overlayConfigRef.current)
    overlayConfigRef.current = updatedConfig

    // Mark this sibling as appended
    setAppendedSiblings(prev => new Set(prev).add(sibling.jobId))

    // ── Create or update composition ──
    if (!user?.id || !currentAccountId) return
    const canvasId = canvasIdRef.current
    if (!canvasId) return

    if (!compositionId && !isComposition) {
      // First sibling appended → create a new composition
      try {
        // Build source job IDs: current job + new sibling
        const sourceJobIds = [jobId, sibling.jobId].filter(Boolean)
        const totalDuration = durationSec + sibling.durationSeconds

        // Build a title from concept indices
        const currentConcept = backConceptIndex != null ? backConceptIndex + 1 : 1
        const siblingConcept = sibling.adIndex + 1
        const title = `Concepts ${currentConcept} + ${siblingConcept}`

        const res = await fetch('/api/creative-studio/video-composition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            canvasId,
            adAccountId: currentAccountId,
            sourceJobIds,
            overlayConfig: overlayConfigRef.current || { style: 'clean' },
            title,
            durationSeconds: totalDuration,
          }),
        })
        const data = await res.json()
        if (data.compositionId) {
          setCompositionId(data.compositionId)
          setIsComposition(true)
          // Reset version history for the new composition
          setVersions([])
          setActiveVersion(null)
          // Update URL without reload
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('jobId')
          newUrl.searchParams.set('compositionId', data.compositionId)
          window.history.replaceState({}, '', newUrl.toString())
        }
      } catch (err) {
        console.error('Failed to create composition:', err)
      }
    } else if (compositionId) {
      // Already a composition → add the new sibling to sourceJobIds
      try {
        const res = await fetch('/api/creative-studio/video-composition', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            compositionId,
            userId: user.id,
            sourceJobIds: [...Array.from(appendedSiblings), sibling.jobId, jobId].filter(Boolean).map(String),
          }),
        })
        await res.json()
      } catch (err) {
        console.error('Failed to update composition:', err)
      }
    }
  }, [jobId, user?.id, currentAccountId, compositionId, isComposition, durationSec, backConceptIndex, appendedSiblings])

  // AI generation handler — passed to RVE sidebar
  const handleAIGenerate = useCallback(async (prompt: string) => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const currentConfig = overlayConfigRef.current
      const hasExisting = currentConfig?.hook || currentConfig?.captions?.length || currentConfig?.cta
      const res = await fetch('/api/creative-studio/generate-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: prompt,
          durationSeconds: durationSec,
          currentConfig: hasExisting ? currentConfig : undefined,
          videoUrl: !cachedTranscript ? videoUrl : undefined,
          transcript: cachedTranscript || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      if (data.transcript && !cachedTranscript) {
        setCachedTranscript(data.transcript)
      }
      if (data.overlayConfig) {
        overlayConfigRef.current = data.overlayConfig
        // We need to inject the new overlays into the editor.
        // This is done via the AIOverlayInjector component below.
        setAiGeneratedConfig(data.overlayConfig)
      }
    } catch (err) {
      console.error('Generate overlay failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating, durationSec, cachedTranscript, videoUrl])

  // Voiceover generation handler
  const handleGenerateVoiceover = useCallback(async () => {
    const effectiveJobId = jobId || compositionId
    if (!effectiveJobId || !user?.id || isGeneratingVoiceover) return
    setIsGeneratingVoiceover(true)
    try {
      // Extract current caption text from the live editor state
      const currentConfig = overlayConfigRef.current
      const captionTexts = currentConfig?.captions?.map(c => c.text).filter(Boolean)
      const scriptText = captionTexts && captionTexts.length > 0
        ? captionTexts.join('. ')
        : undefined

      const res = await fetch('/api/creative-studio/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: effectiveJobId, userId: user.id, voice: selectedVoice, scriptText }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      if (data.voiceoverUrl) {
        // Update overlay config with voiceover
        const currentConfig = overlayConfigRef.current || { style: 'clean' as const }
        const updatedConfig = { ...currentConfig, voiceoverUrl: data.voiceoverUrl }
        overlayConfigRef.current = updatedConfig
        setHasVoiceover(true)
        // Inject updated overlays into editor (with voiceover track + muted video)
        setAiGeneratedConfig(updatedConfig)
      }
    } catch (err) {
      console.error('Voiceover generation failed:', err)
    } finally {
      setIsGeneratingVoiceover(false)
      setShowVoiceMenu(false)
    }
  }, [jobId, compositionId, user?.id, selectedVoice, isGeneratingVoiceover])

  // Launch as ad — fetch canvas concept's adCopy + create Creative from video
  const handleLaunchAsAd = useCallback(async () => {
    if (!backCanvasId || !user?.id || !videoUrl || !currentAccountId) return
    setIsPreparingLaunch(true)
    try {
      // Fetch canvas data to get the concept's adCopy
      const canvasRes = await fetch(`/api/creative-studio/video-canvas?userId=${user.id}&canvasId=${backCanvasId}`)
      const canvasData = await canvasRes.json()
      const concepts: AdConcept[] = canvasData.canvas?.concepts || []
      const conceptIdx = backConceptIndex ?? 0
      const concept = concepts[conceptIdx]

      // Download video blob to create a File for the wizard
      const videoRes = await fetch(videoUrl)
      const videoBlob = await videoRes.blob()
      const videoFile = new File([videoBlob], 'video-ad.mp4', { type: 'video/mp4' })

      const creative: Creative = {
        file: videoFile,
        preview: videoUrl,
        type: 'video',
        uploaded: false,
      }

      setWizardCreatives([creative])
      setWizardCopy(concept?.adCopy ? {
        primaryText: concept.adCopy.primaryText,
        headline: concept.adCopy.headline,
        description: concept.adCopy.description,
      } : null)
      setShowLaunchWizard(true)
    } catch (err) {
      console.error('Failed to prepare ad launch:', err)
    } finally {
      setIsPreparingLaunch(false)
    }
  }, [backCanvasId, backConceptIndex, user?.id, videoUrl, currentAccountId])

  // State for AI-generated config that needs to be injected into RVE
  const [aiGeneratedConfig, setAiGeneratedConfig] = useState<OverlayConfig | null>(null)

  // Stable project ID — set once on mount so editor never remounts when transitioning to composition
  const [stableProjectId] = useState(() => compositionIdParam ? `comp-${compositionIdParam}` : `video-${jobId}`)
  // Effective ID for save operations
  const effectiveJobId = jobId

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    )
  }

  if (!videoUrl || !initialOverlays) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6">
        <p className="text-zinc-400">No video found. Generate a video first in Video Studio.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] dark rve-editor">
      {/* KillScale Header Bar */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2 border-b border-zinc-800/50 flex-shrink-0 bg-bg-dark z-10">
        <button
          onClick={() => {
            if (backCanvasId) {
              const params = new URLSearchParams({ canvasId: backCanvasId })
              if (backConceptIndex != null) params.set('conceptIndex', String(backConceptIndex))
              router.push(`/dashboard/creative-studio/video-studio?${params}`)
            } else {
              router.back()
            }
          }}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {/* Version dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {activeVersion !== null ? `v${activeVersion}` : 'Versions'}
              {versions.length > 0 && <span className="text-zinc-600 ml-0.5">({versions.length})</span>}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showVersions && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
                <button
                  onClick={() => { setActiveVersion(null); setShowVersions(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    activeVersion === null ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  Current (unsaved)
                </button>
                {versions.map(v => (
                  <VersionButton
                    key={v.id}
                    version={v}
                    isActive={activeVersion === v.version}
                    videoUrl={videoUrl}
                    durationSec={durationSec}
                    onLoad={(config) => {
                      overlayConfigRef.current = config
                      setAiGeneratedConfig(config) // Reuse same injection mechanism
                      setActiveVersion(v.version)
                      setShowVersions(false)
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Save to Library */}
          <button
            onClick={async () => {
              if ((!jobId && !compositionId) || !user?.id || !currentAccountId) return
              setIsSavingToLibrary(true)
              try {
                const res = await fetch('/api/creative-studio/save-video-to-library', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ videoJobId: jobId || compositionId, userId: user.id, adAccountId: currentAccountId }),
                })
                const data = await res.json()
                if (data.success) setSavedToLibrary(true)
                else alert(`Failed to save: ${data.error}`)
              } catch (err) {
                console.error('Save to library failed:', err)
              } finally {
                setIsSavingToLibrary(false)
              }
            }}
            disabled={isSavingToLibrary || savedToLibrary}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              savedToLibrary
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 disabled:opacity-50'
            }`}
          >
            {isSavingToLibrary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedToLibrary ? <CheckCircle className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {savedToLibrary ? 'Saved' : 'Library'}
          </button>

          {/* Launch as Ad */}
          {!isComposition && backCanvasId && (
            <button
              onClick={handleLaunchAsAd}
              disabled={isPreparingLaunch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/20 disabled:opacity-50 transition-colors"
            >
              {isPreparingLaunch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
              Create Ad
            </button>
          )}

          {/* Voiceover */}
          <div className="relative">
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                disabled={isGeneratingVoiceover}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  hasVoiceover
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/20 hover:bg-blue-500/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                } disabled:opacity-50`}
              >
                {isGeneratingVoiceover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                {hasVoiceover ? 'Voiceover' : 'Add Voice'}
              </button>
              {showVoiceMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Select Voice</div>
                  {VOICES.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                        selectedVoice === v.id ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className="text-zinc-600 text-[10px]">{v.desc}</span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-800 mt-1 pt-1 px-2 pb-1">
                    <button
                      onClick={handleGenerateVoiceover}
                      disabled={isGeneratingVoiceover}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
                    >
                      {isGeneratingVoiceover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mic className="w-3 h-3" />}
                      {hasVoiceover ? 'Regenerate' : 'Generate'} Voiceover
                    </button>
                  </div>
                </div>
              )}
            </div>

          {/* Save button */}
          <SaveButton
            jobId={effectiveJobId}
            compositionId={compositionId}
            isComposition={isComposition}
            userId={user?.id}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            overlayConfigRef={overlayConfigRef}
            setActiveVersion={setActiveVersion}
            loadVersions={isComposition ? loadCompositionVersions : loadVersions}
          />
        </div>
      </div>

      {/* Full RVE Editor */}
      <div className="flex-1 min-h-0">
        <ReactVideoEditor
          projectId={stableProjectId}
          defaultOverlays={initialOverlays}
          defaultAspectRatio="9:16"
          defaultBackgroundColor="#000000"
          fps={FPS}
          renderer={stubRenderer}
          hideThemeToggle
          defaultTheme="dark"
          showAutosaveStatus={false}
          videoWidth={1080}
          videoHeight={1920}
          sidebarWidth="24rem"
          sidebarIconWidth="3.75rem"
          disabledPanels={[OverlayType.TEMPLATE, OverlayType.LOCAL_DIR, OverlayType.STICKER]}
          isLoadingProject={isLoading}
          onAIGenerate={handleAIGenerate}
          isAIGenerating={isGenerating}
          hasAITranscript={!!cachedTranscript}
          siblingClips={siblingClips}
          onAppendSibling={handleAppendSibling}
          appendedSiblings={appendedSiblings}
        />
      </div>

      {/* AI overlay injector — reads EditorContext inside provider tree */}
      {aiGeneratedConfig && videoUrl && (
        <AIOverlayInjector
          config={aiGeneratedConfig}
          videoUrl={videoUrl}
          durationSec={durationSec}
          fps={FPS}
          onInjected={() => setAiGeneratedConfig(null)}
        />
      )}

      {/* Launch Wizard for creating Meta ads from video */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={async (result) => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)

              if (result?.createdEntity && user?.id) {
                try {
                  await fetch('/api/meta/hydrate-new-entity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: user.id,
                      adAccountId: currentAccountId,
                      entityType: result.createdEntity.entityType,
                      entityId: result.createdEntity.entityId,
                    })
                  })
                } catch (err) {
                  console.warn('[Video Editor] Hydrate failed:', err)
                }
              }
            }}
            onCancel={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)
            }}
            initialEntityType="ad"
            preloadedCreatives={wizardCreatives}
            initialCopy={wizardCopy || undefined}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Component that lives inside the RVE provider tree and injects
 * AI-generated overlays into the editor.
 * Note: This must be rendered as a child of ReactVideoEditor
 * but ReactVideoEditor doesn't accept children. Instead, we use
 * a portal-like approach — this component is a sibling but accesses
 * the same context because it's rendered inside the provider wrapper.
 *
 * Actually — ReactVideoEditor wraps its children in the provider.
 * Since this is rendered OUTSIDE the provider, we need a different approach.
 * We'll use a ref callback pattern instead.
 */
function AIOverlayInjector({
  config,
  videoUrl,
  durationSec,
  fps,
  onInjected,
}: {
  config: OverlayConfig
  videoUrl: string
  durationSec: number
  fps: number
  onInjected: () => void
}) {
  // Since we can't access EditorContext from outside ReactVideoEditor,
  // we need to use a workaround. The cleanest approach is to update
  // the defaultOverlays, but those are only read on mount.
  // Instead, we'll dispatch a custom event that a listener inside RVE can catch.
  useEffect(() => {
    const overlays = overlayConfigToRVEOverlays(config, videoUrl, durationSec, fps)
    const event = new CustomEvent('ks-inject-overlays', { detail: { overlays } })
    window.dispatchEvent(event)
    onInjected()
  }, [config, videoUrl, durationSec, fps, onInjected])

  return null
}

/**
 * Save button that reads overlays from EditorContext.
 * Needs to be outside the RVE tree, so it reads from ref instead.
 */
function SaveButton({
  jobId,
  compositionId,
  isComposition,
  userId,
  isSaving,
  setIsSaving,
  overlayConfigRef,
  setActiveVersion,
  loadVersions,
}: {
  jobId: string | null
  compositionId: string | null
  isComposition: boolean
  userId: string | undefined
  isSaving: boolean
  setIsSaving: (v: boolean) => void
  overlayConfigRef: React.MutableRefObject<OverlayConfig | undefined>
  setActiveVersion: (v: number) => void
  loadVersions: () => void
}) {
  // We also listen for overlay changes via the custom event to keep the ref in sync
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ overlayConfig: OverlayConfig }>
      if (customEvent.detail?.overlayConfig) {
        overlayConfigRef.current = customEvent.detail.overlayConfig
      }
    }
    window.addEventListener('ks-overlay-changed', handler)
    return () => window.removeEventListener('ks-overlay-changed', handler)
  }, [overlayConfigRef])

  const handleSave = async () => {
    if ((!jobId && !compositionId) || !userId || isSaving) return
    setIsSaving(true)
    try {
      const config = overlayConfigRef.current || { style: 'clean' as const }

      // Build request body based on mode
      const body: Record<string, any> = { overlayConfig: config, userId }
      if (isComposition && compositionId) {
        body.compositionId = compositionId
      } else if (jobId) {
        body.videoJobId = jobId
      }

      const res = await fetch('/api/creative-studio/render-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.status === 'saved') {
        setActiveVersion(data.version)
        loadVersions()
      } else if (data.error) {
        alert(`Save failed: ${data.error}`)
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <button
      onClick={handleSave}
      disabled={isSaving}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
    >
      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      Save
    </button>
  )
}

/**
 * Version load button
 */
function VersionButton({
  version,
  isActive,
  videoUrl,
  durationSec,
  onLoad,
}: {
  version: { id: string; version: number; overlay_config: OverlayConfig; created_at: string }
  isActive: boolean
  videoUrl: string
  durationSec: number
  onLoad: (config: OverlayConfig) => void
}) {
  return (
    <button
      onClick={() => onLoad(version.overlay_config)}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
        isActive ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-zinc-800'
      }`}
    >
      v{version.version} &middot; {new Date(version.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    </button>
  )
}
