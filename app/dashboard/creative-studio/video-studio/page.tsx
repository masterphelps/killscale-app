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
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildConceptSoraPrompt } from '@/lib/video-prompt-templates'
import type { ProductKnowledge, ProductImage, AdConcept } from '@/lib/video-prompt-templates'
import type { VideoJob } from '@/remotion/types'

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

export default function VideoStudioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const restoredCanvasRef = useRef(false)

  // Step tracking
  const [step, setStep] = useState(1) // 1: Product, 2: Concepts

  // Step 1: Product Input
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url')
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Step 1: Pill pools (available options from analysis + custom additions)
  const [pools, setPools] = useState<Record<PillCategory, string[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })

  // Step 1: Selected pill indices per category
  const [selected, setSelected] = useState<Record<PillCategory, number[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })

  // Extra context (single-value fields from analysis, auto-included)
  const [extraContext, setExtraContext] = useState({
    targetAudience: '',
    category: '',
    uniqueSellingPoint: '',
  })

  // Video-specific intelligence from product analysis
  const [videoIntel, setVideoIntel] = useState<{
    motionOpportunities: string[]
    sensoryDetails: string[]
    visualHooks: string[]
  }>({ motionOpportunities: [], sensoryDetails: [], visualHooks: [] })

  // Product knowledge assembled from pills (used by Step 2)
  const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge>({ name: '' })

  // Product images (kept for potential future use)
  const [productImages, setProductImages] = useState<ProductImage[]>([])

  // Step 2: Video style
  type VideoStyle = 'cinematic' | 'playful' | 'conceptual' | 'satisfying' | 'broll'
  const VIDEO_STYLES: { value: VideoStyle; label: string }[] = [
    { value: 'cinematic', label: 'Cinematic' },
    { value: 'playful', label: 'Playful' },
    { value: 'conceptual', label: 'Conceptual' },
    { value: 'satisfying', label: 'Satisfying' },
    { value: 'broll', label: 'B-Roll' },
  ]
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic')
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)

  // Per-concept video quality
  type VideoQuality = 'standard' | 'premium'
  const [conceptQuality, setConceptQuality] = useState<Record<number, VideoQuality>>({})

  // Step 2: Concepts
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false)
  const [concepts, setConcepts] = useState<AdConcept[]>([])
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null)
  // Concept-driven duration + credits (Veo only)
  const VEO_BASE_DURATION = 8
  const VEO_EXTENSION_STEP = 7
  const QUALITY_COSTS = {
    standard: { base: 20, extension: 10 },   // Veo 3.1 Fast (720p)
    premium:  { base: 50, extension: 25 },    // Veo 3.1 Standard (1080p)
  }
  const getConceptQuality = (i: number): VideoQuality => conceptQuality[i] || 'standard'
  const getConceptDuration = (i: number) => {
    return concepts[i]?.estimatedDuration || VEO_BASE_DURATION
  }
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
  const [conceptError, setConceptError] = useState<string | null>(null)
  const [canvasId, setCanvasId] = useState<string | null>(null)

  // Per-concept video jobs (keyed by concept index → array of jobs, newest first)
  const [conceptJobs, setConceptJobs] = useState<Record<number, VideoJob[]>>({})
  const [currentVideoVersion, setCurrentVideoVersion] = useState<Record<number, number>>({})
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const getJobsForConcept = (i: number): VideoJob[] => conceptJobs[i] || []
  const getActiveJob = (i: number): VideoJob | null => {
    const jobs = getJobsForConcept(i)
    const version = currentVideoVersion[i] ?? 0
    return jobs[version] || null
  }

  // Credits
  const [credits, setCredits] = useState<{ remaining: number; totalAvailable: number } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.remaining !== undefined) setCredits({ remaining: d.remaining, totalAvailable: d.totalAvailable }) })
      .catch(() => {})
  }, [user?.id])

  // ─── Restore canvas from URL param (back from editor) ──────────────────────

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
        }
      } catch (err) {
        console.error('[VideoStudio] Failed to restore canvas:', err)
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
      // Auto-select newly added items
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
        // Populate pill pools from analysis
        setPools({
          name: p.name ? [p.name] : [],
          description: p.description ? [p.description] : [],
          features: p.features || [],
          benefits: p.benefits || [],
          keyMessages: p.keyMessages || [],
          testimonials: p.testimonialPoints || [],
          painPoints: p.painPoints || [],
        })
        // All pills start unselected — user picks what matters
        setSelected({
          name: [], description: [], features: [], benefits: [],
          keyMessages: [], testimonials: [], painPoints: [],
        })
        // Store extra context
        setExtraContext({
          targetAudience: p.targetAudience || '',
          category: p.category || '',
          uniqueSellingPoint: p.uniqueSellingPoint || '',
        })
        // Store video-specific intelligence
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

  // ─── Step 2: Generate Concepts ──────────────────────────────────────────────

  const handleGenerateConcepts = useCallback(async (overrideProduct?: ProductKnowledge, overrideStyle?: VideoStyle) => {
    const product = overrideProduct || productKnowledge
    const style = overrideStyle || videoStyle
    setIsGeneratingConcepts(true)
    setConcepts([])
    setConceptError(null)
    setConceptJobs({})
    setCurrentVideoVersion({})
    setCanvasId(null)
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, style }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConceptError(data.error || 'Failed to generate concepts')
        return
      }
      if (data.concepts && data.concepts.length > 0) {
        setConcepts(data.concepts)

        // Save canvas for persistence in AI Tasks
        if (user?.id && currentAccountId) {
          try {
            const canvasRes = await fetch('/api/creative-studio/video-canvas', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                adAccountId: currentAccountId,
                productUrl: productUrl || null,
                productKnowledge: product,
                concepts: data.concepts,
              }),
            })
            const canvasData = await canvasRes.json()
            if (canvasRes.ok && canvasData.canvas?.id) {
              setCanvasId(canvasData.canvas.id)
            }
          } catch (err) {
            console.error('[VideoStudio] Failed to save canvas:', err)
          }
        }
      } else {
        setConceptError('No concepts were generated. Try selecting more product details.')
      }
    } catch {
      setConceptError('Failed to generate concepts. Please try again.')
    } finally {
      setIsGeneratingConcepts(false)
    }
  }, [productKnowledge, videoStyle, user?.id, currentAccountId, productUrl])

  // Assemble product knowledge from pill selections and go to step 2
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
    // Pass assembled directly since setState is async
    handleGenerateConcepts(assembled)
  }, [pools, selected, extraContext, videoIntel, handleGenerateConcepts])

  // ─── Job polling (all in-progress jobs for this canvas) ─────────────────────

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
      console.error('[VideoStudio] Poll error:', err)
    }
  }, [user?.id, canvasId, currentAccountId])

  // Derived: are any jobs in-progress?
  const hasInProgressJobs = Object.values(conceptJobs).some(
    jobs => jobs.some(j => ['generating', 'queued', 'rendering', 'extending'].includes(j.status))
  )

  // Initial fetch when canvasId is set
  useEffect(() => {
    if (!canvasId || !user?.id) return
    refreshJobs()
  }, [canvasId, user?.id, refreshJobs])

  // Poll while any job is in-progress
  useEffect(() => {
    if (!hasInProgressJobs || !canvasId) return

    pollIntervalRef.current = setInterval(refreshJobs, 15000)
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    }
  }, [hasInProgressJobs, canvasId, refreshJobs])

  const handleGenerate = useCallback(async (conceptIndex: number) => {
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
          productImageBase64: null,
          productImageMimeType: null,
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
              const captionCount = caps.length
              const captionStart = 3
              const captionEnd = conceptDuration - 0.5
              const segmentDuration = (captionEnd - captionStart) / captionCount
              return caps.map((text, idx) => ({
                text,
                startSec: Math.round((captionStart + idx * segmentDuration) * 10) / 10,
                endSec: Math.round((captionStart + (idx + 1) * segmentDuration) * 10) / 10,
                highlight: idx < captionCount - 1,
                highlightWord: undefined as string | undefined,
                fontSize: 40,
                fontWeight: 700,
                position: 'bottom' as const,
              }))
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

      // Navigate to version 0 so user sees the new (newest) job
      setCurrentVideoVersion(prev => ({ ...prev, [conceptIndex]: 0 }))

      // Immediately refresh jobs to pick up the new one
      refreshJobs()
    } catch {
      setGenerateError('Failed to generate video')
    } finally {
      setGeneratingIndex(null)
    }
  }, [user?.id, currentAccountId, concepts, canvasId, productKnowledge.name, refreshJobs])

  // ─── Extend a completed veo-ext job by +7s ──────────────────────────────────

  const [extendingIndex, setExtendingIndex] = useState<number | null>(null)

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
      // Deduct 25 credits locally
      setCredits(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - 25) } : prev)
      // Optimistic update: update the specific job in the array
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
      console.error('[VideoStudio] Extend error:', err)
      alert('Failed to extend video')
    } finally {
      setExtendingIndex(null)
    }
  }, [user?.id, conceptJobs, currentVideoVersion])

  // ─── Add concept (AI or Custom) ─────────────────────────────────────────────

  const [addConceptMode, setAddConceptMode] = useState<'idle' | 'choosing' | 'prompting' | 'generating'>('idle')
  const [promptDirection, setPromptDirection] = useState('')
  const [editingConceptIndex, setEditingConceptIndex] = useState<number | null>(null)
  const [editingConcept, setEditingConcept] = useState<AdConcept | null>(null)

  const saveConceptsToCanvas = useCallback(async (updatedConcepts: AdConcept[]) => {
    if (!canvasId || !user?.id) return
    try {
      await fetch('/api/creative-studio/video-canvas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId, userId: user.id, concepts: updatedConcepts }),
      })
    } catch (err) {
      console.error('[VideoStudio] Failed to save canvas:', err)
    }
  }, [canvasId, user?.id])

  const handleAddAIConcept = useCallback(async () => {
    setAddConceptMode('generating')
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productKnowledge,
          count: 1,
          existingConcepts: concepts,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConceptError(data.error || 'Failed to generate concept')
        setAddConceptMode('idle')
        return
      }
      if (data.concepts?.length > 0) {
        const updated = [...concepts, data.concepts[0]]
        setConcepts(updated)
        setExpandedConcept(updated.length - 1)
        saveConceptsToCanvas(updated)
      }
    } catch {
      setConceptError('Failed to generate concept')
    } finally {
      setAddConceptMode('idle')
    }
  }, [productKnowledge, concepts, saveConceptsToCanvas])

  const handleAddPromptConcept = useCallback(async () => {
    if (!promptDirection.trim()) return
    setAddConceptMode('generating')
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productKnowledge,
          count: 1,
          existingConcepts: concepts,
          directionPrompt: promptDirection.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConceptError(data.error || 'Failed to generate concept')
        setAddConceptMode('idle')
        return
      }
      if (data.concepts?.length > 0) {
        const updated = [...concepts, data.concepts[0]]
        setConcepts(updated)
        setExpandedConcept(updated.length - 1)
        saveConceptsToCanvas(updated)
      }
    } catch {
      setConceptError('Failed to generate concept')
    } finally {
      setAddConceptMode('idle')
      setPromptDirection('')
    }
  }, [productKnowledge, concepts, saveConceptsToCanvas, promptDirection])

  const handleAddCustomConcept = useCallback(() => {
    const blank: AdConcept = {
      title: '',
      angle: '',
      logline: '',
      visualMetaphor: '',
      whyItWorks: '',
      script: { scene: '', subject: '', action: '', mood: '' },
      overlay: { hook: '', captions: ['', '', ''], cta: '' },
    }
    const newIndex = concepts.length
    setConcepts(prev => [...prev, blank])
    setEditingConceptIndex(newIndex)
    setEditingConcept(blank)
    setExpandedConcept(newIndex)
    setAddConceptMode('idle')
  }, [concepts.length])

  const handleSaveEditingConcept = useCallback(() => {
    if (editingConceptIndex === null || !editingConcept) return
    // Validate minimum fields
    if (!editingConcept.title.trim() || !editingConcept.logline.trim()) return
    const updated = [...concepts]
    updated[editingConceptIndex] = editingConcept
    setConcepts(updated)
    setEditingConceptIndex(null)
    setEditingConcept(null)
    saveConceptsToCanvas(updated)
  }, [editingConceptIndex, editingConcept, concepts, saveConceptsToCanvas])

  const handleCancelEditingConcept = useCallback(() => {
    if (editingConceptIndex === null) return
    // If this was a new blank concept (no title saved), remove it
    const existing = concepts[editingConceptIndex]
    if (!existing?.title?.trim()) {
      const updated = concepts.filter((_, i) => i !== editingConceptIndex)
      setConcepts(updated)
    }
    setEditingConceptIndex(null)
    setEditingConcept(null)
  }, [editingConceptIndex, concepts])

  const handleDeleteConcept = useCallback((index: number) => {
    const updated = concepts.filter((_, i) => i !== index)
    setConcepts(updated)
    setExpandedConcept(null)
    // Re-key jobs that have higher indices
    const newJobs: Record<number, VideoJob[]> = {}
    for (const [key, jobs] of Object.entries(conceptJobs)) {
      const k = Number(key)
      if (k < index) newJobs[k] = jobs
      else if (k > index) newJobs[k - 1] = jobs
      // k === index is deleted
    }
    setConceptJobs(newJobs)
    // Re-key version indices too
    const newVersions: Record<number, number> = {}
    for (const [key, ver] of Object.entries(currentVideoVersion)) {
      const k = Number(key)
      if (k < index) newVersions[k] = ver
      else if (k > index) newVersions[k - 1] = ver
    }
    setCurrentVideoVersion(newVersions)
    saveConceptsToCanvas(updated)
  }, [concepts, conceptJobs, currentVideoVersion, saveConceptsToCanvas])

  // ─── Derived state ──────────────────────────────────────────────────────────

  const canProceedStep1 = selected.name.length > 0

  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  // Concept card accent colors (extra colors for 5+ concepts)
  const CONCEPT_COLORS = [
    { bg: 'bg-amber-500/10', border: 'border-amber-500/30', activeBorder: 'border-amber-500', text: 'text-amber-400', icon: 'text-amber-400' },
    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', activeBorder: 'border-cyan-500', text: 'text-cyan-400', icon: 'text-cyan-400' },
    { bg: 'bg-rose-500/10', border: 'border-rose-500/30', activeBorder: 'border-rose-500', text: 'text-rose-400', icon: 'text-rose-400' },
    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', activeBorder: 'border-emerald-500', text: 'text-emerald-400', icon: 'text-emerald-400' },
    { bg: 'bg-violet-500/10', border: 'border-violet-500/30', activeBorder: 'border-violet-500', text: 'text-violet-400', icon: 'text-violet-400' },
    { bg: 'bg-sky-500/10', border: 'border-sky-500/30', activeBorder: 'border-sky-500', text: 'text-sky-400', icon: 'text-sky-400' },
    { bg: 'bg-orange-500/10', border: 'border-orange-500/30', activeBorder: 'border-orange-500', text: 'text-orange-400', icon: 'text-orange-400' },
    { bg: 'bg-teal-500/10', border: 'border-teal-500/30', activeBorder: 'border-teal-500', text: 'text-teal-400', icon: 'text-teal-400' },
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
                <Lightbulb className="w-7 h-7 text-amber-400" />
                Video Studio
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1 ml-7">Concept-first video ads that stop the scroll</p>
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
          { num: 2, label: 'Creative Concepts' },
        ].map(({ num, label }) => (
          <div key={num} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              step >= num ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'
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
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll find your value props and turn them into unexpected ad concepts.</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'url' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Globe className="w-4 h-4" />
                Product URL
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'manual' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
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
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!productUrl.trim() || isAnalyzing}
                    className="px-6 py-3 rounded-lg bg-purple-500/20 text-purple-300 font-medium hover:bg-purple-500/30 disabled:opacity-50 flex items-center gap-2"
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
                  // Hide empty sections that have no items (unless required or has items)
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
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
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
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Generate Creative Concepts
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════ Step 2: Concepts ═══════════════════════════ */}
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

          {/* Provider selector removed — now per-concept card */}

          {/* Loading state */}
          {isGeneratingConcepts && (
            <div className="bg-bg-card border border-border rounded-xl p-10 mb-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4">
                <Lightbulb className="w-8 h-8 text-purple-400 animate-pulse" />
              </div>
              <p className="text-base font-medium text-white mb-1">Thinking like a creative director...</p>
              <p className="text-sm text-zinc-500">Finding unexpected metaphors for <strong className="text-zinc-300">{productKnowledge.name}</strong></p>
              <div className="mt-4 flex items-center justify-center gap-1">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-purple-400"
                    style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {conceptError && !isGeneratingConcepts && (
            <div className="bg-bg-card border border-red-500/20 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
                <AlertCircle className="w-4 h-4" />
                {conceptError}
              </div>
              <button
                onClick={() => handleGenerateConcepts()}
                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            </div>
          )}

          {/* Concept cards */}
          {!isGeneratingConcepts && concepts.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{concepts.length} Creative Concept{concepts.length !== 1 ? 's' : ''}</h2>
                  <p className="text-sm text-zinc-500">Each one is a completely different approach. Pick the one that feels right.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 hover:border-purple-500/30 hover:text-purple-300 transition-colors"
                    >
                      {VIDEO_STYLES.find(s => s.value === videoStyle)?.label}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {styleDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setStyleDropdownOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-card border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[140px]">
                          {VIDEO_STYLES.map(s => (
                            <button
                              key={s.value}
                              onClick={() => { setVideoStyle(s.value); setStyleDropdownOpen(false) }}
                              className={cn(
                                'w-full text-left px-3 py-1.5 text-xs transition-colors',
                                s.value === videoStyle
                                  ? 'text-purple-300 bg-purple-500/10'
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => handleGenerateConcepts()}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-purple-400 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {concepts.map((concept, i) => {
                  const colors = CONCEPT_COLORS[i % CONCEPT_COLORS.length]
                  const isExpanded = expandedConcept === i
                  const isEditing = editingConceptIndex === i
                  const ec = isEditing ? editingConcept : null
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
                      className={cn(
                        'rounded-xl border-2 transition-all',
                        isExpanded ? `${colors.activeBorder} ${colors.bg}` : 'border-border hover:border-zinc-600 bg-bg-card'
                      )}
                    >
                      {/* Card header — always visible */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!isEditing) setExpandedConcept(isExpanded ? null : i) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !isEditing) setExpandedConcept(isExpanded ? null : i) }}
                        className="w-full p-5 text-left cursor-pointer"
                      >
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold',
                            isExpanded ? `${colors.bg} ${colors.text}` : 'bg-zinc-800 text-zinc-500'
                          )}>
                            {i + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-bold text-white text-base">{concept.title || (isEditing ? 'New Custom Concept' : 'Untitled')}</h3>
                              {concept.angle && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/20 text-purple-300">
                                  {concept.angle}
                                </span>
                              )}
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
                            {concept.logline && <p className="text-sm text-zinc-300 mb-2">{concept.logline}</p>}
                            {concept.whyItWorks && <p className="text-xs text-zinc-500 italic">{concept.whyItWorks}</p>}
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!isEditing && concept.title && !jobs.length && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingConceptIndex(i)
                                  setEditingConcept({ ...concept, overlay: { ...concept.overlay, captions: [...(concept.overlay?.captions || [])] }, script: concept.script ? { ...concept.script } : { scene: '', subject: '', action: '', mood: '' } })
                                  setExpandedConcept(i)
                                }}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                                title="Edit concept"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!isEditing && !jobs.length && concepts.length > 1 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteConcept(i) }}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Delete concept"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className="text-zinc-500">
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded: EDIT MODE */}
                      {isExpanded && isEditing && ec && (
                        <div className="px-5 pb-5 border-t border-border/50 pt-4 space-y-4">
                          {/* Title + Angle */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Title</label>
                              <input
                                value={ec.title}
                                onChange={(e) => setEditingConcept({ ...ec, title: e.target.value })}
                                placeholder="2-4 word concept name"
                                className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Angle</label>
                              <input
                                value={ec.angle}
                                onChange={(e) => setEditingConcept({ ...ec, angle: e.target.value })}
                                placeholder="e.g. Problem → Solution, Feature Spotlight"
                                className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                              />
                            </div>
                          </div>

                          {/* Logline */}
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Logline</label>
                            <input
                              value={ec.logline}
                              onChange={(e) => setEditingConcept({ ...ec, logline: e.target.value })}
                              placeholder="1 sentence creative pitch"
                              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                            />
                          </div>

                          {/* Visual Metaphor */}
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Visual Metaphor</label>
                            <textarea
                              value={ec.visualMetaphor}
                              onChange={(e) => setEditingConcept({ ...ec, visualMetaphor: e.target.value })}
                              placeholder="What value prop this represents and how the visual communicates it"
                              rows={2}
                              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                            />
                          </div>

                          {/* Why It Works */}
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Why It Works</label>
                            <textarea
                              value={ec.whyItWorks}
                              onChange={(e) => setEditingConcept({ ...ec, whyItWorks: e.target.value })}
                              placeholder="Why this stops scrolling"
                              rows={2}
                              className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                            />
                          </div>

                          {/* Script sections */}
                          <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Script</div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div>
                                <label className="flex items-center gap-1.5 mb-1">
                                  <Eye className="w-3 h-3 text-zinc-500" />
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span>
                                </label>
                                <textarea
                                  value={ec.script.scene}
                                  onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, scene: e.target.value } })}
                                  placeholder="Environment, lighting, atmosphere"
                                  rows={3}
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1.5 mb-1">
                                  <Video className="w-3 h-3 text-zinc-500" />
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span>
                                </label>
                                <textarea
                                  value={ec.script.subject}
                                  onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, subject: e.target.value } })}
                                  placeholder="Who/what is in the shot"
                                  rows={3}
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1.5 mb-1">
                                  <Zap className="w-3 h-3 text-zinc-500" />
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span>
                                </label>
                                <textarea
                                  value={ec.script.action}
                                  onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, action: e.target.value } })}
                                  placeholder="Beat-by-beat with camera movements"
                                  rows={3}
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1.5 mb-1">
                                  <Sparkles className="w-3 h-3 text-zinc-500" />
                                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span>
                                </label>
                                <textarea
                                  value={ec.script.mood}
                                  onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, mood: e.target.value } })}
                                  placeholder="Color grade, energy, sound design"
                                  rows={3}
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Overlay inputs */}
                          <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Text Overlays</div>
                            <div className="space-y-3">
                              <div>
                                <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Hook</label>
                                <input
                                  value={ec.overlay.hook}
                                  onChange={(e) => setEditingConcept({ ...ec, overlay: { ...ec.overlay, hook: e.target.value } })}
                                  placeholder="Opening text (first 2 seconds)"
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                                />
                              </div>
                              {ec.overlay.captions.map((cap, ci) => (
                                <div key={ci}>
                                  <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Caption {ci + 1}</label>
                                  <input
                                    value={cap}
                                    onChange={(e) => {
                                      const newCaptions = [...ec.overlay.captions]
                                      newCaptions[ci] = e.target.value
                                      setEditingConcept({ ...ec, overlay: { ...ec.overlay, captions: newCaptions } })
                                    }}
                                    placeholder={`Caption for beat ${ci + 1}`}
                                    className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                                  />
                                </div>
                              ))}
                              <div>
                                <label className="text-[10px] text-zinc-500 uppercase mb-1 block">CTA</label>
                                <input
                                  value={ec.overlay.cta}
                                  onChange={(e) => setEditingConcept({ ...ec, overlay: { ...ec.overlay, cta: e.target.value } })}
                                  placeholder="Call-to-action button text"
                                  className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Save / Cancel */}
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSaveEditingConcept() }}
                              disabled={!ec.title.trim() || !ec.logline.trim()}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              <Save className="w-4 h-4" />
                              Save Concept
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelEditingConcept() }}
                              className="px-4 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm border border-border"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Expanded: READ-ONLY MODE (existing behavior) */}
                      {isExpanded && !isEditing && (
                        <div className="px-5 pb-5 border-t border-border/50 pt-4">
                          {/* Video carousel — shown when any completed video exists */}
                          {hasVideo && (
                            <div className="mb-4">
                              <div className="flex items-center gap-3 justify-center">
                                {/* Left arrow — go to older version */}
                                {completedJobs.length > 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const nextVersion = Math.min(activeVersion + 1, jobs.length - 1)
                                      // Find next completed job
                                      let target = nextVersion
                                      while (target < jobs.length && !(jobs[target].status === 'complete' && (jobs[target].final_video_url || jobs[target].raw_video_url))) target++
                                      if (target < jobs.length) setCurrentVideoVersion(prev => ({ ...prev, [i]: target }))
                                    }}
                                    disabled={(() => {
                                      // disabled if no older completed job
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
                                  {/* Provider + duration badge */}
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
                                  {/* Version dots */}
                                  {completedJobs.length > 1 && (
                                    <div className="flex items-center gap-1.5 mt-2">
                                      {completedJobs.map((cj, ci) => (
                                        <button
                                          key={cj.id}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const jobIndex = jobs.indexOf(cj)
                                            if (jobIndex >= 0) setCurrentVideoVersion(prev => ({ ...prev, [i]: jobIndex }))
                                          }}
                                          className={cn(
                                            'w-2 h-2 rounded-full transition-all',
                                            jobs.indexOf(cj) === activeVersion
                                              ? 'bg-purple-400 scale-125'
                                              : 'bg-zinc-700 hover:bg-zinc-500'
                                          )}
                                          title={`Version ${ci + 1}`}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Right arrow — go to newer version */}
                                {completedJobs.length > 1 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // Find next newer completed job
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

                                {/* +7 sec extend button — for Veo jobs */}
                                {job && (job.provider === 'veo-ext' || job.provider === 'veo') && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleExtend(i) }}
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
                                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/creative-studio/video-editor?jobId=${job!.id}`) }}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/20"
                                >
                                  <Film className="w-3.5 h-3.5" />
                                  Edit Video
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleGenerate(i) }}
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

                          {/* Full-size generating/extending state — only when NO completed videos exist */}
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

                          {/* Failed state — with retry + full generate controls */}
                          {job?.status === 'failed' && (
                            <div className="mb-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                              <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
                                <AlertCircle className="w-4 h-4" />
                                {job.error_message || 'Video generation failed'}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleGenerate(i) }}
                                disabled={generatingIndex === i}
                                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                              >
                                <RefreshCw className={cn('w-3.5 h-3.5', generatingIndex === i && 'animate-spin')} />
                                Retry with same settings
                              </button>
                            </div>
                          )}

                          {/* Visual metaphor callout */}
                          <div className={cn('rounded-lg p-3 mb-4', colors.bg)}>
                            <div className={cn('text-[10px] uppercase tracking-wider font-semibold mb-1', colors.text)}>Visual Metaphor</div>
                            <p className="text-sm text-zinc-300">{concept.visualMetaphor}</p>
                          </div>

                          {/* Script sections — guard for concepts without script (e.g. UGC from Ad Studio) */}
                          {concept.script ? (
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
                          ) : concept.videoPrompt ? (
                          <div className="mb-4">
                            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-4">{concept.videoPrompt}</p>
                          </div>
                          ) : null}

                          {/* Overlay preview */}
                          <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4 mb-4">
                            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Text Overlays (added in editor)</div>
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

                          {/* Provider + Duration + Generate — shown when no job or last attempt failed */}
                          {(!job || job.status === 'failed') && (() => {
                            const cDuration = getConceptDuration(i)
                            const cCost = getConceptCreditCost(i)
                            return (
                              <>
                                {generateError && generatingIndex === i && (
                                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-3">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {generateError}
                                  </div>
                                )}

                                {/* Quality selector */}
                                <div className="flex gap-2 mb-3">
                                  {(['standard', 'premium'] as const).map(q => {
                                    const isActive = getConceptQuality(i) === q
                                    const qCosts = QUALITY_COSTS[q]
                                    const extensions = cDuration > VEO_BASE_DURATION ? Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
                                    const totalCost = qCosts.base + extensions * qCosts.extension
                                    return (
                                      <button
                                        key={q}
                                        onClick={(e) => { e.stopPropagation(); setConceptQuality(prev => ({ ...prev, [i]: q })) }}
                                        className={cn(
                                          'flex-1 px-3 py-2 rounded-lg border transition-all text-left',
                                          isActive
                                            ? 'bg-purple-500/10 border-purple-500/40'
                                            : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                                        )}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className={cn('text-xs font-medium', isActive ? 'text-purple-300' : 'text-zinc-400')}>
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
                                <div className="flex items-center gap-3 mb-3">
                                  <span className="text-xs font-medium text-zinc-300">Veo 3.1{getConceptQuality(i) === 'standard' ? ' Fast' : ''}</span>
                                  <span className="text-xs text-zinc-500">{cDuration}s</span>
                                  {cDuration > VEO_BASE_DURATION && (
                                    <span className="text-[10px] text-purple-400/80">({Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)} extension{Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) > 1 ? 's' : ''})</span>
                                  )}
                                </div>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleGenerate(i) }}
                                  disabled={generatingIndex !== null || (credits !== null && credits.remaining < cCost)}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                                >
                                  {generatingIndex === i ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Starting generation...
                                    </>
                                  ) : (
                                    <>
                                      <Video className="w-4 h-4" />
                                      Generate {cDuration}s Video · {cCost} credits
                                    </>
                                  )}
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add Concept button */}
              <div className="mt-4">
                {addConceptMode === 'idle' && (
                  <button
                    onClick={() => setAddConceptMode('choosing')}
                    className="w-full py-4 border-2 border-dashed border-zinc-700 rounded-xl hover:border-purple-500/50 text-zinc-500 hover:text-purple-300 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Add Concept
                  </button>
                )}

                {addConceptMode === 'choosing' && (
                  <div className="flex items-center gap-3 justify-center py-4">
                    <button
                      onClick={handleAddAIConcept}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors text-sm font-medium"
                    >
                      <Sparkles className="w-4 h-4" />
                      AI Generate
                    </button>
                    <button
                      onClick={() => setAddConceptMode('prompting')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm font-medium"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Prompt
                    </button>
                    <button
                      onClick={handleAddCustomConcept}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 border border-border hover:bg-zinc-700 transition-colors text-sm font-medium"
                    >
                      <Pencil className="w-4 h-4" />
                      Custom
                    </button>
                    <button
                      onClick={() => setAddConceptMode('idle')}
                      className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {addConceptMode === 'prompting' && (
                  <div className="py-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={promptDirection}
                        onChange={(e) => setPromptDirection(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && promptDirection.trim()) handleAddPromptConcept() }}
                        placeholder='e.g. "alligator walking through a carwash"'
                        className="flex-1 px-4 py-2.5 bg-zinc-900 border border-border rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                        autoFocus
                      />
                      <button
                        onClick={handleAddPromptConcept}
                        disabled={!promptDirection.trim()}
                        className="px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Generate
                      </button>
                      <button
                        onClick={() => { setAddConceptMode('idle'); setPromptDirection('') }}
                        className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 text-center">Describe your idea — AI will build a full concept around it</p>
                  </div>
                )}

                {addConceptMode === 'generating' && (
                  <div className="flex items-center justify-center gap-2 py-4 text-purple-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Generating new concept...</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pulse animation keyframes */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
