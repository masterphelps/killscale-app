'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import type { OverlayConfig, VideoComposition } from '@/remotion/types'
import { OverlayType } from '@/lib/rve/types'
import type { Overlay, ClipOverlay } from '@/lib/rve/types'
import { ReactVideoEditor, type SiblingClip } from '@/lib/rve/components/react-video-editor'
import { stubRenderer } from '@/lib/rve/stub-renderer'
import { overlayConfigToRVEOverlays, rveOverlaysToOverlayConfig } from '@/lib/rve-bridge'
import { createKillScaleImageAdaptor, createKillScaleVideoAdaptor } from '@/lib/rve/adaptors/killscale-media-adaptor'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { CreativeStudioMediaModal, type SelectedMediaItem } from '@/components/creative-studio/creative-studio-media-modal'
import { getSrcDuration } from '@/lib/rve/hooks/use-src-duration'
import {
  ArrowLeft,
  Save,
  Loader2,
  Download,
  CheckCircle,
  History,
  ChevronDown,
  Megaphone,
  Library,
  X,
  Film,
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
  const videoUrlParam = searchParams.get('videoUrl') // direct video URL (e.g. from Creative Studio theater)
  const fromParam = searchParams.get('from') // source page for back navigation

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
  const [isDirty, setIsDirty] = useState(false)
  const [pendingSaveAfterName, setPendingSaveAfterName] = useState(false)

  // Export (render with overlays baked in)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPhase, setExportPhase] = useState('')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null)

  // Project naming
  const [projectName, setProjectName] = useState<string | null>(null)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [nameInput, setNameInput] = useState('')

  // Media picker modal (Creative Studio media modal)
  const [showMediaPicker, setShowMediaPicker] = useState(false)

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

  // Video style (e.g. 'ugc' from Ad Studio) — determines back navigation
  const [videoStyle, setVideoStyle] = useState<string | null>(null)

  // Voiceover state
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('onyx')
  const [hasVoiceover, setHasVoiceover] = useState(false)

  // Launch Wizard state
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [wizardCopy, setWizardCopy] = useState<{ primaryText?: string; headline?: string; description?: string } | null>(null)
  const [isPreparingLaunch, setIsPreparingLaunch] = useState(false)

  // Ad copy from job (for Create Ad pre-loading)
  const [adCopy, setAdCopy] = useState<{ primaryText: string; headline: string; description: string } | null>(null)

  // Sibling concept videos (from same canvas)
  const [siblingClips, setSiblingClips] = useState<SiblingClip[]>([])
  const [appendedSiblings, setAppendedSiblings] = useState<Set<string>>(new Set())
  const currentOverlaysRef = useRef<Overlay[]>([])
  const siblingClipsRef = useRef<SiblingClip[]>([])

  // Track existing overlay config for iterative AI generation
  const overlayConfigRef = useRef<OverlayConfig | undefined>(undefined)

  // Track canvas info for composition creation
  const canvasIdRef = useRef<string | null>(null)

  // Media library adaptors — images + videos from user's ad account
  const mediaAdaptors = useMemo(() => {
    if (!user?.id || !currentAccountId) return undefined
    return {
      images: [createKillScaleImageAdaptor(user.id, currentAccountId)],
      video: [createKillScaleVideoAdaptor(user.id, currentAccountId)],
    }
  }, [user?.id, currentAccountId])

  // Load composition data
  useEffect(() => {
    if (!compositionIdParam || !user?.id) return

    const loadComposition = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/creative-studio/video-composition?compositionId=${compositionIdParam}&userId=${user.id}`, { cache: 'no-store' })
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
        if (comp.name) setProjectName(comp.name)
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
        const res = await fetch(`/api/creative-studio/video-status?jobId=${jobId}&userId=${user.id}`, { cache: 'no-store' })
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
        if (data.video_style) {
          setVideoStyle(data.video_style)
        }
        if (data.ad_copy) {
          setAdCopy(data.ad_copy)
        }
        // NOTE: We do NOT pre-seed cachedTranscript from dialogue anymore.
        // The dialogue field contains the generation script with synthetic timestamps
        // that don't match actual audio timing. "Generate Captions" should always
        // run Whisper on the real video to get accurate word-level timestamps.

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

  // Load from direct video URL (no job — e.g. Creative Studio theater mode)
  useEffect(() => {
    if (!videoUrlParam || jobId || compositionIdParam) return

    const loadDirectVideo = async () => {
      setIsLoading(true)
      try {
        setVideoUrl(videoUrlParam)
        // Probe video duration via a hidden <video> element
        let probedDuration = 10
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.src = videoUrlParam
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            if (video.duration && isFinite(video.duration)) {
              probedDuration = Math.round(video.duration)
            }
            resolve()
          }
          video.onerror = () => resolve()
          // Timeout after 5s
          setTimeout(resolve, 5000)
        })
        setDurationSec(probedDuration)

        // Create a base video clip overlay so the editor has something to display
        const rveOverlays = overlayConfigToRVEOverlays(
          { style: 'clean' },
          videoUrlParam,
          probedDuration,
          FPS,
        )
        setInitialOverlays(rveOverlays)
      } catch (err) {
        console.error('Failed to load direct video:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadDirectVideo()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrlParam])

  // Load overlay versions (job mode)
  const loadVersions = useCallback(async () => {
    if (!jobId || !user?.id) return
    try {
      const res = await fetch(`/api/creative-studio/overlay-versions?videoJobId=${jobId}&userId=${user.id}&_t=${Date.now()}`, { cache: 'no-store' })
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
      const res = await fetch(`/api/creative-studio/overlay-versions?compositionId=${cid}&userId=${user.id}&_t=${Date.now()}`, { cache: 'no-store' })
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
        // Mark as dirty when overlays change (after initial load)
        if (!isLoading) setIsDirty(true)

        // Keep overlayConfigRef in sync so Save always captures latest edits (animations, text, etc.)
        const updatedConfig = rveOverlaysToOverlayConfig(overlays, overlayConfigRef.current)
        overlayConfigRef.current = updatedConfig

        // Build set of video URLs currently on the timeline and track actual duration
        const timelineUrls = new Set<string>()
        let maxEndFrame = 0
        for (const o of overlays) {
          if (o.type === OverlayType.VIDEO && 'src' in o) {
            timelineUrls.add((o as ClipOverlay).src)
            const endFrame = o.from + o.durationInFrames
            if (endFrame > maxEndFrame) maxEndFrame = endFrame
          }
        }
        // Keep durationSec in sync with actual timeline content
        // (DB's duration_seconds may only reflect the first clip)
        if (maxEndFrame > 0) {
          const actualDuration = maxEndFrame / FPS
          setDurationSec(prev => {
            if (Math.abs(prev - actualDuration) > 0.5) return actualDuration
            return prev
          })
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
  }, [isLoading])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Handle media selected from Creative Studio media modal
  const handleMediaSelected = useCallback(async (item: SelectedMediaItem) => {
    setShowMediaPicker(false)
    const current = currentOverlaysRef.current

    if (item.mediaType === 'video') {
      // Add as video clip overlay (similar to VideoOverlayPanel.handleAddClip)
      const videoSrc = item.storageUrl || item.url
      if (!videoSrc) return

      let clipDurationFrames = 8 * FPS // fallback = 8 seconds
      try {
        const result = await getSrcDuration(videoSrc)
        clipDurationFrames = result.durationInFrames
      } catch {
        console.warn('Failed to get video duration, using fallback')
      }

      // Find last end frame and row of existing video overlays
      let lastEndFrame = 0
      let videoRow = 5
      for (const o of current) {
        if (o.type === OverlayType.VIDEO) {
          videoRow = o.row
          const end = o.from + o.durationInFrames
          if (end > lastEndFrame) lastEndFrame = end
        }
      }

      const width = item.width || 1080
      const height = item.height || 1920

      const newClip: ClipOverlay = {
        id: Date.now(),
        type: OverlayType.VIDEO,
        content: item.thumbnailUrl || videoSrc,
        src: videoSrc,
        from: lastEndFrame,
        durationInFrames: clipDurationFrames,
        left: 0,
        top: 0,
        width,
        height,
        row: videoRow,
        isDragging: false,
        rotation: 0,
        styles: { objectFit: 'cover', volume: 1 },
      }

      const allOverlays = [...current, newClip]
      const event = new CustomEvent('ks-inject-overlays', { detail: { overlays: allOverlays } })
      window.dispatchEvent(event)

      const updatedConfig = rveOverlaysToOverlayConfig(allOverlays, overlayConfigRef.current)
      overlayConfigRef.current = updatedConfig

      // Create or update composition with source_library_ids
      if (!user?.id || !currentAccountId) return

      const clipDurationSec = Math.round(clipDurationFrames / FPS)

      if (!compositionId && !isComposition) {
        try {
          const sourceJobIds = jobId ? [jobId] : []
          const sourceLibraryIds = [item.mediaHash]
          const totalDuration = durationSec + clipDurationSec

          const res = await fetch('/api/creative-studio/video-composition', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              adAccountId: currentAccountId,
              sourceJobIds,
              sourceLibraryIds,
              overlayConfig: overlayConfigRef.current || { style: 'clean' },
              title: item.name || 'Library Composition',
              durationSeconds: totalDuration,
            }),
          })
          const data = await res.json()
          if (data.compositionId) {
            setCompositionId(data.compositionId)
            setIsComposition(true)
            setVersions([])
            setActiveVersion(null)
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('jobId')
            newUrl.searchParams.set('compositionId', data.compositionId)
            window.history.replaceState({}, '', newUrl.toString())
          }
        } catch (err) {
          console.error('Failed to create composition from media:', err)
        }
      } else if (compositionId) {
        try {
          await fetch('/api/creative-studio/video-composition', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              compositionId,
              userId: user.id,
              sourceLibraryIds: [item.mediaHash],
            }),
          })
        } catch (err) {
          console.error('Failed to update composition with media:', err)
        }
      }
      return
    }

    if (item.mediaType === 'image') {
      // Add as image overlay (similar to ImageOverlayPanel.handleAddImage)
      const imageSrc = item.storageUrl || item.url
      if (!imageSrc) return

      const width = item.width || 1080
      const height = item.height || 1920
      const imageDurationFrames = 200 // ~6.7 seconds at 30fps

      const newId = current.length > 0 ? Math.max(...current.map(o => o.id)) + 1 : 0
      const newOverlay: Overlay = {
        id: newId,
        type: OverlayType.IMAGE,
        content: imageSrc,
        src: imageSrc,
        from: 0,
        durationInFrames: imageDurationFrames,
        left: 0,
        top: 0,
        width,
        height,
        row: 1,
        isDragging: false,
        rotation: 0,
        styles: {
          objectFit: 'contain',
          animation: { enter: 'fadeIn', exit: 'fadeOut' },
        },
      }

      const allOverlays = [...current, newOverlay]
      const event = new CustomEvent('ks-inject-overlays', { detail: { overlays: allOverlays } })
      window.dispatchEvent(event)

      const updatedConfig = rveOverlaysToOverlayConfig(allOverlays, overlayConfigRef.current)
      overlayConfigRef.current = updatedConfig
    }
  }, [jobId, user?.id, currentAccountId, compositionId, isComposition, durationSec])

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

      // Caption requests ALWAYS go through Whisper for accurate timing.
      // Only use cached transcript for non-caption requests (hooks, CTAs, etc.)
      const isCaptionRequest = /caption|subtitle/i.test(prompt)
      const useTranscriptCache = !isCaptionRequest && !!cachedTranscript

      const res = await fetch('/api/creative-studio/generate-overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: prompt,
          durationSeconds: durationSec,
          // Always send currentConfig so videoClips/appendedClips are preserved
          // in the response (API spreads it). Without this, multi-clip video
          // tracks get replaced with a single track on injection.
          currentConfig: currentConfig || undefined,
          videoUrl: !useTranscriptCache ? videoUrl : undefined,
          transcript: useTranscriptCache ? cachedTranscript : undefined,
          // Send current clip edits so captions remap to the edited timeline
          videoClips: currentConfig?.videoClips || undefined,
          fps: FPS,
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        return
      }
      // Cache real Whisper transcript for future non-caption requests
      if (data.transcript) {
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
    }
  }, [jobId, compositionId, user?.id, selectedVoice, isGeneratingVoiceover])

  // Caption style state (for sidebar Captions panel)
  const [currentCaptionStyle, setCurrentCaptionStyle] = useState('capcut')

  // New sidebar panel handlers
  const handleAddCTA = useCallback((template: { id: string; label: string; text: string; buttonColor: string; textColor: string; style: string }) => {
    const current = currentOverlaysRef.current
    const newId = current.length > 0 ? Math.max(...current.map(o => o.id)) + 1 : 0

    // Place CTA at the last 3 seconds of the video, centered at bottom
    const totalFrames = Math.round(durationSec * FPS)
    const ctaDuration = Math.min(3 * FPS, totalFrames) // 3 seconds or video length
    const ctaFrom = Math.max(0, totalFrames - ctaDuration)

    const canvasWidth = 1080 // portrait default
    const canvasHeight = 1920
    const ctaWidth = Math.round(canvasWidth * 0.6)
    const ctaHeight = 80
    const ctaLeft = Math.round((canvasWidth - ctaWidth) / 2)
    // Center in the bottom third of the screen
    const bottomThirdStart = Math.round(canvasHeight * (2 / 3))
    const bottomThirdCenter = bottomThirdStart + Math.round((canvasHeight - bottomThirdStart - ctaHeight) / 2)
    const ctaTop = bottomThirdCenter

    const newOverlay = {
      id: newId,
      left: ctaLeft,
      top: ctaTop,
      width: ctaWidth,
      height: ctaHeight,
      durationInFrames: ctaDuration,
      from: ctaFrom,
      rotation: 0,
      row: (current.length > 0 ? Math.max(...current.map(o => o.row)) : 0) + 1,
      isDragging: false,
      type: 'cta' as const,
      content: template.text,
      styles: {
        opacity: 1,
        zIndex: 200,
        transform: 'none',
        fontSize: '24px',
        fontWeight: '700',
        color: template.textColor,
        backgroundColor: template.style === 'gradient' ? 'transparent' : (template.style === 'outline' ? 'transparent' : template.buttonColor),
        background: template.style === 'gradient' ? template.buttonColor : undefined,
        fontFamily: 'Inter, sans-serif',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'center' as const,
        padding: '12px 32px',
        borderRadius: template.style === 'block' ? '4px' : '9999px',
        border: template.style === 'outline' ? `2px solid ${template.buttonColor}` : 'none',
      },
    }

    const allOverlays = [...current, newOverlay]
    const event = new CustomEvent('ks-inject-overlays', { detail: { overlays: allOverlays } })
    window.dispatchEvent(event)
  }, [durationSec])

  const handleAddMedia = useCallback((item: { id: string; name: string; mediaType: 'VIDEO' | 'IMAGE'; thumbnailUrl?: string; storageUrl?: string }) => {
    // TODO: Add media to timeline via ks-inject-overlays event
    console.log('Add media to timeline:', item)
  }, [])

  const handleAddMusic = useCallback((trackUrl: string, title: string, duration: number) => {
    // TODO: Add SoundOverlay to timeline via ks-inject-overlays event
    console.log('Add music track:', title, trackUrl, duration)
  }, [])

  const handleAddText = useCallback((preset: { label: string; fontSize: number; fontWeight: string }) => {
    handleAIGenerate?.(`Add a ${preset.label.toLowerCase()} text overlay that says "${preset.label}"`)
  }, [handleAIGenerate])

  const handleStyleChange = useCallback((style: string) => {
    setCurrentCaptionStyle(style)
    // TODO: Apply style directly to overlayConfigRef instead of routing through AI
    handleAIGenerate?.(`Change the caption style to ${style}`)
  }, [handleAIGenerate])

  // Launch as ad — use ad_copy from job directly + create Creative from video
  const handleLaunchAsAd = useCallback(async () => {
    if (!user?.id || !videoUrl || !currentAccountId) return
    setIsPreparingLaunch(true)
    try {
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
      setWizardCopy(adCopy ? {
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
      } : null)
      setShowLaunchWizard(true)
    } catch (err) {
      console.error('Failed to prepare ad launch:', err)
    } finally {
      setIsPreparingLaunch(false)
    }
  }, [user?.id, videoUrl, currentAccountId, adCopy])

  // State for AI-generated config that needs to be injected into RVE
  const [aiGeneratedConfig, setAiGeneratedConfig] = useState<OverlayConfig | null>(null)

  // Stable project ID — set once on mount so editor never remounts when transitioning to composition
  // For direct videoUrl paths (no jobId), generate a unique ID so autosave doesn't load stale data
  const [stableProjectId] = useState(() => {
    if (compositionIdParam) return `comp-${compositionIdParam}`
    if (jobId) return `video-${jobId}`
    return `direct-${Date.now()}`
  })
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
    <div className="flex flex-col h-screen dark rve-editor">
      {/* KillScale Header Bar */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2.5 border-b border-border flex-shrink-0 bg-bg-dark z-10">
        <button
          onClick={() => {
            if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) {
              return
            }
            if (fromParam === 'ai-tasks') {
              router.push('/dashboard/creative-studio/ai-tasks')
            } else if (fromParam === 'creative-studio') {
              router.push('/dashboard/creative-studio/media')
            } else if (videoStyle === 'ugc') {
              router.push('/dashboard/creative-studio/ad-studio')
            } else if (backCanvasId) {
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

        {/* Project Name (click to rename) */}
        <button
          onClick={() => { setNameInput(projectName || ''); setShowNamePrompt(true) }}
          className="text-sm text-zinc-300 hover:text-white transition-colors truncate max-w-[200px] lg:max-w-[300px] flex items-center gap-1.5"
          title={projectName || 'Click to name this project'}
        >
          {projectName || <span className="text-zinc-600 italic">Untitled Project</span>}
          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        </button>

        <div className="flex items-center gap-2">
          {/* Version dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-400 bg-bg-card hover:bg-bg-hover transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {activeVersion !== null ? `v${activeVersion}` : 'Versions'}
              {versions.length > 0 && <span className="text-zinc-600 ml-0.5">({versions.length})</span>}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showVersions && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
                <button
                  onClick={() => { setActiveVersion(null); setShowVersions(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    activeVersion === null ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-bg-hover'
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

          {/* Save button */}
          <SaveButton
            jobId={effectiveJobId}
            compositionId={compositionId}
            isComposition={isComposition}
            userId={user?.id}
            adAccountId={currentAccountId}
            videoUrl={videoUrl}
            durationSec={durationSec}
            canvasIdRef={canvasIdRef}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            overlayConfigRef={overlayConfigRef}
            setActiveVersion={setActiveVersion}
            loadVersions={isComposition ? loadCompositionVersions : loadVersions}
            projectName={projectName}
            onNameRequired={() => {
              setPendingSaveAfterName(true)
              setNameInput(projectName || '')
              setShowNamePrompt(true)
            }}
            onSaved={() => setIsDirty(false)}
            setCompositionId={setCompositionId}
            setIsComposition={setIsComposition}
          />

          {/* Save to Library */}
          <button
            onClick={async () => {
              if ((!jobId && !compositionId) || !user?.id || !currentAccountId) return
              setIsSavingToLibrary(true)
              try {
                const body: Record<string, string> = { userId: user.id, adAccountId: currentAccountId }
                if (isComposition && compositionId) {
                  body.compositionId = compositionId
                } else if (jobId) {
                  body.videoJobId = jobId
                }
                const res = await fetch('/api/creative-studio/save-video-to-library', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
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

          {/* Export (render with overlays) */}
          <button
            onClick={async () => {
              if (!user?.id || !currentAccountId) return
              setShowExportModal(true)
              setIsExporting(true)
              setExportPhase('Preparing...')
              setExportProgress(0)
              setExportError(null)
              setRenderedVideoUrl(null)

              try {
                // Save current overlay config first
                const config = overlayConfigRef.current || { style: 'clean' as const }

                const body: Record<string, any> = {
                  overlayConfig: config,
                  userId: user.id,
                  adAccountId: currentAccountId,
                  durationInSeconds: durationSec,
                }
                if (isComposition && compositionId) {
                  body.compositionId = compositionId
                } else if (jobId) {
                  body.videoJobId = jobId
                } else if (videoUrl) {
                  body.videoUrl = videoUrl
                }

                const res = await fetch('/api/creative-studio/render-video', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })

                // Handle non-SSE error responses (e.g. local dev guard, missing config)
                const ct = res.headers.get('content-type') || ''
                if (ct.includes('application/json')) {
                  const data = await res.json()
                  setExportError(data.error || 'Export failed')
                  setIsExporting(false)
                  return
                }

                const reader = res.body?.getReader()
                if (!reader) throw new Error('No response stream')

                const decoder = new TextDecoder()
                let buffer = ''

                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break

                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split('\n\n')
                  buffer = lines.pop() || ''

                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                      const data = JSON.parse(line.slice(6))
                      if (data.type === 'phase') {
                        setExportPhase(data.phase)
                        setExportProgress(data.progress)
                      } else if (data.type === 'done') {
                        setRenderedVideoUrl(data.url)
                        setIsExporting(false)
                      } else if (data.type === 'error') {
                        setExportError(data.message)
                        setIsExporting(false)
                      }
                    } catch { /* skip malformed SSE */ }
                  }
                }
              } catch (err) {
                setExportError((err as Error).message)
                setIsExporting(false)
              }
            }}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/20 disabled:opacity-50 transition-colors"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
            Export
          </button>

          {/* Launch as Ad */}
          {!isComposition && (adCopy || backCanvasId) && (
            <button
              onClick={handleLaunchAsAd}
              disabled={isPreparingLaunch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/20 disabled:opacity-50 transition-colors"
            >
              {isPreparingLaunch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
              Create Ad
            </button>
          )}

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
          showAutosaveStatus={false}
          videoWidth={1080}
          videoHeight={1920}
          sidebarWidth="24rem"
          sidebarIconWidth="3.75rem"
          disabledPanels={[OverlayType.TEMPLATE, OverlayType.STICKER, OverlayType.LOCAL_DIR]}
          adaptors={mediaAdaptors}
          isLoadingProject={isLoading}
          onAIGenerate={handleAIGenerate}
          isAIGenerating={isGenerating}
          hasAITranscript={!!cachedTranscript}
          siblingClips={siblingClips}
          onAppendSibling={handleAppendSibling}
          appendedSiblings={appendedSiblings}
          voices={VOICES.map(v => ({ id: v.id, label: v.label }))}
          selectedVoice={selectedVoice}
          onSelectVoice={setSelectedVoice}
          onGenerateVoiceover={handleGenerateVoiceover}
          isGeneratingVoiceover={isGeneratingVoiceover}
          hasVoiceover={hasVoiceover}
          onAddCTA={handleAddCTA}
          onAddMedia={handleAddMedia}
          onAddMusic={handleAddMusic}
          onAddText={handleAddText}
          onStyleChange={handleStyleChange}
          currentCaptionStyle={currentCaptionStyle}
          editorUserId={user?.id}
          editorAdAccountId={currentAccountId || undefined}
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

      {/* Project Name Prompt Modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowNamePrompt(false); setPendingSaveAfterName(false) }}>
          <div className="bg-bg-card border border-border rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Name this project</h3>
            {pendingSaveAfterName && (
              <p className="text-xs text-zinc-500 mb-3">A name is required before saving.</p>
            )}
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  const name = nameInput.trim()
                  if (compositionId && user?.id) {
                    await fetch('/api/creative-studio/video-composition', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ compositionId, userId: user.id, name }),
                    })
                  }
                  setProjectName(name)
                  setShowNamePrompt(false)
                  // If this was triggered by Save, click the save button programmatically
                  if (pendingSaveAfterName) {
                    setPendingSaveAfterName(false)
                    // Delay so projectName state updates before SaveButton reads it
                    setTimeout(() => {
                      document.querySelector<HTMLButtonElement>('[data-save-button]')?.click()
                    }, 50)
                  }
                }
              }}
              placeholder="e.g. Summer Sale Hero"
              className="w-full px-3 py-2.5 rounded-lg bg-bg-hover border border-border text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowNamePrompt(false); setPendingSaveAfterName(false) }}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const name = nameInput.trim()
                  if (!name) return
                  if (compositionId && user?.id) {
                    await fetch('/api/creative-studio/video-composition', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ compositionId, userId: user.id, name }),
                    })
                  }
                  setProjectName(name)
                  setShowNamePrompt(false)
                  if (pendingSaveAfterName) {
                    setPendingSaveAfterName(false)
                    setTimeout(() => {
                      document.querySelector<HTMLButtonElement>('[data-save-button]')?.click()
                    }, 50)
                  }
                }}
                disabled={!nameInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
              >
                {pendingSaveAfterName ? 'Name & Save' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creative Studio Media Modal */}
      {user?.id && currentAccountId && (
        <CreativeStudioMediaModal
          isOpen={showMediaPicker}
          onClose={() => setShowMediaPicker(false)}
          userId={user.id}
          adAccountId={currentAccountId}
          onSelect={handleMediaSelected}
        />
      )}

      {/* Export Progress Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { if (!isExporting) setShowExportModal(false) }}>
          <div className="bg-bg-card border border-border rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Export Video</h3>
              {!isExporting && (
                <button onClick={() => setShowExportModal(false)} className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {exportError ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                  <X className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-sm text-red-400 mb-1">Export failed</p>
                <p className="text-xs text-zinc-500 mb-4">{exportError}</p>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-bg-hover text-zinc-300 hover:bg-bg-card transition-colors"
                >
                  Close
                </button>
              </div>
            ) : renderedVideoUrl ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm text-emerald-300 mb-4">Export complete!</p>
                <div className="flex gap-2 justify-center">
                  <a
                    href={renderedVideoUrl}
                    download="exported-video.mp4"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-bg-hover text-zinc-300 hover:bg-bg-card transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                  <button
                    onClick={async () => {
                      if (!user?.id || !currentAccountId) return
                      setIsSavingToLibrary(true)
                      try {
                        const saveBody: Record<string, string> = {
                          userId: user.id,
                          adAccountId: currentAccountId,
                          renderedVideoUrl,
                        }
                        if (isComposition && compositionId) {
                          saveBody.compositionId = compositionId
                        } else if (jobId) {
                          saveBody.videoJobId = jobId
                        }
                        const res = await fetch('/api/creative-studio/save-video-to-library', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(saveBody),
                        })
                        const data = await res.json()
                        if (data.success) {
                          setSavedToLibrary(true)
                          setShowExportModal(false)
                        } else {
                          alert(`Failed to save: ${data.error}`)
                        }
                      } catch (err) {
                        console.error('Save to library failed:', err)
                      } finally {
                        setIsSavingToLibrary(false)
                      }
                    }}
                    disabled={isSavingToLibrary || savedToLibrary}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    {isSavingToLibrary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedToLibrary ? <CheckCircle className="w-3.5 h-3.5" /> : <Library className="w-3.5 h-3.5" />}
                    {savedToLibrary ? 'Saved' : 'Save to Library'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                {/* Progress ring */}
                <div className="relative w-20 h-20 mx-auto mb-4">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="4" fill="none" className="text-zinc-800" />
                    <circle
                      cx="40" cy="40" r="36"
                      stroke="currentColor" strokeWidth="4" fill="none"
                      className="text-blue-400 transition-all duration-300"
                      strokeDasharray={`${2 * Math.PI * 36}`}
                      strokeDashoffset={`${2 * Math.PI * 36 * (1 - exportProgress)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">{Math.round(exportProgress * 100)}%</span>
                  </div>
                </div>
                <p className="text-sm text-zinc-300 mb-1">{exportPhase}</p>
                <p className="text-[10px] text-zinc-600">This may take a minute...</p>
              </div>
            )}
          </div>
        </div>
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
 *
 * Flow:
 * 1. If no project name → triggers name prompt (parent handles)
 * 2. If no composition exists yet → creates one, then saves overlay version
 * 3. If composition exists → saves overlay version
 */
function SaveButton({
  jobId,
  compositionId,
  isComposition,
  userId,
  adAccountId,
  videoUrl,
  durationSec,
  canvasIdRef,
  isSaving,
  setIsSaving,
  overlayConfigRef,
  setActiveVersion,
  loadVersions,
  projectName,
  onNameRequired,
  onSaved,
  setCompositionId,
  setIsComposition,
}: {
  jobId: string | null
  compositionId: string | null
  isComposition: boolean
  userId: string | undefined
  adAccountId: string | null
  videoUrl: string | null
  durationSec: number
  canvasIdRef: React.MutableRefObject<string | null>
  isSaving: boolean
  setIsSaving: (v: boolean) => void
  overlayConfigRef: React.MutableRefObject<OverlayConfig | undefined>
  setActiveVersion: (v: number) => void
  loadVersions: () => void
  projectName: string | null
  onNameRequired: () => void
  onSaved: () => void
  setCompositionId: (id: string) => void
  setIsComposition: (v: boolean) => void
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
    if (!userId || isSaving) return

    // Require a project name before saving
    if (!projectName) {
      onNameRequired()
      return
    }

    setIsSaving(true)
    try {
      const config = overlayConfigRef.current || { style: 'clean' as const }
      let effectiveCompositionId = compositionId

      // If no composition exists yet, create one (this makes the editor state a "project")
      if (!isComposition && !compositionId) {
        const createRes = await fetch('/api/creative-studio/video-composition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            canvasId: canvasIdRef.current || undefined,
            adAccountId: adAccountId || 'direct',
            sourceJobIds: jobId ? [jobId] : [],
            overlayConfig: config,
            name: projectName,
            durationSeconds: durationSec,
          }),
        })
        const createData = await createRes.json()
        if (createData.compositionId) {
          effectiveCompositionId = createData.compositionId
          setCompositionId(createData.compositionId)
          setIsComposition(true)
          // Update URL without reload
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('jobId')
          newUrl.searchParams.delete('videoUrl')
          newUrl.searchParams.set('compositionId', createData.compositionId)
          window.history.replaceState({}, '', newUrl.toString())
        } else {
          alert(`Save failed: ${createData.error || 'Could not create project'}`)
          return
        }
      }

      // Save overlay version
      const body: Record<string, any> = { overlayConfig: config, userId }
      if (effectiveCompositionId) {
        body.compositionId = effectiveCompositionId
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
        onSaved()
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
      data-save-button
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
        isActive ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:bg-bg-hover'
      }`}
    >
      v{version.version} &middot; {new Date(version.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    </button>
  )
}
