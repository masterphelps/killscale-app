'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import {
  Video,
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
  Clapperboard,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildConceptSoraPrompt } from '@/lib/video-prompt-templates'
import type { ProductKnowledge, ProductImage, AdConcept, DirectConceptResult, UGCSettings, UGCPromptResult } from '@/lib/video-prompt-templates'
import { buildUGCVeoPrompt } from '@/lib/video-prompt-templates'
import type { VideoJob } from '@/remotion/types'
import { notifyCreditsChanged } from '@/components/creative-studio/credits-gauge'
import DirectorsReview, { QUALITY_COSTS, VEO_BASE_DURATION, VEO_EXTENSION_STEP } from '@/components/creative-studio/directors-review'
import ProductInput from '@/components/creative-studio/product-input'
import type { ProductInputRef } from '@/components/creative-studio/product-input'
import { MediaLibraryModal } from '@/components/media-library-modal'

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

// ─── Quality type ───────────────────────────────────────────────────────────

type VideoQuality = 'standard' | 'premium'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoStudioPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const restoredCanvasRef = useRef(false)
  const productInputRef = useRef<ProductInputRef>(null)

  // ─── Accordion step tracking ──────────────────────────────────────────────
  const [openStep, setOpenStep] = useState<1 | 2 | 3>(1)

  // ─── Product state (managed by ProductInput, synced via onChange) ──────────
  const [productKnowledge, setProductKnowledge] = useState<ProductKnowledge>({ name: '' })
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedProductImageIndices, setSelectedProductImageIndices] = useState<number[]>([])
  const [includeProductImage, setIncludeProductImage] = useState(true)
  const [productUrl, setProductUrl] = useState('')
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  // Media library modal state
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [imageFromLibrary, setImageFromLibrary] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  // Initial values for ProductInput (used during canvas restore / Oracle handoff)
  const [initialUrl, setInitialUrl] = useState<string | undefined>(undefined)
  const [initialProductKnowledge, setInitialProductKnowledge] = useState<ProductKnowledge | undefined>(undefined)
  const [initialProductImages, setInitialProductImages] = useState<ProductImage[] | undefined>(undefined)
  const [autoAnalyze, setAutoAnalyze] = useState(false)
  const [productCollapsed, setProductCollapsed] = useState(false)

  // ─── Sub-mode toggle: Explore (concepts) vs Direct (single script) vs UGC ──
  const [subMode, setSubMode] = useState<'explore' | 'direct' | 'ugc'>('explore')

  // ─── Video style ──────────────────────────────────────────────────────────
  const styleParam = searchParams?.get('style') as VideoStyle | null
  const [videoStyle, setVideoStyle] = useState<VideoStyle>(
    styleParam && ['cinematic', 'product', 'macro', 'conceptual', 'documentary'].includes(styleParam)
      ? styleParam
      : 'cinematic'
  )
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)

  // ─── Explore mode: Concepts ───────────────────────────────────────────────
  const [concepts, setConcepts] = useState<AdConcept[]>([])
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null)
  const [conceptError, setConceptError] = useState<string | null>(null)
  const [generatingConcepts, setGeneratingConcepts] = useState(false)
  const [conceptQuality, setConceptQuality] = useState<Record<number, VideoQuality>>({})

  // ─── Direct mode state ────────────────────────────────────────────────────
  const [directPrompt, setDirectPrompt] = useState(searchParams?.get('prompt') || '')
  const [directScript, setDirectScript] = useState<DirectConceptResult | null>(null)
  const [directWriting, setDirectWriting] = useState(false)
  const [directError, setDirectError] = useState<string | null>(null)

  // ─── UGC mode state ──────────────────────────────────────────────────────
  const [ugcSettings, setUgcSettings] = useState<UGCSettings>({
    gender: 'female', ageRange: 'adult', tone: 'authentic', features: [], clothing: 'Casual', scene: 'indoors', setting: 'Living Room', notes: '',
  })
  const [ugcPrompt, setUgcPrompt] = useState<UGCPromptResult | null>(null)
  const [ugcGenerating, setUgcGenerating] = useState(false)
  const [ugcError, setUgcError] = useState<string | null>(null)

  // ─── Canvas persistence ───────────────────────────────────────────────────
  const [canvasId, setCanvasId] = useState<string | null>(null)

  // ─── Per-concept video jobs ───────────────────────────────────────────────
  const [conceptJobs, setConceptJobs] = useState<Record<number, VideoJob[]>>({})
  const [currentVideoVersion, setCurrentVideoVersion] = useState<Record<number, number>>({})
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const [extendingIndex, setExtendingIndex] = useState<number | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Add concept (AI or Custom) ───────────────────────────────────────────
  const [addConceptMode, setAddConceptMode] = useState<'idle' | 'choosing' | 'prompting' | 'generating'>('idle')
  const [promptDirection, setPromptDirection] = useState('')
  const [editingConceptIndex, setEditingConceptIndex] = useState<number | null>(null)
  const [editingConcept, setEditingConcept] = useState<AdConcept | null>(null)

  // ─── Director's Review editable fields (shared between Explore concept review + Direct) ──
  const [reviewingConceptIndex, setReviewingConceptIndex] = useState<number | null>(null)
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
  const [directOverlaysEnabled, setDirectOverlaysEnabled] = useState(true)
  const [directQuality, setDirectQuality] = useState<VideoQuality>('standard')
  const [segmentImageIndices, setSegmentImageIndices] = useState<number[][]>([])

  // ─── Credits ──────────────────────────────────────────────────────────────
  const [credits, setCredits] = useState<{ remaining: number; totalAvailable: number } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.remaining !== undefined) setCredits({ remaining: d.remaining, totalAvailable: d.totalAvailable }) })
      .catch(() => {})
  }, [user?.id])

  // ─── Quality + cost helpers ──────────────────────────────────────────────

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

  // ─── ProductInput onChange handler ────────────────────────────────────────

  const handleProductChange = useCallback((knowledge: ProductKnowledge, images: ProductImage[], selectedIndices: number[]) => {
    setProductKnowledge(knowledge)
    setProductImages(images)
    setSelectedProductImageIndices(selectedIndices)
    setIncludeProductImage(selectedIndices.length > 0)
    setHasAnalyzed(true)
  }, [])

  // ─── Assemble product knowledge from ProductInput ref ─────────────────────

  const assembleProductKnowledge = useCallback((): ProductKnowledge => {
    if (productInputRef.current?.canProceed) {
      return productInputRef.current.assemble()
    }
    return productKnowledge
  }, [productKnowledge])

  // ─── Restore canvas from URL param (back from editor / AI Tasks) ─────────

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
          setCanvasId(canvas.id)
          if (canvas.product_knowledge) {
            setProductKnowledge(canvas.product_knowledge)
            setInitialProductKnowledge(canvas.product_knowledge)
            setHasAnalyzed(true)
            setProductCollapsed(true)
          }
          if (canvas.product_url) {
            setProductUrl(canvas.product_url)
            setInitialUrl(canvas.product_url)
          }

          // Check if this is a Direct canvas
          if (canvas.concepts[0]?.angle === 'Direct') {
            setSubMode('direct')
            const c = canvas.concepts[0]
            setConcepts(canvas.concepts)
            setDirectScript({
              videoPrompt: c.videoPrompt || '',
              extensionPrompts: c.extensionPrompts,
              scene: c.script?.scene || '',
              subject: c.script?.subject || '',
              action: c.script?.action || '',
              mood: c.script?.mood || '',
              estimatedDuration: c.estimatedDuration || VEO_BASE_DURATION,
              overlay: c.overlay || { hook: '', captions: [], cta: 'Shop Now' },
              adCopy: c.adCopy,
            })
            setEditScene(c.script?.scene || '')
            setEditSubject(c.script?.subject || '')
            setEditAction(c.script?.action || '')
            setEditMood(c.script?.mood || '')
            setEditVideoPrompt(c.videoPrompt || '')
            setEditExtensionPrompts(c.extensionPrompts || [])
            setEditHook(c.overlay?.hook || '')
            setEditCaptions(c.overlay?.captions || [])
            setEditCta(c.overlay?.cta || 'Shop Now')
            setEditAdCopy(c.adCopy || null)
            const extCount = c.extensionPrompts?.length || 0
            setSegmentImageIndices(Array.from({ length: 1 + extCount }, () => [...selectedProductImageIndices]))
            setOpenStep(3)
          } else {
            // Explore canvas
            setSubMode('explore')
            setConcepts(canvas.concepts)
            setOpenStep(2)
            // Auto-expand concept if conceptIndex param is provided
            const conceptIndexParam = searchParams.get('conceptIndex')
            if (conceptIndexParam != null) {
              const idx = parseInt(conceptIndexParam, 10)
              if (!isNaN(idx) && idx >= 0 && idx < canvas.concepts.length) {
                setExpandedConcept(idx)
              }
            }
          }
        }
      } catch (err) {
        console.error('[VideoStudio] Failed to restore canvas:', err)
      }
    })()
  }, [searchParams, user?.id, selectedProductImageIndices])

  // ─── Oracle handoff: ?prompt= + sessionStorage ────────────────────────────
  const autoAdvancedRef = useRef(false)
  useEffect(() => {
    if (autoAdvancedRef.current) return
    if (restoredCanvasRef.current) return // Don't process prompt if we already restored a canvas
    const promptParam = searchParams?.get('prompt')
    if (!promptParam) return
    autoAdvancedRef.current = true

    // Restore product context from sessionStorage
    let hasProductContext = false
    try {
      const raw = sessionStorage.getItem('ks_oracle_handoff')
      if (raw) {
        sessionStorage.removeItem('ks_oracle_handoff')
        const handoff = JSON.parse(raw)
        if (handoff.productInfo) {
          const p = handoff.productInfo
          const pk: ProductKnowledge = {
            name: p.name || 'Product',
            description: p.description,
            features: p.features,
            benefits: p.benefits,
            painPoints: p.painPoints,
            testimonialPoints: p.testimonialPoints,
            keyMessages: p.keyMessages,
            targetAudience: p.targetAudience,
            category: p.category,
            uniqueSellingPoint: p.uniqueSellingPoint,
            motionOpportunities: p.motionOpportunities,
            sensoryDetails: p.sensoryDetails,
            visualHooks: p.visualHooks,
          }
          setProductKnowledge(pk)
          setInitialProductKnowledge(pk)
          setHasAnalyzed(true)
          setProductCollapsed(true)
          hasProductContext = true
        }
        if (handoff.productImages?.length > 0) {
          setProductImages(handoff.productImages)
          setInitialProductImages(handoff.productImages)
          setSelectedProductImageIndices(handoff.productImages.slice(0, 3).map((_: unknown, i: number) => i))
          setIncludeProductImage(true)
        }
      }
    } catch { /* sessionStorage read failed */ }

    // Fallback: use ?productName= + ?productDescription= params for described products
    if (!hasProductContext) {
      const productNameParam = searchParams?.get('productName')
      const productDescParam = searchParams?.get('productDescription')
      if (productNameParam) {
        const pk: ProductKnowledge = { name: productNameParam, description: productDescParam || undefined }
        setProductKnowledge(pk)
        setInitialProductKnowledge(pk)
        setHasAnalyzed(true)
        setProductCollapsed(true)
      }
    }

    // If ?productUrl= is present, pre-fill and auto-analyze
    const productUrlParam = searchParams?.get('productUrl')
    if (productUrlParam) {
      setInitialUrl(productUrlParam)
      setAutoAnalyze(true)
      setProductCollapsed(true)
    }

    // Set up direct mode with the prompt
    setSubMode('direct')
    setDirectPrompt(promptParam)
    setOpenStep(2)
  }, [searchParams])

  // ─── Handle ?mode= and ?tab= URL params ──────────────────────────────────
  const modeInitRef = useRef(false)
  useEffect(() => {
    if (modeInitRef.current) return
    if (restoredCanvasRef.current) return
    if (autoAdvancedRef.current) return // prompt handler already set the mode
    modeInitRef.current = true

    const modeParam = searchParams?.get('mode')
    if (modeParam === 'ugc') {
      // UGC mode: set sub-mode, product input first then UGC settings
      setSubMode('ugc')
    } else if (modeParam === 'direct') {
      setSubMode('direct')
    } else if (modeParam === 'explore') {
      setSubMode('explore')
    }

    // ?tab=image pre-opens the image picker hint (only if ?mode= wasn't already set)
    // ProductInput already handles showing the image upload area by default
    const tabParam = searchParams?.get('tab')
    if (tabParam === 'image' && !modeParam) {
      setSubMode('direct') // Image-only goes to Direct (no concepts)
    }

    // ?productUrl= without ?prompt= — pre-fill URL and auto-analyze
    if (!searchParams?.get('prompt')) {
      const productUrlParam = searchParams?.get('productUrl')
      if (productUrlParam) {
        setInitialUrl(productUrlParam)
        setAutoAnalyze(true)
      }
      const productNameParam = searchParams?.get('productName')
      const productDescParam = searchParams?.get('productDescription')
      if (productNameParam) {
        const pk: ProductKnowledge = { name: productNameParam, description: productDescParam || undefined }
        setInitialProductKnowledge(pk)
        setHasAnalyzed(true)
      }
    }
  }, [searchParams])

  // ─── Generate Concepts (Explore mode) ─────────────────────────────────────

  const handleGenerateConcepts = useCallback(async (overrideProduct?: ProductKnowledge) => {
    const product = overrideProduct || assembleProductKnowledge()
    if (!product.name) return

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
      setGeneratingConcepts(false)
    }
  }, [videoStyle, user?.id, currentAccountId, productUrl, includeProductImage, assembleProductKnowledge])

  const handleClickGenerateConcepts = useCallback(() => {
    const assembled = assembleProductKnowledge()
    setProductKnowledge(assembled)
    setProductCollapsed(true)
    handleGenerateConcepts(assembled)
  }, [assembleProductKnowledge, handleGenerateConcepts])

  // ─── Job polling ──────────────────────────────────────────────────────────

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
      console.error('[VideoStudio] Poll error:', err)
    }
  }, [user?.id, currentAccountId])

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

  // Listen for background poller updates
  useEffect(() => {
    if (!canvasId) return
    const handler = () => refreshJobs()
    window.addEventListener('video-jobs-updated', handler)
    return () => window.removeEventListener('video-jobs-updated', handler)
  }, [canvasId, refreshJobs])

  // ─── Generate Video (Explore mode — concept cards) ─────────────────────────

  const handleGenerate = useCallback(async (conceptIndex: number, conceptOverride?: AdConcept) => {
    if (!user?.id || !currentAccountId) return

    const concept = conceptOverride || concepts[conceptIndex]
    if (!concept) return

    const conceptDuration = getConceptDuration(conceptIndex)
    const conceptCreditCost = getConceptCreditCost(conceptIndex)
    const apiProvider = getApiProvider(conceptIndex)

    setGeneratingIndex(conceptIndex)
    setGenerateError(null)

    try {
      const hasImage = includeProductImage && selectedProductImageIndices.some(idx => productImages[idx]?.base64)
      const imageMatchText = ' The product matches the reference image precisely — same colors, shape, branding, and proportions.'

      const fullPrompt = concept.videoPrompt
        ? (hasImage ? concept.videoPrompt + imageMatchText : concept.videoPrompt)
        : buildConceptSoraPrompt(concept, conceptDuration, hasImage)

      const enrichedExtensionPrompts = (concept.extensionPrompts || []).map(p =>
        hasImage ? p + imageMatchText : p
      )

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
          productImages: includeProductImage
            ? selectedProductImageIndices.map(idx => ({
                base64: productImages[idx]?.base64,
                mimeType: productImages[idx]?.mimeType,
              })).filter(img => img.base64)
            : [],
          segmentImages: segmentImageIndices.length > 0 && includeProductImage
            ? segmentImageIndices.map(indices =>
                indices.map(idx => ({ base64: productImages[idx]?.base64, mimeType: productImages[idx]?.mimeType })).filter(img => img.base64)
              )
            : undefined,
          provider: apiProvider,
          quality: getConceptQuality(conceptIndex),
          targetDurationSeconds: apiProvider === 'veo-ext' ? conceptDuration : undefined,
          extensionPrompts: enrichedExtensionPrompts.length > 0 ? enrichedExtensionPrompts : undefined,
          adCopy: concept.adCopy || null,
          overlayConfig: {
            style: 'bold' as const,
            hook: {
              line1: concept.overlay?.hook || '',
              startSec: 0,
              endSec: 3,
              animation: 'pop' as const,
              fontSize: 56,
              fontWeight: 800,
              position: 'top' as const,
            },
            captions: (() => {
              const caps = concept.overlay?.captions || []
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
              buttonText: concept.overlay?.cta || '',
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentAccountId, concepts, canvasId, productKnowledge.name, refreshJobs, includeProductImage, productImages, selectedProductImageIndices, segmentImageIndices])

  // ─── Director's Review for Concepts (Explore mode) ────────────────────────

  const enterDirectorsReview = useCallback((conceptIndex: number) => {
    const concept = concepts[conceptIndex]
    if (!concept) return

    setEditScene(concept.script?.scene || '')
    setEditSubject(concept.script?.subject || '')
    setEditAction(concept.script?.action || concept.visualMetaphor || '')
    setEditMood(concept.script?.mood || '')
    setEditVideoPrompt(concept.videoPrompt || buildConceptSoraPrompt(concept, concept.estimatedDuration || VEO_BASE_DURATION))
    setEditExtensionPrompts(concept.extensionPrompts || [])
    setEditHook(concept.overlay?.hook || '')
    setEditCta(concept.overlay?.cta || '')
    setDirectOverlaysEnabled(true)
    setDirectQuality(getConceptQuality(conceptIndex))

    const extensionCount = concept.extensionPrompts?.length || 0
    const segCount = 1 + extensionCount
    const baseIndices = [...selectedProductImageIndices]
    setSegmentImageIndices(Array.from({ length: segCount }, () => [...baseIndices]))

    setReviewingConceptIndex(conceptIndex)
    setOpenStep(3)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, selectedProductImageIndices])

  const handleGenerateFromReview = useCallback(async () => {
    if (reviewingConceptIndex === null) return
    const i = reviewingConceptIndex

    const updatedConcept: AdConcept = {
      ...concepts[i],
      script: {
        scene: editScene,
        subject: editSubject,
        action: editAction,
        mood: editMood,
      },
      videoPrompt: editVideoPrompt,
      extensionPrompts: editExtensionPrompts.length > 0 ? editExtensionPrompts : undefined,
      estimatedDuration: VEO_BASE_DURATION + editExtensionPrompts.length * VEO_EXTENSION_STEP,
      overlay: {
        hook: editHook,
        captions: concepts[i].overlay?.captions || [],
        cta: editCta,
      },
    }

    setConcepts(prev => {
      const updated = [...prev]
      updated[i] = updatedConcept
      return updated
    })
    setConceptQuality(prev => ({ ...prev, [i]: directQuality }))
    setReviewingConceptIndex(null)
    setOpenStep(2)

    // Pass concept directly to avoid stale closure from setConcepts not yet committed
    handleGenerate(i, updatedConcept)
  }, [reviewingConceptIndex, concepts, editScene, editSubject, editAction, editMood, editVideoPrompt, editExtensionPrompts, editHook, editCta, directQuality, handleGenerate])

  // ─── Extend Video ─────────────────────────────────────────────────────────

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
        setGenerateError(data.error || 'Extension failed')
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
      console.error('[VideoStudio] Extend error:', err)
      setGenerateError('Failed to extend video')
    } finally {
      setExtendingIndex(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, conceptJobs, currentVideoVersion])

  // ─── Save concepts to canvas ──────────────────────────────────────────────

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

  // ─── Add AI Concept ───────────────────────────────────────────────────────

  const handleAddAIConcept = useCallback(async () => {
    setAddConceptMode('generating')
    const product = assembleProductKnowledge()
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
  }, [concepts, saveConceptsToCanvas, includeProductImage, assembleProductKnowledge])

  const handleAddPromptConcept = useCallback(async () => {
    if (!promptDirection.trim()) return
    setAddConceptMode('generating')
    const product = assembleProductKnowledge()
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
  }, [concepts, saveConceptsToCanvas, promptDirection, includeProductImage, assembleProductKnowledge])

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
    // Re-key jobs
    const newJobs: Record<number, VideoJob[]> = {}
    for (const [key, jobs] of Object.entries(conceptJobs)) {
      const k = Number(key)
      if (k < index) newJobs[k] = jobs
      else if (k > index) newJobs[k - 1] = jobs
    }
    setConceptJobs(newJobs)
    // Re-key version indices
    const newVersions: Record<number, number> = {}
    for (const [key, ver] of Object.entries(currentVideoVersion)) {
      const k = Number(key)
      if (k < index) newVersions[k] = ver
      else if (k > index) newVersions[k - 1] = ver
    }
    setCurrentVideoVersion(newVersions)
    saveConceptsToCanvas(updated)
  }, [concepts, conceptJobs, currentVideoVersion, saveConceptsToCanvas])

  // ─── Direct mode: Write Concept ───────────────────────────────────────────

  const handleWriteDirectConcept = useCallback(async () => {
    if (!directPrompt.trim()) return
    const product = assembleProductKnowledge()
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
      setEditCaptions(result.overlay?.captions || [])
      setEditCta(result.overlay?.cta || 'Shop Now')
      setEditAdCopy(result.adCopy || null)
      // Init per-segment image indices
      const extCount = result.extensionPrompts?.length || 0
      const segCount = 1 + extCount
      const baseIndices = [...selectedProductImageIndices]
      setSegmentImageIndices(Array.from({ length: segCount }, () => [...baseIndices]))
      // Open Director's Review
      setOpenStep(3)
    } catch {
      setDirectError('Failed to write concept. Please try again.')
    } finally {
      setDirectWriting(false)
    }
  }, [directPrompt, videoStyle, assembleProductKnowledge, selectedProductImageIndices])

  // ─── Direct mode: Build AdConcept from edit fields ────────────────────────

  const buildAdConceptFromDirect = useCallback((): AdConcept => {
    return {
      title: 'Direct Concept',
      angle: 'Direct',
      logline: directPrompt.slice(0, 120),
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
      estimatedDuration: VEO_BASE_DURATION + editExtensionPrompts.length * VEO_EXTENSION_STEP,
      extensionPrompts: editExtensionPrompts.length > 0 ? editExtensionPrompts : undefined,
      adCopy: editAdCopy || undefined,
    }
  }, [directPrompt, editScene, editSubject, editAction, editMood, editVideoPrompt, editExtensionPrompts, editHook, editCaptions, editCta, editAdCopy])

  // ─── Direct mode: Generate Video ──────────────────────────────────────────

  const handleDirectGenerate = useCallback(async () => {
    if (!user?.id || !currentAccountId) return

    const concept = buildAdConceptFromDirect()
    const conceptIndex = 0

    setConcepts([concept])

    const conceptDuration = concept.estimatedDuration || VEO_BASE_DURATION
    const q = directQuality
    const costs = QUALITY_COSTS[q]
    const extensions = conceptDuration > VEO_BASE_DURATION ? Math.round((conceptDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
    const creditCost = costs.base + extensions * costs.extension
    const apiProvider = conceptDuration > VEO_BASE_DURATION ? 'veo-ext' : 'veo'

    setGeneratingIndex(conceptIndex)
    setGenerateError(null)

    try {
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

      const hasImage = includeProductImage && selectedProductImageIndices.some(idx => productImages[idx]?.base64)
      const imageMatchText = ' The product matches the reference image precisely — same colors, shape, branding, and proportions.'
      const fullPrompt = concept.videoPrompt
        ? (hasImage ? concept.videoPrompt + imageMatchText : concept.videoPrompt)
        : buildConceptSoraPrompt(concept, conceptDuration, hasImage)

      const overlayConfig = directOverlaysEnabled ? {
        style: 'bold' as const,
        hook: editHook ? {
          line1: editHook,
          startSec: 0,
          endSec: 3,
          animation: 'pop' as const,
          fontSize: 56,
          fontWeight: 800,
          position: 'top' as const,
        } : undefined,
        captions: (() => {
          const caps = editCaptions.filter(c => c.trim())
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
        cta: editCta ? {
          buttonText: editCta,
          startSec: Math.max(conceptDuration - 3, conceptDuration * 0.7),
          animation: 'slide' as const,
          fontSize: 32,
        } : undefined,
      } : undefined

      const enrichedExtensionPrompts = (concept.extensionPrompts || []).map(p =>
        hasImage ? p + imageMatchText : p
      )

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: fullPrompt,
          videoStyle: 'concept',
          durationSeconds: conceptDuration,
          productName: productKnowledge.name || null,
          provider: apiProvider,
          quality: q,
          canvasId: activeCanvasId || null,
          adIndex: conceptIndex,
          targetDurationSeconds: apiProvider === 'veo-ext' ? conceptDuration : undefined,
          extensionPrompts: enrichedExtensionPrompts.length > 0 ? enrichedExtensionPrompts : undefined,
          overlayConfig,
          adCopy: concept.adCopy || null,
          productImages: includeProductImage
            ? selectedProductImageIndices
                .map(idx => ({ base64: productImages[idx]?.base64, mimeType: productImages[idx]?.mimeType }))
                .filter(img => img.base64)
            : [],
          segmentImages: segmentImageIndices.length > 0 && includeProductImage
            ? segmentImageIndices.map(indices =>
                indices.map(idx => ({ base64: productImages[idx]?.base64, mimeType: productImages[idx]?.mimeType })).filter(img => img.base64)
              )
            : undefined,
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

      if (activeCanvasId) {
        refreshJobsWithCanvas(activeCanvasId)
      }
    } catch {
      setGenerateError('Failed to generate video')
    } finally {
      setGeneratingIndex(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentAccountId, buildAdConceptFromDirect, canvasId, productUrl, productKnowledge, directQuality, includeProductImage, productImages, selectedProductImageIndices, segmentImageIndices, editHook, editCaptions, editCta, directOverlaysEnabled, refreshJobsWithCanvas])

  // ─── Direct: Rewrite ──────────────────────────────────────────────────────

  const handleDirectRewrite = useCallback(() => {
    setDirectScript(null)
    setOpenStep(2)
  }, [])

  // ─── UGC: Write Script ────────────────────────────────────────────────────

  const handleUgcWriteScript = useCallback(async () => {
    if (!productKnowledge.name) return
    setUgcGenerating(true)
    setUgcError(null)
    try {
      const res = await fetch('/api/creative-studio/generate-ugc-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: productKnowledge, ugcSettings }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUgcError(data.error || 'Failed to generate UGC script')
        return
      }
      setUgcPrompt(data)
      // Populate Director's Review fields from UGC result
      setEditVideoPrompt(data.prompt || '')
      setEditExtensionPrompts(data.extensionPrompts || [])
      setEditScene(ugcSettings.setting || '')
      setEditSubject('')
      setEditAction('')
      setEditMood(ugcSettings.tone || '')
      setEditHook(data.overlay?.hook || '')
      setEditCaptions([])
      setEditCta(data.overlay?.cta || 'Shop Now')
      if (data.adCopy) setEditAdCopy(data.adCopy)
      setDirectOverlaysEnabled(true)
      // Init per-segment image indices
      const extCount = data.extensionPrompts?.length || 0
      const segCount = 1 + extCount
      const baseIndices = [...selectedProductImageIndices]
      setSegmentImageIndices(Array.from({ length: segCount }, () => [...baseIndices]))
      setOpenStep(3)
    } catch (err) {
      setUgcError(err instanceof Error ? err.message : 'UGC script generation failed')
    } finally {
      setUgcGenerating(false)
    }
  }, [productKnowledge, ugcSettings, selectedProductImageIndices])

  const handleUgcRewrite = useCallback(() => {
    setUgcPrompt(null)
    setOpenStep(2)
  }, [])

  // ─── UGC: Generate Video ─────────────────────────────────────────────────

  const handleUgcGenerate = useCallback(async () => {
    if (!user?.id || !currentAccountId || !ugcPrompt) return

    const conceptIndex = 0
    const q = directQuality
    const creditCost = QUALITY_COSTS[q].base + editExtensionPrompts.length * QUALITY_COSTS[q].extension

    setGeneratingIndex(conceptIndex)
    setGenerateError(null)

    try {
      // Ensure canvas exists (mirrors handleDirectGenerate)
      let activeCanvasId = canvasId
      if (!activeCanvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: productUrl || null,
            productKnowledge: { ...productKnowledge, _studioMode: 'ugc' },
            concepts: [{
              visualMetaphor: `UGC: ${ugcSettings.gender} presenter`,
              videoPrompt: editVideoPrompt || ugcPrompt.prompt,
              extensionPrompts: editExtensionPrompts,
              adCopy: editAdCopy,
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          activeCanvasId = canvasData.canvas.id
          setCanvasId(canvasData.canvas.id)
        }
      }

      const scriptDuration = ugcPrompt.estimatedDuration || 8
      // Pass main prompt through buildUGCVeoPrompt to strip any block headers (same as extensions)
      const mainPrompt = buildUGCVeoPrompt(
        { prompt: editVideoPrompt || ugcPrompt.prompt, dialogue: ugcPrompt.dialogue || '', sceneSummary: ugcPrompt.sceneSummary || '' },
        scriptDuration
      )
      const numExtensions = editExtensionPrompts.length
      const apiProvider = numExtensions > 0 ? 'veo-ext' : 'veo'

      const hasImage = includeProductImage && selectedProductImageIndices.some(idx => productImages[idx]?.base64)

      // Build structured overlayConfig (same format as handleDirectGenerate)
      const overlayConfig = directOverlaysEnabled ? {
        style: 'bold' as const,
        hook: editHook ? {
          line1: editHook,
          startSec: 0,
          endSec: 3,
          animation: 'pop' as const,
          fontSize: 56,
          fontWeight: 800,
          position: 'top' as const,
        } : undefined,
        captions: (() => {
          const caps = editCaptions.filter(c => c.trim())
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
        cta: editCta ? {
          buttonText: editCta,
          startSec: Math.max(scriptDuration - 3, scriptDuration * 0.7),
          animation: 'slide' as const,
          fontSize: 32,
        } : undefined,
      } : undefined

      const enrichedExtensionPrompts = editExtensionPrompts.map(ep =>
        buildUGCVeoPrompt({ prompt: ep, dialogue: '', sceneSummary: '' }, 7)
      )

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: mainPrompt,
          videoStyle: 'talking_head',
          durationSeconds: scriptDuration,
          productName: productKnowledge.name || null,
          provider: apiProvider,
          quality: q,
          canvasId: activeCanvasId || null,
          adIndex: conceptIndex,
          targetDurationSeconds: apiProvider === 'veo-ext' ? scriptDuration : undefined,
          extensionPrompts: enrichedExtensionPrompts.length > 0 ? enrichedExtensionPrompts : undefined,
          overlayConfig,
          adCopy: editAdCopy || null,
          logline: `${ugcSettings.gender === 'male' ? 'A man' : 'A woman'} shares their experience with ${productKnowledge.name}`,
          productImages: includeProductImage
            ? selectedProductImageIndices
                .map(idx => ({ base64: productImages[idx]?.base64, mimeType: productImages[idx]?.mimeType }))
                .filter(img => img.base64)
            : [],
          segmentImages: segmentImageIndices.length > 0 && includeProductImage
            ? segmentImageIndices.map(indices =>
                indices.map(idx => ({ base64: productImages[idx]?.base64, mimeType: productImages[idx]?.mimeType })).filter(img => img.base64)
              )
            : undefined,
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

      if (activeCanvasId) {
        refreshJobsWithCanvas(activeCanvasId)
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGeneratingIndex(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentAccountId, ugcPrompt, editVideoPrompt, editExtensionPrompts, directQuality, ugcSettings, productKnowledge, canvasId, productUrl, directOverlaysEnabled, editHook, editCta, editCaptions, editAdCopy, includeProductImage, productImages, selectedProductImageIndices, segmentImageIndices, refreshJobsWithCanvas])

  // ─── Derived state ────────────────────────────────────────────────────────

  const canProceed = productInputRef.current?.canProceed || hasAnalyzed
  const hasConcepts = concepts.length > 0
  const directExtensionCount = editExtensionPrompts.length
  const directCosts = QUALITY_COSTS[directQuality]
  const directCreditCost = directCosts.base + directExtensionCount * directCosts.extension

  // Direct/UGC mode: video job state for Director's Review
  const directJob = (subMode === 'direct' || subMode === 'ugc') ? getActiveJob(0) : null
  const directHasActiveJob = directJob != null && ['generating', 'queued', 'rendering', 'extending'].includes(directJob?.status || '')
  const directHasCompletedVideo = directJob?.status === 'complete' && !!(directJob.final_video_url || directJob.raw_video_url)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1800px] mx-auto px-4 lg:px-8 py-6">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-6">
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
            <p className="text-sm text-zinc-400 mt-1 ml-7">Create scroll-stopping video ads</p>
          </div>
          {credits && (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400">
              <Sparkles className="w-3 h-3" />
              {credits.remaining} credits remaining
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">

        {/* ═══════════════════════════ Step 1: Product Input ═══════════════════════════ */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setOpenStep(openStep === 1 ? 2 : 1)}
            className="w-full flex items-center justify-between px-6 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                hasAnalyzed ? 'bg-emerald-500 text-white' : openStep === 1 ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'
              )}>
                {hasAnalyzed ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <div>
                <span className={cn('text-sm font-medium', openStep === 1 || hasAnalyzed ? 'text-white' : 'text-zinc-500')}>
                  Your Product
                </span>
                {hasAnalyzed && productKnowledge.name && openStep !== 1 && (
                  <span className="text-xs text-zinc-500 ml-2">{productKnowledge.name}</span>
                )}
              </div>
            </div>
            {openStep === 1 ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {openStep === 1 && (
            <div className="px-6 pb-6 pt-0">
              <ProductInput
                ref={productInputRef}
                onChange={handleProductChange}
                onOpenMediaLibrary={() => setShowMediaLibrary(true)}
                onImageFromLibrary={imageFromLibrary}
                initialUrl={initialUrl}
                initialProductKnowledge={initialProductKnowledge}
                initialProductImages={initialProductImages}
                autoAnalyze={autoAnalyze}
                collapsed={productCollapsed}
                onCollapsedChange={setProductCollapsed}
                accentColor="purple"
              />

              {/* Proceed button */}
              {(productInputRef.current?.canProceed || hasAnalyzed) && (
                <button
                  onClick={() => {
                    const assembled = assembleProductKnowledge()
                    setProductKnowledge(assembled)
                    setProductCollapsed(true)
                    setOpenStep(2)
                  }}
                  className="mt-4 flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition-colors"
                >
                  Continue to Video Creation
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════════════════ Step 2: Choose Path + Generate ═══════════════════════════ */}
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => { if (hasAnalyzed || productKnowledge.name) setOpenStep(openStep === 2 ? 1 : 2) }}
            className={cn(
              'w-full flex items-center justify-between px-6 py-4 text-left',
              !hasAnalyzed && !productKnowledge.name && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                hasConcepts || directScript || ugcPrompt ? 'bg-emerald-500 text-white' : openStep === 2 ? 'bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500'
              )}>
                {hasConcepts || directScript || ugcPrompt ? <Check className="w-4 h-4" /> : '2'}
              </div>
              <span className={cn('text-sm font-medium', openStep === 2 ? 'text-white' : 'text-zinc-500')}>
                {subMode === 'ugc' ? 'UGC Settings' : subMode === 'explore' ? 'Creative Concepts' : 'Write Your Script'}
              </span>
            </div>
            {openStep === 2 ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </button>

          {openStep === 2 && (
            <div className="px-6 pb-6 pt-0">

              {/* Sub-mode toggle (hidden for UGC — UGC is its own path) */}
              {subMode !== 'ugc' && (
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setSubMode('explore')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'explore'
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      : 'bg-zinc-800/50 text-zinc-400 border-border hover:border-zinc-600'
                  )}
                >
                  <Lightbulb className="w-4 h-4" />
                  Explore Concepts
                </button>
                <button
                  onClick={() => setSubMode('direct')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border',
                    subMode === 'direct'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-zinc-800/50 text-zinc-400 border-border hover:border-zinc-600'
                  )}
                >
                  <Clapperboard className="w-4 h-4" />
                  Direct Script
                </button>
              </div>
              )}

              {/* Video style + controls */}
              <div className="flex items-center gap-3 mb-5">
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
                      <div className="absolute left-0 top-full mt-1 z-50 bg-bg-card border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[140px]">
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
              </div>

              {/* ─── EXPLORE sub-mode ──────────────────────────────────────── */}
              {subMode === 'explore' && (
                <>
                  {/* Generate concepts button (when no concepts yet) */}
                  {!hasConcepts && !generatingConcepts && !conceptError && (
                    <button
                      onClick={handleClickGenerateConcepts}
                      disabled={!canProceed}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      Generate 4 Creative Concepts
                    </button>
                  )}

                  {/* Loading state */}
                  {generatingConcepts && (
                    <div className="bg-zinc-900/50 border border-border rounded-xl p-10 text-center">
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
                  {conceptError && !generatingConcepts && (
                    <div className="bg-zinc-900/50 border border-red-500/20 rounded-xl p-6">
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
                  {!generatingConcepts && hasConcepts && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-semibold text-white">{concepts.length} Creative Concept{concepts.length !== 1 ? 's' : ''}</h2>
                          <p className="text-sm text-zinc-500">Each one is a completely different approach. Pick the one that feels right.</p>
                        </div>
                        <button
                          onClick={() => handleGenerateConcepts()}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-purple-400 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Regenerate
                        </button>
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
                              {/* Card header */}
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
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Title</label>
                                      <input value={ec.title} onChange={(e) => setEditingConcept({ ...ec, title: e.target.value })} placeholder="2-4 word concept name" className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Angle</label>
                                      <input value={ec.angle} onChange={(e) => setEditingConcept({ ...ec, angle: e.target.value })} placeholder="e.g. Problem → Solution" className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Logline</label>
                                    <input value={ec.logline} onChange={(e) => setEditingConcept({ ...ec, logline: e.target.value })} placeholder="1 sentence creative pitch" className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Visual Metaphor</label>
                                    <textarea value={ec.visualMetaphor} onChange={(e) => setEditingConcept({ ...ec, visualMetaphor: e.target.value })} placeholder="What value prop this represents" rows={2} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1 block">Why It Works</label>
                                    <textarea value={ec.whyItWorks} onChange={(e) => setEditingConcept({ ...ec, whyItWorks: e.target.value })} placeholder="Why this stops scrolling" rows={2} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                  </div>

                                  {/* Script sections */}
                                  <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Script</div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                      <div>
                                        <label className="flex items-center gap-1.5 mb-1"><Eye className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span></label>
                                        <textarea value={ec.script.scene} onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, scene: e.target.value } })} placeholder="Environment, lighting, atmosphere" rows={3} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1.5 mb-1"><Video className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span></label>
                                        <textarea value={ec.script.subject} onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, subject: e.target.value } })} placeholder="Who/what is in the shot" rows={3} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1.5 mb-1"><Zap className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span></label>
                                        <textarea value={ec.script.action} onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, action: e.target.value } })} placeholder="Beat-by-beat with camera movements" rows={3} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                      </div>
                                      <div>
                                        <label className="flex items-center gap-1.5 mb-1"><Sparkles className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span></label>
                                        <textarea value={ec.script.mood} onChange={(e) => setEditingConcept({ ...ec, script: { ...ec.script, mood: e.target.value } })} placeholder="Color grade, energy, sound design" rows={3} className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Overlay inputs */}
                                  <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-3">Text Overlays</div>
                                    <div className="space-y-3">
                                      <div>
                                        <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Hook</label>
                                        <input value={ec.overlay.hook} onChange={(e) => setEditingConcept({ ...ec, overlay: { ...ec.overlay, hook: e.target.value } })} placeholder="Opening text (first 2 seconds)" className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500" />
                                      </div>
                                      {(ec.overlay?.captions || []).map((cap, ci) => (
                                        <div key={ci}>
                                          <label className="text-[10px] text-zinc-500 uppercase mb-1 block">Caption {ci + 1}</label>
                                          <input
                                            value={cap}
                                            onChange={(e) => {
                                              const newCaptions = [...(ec.overlay?.captions || [])]
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
                                        <input value={ec.overlay.cta} onChange={(e) => setEditingConcept({ ...ec, overlay: { ...ec.overlay, cta: e.target.value } })} placeholder="Call-to-action button text" className="w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500" />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <button onClick={(e) => { e.stopPropagation(); handleSaveEditingConcept() }} disabled={!ec.title.trim() || !ec.logline.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
                                      <Save className="w-4 h-4" />
                                      Save Concept
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleCancelEditingConcept() }} className="px-4 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm border border-border">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Expanded: READ-ONLY MODE */}
                              {isExpanded && !isEditing && (
                                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                                  {/* Video carousel */}
                                  {hasVideo && (
                                    <div className="mb-4">
                                      <div className="flex items-center gap-3 justify-center">
                                        {completedJobs.length > 1 && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              let target = activeVersion + 1
                                              while (target < jobs.length && !(jobs[target].status === 'complete' && (jobs[target].final_video_url || jobs[target].raw_video_url))) target++
                                              if (target < jobs.length) setCurrentVideoVersion(prev => ({ ...prev, [i]: target }))
                                            }}
                                            disabled={(() => { for (let t = activeVersion + 1; t < jobs.length; t++) { if (jobs[t].status === 'complete' && (jobs[t].final_video_url || jobs[t].raw_video_url)) return false } return true })()}
                                            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                          >
                                            <ChevronLeft className="w-5 h-5" />
                                          </button>
                                        )}

                                        <div className="flex flex-col items-center">
                                          <div className="rounded-xl overflow-hidden bg-zinc-900" style={{ maxHeight: 360, maxWidth: 202, aspectRatio: '9/16' }}>
                                            <video key={videoUrl} src={videoUrl} poster={job?.thumbnail_url || undefined} controls playsInline className="w-full h-full object-contain" />
                                          </div>
                                          <div className="flex items-center gap-2 mt-2">
                                            {job?.provider && (
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                                                {job.provider === 'veo' || job.provider === 'veo-ext' ? 'Veo' : job.provider} {job.duration_seconds || job.target_duration_seconds || ''}s
                                              </span>
                                            )}
                                            {completedJobs.length > 1 && <span className="text-[10px] text-zinc-600">{completedJobs.indexOf(job!) + 1} / {completedJobs.length}</span>}
                                          </div>
                                          {completedJobs.length > 1 && (
                                            <div className="flex items-center gap-1.5 mt-2">
                                              {completedJobs.map((cj, ci) => (
                                                <button key={cj.id} onClick={(e) => { e.stopPropagation(); const jobIndex = jobs.indexOf(cj); if (jobIndex >= 0) setCurrentVideoVersion(prev => ({ ...prev, [i]: jobIndex })) }} className={cn('w-2 h-2 rounded-full transition-all', jobs.indexOf(cj) === activeVersion ? 'bg-purple-400 scale-125' : 'bg-zinc-700 hover:bg-zinc-500')} title={`Version ${ci + 1}`} />
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {completedJobs.length > 1 && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); let target = activeVersion - 1; while (target >= 0 && !(jobs[target].status === 'complete' && (jobs[target].final_video_url || jobs[target].raw_video_url))) target--; if (target >= 0) setCurrentVideoVersion(prev => ({ ...prev, [i]: target })) }}
                                            disabled={(() => { for (let t = activeVersion - 1; t >= 0; t--) { if (jobs[t].status === 'complete' && (jobs[t].final_video_url || jobs[t].raw_video_url)) return false } return true })()}
                                            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                          >
                                            <ChevronRight className="w-5 h-5" />
                                          </button>
                                        )}

                                        {job && (job.provider === 'veo-ext' || job.provider === 'veo') && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleExtend(i) }}
                                            disabled={extendingIndex === i || (credits !== null && credits.remaining < 25)}
                                            className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            {extendingIndex === i ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                            <span className="whitespace-nowrap">+ 7 sec</span>
                                            <span className="text-[10px] text-amber-400/60">25 credits</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="flex gap-2 mt-3">
                                        <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/creative-studio/video-editor?jobId=${job!.id}`) }} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/20">
                                          <Film className="w-3.5 h-3.5" />
                                          Edit Video
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleGenerate(i) }} disabled={generatingIndex === i} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-border disabled:opacity-50">
                                          <Plus className={cn('w-3.5 h-3.5', generatingIndex === i && 'animate-spin')} />
                                          New Variation
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Inline progress when generating new variation while completed videos exist */}
                                  {isLatestInProgress && completedJobs.length > 0 && (
                                    <div className={cn('mb-4 p-3 rounded-lg flex items-center gap-3', latestJob.status === 'extending' ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-blue-500/5 border border-blue-500/20')}>
                                      <RefreshCw className={cn('w-4 h-4 animate-spin flex-shrink-0', latestJob.status === 'extending' ? 'text-amber-400' : 'text-blue-400')} />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-white">{latestJob.status === 'extending' ? `Extending... Step ${(latestJob.extension_step || 0) + 1} of ${(latestJob.extension_total || 0) + 1}` : 'Generating new variation...'}</p>
                                        <p className="text-[10px] text-zinc-500">{latestJob.status === 'rendering' ? 'Rendering overlay' : 'Usually takes 2-5 minutes'}</p>
                                      </div>
                                      {latestJob.progress_pct > 0 && (
                                        <div className="w-16 flex-shrink-0">
                                          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                                            <div className={cn('h-full rounded-full transition-all duration-1000', latestJob.status === 'extending' ? 'bg-amber-500' : 'bg-blue-500')} style={{ width: `${latestJob.progress_pct}%` }} />
                                          </div>
                                          <p className="text-[10px] text-zinc-500 mt-0.5 text-right">{latestJob.progress_pct}%</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Full-size generating state — only when NO completed videos exist */}
                                  {isJobInProgress && completedJobs.length === 0 && (
                                    <div className={cn('mb-4 p-6 rounded-xl bg-zinc-900/50 text-center', job?.status === 'extending' ? 'border border-amber-500/20' : 'border border-blue-500/20')}>
                                      <RefreshCw className={cn('w-8 h-8 animate-spin mx-auto mb-3', job?.status === 'extending' ? 'text-amber-400' : 'text-blue-400')} />
                                      <p className="text-sm font-medium text-white mb-1">{job?.status === 'extending' ? `Extending video... Step ${(job.extension_step || 0) + 1} of ${(job.extension_total || 0) + 1}` : 'Generating Video...'}</p>
                                      <p className="text-xs text-zinc-500">{job?.status === 'extending' ? 'Adding 7 more seconds...' : job?.status === 'rendering' ? 'Rendering overlay...' : 'Usually takes 2-5 minutes'}</p>
                                      {job && job.progress_pct > 0 && (
                                        <div className="w-32 mx-auto mt-3">
                                          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                            <div className={cn('h-full rounded-full transition-all duration-1000', job.status === 'extending' ? 'bg-amber-500' : 'bg-blue-500')} style={{ width: `${job.progress_pct}%` }} />
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
                                      <button onClick={(e) => { e.stopPropagation(); handleGenerate(i) }} disabled={generatingIndex === i} className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
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
                                          <div className="flex items-center gap-1.5 mb-1"><Eye className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Scene</span></div>
                                          <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.scene}</p>
                                        </div>
                                        {concept.script.subject && (
                                          <div>
                                            <div className="flex items-center gap-1.5 mb-1"><Video className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Subject</span></div>
                                            <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.subject}</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-3">
                                        <div>
                                          <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Action</span></div>
                                          <p className="text-xs text-zinc-400 leading-relaxed">{concept.script.action}</p>
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-1.5 mb-1"><Sparkles className="w-3 h-3 text-zinc-500" /><span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Mood</span></div>
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
                                        <div><span className="text-[10px] text-zinc-500 uppercase">Hook</span><p className="text-sm font-semibold text-white">{concept.overlay?.hook}</p></div>
                                      </div>
                                      {(concept.overlay?.captions || []).map((caption, ci) => (
                                        <div key={ci} className="flex items-start gap-2">
                                          <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-600" />
                                          <div><span className="text-[10px] text-zinc-500 uppercase">Caption {ci + 1}</span><p className="text-sm text-zinc-300">{caption}</p></div>
                                        </div>
                                      ))}
                                      <div className="flex items-start gap-2">
                                        <MousePointer className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', colors.icon)} />
                                        <div><span className="text-[10px] text-zinc-500 uppercase">CTA</span><p className="text-sm font-semibold text-white">{concept.overlay?.cta}</p></div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Generate / Director's Review buttons */}
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
                                            const exts = cDuration > VEO_BASE_DURATION ? Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) : 0
                                            const totalCost = qCosts.base + exts * qCosts.extension
                                            return (
                                              <button
                                                key={q}
                                                onClick={(e) => { e.stopPropagation(); setConceptQuality(prev => ({ ...prev, [i]: q })) }}
                                                className={cn('flex-1 px-3 py-2 rounded-lg border transition-all text-left', isActive ? 'bg-purple-500/10 border-purple-500/40' : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600')}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className={cn('text-xs font-medium', isActive ? 'text-purple-300' : 'text-zinc-400')}>{q === 'standard' ? 'Standard' : 'Premium'}</span>
                                                  <span className="text-[10px] text-zinc-500">{q === 'standard' ? '720p' : '1080p'}</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-500 mt-0.5">{totalCost} credits</p>
                                              </button>
                                            )
                                          })}
                                        </div>

                                        <div className="flex items-center gap-3 mb-3">
                                          <span className="text-xs font-medium text-zinc-300">Veo 3.1{getConceptQuality(i) === 'standard' ? ' Fast' : ''}</span>
                                          <span className="text-xs text-zinc-500">{cDuration}s</span>
                                          {cDuration > VEO_BASE_DURATION && (
                                            <span className="text-[10px] text-purple-400/80">({Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP)} extension{Math.round((cDuration - VEO_BASE_DURATION) / VEO_EXTENSION_STEP) > 1 ? 's' : ''})</span>
                                          )}
                                        </div>

                                        <div className="flex gap-2">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); enterDirectorsReview(i) }}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/10 text-amber-300 font-medium hover:bg-amber-500/20 transition-colors text-sm border border-amber-500/20"
                                          >
                                            <Clapperboard className="w-4 h-4" />
                                            Director&apos;s Review
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleGenerate(i) }}
                                            disabled={generatingIndex !== null || (credits !== null && credits.remaining < cCost)}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                                          >
                                            {generatingIndex === i ? (
                                              <><Loader2 className="w-4 h-4 animate-spin" />Starting...</>
                                            ) : (
                                              <><Video className="w-4 h-4" />Generate {cDuration}s · {cCost}cr</>
                                            )}
                                          </button>
                                        </div>
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
                          <button onClick={() => setAddConceptMode('choosing')} className="w-full py-4 border-2 border-dashed border-zinc-700 rounded-xl hover:border-purple-500/50 text-zinc-500 hover:text-purple-300 transition-all flex items-center justify-center gap-2">
                            <Plus className="w-5 h-5" />
                            Add Concept
                          </button>
                        )}

                        {addConceptMode === 'choosing' && (
                          <div className="flex items-center gap-3 justify-center py-4">
                            <button onClick={handleAddAIConcept} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors text-sm font-medium">
                              <Sparkles className="w-4 h-4" />AI Generate
                            </button>
                            <button onClick={() => setAddConceptMode('prompting')} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm font-medium">
                              <MessageSquare className="w-4 h-4" />Prompt
                            </button>
                            <button onClick={handleAddCustomConcept} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 border border-border hover:bg-zinc-700 transition-colors text-sm font-medium">
                              <Pencil className="w-4 h-4" />Custom
                            </button>
                            <button onClick={() => setAddConceptMode('idle')} className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {addConceptMode === 'prompting' && (
                          <div className="py-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <input type="text" value={promptDirection} onChange={(e) => setPromptDirection(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && promptDirection.trim()) handleAddPromptConcept() }} placeholder='e.g. "alligator walking through a carwash"' className="flex-1 px-4 py-2.5 bg-zinc-900 border border-border rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50" autoFocus />
                              <button onClick={handleAddPromptConcept} disabled={!promptDirection.trim()} className="px-5 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">Generate</button>
                              <button onClick={() => { setAddConceptMode('idle'); setPromptDirection('') }} className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                            <p className="text-xs text-zinc-500 text-center">Describe your idea -- AI will build a full concept around it</p>
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
                </>
              )}

              {/* ─── DIRECT sub-mode ──────────────────────────────────────── */}
              {subMode === 'direct' && (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-zinc-300 mb-2 block">
                        Describe your video concept
                      </label>
                      <textarea
                        value={directPrompt}
                        onChange={(e) => setDirectPrompt(e.target.value)}
                        placeholder="e.g. Show a protein bar being unwrapped in slow motion on a gym bench, then someone biting into it with a satisfied expression..."
                        rows={4}
                        className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                      />
                    </div>

                    {directError && (
                      <div className="flex items-center gap-2 text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {directError}
                      </div>
                    )}

                    <button
                      onClick={handleWriteDirectConcept}
                      disabled={!directPrompt.trim() || directWriting || !productKnowledge.name}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {directWriting ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Writing script...</>
                      ) : (
                        <><Clapperboard className="w-4 h-4" />Write Script</>
                      )}
                    </button>
                  </div>

                  {/* Direct mode: show video results if they exist (from canvas restore) */}
                  {subMode === 'direct' && concepts.length > 0 && (() => {
                    const jobs = getJobsForConcept(0)
                    const activeVersion = currentVideoVersion[0] ?? 0
                    const job = jobs[activeVersion] || null
                    const completedJobs = jobs.filter(j => j.status === 'complete' && (j.final_video_url || j.raw_video_url))
                    const videoUrl = job?.final_video_url || job?.raw_video_url
                    const hasVideo = job?.status === 'complete' && videoUrl
                    const isJobInProgress2 = job?.status === 'generating' || job?.status === 'queued' || job?.status === 'rendering' || job?.status === 'extending'

                    if (!hasVideo && !isJobInProgress2 && job?.status !== 'failed') return null

                    return (
                      <div className="mt-4 p-4 rounded-xl bg-zinc-900/50 border border-border">
                        {hasVideo && (
                          <div className="flex flex-col items-center">
                            <div className="rounded-xl overflow-hidden bg-zinc-900" style={{ maxHeight: 360, maxWidth: 202, aspectRatio: '9/16' }}>
                              <video key={videoUrl} src={videoUrl} poster={job?.thumbnail_url || undefined} controls playsInline className="w-full h-full object-contain" />
                            </div>
                            <div className="flex gap-2 mt-3 w-full">
                              <button onClick={() => router.push(`/dashboard/creative-studio/video-editor?jobId=${job!.id}`)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/20">
                                <Film className="w-3.5 h-3.5" />Edit Video
                              </button>
                              {(job!.provider === 'veo-ext' || job!.provider === 'veo') && (
                                <button onClick={() => handleExtend(0)} disabled={extendingIndex === 0 || (credits !== null && credits.remaining < 25)} className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                                  {extendingIndex === 0 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}+7s
                                </button>
                              )}
                            </div>
                            {completedJobs.length > 1 && (
                              <div className="flex items-center gap-1.5 mt-2">
                                {completedJobs.map((cj, ci) => (
                                  <button key={cj.id} onClick={() => { const jobIndex = jobs.indexOf(cj); if (jobIndex >= 0) setCurrentVideoVersion(prev => ({ ...prev, [0]: jobIndex })) }} className={cn('w-2 h-2 rounded-full transition-all', jobs.indexOf(cj) === activeVersion ? 'bg-amber-400 scale-125' : 'bg-zinc-700 hover:bg-zinc-500')} title={`Version ${ci + 1}`} />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {isJobInProgress2 && !hasVideo && (
                          <div className="text-center py-6">
                            <RefreshCw className={cn('w-8 h-8 animate-spin mx-auto mb-3', job?.status === 'extending' ? 'text-amber-400' : 'text-blue-400')} />
                            <p className="text-sm font-medium text-white mb-1">{job?.status === 'extending' ? `Extending... Step ${(job.extension_step || 0) + 1} of ${(job.extension_total || 0) + 1}` : 'Generating Video...'}</p>
                            <p className="text-xs text-zinc-500">{job?.status === 'rendering' ? 'Rendering overlay...' : 'Usually takes 2-5 minutes'}</p>
                          </div>
                        )}
                        {job?.status === 'failed' && (
                          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                            <div className="flex items-center gap-2 text-red-400 text-sm mb-2"><AlertCircle className="w-4 h-4" />{job.error_message || 'Video generation failed'}</div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}

              {/* ──── UGC Mode: Presenter Settings ──── */}
              {subMode === 'ugc' && (
                <div className="space-y-5">
                  {/* Gender */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Gender</label>
                    <div className="flex gap-2">
                      {(['male', 'female'] as const).map((g) => (
                        <button key={g} onClick={() => setUgcSettings(prev => ({ ...prev, gender: g, features: [] }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                            ugcSettings.gender === g ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{g === 'male' ? 'Male' : 'Female'}</button>
                      ))}
                    </div>
                  </div>

                  {/* Age Range */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Age Range</label>
                    <div className="flex flex-wrap gap-2">
                      {([{ value: 'young-adult' as const, label: 'Young Adult (18-25)' }, { value: 'adult' as const, label: 'Adult (25-40)' }, { value: 'middle-aged' as const, label: 'Middle-aged (40-55)' }]).map(({ value, label }) => (
                        <button key={value} onClick={() => setUgcSettings(prev => ({ ...prev, ageRange: value }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                            ugcSettings.ageRange === value ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Tone</label>
                    <div className="flex flex-wrap gap-2">
                      {(['authentic', 'excited', 'humorous', 'serious', 'empathetic'] as const).map((t) => (
                        <button key={t} onClick={() => setUgcSettings(prev => ({ ...prev, tone: t }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize',
                            ugcSettings.tone === t ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{t}</button>
                      ))}
                    </div>
                  </div>

                  {/* Features — contextual on gender */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Features <span className="text-xs text-zinc-600 font-normal">(optional, multi-select)</span></label>
                    <div className="flex flex-wrap gap-2">
                      {(ugcSettings.gender === 'male' ? ['Glasses', 'Full Beard', 'Mustache', 'Bald', 'Hat'] : ['Glasses', 'Hat', 'Make-up', 'No Make-up']).map((feat) => {
                        const isSelected = ugcSettings.features.includes(feat)
                        const isMakeupConflict = (feat === 'Make-up' && ugcSettings.features.includes('No Make-up')) || (feat === 'No Make-up' && ugcSettings.features.includes('Make-up'))
                        return (
                          <button key={feat} onClick={() => setUgcSettings(prev => {
                            let next = isSelected ? prev.features.filter(f => f !== feat) : [...prev.features, feat]
                            if (!isSelected && feat === 'Make-up') next = next.filter(f => f !== 'No Make-up')
                            if (!isSelected && feat === 'No Make-up') next = next.filter(f => f !== 'Make-up')
                            return { ...prev, features: next }
                          })}
                            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                              isSelected ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : isMakeupConflict ? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                            )}>{feat}</button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Clothing */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Clothing</label>
                    <div className="flex flex-wrap gap-2">
                      {['Casual', 'Formal', 'Athletic', 'Streetwear'].map((style) => (
                        <button key={style} onClick={() => setUgcSettings(prev => ({ ...prev, clothing: style }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                            ugcSettings.clothing === style ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{style}</button>
                      ))}
                    </div>
                  </div>

                  {/* Scene */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Scene</label>
                    <div className="flex gap-2">
                      {(['indoors', 'outdoors'] as const).map((s) => (
                        <button key={s} onClick={() => setUgcSettings(prev => ({ ...prev, scene: s, setting: s === 'indoors' ? 'Living Room' : 'Park' }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize',
                            ugcSettings.scene === s ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{s}</button>
                      ))}
                    </div>
                  </div>

                  {/* Setting — contextual on scene */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Setting</label>
                    <div className="flex flex-wrap gap-2">
                      {(ugcSettings.scene === 'indoors' ? ['Living Room', 'Kitchen', 'Bathroom', 'Office', 'Gym', 'Studio'] : ['Park', 'Street', 'Beach', 'Backyard', 'Cafe Patio']).map((setting) => (
                        <button key={setting} onClick={() => setUgcSettings(prev => ({ ...prev, setting }))}
                          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                            ugcSettings.setting === setting ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}>{setting}</button>
                      ))}
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Additional Notes <span className="text-zinc-600 text-xs font-normal">(optional)</span></label>
                    <textarea
                      value={ugcSettings.notes}
                      onChange={(e) => setUgcSettings(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="e.g., 'Mention the 30-day guarantee' or 'Show the product being applied to skin'"
                      className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 resize-none text-sm"
                      rows={2}
                    />
                  </div>

                  {ugcError && (
                    <div className="flex items-center gap-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />{ugcError}
                    </div>
                  )}

                  <button
                    onClick={handleUgcWriteScript}
                    disabled={ugcGenerating || !productKnowledge.name}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-cyan-500 text-black font-medium hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {ugcGenerating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Writing UGC script...</>
                    ) : (
                      <><User className="w-4 h-4" />Write UGC Script</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════════════════ Step 3: Director's Review ═══════════════════════════ */}
        {(reviewingConceptIndex !== null || (subMode === 'direct' && directScript) || (subMode === 'ugc' && ugcPrompt)) && (
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenStep(openStep === 3 ? 2 : 3)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                  openStep === 3 ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-500'
                )}>
                  3
                </div>
                <span className={cn('text-sm font-medium', openStep === 3 ? 'text-white' : 'text-zinc-500')}>
                  Director&apos;s Review
                  {reviewingConceptIndex !== null && concepts[reviewingConceptIndex] && (
                    <span className="text-xs text-zinc-500 ml-2">({concepts[reviewingConceptIndex].title})</span>
                  )}
                </span>
              </div>
              {openStep === 3 ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
            </button>

            {openStep === 3 && (
              <div className="px-6 pb-6 pt-0">
                {/* Back button for concept review */}
                {subMode === 'explore' && reviewingConceptIndex !== null && (
                  <button
                    onClick={() => { setReviewingConceptIndex(null); setOpenStep(2) }}
                    className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to concepts
                  </button>
                )}

                <DirectorsReview
                  scene={editScene} onSceneChange={setEditScene}
                  subject={editSubject} onSubjectChange={setEditSubject}
                  action={editAction} onActionChange={setEditAction}
                  mood={editMood} onMoodChange={setEditMood}
                  videoPrompt={editVideoPrompt} onVideoPromptChange={setEditVideoPrompt}
                  extensionPrompts={editExtensionPrompts} onExtensionPromptsChange={setEditExtensionPrompts}
                  overlaysEnabled={directOverlaysEnabled} onOverlaysEnabledChange={setDirectOverlaysEnabled}
                  hook={editHook} onHookChange={setEditHook}
                  captions={editCaptions} onCaptionsChange={setEditCaptions}
                  cta={editCta} onCtaChange={setEditCta}
                  adCopy={editAdCopy} onAdCopyChange={setEditAdCopy}
                  quality={directQuality} onQualityChange={setDirectQuality}
                  productImages={productImages}
                  segmentImageIndices={segmentImageIndices}
                  onSegmentImageIndicesChange={setSegmentImageIndices}
                  onGenerate={subMode === 'explore' ? handleGenerateFromReview : subMode === 'ugc' ? handleUgcGenerate : handleDirectGenerate}
                  onRewrite={subMode === 'direct' ? handleDirectRewrite : subMode === 'ugc' ? handleUgcRewrite : undefined}
                  generating={generatingIndex !== null}
                  creditsRemaining={credits?.remaining ?? null}
                  error={generateError}
                  hasActiveJob={(subMode === 'direct' || subMode === 'ugc') ? directHasActiveJob : false}
                  hasCompletedVideo={(subMode === 'direct' || subMode === 'ugc') ? directHasCompletedVideo : false}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Media Library Modal */}
      {user?.id && currentAccountId && (
        <MediaLibraryModal
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          userId={user.id}
          adAccountId={currentAccountId}
          selectedItems={[]}
          onSelectionChange={(items) => {
            if (items.length > 0) {
              const item = items[0] as { url?: string; source?: string; mediaType: string }
              const url = item.url || item.source || ''
              if (url) {
                // Convert library item to base64 for ProductInput
                fetch(url)
                  .then(r => r.blob())
                  .then(blob => {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      const base64 = (reader.result as string).split(',')[1]
                      setImageFromLibrary({
                        base64,
                        mimeType: blob.type || 'image/jpeg',
                        preview: url,
                      })
                    }
                    reader.readAsDataURL(blob)
                  })
                  .catch(() => {})
              }
            }
            setShowMediaLibrary(false)
          }}
          maxSelection={1}
          allowedTypes={['image']}
        />
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
