'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Search, Wand2, Sparkles, ExternalLink, Copy, Check, Loader2, AlertCircle, Link as LinkIcon, Package, ChevronRight, Download, ImagePlus, Calendar, BarChart3, ChevronLeft, FolderPlus, Send, Megaphone, PlusCircle, Layers, Lightbulb, Upload, X, FileText, RefreshCw, Video, Film, Plus, Minus, Globe, Play, User, Clapperboard, Pencil } from 'lucide-react'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { MediaLibraryModal } from '@/components/media-library-modal'
import type { MediaImage } from '@/app/api/meta/media/route'
import type { VideoJob } from '@/remotion/types'
import type { UGCSettings, UGCPromptResult } from '@/lib/video-prompt-templates'
import { buildUGCVeoPrompt } from '@/lib/video-prompt-templates'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CompetitorSearchInput,
  CompetitorAdsGrid,
  CompetitorAdModal,
  CompetitorMediaMixChart,
  CompetitorLandingPages,
  CompetitorFilters,
  InspirationGallery,
  OwnAdCard,
  OwnAdModal,
  filterCompetitorAds,
  type MediaTypeFilter,
  type DaysActiveFilter,
  type StatusFilter,
  type CompetitorAd,
  type CompetitorStats,
  type CompetitorSearchResult,
  type InspirationExample,
  type OwnAd,
} from '@/components/creative-studio'

interface AdLibraryAd {
  id: string
  page_name: string
  page_id: string
  ad_snapshot_url: string
  ad_creative_bodies?: string[]
  ad_creative_link_titles?: string[]
  ad_creative_link_descriptions?: string[]
  ad_delivery_start_time: string
  publisher_platforms?: string[]
}

interface ProductInfo {
  name: string
  description?: string
  price?: string
  currency?: string
  features?: string[]
  brand?: string
  category?: string
  uniqueSellingPoint?: string
  targetAudience?: string
  imageUrl?: string
  imageBase64?: string
  imageMimeType?: string
  benefits?: string[]
  painPoints?: string[]
  testimonialPoints?: string[]
  keyMessages?: string[]
}

interface ProductImageOption {
  base64: string
  mimeType: string
  description: string
  type: string
}

interface GeneratedAd {
  headline: string
  primaryText: string
  description: string
  angle: string
  whyItWorks: string
}

interface GeneratedImage {
  base64: string
  mimeType: string
  storageUrl?: string
  mediaHash?: string
}

interface ReferenceAdImage {
  base64: string
  mimeType: string
}

// Helper to convert CompetitorAd to AdLibraryAd format
function competitorAdToAdLibraryAd(ad: CompetitorAd): AdLibraryAd {
  return {
    id: ad.id,
    page_name: ad.pageName,
    page_id: ad.pageId,
    ad_snapshot_url: '',
    ad_creative_bodies: ad.body ? [ad.body] : [],
    ad_creative_link_titles: ad.headline ? [ad.headline] : [],
    ad_creative_link_descriptions: [],
    ad_delivery_start_time: ad.startDate,
    publisher_platforms: ad.platforms,
  }
}

// Helper to convert InspirationExample to AdLibraryAd format
function inspirationToAdLibraryAd(example: InspirationExample): AdLibraryAd {
  return {
    id: example.id,
    page_name: example.pageName,
    page_id: example.pageId || '',
    ad_snapshot_url: '',
    ad_creative_bodies: example.body ? [example.body] : [],
    ad_creative_link_titles: example.headline ? [example.headline] : [],
    ad_creative_link_descriptions: [],
    ad_delivery_start_time: new Date().toISOString(),
    publisher_platforms: ['facebook', 'instagram'],
  }
}

// ── Pill-based product knowledge (matching Video Studio) ─────────────────────

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

export default function AdStudioPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan } = useSubscription()

  const isPro = !!plan

  // Mode selection: null = landing page, 'create' = original ads, 'clone' = copy competitor style, 'inspiration' = browse gallery, 'upload' = upload own image, 'image-to-video' = animate image to video
  const [mode, setMode] = useState<'create' | 'clone' | 'inspiration' | 'upload' | 'image-to-video' | null>(null)

  // Step tracking
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Step 1: Product URL or Manual Entry
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false)
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [productImageOptions, setProductImageOptions] = useState<ProductImageOption[]>([])
  const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)

  // Manual product entry (alternative to URL)
  const [useManualEntry, setUseManualEntry] = useState(false)
  const [manualProductName, setManualProductName] = useState('')
  const [manualProductDescription, setManualProductDescription] = useState('')
  const [manualProductImage, setManualProductImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [isUploadingManualImage, setIsUploadingManualImage] = useState(false)

  // Step 1: Pill pools + selection (matching Video Studio)
  const [pools, setPools] = useState<Record<PillCategory, string[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })
  const [selected, setSelected] = useState<Record<PillCategory, number[]>>({
    name: [], description: [], features: [], benefits: [],
    keyMessages: [], testimonials: [], painPoints: [],
  })
  const [extraContext, setExtraContext] = useState({
    targetAudience: '', category: '', uniqueSellingPoint: '',
  })
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const rawAnalysisRef = useRef<Record<string, unknown> | null>(null)

  // Step 2: Competitor Search (API-driven)
  const [selectedCompany, setSelectedCompany] = useState<CompetitorSearchResult | null>(null)
  const [competitorAds, setCompetitorAds] = useState<CompetitorAd[]>([])
  const [competitorStats, setCompetitorStats] = useState<CompetitorStats | null>(null)
  const [isLoadingAds, setIsLoadingAds] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [viewingAd, setViewingAd] = useState<CompetitorAd | null>(null)
  const [selectedAd, setSelectedAd] = useState<AdLibraryAd | null>(null)
  const [selectedCompetitorAd, setSelectedCompetitorAd] = useState<CompetitorAd | null>(null) // Keep original for display

  // Step 2: Filters
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all')
  const [daysActiveFilter, setDaysActiveFilter] = useState<DaysActiveFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Step 2: Your Ads tab (clone source)
  const [cloneSource, setCloneSource] = useState<'competitor' | 'your-ads'>('competitor')
  const [ownAds, setOwnAds] = useState<OwnAd[]>([])
  const [isLoadingOwnAds, setIsLoadingOwnAds] = useState(false)
  const [ownAdsLoaded, setOwnAdsLoaded] = useState(false)
  const [ownAdSortBy, setOwnAdSortBy] = useState<'spend' | 'roas' | 'scores'>('spend')
  const [ownAdFilter, setOwnAdFilter] = useState<'all' | 'top-performers'>('all')
  const [ownAdMediaFilter, setOwnAdMediaFilter] = useState<'all' | 'video' | 'image'>('all')
  const [ownAdStatusFilter, setOwnAdStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [viewingOwnAd, setViewingOwnAd] = useState<OwnAd | null>(null)
  const [isRefreshMode, setIsRefreshMode] = useState(false)

  // Step 3: Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedAds, setGeneratedAds] = useState<GeneratedAd[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Image generation - now stores array of versions per ad
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Record<number, GeneratedImage[]>>({})
  const [currentImageVersion, setCurrentImageVersion] = useState<Record<number, number>>({}) // Track which version is shown
  const [imageErrors, setImageErrors] = useState<Record<number, string>>({})
  const [imageStyles, setImageStyles] = useState<Record<number, 'clone' | 'lifestyle' | 'product' | 'minimal' | 'bold' | 'refresh'>>({})
  const [imagePrompts, setImagePrompts] = useState<Record<number, string>>({}) // For Create mode - required prompt per ad

  // Upload mode state
  const [uploadedImage, setUploadedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [uploadPrompt, setUploadPrompt] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // Image adjustment
  const [adjustmentPrompts, setAdjustmentPrompts] = useState<Record<number, string>>({})
  const [adjustingImageIndex, setAdjustingImageIndex] = useState<number | null>(null)

  // Saving to media library
  const [savingToLibrary, setSavingToLibrary] = useState<Record<number, boolean>>({})
  const [savedToLibrary, setSavedToLibrary] = useState<Record<string, boolean>>({}) // key: `${adIndex}-${versionIndex}`

  // Reference ad image (from competitor ad used as inspiration)
  const [referenceAdImage, setReferenceAdImage] = useState<ReferenceAdImage | null>(null)
  const [isDownloadingRefImage, setIsDownloadingRefImage] = useState(false)

  // Launch wizard state (for creating ads directly)
  const [showLaunchWizard, setShowLaunchWizard] = useState(false)
  const [wizardCreatives, setWizardCreatives] = useState<Creative[]>([])
  const [wizardCopy, setWizardCopy] = useState<{ primaryText?: string; headline?: string; description?: string } | null>(null)
  const [creatingAd, setCreatingAd] = useState<Record<number, boolean>>({})

  // Session persistence (for AI Tasks page)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionImages, setSessionImages] = useState<Array<{
    adIndex: number
    versionIndex: number
    storageUrl: string
    mediaHash?: string
    mimeType?: string
  }>>([])

  // Image-to-Video state
  const [i2vSelectedImage, setI2vSelectedImage] = useState<{ base64: string; mimeType: string; preview: string; name: string } | null>(null)
  const [i2vShowLibrary, setI2vShowLibrary] = useState(false)
  const [i2vDownloadingLibrary, setI2vDownloadingLibrary] = useState(false)
  const [i2vPrompt, setI2vPrompt] = useState('')
  const [i2vDuration, setI2vDuration] = useState(8) // Veo stepper: min 8, step 7
  const [i2vCanvasId, setI2vCanvasId] = useState<string | null>(null)
  const [i2vJobs, setI2vJobs] = useState<Record<number, VideoJob[]>>({}) // keyed by ad_index, array per index (newest first)
  const [i2vCurrentVideoVersion, setI2vCurrentVideoVersion] = useState<Record<number, number>>({})
  const [i2vGenerating, setI2vGenerating] = useState(false)
  const [i2vExtending, setI2vExtending] = useState(false)
  const [i2vError, setI2vError] = useState<string | null>(null)
  const [i2vGenerateCount, setI2vGenerateCount] = useState(0) // tracks ad_index for multiple generates
  const [i2vSubMode, setI2vSubMode] = useState<'product' | 'ugc'>('ugc') // Product Video vs UGC
  const [i2vQuality, setI2vQuality] = useState<'standard' | 'premium'>('standard')
  const [i2vRemovingBg, setI2vRemovingBg] = useState(false)
  const [i2vBgRemoved, setI2vBgRemoved] = useState(false)

  // UGC state
  const [ugcSettings, setUgcSettings] = useState<UGCSettings>({
    gender: 'male',
    ageRange: 'adult',
    tone: 'authentic',
    features: [],
    clothing: 'Casual',
    scene: 'indoors',
    setting: 'Living Room',
    notes: '',
  })
  const [ugcPrompt, setUgcPrompt] = useState<UGCPromptResult | null>(null)
  const [ugcGenerating, setUgcGenerating] = useState(false)
  const [ugcError, setUgcError] = useState<string | null>(null)

  // Helpers for multi-variation video carousel
  const getI2vJobsForIndex = (idx: number): VideoJob[] => i2vJobs[idx] || []
  const getI2vActiveJob = (idx: number): VideoJob | null => {
    const jobs = getI2vJobsForIndex(idx)
    const version = i2vCurrentVideoVersion[idx] ?? 0
    return jobs[version] || null
  }

  const router = useRouter()

  // Save copy state
  const [savingCopyIndex, setSavingCopyIndex] = useState<number | null>(null)
  const [savedCopyIds, setSavedCopyIds] = useState<Record<number, boolean>>({})

  // AI credit usage tracking
  const [aiUsage, setAiUsage] = useState<{ used: number; planLimit: number; purchased: number; totalAvailable: number; remaining: number; status: string } | null>(null)

  // Fetch AI credit usage
  const refreshCredits = useCallback(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(res => res.json())
      .then(data => { if (data.totalAvailable !== undefined) setAiUsage(data) })
      .catch(() => {})
  }, [user?.id])

  useEffect(() => {
    refreshCredits()
  }, [refreshCredits])

  // Pill toggle + add callbacks
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

  const canProceedFromPills = selected.name.length > 0
  const totalPillsFound = Object.values(pools).reduce((sum, arr) => sum + arr.length, 0)
  const totalSelected = Object.values(selected).reduce((sum, arr) => sum + arr.length, 0)

  // Assemble productInfo from selected pills and proceed
  const handleProceedFromPills = useCallback(() => {
    if (!canProceedFromPills) return

    const pick = (cat: PillCategory) => selected[cat].map(i => pools[cat][i])
    const pickOne = (cat: PillCategory) => pick(cat)[0] || undefined

    const assembled: ProductInfo = {
      name: pickOne('name')!,
      description: pickOne('description'),
      features: pick('features').length > 0 ? pick('features') : undefined,
      benefits: pick('benefits').length > 0 ? pick('benefits') : undefined,
      painPoints: pick('painPoints').length > 0 ? pick('painPoints') : undefined,
      testimonialPoints: pick('testimonials').length > 0 ? pick('testimonials') : undefined,
      keyMessages: pick('keyMessages').length > 0 ? pick('keyMessages') : undefined,
      targetAudience: extraContext.targetAudience || undefined,
      category: extraContext.category || undefined,
      uniqueSellingPoint: extraContext.uniqueSellingPoint || undefined,
      // Carry over image/price/brand/currency from raw analysis
      ...(rawAnalysisRef.current ? {
        imageBase64: rawAnalysisRef.current.imageBase64 as string | undefined,
        imageMimeType: rawAnalysisRef.current.imageMimeType as string | undefined,
        imageUrl: rawAnalysisRef.current.imageUrl as string | undefined,
        price: rawAnalysisRef.current.price as string | undefined,
        brand: rawAnalysisRef.current.brand as string | undefined,
        currency: rawAnalysisRef.current.currency as string | undefined,
      } : {}),
    }

    setProductInfo(assembled)

    // Image-to-video mode goes to step 2 (image selection)
    // Create mode skips competitor search, goes straight to generate
    // Clone mode with pre-selected ad also skips to generate
    if (mode === 'image-to-video') {
      setCurrentStep(2)
    } else if (mode === 'create' || selectedAd) {
      setCurrentStep(3)
    } else {
      setCurrentStep(2)
    }
  }, [canProceedFromPills, selected, pools, extraContext, mode, selectedAd])

  // Save image to session for persistence
  const saveImageToSession = useCallback(async (
    adIndex: number,
    versionIndex: number,
    storageUrl: string,
    mediaHash?: string,
    mimeType?: string
  ) => {
    if (!sessionId || !user?.id) return

    const newImage = { adIndex, versionIndex, storageUrl, mediaHash, mimeType }
    const updatedImages = [...sessionImages, newImage]

    try {
      const res = await fetch('/api/creative-studio/ad-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          sessionId,
          generatedImages: updatedImages,
        }),
      })

      if (res.ok) {
        setSessionImages(updatedImages)
      }
    } catch (err) {
      console.error('[AdStudio] Error saving image to session:', err)
    }
  }, [sessionId, user?.id, sessionImages])

  // Step 1: Analyze product URL
  const handleAnalyzeProduct = useCallback(async () => {
    if (!productUrl.trim()) return

    setIsAnalyzingProduct(true)
    setProductError(null)
    setProductInfo(null)

    try {
      const res = await fetch('/api/creative-studio/analyze-product-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      })

      const data = await res.json()

      if (!res.ok) {
        setProductError(data.error || 'Failed to analyze product')
        return
      }

      const p = data.product
      // Store raw analysis for later assembly (image, price, brand, currency)
      rawAnalysisRef.current = {
        imageBase64: p.imageBase64,
        imageMimeType: p.imageMimeType,
        imageUrl: p.imageUrl,
        price: p.price,
        brand: p.brand,
        currency: p.currency,
      }
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
      setExtraContext({
        targetAudience: p.targetAudience || '',
        category: p.category || '',
        uniqueSellingPoint: p.uniqueSellingPoint || '',
      })
      // Store multiple product images for selection
      if (data.productImages && data.productImages.length > 0) {
        setProductImageOptions(data.productImages)
        setSelectedProductImageIdx(0)
      } else {
        setProductImageOptions([])
      }
      setHasAnalyzed(true)
      // Do NOT advance step — wait for user pill selection
    } catch (err) {
      setProductError('Failed to analyze product URL')
    } finally {
      setIsAnalyzingProduct(false)
    }
  }, [productUrl])

  // Handle selecting a different product image from the thumbnail strip
  const handleSelectProductImage = useCallback((idx: number) => {
    setSelectedProductImageIdx(idx)
    const img = productImageOptions[idx]
    if (img) {
      // Update rawAnalysisRef so pill proceed picks up the selected image
      if (rawAnalysisRef.current) {
        rawAnalysisRef.current = {
          ...rawAnalysisRef.current,
          imageBase64: img.base64,
          imageMimeType: img.mimeType,
        }
      }
      // Also update productInfo if it already exists (for post-pill-proceed state)
      if (productInfo) {
        setProductInfo(prev => prev ? {
          ...prev,
          imageBase64: img.base64,
          imageMimeType: img.mimeType,
        } : prev)
      }
    }
  }, [productImageOptions, productInfo])

  // Handle adding a product image after URL analysis (when extraction failed)
  const handleAddProductImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !productInfo) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setProductInfo({
        ...productInfo,
        imageBase64: base64,
        imageMimeType: file.type,
      })
    }
    reader.readAsDataURL(file)
  }, [productInfo])

  // Handle manual product image upload
  const handleManualImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingManualImage(true)
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setManualProductImage({
        base64,
        mimeType: file.type,
        preview: reader.result as string,
      })
      setIsUploadingManualImage(false)
    }
    reader.onerror = () => {
      setProductError('Failed to read image file')
      setIsUploadingManualImage(false)
    }
    reader.readAsDataURL(file)
  }, [])

  // Use manual product entry
  const handleUseManualProduct = useCallback(() => {
    if (!manualProductName.trim()) {
      setProductError('Please enter a product name')
      return
    }

    setProductError(null)
    // Store manual image data in rawAnalysisRef
    rawAnalysisRef.current = {
      imageBase64: manualProductImage?.base64,
      imageMimeType: manualProductImage?.mimeType,
    }
    // Pre-populate pills from manual input
    setPools(prev => ({
      ...prev,
      name: [manualProductName.trim()],
      description: manualProductDescription.trim() ? [manualProductDescription.trim()] : [],
    }))
    setSelected(prev => ({
      ...prev,
      name: [0], // Auto-select the name
      description: manualProductDescription.trim() ? [0] : [],
    }))
    setHasAnalyzed(true)
    // Do NOT advance step — wait for user pill selection
  }, [manualProductName, manualProductDescription, manualProductImage])

  // Step 2: Load competitor ads
  const loadCompetitorAds = useCallback(async (company: CompetitorSearchResult, cursor?: string) => {
    setIsLoadingAds(true)

    try {
      // Prefer pageId if available (more precise), fallback to company name
      let url = company.pageId
        ? `/api/creative-studio/competitor-ads?pageId=${encodeURIComponent(company.pageId)}`
        : `/api/creative-studio/competitor-ads?company=${encodeURIComponent(company.name)}`
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`
      }

      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        console.error('Failed to load competitor ads:', data.error)
        return
      }

      if (cursor) {
        // Append to existing ads
        setCompetitorAds(prev => [...prev, ...(data.ads || [])])
      } else {
        // Fresh load
        setCompetitorAds(data.ads || [])
        setCompetitorStats(data.stats || null)
      }
      setNextCursor(data.nextCursor || null)
    } catch (err) {
      console.error('Failed to load competitor ads:', err)
    } finally {
      setIsLoadingAds(false)
    }
  }, [])

  // Handle company selection
  const handleCompanySelect = useCallback((company: CompetitorSearchResult) => {
    setSelectedCompany(company)
    setCompetitorAds([])
    setCompetitorStats(null)
    setNextCursor(null)
    loadCompetitorAds(company)
  }, [loadCompetitorAds])

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (selectedCompany && nextCursor && !isLoadingAds) {
      loadCompetitorAds(selectedCompany, nextCursor)
    }
  }, [selectedCompany, nextCursor, isLoadingAds, loadCompetitorAds])

  // Clear company selection
  const handleClearCompany = useCallback(() => {
    setSelectedCompany(null)
    setCompetitorAds([])
    setCompetitorStats(null)
    setNextCursor(null)
    // Reset filters
    setMediaTypeFilter('all')
    setDaysActiveFilter('all')
    setStatusFilter('all')
  }, [])

  // Use ad as inspiration - download the ad image for reference
  const handleUseAsInspiration = useCallback(async (ad: CompetitorAd, selectedCarouselIndex?: number) => {
    const adLibraryAd = competitorAdToAdLibraryAd(ad)
    setSelectedAd(adLibraryAd)
    setSelectedCompetitorAd(ad) // Keep original for display
    setViewingAd(null)
    setCurrentStep(3)
    setImageStyles({}) // Reset per-card styles — defaults to clone when reference ad present

    // Get the ad's image URL - use selected carousel index if provided
    const imageUrl = ad.mediaType === 'carousel' && ad.carouselCards && selectedCarouselIndex !== undefined
      ? ad.carouselCards[selectedCarouselIndex]?.imageUrl
      : ad.imageUrl || ad.videoThumbnail || ad.carouselCards?.[0]?.imageUrl

    if (imageUrl) {
      setIsDownloadingRefImage(true)
      try {
        console.log('[Ad Studio] Downloading reference ad image:', imageUrl)
        const res = await fetch('/api/creative-studio/download-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imageUrl }),
        })

        if (res.ok) {
          const data = await res.json()
          setReferenceAdImage({
            base64: data.base64,
            mimeType: data.mimeType,
          })
          console.log('[Ad Studio] Reference ad image downloaded successfully')
        } else {
          console.warn('[Ad Studio] Failed to download reference ad image')
          setReferenceAdImage(null)
        }
      } catch (err) {
        console.warn('[Ad Studio] Error downloading reference ad image:', err)
        setReferenceAdImage(null)
      } finally {
        setIsDownloadingRefImage(false)
      }
    } else {
      setReferenceAdImage(null)
    }
  }, [])

  // Load user's own ads for the "Your Ads" tab
  const loadOwnAds = useCallback(async () => {
    if (!user?.id || !currentAccountId || ownAdsLoaded) return

    setIsLoadingOwnAds(true)
    try {
      const res = await fetch(
        `/api/creative-studio/active-ads?userId=${user.id}&adAccountId=${currentAccountId}`
      )
      const data = await res.json()

      if (res.ok && data.ads) {
        const mapped: OwnAd[] = data.ads.map((ad: Record<string, unknown>) => ({
          ad_id: ad.ad_id as string,
          ad_name: ad.ad_name as string,
          adset_name: ad.adset_name as string,
          campaign_name: ad.campaign_name as string,
          status: ad.status as string,
          thumbnailUrl: ad.thumbnailUrl as string | null,
          imageUrl: ad.imageUrl as string | null,
          storageUrl: ad.storageUrl as string | null,
          mediaType: (ad.video_id || ad.media_type === 'video') ? 'video' as const : 'image' as const,
          primary_text: ad.primary_text as string | null,
          headline: ad.headline as string | null,
          description: ad.description as string | null,
          spend: ad.spend as number,
          revenue: ad.revenue as number,
          roas: ad.roas as number,
          ctr: ad.ctr as number,
          cpc: ad.cpc as number,
          hookScore: ad.hookScore as number | null,
          holdScore: ad.holdScore as number | null,
          clickScore: ad.clickScore as number | null,
          convertScore: ad.convertScore as number | null,
        }))
        setOwnAds(mapped)
        setOwnAdsLoaded(true)
      }
    } catch (err) {
      console.error('[AdStudio] Failed to load own ads:', err)
    } finally {
      setIsLoadingOwnAds(false)
    }
  }, [user?.id, currentAccountId, ownAdsLoaded])

  // Handle switching to "Your Ads" tab — lazy loads ads on first visit
  const handleCloneSourceChange = useCallback((source: 'competitor' | 'your-ads') => {
    setCloneSource(source)
    if (source === 'your-ads' && !ownAdsLoaded) {
      loadOwnAds()
    }
  }, [ownAdsLoaded, loadOwnAds])

  // Handle selecting own ad for creative refresh
  const handleSelectOwnAd = useCallback(async (ad: OwnAd) => {
    // Convert to AdLibraryAd format
    const adLibraryAd: AdLibraryAd = {
      id: ad.ad_id,
      page_name: ad.campaign_name,
      page_id: '',
      ad_snapshot_url: '',
      ad_creative_bodies: ad.primary_text ? [ad.primary_text] : [],
      ad_creative_link_titles: ad.headline ? [ad.headline] : [],
      ad_creative_link_descriptions: ad.description ? [ad.description] : [],
      ad_delivery_start_time: new Date().toISOString(),
      publisher_platforms: ['facebook'],
    }

    setSelectedAd(adLibraryAd)
    setSelectedCompetitorAd(null)
    setViewingOwnAd(null)
    setIsRefreshMode(true)
    setImageStyles({}) // Reset per-card styles — defaults to refresh when in refresh mode
    setCurrentStep(3)

    // Get the ad image for reference
    const imageUrl = ad.storageUrl || ad.imageUrl || ad.thumbnailUrl
    if (imageUrl) {
      setIsDownloadingRefImage(true)
      try {
        // If it's a Supabase storage URL, fetch directly
        const isStorageUrl = imageUrl.includes('supabase')
        if (isStorageUrl) {
          const res = await fetch(imageUrl)
          if (res.ok) {
            const blob = await res.blob()
            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1])
              reader.readAsDataURL(blob)
            })
            setReferenceAdImage({
              base64,
              mimeType: blob.type || 'image/jpeg',
            })
          } else {
            setReferenceAdImage(null)
          }
        } else {
          // External URL — download via server
          const res = await fetch('/api/creative-studio/download-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: imageUrl }),
          })
          if (res.ok) {
            const data = await res.json()
            setReferenceAdImage({
              base64: data.base64,
              mimeType: data.mimeType,
            })
          } else {
            setReferenceAdImage(null)
          }
        }
      } catch (err) {
        console.warn('[AdStudio] Error downloading own ad image:', err)
        setReferenceAdImage(null)
      } finally {
        setIsDownloadingRefImage(false)
      }
    } else {
      setReferenceAdImage(null)
    }
  }, [])

  // Use inspiration example - enter Clone flow at Step 1 (Product URL)
  const handleSelectInspiration = useCallback(async (example: InspirationExample) => {
    // Convert to AdLibraryAd format and set as selected
    const adLibraryAd = inspirationToAdLibraryAd(example)
    setSelectedAd(adLibraryAd)

    // Download the inspiration image for reference
    const imageUrl = example.imageUrl || example.videoThumbnail || example.carouselCards?.[0]?.imageUrl
    if (imageUrl) {
      setIsDownloadingRefImage(true)
      try {
        console.log('[Ad Studio] Downloading inspiration image:', imageUrl)
        const res = await fetch('/api/creative-studio/download-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imageUrl }),
        })

        if (res.ok) {
          const data = await res.json()
          setReferenceAdImage({
            base64: data.base64,
            mimeType: data.mimeType,
          })
          console.log('[Ad Studio] Inspiration image downloaded successfully')
        } else {
          setReferenceAdImage(null)
        }
      } catch (err) {
        console.warn('[Ad Studio] Error downloading inspiration image:', err)
        setReferenceAdImage(null)
      } finally {
        setIsDownloadingRefImage(false)
      }
    } else {
      setReferenceAdImage(null)
    }

    // Switch to Clone mode and go to Step 1 (Product URL)
    setMode('clone')
    setCurrentStep(1)
  }, [])

  // Count active filters
  const activeFiltersCount = [
    mediaTypeFilter !== 'all',
    daysActiveFilter !== 'all',
    statusFilter !== 'all',
  ].filter(Boolean).length

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setMediaTypeFilter('all')
    setDaysActiveFilter('all')
    setStatusFilter('all')
  }, [])

  // Filter ads
  const filteredAds = filterCompetitorAds(competitorAds, {
    mediaType: mediaTypeFilter,
    daysActive: daysActiveFilter,
    status: statusFilter,
  })

  // Compute own ads media mix (from unfiltered list)
  const ownAdsMediaMix = useMemo(() => {
    const total = ownAds.length
    if (total === 0) return { video: 0, image: 0, carousel: 0, text: 0 }
    const videoCount = ownAds.filter(a => a.mediaType === 'video').length
    const imageCount = ownAds.filter(a => a.mediaType === 'image').length
    return {
      video: Math.round((videoCount / total) * 100),
      image: Math.round((imageCount / total) * 100),
      carousel: 0,
      text: 0,
    }
  }, [ownAds])

  const ownAdsActiveCount = useMemo(() => ownAds.filter(a => a.status === 'ACTIVE').length, [ownAds])

  // Filter and sort own ads
  const filteredOwnAds = ownAds
    .filter(ad => {
      // Media type filter
      if (ownAdMediaFilter !== 'all' && ad.mediaType !== ownAdMediaFilter) return false
      // Status filter
      if (ownAdStatusFilter === 'active' && ad.status !== 'ACTIVE') return false
      if (ownAdStatusFilter === 'paused' && ad.status === 'ACTIVE') return false
      // Performance filter
      if (ownAdFilter === 'top-performers') {
        return (ad.hookScore !== null && ad.hookScore >= 75) ||
               (ad.holdScore !== null && ad.holdScore >= 75) ||
               (ad.clickScore !== null && ad.clickScore >= 75) ||
               (ad.convertScore !== null && ad.convertScore >= 75)
      }
      return true
    })
    .sort((a, b) => {
      switch (ownAdSortBy) {
        case 'roas': return b.roas - a.roas
        case 'scores': {
          const avgA = [a.hookScore, a.holdScore, a.clickScore, a.convertScore].filter((s): s is number => s !== null)
          const avgB = [b.hookScore, b.holdScore, b.clickScore, b.convertScore].filter((s): s is number => s !== null)
          const scoreA = avgA.length > 0 ? avgA.reduce((s, v) => s + v, 0) / avgA.length : 0
          const scoreB = avgB.length > 0 ? avgB.reduce((s, v) => s + v, 0) / avgB.length : 0
          return scoreB - scoreA
        }
        default: return b.spend - a.spend
      }
    })

  // Step 3: Generate
  const handleGenerate = useCallback(async () => {
    // Clone mode requires selectedAd, Create mode doesn't
    if (mode === 'clone' && !selectedAd) return
    if (!productInfo || !user?.id || !currentAccountId) return

    setIsGenerating(true)
    setGeneratedAds([])
    setSessionId(null)

    try {
      // Different API call for Create vs Clone mode
      const endpoint = mode === 'create'
        ? '/api/creative-studio/generate-from-product'
        : '/api/creative-studio/generate-from-competitor'

      const body = mode === 'create'
        ? { product: productInfo }
        : {
            competitorAd: {
              pageName: selectedAd!.page_name,
              bodies: selectedAd!.ad_creative_bodies,
              headlines: selectedAd!.ad_creative_link_titles,
              descriptions: selectedAd!.ad_creative_link_descriptions,
            },
            product: productInfo,
            isRefresh: isRefreshMode,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      const ads = data.ads || []
      setGeneratedAds(ads)

      // Save session for AI Tasks page (strip base64 to avoid body size limit)
      if (ads.length > 0) {
        try {
          const { imageBase64: _img, imageMimeType: _mime, ...sessionProductInfo } = productInfo || {}
          const sessionRes = await fetch('/api/creative-studio/ad-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              adAccountId: currentAccountId,
              productUrl,
              productInfo: sessionProductInfo,
              competitorCompany: selectedCompany,
              competitorAd: selectedAd,
              generatedAds: ads,
              imageStyle: referenceAdImage ? (isRefreshMode ? 'refresh' : 'clone') : 'lifestyle',
            }),
          })
          const sessionData = await sessionRes.json()
          if (sessionData.session?.id) {
            setSessionId(sessionData.session.id)
            console.log('[AdStudio] Session saved:', sessionData.session.id)
          }
        } catch (sessionErr) {
          console.warn('[AdStudio] Failed to save session:', sessionErr)
          // Don't fail the generation if session save fails
        }
      }
    } catch (err) {
      console.error('Generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [mode, selectedAd, productInfo, user?.id, currentAccountId, productUrl, selectedCompany, isRefreshMode, referenceAdImage])

  const copyToClipboard = (ad: GeneratedAd, index: number) => {
    const text = `Headline: ${ad.headline}\n\nPrimary Text: ${ad.primaryText}\n\nDescription: ${ad.description}`
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleSaveCopy = useCallback(async (ad: GeneratedAd, index: number) => {
    if (!user?.id || !currentAccountId) return
    if (savedCopyIds[index]) return

    setSavingCopyIndex(index)
    try {
      const res = await fetch('/api/creative-studio/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description,
          angle: ad.angle,
          sessionId: sessionId || undefined,
        }),
      })

      if (res.ok) {
        setSavedCopyIds(prev => ({ ...prev, [index]: true }))
      }
    } catch (err) {
      console.error('Failed to save copy:', err)
    } finally {
      setSavingCopyIndex(null)
    }
  }, [user?.id, currentAccountId, savedCopyIds, sessionId])

  const handleGenerateImage = useCallback(async (ad: GeneratedAd, index: number) => {
    if (!productInfo || !user?.id || !currentAccountId) return

    setGeneratingImageIndex(index)
    setImageErrors(prev => ({ ...prev, [index]: '' }))

    try {
      // Build request body - include reference ad image if available
      const requestBody: Record<string, unknown> = {
        userId: user.id,
        adCopy: {
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description,
          angle: ad.angle,
        },
        product: productInfo,
        style: imageStyles[index] || (referenceAdImage ? (isRefreshMode ? 'refresh' : 'clone') : 'lifestyle'),
        aspectRatio: '1:1',
        isRefresh: isRefreshMode,
      }

      console.log('[Ad Studio] Product image present:', Boolean(productInfo.imageBase64), 'length:', productInfo.imageBase64?.length || 0)

      // Add reference ad image for style matching (Clone mode)
      if (referenceAdImage) {
        requestBody.referenceAd = {
          imageBase64: referenceAdImage.base64,
          imageMimeType: referenceAdImage.mimeType,
        }
        console.log('[Ad Studio] Generating image with reference ad style (Clone mode), ref ad length:', referenceAdImage.base64.length)
      } else if (imagePrompts[index]) {
        // Create mode - use user's image prompt
        requestBody.imagePrompt = imagePrompts[index]
        console.log('[Ad Studio] Generating image with user prompt (Create mode)')
      }

      const res = await fetch('/api/creative-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json()

      // Log which model actually generated the image
      console.log('[Ad Studio] Image generated by model:', data.model || 'unknown', data.fallbackReason ? '| Gemini fallback reason: ' + data.fallbackReason : '')

      if (!res.ok) {
        if (res.status === 429 && data.totalAvailable) {
          setAiUsage({ used: data.used, planLimit: data.totalAvailable, purchased: 0, totalAvailable: data.totalAvailable, remaining: data.remaining || 0, status: data.status })
        }
        setImageErrors(prev => ({ ...prev, [index]: data.error || 'Failed to generate image' }))
        return
      }

      // Optimistically update credit usage
      setAiUsage(prev => prev ? { ...prev, used: prev.used + 5, remaining: Math.max(0, prev.remaining - 5) } : prev)

      // Calculate version index
      const existingImages = generatedImages[index] || []
      const versionIndex = existingImages.length

      // Upload to Supabase Storage for session persistence (NOT to media library)
      const saveRes = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad - ${ad.angle} - ${sessionId || 'new'}`,
          userId: user.id,
          saveToLibrary: false,
        }),
      })

      const saveData = await saveRes.json()

      // Create image object with storage info if available
      const newImage: GeneratedImage = {
        base64: data.image.base64,
        mimeType: data.image.mimeType,
      }

      if (saveRes.ok && saveData.storageUrl) {
        newImage.storageUrl = saveData.storageUrl
        newImage.mediaHash = saveData.mediaHash

        // Save to session for AI Tasks persistence
        await saveImageToSession(index, versionIndex, saveData.storageUrl, saveData.mediaHash, data.image.mimeType)
      }

      // Store as array of versions
      setGeneratedImages(prev => {
        const existing = prev[index] || []
        return { ...prev, [index]: [...existing, newImage] }
      })
      setCurrentImageVersion(prev => ({ ...prev, [index]: versionIndex }))
    } catch (err) {
      setImageErrors(prev => ({ ...prev, [index]: 'Failed to generate image' }))
    } finally {
      setGeneratingImageIndex(null)
    }
  }, [productInfo, imageStyles, referenceAdImage, user?.id, currentAccountId, sessionId, generatedImages, saveImageToSession, imagePrompts, isRefreshMode])

  // Adjust an existing image with a prompt
  const handleAdjustImage = useCallback(async (adIndex: number) => {
    if (!user?.id || !currentAccountId) return

    const images = generatedImages[adIndex]
    const currentVersion = currentImageVersion[adIndex] ?? 0
    const currentImage = images?.[currentVersion]
    const prompt = adjustmentPrompts[adIndex]

    if (!currentImage || !prompt?.trim()) return

    setAdjustingImageIndex(adIndex)
    setImageErrors(prev => ({ ...prev, [adIndex]: '' }))

    try {
      const res = await fetch('/api/creative-studio/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentImage.base64,
          imageMimeType: currentImage.mimeType,
          adjustmentPrompt: prompt,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setImageErrors(prev => ({ ...prev, [adIndex]: data.error || 'Failed to adjust image' }))
        return
      }

      // Calculate version index for the new image
      const versionIndex = (generatedImages[adIndex] || []).length

      // Upload adjusted image to Supabase Storage (NOT to media library)
      const saveRes = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad Adjusted - ${sessionId || 'new'}`,
          userId: user.id,
          saveToLibrary: false,
        }),
      })

      const saveData = await saveRes.json()

      // Create image object
      const newImage: GeneratedImage = {
        base64: data.image.base64,
        mimeType: data.image.mimeType,
      }

      if (saveRes.ok && saveData.storageUrl) {
        newImage.storageUrl = saveData.storageUrl
        newImage.mediaHash = saveData.mediaHash

        // Save to session for AI Tasks persistence
        await saveImageToSession(adIndex, versionIndex, saveData.storageUrl, saveData.mediaHash, data.image.mimeType)
      }

      // Add new version to the array and navigate to it
      setGeneratedImages(prev => {
        const newImages = [...(prev[adIndex] || []), newImage]
        setTimeout(() => {
          setCurrentImageVersion(curr => ({
            ...curr,
            [adIndex]: newImages.length - 1
          }))
        }, 0)
        return {
          ...prev,
          [adIndex]: newImages
        }
      })
      // Clear the adjustment prompt
      setAdjustmentPrompts(prev => ({ ...prev, [adIndex]: '' }))
    } catch (err) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to adjust image' }))
    } finally {
      setAdjustingImageIndex(null)
    }
  }, [generatedImages, currentImageVersion, adjustmentPrompts, user?.id, currentAccountId, sessionId, saveImageToSession])

  // Navigate between image versions
  const navigateVersion = (adIndex: number, direction: 'prev' | 'next') => {
    const images = generatedImages[adIndex]
    if (!images || images.length <= 1) return

    const current = currentImageVersion[adIndex] ?? 0
    const newVersion = direction === 'prev'
      ? Math.max(0, current - 1)
      : Math.min(images.length - 1, current + 1)

    setCurrentImageVersion(prev => ({ ...prev, [adIndex]: newVersion }))
  }

  // Save image to media library (explicit user action)
  const handleSaveToLibrary = useCallback(async (adIndex: number, ad: GeneratedAd) => {
    if (!currentAccountId || !user?.id) return

    const images = generatedImages[adIndex]
    const versionIndex = currentImageVersion[adIndex] ?? 0
    const image = images?.[versionIndex]
    if (!image) return

    const saveKey = `${adIndex}-${versionIndex}`
    if (savedToLibrary[saveKey]) return // Already saved

    if (!image.base64) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Image data not available - please regenerate' }))
      return
    }

    setSavingToLibrary(prev => ({ ...prev, [adIndex]: true }))

    try {
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: image.base64,
          mimeType: image.mimeType,
          adAccountId: currentAccountId,
          name: `AI Ad - ${ad.angle} - ${new Date().toLocaleDateString()}`,
          userId: user.id,
          saveToLibrary: true,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      // Update image with Meta hash so Create Ad can use it
      setGeneratedImages(prev => {
        const imgs = [...(prev[adIndex] || [])]
        if (imgs[versionIndex]) {
          imgs[versionIndex] = { ...imgs[versionIndex], mediaHash: data.mediaHash, storageUrl: data.storageUrl }
        }
        return { ...prev, [adIndex]: imgs }
      })

      setSavedToLibrary(prev => ({ ...prev, [saveKey]: true }))
    } catch (err) {
      console.error('Failed to save to library:', err)
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to save to library' }))
    } finally {
      setSavingToLibrary(prev => ({ ...prev, [adIndex]: false }))
    }
  }, [currentAccountId, user?.id, generatedImages, currentImageVersion, savedToLibrary])

  const downloadImage = (image: GeneratedImage, adIndex: number, versionIndex: number) => {
    const link = document.createElement('a')
    link.href = `data:${image.mimeType};base64,${image.base64}`
    link.download = `ad-image-${adIndex + 1}-v${versionIndex + 1}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Create ad directly - save to library first, then open wizard with pre-populated data
  const handleCreateAd = useCallback(async (adIndex: number, ad: GeneratedAd) => {
    if (!currentAccountId || !user?.id) return

    const images = generatedImages[adIndex]
    const versionIndex = currentImageVersion[adIndex] ?? 0
    const image = images?.[versionIndex]
    if (!image) return

    setCreatingAd(prev => ({ ...prev, [adIndex]: true }))

    try {
      const saveKey = `${adIndex}-${versionIndex}`
      let storageUrl: string
      let imageHash: string

      // If already saved to library (has Meta hash), reuse it
      if (image.mediaHash && image.storageUrl) {
        storageUrl = image.storageUrl
        imageHash = image.mediaHash
      } else if (image.base64) {
        // Upload to Meta + media library for ad creation
        const res = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: image.base64,
            mimeType: image.mimeType,
            adAccountId: currentAccountId,
            name: `AI Ad - ${ad.angle} - ${new Date().toLocaleDateString()}`,
            userId: user.id,
            saveToLibrary: true,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save')
        storageUrl = data.storageUrl
        imageHash = data.mediaHash
        setSavedToLibrary(prev => ({ ...prev, [saveKey]: true }))
      } else {
        throw new Error('No image data available')
      }

      // Set up wizard with pre-populated creative and copy
      const creative: Creative = {
        preview: storageUrl,
        type: 'image',
        uploaded: true,
        isFromLibrary: true,
        imageHash: imageHash,
      }

      setWizardCreatives([creative])
      setWizardCopy({
        primaryText: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
      })
      setShowLaunchWizard(true)
    } catch (err) {
      console.error('Failed to create ad:', err)
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to save image for ad creation' }))
    } finally {
      setCreatingAd(prev => ({ ...prev, [adIndex]: false }))
    }
  }, [currentAccountId, user?.id, generatedImages, currentImageVersion, savedToLibrary])

  const resetToStep = (step: 1 | 2 | 3) => {
    if (step === 1) {
      setProductInfo(null)
      setSelectedAd(null)
      setGeneratedAds([])
      setGeneratedImages({})
      setCurrentImageVersion({})
      setImageErrors({})
      setReferenceAdImage(null)
      setAdjustmentPrompts({})
      setSavedToLibrary({})
      setImagePrompts({})
      setIsRefreshMode(false)
      // Reset pill state
      setPools({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
      setSelected({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
      setExtraContext({ targetAudience: '', category: '', uniqueSellingPoint: '' })
      setHasAnalyzed(false)
      rawAnalysisRef.current = null
      // Reset step 2 state
      handleClearCompany()
    } else if (step === 2) {
      setSelectedAd(null)
      setGeneratedAds([])
      setGeneratedImages({})
      setCurrentImageVersion({})
      setImageErrors({})
      setReferenceAdImage(null)
      setAdjustmentPrompts({})
      setSavedToLibrary({})
      setImagePrompts({})
      setIsRefreshMode(false)
    }
    setCurrentStep(step)
  }

  const resetToModeSelection = () => {
    setMode(null)
    setCurrentStep(1)
    setProductUrl('')
    setProductInfo(null)
    setProductError(null)
    setSelectedAd(null)
    setGeneratedAds([])
    setGeneratedImages({})
    setCurrentImageVersion({})
    setImageErrors({})
    setReferenceAdImage(null)
    setAdjustmentPrompts({})
    setSavedToLibrary({})
    setImagePrompts({})
    setUploadedImage(null)
    setUploadPrompt('')
    setIsRefreshMode(false)
    setCloneSource('competitor')
    // Reset i2v state
    setI2vSelectedImage(null)
    setI2vRemovingBg(false)
    setI2vBgRemoved(false)
    setI2vShowLibrary(false)
    setI2vDownloadingLibrary(false)
    setI2vPrompt('')
    setI2vDuration(8)
    setI2vCanvasId(null)
    setI2vJobs({})
    setI2vCurrentVideoVersion({})
    setI2vGenerating(false)
    setI2vExtending(false)
    setI2vError(null)
    setI2vGenerateCount(0)
    setI2vSubMode('product')
    // Reset UGC state
    setUgcSettings({ gender: 'female', ageRange: 'adult', tone: 'authentic', features: [], clothing: 'Casual', scene: 'indoors', setting: 'Living Room', notes: '' })
    setUgcPrompt(null)
    setUgcGenerating(false)
    setUgcError(null)
    // Reset pill state
    setPools({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
    setSelected({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
    setExtraContext({ targetAudience: '', category: '', uniqueSellingPoint: '' })
    setHasAnalyzed(false)
    rawAnalysisRef.current = null
    handleClearCompany()
  }

  // Upload mode: Handle file upload
  const handleFileUpload = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setProductError('Please upload an image file (PNG, JPG, WEBP)')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setProductError('Image must be less than 10MB')
      return
    }

    setProductError(null)

    // Create preview URL and convert to base64
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      setUploadedImage({
        base64,
        mimeType: file.type,
        preview: URL.createObjectURL(file),
      })
    }
    reader.readAsDataURL(file)
  }, [])

  // Upload mode: Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  // Upload mode: Generate from uploaded image + prompt
  const handleUploadGenerate = useCallback(async () => {
    if (!uploadedImage || !uploadPrompt.trim()) return
    if (!user?.id || !currentAccountId) {
      setProductError('Please select an ad account first.')
      return
    }

    setIsGenerating(true)
    setGeneratedAds([])
    setSessionId(null)
    setProductError(null)

    try {
      // Create product info with image for local state
      const uploadProductInfo: ProductInfo = {
        name: 'Custom Product',
        description: uploadPrompt,
        imageBase64: uploadedImage.base64,
        imageMimeType: uploadedImage.mimeType,
      }
      setProductInfo(uploadProductInfo)

      // For API call, only include image if under 3MB base64 (avoid Vercel body limit)
      const imageSmallEnough = uploadedImage.base64.length < 3 * 1024 * 1024
      const apiProduct: ProductInfo = {
        name: 'Custom Product',
        description: uploadPrompt,
        ...(imageSmallEnough ? { imageBase64: uploadedImage.base64, imageMimeType: uploadedImage.mimeType } : {}),
      }

      // Generate ad copy variations using the prompt as the product description
      const res = await fetch('/api/creative-studio/generate-from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: apiProduct }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      const ads = data.ads || []
      setGeneratedAds(ads)

      // Pre-fill image prompts with the user's upload prompt
      const prompts: Record<number, string> = {}
      ads.forEach((_: GeneratedAd, idx: number) => {
        prompts[idx] = uploadPrompt
      })
      setImagePrompts(prompts)

      // Save session for AI Tasks page (strip base64 to avoid body size limit)
      if (ads.length > 0) {
        try {
          const { imageBase64: _img, ...sessionProductInfo } = uploadProductInfo
          const sessionRes = await fetch('/api/creative-studio/ad-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              adAccountId: currentAccountId,
              productUrl: 'upload',
              productInfo: sessionProductInfo,
              competitorCompany: null,
              competitorAd: null,
              generatedAds: ads,
              imageStyle: 'lifestyle',
            }),
          })
          const sessionData = await sessionRes.json()
          if (sessionData.session?.id) {
            setSessionId(sessionData.session.id)
            console.log('[AdStudio] Session saved:', sessionData.session.id)
          }
        } catch (sessionErr) {
          console.warn('[AdStudio] Failed to save session:', sessionErr)
        }
      }

      // Move to step 3 to show results
      setCurrentStep(3)
    } catch (err) {
      console.error('[AdStudio] Upload generation failed:', err)
      setProductError(err instanceof Error ? err.message : 'Failed to generate ads. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [uploadedImage, uploadPrompt, user?.id, currentAccountId])

  // ── Image-to-Video: Video Studio patterns ──────────────────────────────────

  const VEO_EXTENSION_STEP = 7
  const I2V_QUALITY_COSTS = {
    standard: { base: 20, extension: 10 },
    premium:  { base: 50, extension: 25 },
  }
  // UGC always uses premium costs
  const VEO_EXTENSION_COST = 25
  const VEO_BASE_COST = 50

  const i2vCosts = I2V_QUALITY_COSTS[i2vQuality]
  const i2vCreditCost = i2vCosts.base + Math.max(0, (i2vDuration - 8) / VEO_EXTENSION_STEP) * i2vCosts.extension
  const i2vApiProvider = i2vDuration > 8 ? 'veo-ext' : 'veo'

  // Poll jobs by canvasId (same pattern as Video Studio)
  const pollI2vJobsRef = useRef<NodeJS.Timeout | null>(null)

  const refreshI2vJobs = useCallback(async (overrideCanvasId?: string) => {
    const cId = overrideCanvasId || i2vCanvasId
    if (!user?.id || !cId) return
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, canvasId: cId }),
      })
      if (res.ok) {
        const data = await res.json()
        const jobMap: Record<number, VideoJob[]> = {}
        for (const j of (data.jobs || [])) {
          if (j.ad_index !== null && j.ad_index !== undefined) {
            if (!jobMap[j.ad_index]) jobMap[j.ad_index] = []
            jobMap[j.ad_index].push(j)
          }
        }
        setI2vJobs(jobMap)
      }
    } catch (err) {
      console.error('[I2V] Poll error:', err)
    }
  }, [user?.id, i2vCanvasId, currentAccountId])

  const i2vHasInProgressJobs = Object.values(i2vJobs).some(
    jobs => jobs.some(j => j.status === 'generating' || j.status === 'queued' || j.status === 'rendering' || j.status === 'extending')
  )

  // Initial fetch when canvasId is set
  useEffect(() => {
    if (!i2vCanvasId || !user?.id) return
    refreshI2vJobs()
  }, [i2vCanvasId, user?.id, refreshI2vJobs])

  // Poll while any job is in-progress (15s interval)
  useEffect(() => {
    if (!i2vHasInProgressJobs || !i2vCanvasId) return
    pollI2vJobsRef.current = setInterval(refreshI2vJobs, 15000)
    return () => { if (pollI2vJobsRef.current) { clearInterval(pollI2vJobsRef.current); pollI2vJobsRef.current = null } }
  }, [i2vHasInProgressJobs, i2vCanvasId, refreshI2vJobs])

  // Generate video — creates canvas if needed, then calls generate-video
  const handleI2vGenerate = useCallback(async () => {
    if (!i2vSelectedImage || !i2vPrompt.trim() || !user?.id || !currentAccountId || !productInfo) return

    setI2vGenerating(true)
    setI2vError(null)

    try {
      // Create canvas if first generation (so it appears in AI Tasks)
      let canvasId = i2vCanvasId
      if (!canvasId) {
        // Build overlay content from product knowledge (mirrors Video Studio concept overlays)
        const hookText = productInfo.painPoints?.[0]
          || productInfo.keyMessages?.[0]
          || productInfo.uniqueSellingPoint
          || productInfo.benefits?.[0]
          || productInfo.name
        const captionSources = [
          ...(productInfo.benefits || []),
          ...(productInfo.features || []),
          ...(productInfo.keyMessages || []),
        ]
        const captions = captionSources.slice(0, 3).map(s =>
          s.length > 60 ? s.slice(0, 57) + '...' : s
        )
        const ctaText = productInfo.price
          ? `Get it for ${productInfo.price}`
          : productInfo.category?.toLowerCase().includes('service')
            ? 'Try it Free'
            : 'Shop Now'

        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: productUrl || null,
            productKnowledge: {
              name: productInfo.name,
              description: productInfo.description,
              features: productInfo.features,
              benefits: productInfo.benefits,
              painPoints: productInfo.painPoints,
              keyMessages: productInfo.keyMessages,
              uniqueSellingPoint: productInfo.uniqueSellingPoint,
            },
            concepts: [{
              title: 'Image to Video',
              angle: 'Product Showcase',
              logline: `Animate ${productInfo.name} into a scroll-stopping video ad`,
              visualMetaphor: `Product image comes to life — the motion itself IS the hook`,
              whyItWorks: 'Still-to-motion grabs attention. The product is the star.',
              videoPrompt: i2vPrompt,
              overlay: { hook: hookText, captions, cta: ctaText },
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          canvasId = canvasData.canvas.id
          setI2vCanvasId(canvasId)
        }
      }

      // Always use adIndex 0 (single concept — variations stack under same index for carousel)
      const adIndex = 0

      // If re-generating, match existing video's duration
      const existingJobs = getI2vJobsForIndex(adIndex)
      const existingCompleted = existingJobs.find(j => j.status === 'complete')
      const effectiveDuration = existingCompleted
        ? (existingCompleted.target_duration_seconds || existingCompleted.duration_seconds || i2vDuration)
        : i2vDuration
      const effectiveProvider = existingCompleted
        ? (effectiveDuration > 8 ? 'veo-ext' : 'veo')
        : i2vApiProvider
      const effectiveCreditCost = existingCompleted
        ? (i2vCosts.base + Math.max(0, (effectiveDuration - 8) / VEO_EXTENSION_STEP) * i2vCosts.extension)
        : i2vCreditCost

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: i2vPrompt,
          videoStyle: 'image_to_video',
          durationSeconds: effectiveDuration,
          productName: productInfo.name,
          productImageBase64: i2vSelectedImage.base64,
          productImageMimeType: i2vSelectedImage.mimeType,
          provider: effectiveProvider,
          quality: i2vQuality,
          canvasId: canvasId || null,
          adIndex,
          targetDurationSeconds: effectiveProvider === 'veo-ext' ? effectiveDuration : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          setAiUsage(prev => prev ? { ...prev, remaining: data.remaining || 0 } : prev)
        }
        throw new Error(data.error || 'Failed to generate video')
      }

      // Optimistically deduct credits
      setAiUsage(prev => prev ? { ...prev, used: prev.used + effectiveCreditCost, remaining: Math.max(0, prev.remaining - effectiveCreditCost) } : prev)
      setI2vGenerateCount(prev => prev + 1)

      // Navigate to version 0 (newest) so the new generating job is visible
      setI2vCurrentVideoVersion(prev => ({ ...prev, [adIndex]: 0 }))

      // Refresh jobs to pick up the new one — pass canvasId directly
      // since setState is async and refreshI2vJobs closure may have stale i2vCanvasId
      refreshI2vJobs(canvasId || undefined)
    } catch (err) {
      setI2vError(err instanceof Error ? err.message : 'Failed to generate video')
    } finally {
      setI2vGenerating(false)
    }
  }, [i2vSelectedImage, i2vPrompt, i2vDuration, i2vApiProvider, i2vCreditCost, i2vCanvasId, i2vGenerateCount, user?.id, currentAccountId, productInfo, productUrl, refreshI2vJobs])

  // Extend completed Veo job by +7s (same as Video Studio)
  const handleI2vExtend = useCallback(async (adIndex: number) => {
    if (!user?.id) return
    const job = getI2vActiveJob(adIndex)
    if (!job || job.status !== 'complete') return

    setI2vExtending(true)
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setI2vError(data.error || 'Extension failed')
        return
      }

      // Deduct 25 credits
      setAiUsage(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - VEO_EXTENSION_COST) } : prev)

      // Optimistic update — update the specific job in the array
      const versionIdx = i2vCurrentVideoVersion[adIndex] ?? 0
      setI2vJobs(prev => {
        const arr = [...(prev[adIndex] || [])]
        if (arr[versionIdx]) {
          arr[versionIdx] = {
            ...arr[versionIdx],
            status: 'extending' as const,
            extension_total: data.extension_total,
            extension_step: data.extension_step,
            target_duration_seconds: data.target_duration_seconds,
          }
        }
        return { ...prev, [adIndex]: arr }
      })
    } catch {
      setI2vError('Failed to extend video')
    } finally {
      setI2vExtending(false)
    }
  }, [user?.id, i2vJobs, i2vCurrentVideoVersion])

  // ── UGC Generate Flow (split: Write Script → Director Review → Action!) ───

  // Stage 1: GPT 5.2 writes the script — stops for director review
  const handleUgcWriteScript = useCallback(async () => {
    if (!i2vSelectedImage || !user?.id || !currentAccountId || !productInfo) return

    setUgcGenerating(true)
    setUgcError(null)
    setUgcPrompt(null)

    try {
      const promptRes = await fetch('/api/creative-studio/generate-ugc-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: {
            name: productInfo.name,
            description: productInfo.description,
            features: productInfo.features,
            benefits: productInfo.benefits,
            painPoints: productInfo.painPoints,
            keyMessages: productInfo.keyMessages,
            uniqueSellingPoint: productInfo.uniqueSellingPoint,
            targetAudience: productInfo.targetAudience,
            category: productInfo.category,
          },
          ugcSettings,
        }),
      })
      const promptData = await promptRes.json()
      if (!promptRes.ok) {
        setUgcError(promptData.error || 'Failed to generate UGC script')
        return
      }

      setUgcPrompt(promptData)
      // Script is now visible for director review — user clicks "Action!" to proceed
    } catch (err) {
      setUgcError(err instanceof Error ? err.message : 'Failed to write script')
    } finally {
      setUgcGenerating(false)
    }
  }, [i2vSelectedImage, user?.id, currentAccountId, productInfo, ugcSettings])

  // Stage 2: Director approved — send to Veo (uses current ugcPrompt state which may have been edited)
  const handleUgcApproveGenerate = useCallback(async () => {
    if (!i2vSelectedImage || !user?.id || !currentAccountId || !productInfo || !ugcPrompt) return

    setUgcGenerating(true)
    setUgcError(null)

    try {
      // Duration comes from the script, not the user
      const scriptDuration = ugcPrompt.estimatedDuration || 8
      const isExtended = scriptDuration > 8
      const apiProvider = isExtended ? 'veo-ext' : 'veo'
      const numExtensions = isExtended ? Math.round((scriptDuration - 8) / 7) : 0
      const ugcCreditCost = VEO_BASE_COST + numExtensions * VEO_EXTENSION_COST

      // Build Veo-formatted prompts from the (possibly edited) ugcPrompt
      const fullPrompt = buildUGCVeoPrompt(ugcPrompt, isExtended ? 8 : scriptDuration)
      const extensionPrompts = ugcPrompt.extensionPrompts?.map((ep: string) =>
        buildUGCVeoPrompt({ prompt: ep, dialogue: '', sceneSummary: '' }, 7)
      ) || undefined

      // Create canvas if first generation
      let canvasId = i2vCanvasId
      if (!canvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: productUrl || null,
            productKnowledge: {
              name: productInfo.name,
              description: productInfo.description,
              features: productInfo.features,
              benefits: productInfo.benefits,
              painPoints: productInfo.painPoints,
              keyMessages: productInfo.keyMessages,
              uniqueSellingPoint: productInfo.uniqueSellingPoint,
            },
            concepts: [{
              title: 'UGC Testimonial',
              angle: 'Creator Testimonial',
              logline: `${ugcSettings.gender === 'male' ? 'A man' : 'A woman'} shares their experience with ${productInfo.name}`,
              visualMetaphor: 'Authentic creator testimonial — the person IS the hook',
              whyItWorks: 'UGC outperforms polished ads. Real people build trust.',
              videoPrompt: fullPrompt,
              overlay: ugcPrompt.overlay || { hook: productInfo.name, captions: [], cta: 'Shop Now' },
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          canvasId = canvasData.canvas.id
          setI2vCanvasId(canvasId)
        }
      }

      const adIndex = 0

      // Build overlay config from GPT 5.2 overlay data (hook + CTA only — captions come from Whisper in the RVE)
      const baseDuration = isExtended ? 8 : scriptDuration
      const overlayConfig = ugcPrompt.overlay ? {
        style: 'clean' as const,
        hook: {
          line1: ugcPrompt.overlay.hook,
          startSec: 0,
          endSec: 2,
          animation: 'fade' as const,
          fontSize: 48,
          fontWeight: 700,
          position: 'top' as const,
        },
        cta: {
          buttonText: ugcPrompt.overlay.cta,
          startSec: Math.max(baseDuration - 2, baseDuration * 0.8),
          animation: 'slide' as const,
          fontSize: 28,
        },
      } : undefined

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          prompt: fullPrompt,
          videoStyle: 'ugc',
          durationSeconds: scriptDuration,
          productName: productInfo.name,
          productImageBase64: i2vSelectedImage.base64,
          productImageMimeType: i2vSelectedImage.mimeType,
          provider: apiProvider,
          canvasId: canvasId || null,
          adIndex,
          targetDurationSeconds: isExtended ? scriptDuration : undefined,
          extensionPrompts: isExtended ? extensionPrompts : undefined,
          adCopy: ugcPrompt.adCopy || null,
          dialogue: ugcPrompt.dialogue || null,
          overlayConfig,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429) {
          setAiUsage(prev => prev ? { ...prev, remaining: data.remaining || 0 } : prev)
        }
        throw new Error(data.error || 'Failed to generate video')
      }

      setAiUsage(prev => prev ? { ...prev, used: prev.used + ugcCreditCost, remaining: Math.max(0, prev.remaining - ugcCreditCost) } : prev)
      setI2vGenerateCount(prev => prev + 1)
      setI2vCurrentVideoVersion(prev => ({ ...prev, [adIndex]: 0 }))
      refreshI2vJobs(canvasId || undefined)
    } catch (err) {
      setUgcError(err instanceof Error ? err.message : 'Failed to generate UGC video')
    } finally {
      setUgcGenerating(false)
    }
  }, [i2vSelectedImage, user?.id, currentAccountId, productInfo, ugcPrompt, ugcSettings, i2vCanvasId, productUrl, refreshI2vJobs])

  // Not Pro - show upgrade prompt
  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <Wand2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Ad Studio</h1>
        <p className="text-zinc-400 mb-8 max-w-md">
          Spy on competitor ads and generate winning ad copy inspired by what's working.
          Upgrade to Pro to unlock this feature.
        </p>
        <Link
          href="/pricing"
          className="px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
        >
          Upgrade to Pro
        </Link>
      </div>
    )
  }

  // Mode selection landing page
  if (!mode) {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h1 className="text-2xl lg:text-3xl font-bold text-white">Ad Studio</h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 rounded">
                  NEW
                </span>
              </div>
              <p className="text-zinc-500">
                Create high-converting ads with AI assistance
              </p>
            </div>

            {/* Image Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ImagePlus className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold text-white">Image</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Create Mode */}
                <button
                  onClick={() => setMode('create')}
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-accent/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent/30 transition-colors">
                    <PlusCircle className="w-7 h-7 text-accent" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Create</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Generate original ads from your product page.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-accent text-sm font-medium">
                    Get started <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                {/* Clone Mode */}
                <button
                  onClick={() => setMode('clone')}
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-purple-500/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition-colors">
                    <Layers className="w-7 h-7 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Clone</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Match the style of a winning ad.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-purple-400 text-sm font-medium">
                    Browse ads <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                {/* Browse Inspiration Mode */}
                <button
                  onClick={() => setMode('inspiration')}
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-amber-500/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4 group-hover:bg-amber-500/30 transition-colors">
                    <Lightbulb className="w-7 h-7 text-amber-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Inspiration</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Explore curated examples of winning ads.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm font-medium">
                    View gallery <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                {/* Upload Mode */}
                <button
                  onClick={() => setMode('upload')}
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-cyan-500/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4 group-hover:bg-cyan-500/30 transition-colors">
                    <Upload className="w-7 h-7 text-cyan-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Upload</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Upload your own photo and describe your ad.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-cyan-400 text-sm font-medium">
                    Upload image <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              </div>
            </div>

            {/* Video Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-zinc-400" />
                <h2 className="text-lg font-semibold text-white">Video</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Video Studio */}
                <Link
                  href="/dashboard/creative-studio/video-studio"
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-rose-500/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-rose-500/20 flex items-center justify-center mb-4 group-hover:bg-rose-500/30 transition-colors">
                    <Video className="w-7 h-7 text-rose-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Create</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Unique creative concept videos from product details.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-rose-400 text-sm font-medium">
                    Get started <ChevronRight className="w-4 h-4" />
                  </div>
                </Link>

                {/* Image to Video */}
                <button
                  onClick={() => setMode('image-to-video')}
                  className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-indigo-500/50 hover:bg-bg-card/80 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-4 group-hover:bg-indigo-500/30 transition-colors">
                    <Play className="w-7 h-7 text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Image to Video</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Product and UGC videos from images.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-indigo-400 text-sm font-medium">
                    Get started <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Inspiration mode - show gallery
  if (mode === 'inspiration') {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6">
          <InspirationGallery
            onSelectExample={handleSelectInspiration}
            onBack={() => setMode(null)}
          />
        </div>
      </div>
    )
  }

  // Upload mode - upload image and describe
  if (mode === 'upload' && currentStep !== 3) {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetToModeSelection}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl lg:text-3xl font-bold text-white">
                  Upload Your Product
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-cyan-500/20 text-cyan-400 rounded">
                  CUSTOM
                </span>
              </div>
              <p className="text-zinc-500 mt-1 ml-7">
                Upload a photo and describe what you want to create
              </p>
            </div>

            {/* Upload Area */}
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-6">
              {/* Drop Zone */}
              {!uploadedImage ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'relative border-2 border-dashed rounded-xl p-12 transition-colors text-center',
                    isDragging
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  )}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <Upload className="w-8 h-8 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">
                        Drag and drop your image here
                      </p>
                      <p className="text-zinc-500 text-sm">
                        or click to browse · PNG, JPG, WEBP up to 10MB
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Image Preview */
                <div className="relative">
                  <img
                    src={uploadedImage.preview}
                    alt="Uploaded product"
                    className="w-full max-h-80 object-contain rounded-xl bg-bg-dark"
                  />
                  <button
                    onClick={() => {
                      if (uploadedImage.preview) {
                        URL.revokeObjectURL(uploadedImage.preview)
                      }
                      setUploadedImage(null)
                    }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Creative Direction Prompt */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Describe your ad vision <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={uploadPrompt}
                  onChange={(e) => setUploadPrompt(e.target.value)}
                  placeholder="e.g., 'Lifestyle photo of someone using this product outdoors with warm sunset lighting' or 'Bold ad with eye-catching headline overlay'"
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 resize-none"
                  rows={4}
                />
                <p className="text-xs text-zinc-500 mt-2">
                  This will guide both the ad copy and image generation
                </p>
              </div>

              {/* Error */}
              {productError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {productError}
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleUploadGenerate}
                disabled={!uploadedImage || !uploadPrompt.trim() || isGenerating}
                className={cn(
                  'w-full py-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                  'bg-cyan-500 hover:bg-cyan-600 text-white',
                  (!uploadedImage || !uploadPrompt.trim() || isGenerating) && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating Ads...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Ads
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 lg:px-8 py-6 space-y-6">
        <div className={cn(
          'mx-auto space-y-6',
          mode === 'clone' && currentStep === 2 && selectedCompany ? 'max-w-[1400px]' : 'max-w-[1000px]'
        )}>
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetToModeSelection}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">
                {mode === 'create' ? 'Create Ad' : mode === 'upload' ? 'Upload Ad' : mode === 'image-to-video' ? 'Image to Video' : isRefreshMode ? 'Refresh Ad' : 'Clone Ad'}
              </h1>
              <span className={cn(
                'px-2 py-0.5 text-xs font-semibold rounded',
                mode === 'create' ? 'bg-accent/20 text-accent' : mode === 'upload' ? 'bg-cyan-500/20 text-cyan-400' : mode === 'image-to-video' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-purple-500/20 text-purple-400'
              )}>
                {mode === 'create' ? 'ORIGINAL' : mode === 'upload' ? 'CUSTOM' : mode === 'image-to-video' ? 'ANIMATE' : isRefreshMode ? 'CREATIVE REFRESH' : 'STYLE MATCH'}
              </span>
            </div>
            <p className="text-zinc-500 mt-1 ml-7">
              {mode === 'create'
                ? 'Generate original ads from your product page'
                : mode === 'upload'
                ? 'Generate ads from your uploaded image'
                : mode === 'image-to-video'
                ? 'Animate an image into a short video ad'
                : isRefreshMode
                ? 'Create fresh variations of your winning ad'
                : 'Generate ads that match a winning style'}
            </p>
          </div>

          {/* Progress Steps - different for Create vs Clone vs Upload */}
          {mode !== 'upload' && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => resetToStep(1)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
                  currentStep >= 1 ? 'text-white' : 'text-zinc-500',
                  productInfo && 'bg-emerald-500/20 text-emerald-400'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                  productInfo ? 'bg-emerald-500 text-white' : currentStep === 1 ? 'bg-accent text-white' : 'bg-zinc-700'
                )}>
                  {productInfo ? '✓' : '1'}
                </span>
                Your Product
              </button>
              <ChevronRight className="w-4 h-4 text-zinc-600" />

              {/* Clone mode has competitor step */}
              {mode === 'clone' && (
                <>
                  <button
                    onClick={() => productInfo && resetToStep(2)}
                    disabled={!productInfo}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
                      currentStep >= 2 ? 'text-white' : 'text-zinc-500',
                      selectedAd && 'bg-emerald-500/20 text-emerald-400',
                      !productInfo && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                      selectedAd ? 'bg-emerald-500 text-white' : currentStep === 2 ? 'bg-accent text-white' : 'bg-zinc-700'
                    )}>
                      {selectedAd ? '✓' : '2'}
                    </span>
                    Reference Ad
                  </button>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </>
              )}

              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                currentStep === 3 || ((mode === 'create' || mode === 'image-to-video') && currentStep === 2) ? 'text-white' : 'text-zinc-500'
              )}>
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                  (mode === 'image-to-video' ? Object.keys(i2vJobs).length > 0 : generatedAds.length > 0)
                    ? 'bg-emerald-500 text-white'
                    : (currentStep === 3 || ((mode === 'create' || mode === 'image-to-video') && currentStep === 2))
                      ? (mode === 'image-to-video' ? 'bg-indigo-500 text-white' : 'bg-accent text-white')
                      : 'bg-zinc-700'
                )}>
                  {(mode === 'image-to-video' ? Object.keys(i2vJobs).length > 0 : generatedAds.length > 0) ? '✓' : mode === 'clone' ? '3' : '2'}
                </span>
                {mode === 'image-to-video' ? 'Image + Generate' : 'Generate'}
              </div>
            </div>
          )}

          {/* Upload mode progress */}
          {mode === 'upload' && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={resetToModeSelection}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
                  'bg-emerald-500/20 text-emerald-400'
                )}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-emerald-500 text-white">
                  ✓
                </span>
                Upload
              </button>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-white'
              )}>
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                  generatedAds.length > 0 ? 'bg-emerald-500 text-white' : 'bg-cyan-500 text-white'
                )}>
                  {generatedAds.length > 0 ? '✓' : '2'}
                </span>
                Generate
              </div>
            </div>
          )}

          {/* Step 1: Product URL or Manual Entry + Pill Selectors */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Section A: Product Input */}
              <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
                {!useManualEntry ? (
                  <>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Globe className="w-5 h-5 text-accent" />
                      Enter Your Product URL
                    </h2>
                    <p className="text-sm text-zinc-400">
                      Paste a link to your product page. We&apos;ll extract the product details automatically.
                    </p>

                    <div className="flex gap-3">
                      <input
                        type="url"
                        value={productUrl}
                        onChange={(e) => setProductUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeProduct()}
                        placeholder="https://yourstore.com/products/awesome-product"
                        className="flex-1 bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={handleAnalyzeProduct}
                        disabled={isAnalyzingProduct || !productUrl.trim()}
                        className={cn(
                          'px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2',
                          'bg-accent hover:bg-accent-hover text-white',
                          (isAnalyzingProduct || !productUrl.trim()) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {isAnalyzingProduct ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Analyze
                      </button>
                    </div>

                    {hasAnalyzed && totalPillsFound > 0 && (
                      <div className="flex items-center gap-2 text-emerald-400 text-sm">
                        <Check className="w-4 h-4" />
                        Found {totalPillsFound} items — select the ones you want in your creative brief
                      </div>
                    )}

                    {!hasAnalyzed && (
                      <>
                        {/* Divider */}
                        <div className="flex items-center gap-4 py-2">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-sm text-zinc-500">or</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {/* Manual entry option */}
                        <button
                          onClick={() => setUseManualEntry(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-border rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          Upload image & enter details manually
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-accent" />
                        Enter Product Details
                      </h2>
                      <button
                        onClick={() => {
                          setUseManualEntry(false)
                          setManualProductName('')
                          setManualProductDescription('')
                          setManualProductImage(null)
                          setHasAnalyzed(false)
                          setPools({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
                          setSelected({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
                        }}
                        className="text-sm text-zinc-500 hover:text-white transition-colors"
                      >
                        Use URL instead
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Product image upload — hidden for i2v since Step 2 handles images */}
                      {mode !== 'image-to-video' && (
                        <div>
                          <label className="block text-sm text-zinc-400 mb-2">Product Image</label>
                          {manualProductImage ? (
                            <div className="flex items-start gap-4">
                              <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                                <img
                                  src={manualProductImage.preview}
                                  alt="Product"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <button
                                onClick={() => setManualProductImage(null)}
                                className="text-sm text-zinc-500 hover:text-white transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-zinc-600 transition-colors">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleManualImageUpload}
                                className="hidden"
                              />
                              {isUploadingManualImage ? (
                                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-zinc-500 mb-2" />
                                  <span className="text-sm text-zinc-500">Click to upload product image</span>
                                </>
                              )}
                            </label>
                          )}
                        </div>
                      )}

                      {/* Product name */}
                      <div>
                        <label className="block text-sm text-zinc-400 mb-2">
                          Product Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualProductName}
                          onChange={(e) => setManualProductName(e.target.value)}
                          placeholder="e.g., Premium Wireless Headphones"
                          className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                        />
                      </div>

                      {/* Product description */}
                      <div>
                        <label className="block text-sm text-zinc-400 mb-2">
                          Description <span className="text-zinc-600">(optional)</span>
                        </label>
                        <textarea
                          value={manualProductDescription}
                          onChange={(e) => setManualProductDescription(e.target.value)}
                          placeholder="Brief description of your product, key features, benefits..."
                          rows={3}
                          className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent resize-none"
                        />
                      </div>

                      {/* Populate pills button */}
                      {!hasAnalyzed && (
                        <button
                          onClick={handleUseManualProduct}
                          disabled={!manualProductName.trim()}
                          className={cn(
                            'w-full px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                            'bg-accent hover:bg-accent-hover text-white',
                            !manualProductName.trim() && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          <ChevronRight className="w-4 h-4" />
                          Continue
                        </button>
                      )}
                    </div>
                  </>
                )}

                {productError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {productError}
                  </div>
                )}
              </div>

              {/* Section B: Creative Brief (Pill Selectors) */}
              {hasAnalyzed && (
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

                  {/* Continue button */}
                  <button
                    onClick={handleProceedFromPills}
                    disabled={!canProceedFromPills}
                    className={cn(
                      'w-full mt-6 px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                      canProceedFromPills
                        ? 'bg-accent hover:bg-accent-hover text-white'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    )}
                  >
                    <ChevronRight className="w-4 h-4" />
                    Continue{totalSelected > 0 ? ` with ${totalSelected} selected` : ''}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Product Info Card (shows after step 1) */}
          {productInfo && mode !== 'upload' && (
            <div className="bg-bg-card border border-emerald-500/30 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{productInfo.name}</h3>
                    {productInfo.brand && productInfo.brand !== productInfo.name && (
                      <div className="text-sm text-zinc-400">by {productInfo.brand}</div>
                    )}
                    {productInfo.description && (
                      <p className="text-sm text-zinc-400 mt-1">{productInfo.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {productInfo.price && (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                          {productInfo.currency || '$'}{productInfo.price}
                        </span>
                      )}
                      {productInfo.category && (
                        <span className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded">
                          {productInfo.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => resetToStep(1)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Change
                </button>
              </div>

              {/* Warning when no product image was extracted */}
              {!productInfo.imageBase64 && (
                <div className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-amber-300">No product image found on this page. Image generation will use text-only mode which may produce lower quality results.</p>
                    <label className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-sm cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Upload product image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAddProductImage}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Success indicator when product image was added manually */}
              {productInfo.imageBase64 && !productInfo.imageUrl && (
                <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                  <Check className="w-4 h-4" />
                  Product image added
                </div>
              )}

              {/* Product image picker — shown when multiple images extracted */}
              {productImageOptions.length > 1 && (
                <div className="mt-4">
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">Product image — click to change</label>
                  <div className="flex flex-wrap gap-2">
                    {productImageOptions.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectProductImage(i)}
                        className={cn(
                          'relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all',
                          selectedProductImageIdx === i
                            ? 'border-purple-500 ring-2 ring-purple-500/30'
                            : 'border-border hover:border-zinc-500'
                        )}
                      >
                        <img
                          src={`data:${img.mimeType};base64,${img.base64}`}
                          alt={img.description || `Image ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {selectedProductImageIdx === i && (
                          <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Mode Info Card */}
          {mode === 'upload' && uploadedImage && (
            <div className="bg-bg-card border border-cyan-500/30 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <img
                    src={uploadedImage.preview}
                    alt="Uploaded product"
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                  <div>
                    <h3 className="font-semibold text-white">Your Upload</h3>
                    {uploadPrompt && (
                      <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{uploadPrompt}</p>
                    )}
                    <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded">
                      Custom Image
                    </span>
                  </div>
                </div>
                <button
                  onClick={resetToModeSelection}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Ad Source Selection (Clone mode only) */}
          {currentStep === 2 && mode === 'clone' && (
            <div className="space-y-6">
              {/* Tab Bar: Competitor | Your Ads */}
              <div className="flex gap-1 bg-bg-card border border-border rounded-xl p-1">
                <button
                  onClick={() => handleCloneSourceChange('competitor')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    cloneSource === 'competitor'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Search className="w-4 h-4" />
                  Competitor
                </button>
                <button
                  onClick={() => handleCloneSourceChange('your-ads')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    cloneSource === 'your-ads'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <RefreshCw className="w-4 h-4" />
                  Your Ads
                </button>
              </div>

              {/* Competitor Tab Content */}
              {cloneSource === 'competitor' && (
                <>
                  {/* Search Input */}
                  <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Search className="w-5 h-5 text-accent" />
                      Search Competitor Ads
                    </h2>
                    <p className="text-sm text-zinc-400">
                      Search for a competitor brand to browse their active Facebook and Instagram ads.
                    </p>
                    <CompetitorSearchInput
                      selectedCompany={selectedCompany}
                      onSelect={handleCompanySelect}
                      onClear={handleClearCompany}
                    />
                  </div>

                  {/* Stats & Ads Grid (show when company is selected) */}
                  {selectedCompany && (
                    <>
                      {/* Stats Header */}
                      {competitorStats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Ad Count & Date */}
                          <div className="bg-bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                              <BarChart3 className="w-4 h-4" />
                              Ad Library Overview
                            </div>
                            <div className="text-2xl font-bold text-white mb-1">
                              {competitorStats.totalAds} ads
                            </div>
                            <div className="text-sm text-zinc-400">
                              <span className="text-emerald-400">{competitorStats.activeAds} active</span>
                              {competitorStats.earliestAdDate && (
                                <span className="ml-2">
                                  · Since {new Date(competitorStats.earliestAdDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Media Mix */}
                          <div className="bg-bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                              Media Mix
                            </div>
                            <CompetitorMediaMixChart mediaMix={competitorStats.mediaMix} />
                          </div>

                          {/* Landing Pages */}
                          <div className="bg-bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                              Top Landing Pages
                            </div>
                            <CompetitorLandingPages landingPages={competitorStats.topLandingPages} />
                          </div>
                        </div>
                      )}

                      {/* Filters */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="text-sm text-zinc-400">
                          Showing {filteredAds.length} of {competitorAds.length} ads
                        </div>
                        <CompetitorFilters
                          mediaType={mediaTypeFilter}
                          daysActive={daysActiveFilter}
                          status={statusFilter}
                          onMediaTypeChange={setMediaTypeFilter}
                          onDaysActiveChange={setDaysActiveFilter}
                          onStatusChange={setStatusFilter}
                          activeFiltersCount={activeFiltersCount}
                          onClearAll={clearAllFilters}
                        />
                      </div>

                      {/* Ads Grid */}
                      <CompetitorAdsGrid
                        ads={filteredAds}
                        isLoading={isLoadingAds}
                        hasMore={!!nextCursor}
                        onLoadMore={handleLoadMore}
                        onSelect={(ad) => setViewingAd(ad)}
                      />
                    </>
                  )}
                </>
              )}

              {/* Your Ads Tab Content */}
              {cloneSource === 'your-ads' && (
                <>
                  <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-purple-400" />
                      Refresh Your Ads
                    </h2>
                    <p className="text-sm text-zinc-400">
                      Select one of your ads to create a fresh variation. Keep what works, change the execution.
                    </p>
                  </div>

                  {/* Stats Header — matches competitor tab layout */}
                  {ownAds.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Ad Count */}
                      <div className="bg-bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                          <BarChart3 className="w-4 h-4" />
                          Your Ad Library
                        </div>
                        <div className="text-2xl font-bold text-white mb-1">
                          {ownAds.length} ads
                        </div>
                        <div className="text-sm text-zinc-400">
                          <span className="text-emerald-400">{ownAdsActiveCount} active</span>
                          <span className="ml-2">· {ownAds.length - ownAdsActiveCount} paused</span>
                        </div>
                      </div>

                      {/* Media Mix */}
                      <div className="bg-bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                          Media Mix
                        </div>
                        <CompetitorMediaMixChart mediaMix={ownAdsMediaMix} />
                      </div>

                      {/* Top Performers */}
                      <div className="bg-bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                          <Sparkles className="w-4 h-4" />
                          Performance
                        </div>
                        <div className="space-y-2 mt-2">
                          {(() => {
                            const topPerformers = ownAds.filter(a =>
                              (a.hookScore !== null && a.hookScore >= 75) ||
                              (a.clickScore !== null && a.clickScore >= 75) ||
                              (a.convertScore !== null && a.convertScore >= 75)
                            ).length
                            const totalSpend = ownAds.reduce((s, a) => s + a.spend, 0)
                            const totalRevenue = ownAds.reduce((s, a) => s + a.revenue, 0)
                            return (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">Top performers</span>
                                  <span className="text-sm font-semibold text-emerald-400">{topPerformers}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">Total spend</span>
                                  <span className="text-sm font-semibold text-white">${totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(1)}k` : totalSpend.toFixed(0)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-zinc-400">Total revenue</span>
                                  <span className="text-sm font-semibold text-white">${totalRevenue >= 1000 ? `${(totalRevenue / 1000).toFixed(1)}k` : totalRevenue.toFixed(0)}</span>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filters — matches competitor tab layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="text-sm text-zinc-400">
                      Showing {filteredOwnAds.length} of {ownAds.length} ads
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Media Type */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Media:</span>
                        <select
                          value={ownAdMediaFilter}
                          onChange={(e) => setOwnAdMediaFilter(e.target.value as typeof ownAdMediaFilter)}
                          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        >
                          <option value="all">All Types</option>
                          <option value="video">Video</option>
                          <option value="image">Image</option>
                        </select>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Status:</span>
                        <select
                          value={ownAdStatusFilter}
                          onChange={(e) => setOwnAdStatusFilter(e.target.value as typeof ownAdStatusFilter)}
                          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        >
                          <option value="all">All</option>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                        </select>
                      </div>

                      {/* Performance */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Performance:</span>
                        <select
                          value={ownAdFilter}
                          onChange={(e) => setOwnAdFilter(e.target.value as typeof ownAdFilter)}
                          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        >
                          <option value="all">All</option>
                          <option value="top-performers">Top Performers</option>
                        </select>
                      </div>

                      {/* Sort */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Sort:</span>
                        <select
                          value={ownAdSortBy}
                          onChange={(e) => setOwnAdSortBy(e.target.value as typeof ownAdSortBy)}
                          className="bg-bg-dark border border-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
                        >
                          <option value="spend">Highest Spend</option>
                          <option value="roas">Best ROAS</option>
                          <option value="scores">Best Scores</option>
                        </select>
                      </div>

                      {/* Clear */}
                      {(ownAdMediaFilter !== 'all' || ownAdStatusFilter !== 'all' || ownAdFilter !== 'all') && (
                        <button
                          onClick={() => { setOwnAdMediaFilter('all'); setOwnAdStatusFilter('all'); setOwnAdFilter('all') }}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Own Ads Grid */}
                  {isLoadingOwnAds ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    </div>
                  ) : filteredOwnAds.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredOwnAds.map((ad, index) => (
                        <OwnAdCard
                          key={ad.ad_id}
                          ad={ad}
                          index={index}
                          onClick={() => setViewingOwnAd(ad)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-bg-card border border-border rounded-xl p-12 text-center">
                      <Search className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                      <h3 className="text-white font-medium mb-2">No ads found</h3>
                      <p className="text-sm text-zinc-500">
                        {(ownAdMediaFilter !== 'all' || ownAdStatusFilter !== 'all' || ownAdFilter !== 'all')
                          ? 'Try removing filters to see all ads.'
                          : 'Connect an ad account and sync data to see your ads here.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Image-to-Video — Select image, prompt, generate */}
          {currentStep === 2 && mode === 'image-to-video' && (
            <div className="space-y-6">
              {/* Image Selection */}
              <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <ImagePlus className="w-5 h-5 text-indigo-400" />
                  Select Image
                </h2>
                <p className="text-sm text-zinc-400">
                  Choose a product image to animate into a video ad.
                </p>

                {/* Selected image preview */}
                {i2vSelectedImage && (
                  <div className="flex items-start gap-4 p-4 bg-bg-dark rounded-xl border border-indigo-500/30">
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border-2 border-indigo-500/40">
                      <img
                        src={i2vSelectedImage.preview}
                        alt={i2vSelectedImage.name}
                        className="w-full h-full object-cover"
                      />
                      {i2vRemovingBg && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="font-medium text-white truncate">{i2vSelectedImage.name}</div>
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <Check className="w-3 h-3" />
                        {i2vBgRemoved ? 'Background removed' : 'Image selected'}
                      </div>
                      <div className="flex items-center gap-3">
                        {!i2vBgRemoved && (
                          <button
                            onClick={async () => {
                              if (!i2vSelectedImage) return
                              setI2vRemovingBg(true)
                              setI2vError(null)
                              try {
                                const res = await fetch('/api/creative-studio/remove-background', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    imageBase64: i2vSelectedImage.base64,
                                    imageMimeType: i2vSelectedImage.mimeType,
                                  }),
                                })
                                const data = await res.json()
                                if (!res.ok) throw new Error(data.error || 'Background removal failed')
                                setI2vSelectedImage({
                                  base64: data.base64,
                                  mimeType: data.mimeType || 'image/png',
                                  preview: `data:${data.mimeType || 'image/png'};base64,${data.base64}`,
                                  name: i2vSelectedImage.name,
                                })
                                setI2vBgRemoved(true)
                              } catch (err) {
                                setI2vError(err instanceof Error ? err.message : 'Background removal failed')
                              } finally {
                                setI2vRemovingBg(false)
                              }
                            }}
                            disabled={i2vRemovingBg}
                            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                          >
                            {i2vRemovingBg ? 'Removing...' : 'Remove Background'}
                          </button>
                        )}
                        <button
                          onClick={() => { setI2vSelectedImage(null); setI2vBgRemoved(false) }}
                          className="text-sm text-zinc-500 hover:text-white transition-colors"
                        >
                          {i2vBgRemoved ? 'Use Original' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Image source options — only show when no image selected */}
                {!i2vSelectedImage && (
                  <div className="space-y-4">
                    {/* URL Photos — from product analysis */}
                    {productImageOptions.length > 0 ? (
                      <div>
                        <label className="text-sm font-medium text-zinc-300 mb-2 block">From product URL</label>
                        <div className="flex flex-wrap gap-3">
                          {productImageOptions.map((img, i) => (
                            <button
                              key={i}
                              onClick={() => setI2vSelectedImage({
                                base64: img.base64,
                                mimeType: img.mimeType,
                                preview: `data:${img.mimeType};base64,${img.base64}`,
                                name: img.description || `Product image ${i + 1}`,
                              })}
                              className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-zinc-700 hover:border-indigo-500/60 transition-all group"
                            >
                              <img
                                src={`data:${img.mimeType};base64,${img.base64}`}
                                alt={img.description || `Image ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/20 transition-colors flex items-center justify-center">
                                <Check className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Also show raw analysis image if no productImageOptions but rawAnalysis has image */}
                    {productImageOptions.length === 0 && rawAnalysisRef.current?.imageBase64 ? (
                      <div>
                        <label className="text-sm font-medium text-zinc-300 mb-2 block">From product URL</label>
                        <button
                          onClick={() => setI2vSelectedImage({
                            base64: rawAnalysisRef.current!.imageBase64 as string,
                            mimeType: (rawAnalysisRef.current!.imageMimeType as string) || 'image/jpeg',
                            preview: `data:${rawAnalysisRef.current!.imageMimeType || 'image/jpeg'};base64,${rawAnalysisRef.current!.imageBase64}`,
                            name: 'Product image',
                          })}
                          className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-zinc-700 hover:border-indigo-500/60 transition-all group"
                        >
                          <img
                            src={`data:${rawAnalysisRef.current.imageMimeType || 'image/jpeg'};base64,${rawAnalysisRef.current.imageBase64}`}
                            alt="Product"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/20 transition-colors flex items-center justify-center">
                            <Check className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      </div>
                    ) : null}

                    {/* Divider if URL photos exist */}
                    {(productImageOptions.length > 0 || rawAnalysisRef.current?.imageBase64) ? (
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-zinc-500">or choose from</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    ) : null}

                    {/* Media Library + Upload buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Media Library */}
                      <button
                        onClick={() => setI2vShowLibrary(true)}
                        disabled={i2vDownloadingLibrary}
                        className={cn(
                          'flex flex-col items-center justify-center py-8 border-2 border-dashed border-zinc-700 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors',
                          i2vDownloadingLibrary && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {i2vDownloadingLibrary ? (
                          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                        ) : (
                          <Layers className="w-8 h-8 text-indigo-400 mb-2" />
                        )}
                        <p className="text-white font-medium text-sm">
                          {i2vDownloadingLibrary ? 'Loading...' : 'Media Library'}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">Browse your ad account images</p>
                      </button>

                      {/* Upload */}
                      <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-zinc-700 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 10 * 1024 * 1024) {
                              setI2vError('Image must be less than 10MB')
                              return
                            }
                            const reader = new FileReader()
                            reader.onload = () => {
                              const base64 = (reader.result as string).split(',')[1]
                              setI2vSelectedImage({
                                base64,
                                mimeType: file.type,
                                preview: URL.createObjectURL(file),
                                name: file.name,
                              })
                              setI2vError(null)
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                        <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                        <p className="text-white font-medium text-sm">Upload Image</p>
                        <p className="text-zinc-500 text-xs mt-1">PNG, JPG, WEBP up to 10MB</p>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Cards — Product Video vs UGC Video */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setI2vSubMode('product')}
                  className={cn(
                    'group p-5 rounded-xl border-2 text-left transition-all',
                    i2vSubMode === 'product'
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-zinc-700/50 bg-bg-card hover:border-indigo-500/40 hover:bg-bg-card/80'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors',
                    i2vSubMode === 'product' ? 'bg-indigo-500/30' : 'bg-indigo-500/10 group-hover:bg-indigo-500/20'
                  )}>
                    <Play className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">Product Video</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">Animate your image — describe the motion and Veo brings it to life.</p>
                </button>
                <button
                  onClick={() => setI2vSubMode('ugc')}
                  className={cn(
                    'group p-5 rounded-xl border-2 text-left transition-all',
                    i2vSubMode === 'ugc'
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-zinc-700/50 bg-bg-card hover:border-cyan-500/40 hover:bg-bg-card/80'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors',
                    i2vSubMode === 'ugc' ? 'bg-cyan-500/30' : 'bg-cyan-500/10 group-hover:bg-cyan-500/20'
                  )}>
                    <User className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">UGC Video</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">A real person talks about your product on camera.</p>
                </button>
              </div>

              {/* Product Video — Motion Prompt + Duration + Generate */}
              {i2vSubMode === 'product' && (
              <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-indigo-400" />
                  Describe the Motion
                </h2>

                <textarea
                  value={i2vPrompt}
                  onChange={(e) => setI2vPrompt(e.target.value)}
                  placeholder="e.g., 'Slowly zoom in while the product rotates, particles float upward, cinematic lighting shifts from cool to warm'"
                  className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
                  rows={3}
                />
                <p className="text-xs text-zinc-500">
                  Describe camera movement, effects, and atmosphere. Veo will animate your still image.
                </p>

                {/* Duration Stepper */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Duration</label>
                  <div className="flex items-center gap-0 rounded-lg border border-zinc-700/50 bg-zinc-800/50 overflow-hidden w-fit">
                    <button
                      onClick={() => { if (i2vDuration > 8) setI2vDuration(i2vDuration - VEO_EXTENSION_STEP) }}
                      disabled={i2vDuration <= 8}
                      className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2 text-sm font-bold text-white min-w-[3.5rem] text-center tabular-nums">
                      {i2vDuration}s
                    </span>
                    <button
                      onClick={() => setI2vDuration(i2vDuration + VEO_EXTENSION_STEP)}
                      className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quality Selector */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Quality</label>
                  <div className="flex gap-2">
                    {(['standard', 'premium'] as const).map(q => {
                      const isActive = i2vQuality === q
                      const qCosts = I2V_QUALITY_COSTS[q]
                      const extensions = Math.max(0, (i2vDuration - 8) / VEO_EXTENSION_STEP)
                      const totalCost = qCosts.base + extensions * qCosts.extension
                      return (
                        <button
                          key={q}
                          onClick={() => setI2vQuality(q)}
                          className={cn(
                            'flex-1 px-3 py-2 rounded-lg border transition-all text-left',
                            isActive
                              ? 'bg-indigo-500/10 border-indigo-500/40'
                              : 'bg-zinc-800/30 border-zinc-700/30 hover:border-zinc-600'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn('text-xs font-medium', isActive ? 'text-indigo-300' : 'text-zinc-400')}>
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

                {/* Credits remaining */}
                {aiUsage && (
                  <div className="text-xs text-zinc-500">
                    {aiUsage.remaining} credits remaining
                  </div>
                )}

                {/* Error */}
                {i2vError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {i2vError}
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleI2vGenerate}
                  disabled={!i2vSelectedImage || !i2vPrompt.trim() || i2vGenerating || (aiUsage ? aiUsage.remaining < i2vCreditCost : false)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {i2vGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting generation...
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      Generate {i2vDuration}s Video · {i2vCreditCost} credits
                    </>
                  )}
                </button>
              </div>
              )}

              {/* UGC Video — Presenter Settings + Generate */}
              {i2vSubMode === 'ugc' && (
              <div className="bg-bg-card border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" />
                  UGC Settings
                </h2>

                {/* Gender */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Gender</label>
                  <div className="flex gap-2">
                    {(['male', 'female'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setUgcSettings(prev => ({ ...prev, gender: g, features: [] }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                          ugcSettings.gender === g
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {g === 'male' ? 'Male' : 'Female'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age Range */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Age Range</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 'young-adult' as const, label: 'Young Adult (18-25)' },
                      { value: 'adult' as const, label: 'Adult (25-40)' },
                      { value: 'middle-aged' as const, label: 'Middle-aged (40-55)' },
                    ]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setUgcSettings(prev => ({ ...prev, ageRange: value }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                          ugcSettings.ageRange === value
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Tone</label>
                  <div className="flex flex-wrap gap-2">
                    {(['authentic', 'excited', 'humorous', 'serious', 'empathetic'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setUgcSettings(prev => ({ ...prev, tone: t }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize',
                          ugcSettings.tone === t
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Features — contextual on gender (multi-select) */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">
                    Features <span className="text-xs text-zinc-600 font-normal">(optional, multi-select)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(ugcSettings.gender === 'male'
                      ? ['Glasses', 'Full Beard', 'Mustache', 'Bald', 'Hat']
                      : ['Glasses', 'Hat', 'Make-up', 'No Make-up']
                    ).map((feat) => {
                      const isSelected = ugcSettings.features.includes(feat)
                      // No Make-up and Make-up are mutually exclusive
                      const isMakeupConflict = (feat === 'Make-up' && ugcSettings.features.includes('No Make-up'))
                        || (feat === 'No Make-up' && ugcSettings.features.includes('Make-up'))
                      return (
                        <button
                          key={feat}
                          onClick={() => setUgcSettings(prev => {
                            let next = isSelected
                              ? prev.features.filter(f => f !== feat)
                              : [...prev.features, feat]
                            // Enforce mutual exclusion for Make-up / No Make-up
                            if (!isSelected && feat === 'Make-up') next = next.filter(f => f !== 'No Make-up')
                            if (!isSelected && feat === 'No Make-up') next = next.filter(f => f !== 'Make-up')
                            return { ...prev, features: next }
                          })}
                          className={cn(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : isMakeupConflict
                                ? 'bg-zinc-800/50 text-zinc-500 border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
                                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                          )}
                        >
                          {feat}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Clothing Style — single-select */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Clothing</label>
                  <div className="flex flex-wrap gap-2">
                    {['Casual', 'Formal', 'Athletic', 'Streetwear'].map((style) => (
                      <button
                        key={style}
                        onClick={() => setUgcSettings(prev => ({ ...prev, clothing: style }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                          ugcSettings.clothing === style
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scene */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Scene</label>
                  <div className="flex gap-2">
                    {(['indoors', 'outdoors'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setUgcSettings(prev => ({
                          ...prev,
                          scene: s,
                          setting: s === 'indoors' ? 'Living Room' : 'Park',
                        }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border capitalize',
                          ugcSettings.scene === s
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Setting — contextual on scene */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Setting</label>
                  <div className="flex flex-wrap gap-2">
                    {(ugcSettings.scene === 'indoors'
                      ? ['Living Room', 'Kitchen', 'Bathroom', 'Office', 'Gym', 'Studio']
                      : ['Park', 'Street', 'Beach', 'Backyard', 'Cafe Patio']
                    ).map((setting) => (
                      <button
                        key={setting}
                        onClick={() => setUgcSettings(prev => ({ ...prev, setting }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                          ugcSettings.setting === setting
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600'
                        )}
                      >
                        {setting}
                      </button>
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

                {/* Credits remaining — brief note */}
                {aiUsage && (
                  <div className="text-xs text-zinc-500">
                    {aiUsage.remaining} credits remaining · Duration and cost determined by script
                  </div>
                )}

                {/* Error */}
                {ugcError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {ugcError}
                  </div>
                )}

                {/* Stage 1: Write Script button — shown when no script yet */}
                {!ugcPrompt && (
                  <button
                    onClick={handleUgcWriteScript}
                    disabled={!i2vSelectedImage || ugcGenerating}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-cyan-500 text-white font-medium hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    {ugcGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Writing script...
                      </>
                    ) : (
                      <>
                        <Pencil className="w-4 h-4" />
                        Write Script
                      </>
                    )}
                  </button>
                )}

                {/* Stage 2: Director's Review — shown after GPT 5.2 returns script */}
                {ugcPrompt && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
                      <Clapperboard className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-semibold text-amber-300">Director&apos;s Review</span>
                      <span className="ml-auto text-xs text-amber-400/60">Edit before sending to Veo</span>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Scene Summary — editable */}
                      <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">Scene</label>
                        <input
                          type="text"
                          value={ugcPrompt.sceneSummary}
                          onChange={(e) => setUgcPrompt(prev => prev ? { ...prev, sceneSummary: e.target.value } : prev)}
                          className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                        />
                      </div>

                      {/* Dialogue — editable */}
                      <div>
                        <label className="text-xs font-medium text-zinc-400 mb-1 block">Dialogue</label>
                        <textarea
                          value={ugcPrompt.dialogue}
                          onChange={(e) => setUgcPrompt(prev => prev ? { ...prev, dialogue: e.target.value } : prev)}
                          className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
                          rows={3}
                        />
                      </div>

                      {/* Full Prompt — collapsible */}
                      <details className="group">
                        <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                          Full Veo Prompt
                        </summary>
                        <textarea
                          value={ugcPrompt.prompt}
                          onChange={(e) => setUgcPrompt(prev => prev ? { ...prev, prompt: e.target.value } : prev)}
                          className="w-full mt-2 bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                          rows={8}
                        />
                      </details>

                      {/* Overlay — Hook + CTA (captions generated from audio transcription in the RVE) */}
                      {ugcPrompt.overlay && (
                        <div className="space-y-3 pt-1 border-t border-amber-500/10">
                          <p className="text-xs font-medium text-amber-300/80">Text Overlays</p>
                          <div>
                            <label className="text-xs font-medium text-zinc-400 mb-1 block">Hook Text <span className="text-zinc-600 font-normal">(first 2s)</span></label>
                            <input
                              type="text"
                              value={ugcPrompt.overlay.hook}
                              onChange={(e) => setUgcPrompt(prev => prev?.overlay ? { ...prev, overlay: { ...prev.overlay, hook: e.target.value } } : prev)}
                              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                              placeholder="e.g. This Changed Everything"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-400 mb-1 block">CTA Button</label>
                            <input
                              type="text"
                              value={ugcPrompt.overlay.cta}
                              onChange={(e) => setUgcPrompt(prev => prev?.overlay ? { ...prev, overlay: { ...prev.overlay, cta: e.target.value } } : prev)}
                              className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                              placeholder="e.g. Shop Now"
                            />
                          </div>
                          <p className="text-xs text-zinc-600 italic">Captions are generated from audio transcription in the Video Editor</p>
                        </div>
                      )}

                      {/* Extension Prompts — if segmented video */}
                      {ugcPrompt.extensionPrompts && ugcPrompt.extensionPrompts.length > 0 && (
                        <details className="group">
                          <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                            Extension Prompts ({ugcPrompt.extensionPrompts.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {ugcPrompt.extensionPrompts.map((ep, idx) => (
                              <div key={idx}>
                                <label className="text-xs text-zinc-500 mb-1 block">Segment {idx + 2}</label>
                                <textarea
                                  value={ep}
                                  onChange={(e) => setUgcPrompt(prev => {
                                    if (!prev?.extensionPrompts) return prev
                                    const updated = [...prev.extensionPrompts!]
                                    updated[idx] = e.target.value
                                    return { ...prev, extensionPrompts: updated }
                                  })}
                                  className="w-full bg-bg-dark border border-zinc-700/50 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-amber-500/50 resize-y"
                                  rows={4}
                                />
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Budget line — duration + credit cost from script */}
                      {(() => {
                        const dur = ugcPrompt.estimatedDuration || 8
                        const exts = dur > 8 ? Math.round((dur - 8) / 7) : 0
                        const cost = VEO_BASE_COST + exts * VEO_EXTENSION_COST
                        const canAfford = aiUsage ? aiUsage.remaining >= cost : true
                        return (
                          <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold text-white tabular-nums">{dur}s video</p>
                              <p className="text-xs text-zinc-500">
                                {exts === 0 ? 'Single clip' : `8s base + ${exts} extension${exts > 1 ? 's' : ''}`}
                                {' · '}{ugcPrompt.dialogue.split(/\s+/).length} words
                              </p>
                            </div>
                            <div className="text-right space-y-0.5">
                              <p className={cn('text-sm font-bold tabular-nums', canAfford ? 'text-amber-400' : 'text-red-400')}>
                                {cost} credits
                              </p>
                              {aiUsage && (
                                <p className="text-xs text-zinc-500">{aiUsage.remaining} remaining</p>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Action buttons */}
                      {(() => {
                        const dur = ugcPrompt.estimatedDuration || 8
                        const exts = dur > 8 ? Math.round((dur - 8) / 7) : 0
                        const cost = VEO_BASE_COST + exts * VEO_EXTENSION_COST
                        const canAfford = aiUsage ? aiUsage.remaining >= cost : true
                        return (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={handleUgcApproveGenerate}
                              disabled={ugcGenerating || !canAfford}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              {ugcGenerating ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Generating {dur}s video...
                                </>
                              ) : (
                                <>
                                  <Clapperboard className="w-4 h-4" />
                                  Action! ({cost} credits)
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => { setUgcPrompt(null); handleUgcWriteScript() }}
                              disabled={ugcGenerating}
                              className="px-4 py-3 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                              title="Rewrite script"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Generated Videos — Carousel per ad_index */}
              {Object.keys(i2vJobs).length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Film className="w-5 h-5 text-indigo-400" />
                    Generated Videos
                  </h2>
                  {Object.entries(i2vJobs).map(([adIdxStr, jobs]) => {
                    const adIdx = Number(adIdxStr)
                    const activeVersion = i2vCurrentVideoVersion[adIdx] ?? 0
                    const activeJob = jobs[activeVersion] || null
                    const completedJobs = jobs.filter(j => j.status === 'complete' && (j.final_video_url || j.raw_video_url))
                    const videoUrl = activeJob?.final_video_url || activeJob?.raw_video_url
                    const hasVideo = activeJob?.status === 'complete' && videoUrl
                    const latestJob = jobs[0] || null
                    const isLatestInProgress = latestJob && ['generating', 'queued', 'rendering', 'extending'].includes(latestJob.status)

                    return (
                      <div key={adIdxStr} className="bg-bg-card border border-border rounded-xl overflow-hidden">
                        {/* Video carousel — show when active job is complete */}
                        {hasVideo ? (
                          <div className="p-4">
                            <div className="flex items-center gap-3 justify-center">
                              {/* Left arrow */}
                              {jobs.length > 1 && (
                                <button
                                  onClick={() => setI2vCurrentVideoVersion(prev => ({ ...prev, [adIdx]: Math.min(activeVersion + 1, jobs.length - 1) }))}
                                  disabled={activeVersion >= jobs.length - 1}
                                  className="p-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  title="Older version"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                              )}
                              <div className="rounded-xl overflow-hidden bg-zinc-900" style={{ maxHeight: 360, maxWidth: 202, aspectRatio: '9/16' }}>
                                <video
                                  key={activeJob?.id}
                                  src={videoUrl}
                                  poster={activeJob?.thumbnail_url || undefined}
                                  controls
                                  playsInline
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              {/* Right arrow */}
                              {jobs.length > 1 && (
                                <button
                                  onClick={() => setI2vCurrentVideoVersion(prev => ({ ...prev, [adIdx]: Math.max(activeVersion - 1, 0) }))}
                                  disabled={activeVersion <= 0}
                                  className="p-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  title="Newer version"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                              {/* +7 sec extend button */}
                              <button
                                onClick={() => handleI2vExtend(adIdx)}
                                disabled={i2vExtending || (aiUsage ? aiUsage.remaining < VEO_EXTENSION_COST : false)}
                                className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {i2vExtending ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <Plus className="w-5 h-5" />
                                )}
                                <span className="whitespace-nowrap">+ 7 sec</span>
                                <span className="text-[10px] text-amber-400/60">25 credits</span>
                              </button>
                            </div>
                            {/* Provider badge + duration */}
                            <div className="flex items-center justify-center gap-2 mt-2">
                              {activeJob?.provider && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium uppercase">
                                  {activeJob.provider.startsWith('sora') ? 'Sora' : activeJob.provider.startsWith('runway') ? 'Runway' : 'Veo'}
                                </span>
                              )}
                              <span className="text-xs text-zinc-500">
                                {activeJob?.duration_seconds || activeJob?.target_duration_seconds || 8}s
                              </span>
                            </div>
                            {/* Version dots */}
                            {jobs.length > 1 && (
                              <div className="flex items-center justify-center gap-1.5 mt-2">
                                {jobs.map((_, vIdx) => (
                                  <button
                                    key={vIdx}
                                    onClick={() => setI2vCurrentVideoVersion(prev => ({ ...prev, [adIdx]: vIdx }))}
                                    className={cn(
                                      'w-2 h-2 rounded-full transition-colors',
                                      vIdx === activeVersion ? 'bg-indigo-400' : 'bg-zinc-700 hover:bg-zinc-500'
                                    )}
                                  />
                                ))}
                              </div>
                            )}
                            {/* Action buttons */}
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => router.push(`/dashboard/creative-studio/video-editor?jobId=${activeJob?.id}`)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/20"
                              >
                                <Film className="w-3.5 h-3.5" />
                                Edit Video
                              </button>
                              <button
                                onClick={() => handleI2vGenerate()}
                                disabled={i2vGenerating}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-border disabled:opacity-50"
                              >
                                <RefreshCw className={cn('w-3.5 h-3.5', i2vGenerating && 'animate-spin')} />
                                New Variation
                              </button>
                            </div>
                            {/* Inline progress when generating new variation alongside existing video */}
                            {isLatestInProgress && activeVersion !== 0 && (
                              <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                <div className="flex items-center gap-2">
                                  <Loader2 className={cn('w-4 h-4 animate-spin', latestJob.status === 'extending' ? 'text-amber-400' : 'text-blue-400')} />
                                  <span className="text-xs text-zinc-300">
                                    {latestJob.status === 'extending'
                                      ? `Extending... Step ${(latestJob.extension_step || 0) + 1}/${(latestJob.extension_total || 0) + 1}`
                                      : 'Generating new variation...'}
                                  </span>
                                  {latestJob.progress_pct > 0 && (
                                    <span className="text-xs text-zinc-500 ml-auto">{latestJob.progress_pct}%</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : activeJob?.status === 'failed' ? (
                          /* Failed state — show error + retry + full generate controls */
                          <div className="p-6 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                            <p className="text-sm text-red-400">{activeJob.error_message || 'Generation failed'}</p>
                            <button
                              onClick={() => handleI2vGenerate()}
                              className="mt-3 px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                            >
                              Try Again
                            </button>
                            {/* Show completed videos in carousel if any exist alongside failed */}
                            {completedJobs.length > 0 && (
                              <p className="text-xs text-zinc-500 mt-2">
                                {completedJobs.length} previous variation{completedJobs.length > 1 ? 's' : ''} available — use arrows to browse
                              </p>
                            )}
                          </div>
                        ) : (
                          /* Generating/extending state */
                          <div className={cn(
                            'p-6 text-center',
                            activeJob?.status === 'extending' ? 'border-t border-amber-500/20' : ''
                          )}>
                            <RefreshCw className={cn(
                              'w-8 h-8 animate-spin mx-auto mb-3',
                              activeJob?.status === 'extending' ? 'text-amber-400' : 'text-blue-400'
                            )} />
                            <p className="text-sm font-medium text-white mb-1">
                              {activeJob?.status === 'extending'
                                ? `Extending video... Step ${(activeJob?.extension_step || 0) + 1} of ${(activeJob?.extension_total || 0) + 1}`
                                : 'Generating Video...'}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {activeJob?.status === 'extending'
                                ? 'Adding 7 more seconds...'
                                : activeJob?.status === 'rendering'
                                  ? 'Rendering overlay...'
                                  : activeJob?.provider?.startsWith('sora') ? 'Usually takes 5-10 minutes'
                                  : activeJob?.provider?.startsWith('runway') ? 'Usually takes 1-2 minutes'
                                  : 'Usually takes 2-5 minutes'}
                            </p>
                            {(activeJob?.progress_pct || 0) > 0 && (
                              <div className="w-32 mx-auto mt-3">
                                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all duration-1000',
                                      activeJob?.status === 'extending' ? 'bg-amber-500' : 'bg-blue-500'
                                    )}
                                    style={{ width: `${activeJob?.progress_pct || 0}%` }}
                                  />
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">{activeJob?.progress_pct || 0}%</p>
                              </div>
                            )}
                            {/* Show completed videos below if any exist while generating new one */}
                            {completedJobs.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-border">
                                <p className="text-xs text-zinc-400 mb-2">{completedJobs.length} completed variation{completedJobs.length > 1 ? 's' : ''}</p>
                                <button
                                  onClick={() => {
                                    const firstCompletedIdx = jobs.findIndex(j => j.status === 'complete' && (j.final_video_url || j.raw_video_url))
                                    if (firstCompletedIdx >= 0) setI2vCurrentVideoVersion(prev => ({ ...prev, [adIdx]: firstCompletedIdx }))
                                  }}
                                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                  View completed videos
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Media Library Modal for Image-to-Video */}
          {i2vShowLibrary && user?.id && currentAccountId && (
            <MediaLibraryModal
              isOpen={i2vShowLibrary}
              onClose={() => setI2vShowLibrary(false)}
              userId={user.id}
              adAccountId={currentAccountId}
              selectedItems={[]}
              onSelectionChange={async (items) => {
                setI2vShowLibrary(false)
                if (items.length === 0) return

                const item = items[0]
                if (!('hash' in item)) return

                const mediaItem = item as MediaImage & { mediaType: 'image' }

                // Download image to get base64
                setI2vDownloadingLibrary(true)
                try {
                  const res = await fetch('/api/creative-studio/download-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: mediaItem.url }),
                  })

                  if (res.ok) {
                    const data = await res.json()
                    setI2vSelectedImage({
                      base64: data.base64,
                      mimeType: data.mimeType || 'image/jpeg',
                      preview: mediaItem.url,
                      name: mediaItem.name || 'Library image',
                    })
                  } else {
                    setI2vError('Failed to load image from library')
                  }
                } catch {
                  setI2vError('Failed to load image from library')
                } finally {
                  setI2vDownloadingLibrary(false)
                }
              }}
              maxSelection={1}
              allowedTypes={['image']}
            />
          )}

          {/* Selected Ad Card (Clone mode only - shows the ad being used as reference) */}
          {mode === 'clone' && selectedAd && currentStep === 3 && (
            <div className={cn(
              'bg-bg-card border rounded-xl p-5',
              isRefreshMode ? 'border-purple-500/30' : 'border-border'
            )}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  {isRefreshMode ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-purple-400" />
                      Refreshing Ad
                    </>
                  ) : (
                    'Inspiration Ad'
                  )}
                </h3>
                <button
                  onClick={() => resetToStep(2)}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Change
                </button>
              </div>

              {/* Show the actual ad visual */}
              <div className="flex gap-4">
                {/* Ad Media Preview — for own ads use referenceAdImage or storageUrl fallback */}
                {(() => {
                  const previewUrl = isRefreshMode
                    ? (referenceAdImage ? `data:${referenceAdImage.mimeType};base64,${referenceAdImage.base64}` : null)
                    : (selectedCompetitorAd?.imageUrl || selectedCompetitorAd?.videoThumbnail || selectedCompetitorAd?.carouselCards?.[0]?.imageUrl || null)
                  return previewUrl ? (
                    <div className="flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden bg-zinc-900">
                      <img
                        src={previewUrl}
                        alt="Reference ad"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null
                })()}

                {/* Ad Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{selectedAd.page_name}</div>
                  {selectedAd.ad_creative_link_titles?.[0] && (
                    <div className="text-sm text-zinc-300 mt-1 font-medium line-clamp-1">
                      &ldquo;{selectedAd.ad_creative_link_titles[0]}&rdquo;
                    </div>
                  )}
                  {selectedAd.ad_creative_bodies?.[0] && (
                    <p className="text-sm text-zinc-500 mt-2 line-clamp-2">
                      {selectedAd.ad_creative_bodies[0]}
                    </p>
                  )}

                  {/* Reference image status */}
                  <div className="mt-3">
                    {isDownloadingRefImage ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Downloading reference...
                      </div>
                    ) : referenceAdImage ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <Check className="w-3 h-3" />
                        {isRefreshMode ? 'Ready to refresh this creative' : 'Ready to clone this style'}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        No reference image - will use selected style
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Generate (Clone mode only - shows after selecting competitor/own ad) */}
          {mode === 'clone' && currentStep === 3 && !generatedAds.length && (
            <div className="bg-bg-card border border-border rounded-xl p-6 text-center">
              {isRefreshMode ? (
                <RefreshCw className="w-12 h-12 text-purple-400 mx-auto mb-4" />
              ) : (
                <Wand2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              )}
              <h2 className="text-lg font-semibold text-white mb-2">
                {isRefreshMode ? 'Ready to Refresh' : 'Ready to Generate'}
              </h2>
              <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
                {isRefreshMode
                  ? 'We\'ll create fresh variations that keep the winning angle but change the hook, framing, and visuals.'
                  : 'We\'ll analyze the competitor\'s ad strategy and create 4 unique ad variations for your product.'}
              </p>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  'px-8 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2',
                  'bg-emerald-500 hover:bg-emerald-600 text-white',
                  isGenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Ad Variations
                  </>
                )}
              </button>
            </div>
          )}

          {/* Create mode Step 3: Generate ad copy (no competitor reference) */}
          {mode === 'create' && currentStep === 3 && generatedAds.length === 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-accent" />
                Generate Ad Copy
              </h2>
              <p className="text-sm text-zinc-400">
                We'll analyze your product and generate 4 unique ad copy variations with different angles and hooks.
              </p>
              {productInfo && (
                <div className="bg-bg-dark rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-3">
                    {productInfo.imageBase64 && (
                      <img
                        src={`data:${productInfo.imageMimeType};base64,${productInfo.imageBase64}`}
                        alt={productInfo.name}
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    )}
                    <div>
                      <div className="font-medium text-white">{productInfo.name}</div>
                      {productInfo.price && (
                        <div className="text-sm text-zinc-400">
                          {productInfo.currency || '$'}{productInfo.price}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={cn(
                  'w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                  'bg-accent hover:bg-accent/90 text-white',
                  isGenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Ad Copy...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Ad Copy
                  </>
                )}
              </button>
            </div>
          )}

          {/* Generated Results */}
          {generatedAds.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-lg font-semibold text-white">Your Generated Ads</h2>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Regenerate Copy
                  </button>
                </div>
              </div>
              {/* AI Credits */}
              {aiUsage && (
                <div className={cn(
                  'flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-fit',
                  aiUsage.remaining <= 0
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-zinc-800 text-zinc-400'
                )}>
                  <ImagePlus className="w-3 h-3" />
                  {aiUsage.remaining <= 0
                    ? `Credit limit reached (${aiUsage.totalAvailable}${aiUsage.status === 'active' ? '/mo' : ' total'})`
                    : `${aiUsage.remaining} credits remaining — Image (5 cr)${aiUsage.status === 'active' ? ' · resets monthly' : ''}`
                  }
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {generatedAds.map((ad, index) => (
                  <div
                    key={index}
                    className="bg-bg-card border border-border rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between">
                      <span className="px-2 py-0.5 text-xs font-semibold bg-accent/20 text-accent rounded">
                        {ad.angle}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSaveCopy(ad, index)}
                          disabled={savingCopyIndex === index || savedCopyIds[index]}
                          className={cn(
                            'p-2 rounded-lg transition-colors',
                            savedCopyIds[index]
                              ? 'text-emerald-400'
                              : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                          )}
                          title={savedCopyIds[index] ? 'Saved to Copy library' : 'Save to Copy library'}
                        >
                          {savingCopyIndex === index ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : savedCopyIds[index] ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => copyToClipboard(ad, index)}
                          className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                          title="Copy ad copy"
                        >
                          {copiedIndex === index ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Headline</div>
                      <div className="text-white font-semibold">{ad.headline}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Primary Text</div>
                      <div className="text-zinc-300 text-sm whitespace-pre-wrap">{ad.primaryText}</div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Description</div>
                      <div className="text-zinc-400 text-sm">{ad.description}</div>
                    </div>

                    <div className="pt-3 border-t border-border">
                      <div className="text-xs text-emerald-400 mb-1">Why it works</div>
                      <div className="text-zinc-500 text-sm">{ad.whyItWorks}</div>
                    </div>

                    {/* Image Generation Section */}
                    <div className="pt-3 border-t border-border">
                      <>
                      {(() => {
                        const images = generatedImages[index]
                        if (!images || images.length === 0) return null

                        // Safely clamp version index to valid range
                        const rawVersion = currentImageVersion[index] ?? 0
                        const safeVersion = Math.max(0, Math.min(rawVersion, images.length - 1))
                        const currentImage = images[safeVersion]

                        if (!currentImage) return null

                        return (
                        <div className="space-y-3">
                          {/* Header with version indicator */}
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-zinc-500">
                              Generated Image
                              {images.length > 1 && (
                                <span className="ml-2 text-zinc-400">
                                  (Version {safeVersion + 1} of {images.length})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Image carousel */}
                          <div className="relative">
                            {/* Navigation arrows */}
                            {images.length > 1 && (
                              <>
                                <button
                                  onClick={() => navigateVersion(index, 'prev')}
                                  disabled={safeVersion === 0}
                                  className={cn(
                                    'absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors',
                                    safeVersion === 0 && 'opacity-30 cursor-not-allowed'
                                  )}
                                >
                                  <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => navigateVersion(index, 'next')}
                                  disabled={safeVersion >= images.length - 1}
                                  className={cn(
                                    'absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors',
                                    safeVersion >= images.length - 1 && 'opacity-30 cursor-not-allowed'
                                  )}
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </>
                            )}

                            {/* Current image */}
                            <img
                              src={`data:${currentImage.mimeType};base64,${currentImage.base64}`}
                              alt={`Generated ad image for ${ad.angle}`}
                              className="w-full rounded-lg border border-border"
                            />

                            {/* Version dots */}
                            {images.length > 1 && (
                              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-1.5">
                                {images.map((_, vIdx) => (
                                  <button
                                    key={vIdx}
                                    onClick={() => setCurrentImageVersion(prev => ({ ...prev, [index]: vIdx }))}
                                    className={cn(
                                      'w-2 h-2 rounded-full transition-colors',
                                      vIdx === safeVersion
                                        ? 'bg-white'
                                        : 'bg-white/40 hover:bg-white/60'
                                    )}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="absolute bottom-2 right-2 flex gap-2">
                              <button
                                onClick={() => downloadImage(currentImage, index, safeVersion)}
                                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                                title="Download image"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleSaveToLibrary(index, ad)}
                                disabled={savingToLibrary[index] || savedToLibrary[`${index}-${safeVersion}`]}
                                className={cn(
                                  'p-2 rounded-lg transition-colors',
                                  savedToLibrary[`${index}-${safeVersion}`]
                                    ? 'bg-emerald-500/60 text-white'
                                    : 'bg-black/60 hover:bg-black/80 text-white'
                                )}
                                title={savedToLibrary[`${index}-${safeVersion}`] ? 'Saved to library' : 'Add to Media Library'}
                              >
                                {savingToLibrary[index] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : savedToLibrary[`${index}-${safeVersion}`] ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <FolderPlus className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleGenerateImage(ad, index)}
                                disabled={generatingImageIndex !== null || adjustingImageIndex !== null}
                                className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                                title="Generate new version"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleCreateAd(index, ad)}
                                disabled={creatingAd[index] || generatingImageIndex !== null || adjustingImageIndex !== null}
                                className="p-2 rounded-lg bg-accent/80 hover:bg-accent text-white transition-colors"
                                title="Create Ad"
                              >
                                {creatingAd[index] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Megaphone className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Adjust Image Input */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={adjustmentPrompts[index] || ''}
                              onChange={(e) => setAdjustmentPrompts(prev => ({ ...prev, [index]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && handleAdjustImage(index)}
                              placeholder="Adjust image... (e.g., 'make background blue', 'add more contrast')"
                              className="flex-1 bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-accent"
                              disabled={adjustingImageIndex !== null || generatingImageIndex !== null}
                            />
                            <button
                              onClick={() => handleAdjustImage(index)}
                              disabled={!adjustmentPrompts[index]?.trim() || adjustingImageIndex !== null || generatingImageIndex !== null}
                              className={cn(
                                'px-3 py-2 rounded-lg transition-colors flex items-center gap-1',
                                'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                                (!adjustmentPrompts[index]?.trim() || adjustingImageIndex !== null || generatingImageIndex !== null) && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              {adjustingImageIndex === index ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </button>
                          </div>

                          {imageErrors[index] && (
                            <div className="flex items-center gap-2 text-red-400 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              {imageErrors[index]}
                            </div>
                          )}
                        </div>
                        )
                      })()}
                      {/* No images - show generate button (with prompt field for Create/Upload mode) */}
                      {(!generatedImages[index] || generatedImages[index].length === 0) && (
                        <div className="space-y-3">
                          {/* Image prompt + style row */}
                          <div className="flex gap-2 items-end">
                            {(mode === 'create' || mode === 'upload') ? (
                              <div className="flex-1">
                                <label className="block text-xs text-zinc-500 mb-1.5">
                                  {mode === 'upload' ? 'Creative direction' : 'Describe how you want the ad to look'} <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                  value={imagePrompts[index] || ''}
                                  onChange={(e) => setImagePrompts(prev => ({ ...prev, [index]: e.target.value }))}
                                  placeholder="e.g., 'Lifestyle photo of someone using the product outdoors with warm sunset lighting'"
                                  className={cn(
                                    'w-full bg-bg-dark border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none resize-none',
                                    mode === 'upload' ? 'focus:border-cyan-500' : 'focus:border-accent'
                                  )}
                                  rows={2}
                                />
                              </div>
                            ) : (
                              <div className="flex-1" />
                            )}
                            <div className="shrink-0">
                              <label className="block text-xs text-zinc-500 mb-1.5">Style</label>
                              <select
                                value={imageStyles[index] || (referenceAdImage ? (isRefreshMode ? 'refresh' : 'clone') : 'lifestyle')}
                                onChange={(e) => setImageStyles(prev => ({ ...prev, [index]: e.target.value as any }))}
                                className="bg-bg-dark border border-border rounded-lg px-2 py-[7px] text-sm text-white focus:outline-none focus:border-accent"
                              >
                                {referenceAdImage && isRefreshMode && (
                                  <option value="refresh">Refresh</option>
                                )}
                                {referenceAdImage && !isRefreshMode && (
                                  <option value="clone">Clone</option>
                                )}
                                <option value="lifestyle">Lifestyle</option>
                                <option value="product">Product</option>
                                <option value="minimal">Minimal</option>
                                <option value="bold">Bold</option>
                              </select>
                            </div>
                          </div>
                          <button
                            onClick={() => handleGenerateImage(ad, index)}
                            disabled={generatingImageIndex !== null || ((mode === 'create' || mode === 'upload') && !imagePrompts[index]?.trim()) || (aiUsage != null && aiUsage.remaining < 5)}
                            className={cn(
                              'w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                              mode === 'upload'
                                ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30'
                                : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                              (generatingImageIndex !== null || ((mode === 'create' || mode === 'upload') && !imagePrompts[index]?.trim()) || (aiUsage != null && aiUsage.remaining < 5)) && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {generatingImageIndex === index ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating Image...
                              </>
                            ) : (
                              <>
                                <ImagePlus className="w-4 h-4" />
                                Generate Image (5 credits)
                              </>
                            )}
                          </button>
                          {imageErrors[index] && (
                            <div className="flex items-center gap-2 text-red-400 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              {imageErrors[index]}
                            </div>
                          )}
                        </div>
                      )}
                      </>
                    </div>
                  </div>
                ))}
              </div>

              {/* Start Over */}
              <div className="text-center pt-4">
                <button
                  onClick={mode === 'upload' ? resetToModeSelection : () => resetToStep(1)}
                  className="text-sm text-zinc-500 hover:text-white"
                >
                  {mode === 'upload' ? 'Start over with a different image' : 'Start over with a different product'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Competitor Ad Detail Modal */}
      {viewingAd && (
        <CompetitorAdModal
          ad={viewingAd}
          onClose={() => setViewingAd(null)}
          onUseAsInspiration={handleUseAsInspiration}
        />
      )}

      {/* Own Ad Detail Modal */}
      {viewingOwnAd && (
        <OwnAdModal
          ad={viewingOwnAd}
          onClose={() => setViewingOwnAd(null)}
          onUseThisAd={handleSelectOwnAd}
        />
      )}

      {/* Launch Wizard for creating ads */}
      {showLaunchWizard && currentAccountId && (
        <div className="fixed inset-0 bg-bg-dark z-50 overflow-y-auto">
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={async (result) => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)

              // Hydrate the newly created entity so it appears immediately in dashboard/creative suite
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
                  console.log('[Ad Studio] Hydrated new entity:', result.createdEntity.entityType, result.createdEntity.entityId)
                } catch (err) {
                  console.warn('[Ad Studio] Hydrate failed:', err)
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
