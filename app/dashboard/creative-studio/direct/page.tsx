'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  Video,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Globe,
  Lightbulb,
  Zap,
  RefreshCw,
  Eye,
  Type,
  MessageSquare,
  MousePointer,
  Film,
  Clapperboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildConceptSoraPrompt } from '@/lib/video-prompt-templates'
import type { ProductKnowledge, ProductImage, AdConcept, DirectConceptResult } from '@/lib/video-prompt-templates'
import type { VideoJob } from '@/remotion/types'
import { notifyCreditsChanged } from '@/components/creative-studio/credits-gauge'

// ─── Pill categories ──────────────────────────────────────────────────────────

type PillCategory = 'name' | 'description' | 'features' | 'benefits' | 'keyMessages' | 'testimonials' | 'painPoints'

const SINGLE_SELECT: PillCategory[] = ['name', 'description']

const PILL_SECTIONS: { key: PillCategory; label: string; required?: boolean; hint: string }[] = [
  { key: 'name', label: 'Product Name', required: true, hint: 'pick one' },
  { key: 'description', label: 'Description', hint: 'pick one' },
  { key: 'features', label: 'Key Features', hint: 'select all that apply' },
  { key: 'benefits', label: 'Benefits', hint: 'select all that apply' },
  { key: 'keyMessages', label: 'Key Messages', hint: 'select all that apply' },
  { key: 'testimonials', label: 'Customer Voice', hint: 'select all that apply' },
  { key: 'painPoints', label: 'Problems It Solves', hint: 'select all that apply' },
]

// ─── Pill Selector Component ──────────────────────────────────────────────────

function PillGroup({
  label,
  items,
  selectedIndices,
  multiSelect,
  onToggle,
  onAdd,
  required,
  hint,
}: {
  label: string
  items: string[]
  selectedIndices: number[]
  multiSelect: boolean
  onToggle: (index: number) => void
  onAdd: (value: string) => void
  required?: boolean
  hint: string
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
    setIsAdding(false)
  }

  if (items.length === 0 && !isAdding) {
    return (
      <div>
        <label className="text-sm font-medium text-zinc-300 mb-2 block">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-500 border border-dashed border-zinc-700 hover:text-purple-400 hover:border-purple-500/30 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add {label.toLowerCase()}
        </button>
      </div>
    )
  }

  return (
    <div>
      <label className="text-sm font-medium text-zinc-300 mb-2 block">
        {label} {required && <span className="text-red-400">*</span>}
        {items.length > 0 && (
          <span className="text-xs text-zinc-600 ml-2">{hint}</span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const isSelected = selectedIndices.includes(i)
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer text-left max-w-full',
                isSelected
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
              )}
            >
              <span className="line-clamp-2">{item}</span>
            </button>
          )
        })}

        {isAdding ? (
          <div className="flex items-center gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setIsAdding(false); setInput('') }
              }}
              autoFocus
              placeholder="Type and press Enter"
              className="bg-bg-dark border border-purple-500/30 rounded-full px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none w-48"
            />
            <button onClick={() => { setIsAdding(false); setInput('') }} className="text-zinc-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-zinc-600 border border-dashed border-zinc-700 hover:text-purple-400 hover:border-purple-500/30 transition-colors"
            title={`Add custom ${label.toLowerCase()}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type VideoStyle = 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
type VideoQuality = 'standard' | 'premium'

const VIDEO_STYLES: { value: VideoStyle; label: string }[] = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'playful', label: 'Playful' },
  { value: 'conceptual', label: 'Conceptual' },
  { value: 'satisfying', label: 'Satisfying' },
  { value: 'broll', label: 'B-Roll' },
]

const VEO_BASE_DURATION = 8
const VEO_EXTENSION_STEP = 7
const QUALITY_COSTS = {
  standard: { base: 20, extension: 10 },
  premium: { base: 50, extension: 25 },
}

export default function DirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const restoredCanvasRef = useRef(false)

  // Step tracking
  const [step, setStep] = useState(1) // 1: Product, 2: Concept Prompt + Director's Review

  // Step 1: Product Input
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url')
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Step 1: Pill pools
  const [pools, setPools] = useState<Record<PillCategory, string[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })

  const [selected, setSelected] = useState<Record<PillCategory, number[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })

  const [extraContext, setExtraContext] = useState({
    targetAudience: '',
    category: '',
    uniqueSellingPoint: '',
  })

  const [videoIntel, setVideoIntel] = useState<{
    motionOpportunities: string[]
    sensoryDetails: string[]
    visualHooks: string[]
  }>({ motionOpportunities: [], sensoryDetails: [], visualHooks: [] })

  const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge>({ name: '' })
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic')

  // Direct-specific state (Step 2)
  const [directConceptPrompt, setDirectConceptPrompt] = useState('')
  const [directResult, setDirectResult] = useState<DirectConceptResult | null>(null)
  const [directWriting, setDirectWriting] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)

  // Editable director's review fields (initialized from directResult)
  const [editScene, setEditScene] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editAction, setEditAction] = useState('')
  const [editMood, setEditMood] = useState('')
  const [editVideoPrompt, setEditVideoPrompt] = useState('')
  const [editExtensionPrompts, setEditExtensionPrompts] = useState<string[]>([])
  const [editHook, setEditHook] = useState('')
  const [editCaptions, setEditCaptions] = useState<string[]>([])
  const [editCta, setEditCta] = useState('')
  const [editAdCopy, setEditAdCopy] = useState<{ primaryText: string; headline: string; description: string } | null>(null)
  const [showVeoPrompt, setShowVeoPrompt] = useState(false)
  const [showExtensions, setShowExtensions] = useState(false)

  // Video generation state
  const [concepts, setConcepts] = useState<AdConcept[]>([])
  const [conceptJobs, setConceptJobs] = useState<Record<number, VideoJob[]>>({})
  const [currentVideoVersion, setCurrentVideoVersion] = useState<Record<number, number>>({})
  const [canvasId, setCanvasId] = useState<string | null>(null)
  const [conceptQuality, setConceptQuality] = useState<Record<number, VideoQuality>>({})
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [extendingIndex, setExtendingIndex] = useState<number | null>(null)

  // Credits
  const [credits, setCredits] = useState<{ remaining: number; totalAvailable: number } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.remaining !== undefined) setCredits({ remaining: d.remaining, totalAvailable: d.totalAvailable }) })
      .catch(() => {})
  }, [user?.id])

  // ─── Quality / Duration / Cost helpers ──────────────────────────────────────

  const getConceptQuality = (i: number): VideoQuality => conceptQuality[i] || 'standard'
  const getConceptDuration = (i: number) => concepts[i]?.estimatedDuration || VEO_BASE_DURATION
  const getConceptCreditCost = (i: number) => {
    const dur = getConceptDuration(i)
    const q = getConceptQuality(i)
    const costs = QUALITY_COSTS[q]
    const extensions = dur > VEO_BASE_DURATION ? Math.round((dur - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
    return costs.base + extensions * costs.extension
  }
  const getApiProvider = (i: number) => {
    const dur = getConceptDuration(i)
    return dur > VEO_BASE_DURATION ? 'veo-ext' : 'veo'
  }

  const getJobsForConcept = (i: number): VideoJob[] => conceptJobs[i] || []
  const getActiveJob = (i: number): VideoJob | null => {
    const jobs = getJobsForConcept(i)
    const version = currentVideoVersion[i] ?? 0
    return jobs[version] || null
  }

  // ─── Restore canvas from URL param ──────────────────────────────────────────

  useEffect(() => {
    if (restoredCanvasRef.current) return
    const canvasIdParam = searchParams.get('canvasId')
    if (!canvasIdParam || !user?.id) return
    restoredCanvasRef.current = true

    ;(async () => {
      try {
        const res = await fetch(`/api/creative-studio/video-canvas?userId=${user.id}&canvasId=${canvasIdParam}`)
        const data = await res.json()
        if (!res.ok || !data.canvas) return

        const canvas = data.canvas
        if (canvas.concepts?.length > 0) {
          setConcepts(canvas.concepts)
          setCanvasId(canvas.id)
          if (canvas.product_knowledge) {
            setProductKnowledge(canvas.product_knowledge)
            setHasAnalyzed(true)
          }
          if (canvas.product_url) setProductUrl(canvas.product_url)
          setStep(2)
          // Restore directResult from the concept if it was a Direct canvas
          if (canvas.concepts[0]?.angle === 'Direct') {
            setDirectResult({
              videoPrompt: canvas.concepts[0].videoPrompt || '',
              extensionPrompts: canvas.concepts[0].extensionPrompts,
              scene: canvas.concepts[0].script?.scene || '',
              subject: canvas.concepts[0].script?.subject || '',
              action: canvas.concepts[0].script?.action || '',
              mood: canvas.concepts[0].script?.mood || '',
              estimatedDuration: canvas.concepts[0].estimatedDuration || VEO_BASE_DURATION,
              overlay: canvas.concepts[0].overlay || { hook: '', captions: [], cta: 'Shop Now' },
              adCopy: canvas.concepts[0].adCopy,
            })
          }
        }
      } catch (err) {
        console.error('[Direct] Failed to restore canvas:', err)
      }
    })()
  }, [searchParams, user?.id])

  // ─── Pill toggle helpers ────────────────────────────────────────────────────

  const togglePill = useCallback((category: PillCategory, index: number) => {
    const isSingle = SINGLE_SELECT.includes(category)
    setSelected(prev => ({
      ...prev,
      [category]: isSingle
        ? (prev[category].includes(index) ? [] : [index])
        : (prev[category].includes(index)
            ? prev[category].filter(i => i !== index)
            : [...prev[category], index]),
    }))
  }, [])

  const addToPool = useCallback((category: PillCategory, value: string) => {
    const isSingle = SINGLE_SELECT.includes(category)
    setPools(prev => {
      const newPool = [...prev[category], value]
      const newIndex = newPool.length - 1
      setSelected(sel => ({
        ...sel,
        [category]: isSingle ? [newIndex] : [...sel[category], newIndex],
      }))
      return { ...prev, [category]: newPool }
    })
  }, [])

  // ─── Step 1: Product Analysis ───────────────────────────────────────────────

  const handleAnalyzeUrl = useCallback(async () => {
    if (!productUrl.trim()) return
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const res = await fetch('/api/creative-studio/analyze-product-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAnalyzeError(data.error || 'Failed to analyze product')
        return
      }
      if (data.product) {
        const p = data.product
        setPools({
          name: p.name ? [p.name] : [],
          description: p.description ? [p.description] : [],
          features: p.features || [],
          benefits: p.benefits || [],
          keyMessages: p.keyMessages || [],
          testimonials: p.testimonialPoints || [],
          painPoints: p.painPoints || [],
        })
        setSelected({
          name: [], description: [], features: [], benefits: [],
          keyMessages: [], testimonials: [], painPoints: [],
        })
        setExtraContext({
          targetAudience: p.targetAudience || '',
          category: p.category || '',
          uniqueSellingPoint: p.uniqueSellingPoint || '',
        })
        setVideoIntel({
          motionOpportunities: p.motionOpportunities || [],
          sensoryDetails: p.sensoryDetails || [],
          visualHooks: p.visualHooks || [],
        })
        if (data.productImages?.length > 0) {
          setProductImages(data.productImages)
        }
        setHasAnalyzed(true)
      }
    } catch {
      setAnalyzeError('Failed to analyze product URL')
    } finally {
      setIsAnalyzing(false)
    }
  }, [productUrl])

  // ─── Step 1 → Step 2 ─────────────────────────────────────────────────────────

  const handleGoToStep2 = useCallback(() => {
    const assembled: ProductKnowledge = {
      name: selected.name.length > 0 ? pools.name[selected.name[0]] : '',
      description: selected.description.length > 0 ? pools.description[selected.description[0]] : undefined,
      features: selected.features.map(i => pools.features[i]),
      benefits: selected.benefits.map(i => pools.benefits[i]),
      painPoints: selected.painPoints.map(i => pools.painPoints[i]),
      testimonialPoints: selected.testimonials.map(i => pools.testimonials[i]),
      keyMessages: selected.keyMessages.map(i => pools.keyMessages[i]),
      targetAudience: extraContext.targetAudience || undefined,
      category: extraContext.category || undefined,
      uniqueSellingPoint: extraContext.uniqueSellingPoint || undefined,
      motionOpportunities: videoIntel.motionOpportunities.length > 0 ? videoIntel.motionOpportunities : undefined,
      sensoryDetails: videoIntel.sensoryDetails.length > 0 ? videoIntel.sensoryDetails : undefined,
      visualHooks: videoIntel.visualHooks.length > 0 ? videoIntel.visualHooks : undefined,
    }
    setProductKnowledge(assembled)
    setStep(2)
  }, [pools, selected, extraContext, videoIntel])

  // ─── Step 2A: Write Direct Concept ──────────────────────────────────────────

  const handleWriteDirectConcept = useCallback(async () => {
    if (!directConceptPrompt.trim() || !productKnowledge.name) return
    setDirectWriting(true)
    setDirectError(null)
    setDirectResult(null)

    try {
      const res = await fetch('/api/creative-studio/generate-direct-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productKnowledge,
          conceptPrompt: directConceptPrompt,
          style: videoStyle,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDirectError(data.error || 'Failed to write concept')
        return
      }
      setDirectResult(data as DirectConceptResult)
      // Populate editable fields
      setEditScene(data.scene || '')
      setEditSubject(data.subject || '')
      setEditAction(data.action || '')
      setEditMood(data.mood || '')
      setEditVideoPrompt(data.videoPrompt || '')
      setEditExtensionPrompts(data.extensionPrompts || [])
      setEditHook(data.overlay?.hook || '')
      setEditCaptions(data.overlay?.captions || [])
      setEditCta(data.overlay?.cta || 'Shop Now')
      setEditAdCopy(data.adCopy || null)
    } catch {
      setDirectError('Failed to write concept. Please try again.')
    } finally {
      setDirectWriting(false)
    }
  }, [directConceptPrompt, productKnowledge, videoStyle])

  // ─── Convert DirectConceptResult → AdConcept for canvas/job compatibility ──

  const buildAdConceptFromDirect = useCallback((): AdConcept => {
    const duration = directResult?.estimatedDuration || VEO_BASE_DURATION
    return {
      title: 'Direct Concept',
      angle: 'Direct',
      logline: directConceptPrompt.slice(0, 120),
      visualMetaphor: editAction,
      whyItWorks: `User-directed concept: ${editScene}`,
      script: {
        scene: editScene,
        subject: editSubject,
        action: editAction,
        mood: editMood,
      },
      overlay: {
        hook: editHook,
        captions: editCaptions.filter(c => c.trim()),
        cta: editCta,
      },
      videoPrompt: editVideoPrompt,
      estimatedDuration: duration,
      extensionPrompts: editExtensionPrompts.length > 0 ? editExtensionPrompts : undefined,
      adCopy: editAdCopy || undefined,
    }
  }, [directResult, directConceptPrompt, editScene, editSubject, editAction, editMood, editVideoPrompt, editExtensionPrompts, editHook, editCaptions, editCta, editAdCopy])

  // ─── Generate Video ─────────────────────────────────────────────────────────

  const handleGenerateVideo = useCallback(async () => {
    if (!user?.id || !currentAccountId) return

    const concept = buildAdConceptFromDirect()
    const conceptIndex = 0

    // Set concept in state for UI
    setConcepts([concept])

    const conceptDuration = concept.estimatedDuration || VEO_BASE_DURATION
    const q = conceptQuality[0] || 'standard'
    const costs = QUALITY_COSTS[q]
    const extensions = conceptDuration > VEO_BASE_DURATION ? Math.round((conceptDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
    const creditCost = costs.base + extensions * costs.extension
    const apiProvider = conceptDuration > VEO_BASE_DURATION ? 'veo-ext' : 'veo'

    setGeneratingIndex(conceptIndex)
    setGenerateError(null)

    try {
      // Save canvas first
      let activeCanvasId = canvasId
      if (!activeCanvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: productUrl || null,
            productKnowledge: { ...productKnowledge, _studioMode: 'direct' },
            concepts: [concept],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          activeCanvasId = canvasData.canvas.id
          setCanvasId(canvasData.canvas.id)
        }
      }

      const fullPrompt = concept.videoPrompt || buildConceptSoraPrompt(concept, conceptDuration)

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: fullPrompt,
          videoStyle: 'concept',
          durationSeconds: conceptDuration,
          canvasId: activeCanvasId || null,
          productName: productKnowledge.name || null,
          adIndex: conceptIndex,
          productImageBase64: productImages[selectedProductImageIdx]?.base64 || null,
          productImageMimeType: productImages[selectedProductImageIdx]?.mimeType || null,
          provider: apiProvider,
          quality: q,
          targetDurationSeconds: apiProvider === 'veo-ext' ? conceptDuration : undefined,
          extensionPrompts: concept.extensionPrompts || undefined,
          adCopy: concept.adCopy || null,
          overlayConfig: {
            style: 'bold' as const,
            hook: {
              line1: concept.overlay.hook,
              startSec: 0,
              endSec: 3,
              animation: 'pop' as const,
              fontSize: 56,
              fontWeight: 800,
              position: 'center' as const,
            },
            captions: (() => {
              const caps = concept.overlay.captions
              const captionStart = 3
              const gap = 0.15
              let cursor = captionStart
              return caps.map((text, idx) => {
                const wordCount = text.split(/\s+/).length
                const duration = Math.min(2.5, Math.max(1.2, wordCount * 0.6))
                const start = Math.round(cursor * 10) / 10
                const end = Math.round((cursor + duration) * 10) / 10
                cursor += duration + gap
                return {
                  text,
                  startSec: start,
                  endSec: end,
                  highlight: idx < caps.length - 1,
                  highlightWord: undefined as string | undefined,
                  fontSize: 40,
                  fontWeight: 700,
                  position: 'bottom' as const,
                }
              })
            })(),
            cta: {
              buttonText: concept.overlay.cta,
              startSec: Math.max(conceptDuration - 3, conceptDuration * 0.7),
              animation: 'slide' as const,
              fontSize: 32,
            },
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setGenerateError(data.error || 'Failed to start video generation')
        return
      }

      setGenerateError(null)
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - creditCost) } : prev)
      notifyCreditsChanged()
      setCurrentVideoVersion(prev => ({ ...prev, [conceptIndex]: 0 }))

      // Immediately refresh jobs
      if (activeCanvasId) {
        refreshJobsWithCanvas(activeCanvasId)
      }
    } catch {
      setGenerateError('Failed to generate video')
    } finally {
      setGeneratingIndex(null)
    }
  }, [user?.id, currentAccountId, buildAdConceptFromDirect, canvasId, productUrl, productKnowledge, conceptQuality])

  // ─── Job polling ────────────────────────────────────────────────────────────

  const refreshJobs = useCallback(async () => {
    if (!user?.id || !canvasId) return
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, canvasId }),
      })
      const data = await res.json()
      if (data.jobs) {
        const jobMap: Record<number, VideoJob[]> = {}
        for (const j of data.jobs) {
          if (j.ad_index !== null && j.ad_index !== undefined) {
            if (!jobMap[j.ad_index]) jobMap[j.ad_index] = []
            jobMap[j.ad_index].push(j)
          }
        }
        setConceptJobs(jobMap)
      }
    } catch (err) {
      console.error('[Direct] Poll error:', err)
    }
  }, [user?.id, canvasId, currentAccountId])

  const refreshJobsWithCanvas = useCallback(async (cId: string) => {
    if (!user?.id) return
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, canvasId: cId }),
      })
      const data = await res.json()
      if (data.jobs) {
        const jobMap: Record<number, VideoJob[]> = {}
        for (const j of data.jobs) {
          if (j.ad_index !== null && j.ad_index !== undefined) {
            if (!jobMap[j.ad_index]) jobMap[j.ad_index] = []
            jobMap[j.ad_index].push(j)
          }
        }
        setConceptJobs(jobMap)
      }
    } catch (err) {
      console.error('[Direct] Poll error:', err)
    }
  }, [user?.id, currentAccountId])

  const hasInProgressJobs = Object.values(conceptJobs).some(
    jobs => jobs.some(j => ['generating', 'queued', 'rendering', 'extending'].includes(j.status))
  )

  useEffect(() => {
    if (!canvasId || !user?.id) return
    refreshJobs()
  }, [canvasId, user?.id, refreshJobs])

  useEffect(() => {
    if (!hasInProgressJobs || !canvasId) return
    pollIntervalRef.current = setInterval(refreshJobs, 15000)
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    }
  }, [hasInProgressJobs, canvasId, refreshJobs])

  useEffect(() => {
    if (!canvasId) return
    const handler = () => refreshJobs()
    window.addEventListener('video-jobs-updated', handler)
    return () => window.removeEventListener('video-jobs-updated', handler)
  }, [canvasId, refreshJobs])

  // ─── Extend ─────────────────────────────────────────────────────────────────

  const handleExtend = useCallback(async (conceptIndex: number) => {
    if (!user?.id) return
    const job = getActiveJob(conceptIndex)
    if (!job || job.status !== 'complete' || (job.provider !== 'veo-ext' && job.provider !== 'veo')) return

    setExtendingIndex(conceptIndex)
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Extension failed')
        return
      }
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - 25) } : prev)
      notifyCreditsChanged()
      const version = currentVideoVersion[conceptIndex] ?? 0
      setConceptJobs(prev => {
        const jobs = [...(prev[conceptIndex] || [])]
        if (jobs[version]) {
          jobs[version] = {
            ...jobs[version],
            status: 'extending' as const,
            extension_total: data.extension_total,
            extension_step: data.extension_step,
            target_duration_seconds: data.target_duration_seconds,
          }
        }
        return { ...prev, [conceptIndex]: jobs }
      })
    } catch (err) {
      console.error('[Direct] Extend error:', err)
      alert('Failed to extend video')
    } finally {
      setExtendingIndex(null)
    }
  }, [user?.id, conceptJobs, currentVideoVersion])

  // ─── Regenerate for concept ──────────────────────────────────────────────────

  const handleRegenerate = useCallback(async (conceptIndex: number) => {
    if (!user?.id || !currentAccountId) return

    const concept = concepts[conceptIndex]
    if (!concept) return

    const conceptDuration = getConceptDuration(conceptIndex)
    const conceptCreditCost = getConceptCreditCost(conceptIndex)
    const apiProvider = getApiProvider(conceptIndex)

    setGeneratingIndex(conceptIndex)
    setGenerateError(null)

    try {
      const fullPrompt = concept.videoPrompt || buildConceptSoraPrompt(concept, conceptDuration)

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: fullPrompt,
          videoStyle: 'concept',
          durationSeconds: conceptDuration,
          canvasId: canvasId || null,
          productName: productKnowledge.name || null,
          adIndex: conceptIndex,
          productImageBase64: productImages[selectedProductImageIdx]?.base64 || null,
          productImageMimeType: productImages[selectedProductImageIdx]?.mimeType || null,
          provider: apiProvider,
          quality: getConceptQuality(conceptIndex),
          targetDurationSeconds: apiProvider === 'veo-ext' ? conceptDuration : undefined,
          extensionPrompts: concept.extensionPrompts || undefined,
          adCopy: concept.adCopy || null,
          overlayConfig: {
            style: 'bold' as const,
            hook: {
              line1: concept.overlay.hook,
              startSec: 0,
              endSec: 3,
              animation: 'pop' as const,
              fontSize: 56,
              fontWeight: 800,
              position: 'center' as const,
            },
            captions: (() => {
              const caps = concept.overlay.captions
              const captionStart = 3
              const gap = 0.15
              let cursor = captionStart
              return caps.map((text, idx) => {
                const wordCount = text.split(/\s+/).length
                const duration = Math.min(2.5, Math.max(1.2, wordCount * 0.6))
                const start = Math.round(cursor * 10) / 10
                const end = Math.round((cursor + duration) * 10) / 10
                cursor += duration + gap
                return {
                  text,
                  startSec: start,
                  endSec: end,
                  highlight: idx < caps.length - 1,
                  highlightWord: undefined as string | undefined,
                  fontSize: 40,
                  fontWeight: 700,
                  position: 'bottom' as const,
                }
              })
            })(),
            cta: {
              buttonText: concept.overlay.cta,
              startSec: Math.max(conceptDuration - 3, conceptDuration * 0.7),
              animation: 'slide' as const,
              fontSize: 32,
            },
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setGenerateError(data.error || 'Failed to start video generation')
        return
      }

      setGenerateError(null)
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - conceptCreditCost) } : prev)
      notifyCreditsChanged()
      setCurrentVideoVersion(prev => ({ ...prev, [conceptIndex]: 0 }))
      refreshJobs()
    } catch {
      setGenerateError('Failed to generate video')
    } finally {
      setGeneratingIndex(null)
    }
  }, [user?.id, currentAccountId, concepts, canvasId, productKnowledge.name, refreshJobs, conceptQuality])

  // ─── Derived state ──────────────────────────────────────────────────────────

  const canProceedStep1 = selected.name.length > 0
  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  // Duration + cost for the direct concept
  const directDuration = directResult?.estimatedDuration || VEO_BASE_DURATION
  const directQuality = conceptQuality[0] || 'standard'
  const directExtensions = directDuration > VEO_BASE_DURATION ? Math.round((directDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
  const directCreditCost = QUALITY_COSTS[directQuality].base + directExtensions * QUALITY_COSTS[directQuality].extension

  // Concept card colors
  const CONCEPT_COLORS = [
    { bg: 'bg-amber-500/10', border: 'border-amber-500/30', activeBorder: 'border-amber-500', text: 'text-amber-400', icon: 'text-amber-400' },
  ]

  return (
    <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6">
      {/* Header */}
      <div className={cn('mx-auto mb-6', step === 1 ? 'max-w-[1000px]' : 'max-w-3xl')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/dashboard/creative-studio/ad-studio')}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Clapperboard className="w-7 h-7 text-amber-400" />
                Direct
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1 ml-7">Describe your concept, AI builds the shot list</p>
          </div>
          {credits && (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
              <Sparkles className="w-3 h-3" />
              {credits.remaining} credits remaining
            </div>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {[
          { num: 1, label: 'Your Product' },
          { num: 2, label: 'Direct Concept' },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              step >= num ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-500'
            )}>
              {num}
            </div>
            <span className={cn('text-sm', step >= num ? 'text-white' : 'text-zinc-500')}>{label}</span>
            {num < 2 && <ArrowRight className="w-4 h-4 text-zinc-600 mx-1" />}
          </div>
        ))}
      </div>

      {/* ═══════════════════════════ Step 1: Product ═══════════════════════════ */}
      {step === 1 && (
        <div className="max-w-[1000px] mx-auto space-y-6">
          {/* Section A: Product Input */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">What product is this ad for?</h2>
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll extract your product details so AI can build a precise shot list.</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'url' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Globe className="w-4 h-4" />
                Product URL
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'manual' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Type className="w-4 h-4" />
                Enter Manually
              </button>
            </div>

            {inputMode === 'url' && (
              <div className="mb-4">
                <div className="flex gap-3">
                  <input
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeUrl()}
                    placeholder="https://yourstore.com/product"
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!productUrl.trim() || isAnalyzing}
                    className="px-6 py-3 rounded-lg bg-amber-500/20 text-amber-300 font-medium hover:bg-amber-500/30 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                </div>
                {analyzeError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
                    <AlertCircle className="w-4 h-4" />
                    {analyzeError}
                  </div>
                )}
              </div>
            )}

            {hasAnalyzed && inputMode === 'url' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <Check className="w-4 h-4" />
                Found {totalPillsFound} items — select the ones you want in your creative brief
              </div>
            )}

            {/* Product image picker */}
            {productImages.length > 1 && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Product image for video generation — click to change</label>
                <div className="flex flex-wrap gap-2">
                  {productImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProductImageIdx(i)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all',
                        selectedProductImageIdx === i
                          ? 'border-amber-500 ring-2 ring-amber-500/30'
                          : 'border-border hover:border-zinc-500'
                      )}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={img.description || `Image ${i + 1}`}
                        className="w-full h-full object-contain bg-zinc-900"
                      />
                      {selectedProductImageIdx === i && (
                        <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section B: Pill Selectors */}
          {(hasAnalyzed || inputMode === 'manual') && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Creative Brief</h2>
                {totalSelected > 0 && (
                  <span className="text-xs text-zinc-500">{totalSelected} selected</span>
                )}
              </div>
              <div className="space-y-5">
                {PILL_SECTIONS.map(({ key, label, required, hint }) => {
                  if (pools[key].length === 0 && !required && key !== 'features' && key !== 'benefits') return null
                  return (
                    <PillGroup
                      key={key}
                      label={label}
                      items={pools[key]}
                      selectedIndices={selected[key]}
                      multiSelect={!SINGLE_SELECT.includes(key)}
                      onToggle={(index) => togglePill(key, index)}
                      onAdd={(value) => addToPool(key, value)}
                      required={required}
                      hint={hint}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Video Style Pills */}
          <div className="mb-6">
            <label className="text-sm font-medium text-zinc-300 mb-2 block">
              Video Style
              <span className="text-xs text-zinc-600 ml-2">pick one</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {VIDEO_STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setVideoStyle(s.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer',
                    s.value === videoStyle
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGoToStep2}
            disabled={!canProceedStep1}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════ Step 2: Direct Concept ═══════════════════════════ */}
      {step === 2 && (
        <div className="max-w-3xl mx-auto">
          <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to product info
          </button>

          {/* Product summary pill */}
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-zinc-800/50 border border-border">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{productKnowledge.name}</div>
              {productKnowledge.description && (
                <div className="text-xs text-zinc-500 truncate">{productKnowledge.description}</div>
              )}
            </div>
            <button onClick={() => setStep(1)} className="text-xs text-zinc-500 hover:text-white flex-shrink-0">Edit</button>
          </div>

          {/* ── Phase A: Concept Prompt (shown when no directResult and no concepts with videos) ── */}
          {!directResult && concepts.length === 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold text-white mb-1">Describe your video concept</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Describe the scene, mood, and action. GPT will structure it into a production-ready video script.
              </p>

              <textarea
                value={directConceptPrompt}
                onChange={(e) => setDirectConceptPrompt(e.target.value)}
                placeholder="Close-up of someone opening the package, dramatic product reveal, camera orbiting with particles..."
                rows={5}
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none mb-4"
              />

              {directError && (
                <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
                  <AlertCircle className="w-4 h-4" />
                  {directError}
                </div>
              )}

              <button
                onClick={handleWriteDirectConcept}
                disabled={!directConceptPrompt.trim() || directWriting}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {directWriting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Writing concept...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Write Concept · 0 credits
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Phase B: Director's Review (shown when directResult exists, but no video yet) ── */}
          {directResult && concepts.length === 0 && (
            <div className="space-y-6">
              {/* Director's Review Card */}
              <div className="bg-bg-card border-2 border-amber-500/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clapperboard className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Director&apos;s Review</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 ml-auto">
                    {directDuration}s · {directExtensions > 0 ? `${directExtensions + 1} segments` : '1 segment'}
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Scene + Subject */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 mb-1">
                        <Eye className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span>
                      </label>
                      <input
                        value={editScene}
                        onChange={(e) => setEditScene(e.target.value)}
                        className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 mb-1">
                        <Video className="w-3 h-3 text-zinc-500" />
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span>
                      </label>
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {/* Action */}
                  <div>
                    <label className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span>
                    </label>
                    <textarea
                      value={editAction}
                      onChange={(e) => setEditAction(e.target.value)}
                      rows={3}
                      className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  {/* Mood */}
                  <div>
                    <label className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3 h-3 text-zinc-500" />
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span>
                    </label>
                    <input
                      value={editMood}
                      onChange={(e) => setEditMood(e.target.value)}
                      className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Veo Prompt (collapsible) */}
                  <div>
                    <button
                      onClick={() => setShowVeoPrompt(!showVeoPrompt)}
                      className="flex items-center gap-1.5 mb-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <span className="text-[10px] uppercase tracking-wider font-semibold">Veo Prompt ({VEO_BASE_DURATION}s)</span>
                      {showVeoPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showVeoPrompt && (
                      <textarea
                        value={editVideoPrompt}
                        onChange={(e) => setEditVideoPrompt(e.target.value)}
                        rows={6}
                        className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                      />
                    )}
                  </div>

                  {/* Extension Prompts (collapsible) */}
                  {editExtensionPrompts.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowExtensions(!showExtensions)}
                        className="flex items-center gap-1.5 mb-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <span className="text-[10px] uppercase tracking-wider font-semibold">Extension Prompts ({editExtensionPrompts.length})</span>
                        {showExtensions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {showExtensions && (
                        <div className="space-y-2">
                          {editExtensionPrompts.map((ext, ei) => (
                            <div key={ei}>
                              <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Segment {ei + 2}</label>
                              <textarea
                                value={ext}
                                onChange={(e) => {
                                  const updated = [...editExtensionPrompts]
                                  updated[ei] = e.target.value
                                  setEditExtensionPrompts(updated)
                                }}
                                rows={3}
                                className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Overlays */}
                  <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Text Overlays</div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Hook</label>
                        <input
                          value={editHook}
                          onChange={(e) => setEditHook(e.target.value)}
                          placeholder="Opening text (first 2 seconds)"
                          className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      {editCaptions.map((cap, ci) => (
                        <div key={ci}>
                          <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Caption {ci + 1}</label>
                          <input
                            value={cap}
                            onChange={(e) => {
                              const newCaptions = [...editCaptions]
                              newCaptions[ci] = e.target.value
                              setEditCaptions(newCaptions)
                            }}
                            placeholder={`Caption for beat ${ci + 1}`}
                            className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-[10px] text-zinc-500 uppercase mb-1 block">CTA</label>
                        <input
                          value={editCta}
                          onChange={(e) => setEditCta(e.target.value)}
                          placeholder="Call-to-action button text"
                          className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ad Copy (optional) */}
                  {editAdCopy && (
                    <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Ad Copy (optional)</div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Primary Text</label>
                          <textarea
                            value={editAdCopy.primaryText}
                            onChange={(e) => setEditAdCopy({ ...editAdCopy, primaryText: e.target.value })}
                            rows={2}
                            className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Headline</label>
                            <input
                              value={editAdCopy.headline}
                              onChange={(e) => setEditAdCopy({ ...editAdCopy, headline: e.target.value })}
                              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Description</label>
                            <input
                              value={editAdCopy.description}
                              onChange={(e) => setEditAdCopy({ ...editAdCopy, description: e.target.value })}
                              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quality selector */}
              <div className="flex gap-2">
                {(['standard', 'premium'] as const).map(q => {
                  const isActive = directQuality === q
                  const qCosts = QUALITY_COSTS[q]
                  const totalCost = qCosts.base + directExtensions * qCosts.extension
                  return (
                    <button
                      key={q}
                      onClick={() => setConceptQuality(prev => ({ ...prev, [0]: q }))}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg border transition-all text-left',
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn('text-xs font-medium', isActive ? 'text-amber-300' : 'text-zinc-400')}>
                          {q === 'standard' ? 'Standard' : 'Premium'}
                        </span>
                        <span className="text-[10px] text-zinc-500">{q === 'standard' ? '720p' : '1080p'}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{totalCost} credits</p>
                    </button>
                  )
                })}
              </div>

              {/* Duration info */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-300">Veo 3.1{directQuality === 'standard' ? ' Fast' : ''}</span>
                <span className="text-xs text-zinc-500">{directDuration}s</span>
                {directExtensions > 0 && (
                  <span className="text-[10px] text-amber-400/80">({directExtensions} extension{directExtensions > 1 ? 's' : ''})</span>
                )}
                <span className="text-xs text-zinc-500 ml-auto">{directCreditCost} credits</span>
              </div>

              {generateError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {generateError}
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerateVideo}
                disabled={generatingIndex !== null || (credits !== null && credits.remaining < directCreditCost)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generatingIndex !== null ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting generation...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Generate Video · {directCreditCost} credits
                  </>
                )}
              </button>

              {/* Rewrite Concept link */}
              <div className="text-center">
                <button
                  onClick={() => { setDirectResult(null); setConcepts([]) }}
                  className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
                >
                  ← Rewrite Concept
                </button>
              </div>
            </div>
          )}

          {/* ── Phase C: Concept Card with Video (after generation starts) ── */}
          {concepts.length > 0 && (
            <div className="space-y-4">
              {concepts.map((concept, i) => {
                const colors = CONCEPT_COLORS[i % CONCEPT_COLORS.length]
                const jobs = getJobsForConcept(i)
                const activeVersion = currentVideoVersion[i] ?? 0
                const job = jobs[activeVersion] || null
                const completedJobs = jobs.filter(j => j.status === 'complete' && (j.final_video_url || j.raw_video_url))
                const videoUrl = job?.final_video_url || job?.raw_video_url
                const hasVideo = job?.status === 'complete' && videoUrl
                const isJobInProgress = job?.status === 'generating' || job?.status === 'queued' || job?.status === 'rendering' || job?.status === 'extending'
                const latestJob = jobs[0] || null
                const isLatestInProgress = latestJob != null && ['generating', 'queued', 'rendering', 'extending'].includes(latestJob.status)

                return (
                  <div
                    key={i}
                    className={cn('rounded-xl border-2 transition-all', `${colors.activeBorder} ${colors.bg}`)}
                  >
                    {/* Card header */}
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className={cn('flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center', colors.bg)}>
                          <Clapperboard className={cn('w-5 h-5', colors.icon)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-white text-base">{concept.title}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300">
                              Direct
                            </span>
                            {completedJobs.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                                {completedJobs.length > 1 ? `${completedJobs.length} Videos` : 'Video Ready'}
                              </span>
                            )}
                            {isLatestInProgress && (
                              <span className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1',
                                latestJob?.status === 'extending' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                              )}>
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                {latestJob?.status === 'extending' ? 'Extending' : 'Generating'}
                              </span>
                            )}
                            {latestJob?.status === 'failed' && !completedJobs.length && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400">
                                Failed
                              </span>
                            )}
                          </div>
                          {concept.logline && <p className="text-sm text-zinc-300 mb-1">{concept.logline}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Video carousel */}
                    <div className="px-5 pb-5">
                      {hasVideo && (
                        <div className="mb-4">
                          <div className="flex items-center gap-3 justify-center">
                            {completedJobs.length > 1 && (
                              <button
                                onClick={() => {
                                  let target = activeVersion + 1
                                  while (target < jobs.length && !(jobs[target].status === 'complete' && (jobs[target].final_video_url || jobs[target].raw_video_url))) target++
                                  if (target < jobs.length) setCurrentVideoVersion(prev => ({ ...prev, [i]: target }))
                                }}
                                disabled={(() => {
                                  for (let t = activeVersion + 1; t < jobs.length; t++) {
                                    if (jobs[t].status === 'complete' && (jobs[t].final_video_url || jobs[t].raw_video_url)) return false
                                  }
                                  return true
                                })()}
                                className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>
                            )}

                            <div className="flex flex-col items-center">
                              <div className="rounded-xl overflow-hidden bg-zinc-900" style={{ maxHeight: 360, maxWidth: 202, aspectRatio: '9/16' }}>
                                <video
                                  key={videoUrl}
                                  src={videoUrl}
                                  poster={job?.thumbnail_url || undefined}
                                  controls
                                  playsInline
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                {job?.provider && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                                    {job.provider === 'veo' || job.provider === 'veo-ext' ? 'Veo' : job.provider === 'runway' ? 'Runway' : 'Sora'}
                                    {' '}{job.duration_seconds || job.target_duration_seconds || ''}s
                                  </span>
                                )}
                                {completedJobs.length > 1 && (
                                  <span className="text-[10px] text-zinc-600">
                                    {completedJobs.indexOf(job!) + 1} / {completedJobs.length}
                                  </span>
                                )}
                              </div>
                              {completedJobs.length > 1 && (
                                <div className="flex items-center gap-1.5 mt-2">
                                  {completedJobs.map((cj, ci) => (
                                    <button
                                      key={cj.id}
                                      onClick={() => {
                                        const jobIndex = jobs.indexOf(cj)
                                        if (jobIndex >= 0) setCurrentVideoVersion(prev => ({ ...prev, [i]: jobIndex }))
                                      }}
                                      className={cn(
                                        'w-2 h-2 rounded-full transition-all',
                                        jobs.indexOf(cj) === activeVersion
                                          ? 'bg-amber-400 scale-125'
                                          : 'bg-zinc-700 hover:bg-zinc-500'
                                      )}
                                      title={`Version ${ci + 1}`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>

                            {completedJobs.length > 1 && (
                              <button
                                onClick={() => {
                                  let target = activeVersion - 1
                                  while (target >= 0 && !(jobs[target].status === 'complete' && (jobs[target].final_video_url || jobs[target].raw_video_url))) target--
                                  if (target >= 0) setCurrentVideoVersion(prev => ({ ...prev, [i]: target }))
                                }}
                                disabled={(() => {
                                  for (let t = activeVersion - 1; t >= 0; t--) {
                                    if (jobs[t].status === 'complete' && (jobs[t].final_video_url || jobs[t].raw_video_url)) return false
                                  }
                                  return true
                                })()}
                                className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            )}

                            {/* +7 sec extend button */}
                            {job && (job.provider === 'veo-ext' || job.provider === 'veo') && (
                              <button
                                onClick={() => handleExtend(i)}
                                disabled={extendingIndex === i || (credits !== null && credits.remaining < 25)}
                                className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {extendingIndex === i ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Plus className="w-5 h-5" />
                                )}
                                <span className="whitespace-nowrap">+ 7 sec</span>
                                <span className="text-[10px] text-amber-400/60">25 credits</span>
                              </button>
                            )}
                          </div>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => router.push(`/dashboard/creative-studio/video-editor?jobId=${job!.id}`)}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors border border-amber-500/20"
                            >
                              <Film className="w-3.5 h-3.5" />
                              Edit Video
                            </button>
                            <button
                              onClick={() => handleRegenerate(i)}
                              disabled={generatingIndex === i}
                              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-border disabled:opacity-50"
                            >
                              <Plus className={cn('w-3.5 h-3.5', generatingIndex === i && 'animate-spin')} />
                              New Variation
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline progress when generating new variation while completed videos exist */}
                      {isLatestInProgress && completedJobs.length > 0 && (
                        <div className={cn(
                          'mb-4 p-3 rounded-lg flex items-center gap-3',
                          latestJob.status === 'extending' ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-blue-500/5 border border-blue-500/20'
                        )}>
                          <RefreshCw className={cn(
                            'w-4 h-4 animate-spin flex-shrink-0',
                            latestJob.status === 'extending' ? 'text-amber-400' : 'text-blue-400'
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white">
                              {latestJob.status === 'extending'
                                ? `Extending... Step ${(latestJob.extension_step || 0) + 1} of ${(latestJob.extension_total || 0) + 1}`
                                : 'Generating new variation...'}
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              {latestJob.status === 'rendering' ? 'Rendering overlay' : 'Usually takes 2-5 minutes'}
                            </p>
                          </div>
                          {latestJob.progress_pct > 0 && (
                            <div className="w-16 flex-shrink-0">
                              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all duration-1000', latestJob.status === 'extending' ? 'bg-amber-500' : 'bg-blue-500')}
                                  style={{ width: `${latestJob.progress_pct}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-0.5 text-right">{latestJob.progress_pct}%</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Full-size generating/extending state */}
                      {isJobInProgress && completedJobs.length === 0 && (
                        <div className={cn(
                          'mb-4 p-6 rounded-xl bg-zinc-900/50 text-center',
                          job?.status === 'extending' ? 'border border-amber-500/20' : 'border border-blue-500/20'
                        )}>
                          <RefreshCw className={cn(
                            'w-8 h-8 animate-spin mx-auto mb-3',
                            job?.status === 'extending' ? 'text-amber-400' : 'text-blue-400'
                          )} />
                          <p className="text-sm font-medium text-white mb-1">
                            {job?.status === 'extending'
                              ? `Extending video... Step ${(job.extension_step || 0) + 1} of ${(job.extension_total || 0) + 1}`
                              : 'Generating Video...'}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {job?.status === 'extending'
                              ? 'Adding 7 more seconds...'
                              : job?.status === 'rendering'
                                ? 'Rendering overlay...'
                                : 'Usually takes 2-5 minutes'}
                          </p>
                          {job && job.progress_pct > 0 && (
                            <div className="w-32 mx-auto mt-3">
                              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all duration-1000',
                                    job.status === 'extending' ? 'bg-amber-500' : 'bg-blue-500'
                                  )}
                                  style={{ width: `${job.progress_pct}%` }}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 mt-1">{job.progress_pct}%</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Failed state */}
                      {job?.status === 'failed' && (
                        <div className="mb-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                          <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
                            <AlertCircle className="w-4 h-4" />
                            {job.error_message || 'Video generation failed'}
                          </div>
                          <button
                            onClick={() => handleRegenerate(i)}
                            disabled={generatingIndex === i}
                            className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          >
                            <RefreshCw className={cn('w-3.5 h-3.5', generatingIndex === i && 'animate-spin')} />
                            Retry with same settings
                          </button>
                        </div>
                      )}

                      {/* Script sections */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Eye className="w-3 h-3 text-zinc-500" />
                              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.scene}</p>
                          </div>
                          {concept.script.subject && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Video className="w-3 h-3 text-zinc-500" />
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span>
                              </div>
                              <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.subject}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Zap className="w-3 h-3 text-zinc-500" />
                              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.action}</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Sparkles className="w-3 h-3 text-zinc-500" />
                              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.mood}</p>
                          </div>
                        </div>
                      </div>

                      {/* Overlay preview */}
                      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Text Overlays</div>
                        <div className="space-y-2.5">
                          <div className="flex items-start gap-2">
                            <Type className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', colors.icon)} />
                            <div>
                              <span className="text-[10px] text-zinc-500 uppercase">Hook</span>
                              <p className="text-sm font-semibold text-white">{concept.overlay.hook}</p>
                            </div>
                          </div>
                          {concept.overlay.captions.map((caption, ci) => (
                            <div key={ci} className="flex items-start gap-2">
                              <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-600" />
                              <div>
                                <span className="text-[10px] text-zinc-500 uppercase">Caption {ci + 1}</span>
                                <p className="text-sm text-zinc-300">{caption}</p>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-start gap-2">
                            <MousePointer className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', colors.icon)} />
                            <div>
                              <span className="text-[10px] text-zinc-500 uppercase">CTA</span>
                              <p className="text-sm font-semibold text-white">{concept.overlay.cta}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Rewrite Concept link */}
              <div className="text-center mt-4">
                <button
                  onClick={() => { setDirectResult(null); setConcepts([]); setConceptJobs({}); setCanvasId(null) }}
                  className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
                >
                  ← Start New Concept
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
