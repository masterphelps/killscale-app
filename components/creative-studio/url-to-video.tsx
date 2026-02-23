'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Globe,
  Type,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Pencil,
  Film,
  Link2,
  RefreshCw,
  Eye,
  Zap,
  Video,
  MessageSquare,
  MousePointer,
  Clapperboard,
  Download,
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

// ─── Concept card colors ────────────────────────────────────────────────────

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

// ─── Video style options ────────────────────────────────────────────────────

type VideoStyle = 'cinematic' | 'product' | 'macro' | 'conceptual' | 'documentary'
const VIDEO_STYLES: { value: VideoStyle; label: string }[] = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'product', label: 'Product' },
  { value: 'macro', label: 'Macro' },
  { value: 'conceptual', label: 'Conceptual' },
  { value: 'documentary', label: 'Documentary' },
]

// ─── Quality + credit costs ─────────────────────────────────────────────────

type VideoQuality = 'standard' | 'premium'
const VEO_BASE_DURATION = 8
const VEO_EXTENSION_STEP = 7
const QUALITY_COSTS = {
  standard: { base: 20, extension: 10 },
  premium: { base: 50, extension: 25 },
}

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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-zinc-500 border border-dashed border-zinc-700 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
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
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
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
              className="bg-bg-dark border border-blue-500/30 rounded-full px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none w-48"
            />
            <button onClick={() => { setIsAdding(false); setInput('') }} className="text-zinc-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-zinc-600 border border-dashed border-zinc-700 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
            title={`Add custom ${label.toLowerCase()}`}
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface URLToVideoProps {
  userId: string
  adAccountId: string
  credits: { remaining: number; totalAvailable: number } | null
  onCreditsChanged: () => void
  onBack: () => void
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function URLToVideo({
  userId,
  adAccountId,
  credits,
  onCreditsChanged,
  onBack,
}: URLToVideoProps) {
  // Product input
  const [inputMode, setInputMode] = useState<'url' | 'manual'>('url')
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  // Product knowledge from analyze-product-url API
  const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge | null>(null)
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)
  const [includeProductImage, setIncludeProductImage] = useState(true)

  // Pill pools (7 categories)
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

  // Sub-mode toggle
  const [subMode, setSubMode] = useState<'concepts' | 'direct'>('concepts')

  // Video style
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic')
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)

  // Concepts
  const [concepts, setConcepts] = useState<AdConcept[]>([])
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null)
  const [conceptError, setConceptError] = useState<string | null>(null)
  const [generatingConcepts, setGeneratingConcepts] = useState(false)

  // Per-concept video quality
  const [conceptQuality, setConceptQuality] = useState<Record<number, VideoQuality>>({})

  // Canvas (persistence for AI Tasks)
  const [canvasId, setCanvasId] = useState<string | null>(null)

  // Per-concept video jobs
  const [conceptJobs, setConceptJobs] = useState<Record<number, VideoJob[]>>({})
  const [currentVideoVersion, setCurrentVideoVersion] = useState<Record<number, number>>({})
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const [extendingIndex, setExtendingIndex] = useState<number | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Add concept
  const [addConceptMode, setAddConceptMode] = useState<'idle' | 'choosing' | 'prompting' | 'generating'>('idle')
  const [promptDirection, setPromptDirection] = useState('')

  // ─── Direct mode state ──────────────────────────────────────────────────────
  const [directPrompt, setDirectPrompt] = useState('')
  const [directScript, setDirectScript] = useState<DirectConceptResult | null>(null)
  const [directWriting, setDirectWriting] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)

  // Director's Review editable fields
  const [editScene, setEditScene] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editAction, setEditAction] = useState('')
  const [editMood, setEditMood] = useState('')
  const [editVideoPrompt, setEditVideoPrompt] = useState('')
  const [editExtensionPrompts, setEditExtensionPrompts] = useState<string[]>([])
  const [editHook, setEditHook] = useState('')
  const [editCta, setEditCta] = useState('')
  const [directOverlaysEnabled, setDirectOverlaysEnabled] = useState(true)
  const [directQuality, setDirectQuality] = useState<'standard' | 'premium'>('standard')
  const [showVeoPrompt, setShowVeoPrompt] = useState(true)
  const [showExtensions, setShowExtensions] = useState(false)

  // Direct video generation
  const [directGenerating, setDirectGenerating] = useState(false)
  const [directVideoJob, setDirectVideoJob] = useState<VideoJob | null>(null)

  // ─── Quality + cost helpers ────────────────────────────────────────────────

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

  // Job helpers
  const getJobsForConcept = (i: number): VideoJob[] => conceptJobs[i] || []
  const getActiveJob = (i: number): VideoJob | null => {
    const jobs = getJobsForConcept(i)
    const version = currentVideoVersion[i] ?? 0
    return jobs[version] || null
  }

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

  // ─── Product Analysis ───────────────────────────────────────────────────────

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
        // All pills start unselected -- user picks what matters
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

  // ─── Assemble product knowledge from pills ─────────────────────────────────

  const assembleProductKnowledge = useCallback((): ProductKnowledge => {
    return {
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
  }, [pools, selected, extraContext, videoIntel])

  // ─── Generate Concepts ────────────────────────────────────────────────────

  const handleGenerateConcepts = useCallback(async (overrideProduct?: ProductKnowledge) => {
    const product = overrideProduct || productKnowledge || assembleProductKnowledge()
    setGeneratingConcepts(true)
    setConcepts([])
    setConceptError(null)
    setConceptJobs({})
    setCurrentVideoVersion({})
    setCanvasId(null)
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, style: videoStyle, includeProductImage }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConceptError(data.error || 'Failed to generate concepts')
        return
      }
      if (data.concepts && data.concepts.length > 0) {
        setConcepts(data.concepts)

        // Save canvas for persistence
        try {
          const canvasRes = await fetch('/api/creative-studio/video-canvas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              adAccountId,
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
          console.error('[URLToVideo] Failed to save canvas:', err)
        }
      } else {
        setConceptError('No concepts were generated. Try selecting more product details.')
      }
    } catch {
      setConceptError('Failed to generate concepts. Please try again.')
    } finally {
      setGeneratingConcepts(false)
    }
  }, [productKnowledge, videoStyle, userId, adAccountId, productUrl, includeProductImage, assembleProductKnowledge])

  const handleClickGenerateConcepts = useCallback(() => {
    const assembled = assembleProductKnowledge()
    setProductKnowledge(assembled)
    handleGenerateConcepts(assembled)
  }, [assembleProductKnowledge, handleGenerateConcepts])

  // ─── Job polling ──────────────────────────────────────────────────────────

  const refreshJobs = useCallback(async () => {
    if (!userId || !canvasId) return
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adAccountId, canvasId }),
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
      console.error('[URLToVideo] Poll error:', err)
    }
  }, [userId, canvasId, adAccountId])

  // Derived: are any jobs in-progress?
  const hasInProgressJobs = Object.values(conceptJobs).some(
    jobs => jobs.some(j => ['generating', 'queued', 'rendering', 'extending'].includes(j.status))
  )

  // Initial fetch when canvasId is set
  useEffect(() => {
    if (!canvasId || !userId) return
    refreshJobs()
  }, [canvasId, userId, refreshJobs])

  // Poll while any job is in-progress
  useEffect(() => {
    if (!hasInProgressJobs || !canvasId) return
    pollIntervalRef.current = setInterval(refreshJobs, 15000)
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    }
  }, [hasInProgressJobs, canvasId, refreshJobs])

  // Listen for background poller updates
  useEffect(() => {
    if (!canvasId) return
    const handler = () => refreshJobs()
    window.addEventListener('video-jobs-updated', handler)
    return () => window.removeEventListener('video-jobs-updated', handler)
  }, [canvasId, refreshJobs])

  // ─── Generate Video ───────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (conceptIndex: number) => {
    if (!userId || !adAccountId) return

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
          userId,
          adAccountId,
          prompt: fullPrompt,
          videoStyle: 'concept',
          durationSeconds: conceptDuration,
          canvasId: canvasId || null,
          productName: (productKnowledge || assembleProductKnowledge()).name || null,
          adIndex: conceptIndex,
          productImageBase64: includeProductImage ? (productImages[selectedProductImageIdx]?.base64 || null) : null,
          productImageMimeType: includeProductImage ? (productImages[selectedProductImageIdx]?.mimeType || null) : null,
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
      onCreditsChanged()
      notifyCreditsChanged()

      // Navigate to version 0 so user sees the newest job
      setCurrentVideoVersion(prev => ({ ...prev, [conceptIndex]: 0 }))

      // Immediately refresh jobs
      refreshJobs()
    } catch {
      setGenerateError('Failed to generate video')
    } finally {
      setGeneratingIndex(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adAccountId, concepts, canvasId, productKnowledge, refreshJobs, includeProductImage, productImages, selectedProductImageIdx, onCreditsChanged, assembleProductKnowledge])

  // ─── Extend Video ─────────────────────────────────────────────────────────

  const handleExtend = useCallback(async (conceptIndex: number) => {
    if (!userId) return
    const job = getActiveJob(conceptIndex)
    if (!job || job.status !== 'complete' || (job.provider !== 'veo-ext' && job.provider !== 'veo')) return

    setExtendingIndex(conceptIndex)
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Extension failed')
        return
      }
      onCreditsChanged()
      notifyCreditsChanged()
      // Optimistic update
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
      console.error('[URLToVideo] Extend error:', err)
      alert('Failed to extend video')
    } finally {
      setExtendingIndex(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, conceptJobs, currentVideoVersion, onCreditsChanged])

  // ─── Add AI Concept ───────────────────────────────────────────────────────

  const saveConceptsToCanvas = useCallback(async (updatedConcepts: AdConcept[]) => {
    if (!canvasId || !userId) return
    try {
      await fetch('/api/creative-studio/video-canvas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId, userId, concepts: updatedConcepts }),
      })
    } catch (err) {
      console.error('[URLToVideo] Failed to save canvas:', err)
    }
  }, [canvasId, userId])

  const handleAddAIConcept = useCallback(async () => {
    setAddConceptMode('generating')
    const product = productKnowledge || assembleProductKnowledge()
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          count: 1,
          existingConcepts: concepts,
          includeProductImage,
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
  }, [productKnowledge, concepts, saveConceptsToCanvas, includeProductImage, assembleProductKnowledge])

  const handleAddPromptConcept = useCallback(async () => {
    if (!promptDirection.trim()) return
    setAddConceptMode('generating')
    const product = productKnowledge || assembleProductKnowledge()
    try {
      const res = await fetch('/api/creative-studio/generate-ad-concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          count: 1,
          existingConcepts: concepts,
          directionPrompt: promptDirection.trim(),
          includeProductImage,
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
  }, [productKnowledge, concepts, saveConceptsToCanvas, promptDirection, includeProductImage, assembleProductKnowledge])

  // ─── Direct: Write Concept ──────────────────────────────────────────────────

  const handleWriteDirectConcept = useCallback(async () => {
    if (!directPrompt.trim()) return
    const product = productKnowledge || assembleProductKnowledge()
    if (!product.name) return

    setDirectWriting(true)
    setDirectError(null)
    setDirectScript(null)

    try {
      const res = await fetch('/api/creative-studio/generate-direct-concept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          conceptPrompt: directPrompt,
          style: videoStyle,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDirectError(data.error || 'Failed to write concept')
        return
      }
      const result = data as DirectConceptResult
      setDirectScript(result)
      // Populate editable fields
      setEditScene(result.scene || '')
      setEditSubject(result.subject || '')
      setEditAction(result.action || '')
      setEditMood(result.mood || '')
      setEditVideoPrompt(result.videoPrompt || '')
      setEditExtensionPrompts(result.extensionPrompts || [])
      setEditHook(result.overlay?.hook || '')
      setEditCta(result.overlay?.cta || 'Shop Now')
      setShowExtensions(!!(result.extensionPrompts?.length))
    } catch {
      setDirectError('Failed to write concept. Please try again.')
    } finally {
      setDirectWriting(false)
    }
  }, [directPrompt, productKnowledge, videoStyle, assembleProductKnowledge])

  // ─── Direct: Generate Video ────────────────────────────────────────────────

  const directExtensionCount = editExtensionPrompts.length
  const directCosts = QUALITY_COSTS[directQuality]
  const directCreditCost = directCosts.base + directExtensionCount * directCosts.extension
  const directEstimatedDuration = 8 + directExtensionCount * VEO_EXTENSION_STEP
  const directCanAfford = credits ? credits.remaining >= directCreditCost : true

  const handleDirectGenerate = useCallback(async () => {
    if (!userId || !adAccountId) return

    setDirectGenerating(true)
    setGenerateError(null)

    try {
      const isExtended = directExtensionCount > 0
      const apiProvider = isExtended ? 'veo-ext' : 'veo'
      const duration = 8 + directExtensionCount * VEO_EXTENSION_STEP
      const product = productKnowledge || assembleProductKnowledge()

      // Create canvas if first generation
      let currentCanvasId = canvasId
      if (!currentCanvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            adAccountId,
            productUrl: productUrl || null,
            productKnowledge: { ...product, _studioMode: 'direct' },
            concepts: [{
              title: 'Direct Concept',
              angle: 'Direct',
              logline: directPrompt.slice(0, 80),
              visualMetaphor: editAction,
              whyItWorks: `User-directed concept: ${editScene}`,
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
      const overlayConfig = directOverlaysEnabled ? {
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
          videoStyle: 'concept',
          durationSeconds: duration,
          productName: product.name || null,
          provider: apiProvider,
          quality: directQuality,
          canvasId: currentCanvasId || null,
          adIndex: 0,
          targetDurationSeconds: isExtended ? duration : undefined,
          extensionPrompts: isExtended ? editExtensionPrompts : undefined,
          overlayConfig,
          productImageBase64: includeProductImage ? (productImages[selectedProductImageIdx]?.base64 || null) : null,
          productImageMimeType: includeProductImage ? (productImages[selectedProductImageIdx]?.mimeType || null) : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate video')
      }

      // Set initial job state from response
      setDirectVideoJob({
        id: data.jobId,
        user_id: userId,
        ad_account_id: adAccountId,
        prompt: editVideoPrompt,
        video_style: 'concept',
        duration_seconds: duration,
        status: 'queued',
        progress_pct: 0,
        credit_cost: directCreditCost,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      onCreditsChanged()
      notifyCreditsChanged()
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate video')
    } finally {
      setDirectGenerating(false)
    }
  }, [userId, adAccountId, productKnowledge, assembleProductKnowledge, canvasId, productUrl, directPrompt, editScene, editAction, editVideoPrompt, editExtensionPrompts, editHook, editCta, directOverlaysEnabled, directQuality, directExtensionCount, directCreditCost, includeProductImage, productImages, selectedProductImageIdx, onCreditsChanged])

  // ─── Direct: Video polling ─────────────────────────────────────────────────

  useEffect(() => {
    if (!directVideoJob || directVideoJob.status === 'complete' || directVideoJob.status === 'failed') return

    const poll = async () => {
      try {
        const res = await fetch(`/api/creative-studio/video-status?jobId=${directVideoJob.id}&userId=${userId}`)
        const data = await res.json()
        if (data.status) {
          setDirectVideoJob(prev => prev ? {
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
  }, [directVideoJob?.id, directVideoJob?.status, userId])

  // ─── Direct: Reset ─────────────────────────────────────────────────────────

  const resetDirect = useCallback(() => {
    setDirectPrompt('')
    setDirectScript(null)
    setDirectWriting(false)
    setDirectError(null)
    setEditScene('')
    setEditSubject('')
    setEditAction('')
    setEditMood('')
    setEditVideoPrompt('')
    setEditExtensionPrompts([])
    setEditHook('')
    setEditCta('')
    setDirectOverlaysEnabled(true)
    setDirectQuality('standard')
    setDirectGenerating(false)
    setDirectVideoJob(null)
  }, [])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const canProceed = selected.name.length > 0
  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)
  const hasConcepts = concepts.length > 0

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-[1000px] mx-auto px-4 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Link2 className="w-7 h-7 text-blue-400" />
                URL to Video
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1 ml-7">Enter a product URL to generate video ad concepts</p>
          </div>
          {credits && (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
              <Sparkles className="w-3 h-3" />
              {credits.remaining} credits remaining
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Section A: Product Input */}
          <div className="bg-bg-card border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1">What product is this ad for?</h2>
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll find your value props and turn them into video ad concepts.</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInputMode('url')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'url' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
                )}
              >
                <Globe className="w-4 h-4" />
                Product URL
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  inputMode === 'manual' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400 border border-border'
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
                    className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!productUrl.trim() || isAnalyzing}
                    className="px-6 py-3 rounded-lg bg-blue-500/20 text-blue-300 font-medium hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-2"
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
                Found {totalPillsFound} items -- select the ones you want in your creative brief
              </div>
            )}

            {/* Product image picker */}
            {productImages.length > 1 && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400 mb-2 block">Product image for video generation -- click to change</label>
                <div className="flex flex-wrap gap-2">
                  {productImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedProductImageIdx(i)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all',
                        selectedProductImageIdx === i
                          ? 'border-blue-500 ring-2 ring-blue-500/30'
                          : 'border-border hover:border-zinc-500'
                      )}
                    >
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={img.description || `Image ${i + 1}`}
                        className="w-full h-full object-contain bg-zinc-900"
                      />
                      {selectedProductImageIdx === i && (
                        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Include product image toggle */}
            {productImages.length > 0 && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProductImage}
                  onChange={(e) => setIncludeProductImage(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-xs text-zinc-400">Include product image in video</span>
              </label>
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

          {/* Section C: Sub-mode toggle + content */}
          {(hasAnalyzed || inputMode === 'manual') && canProceed && (
            <div className="bg-bg-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-3">Generation Mode</h2>
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setSubMode('concepts')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'concepts'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                  )}
                >
                  <Lightbulb className="w-4 h-4" />
                  Generate Concepts
                </button>
                <button
                  onClick={() => setSubMode('direct')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'direct'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                  )}
                >
                  <Pencil className="w-4 h-4" />
                  Direct
                </button>
              </div>

              {/* ═══ Concepts sub-mode ═══ */}
              {subMode === 'concepts' && (
                <>
                  {/* Video Style pills + Generate button (before concepts are generated) */}
                  {!hasConcepts && !generatingConcepts && (
                    <div>
                      <div className="mb-4">
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
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                  : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleClickGenerateConcepts}
                        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Generate 4 Concepts
                      </button>
                    </div>
                  )}

                  {/* Loading state */}
                  {generatingConcepts && (
                    <div className="bg-zinc-900/50 border border-border rounded-xl p-10 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-4">
                        <Lightbulb className="w-8 h-8 text-blue-400 animate-pulse" />
                      </div>
                      <p className="text-base font-medium text-white mb-1">Thinking like a creative director...</p>
                      <p className="text-sm text-zinc-500">Finding unexpected metaphors for <strong className="text-zinc-300">{(productKnowledge || assembleProductKnowledge()).name}</strong></p>
                      <div className="mt-4 flex items-center justify-center gap-1">
                        {[0, 1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-blue-400"
                            style={{ animation: `urlToVideoPulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error state */}
                  {conceptError && !generatingConcepts && (
                    <div className="bg-zinc-900/50 border border-red-500/20 rounded-xl p-6">
                      <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
                        <AlertCircle className="w-4 h-4" />
                        {conceptError}
                      </div>
                      <button
                        onClick={() => handleGenerateConcepts()}
                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Try again
                      </button>
                    </div>
                  )}

                  {/* Concept cards */}
                  {!generatingConcepts && hasConcepts && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-semibold text-white">{concepts.length} Creative Concept{concepts.length !== 1 ? 's' : ''}</h3>
                          <p className="text-xs text-zinc-500">Each one is a completely different approach. Pick the one that feels right.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <button
                              onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 hover:border-blue-500/30 hover:text-blue-300 transition-colors"
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
                                          ? 'text-blue-300 bg-blue-500/10'
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
                            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
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
                              {/* Card header */}
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setExpandedConcept(isExpanded ? null : i)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setExpandedConcept(isExpanded ? null : i) }}
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
                                      <h3 className="font-bold text-white text-base">{concept.title || 'Untitled'}</h3>
                                      {concept.angle && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300">
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

                                  <div className="text-zinc-500 flex-shrink-0">
                                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded content */}
                              {isExpanded && (
                                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                                  {/* Video carousel */}
                                  {hasVideo && (
                                    <div className="mb-4">
                                      <div className="flex items-center gap-3 justify-center">
                                        {/* Left arrow */}
                                        {completedJobs.length > 1 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
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
                                                      ? 'bg-blue-400 scale-125'
                                                      : 'bg-zinc-700 hover:bg-zinc-500'
                                                  )}
                                                  title={`Version ${ci + 1}`}
                                                />
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {/* Right arrow */}
                                        {completedJobs.length > 1 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
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
                                          onClick={(e) => { e.stopPropagation(); window.location.href = `/dashboard/creative-studio/video-editor?jobId=${job!.id}` }}
                                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors border border-blue-500/20"
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

                                  {/* Full-size generating state -- only when NO completed videos exist */}
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

                                  {/* Script sections */}
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

                                  {/* Generate controls -- shown when no job or last attempt failed */}
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
                                                    ? 'bg-blue-500/10 border-blue-500/40'
                                                    : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                                                )}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className={cn('text-xs font-medium', isActive ? 'text-blue-300' : 'text-zinc-400')}>
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
                                            <span className="text-[10px] text-blue-400/80">({Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)} extension{Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) > 1 ? 's' : ''})</span>
                                          )}
                                        </div>

                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleGenerate(i) }}
                                          disabled={generatingIndex !== null || (credits !== null && credits.remaining < cCost)}
                                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
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
                            className="w-full py-4 border-2 border-dashed border-zinc-700 rounded-xl hover:border-blue-500/50 text-zinc-500 hover:text-blue-300 transition-all flex items-center justify-center gap-2"
                          >
                            <Plus className="w-5 h-5" />
                            Add Concept
                          </button>
                        )}

                        {addConceptMode === 'choosing' && (
                          <div className="flex items-center gap-3 justify-center py-4">
                            <button
                              onClick={handleAddAIConcept}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors text-sm font-medium"
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
                            <p className="text-xs text-zinc-500 text-center">Describe your idea -- AI will build a full concept around it</p>
                          </div>
                        )}

                        {addConceptMode === 'generating' && (
                          <div className="flex items-center justify-center gap-2 py-4 text-blue-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Generating new concept...</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ═══ Direct sub-mode ═══ */}
              {subMode === 'direct' && (
                <>
                  {/* ── Phase 3: Video Result ── */}
                  {directVideoJob && (
                    <div className="bg-zinc-900/50 border border-border rounded-xl p-6 space-y-4">
                      {(directVideoJob.status === 'queued' || directVideoJob.status === 'generating' || directVideoJob.status === 'extending' || directVideoJob.status === 'rendering') && (
                        <div className="flex flex-col items-center py-12 text-center">
                          <div className="relative mb-6">
                            <div className="w-16 h-16 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
                              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                            </div>
                            {directVideoJob.progress_pct > 0 && (
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums">
                                {Math.round(directVideoJob.progress_pct)}%
                              </div>
                            )}
                          </div>
                          <p className="text-white font-medium">Generating your video...</p>
                          <p className="text-zinc-500 text-sm mt-1">
                            {directVideoJob.status === 'extending' ? 'Extending video...' : 'This usually takes 2-5 minutes'}
                          </p>
                        </div>
                      )}

                      {directVideoJob.status === 'complete' && directVideoJob.final_video_url && (
                        <div className="space-y-4">
                          <div className="aspect-[9/16] max-h-[60vh] mx-auto rounded-xl overflow-hidden bg-black">
                            <video
                              src={directVideoJob.final_video_url}
                              controls
                              playsInline
                              className="w-full h-full object-contain"
                            />
                          </div>

                          <div className="flex gap-2">
                            <a
                              href={directVideoJob.final_video_url}
                              download={`direct-video-${directVideoJob.id}.mp4`}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors text-sm"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </a>
                            <button
                              onClick={() => { window.location.href = `/dashboard/creative-studio/video-editor?jobId=${directVideoJob.id}` }}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-colors text-sm"
                            >
                              <Film className="w-4 h-4" />
                              Edit Video
                            </button>
                          </div>

                          <button
                            onClick={resetDirect}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            New Video
                          </button>
                        </div>
                      )}

                      {directVideoJob.status === 'failed' && (
                        <div className="flex flex-col items-center py-12 text-center">
                          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                          <p className="text-white font-medium mb-1">Generation Failed</p>
                          <p className="text-zinc-500 text-sm mb-6">
                            {directVideoJob.error_message || 'Something went wrong. Please try again.'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setDirectVideoJob(null); setGenerateError(null) }}
                              className="px-4 py-2 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors text-sm"
                            >
                              Try Again
                            </button>
                            <button
                              onClick={resetDirect}
                              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors text-sm"
                            >
                              Start Over
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Phase 2: Director's Review ── */}
                  {directScript && !directVideoJob && (
                    <div className="space-y-4">
                      {/* Amber Director's Review panel */}
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                          <Clapperboard className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-semibold text-amber-300">Director&apos;s Review</span>
                          <span className="ml-auto text-xs text-amber-400/60">Edit before generating</span>
                        </div>

                        <div className="p-4 space-y-4">
                          {/* Scene + Subject */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-zinc-400 mb-1 block">Scene</label>
                              <input
                                type="text"
                                value={editScene}
                                onChange={(e) => setEditScene(e.target.value)}
                                className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-zinc-400 mb-1 block">Subject</label>
                              <input
                                type="text"
                                value={editSubject}
                                onChange={(e) => setEditSubject(e.target.value)}
                                className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                          </div>

                          {/* Action */}
                          <div>
                            <label className="text-xs font-medium text-zinc-400 mb-1 block">Action</label>
                            <textarea
                              value={editAction}
                              onChange={(e) => setEditAction(e.target.value)}
                              rows={3}
                              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
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
                                const isActive = directQuality === q
                                const qCosts = QUALITY_COSTS[q]
                                const totalCost = qCosts.base + directExtensionCount * qCosts.extension
                                return (
                                  <button
                                    key={q}
                                    onClick={() => setDirectQuality(q)}
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
                          </div>

                          {/* Veo Prompt (collapsible) */}
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

                          {/* Extension Prompts (collapsible) */}
                          <details className="group" open={showExtensions}>
                            <summary
                              className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                              onClick={(e) => { e.preventDefault(); setShowExtensions(!showExtensions) }}
                            >
                              <ChevronRight className={cn('w-3 h-3 transition-transform', showExtensions && 'rotate-90')} />
                              Extension Prompts ({directExtensionCount})
                            </summary>
                            {showExtensions && (
                              <div className="mt-2 space-y-2">
                                {editExtensionPrompts.map((ep, idx) => (
                                  <div key={idx}>
                                    <div className="flex items-center justify-between mb-1">
                                      <label className="text-xs text-zinc-500">Segment {idx + 2} ({8 + (idx + 1) * VEO_EXTENSION_STEP - 6}s - {8 + (idx + 1) * VEO_EXTENSION_STEP}s)</label>
                                      <button
                                        onClick={() => setEditExtensionPrompts(editExtensionPrompts.filter((_, i) => i !== idx))}
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
                                {directExtensionCount < 3 && (
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

                          {/* Overlays toggle */}
                          <div className="flex items-center justify-between py-2 border-t border-amber-500/10">
                            <span className="text-xs font-medium text-amber-300/80">Text Overlays</span>
                            <button
                              onClick={() => setDirectOverlaysEnabled(!directOverlaysEnabled)}
                              className={cn(
                                'relative w-9 h-5 rounded-full transition-colors',
                                directOverlaysEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                              )}
                            >
                              <div className={cn(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                directOverlaysEnabled ? 'left-[18px]' : 'left-0.5'
                              )} />
                            </button>
                          </div>

                          {/* Hook + CTA (shown when overlays enabled) */}
                          {directOverlaysEnabled && (
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
                              <p className="text-sm font-semibold text-white tabular-nums">{directEstimatedDuration}s video</p>
                              <p className="text-xs text-zinc-500">
                                Veo 3.1 {directQuality === 'premium' ? 'Standard' : 'Fast'}{' '}
                                {directExtensionCount === 0 ? 'Single clip' : `8s base + ${directExtensionCount} extension${directExtensionCount > 1 ? 's' : ''}`}
                                {' · '}{directQuality === 'premium' ? '1080p' : '720p'}
                              </p>
                            </div>
                            <div className="text-right space-y-0.5">
                              <p className={cn('text-sm font-bold tabular-nums', directCanAfford ? 'text-amber-400' : 'text-red-400')}>
                                {directCreditCost} credits
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
                              onClick={handleDirectGenerate}
                              disabled={directGenerating || !directCanAfford}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              {directGenerating ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Generating {directEstimatedDuration}s video...
                                </>
                              ) : (
                                <>
                                  <Clapperboard className="w-4 h-4" />
                                  Action! ({directCreditCost} credits)
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => { setDirectScript(null); handleWriteDirectConcept() }}
                              disabled={directWriting || directGenerating}
                              className="px-4 py-3 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                              title="Rewrite script"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Rewrite link */}
                      <div className="text-center">
                        <button
                          onClick={() => setDirectScript(null)}
                          className="text-sm text-zinc-500 hover:text-amber-400 transition-colors"
                        >
                          &#8592; Rewrite Concept
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Phase 1: Concept Prompt ── */}
                  {!directScript && !directVideoJob && (
                    <div className="space-y-4">
                      {/* Writing state */}
                      {directWriting && (
                        <div className="bg-zinc-900/50 border border-border rounded-xl p-10 text-center">
                          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 mb-4">
                            <Clapperboard className="w-8 h-8 text-amber-400 animate-pulse" />
                          </div>
                          <p className="text-base font-medium text-white mb-1">Writing your concept...</p>
                          <p className="text-sm text-zinc-500">AI is building the shot list</p>
                        </div>
                      )}

                      {/* Prompt input */}
                      {!directWriting && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-zinc-300 mb-2 block">
                              Describe your video concept
                            </label>
                            <textarea
                              value={directPrompt}
                              onChange={(e) => setDirectPrompt(e.target.value)}
                              placeholder="e.g. Close-up of someone opening the package, dramatic product reveal, camera orbiting with particles..."
                              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none"
                              rows={4}
                            />
                          </div>

                          {/* Video style */}
                          <div>
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

                          {directError && (
                            <div className="flex items-center gap-2 text-red-400 text-sm">
                              <AlertCircle className="w-4 h-4" />
                              {directError}
                            </div>
                          )}

                          <button
                            onClick={handleWriteDirectConcept}
                            disabled={!directPrompt.trim() || directWriting}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                          >
                            <Clapperboard className="w-4 h-4" />
                            Write Concept · 0 credits
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pulse animation keyframes */}
      <style jsx>{`
        @keyframes urlToVideoPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
