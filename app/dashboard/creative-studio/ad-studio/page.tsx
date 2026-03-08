'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Search, Wand2, Sparkles, ExternalLink, Copy, Check, Loader2, AlertCircle, Link as LinkIcon, Link2, Package, ChevronRight, Download, ImagePlus, Calendar, BarChart3, ChevronLeft, FolderPlus, Send, Megaphone, Layers, Lightbulb, Upload, X, FileText, RefreshCw, Video, Plus, Globe, Play, User, Pencil, Image as ImageIcon } from 'lucide-react'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { MediaLibraryModal } from '@/components/media-library-modal'
import type { MediaImage } from '@/app/api/meta/media/route'
import type { VideoJob } from '@/remotion/types'
import type { ScenePlan } from '@/lib/video-prompt-templates'
import { cn } from '@/lib/utils'
import ProductInput from '@/components/creative-studio/product-input'
import DirectorsReview from '@/components/creative-studio/directors-review'
import type { ProductInputRef } from '@/components/creative-studio/product-input'
import type { ProductKnowledge, ProductImage } from '@/lib/video-prompt-templates'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { notifyCreditsChanged } from '@/components/creative-studio/credits-gauge'
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
import { OracleBox, type OracleSubmission } from '@/components/creative-studio/oracle-box'
import { OracleChips, type ChipDef } from '@/components/creative-studio/oracle-chips'
import { OracleChatThread } from '@/components/creative-studio/oracle-chat-thread'
import type { OracleMode, OracleInputMode, OracleMessage, OracleOption, OracleChatResponse, OracleCreativeResponse, OracleToolRequest, OracleMediaRequest } from '@/components/creative-studio/oracle-types'
import { ORACLE_TOOL_CREDITS } from '@/components/creative-studio/oracle-types'
import { executeOracleTool, type ToolExecutionResult } from '@/lib/oracle-tools'

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
const ANALYZING_MESSAGES = [
  'Visiting the site...',
  'Reading the page...',
  'Gathering product details...',
  'Looking through photos...',
  'Reading specifications...',
  'Checking reviews...',
  'Analyzing pricing...',
  'Identifying key features...',
  'Understanding the brand...',
]

function AnalyzingStatus() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % ANALYZING_MESSAGES.length)
    }, 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-2 text-purple-400 text-sm animate-pulse">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>{ANALYZING_MESSAGES[index]}</span>
    </div>
  )
}

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

  // Mode selection: null = landing page, 'create' = original ads, 'clone' = copy competitor style, 'inspiration' = browse gallery, 'upload' = upload own image, 'open-prompt' = direct prompt generation
  const [mode, setMode] = useState<'create' | 'clone' | 'inspiration' | 'upload' | 'open-prompt' | null>(null)

  // Step tracking
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Step 1: Product URL or Manual Entry
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false)
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [productImageOptions, setProductImageOptions] = useState<ProductImageOption[]>([])
  const [selectedProductImageIdx, setSelectedProductImageIdx] = useState(0)
  const [selectedProductImageIndices, setSelectedProductImageIndices] = useState<number[]>([0])

  // Create mode: shared ProductInput component state
  const [createMediaLibraryOpen, setCreateMediaLibraryOpen] = useState(false)
  const [createImageFromLibrary, setCreateImageFromLibrary] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)

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
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<number, '1:1' | '9:16' | '16:9'>>({})
  const [includeProductImage, setIncludeProductImage] = useState<Record<number, boolean>>({})
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


  const router = useRouter()
  const searchParams = useSearchParams()
  const restoredSessionRef = useRef(false)
  const restoredOracleRef = useRef(false)
  const productInputRef = useRef<ProductInputRef>(null)

  // Save copy state
  const [savingCopyIndex, setSavingCopyIndex] = useState<number | null>(null)
  const [savedCopyIds, setSavedCopyIds] = useState<Record<number, boolean>>({})

  // AI credit usage tracking
  const [aiUsage, setAiUsage] = useState<{ used: number; planLimit: number; purchased: number; totalAvailable: number; remaining: number; status: string } | null>(null)

  // Open Prompt state
  const [openPromptText, setOpenPromptText] = useState('')
  const [openPromptMediaType, setOpenPromptMediaType] = useState<'image' | 'video'>('image')
  const [openPromptSourceImages, setOpenPromptSourceImages] = useState<Array<{ base64: string; mimeType: string; preview: string }>>([])
  const [openPromptAspectRatio, setOpenPromptAspectRatio] = useState('9:16')
  const [openPromptQuality, setOpenPromptQuality] = useState<'standard' | 'premium'>('standard')
  const [openPromptGenerating, setOpenPromptGenerating] = useState(false)
  const [openPromptError, setOpenPromptError] = useState<string | null>(null)
  const [openPromptResult, setOpenPromptResult] = useState<{ type: 'image'; image: GeneratedImage } | { type: 'video'; jobId: string } | null>(null)
  const [openPromptSessionId, setOpenPromptSessionId] = useState<string | null>(null)
  const [openPromptCanvasId, setOpenPromptCanvasId] = useState<string | null>(null)
  const [openPromptVideoJob, setOpenPromptVideoJob] = useState<VideoJob | null>(null)
  const [openPromptExtending, setOpenPromptExtending] = useState(false)
  const [openPromptAdjustText, setOpenPromptAdjustText] = useState('')
  const [openPromptAdjusting, setOpenPromptAdjusting] = useState(false)
  const [openPromptSaving, setOpenPromptSaving] = useState(false)
  const [openPromptSaved, setOpenPromptSaved] = useState(false)
  const openPromptFileRef = useRef<HTMLInputElement>(null)
  const [openPromptShowImageMenu, setOpenPromptShowImageMenu] = useState(false)
  const [openPromptShowLibrary, setOpenPromptShowLibrary] = useState(false)
  const [openPromptDownloadingLibrary, setOpenPromptDownloadingLibrary] = useState(false)
  // Scene plan state (Director's Review for Open Prompt video)
  const [openPromptScenePlan, setOpenPromptScenePlan] = useState<ScenePlan | null>(null)
  const [openPromptPlanningScene, setOpenPromptPlanningScene] = useState(false)
  const [openPromptOverlaysEnabled, setOpenPromptOverlaysEnabled] = useState(true)

  // Oracle state
  const [oracleLoading, setOracleLoading] = useState(false)
  const [oraclePlaceholder, setOraclePlaceholder] = useState<string | undefined>(undefined)
  const [oraclePreloadImage, setOraclePreloadImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [oraclePreloadMode, setOraclePreloadMode] = useState<OracleInputMode | undefined>(undefined)
  const [oracleInputMode, setOracleInputMode] = useState<OracleInputMode>('ks')
  const [oracleOpenAttach, setOracleOpenAttach] = useState(false)
  const oracleAutoGenRef = useRef(false) // tracks if Oracle routed to open-prompt and needs auto-gen
  const oracleAutoAnalyzeRef = useRef(false) // tracks if Oracle routed to create and needs auto-analysis

  // Oracle conversation state
  const [oracleMode, setOracleMode] = useState<OracleMode>('idle')
  const [oracleMessages, setOracleMessages] = useState<OracleMessage[]>([])
  const [oracleContext, setOracleContext] = useState<Record<string, unknown>>({})
  const oracleContextRef = useRef<Record<string, unknown>>({})
  // Keep ref in sync so tool executor always reads latest context (avoids stale closures)
  oracleContextRef.current = oracleContext
  const [oracleSending, setOracleSending] = useState(false)
  const [oracleResearching, setOracleResearching] = useState(false)
  const oracleMsgIdRef = useRef(0)
  const [oracleSessionId, setOracleSessionId] = useState<string | null>(null)
  const [oracleGeneratedAssets, setOracleGeneratedAssets] = useState<Array<{
    type: string; url?: string; mediaHash?: string; toolUsed: string; creditCost: number
  }>>([])
  const [pendingToolRequest, setPendingToolRequest] = useState<OracleToolRequest | null>(null)
  const oracleChainDepthRef = useRef(0)
  const MAX_ORACLE_CHAIN_DEPTH = 3 // Stop auto-chaining after 3 tool calls — require user input
  const [oracleMediaLibraryOpen, setOracleMediaLibraryOpen] = useState(false)
  const [oracleMediaRequestType, setOracleMediaRequestType] = useState<'image' | 'video' | 'any'>('any')
  const saveSessionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const oracleHighestTierRef = useRef<'haiku' | 'sonnet' | 'opus'>('sonnet')
  const saveOracleSessionRef = useRef<() => Promise<void>>(() => Promise.resolve())

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

  // Restore session from ?sessionId= URL param (from AI Tasks "Continue in Ad Studio")
  useEffect(() => {
    if (restoredSessionRef.current) return
    const restoreSessionId = searchParams.get('sessionId')
    if (!restoreSessionId || !user?.id) return

    restoredSessionRef.current = true

    const restoreSession = async () => {
      try {
        const res = await fetch(`/api/creative-studio/ad-session?userId=${user.id}&sessionId=${restoreSessionId}`)
        const data = await res.json()
        if (!res.ok || !data.session) return

        const s = data.session

        // Populate session ID so new images save to same session
        setSessionId(s.id)

        // Populate product info
        if (s.product_url) setProductUrl(s.product_url)
        if (s.product_info) {
          setProductInfo(s.product_info)
          setHasAnalyzed(true)

          // Populate pill pools from product_info
          const newPools: Record<PillCategory, string[]> = {
            name: s.product_info.name ? [s.product_info.name] : [],
            description: s.product_info.description ? [s.product_info.description] : [],
            features: s.product_info.features || [],
            benefits: s.product_info.benefits || [],
            keyMessages: s.product_info.keyMessages || [],
            testimonials: s.product_info.testimonialPoints || [],
            painPoints: s.product_info.painPoints || [],
          }
          setPools(newPools)

          // Auto-select all populated pills
          const newSelected: Record<PillCategory, number[]> = {
            name: newPools.name.length > 0 ? [0] : [],
            description: newPools.description.length > 0 ? [0] : [],
            features: newPools.features.map((_, i) => i),
            benefits: newPools.benefits.map((_, i) => i),
            keyMessages: newPools.keyMessages.map((_, i) => i),
            testimonials: newPools.testimonials.map((_, i) => i),
            painPoints: newPools.painPoints.map((_, i) => i),
          }
          setSelected(newSelected)
        }

        // Populate competitor info
        if (s.competitor_company) setSelectedCompany(s.competitor_company)

        // Determine mode
        setMode(s.competitor_company ? 'clone' : 'create')

        // Populate generated ads
        if (s.generated_ads?.length > 0) setGeneratedAds(s.generated_ads)

        // Populate generated images from session
        if (s.generated_images?.length > 0) {
          const imagesByAd: Record<number, GeneratedImage[]> = {}
          s.generated_images.forEach((img: { adIndex: number; storageUrl: string; mediaHash?: string; mimeType?: string }) => {
            if (!imagesByAd[img.adIndex]) imagesByAd[img.adIndex] = []
            imagesByAd[img.adIndex].push({
              base64: '',
              mimeType: img.mimeType || 'image/png',
              storageUrl: img.storageUrl,
              mediaHash: img.mediaHash,
            })
          })
          setGeneratedImages(imagesByAd)
          setSessionImages(s.generated_images)
        }

        // Jump to step 3 (generation/results)
        setCurrentStep(3)
      } catch (err) {
        console.error('[AdStudio] Failed to restore session:', err)
      }
    }

    restoreSession()
  }, [searchParams, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore Open Prompt video session from ?canvasId= URL param (from AI Tasks "Continue in Ad Studio")
  useEffect(() => {
    if (restoredSessionRef.current) return
    const canvasIdParam = searchParams.get('canvasId')
    if (!canvasIdParam || !user?.id) return

    restoredSessionRef.current = true

    const restoreCanvas = async () => {
      try {
        const res = await fetch(`/api/creative-studio/video-canvas?userId=${user.id}&canvasId=${canvasIdParam}`)
        const data = await res.json()
        if (!res.ok || !data.canvas) return

        const canvas = data.canvas
        const concept = canvas.concepts?.[0]
        if (!concept) return

        // Set canvas ID for future saves
        setOpenPromptCanvasId(canvas.id)

        // Restore original prompt text
        if (concept.originalPrompt) {
          setOpenPromptText(concept.originalPrompt)
        } else if (concept.logline) {
          setOpenPromptText(concept.logline)
        }

        // Reconstruct ScenePlan from stored data
        const restoredPlan: ScenePlan = concept.scenePlan || {
          videoPrompt: concept.videoPrompt || '',
          extensionPrompts: concept.extensionPrompts || [],
          scene: concept.visualMetaphor?.replace('AI-directed scene — ', '') || '',
          mood: '',
          estimatedDuration: concept.estimatedDuration || 8,
          overlay: concept.overlay ? { hook: concept.overlay.hook || '', cta: concept.overlay.cta || '' } : undefined,
          dialogue: '',
        }

        setOpenPromptScenePlan(restoredPlan)
        setOpenPromptMediaType('video')
        setMode('open-prompt')

        // Restore source image if persisted
        if (concept.sourceImage?.base64 && concept.sourceImage?.mimeType) {
          setOpenPromptSourceImages([{
            base64: concept.sourceImage.base64,
            mimeType: concept.sourceImage.mimeType,
            preview: `data:${concept.sourceImage.mimeType};base64,${concept.sourceImage.base64}`,
          }])
        }
      } catch (err) {
        console.error('[AdStudio] Failed to restore canvas:', err)
      }
    }

    restoreCanvas()
  }, [searchParams, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore Oracle session from sessionStorage (after navigating away to video/image editor and returning)
  useEffect(() => {
    if (restoredOracleRef.current) return
    if (oracleMode !== 'idle') return // Already in a session
    const activeOracleId = sessionStorage.getItem('ks_active_oracle_session')
    if (!activeOracleId || !user?.id) return

    restoredOracleRef.current = true
    sessionStorage.removeItem('ks_active_oracle_session')

    const restoreOracle = async () => {
      try {
        const res = await fetch(`/api/creative-studio/oracle-session?userId=${user.id}&sessionId=${activeOracleId}`)
        const data = await res.json()
        if (!res.ok || !data.session) return
        const s = data.session

        setOracleSessionId(s.id)
        setOracleMessages(s.messages || [])
        setOracleContext(s.context || {})
        setOracleGeneratedAssets(s.generated_assets || [])
        oracleHighestTierRef.current = s.highest_tier || 'sonnet'

        // Derive mode from highest tier
        setOracleMode(s.highest_tier === 'opus' ? 'creative' : 'chat')
      } catch (err) {
        console.error('[Oracle] Failed to restore session:', err)
      }
    }
    restoreOracle()
  }, [user?.id, oracleMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to landing page when sidebar link is clicked while already on this page
  useEffect(() => {
    const handleSidebarReset = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.href === '/dashboard/creative-studio/ad-studio' && mode !== null) {
        resetToModeSelection()
      }
    }
    window.addEventListener('sidebar-nav-reset', handleSidebarReset)
    return () => window.removeEventListener('sidebar-nav-reset', handleSidebarReset)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

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

    // Create mode skips competitor search, goes straight to generate
    // Clone mode with pre-selected ad also skips to generate
    if (mode === 'create' || selectedAd) {
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

  // Auto-trigger analysis when Oracle conversation routes with a URL (clone mode only — create mode uses ProductInput's autoAnalyze)
  useEffect(() => {
    if (oracleAutoAnalyzeRef.current && mode && mode !== 'create' && productUrl.trim()) {
      oracleAutoAnalyzeRef.current = false
      handleAnalyzeProduct()
    }
  }, [mode, productUrl, handleAnalyzeProduct])

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
      // If user toggled off product image, strip it from the product info sent to API
      const shouldIncludeProductImage = includeProductImage[index] !== false // default true
      const productPayload = shouldIncludeProductImage
        ? productInfo
        : { ...productInfo, imageBase64: undefined, imageMimeType: undefined }

      const requestBody: Record<string, unknown> = {
        userId: user.id,
        adCopy: {
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description,
          angle: ad.angle,
        },
        product: productPayload,
        style: imageStyles[index] || (referenceAdImage ? (isRefreshMode ? 'refresh' : 'clone') : 'lifestyle'),
        aspectRatio: imageAspectRatios[index] || '1:1',
        isRefresh: isRefreshMode,
      }

      console.log('[Ad Studio] Product image present:', Boolean(productPayload.imageBase64), 'length:', productPayload.imageBase64?.length || 0, '| Aspect ratio:', imageAspectRatios[index] || '1:1')

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
      notifyCreditsChanged()

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
  }, [productInfo, imageStyles, imageAspectRatios, includeProductImage, referenceAdImage, user?.id, currentAccountId, sessionId, generatedImages, saveImageToSession, imagePrompts, isRefreshMode])

  // Adjust an existing image with a prompt
  const handleAdjustImage = useCallback(async (adIndex: number) => {
    if (!user?.id || !currentAccountId) return

    const images = generatedImages[adIndex]
    const currentVersion = currentImageVersion[adIndex] ?? 0
    const currentImage = images?.[currentVersion]
    const prompt = adjustmentPrompts[adIndex]

    if (!currentImage || !prompt?.trim()) return

    // Guard: session-restored images have empty base64 — fetch from storageUrl first
    let imageBase64 = currentImage.base64
    const imageMimeType = currentImage.mimeType
    if (!imageBase64 && currentImage.storageUrl) {
      try {
        const fetchRes = await fetch(currentImage.storageUrl)
        const blob = await fetchRes.blob()
        imageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(blob)
        })
      } catch {
        setImageErrors(prev => ({ ...prev, [adIndex]: 'Failed to load image for adjustment' }))
        return
      }
    }
    if (!imageBase64) {
      setImageErrors(prev => ({ ...prev, [adIndex]: 'Image data not available - please regenerate' }))
      return
    }

    setAdjustingImageIndex(adIndex)
    setImageErrors(prev => ({ ...prev, [adIndex]: '' }))

    try {
      const res = await fetch('/api/creative-studio/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          imageMimeType,
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
    if (!image.base64 && image.storageUrl) {
      // Session-restored images: download from storageUrl
      const link = document.createElement('a')
      link.href = image.storageUrl
      link.download = `ad-image-${adIndex + 1}-v${versionIndex + 1}.png`
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }
    if (!image.base64) return
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

  // Oracle conversation helpers
  const makeOracleMsg = useCallback((role: 'user' | 'oracle', content: string, extra?: Partial<OracleMessage>): OracleMessage => {
    oracleMsgIdRef.current += 1
    return { id: `om-${oracleMsgIdRef.current}`, role, content, ...extra }
  }, [])

  // Strip base64 image data from product info before storing in Oracle context.
  // The analyze-product-url response includes full base64 images (can be 10+ MB)
  // which would exceed API body limits when sent back to oracle-chat/oracle-creative.
  const stripBase64ForContext = useCallback((data: Record<string, unknown>) => {
    const { imageBase64: _ib, imageMimeType: _im, productImages: _pi, ...rest } = data as Record<string, unknown> & { product?: Record<string, unknown> }
    if (rest.product && typeof rest.product === 'object') {
      const { imageBase64: _pib, imageMimeType: _pim, ...cleanProduct } = rest.product as Record<string, unknown>
      return { ...rest, product: cleanProduct }
    }
    return rest
  }, [])

  // Ref for handleOracleChatSendInternal — allows tool chaining without circular deps
  const oracleChatSendRef = useRef<(text: string, isToolResult?: boolean) => Promise<void>>(async () => {})

  // Core tool execution — called for free tools immediately, or after credit confirmation
  const executeOracleToolAndChain = useCallback(async (
    toolReq: OracleToolRequest,
    tier: 'sonnet' | 'opus'
  ) => {
    // Show loading card
    const loadingMsgId = `tool-loading-${Date.now()}`
    setOracleMessages(prev => [...prev, {
      id: loadingMsgId,
      role: 'oracle' as const,
      tier,
      content: '',
      contextCards: [{
        type: 'tool-loading' as const,
        data: { tool: toolReq.tool, reason: toolReq.reason },
      }],
    }])

    try {
      // Read from ref to get latest context (avoids stale closure after setOracleContext)
      const ctx = oracleContextRef.current
      const toolContext = {
        userId: user?.id || '',
        adAccountId: currentAccountId || '',
        productInfo: ctx.productInfo as Record<string, unknown> | undefined,
        productImages: ctx.productImages as Array<{ base64: string; mimeType: string }> | undefined,
        userMedia: ctx.userMedia as Array<{ url: string; mimeType: string; name: string; type: string }> | undefined,
        videoAnalysis: ctx.videoAnalysis as Record<string, unknown> | undefined,
        analyzedVideoUrl: ctx.analyzedVideoUrl as string | undefined,
        imageAnalysis: ctx.imageAnalysis as Record<string, unknown> | undefined,
        analyzedImageUrl: ctx.analyzedImageUrl as string | undefined,
      }

      const result = await executeOracleTool(toolReq.tool, toolReq.inputs, toolContext)

      // Replace loading card with result card
      setOracleMessages(prev => prev.map(m =>
        m.id === loadingMsgId
          ? { ...m, contextCards: [{ type: result.cardType, data: result.data }] }
          : m
      ))

      // Update oracle context with tool results
      if (result.success && toolReq.tool === 'analyze_product' && result.data.product) {
        setOracleContext(prev => ({
          ...prev,
          productInfo: stripBase64ForContext(result.data.product as Record<string, unknown>),
          productImages: result.data.productImages,
        }))
      }
      if (result.success && toolReq.tool === 'analyze_video' && result.data.analysis) {
        // Store analysis AND the video's storage URL so overlay tool can find it
        const analyzedVideoUrl = (toolReq.inputs as Record<string, unknown>)?.storageUrl as string
          || ((oracleContextRef.current.userMedia as Array<{ url: string; type: string }>) || [])
              .filter(m => m.type === 'video').slice(-1)[0]?.url
        setOracleContext(prev => ({
          ...prev,
          videoAnalysis: result.data.analysis,
          ...(analyzedVideoUrl ? { analyzedVideoUrl } : {}),
        }))
      }
      if (result.success && toolReq.tool === 'analyze_image' && result.data.analysis) {
        const analyzedImageUrl = ((oracleContextRef.current.userMedia as Array<{ url: string; type: string }>) || [])
            .filter(m => m.type === 'image').slice(-1)[0]?.url
        setOracleContext(prev => ({
          ...prev,
          imageAnalysis: result.data.analysis,
          ...(analyzedImageUrl ? { analyzedImageUrl } : {}),
        }))
      }
      // Track last image result so image-editor action can navigate with it
      if (result.success && (toolReq.tool === 'adjust_image' || toolReq.tool === 'generate_image')) {
        const img = result.data.image as { base64?: string; mimeType?: string } | undefined
        if (img?.base64) {
          setOracleContext(prev => ({ ...prev, lastImageResult: img }))
        }
      }

      // Track generated assets
      if (result.generatedAsset) {
        setOracleGeneratedAssets(prev => [...prev, {
          ...result.generatedAsset!,
          toolUsed: toolReq.tool,
        }])
      }

      // Auto-send result back to model for chaining (capped to prevent runaway loops)
      oracleChainDepthRef.current += 1
      if (oracleChainDepthRef.current >= MAX_ORACLE_CHAIN_DEPTH) {
        // Stop — let the user decide what's next
        console.log(`[Oracle] Chain depth ${oracleChainDepthRef.current} reached limit, stopping auto-chain`)
        oracleChainDepthRef.current = 0
        const summaryMsg = makeOracleMsg('oracle', result.modelSummary, { tier })
        setOracleMessages(prev => [...prev, summaryMsg])
      } else {
        // Continue chain — send result back to model
        setTimeout(async () => {
          const toolResultText = `[Tool result for ${toolReq.tool}]: ${result.modelSummary}`
          await oracleChatSendRef.current(toolResultText, true)
        }, 500)
      }

    } catch (err) {
      setOracleMessages(prev => prev.map(m =>
        m.id === loadingMsgId
          ? {
              ...m,
              contextCards: [{
                type: 'tool-error' as const,
                data: { error: err instanceof Error ? err.message : 'Tool execution failed' },
              }],
            }
          : m
      ))
    }
  }, [user?.id, currentAccountId, stripBase64ForContext])

  // Handle tool execution with credit check
  const handleToolExecution = useCallback(async (
    toolReq: OracleToolRequest,
    tier: 'sonnet' | 'opus'
  ) => {
    const toolCredits = ORACLE_TOOL_CREDITS[toolReq.tool]

    if (toolCredits && toolCredits > 0) {
      // Show credit confirm card
      setOracleMessages(prev => [...prev, {
        id: `tool-confirm-${Date.now()}`,
        role: 'oracle' as const,
        tier,
        content: '',
        contextCards: [{
          type: 'credit-confirm' as const,
          data: { tool: toolReq.tool, credits: toolCredits, reason: toolReq.reason },
        }],
      }])
      setPendingToolRequest(toolReq)
      return
    }

    await executeOracleToolAndChain(toolReq, tier)
  }, [executeOracleToolAndChain])

  // Credit confirm/cancel handlers
  const handleOracleCreditConfirm = useCallback(async (messageId: string) => {
    if (!pendingToolRequest) return
    const toolReq = pendingToolRequest
    setPendingToolRequest(null)
    setOracleMessages(prev => prev.filter(m => m.id !== messageId))
    const tier = oracleMode === 'creative' ? 'opus' : 'sonnet'
    await executeOracleToolAndChain(toolReq, tier as 'sonnet' | 'opus')
  }, [pendingToolRequest, oracleMode, executeOracleToolAndChain])

  const handleOracleCreditCancel = useCallback((messageId: string) => {
    setPendingToolRequest(null)
    setOracleMessages(prev => [
      ...prev.filter(m => m.id !== messageId),
      {
        id: `cancel-${Date.now()}`,
        role: 'oracle' as const,
        tier: oracleMode === 'creative' ? 'opus' as const : 'sonnet' as const,
        content: 'No problem — what else would you like to do?',
        options: [
          { label: 'Try something else', value: 'try_else' },
          { label: 'Start over', value: '__reset' },
        ],
      },
    ])
  }, [oracleMode])

  // Save copy to library
  const handleOracleSaveCopy = useCallback(async (ad: { headline: string; primaryText: string; description?: string; angle?: string }) => {
    if (!user?.id || !currentAccountId) return
    try {
      await fetch('/api/creative-studio/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          headline: ad.headline,
          primaryText: ad.primaryText,
          description: ad.description || null,
          angle: ad.angle || null,
          source: 'oracle',
        }),
      })
    } catch (err) {
      console.error('Failed to save copy:', err)
    }
  }, [user?.id, currentAccountId])

  const handleOracleSaveImage = useCallback(async (image: { base64: string; mimeType: string }) => {
    if (!user?.id || !currentAccountId) return
    try {
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId,
          base64: image.base64,
          mimeType: image.mimeType,
          saveToLibrary: true,
          source: 'oracle',
        }),
      })
      if (res.ok) {
        console.log('[Oracle] Image saved to library')
      }
    } catch (err) {
      console.error('[Oracle] Failed to save image:', err)
    }
  }, [user?.id, currentAccountId])

  // Force-save Oracle session + store ID in sessionStorage before navigating away
  const navigateFromOracle = useCallback(async (url: string) => {
    // Cancel pending debounce
    if (saveSessionTimeoutRef.current) {
      clearTimeout(saveSessionTimeoutRef.current)
      saveSessionTimeoutRef.current = null
    }
    // Force immediate save via ref (avoids circular dependency with saveOracleSession)
    await saveOracleSessionRef.current()
    // Store active session for restoration on return
    if (oracleSessionId) {
      sessionStorage.setItem('ks_active_oracle_session', oracleSessionId)
    }
    router.push(url)
  }, [oracleSessionId, router])

  const handleOracleEditImage = useCallback(async (image: { base64: string; mimeType: string }) => {
    if (!user?.id) return
    try {
      // Save to Supabase storage so the image editor can load it
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          adAccountId: currentAccountId || '',
          base64: image.base64,
          mimeType: image.mimeType,
          saveToLibrary: false,
          source: 'oracle',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const storageUrl = data.storageUrl
        if (storageUrl) {
          navigateFromOracle(`/dashboard/creative-studio/image-editor?imageUrl=${encodeURIComponent(storageUrl)}&from=oracle`)
          return
        }
      }
      // Fallback: navigate with base64 in sessionStorage (large but works)
      sessionStorage.setItem('ks_oracle_edit_image', JSON.stringify(image))
      navigateFromOracle('/dashboard/creative-studio/image-editor?from=oracle')
    } catch (err) {
      console.error('[Oracle] Failed to open image editor:', err)
    }
  }, [user?.id, currentAccountId, navigateFromOracle])

  // Open overlay config in Video Editor via ?jobId= (standard pattern used by all flows)
  const handleOracleOpenInEditor = useCallback((config: Record<string, unknown>, videoUrl?: string) => {
    const jobId = config.jobId as string | undefined
    if (jobId) {
      // Standard pattern: navigate with ?jobId= — video editor loads overlay_config from DB
      navigateFromOracle(`/dashboard/creative-studio/video-editor?jobId=${jobId}&from=oracle`)
    } else if (videoUrl) {
      // Fallback if job creation failed
      navigateFromOracle(`/dashboard/creative-studio/video-editor?videoUrl=${encodeURIComponent(videoUrl)}&from=oracle`)
    }
  }, [navigateFromOracle])

  // Media request handlers
  const handleOracleMediaUpload = useCallback((_messageId: string, type: 'image' | 'video' | 'any') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'image/*,video/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const mediaType = file.type.startsWith('video') ? 'video' : 'image'
      const preview = URL.createObjectURL(file)

      // Convert file to base64 so tools (detect_text, generate_image) can use it
      let base64Data: string | undefined
      if (mediaType === 'image') {
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1]) // strip data:...;base64, prefix
          }
          reader.readAsDataURL(file)
        })
      }

      // Add media-attached card as user message
      setOracleMessages(prev => [...prev, {
        id: `media-${Date.now()}`,
        role: 'user' as const,
        content: '',
        mediaAttachments: [{
          url: preview,
          mimeType: file.type,
          name: file.name,
          type: mediaType,
          preview,
        }],
      }])

      // Add to oracle context so tools can access the image
      setOracleContext(prev => ({
        ...prev,
        userMedia: [...((prev.userMedia || []) as Array<Record<string, unknown>>), {
          url: base64Data ? `data:${file.type};base64,${base64Data}` : preview,
          mimeType: file.type,
          name: file.name,
          type: mediaType,
          ...(base64Data ? { base64: base64Data } : {}),
        }],
      }))

      // Send the file info back to the model
      await oracleChatSendRef.current(
        `User provided ${mediaType}: "${file.name}"`,
        true
      )
    }
    input.click()
  }, [])

  const handleOracleMediaLibrary = useCallback((_messageId: string, type: 'image' | 'video' | 'any') => {
    setOracleMediaRequestType(type)
    setOracleMediaLibraryOpen(true)
  }, [])

  const handleOracleMediaSelected = useCallback(async (items: Array<Record<string, unknown>>) => {
    setOracleMediaLibraryOpen(false)
    if (items.length === 0) return

    const item = items[0]
    const mediaType = (item.mediaType as 'image' | 'video') || 'image'
    const url = mediaType === 'video'
      ? ((item as Record<string, unknown>).source || (item as Record<string, unknown>).thumbnailUrl || '') as string
      : ((item as Record<string, unknown>).url || '') as string
    const name = mediaType === 'video'
      ? ((item as Record<string, unknown>).title || 'Video') as string
      : ((item as Record<string, unknown>).name || 'Image') as string

    // Add media card
    setOracleMessages(prev => [...prev, {
      id: `media-${Date.now()}`,
      role: 'user' as const,
      content: '',
      mediaAttachments: [{
        url,
        mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        name,
        type: mediaType,
      }],
    }])

    // Update context
    setOracleContext(prev => ({
      ...prev,
      userMedia: [...((prev.userMedia || []) as Array<Record<string, unknown>>), {
        url,
        mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        name,
        type: mediaType,
        mediaHash: item.id || item.hash,
      }],
    }))

    // Auto-send to model
    await oracleChatSendRef.current(
      `User provided ${mediaType}: "${name}" (id: ${item.id || item.hash}, url: ${url})`,
      true
    )
  }, [])

  // ── Single routing function used by ALL Oracle tiers (Haiku, Sonnet, Opus) ──
  // This is the ONLY place workflow routing happens. No model should craft generation
  // prompts — that's the job of the downstream workflows (generate-ad-concepts, etc.)
  const handleOracleAction = useCallback((action: {
    workflow: string
    prefilledData?: Record<string, unknown>
    // Haiku-only extras: attached image from the submission
    _image?: { base64: string; mimeType: string; preview: string }
  }) => {
    const { workflow, prefilledData = {}, _image } = action

    // Pre-populate shared state from extracted data
    if (prefilledData.productUrl) setProductUrl(prefilledData.productUrl as string)

    // If we have a product URL going to a URL-based workflow, auto-trigger analysis
    if (prefilledData.productUrl && ['create'].includes(workflow)) {
      oracleAutoAnalyzeRef.current = true
    }

    // For workflows that navigate away, save Oracle session first (so user can return)
    if (workflow === 'text-to-video') {
      const params = new URLSearchParams()
      if (prefilledData.prompt) params.set('prompt', prefilledData.prompt as string)
      if (prefilledData.style) params.set('style', prefilledData.style as string)
      // Pass productName from Opus prefilledData or Oracle context (for described products with no URL)
      const productName = (prefilledData.productName as string)
        || (oracleContext.productInfo as Record<string, unknown> | undefined)?.name as string | undefined
      if (productName) params.set('productName', productName)

      // Stash product context in sessionStorage so Video Studio can use it
      // (URL params can't carry complex objects like productKnowledge + images)
      const productInfo = oracleContext.productInfo as Record<string, unknown> | undefined
      const productImgs = oracleContext.productImages as Array<{ base64: string; mimeType: string; description: string; type: string }> | undefined
      if (productInfo || productImgs) {
        try {
          sessionStorage.setItem('ks_oracle_handoff', JSON.stringify({
            productInfo: productInfo || null,
            productImages: productImgs || null,
          }))
        } catch { /* sessionStorage quota — best effort */ }
      }

      const videoStudioUrl = `/dashboard/creative-studio/video-studio${params.toString() ? `?${params.toString()}` : ''}`
      navigateFromOracle(videoStudioUrl)
      return
    }

    // Reset conversation state (no-op if already idle)
    setOracleMode('idle')
    setOracleMessages([])
    setOracleContext({})
    setOracleSessionId(null)
    setOracleGeneratedAssets([])
    setPendingToolRequest(null)
    oracleHighestTierRef.current = 'sonnet'

    // Route to the workflow
    switch (workflow) {
      case 'create':
        setMode('create')
        break
      case 'clone':
        setMode('clone')
        break
      case 'inspiration':
        setMode('inspiration')
        break
      case 'upload':
        if (_image) {
          setUploadedImage({ base64: _image.base64, mimeType: _image.mimeType, preview: _image.preview })
          if (prefilledData.prompt) setUploadPrompt(prefilledData.prompt as string)
        }
        setMode('upload')
        break
      case 'url-to-video':
        navigateFromOracle('/dashboard/creative-studio/video-studio')
        return
      case 'ugc-video':
        navigateFromOracle('/dashboard/creative-studio/video-studio?mode=ugc')
        return
      case 'image-to-video':
        navigateFromOracle('/dashboard/creative-studio/video-studio?tab=image')
        return
      case 'open-prompt':
        if (_image) setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, { base64: _image.base64, mimeType: _image.mimeType, preview: _image.preview }])
        if (prefilledData.prompt) setOpenPromptText(prefilledData.prompt as string)
        setOpenPromptMediaType((prefilledData.format as 'image' | 'video') || 'image')
        setMode('open-prompt')
        break
      case 'image-editor': {
        // Route to Image Editor with the most recent image from Oracle context
        const lastImage = oracleContext.lastImageResult as { base64?: string; mimeType?: string } | undefined
        if (lastImage?.base64) {
          handleOracleEditImage({ base64: lastImage.base64, mimeType: lastImage.mimeType || 'image/png' })
        } else {
          navigateFromOracle('/dashboard/creative-studio/image-editor?from=oracle')
        }
        return
      }
      default:
        setMode('create')
    }
  }, [router, navigateFromOracle, oracleContext])

  // Oracle submit — mode-based routing: KS → Sonnet, Image → Gemini, Video → Video Studio
  const handleOracleSubmit = useCallback(async (submission: OracleSubmission) => {
    oracleChainDepthRef.current = 0 // Reset chain depth on new submission
    setOracleLoading(true)
    try {
      // Store attached image(s) for flows that need it
      if (submission.images.length > 0) {
        setOpenPromptSourceImages(submission.images.slice(0, 3).map(img => ({
          base64: img.base64,
          mimeType: img.mimeType,
          preview: img.preview,
        })))
      }

      const { mode } = submission

      // ── Image mode: direct to Gemini via open-prompt ──
      if (mode === 'image') {
        if (submission.text.trim().split(/\s+/).length < 3 && submission.images.length === 0) {
          // Too short — show inline hint, don't submit
          setOraclePlaceholder('Add more detail — e.g. "minimalist product shot on marble"')
          return
        }
        if (submission.text.trim()) {
          oracleAutoGenRef.current = true
        }
        handleOracleAction({
          workflow: 'open-prompt',
          prefilledData: {
            prompt: submission.text.trim(),
            format: 'image',
          },
          _image: submission.images[0] ?? undefined,
        })
        return
      }

      // ── Video mode: route to open-prompt Quick Review ──
      if (mode === 'video') {
        const videoPrompt = submission.text.trim()
        setOpenPromptText(videoPrompt)
        setOpenPromptMediaType('video')
        // Pass attached images as source images (up to 3)
        if (submission.images.length > 0) {
          setOpenPromptSourceImages(submission.images.slice(0, 3).map(img => ({
            base64: img.base64,
            mimeType: img.mimeType,
            preview: img.preview,
          })))
        }
        setMode('open-prompt')
        // Auto-trigger scene planning if there's a prompt
        if (videoPrompt) {
          oracleAutoGenRef.current = true
        }
        return
      }

      // ── KS mode: full Oracle pipeline ──

      // Fast path: image attached → upload workflow
      if (submission.images.length > 0) {
        handleOracleAction({
          workflow: 'upload',
          prefilledData: { prompt: submission.text.trim() },
          _image: submission.images[0] ?? undefined,
        })
        return
      }

      // Haiku router: classify intent before deciding Sonnet vs direct workflow
      try {
        const routeRes = await fetch('/api/creative-studio/oracle-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: submission.text,
            mode: 'ks',
            hasImage: false,
          }),
        })
        const routeData = await routeRes.json()

        // If Haiku classified a clear workflow (not conversation), route directly
        if (routeRes.ok && routeData.workflow && routeData.workflow !== 'conversation') {
          handleOracleAction({
            workflow: routeData.workflow,
            prefilledData: {
              productUrl: routeData.productUrl || undefined,
              prompt: routeData.prompt || submission.text.trim(),
              format: routeData.format,
            },
            _image: submission.images[0] ?? undefined,
          })
          return
        }
      } catch {
        // Haiku failed — fall through to Sonnet conversation
      }

      // Sonnet conversation (Haiku returned 'conversation' or failed)
      const userMsg = makeOracleMsg('user', submission.text)
      setOracleMessages([userMsg])
      setOracleMode('chat')
      setOracleSending(true)
      try {
        const chatRes = await fetch('/api/creative-studio/oracle-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: submission.text }],
            context: { mode: 'ks' },
          }),
        })
        let chatData: OracleChatResponse = await chatRes.json()
        if (!chatRes.ok) throw new Error(chatData.message || 'Chat failed')

        // Client-side rescue: re-parse message if it looks like full JSON response
        if (!chatData.toolRequest && !chatData.action && !chatData.escalate && !chatData.mediaRequest && chatData.message) {
          try {
            const msgText = chatData.message.trim()
            if (msgText.startsWith('{') && msgText.endsWith('}')) {
              const reparsed = JSON.parse(msgText)
              if (reparsed.toolRequest || reparsed.action || reparsed.escalate || reparsed.options) {
                chatData = { ...chatData, ...reparsed }
              }
            }
          } catch { /* not JSON */ }
        }

        // Handle toolRequest — execute tool (BEFORE action/escalate checks)
        if (chatData.toolRequest) {
          if (chatData.message) {
            const toolMsgObj = makeOracleMsg('oracle', chatData.message, {
              tier: 'sonnet',
              options: chatData.options,
            })
            setOracleMessages(prev => [...prev, toolMsgObj])
          }
          await handleToolExecution(chatData.toolRequest, 'sonnet')
          setOracleSending(false)
          return
        }

        // Handle mediaRequest — show upload/library buttons
        if (chatData.mediaRequest) {
          const mediaMsgObj = makeOracleMsg('oracle', chatData.message, {
            tier: 'sonnet',
            options: chatData.options,
            mediaRequest: chatData.mediaRequest,
          })
          setOracleMessages(prev => [...prev, mediaMsgObj])
          setOracleSending(false)
          return
        }

        // If Sonnet detected a URL, analyze it — but skip if also routing to a workflow
        // (the workflow's auto-analyze useEffect will handle it, avoiding double analysis)
        if (chatData.analyzeUrl && !chatData.action) {
          setOracleResearching(true)
          try {
            const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: chatData.analyzeUrl }),
            })
            if (urlRes.ok) {
              const urlData = await urlRes.json()
              setOracleContext(prev => ({ ...prev, productInfo: stripBase64ForContext(urlData.product || urlData), productImages: urlData.productImages }))
              if (!chatData.contextCards) chatData.contextCards = []
              chatData.contextCards.push({ type: 'product', data: urlData })
            }
          } catch { /* product analysis is best-effort */ } finally {
            setOracleResearching(false)
          }
        }

        // Tag options that would escalate to Opus
        const taggedOptions = chatData.options?.map(opt => ({
          ...opt,
          escalates: chatData.escalate === 'creative' || /brainstorm|creative|explore.*idea|opus/i.test(opt.value),
        }))

        const oracleMsg = makeOracleMsg('oracle', chatData.message, {
          tier: 'sonnet',
          options: taggedOptions,
          contextCards: chatData.contextCards,
        })
        setOracleMessages(prev => [...prev, oracleMsg])

        // If Sonnet already has an action, route or show prompt preview
        if (chatData.action) {
          const { workflow: actionWorkflow, prefilledData } = chatData.action
          // Generation workflows: show prompt preview card instead of auto-routing
          if ((actionWorkflow === 'open-prompt' || actionWorkflow === 'text-to-video') && prefilledData?.prompt) {
            const fmt = ((prefilledData.format as string) || (submission.mode === 'video' ? 'video' : 'image')) as 'image' | 'video'
            const previewMsg = makeOracleMsg('oracle', 'Here\'s what I\'ve got ready for you. Review the prompt and hit Generate when you\'re happy with it.', {
              tier: 'sonnet',
              promptPreview: { prompt: prefilledData.prompt as string, format: fmt, style: 'cinematic', duration: 8 },
            })
            setOracleMessages(prev => [...prev, previewMsg])
          } else {
            handleOracleAction(chatData.action)
          }
        }
      } catch (err) {
        console.error('Oracle chat error:', err)
        const errMsg = makeOracleMsg('oracle', 'Sorry, something went wrong. Try again or pick a shortcut below.', { tier: 'sonnet' })
        setOracleMessages(prev => [...prev, errMsg])
        setOracleMode('idle')
      } finally {
        setOracleSending(false)
      }
    } catch (err) {
      console.error('Oracle routing error:', err)
      // Fallback: go to create mode
      setMode('create')
    } finally {
      setOracleLoading(false)
    }
  }, [router, makeOracleMsg, handleOracleAction, handleToolExecution, stripBase64ForContext])

  // Oracle conversation — subsequent turns (user types or clicks option)
  // Internal variant: isToolResult=true skips adding user message bubble and sending indicator
  const handleOracleChatSendInternal = useCallback(async (userText: string, isToolResult?: boolean) => {
    if (!userText.trim()) return
    const userMsg = makeOracleMsg('user', userText)
    if (!isToolResult) {
      setOracleMessages(prev => [...prev, userMsg])
      setOracleSending(true)
    }

    // Build messages array from history — filter empty content and merge consecutive same-role msgs
    const currentMessages = isToolResult ? oracleMessages : [...oracleMessages, userMsg]
    const rawMapped = [...currentMessages, ...(isToolResult ? [userMsg] : [])]
      .filter(m => m.content && m.content.trim())
      .map(m => ({ role: m.role === 'oracle' ? 'assistant' as const : 'user' as const, content: m.content }))
    // Merge consecutive same-role messages (Anthropic API requires alternating roles)
    const allMessages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const msg of rawMapped) {
      if (allMessages.length > 0 && allMessages[allMessages.length - 1].role === msg.role) {
        allMessages[allMessages.length - 1].content += '\n' + msg.content
      } else {
        allMessages.push({ ...msg })
      }
    }

    try {
      const endpoint = oracleMode === 'creative'
        ? '/api/creative-studio/oracle-creative'
        : '/api/creative-studio/oracle-chat'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          context: oracleContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')

      // Handle Sonnet response
      if (oracleMode === 'chat') {
        let chatData = data as OracleChatResponse

        // Client-side rescue: if server parser failed and entire JSON ended up in message,
        // try re-parsing the message to extract structured fields
        if (!chatData.toolRequest && !chatData.action && !chatData.escalate && !chatData.mediaRequest && chatData.message) {
          try {
            const msgText = chatData.message.trim()
            if (msgText.startsWith('{') && msgText.endsWith('}')) {
              const reparsed = JSON.parse(msgText)
              if (reparsed.toolRequest || reparsed.action || reparsed.escalate || reparsed.options) {
                chatData = { ...chatData, ...reparsed }
              }
            }
          } catch { /* not JSON, continue normally */ }
        }

        // Handle toolRequest — execute tool (BEFORE action/escalate checks)
        if (chatData.toolRequest) {
          if (chatData.message) {
            const toolMsgObj = makeOracleMsg('oracle', chatData.message, {
              tier: 'sonnet',
              options: chatData.options,
            })
            setOracleMessages(prev => [...prev, toolMsgObj])
          }
          await handleToolExecution(chatData.toolRequest, 'sonnet')
          setOracleSending(false)
          return
        }

        // Handle mediaRequest — show upload/library buttons
        if (chatData.mediaRequest) {
          const mediaMsgObj = makeOracleMsg('oracle', chatData.message, {
            tier: 'sonnet',
            options: chatData.options,
            mediaRequest: chatData.mediaRequest,
          })
          setOracleMessages(prev => [...prev, mediaMsgObj])
          setOracleSending(false)
          return
        }

        // URL analysis — skip if also routing to a workflow (auto-analyze handles it)
        if (chatData.analyzeUrl && !chatData.action) {
          setOracleResearching(true)
          try {
            const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: chatData.analyzeUrl }),
            })
            if (urlRes.ok) {
              const urlData = await urlRes.json()
              setOracleContext(prev => ({ ...prev, productInfo: stripBase64ForContext(urlData.product || urlData), productImages: urlData.productImages }))
              if (!chatData.contextCards) chatData.contextCards = []
              chatData.contextCards.push({ type: 'product', data: urlData })
            }
          } catch { /* best-effort */ } finally {
            setOracleResearching(false)
          }
        }

        // Tag options that would escalate to Opus
        const taggedOptions = chatData.options?.map(opt => ({
          ...opt,
          escalates: chatData.escalate === 'creative' || /brainstorm|creative|explore.*idea|opus/i.test(opt.value),
        }))

        const oracleMsg = makeOracleMsg('oracle', chatData.message, {
          tier: 'sonnet',
          options: taggedOptions,
          contextCards: chatData.contextCards,
        })
        setOracleMessages(prev => [...prev, oracleMsg])

        // Escalate to creative mode
        if (chatData.escalate === 'creative') {
          const escMsg = makeOracleMsg('oracle', '', { isEscalating: true })
          setOracleMessages(prev => [...prev, escMsg])
          setOracleContext(prev => ({
            ...prev,
            priorConversation: allMessages,
          }))
          setOracleMode('creative')
          oracleHighestTierRef.current = 'opus'
          // Send opening turn to Opus
          try {
            const opusRes = await fetch('/api/creative-studio/oracle-creative', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: 'Start brainstorming based on the conversation so far.' }],
                context: { ...oracleContext, priorConversation: allMessages },
              }),
            })
            const opusData: OracleCreativeResponse = await opusRes.json()
            if (opusRes.ok) {
              // If Opus returns an action (e.g. text-to-video handoff), route immediately
              if (opusData.action) {
                const opusMsgObj = makeOracleMsg('oracle', opusData.message, { tier: 'opus', options: opusData.options })
                setOracleMessages(prev => [...prev, opusMsgObj])
                handleOracleAction(opusData.action)
              }
              // If Opus wants URL analysis on first turn, suppress its response and re-call with real data
              else if (opusData.analyzeUrl) {
                setOracleResearching(true)
                try {
                  const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: opusData.analyzeUrl }),
                  })
                  if (urlRes.ok) {
                    const urlData = await urlRes.json()
                    const escalationContext = { ...oracleContext, priorConversation: allMessages, productInfo: stripBase64ForContext(urlData.product || urlData), productImages: urlData.productImages }
                    setOracleContext(escalationContext)

                    // Show product card
                    const productCardMsg = makeOracleMsg('oracle', '', {
                      tier: 'opus',
                      contextCards: [{ type: 'product', data: urlData }],
                    })
                    setOracleMessages(prev => [...prev, productCardMsg])

                    // Re-call Opus with real product data
                    const retryRes = await fetch('/api/creative-studio/oracle-creative', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        messages: [{ role: 'user', content: 'Start brainstorming based on the conversation so far and the product info.' }],
                        context: escalationContext,
                      }),
                    })
                    if (retryRes.ok) {
                      const retryData: OracleCreativeResponse = await retryRes.json()
                      if (retryData.action) {
                        const opusMsgObj = makeOracleMsg('oracle', retryData.message, { tier: 'opus', options: retryData.options })
                        setOracleMessages(prev => [...prev, opusMsgObj])
                        handleOracleAction(retryData.action)
                      } else {
                        const opusMsgObj = makeOracleMsg('oracle', retryData.message, {
                          tier: 'opus',
                          options: retryData.options,
                          promptPreview: retryData.generatedPrompt || undefined,
                        })
                        setOracleMessages(prev => [...prev, opusMsgObj])
                      }
                    }
                  }
                } catch { /* best-effort */ } finally {
                  setOracleResearching(false)
                }
              } else {
                const opusMsgObj = makeOracleMsg('oracle', opusData.message, {
                  tier: 'opus',
                  options: opusData.options,
                  contextCards: opusData.contextCards,
                  promptPreview: opusData.generatedPrompt || undefined,
                })
                setOracleMessages(prev => [...prev, opusMsgObj])
              }
            }
          } catch { /* Opus escalation best-effort */ }
        }

        // Route to workflow — but show prompt preview for generation workflows
        if (chatData.action) {
          const { workflow, prefilledData } = chatData.action
          if ((workflow === 'open-prompt' || workflow === 'text-to-video') && prefilledData?.prompt) {
            const fmt = ((prefilledData.format as string) || 'image') as 'image' | 'video'
            const previewMsg = makeOracleMsg('oracle', 'Here\'s what I\'ve got ready for you. Review the prompt and hit Generate when you\'re happy with it.', {
              tier: 'sonnet',
              promptPreview: { prompt: prefilledData.prompt as string, format: fmt, style: 'cinematic', duration: 8 },
            })
            setOracleMessages(prev => [...prev, previewMsg])
          } else {
            handleOracleAction(chatData.action)
          }
        }
      }
      // Handle Opus response
      else if (oracleMode === 'creative') {
        let creativeData = data as OracleCreativeResponse

        // Client-side rescue: re-parse message if it looks like full JSON response
        if (!creativeData.toolRequest && !creativeData.action && !creativeData.analyzeUrl && creativeData.message) {
          try {
            const msgText = creativeData.message.trim()
            if (msgText.startsWith('{') && msgText.endsWith('}')) {
              const reparsed = JSON.parse(msgText)
              if (reparsed.toolRequest || reparsed.action || reparsed.options) {
                creativeData = { ...creativeData, ...reparsed }
              }
            }
          } catch { /* not JSON */ }
        }

        // Handle toolRequest — execute tool (BEFORE action/analyzeUrl checks)
        if (creativeData.toolRequest) {
          if (creativeData.message) {
            const toolMsgObj = makeOracleMsg('oracle', creativeData.message, {
              tier: 'opus',
              options: creativeData.options,
            })
            setOracleMessages(prev => [...prev, toolMsgObj])
          }
          await handleToolExecution(creativeData.toolRequest, 'opus')
          setOracleSending(false)
          return
        }

        // Handle mediaRequest — show upload/library buttons
        if (creativeData.mediaRequest) {
          const mediaMsgObj = makeOracleMsg('oracle', creativeData.message, {
            tier: 'opus',
            options: creativeData.options,
            mediaRequest: creativeData.mediaRequest,
          })
          setOracleMessages(prev => [...prev, mediaMsgObj])
          setOracleSending(false)
          return
        }

        // Handle action — route to workflow (e.g. text-to-video with crafted prompt)
        if (creativeData.action) {
          const opusMsg = makeOracleMsg('oracle', creativeData.message, {
            tier: 'opus',
            options: creativeData.options,
          })
          setOracleMessages(prev => [...prev, opusMsg])
          handleOracleAction(creativeData.action)
          setOracleSending(false)
          return
        }

        // If Opus wants URL analysis, suppress its fabricated response — run the real
        // analysis first (same endpoint as Step 1 Product→Ad), then re-call Opus with real data
        if (creativeData.analyzeUrl) {
          setOracleResearching(true)
          try {
            const urlRes = await fetch('/api/creative-studio/analyze-product-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: creativeData.analyzeUrl }),
            })
            if (urlRes.ok) {
              const urlData = await urlRes.json()
              const updatedContext = { ...oracleContext, productInfo: stripBase64ForContext(urlData.product || urlData), productImages: urlData.productImages }
              setOracleContext(updatedContext)

              // Show product card immediately
              const productCardMsg = makeOracleMsg('oracle', '', {
                tier: 'opus',
                contextCards: [{ type: 'product', data: urlData }],
              })
              setOracleMessages(prev => [...prev, productCardMsg])

              // Re-call Opus with real product data — it will give an informed response
              const retryMessages = [...allMessages, { role: 'assistant' as const, content: 'Let me look into this product first.' }]
              // Merge consecutive same-role
              const cleanRetry: { role: 'user' | 'assistant'; content: string }[] = []
              for (const msg of retryMessages) {
                if (cleanRetry.length > 0 && cleanRetry[cleanRetry.length - 1].role === msg.role) {
                  cleanRetry[cleanRetry.length - 1].content += '\n' + msg.content
                } else {
                  cleanRetry.push({ ...msg })
                }
              }

              const retryRes = await fetch('/api/creative-studio/oracle-creative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: cleanRetry, context: updatedContext }),
              })
              if (retryRes.ok) {
                const retryData: OracleCreativeResponse = await retryRes.json()
                if (retryData.action) {
                  const opusMsg = makeOracleMsg('oracle', retryData.message, { tier: 'opus', options: retryData.options })
                  setOracleMessages(prev => [...prev, opusMsg])
                  handleOracleAction(retryData.action)
                } else {
                  const opusMsg = makeOracleMsg('oracle', retryData.message, {
                    tier: 'opus',
                    options: retryData.options,
                    promptPreview: retryData.generatedPrompt || undefined,
                  })
                  setOracleMessages(prev => [...prev, opusMsg])
                }
              }
            }
          } catch { /* best-effort */ } finally {
            setOracleResearching(false)
          }
        } else {
          // No URL analysis needed — show Opus response directly
          const opusMsg = makeOracleMsg('oracle', creativeData.message, {
            tier: 'opus',
            options: creativeData.options,
            contextCards: creativeData.contextCards,
            promptPreview: creativeData.generatedPrompt || undefined,
          })
          setOracleMessages(prev => [...prev, opusMsg])
        }
      }
    } catch (err) {
      console.error('Oracle chat error:', err)
      const errMsg = makeOracleMsg('oracle', 'Something went wrong. Try again?', {
        tier: oracleMode === 'creative' ? 'opus' : 'sonnet',
        options: [{ label: 'Try Again', value: '__retry' }, { label: 'Start Over', value: '__reset' }],
      })
      setOracleMessages(prev => [...prev, errMsg])
    } finally {
      setOracleSending(false)
    }
  }, [oracleMessages, oracleMode, oracleContext, makeOracleMsg, handleOracleAction, handleToolExecution])

  // Public wrapper — always shows user message bubble
  const handleOracleChatSend = useCallback(async (userText: string) => {
    oracleChainDepthRef.current = 0 // Reset chain depth on user message
    return handleOracleChatSendInternal(userText, false)
  }, [handleOracleChatSendInternal])

  // Keep ref in sync so tool chaining can call back without circular deps
  useEffect(() => {
    oracleChatSendRef.current = handleOracleChatSendInternal
  }, [handleOracleChatSendInternal])

  const handleOracleOptionClick = useCallback((option: OracleOption) => {
    if (option.value === '__reset') {
      // Complete session before resetting
      if (oracleSessionId && user?.id) {
        fetch('/api/creative-studio/oracle-session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: oracleSessionId, userId: user.id, status: 'complete' }),
        })
      }
      sessionStorage.removeItem('ks_active_oracle_session')
      setOracleSessionId(null)
      setOracleGeneratedAssets([])
      setOracleMode('idle')
      setOracleMessages([])
      setOracleContext({})
      return
    }
    if (option.value === '__retry') {
      // Remove last oracle message and resend
      setOracleMessages(prev => prev.slice(0, -1))
      return
    }
    handleOracleChatSend(option.label)
  }, [handleOracleChatSend, oracleSessionId, user?.id])

  const handleOraclePromptAction = useCallback((action: 'generate' | 'edit' | 'startOver', prompt?: string, format?: string) => {
    if (action === 'startOver') {
      setOracleMode('idle')
      setOracleMessages([])
      setOracleContext({})
      return
    }
    if (!prompt) return
    setOpenPromptText(prompt)
    setOpenPromptMediaType((format as 'image' | 'video') || 'image')
    setOracleMode('idle')
    setOracleMessages([])
    setOracleContext({})
    if (action === 'generate') {
      oracleAutoGenRef.current = true
    }
    setMode('open-prompt')
  }, [])

  // ── Oracle Session Persistence (debounced auto-save) ──
  const saveOracleSession = useCallback(async () => {
    if (!user?.id || !currentAccountId || oracleMessages.length < 2) return

    // Strip large base64 data before persisting
    const cleanMessages = oracleMessages.map(m => ({
      ...m,
      contextCards: m.contextCards?.map(c => {
        if (c.type === 'image-result' && c.data.imageBase64) {
          return { ...c, data: { ...c.data, imageBase64: undefined } }
        }
        return c
      }),
    }))

    const title = (oracleContext.productInfo as Record<string, unknown>)?.name as string | undefined
      || oracleMessages.find(m => m.role === 'user')?.content?.slice(0, 50)
      || 'Chat'

    const highestTier = oracleHighestTierRef.current

    try {
      if (oracleSessionId) {
        await fetch('/api/creative-studio/oracle-session', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: oracleSessionId,
            userId: user.id,
            messages: cleanMessages,
            context: oracleContext,
            generatedAssets: oracleGeneratedAssets,
            highestTier,
          }),
        })
      } else {
        const res = await fetch('/api/creative-studio/oracle-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            title,
            messages: cleanMessages,
            context: oracleContext,
            highestTier,
          }),
        })
        const data = await res.json()
        if (data.sessionId) setOracleSessionId(data.sessionId)
      }
    } catch (err) {
      console.error('Oracle session save error:', err)
    }
  }, [user?.id, currentAccountId, oracleMessages, oracleContext, oracleMode, oracleSessionId, oracleGeneratedAssets])

  // Debounced save — triggers 2s after last message change
  useEffect(() => {
    if (oracleMessages.length < 2) return
    if (saveSessionTimeoutRef.current) clearTimeout(saveSessionTimeoutRef.current)
    saveSessionTimeoutRef.current = setTimeout(() => {
      saveOracleSession()
    }, 2000)
    return () => {
      if (saveSessionTimeoutRef.current) clearTimeout(saveSessionTimeoutRef.current)
    }
  }, [oracleMessages.length, saveOracleSession])

  // Keep ref in sync so navigateFromOracle can call saveOracleSession without circular deps
  useEffect(() => {
    saveOracleSessionRef.current = saveOracleSession
  }, [saveOracleSession])

  // Oracle chip action — handle different chip types
  const handleOracleChipAction = useCallback((action: ChipDef['action']) => {
    switch (action.type) {
      case 'focus':
        setOraclePlaceholder(action.placeholder)
        setOraclePreloadMode(action.mode)
        // Focus the Oracle textarea
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-oracle-input]')
          textarea?.focus()
        }, 50)
        break

      case 'workflow':
        // Jump directly to the workflow
        if (action.workflow === 'clone') setMode('clone')
        else if (action.workflow === 'inspiration') setMode('inspiration')
        else if (action.workflow === 'create') setMode('create')
        else if (action.workflow === 'upload') setMode('upload')
        else if (action.workflow === 'url-to-video') router.push('/dashboard/creative-studio/video-studio')
        else if (action.workflow === 'ugc-video') router.push('/dashboard/creative-studio/video-studio?mode=ugc')
        break

      case 'attach':
        setOraclePreloadMode(action.mode)
        // Open the OracleBox attach menu (Upload / Media Library)
        setOracleOpenAttach(true)
        break

      case 'switch-mode':
        // Switch to a different mode and focus textarea
        setOraclePreloadMode(action.mode)
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-oracle-input]')
          textarea?.focus()
        }, 50)
        break
    }
  }, [router])

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
    // Reset pill state
    setPools({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
    setSelected({ name: [], description: [], features: [], benefits: [], keyMessages: [], testimonials: [], painPoints: [] })
    setExtraContext({ targetAudience: '', category: '', uniqueSellingPoint: '' })
    setHasAnalyzed(false)
    rawAnalysisRef.current = null
    restoredSessionRef.current = false
    // Reset open prompt state
    setOpenPromptText('')
    setOpenPromptMediaType('image')
    setOpenPromptSourceImages([])
    setOpenPromptAspectRatio('9:16')
    setOpenPromptQuality('standard')
    setOpenPromptGenerating(false)
    setOpenPromptError(null)
    setOpenPromptResult(null)
    setOpenPromptScenePlan(null)
    setOpenPromptPlanningScene(false)
    setOpenPromptOverlaysEnabled(true)
    setOpenPromptSessionId(null)
    setOpenPromptCanvasId(null)
    setOpenPromptVideoJob(null)
    setOpenPromptExtending(false)
    setOpenPromptAdjustText('')
    setOpenPromptAdjusting(false)
    setOpenPromptSaving(false)
    setOpenPromptSaved(false)
    setOpenPromptShowImageMenu(false)
    setOpenPromptShowLibrary(false)
    setOpenPromptDownloadingLibrary(false)
    // Reset Oracle preload state
    setOraclePreloadImage(null)
    setOraclePreloadMode(undefined)
    setOraclePlaceholder(undefined)
    setOracleInputMode('ks')
    // Reset create mode ProductInput state
    setCreateMediaLibraryOpen(false)
    setCreateImageFromLibrary(null)
    handleClearCompany()
    // Strip ?sessionId= from URL on reset
    router.replace('/dashboard/creative-studio/ad-studio', { scroll: false })
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


  // ── Open Prompt ──────────────────────────────────────────────────────────────

  const openPromptCreditCost = useMemo(() => {
    if (openPromptMediaType === 'image') return 5
    // For video, cost depends on scene plan (determined by AI)
    if (!openPromptScenePlan) return 0 // Script writing is free
    const dur = openPromptScenePlan.estimatedDuration || 8
    const extensions = dur > 8 ? Math.ceil((dur - 8) / 7) : 0
    const costs = openPromptQuality === 'standard' ? { base: 20, ext: 10 } : { base: 50, ext: 25 }
    return costs.base + (extensions * costs.ext)
  }, [openPromptMediaType, openPromptScenePlan, openPromptQuality])

  const handleOpenPromptImageUpload = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, { base64, mimeType: file.type, preview: URL.createObjectURL(file) }])
    }
    reader.readAsDataURL(file)
  }, [])

  const handleOpenPromptGenerate = useCallback(async () => {
    if (!openPromptText.trim() || !user?.id || !currentAccountId) return

    setOpenPromptGenerating(true)
    setOpenPromptError(null)
    setOpenPromptResult(null)

    try {
      if (openPromptMediaType === 'image') {
        // 1. Create session for AI Tasks persistence
        const sessionRes = await fetch('/api/creative-studio/ad-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: null,
            productInfo: { name: 'Open Prompt' },
            competitorCompany: null,
            competitorAd: null,
            generatedAds: [{ headline: '', primaryText: openPromptText, description: '', angle: 'Open Prompt', whyItWorks: '' }],
            imageStyle: 'open-prompt',
          }),
        })
        const sessionData = await sessionRes.json()
        const newSessionId = sessionData.session?.id || null
        if (newSessionId) setOpenPromptSessionId(newSessionId)

        // 2. Generate image
        const requestBody: Record<string, unknown> = {
          userId: user.id,
          adCopy: { headline: '', primaryText: openPromptText, description: '', angle: 'Open Prompt' },
          product: openPromptSourceImages.length > 0
            ? { name: 'Open Prompt', imageBase64: openPromptSourceImages[0].base64, imageMimeType: openPromptSourceImages[0].mimeType }
            : { name: 'Open Prompt' },
          style: 'lifestyle',
          aspectRatio: openPromptAspectRatio,
          imagePrompt: openPromptText,
          noTextOverlay: true,
        }

        const res = await fetch('/api/creative-studio/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        const data = await res.json()

        if (!res.ok) {
          if (res.status === 429 && data.totalAvailable) {
            setAiUsage({ used: data.used, planLimit: data.totalAvailable, purchased: 0, totalAvailable: data.totalAvailable, remaining: data.remaining || 0, status: data.status })
          }
          throw new Error(data.error || 'Failed to generate image')
        }

        // 3. Optimistic credit update
        setAiUsage(prev => prev ? { ...prev, used: prev.used + 5, remaining: Math.max(0, prev.remaining - 5) } : prev)
        notifyCreditsChanged()

        // 4. Upload to Supabase Storage for persistence
        const saveRes = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: data.image.base64,
            mimeType: data.image.mimeType,
            adAccountId: currentAccountId,
            name: `Open Prompt - ${new Date().toLocaleDateString()}`,
            userId: user.id,
            saveToLibrary: false,
          }),
        })
        const saveData = await saveRes.json()

        const newImage: GeneratedImage = {
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          storageUrl: saveData.storageUrl,
          mediaHash: saveData.mediaHash,
        }

        // Save to session
        if (newSessionId && saveData.storageUrl) {
          try {
            await fetch('/api/creative-studio/ad-session', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                sessionId: newSessionId,
                generatedImages: [{ adIndex: 0, versionIndex: 0, storageUrl: saveData.storageUrl, mediaHash: saveData.mediaHash, mimeType: data.image.mimeType }],
              }),
            })
          } catch {} // Non-critical
        }

        setOpenPromptResult({ type: 'image', image: newImage })
        setMode('open-prompt')
      } else {
        // Video: Stage 1 — call scene planner (no video generation yet)
        setOpenPromptPlanningScene(true)
        setOpenPromptScenePlan(null)

        const res = await fetch('/api/creative-studio/plan-scene', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: openPromptText,
            hasSourceImage: openPromptSourceImages.length > 0,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to plan scene')

        setOpenPromptScenePlan(data)
        setMode('open-prompt') // Flip to step 2 view — shows Director's Review
        setOpenPromptPlanningScene(false)
      }
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setOpenPromptGenerating(false)
    }
  }, [openPromptText, openPromptMediaType, openPromptSourceImages, openPromptAspectRatio, openPromptQuality, openPromptCreditCost, user?.id, currentAccountId])

  // Auto-trigger generation when Oracle routes to open-prompt
  useEffect(() => {
    if (mode === 'open-prompt' && oracleAutoGenRef.current && openPromptText.trim() && !openPromptGenerating && !openPromptResult && !openPromptPlanningScene) {
      oracleAutoGenRef.current = false
      handleOpenPromptGenerate()
    }
  }, [mode, openPromptText, openPromptGenerating, openPromptResult, openPromptPlanningScene, handleOpenPromptGenerate])

  // Open Prompt: Stage 2 — Director approved, generate video with structured prompts
  const handleOpenPromptVideoGenerate = useCallback(async () => {
    if (!openPromptScenePlan || !user?.id || !currentAccountId) return

    setOpenPromptGenerating(true)
    setOpenPromptError(null)

    try {
      const scriptDuration = openPromptScenePlan.estimatedDuration || 8
      const isExtended = scriptDuration > 8
      const provider = isExtended ? 'veo-ext' : 'veo'
      const numExtensions = isExtended ? Math.round((scriptDuration - 8) / 7) : 0
      const costs = openPromptQuality === 'standard' ? { base: 20, ext: 10 } : { base: 50, ext: 25 }
      const creditCost = costs.base + numExtensions * costs.ext

      // 1. Create canvas for AI Tasks persistence
      let canvasId = openPromptCanvasId
      if (!canvasId) {
        const canvasRes = await fetch('/api/creative-studio/video-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: currentAccountId,
            productUrl: null,
            productKnowledge: { name: 'Open Prompt' },
            concepts: [{
              title: 'Open Prompt',
              angle: 'Open Prompt',
              logline: openPromptText.slice(0, 80),
              visualMetaphor: `AI-directed scene — ${openPromptScenePlan.scene}`,
              whyItWorks: 'Direct prompt generation with AI scene planning',
              videoPrompt: openPromptScenePlan.videoPrompt,
              extensionPrompts: openPromptScenePlan.extensionPrompts || [],
              estimatedDuration: openPromptScenePlan.estimatedDuration || 8,
              overlay: openPromptScenePlan.overlay
                ? { hook: openPromptScenePlan.overlay.hook, captions: [], cta: openPromptScenePlan.overlay.cta }
                : { hook: '', captions: [], cta: '' },
              // Store full scene plan for session restoration from AI Tasks
              scenePlan: openPromptScenePlan,
              originalPrompt: openPromptText,
              // Persist source image for session restoration
              ...(openPromptSourceImages.length > 0 ? { sourceImage: { base64: openPromptSourceImages[0].base64, mimeType: openPromptSourceImages[0].mimeType } } : {}),
            }],
          }),
        })
        const canvasData = await canvasRes.json()
        if (canvasRes.ok && canvasData.canvas?.id) {
          canvasId = canvasData.canvas.id
          setOpenPromptCanvasId(canvasId)
        }
      }

      // 2. Build overlay config from scene plan (only if overlays enabled)
      const baseDuration = isExtended ? 8 : scriptDuration
      const overlayConfig = openPromptOverlaysEnabled && openPromptScenePlan.overlay ? {
        style: 'clean' as const,
        hook: {
          line1: openPromptScenePlan.overlay.hook,
          startSec: 0, endSec: 2, animation: 'fade' as const,
          fontSize: 48, fontWeight: 700, position: 'top' as const,
        },
        cta: {
          buttonText: openPromptScenePlan.overlay.cta,
          startSec: Math.max(baseDuration - 2, baseDuration * 0.8),
          animation: 'slide' as const, fontSize: 28,
        },
      } : undefined

      // 3. Build prompt from structured fields
      const promptParts: string[] = []
      if (openPromptScenePlan.scene) promptParts.push(openPromptScenePlan.scene + '.')
      if (openPromptScenePlan.subject) promptParts.push(openPromptScenePlan.subject + '.')
      if (openPromptScenePlan.action) promptParts.push(openPromptScenePlan.action)
      if (openPromptScenePlan.cameraDirection) promptParts.push(openPromptScenePlan.cameraDirection + '.')
      if (openPromptScenePlan.dialogue?.trim()) promptParts.push(`The person speaks: "${openPromptScenePlan.dialogue.trim()}"`)
      promptParts.push('Vertical 9:16 portrait format.')
      const finalPrompt = promptParts.join(' ')

      // Build extension prompt from structured fields
      let extensionPrompts: string[] | undefined
      if (isExtended) {
        const extParts: string[] = []
        if (openPromptScenePlan.extensionAction) extParts.push(openPromptScenePlan.extensionAction)
        if (openPromptScenePlan.extensionDialogue?.trim()) extParts.push(`The person speaks: "${openPromptScenePlan.extensionDialogue.trim()}"`)
        if (extParts.length > 0) {
          const extPrompt = extParts.join(' ')
          extensionPrompts = [extPrompt.startsWith('Continue from previous shot') ? extPrompt : `Continue from previous shot. ${extPrompt}`]
        } else if (openPromptScenePlan.extensionPrompts?.length) {
          extensionPrompts = openPromptScenePlan.extensionPrompts
        }
      }

      // 4. Call generate-video with structured prompts
      const videoBody: Record<string, unknown> = {
        userId: user.id,
        adAccountId: currentAccountId,
        prompt: finalPrompt,
        dialogue: openPromptScenePlan.dialogue?.trim() || undefined,
        videoStyle: 'open-prompt',
        durationSeconds: scriptDuration,
        productName: 'Open Prompt',
        provider,
        quality: openPromptQuality,
        canvasId: canvasId || null,
        adIndex: 0,
        targetDurationSeconds: isExtended ? scriptDuration : undefined,
        extensionPrompts,
        overlayConfig,
      }
      if (openPromptSourceImages.length > 0) {
        ;(videoBody as any).productImages = openPromptSourceImages.map(img => ({ base64: img.base64, mimeType: img.mimeType }))
      }

      const res = await fetch('/api/creative-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoBody),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429) {
          setAiUsage(prev => prev ? { ...prev, remaining: data.remaining || 0 } : prev)
        }
        throw new Error(data.error || 'Failed to generate video')
      }

      // 4. Optimistic credit update
      setAiUsage(prev => prev ? { ...prev, used: prev.used + creditCost, remaining: Math.max(0, prev.remaining - creditCost) } : prev)
      notifyCreditsChanged()
      setOpenPromptResult({ type: 'video', jobId: data.jobId || data.id })
      setOpenPromptVideoJob({ id: data.jobId || data.id, status: 'queued' as const } as VideoJob)
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setOpenPromptGenerating(false)
    }
  }, [openPromptScenePlan, openPromptQuality, openPromptOverlaysEnabled, openPromptSourceImages, openPromptText, openPromptCanvasId, user?.id, currentAccountId])

  // Open Prompt: Extend video +7s
  const handleOpenPromptExtend = useCallback(async () => {
    if (!openPromptVideoJob || openPromptVideoJob.status !== 'complete' || !user?.id) return
    setOpenPromptExtending(true)
    try {
      const res = await fetch('/api/creative-studio/video-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: openPromptVideoJob.id, userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extension failed')
      // Update job to extending state so polling picks it up
      setOpenPromptVideoJob(prev => prev ? { ...prev, status: 'extending' as const, extension_step: data.extension_step, extension_total: data.extension_total, target_duration_seconds: data.target_duration_seconds } : prev)
      // Optimistic credit update (25 per extension)
      setAiUsage(prev => prev ? { ...prev, used: prev.used + 25, remaining: Math.max(0, prev.remaining - 25) } : prev)
      notifyCreditsChanged()
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Extension failed')
    } finally {
      setOpenPromptExtending(false)
    }
  }, [openPromptVideoJob, user?.id])

  // Open Prompt: Adjust image with refinement prompt
  const handleOpenPromptAdjust = useCallback(async () => {
    if (!openPromptAdjustText.trim() || !openPromptResult || openPromptResult.type !== 'image' || !openPromptResult.image.base64) return

    setOpenPromptAdjusting(true)
    setOpenPromptError(null)

    try {
      const res = await fetch('/api/creative-studio/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: openPromptResult.image.base64,
          imageMimeType: openPromptResult.image.mimeType,
          adjustmentPrompt: openPromptAdjustText,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')

      setAiUsage(prev => prev ? { ...prev, used: prev.used + 5, remaining: Math.max(0, prev.remaining - 5) } : prev)
      notifyCreditsChanged()

      // Upload adjusted image for persistence
      const saveRes = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: data.image.base64,
          mimeType: data.image.mimeType,
          adAccountId: currentAccountId,
          name: `Open Prompt Adjusted - ${new Date().toLocaleDateString()}`,
          userId: user?.id,
          saveToLibrary: false,
        }),
      })
      const saveData = await saveRes.json()

      setOpenPromptResult({
        type: 'image',
        image: { base64: data.image.base64, mimeType: data.image.mimeType, storageUrl: saveData.storageUrl, mediaHash: saveData.mediaHash },
      })
      setOpenPromptAdjustText('')
      setOpenPromptSaved(false)
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Adjustment failed')
    } finally {
      setOpenPromptAdjusting(false)
    }
  }, [openPromptAdjustText, openPromptResult, currentAccountId, user?.id])

  // Open Prompt: Save image to media library
  const handleOpenPromptSaveToLibrary = useCallback(async () => {
    if (!openPromptResult || openPromptResult.type !== 'image' || !openPromptResult.image.base64 || !currentAccountId || !user?.id) return

    setOpenPromptSaving(true)
    try {
      const res = await fetch('/api/creative-studio/save-generated-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: openPromptResult.image.base64,
          mimeType: openPromptResult.image.mimeType,
          adAccountId: currentAccountId,
          name: `Open Prompt - ${new Date().toLocaleDateString()}`,
          userId: user.id,
          saveToLibrary: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      setOpenPromptResult({
        type: 'image',
        image: { ...openPromptResult.image, mediaHash: data.mediaHash, storageUrl: data.storageUrl },
      })
      setOpenPromptSaved(true)
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Failed to save to library')
    } finally {
      setOpenPromptSaving(false)
    }
  }, [openPromptResult, currentAccountId, user?.id])

  // Open Prompt: Download image
  const handleOpenPromptDownload = useCallback(() => {
    if (!openPromptResult || openPromptResult.type !== 'image' || !openPromptResult.image.base64) return
    const link = document.createElement('a')
    link.href = `data:${openPromptResult.image.mimeType};base64,${openPromptResult.image.base64}`
    link.download = `open-prompt-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [openPromptResult])

  // Open Prompt: Create ad from image
  const handleOpenPromptCreateAd = useCallback(async () => {
    if (!openPromptResult || openPromptResult.type !== 'image' || !openPromptResult.image.base64 || !currentAccountId || !user?.id) return

    setCreatingAd(prev => ({ ...prev, [-1]: true }))
    try {
      let storageUrl = openPromptResult.image.storageUrl
      let imageHash = openPromptResult.image.mediaHash

      if (!imageHash) {
        const res = await fetch('/api/creative-studio/save-generated-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: openPromptResult.image.base64,
            mimeType: openPromptResult.image.mimeType,
            adAccountId: currentAccountId,
            name: `Open Prompt - ${new Date().toLocaleDateString()}`,
            userId: user.id,
            saveToLibrary: true,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save')
        storageUrl = data.storageUrl
        imageHash = data.mediaHash
      }

      const creative: Creative = {
        preview: storageUrl || '',
        type: 'image',
        uploaded: true,
        isFromLibrary: true,
        imageHash: imageHash || '',
      }
      setWizardCreatives([creative])
      setWizardCopy({ primaryText: openPromptText, headline: '', description: '' })
      setShowLaunchWizard(true)
    } catch (err) {
      setOpenPromptError(err instanceof Error ? err.message : 'Failed to create ad')
    } finally {
      setCreatingAd(prev => ({ ...prev, [-1]: false }))
    }
  }, [openPromptResult, currentAccountId, user?.id, openPromptText])

  // Open Prompt: Video job polling
  const openPromptPollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!openPromptVideoJob || !user?.id || !openPromptCanvasId) return
    if (openPromptVideoJob.status !== 'queued' && openPromptVideoJob.status !== 'generating' && openPromptVideoJob.status !== 'rendering' && openPromptVideoJob.status !== 'extending') return

    const poll = async () => {
      try {
        const res = await fetch('/api/creative-studio/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, adAccountId: currentAccountId, canvasId: openPromptCanvasId }),
        })
        if (res.ok) {
          const data = await res.json()
          const job = data.jobs?.[0]
          if (job) {
            setOpenPromptVideoJob(job)
            if (job.status === 'complete' || job.status === 'failed') {
              if (openPromptPollRef.current) { clearInterval(openPromptPollRef.current); openPromptPollRef.current = null }
            }
          }
        }
      } catch {} // Non-critical
    }

    poll() // Immediate first poll
    openPromptPollRef.current = setInterval(poll, 10000)
    return () => { if (openPromptPollRef.current) { clearInterval(openPromptPollRef.current); openPromptPollRef.current = null } }
  }, [openPromptVideoJob?.status, openPromptCanvasId, user?.id, currentAccountId]) // eslint-disable-line react-hooks/exhaustive-deps


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

  // Oracle landing page
  if (!mode) {
    return (
      <div className="relative min-h-screen pb-24 overflow-hidden">
        {/* Ambient gradient background — purple-centric Oracle glow */}
        <div
          className="pointer-events-none fixed inset-0 opacity-50"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 50% 20%, rgba(139,92,246,0.18) 0%, transparent 60%),
              radial-gradient(ellipse 50% 40% at 25% 50%, rgba(99,102,241,0.12) 0%, transparent 55%),
              radial-gradient(ellipse 50% 40% at 75% 50%, rgba(168,85,247,0.10) 0%, transparent 55%),
              radial-gradient(ellipse 80% 30% at 50% 80%, rgba(59,130,246,0.08) 0%, transparent 50%)
            `,
          }}
        />

        {/* Noise texture */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative z-10 px-4 lg:px-8 py-6">
          <div className="max-w-3xl mx-auto space-y-10">

            {/* Header */}
            <div className="text-center pt-6 lg:pt-12">
              <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-white">Ad Studio</h1>
              <p className="text-zinc-400 text-sm mt-1.5">Create ads and content with AI</p>
            </div>

            {/* Chat thread (visible in chat/creative modes) */}
            {oracleMode !== 'idle' && (
              <OracleChatThread
                messages={oracleMessages}
                currentTier={oracleMode === 'creative' ? 'opus' : 'sonnet'}
                onOptionClick={handleOracleOptionClick}
                onPromptAction={handleOraclePromptAction}
                isSending={oracleSending}
                isResearching={oracleResearching}
                onMediaUpload={handleOracleMediaUpload}
                onMediaLibrary={handleOracleMediaLibrary}
                onCreditConfirm={handleOracleCreditConfirm}
                onCreditCancel={handleOracleCreditCancel}
                onOpenInEditor={handleOracleOpenInEditor}
                onSaveCopy={handleOracleSaveCopy}
                onSaveImage={handleOracleSaveImage}
                onEditImage={handleOracleEditImage}
              />
            )}

            {/* Oracle Box with glow — always visible */}
            <div className="relative">
              {/* Glow behind the box */}
              <div className="absolute -inset-4 rounded-3xl bg-purple-500/[0.06] blur-2xl pointer-events-none" />
              <div className="relative">
                <OracleBox
                  onSubmit={oracleMode === 'idle' ? handleOracleSubmit : (s) => handleOracleChatSend(s.text)}
                  onDirectWorkflow={(workflow) => {
                    if (workflow === 'open-prompt-image') {
                      setOpenPromptMediaType('image')
                      setMode('open-prompt')
                    } else if (workflow === 'text-to-video') {
                      router.push('/dashboard/creative-studio/video-studio?mode=direct')
                    } else {
                      handleOracleAction({ workflow, prefilledData: {} })
                    }
                  }}
                  onOpenLibrary={() => setOpenPromptShowLibrary(true)}
                  isLoading={oracleLoading || oracleSending}
                  placeholder={oracleMode !== 'idle' ? 'Type or pick an option...' : oraclePlaceholder}
                  initialImage={oraclePreloadImage}
                  initialMode={oraclePreloadMode}
                  onModeChange={setOracleInputMode}
                  openAttachMenu={oracleOpenAttach}
                  onAttachMenuOpened={() => setOracleOpenAttach(false)}
                />
              </div>
            </div>

            {/* Chips + divider — only in idle mode */}
            {oracleMode === 'idle' && (
              <>
                {/* Divider */}
                <div className="flex items-center gap-4 px-1">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
                  <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-widest">or jump to</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700/50 to-transparent" />
                </div>

                {/* Suggestion Chips */}
                <OracleChips mode={oracleInputMode} onChipAction={handleOracleChipAction} />
              </>
            )}

            {/* Start over button in chat/creative modes */}
            {oracleMode !== 'idle' && (
              <button
                onClick={() => {
                  if (oracleSessionId && user?.id) {
                    fetch('/api/creative-studio/oracle-session', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId: oracleSessionId, userId: user.id, status: 'complete' }),
                    })
                  }
                  sessionStorage.removeItem('ks_active_oracle_session')
                  setOracleSessionId(null)
                  setOracleGeneratedAssets([])
                  setOracleMode('idle')
                  setOracleMessages([])
                  setOracleContext({})
                }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mx-auto block"
              >
                Start over
              </button>
            )}

          </div>
        </div>

        {/* Media Library Modal for OracleBox attach + open-prompt flows */}
        {openPromptShowLibrary && user?.id && currentAccountId && (
          <MediaLibraryModal
            isOpen={openPromptShowLibrary}
            onClose={() => setOpenPromptShowLibrary(false)}
            userId={user.id}
            adAccountId={currentAccountId}
            selectedItems={[]}
            onSelectionChange={async (items) => {
              setOpenPromptShowLibrary(false)
              if (items.length === 0) return
              const item = items[0]
              if (!('hash' in item)) return
              const mediaItem = item as MediaImage & { mediaType: 'image' }
              setOpenPromptDownloadingLibrary(true)
              try {
                const res = await fetch('/api/creative-studio/download-image', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: mediaItem.url }),
                })
                if (res.ok) {
                  const data = await res.json()
                  const img = {
                    base64: data.base64,
                    mimeType: data.mimeType || 'image/jpeg',
                    preview: mediaItem.url,
                  }
                  // Set both: OracleBox preview + open-prompt source
                  setOraclePreloadImage(img)
                  setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, img])
                }
              } catch {} finally {
                setOpenPromptDownloadingLibrary(false)
              }
            }}
            maxSelection={3}
            allowedTypes={['image']}
          />
        )}

        {/* Media Library Modal for Oracle media requests */}
        {oracleMediaLibraryOpen && user?.id && currentAccountId && (
          <MediaLibraryModal
            isOpen={oracleMediaLibraryOpen}
            onClose={() => setOracleMediaLibraryOpen(false)}
            userId={user.id}
            adAccountId={currentAccountId}
            selectedItems={[]}
            onSelectionChange={(items) => handleOracleMediaSelected(items as unknown as Array<Record<string, unknown>>)}
            maxSelection={1}
            allowedTypes={
              oracleMediaRequestType === 'image' ? ['image'] :
              oracleMediaRequestType === 'video' ? ['video'] :
              ['image', 'video']
            }
          />
        )}
      </div>
    )
  }

  // Open Prompt mode - show result
  if (mode === 'open-prompt') {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6">
          <div className="max-w-[1000px] mx-auto space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetToModeSelection}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-white">Open Prompt</h1>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-semibold rounded',
                  (openPromptResult?.type === 'video' || openPromptScenePlan)
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-blue-500/20 text-blue-400'
                )}>
                  {(openPromptResult?.type === 'video' || openPromptScenePlan) ? 'VIDEO' : 'IMAGE'}
                </span>
              </div>
              <p className="text-zinc-500 mt-1 ml-7 text-sm italic truncate">&ldquo;{openPromptText}&rdquo;</p>
              {openPromptCreditCost > 0 && (
                <div className="text-xs text-zinc-600 mt-1 ml-7">{openPromptCreditCost} credits</div>
              )}
            </div>

            {/* Source Images (up to 3) */}
            {openPromptSourceImages.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {openPromptSourceImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img src={img.preview} alt="" className="w-12 h-12 object-cover rounded-lg border border-border" />
                    <button
                      onClick={() => setOpenPromptSourceImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5 text-zinc-400" />
                    </button>
                  </div>
                ))}
                {openPromptSourceImages.length < 3 && (
                  <button
                    onClick={() => setOpenPromptShowImageMenu(true)}
                    className="w-12 h-12 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-500 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Error */}
            {openPromptError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {openPromptError}
              </div>
            )}

            {/* Image: Generating spinner */}
            {openPromptGenerating && openPromptMediaType === 'image' && (
              <div className="flex flex-col items-center py-16">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-4" />
                <p className="text-white font-medium">Generating your image...</p>
                <p className="text-zinc-500 text-sm mt-1">This usually takes 10-15 seconds</p>
              </div>
            )}

            {/* Video: Planning spinner */}
            {openPromptPlanningScene && (
              <div className="flex flex-col items-center py-16">
                <Loader2 className="w-10 h-10 text-amber-400 animate-spin mb-4" />
                <p className="text-white font-medium">Planning your scene...</p>
                <p className="text-zinc-500 text-sm mt-1">AI is analyzing duration and segmenting prompts</p>
              </div>
            )}

            {/* Video: Director's Review — shown after scene planner returns */}
            {openPromptScenePlan && !openPromptResult && !openPromptPlanningScene && (
              <DirectorsReview
                videoPrompt={openPromptScenePlan.videoPrompt}
                onVideoPromptChange={(v) => setOpenPromptScenePlan(prev => prev ? { ...prev, videoPrompt: v } : prev)}
                extensionPrompts={openPromptScenePlan.extensionPrompts || []}
                onExtensionPromptsChange={(v) => setOpenPromptScenePlan(prev => {
                  if (!prev) return prev
                  const newDuration = 8 + v.length * 7
                  return { ...prev, extensionPrompts: v.length > 0 ? v : undefined, estimatedDuration: newDuration }
                })}
                dialogue={openPromptScenePlan.dialogue}
                onDialogueChange={(v) => setOpenPromptScenePlan(prev => prev ? { ...prev, dialogue: v } : prev)}
                extensionDialogue={openPromptScenePlan.extensionDialogue}
                onExtensionDialogueChange={(v) => setOpenPromptScenePlan(prev => prev ? { ...prev, extensionDialogue: v } : prev)}
                overlaysEnabled={openPromptOverlaysEnabled}
                onOverlaysEnabledChange={setOpenPromptOverlaysEnabled}
                hook={openPromptScenePlan.overlay?.hook || ''}
                onHookChange={(v) => setOpenPromptScenePlan(prev => prev?.overlay ? { ...prev, overlay: { ...prev.overlay, hook: v } } : prev)}
                cta={openPromptScenePlan.overlay?.cta || ''}
                onCtaChange={(v) => setOpenPromptScenePlan(prev => prev?.overlay ? { ...prev, overlay: { ...prev.overlay, cta: v } } : prev)}
                quality={openPromptQuality}
                onQualityChange={setOpenPromptQuality}
                onGenerate={handleOpenPromptVideoGenerate}
                onRewrite={() => { setOpenPromptScenePlan(null); handleOpenPromptGenerate() }}
                generating={openPromptGenerating}
                creditsRemaining={aiUsage?.remaining ?? null}
                error={null}
              />
            )}

            {/* Image Result */}
            {openPromptResult?.type === 'image' && (
              <div className="space-y-4">
                <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Image display */}
                  <div className="flex justify-center bg-zinc-900/50 p-4">
                    <img
                      src={openPromptResult.image.storageUrl || `data:${openPromptResult.image.mimeType};base64,${openPromptResult.image.base64}`}
                      alt="Generated image"
                      className="max-h-[600px] rounded-lg object-contain"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 p-4 flex-wrap">
                    <button
                      onClick={handleOpenPromptDownload}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                    <button
                      onClick={handleOpenPromptSaveToLibrary}
                      disabled={openPromptSaving || openPromptSaved}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors',
                        openPromptSaved
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      )}
                    >
                      {openPromptSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : openPromptSaved ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <FolderPlus className="w-4 h-4" />
                      )}
                      {openPromptSaved ? 'Saved' : 'Save to Library'}
                    </button>
                    {openPromptResult.image.storageUrl ? (
                      <Link
                        href={`/dashboard/creative-studio/image-editor?imageUrl=${encodeURIComponent(openPromptResult.image.storageUrl)}`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-500 text-sm cursor-not-allowed opacity-50">
                        <Pencil className="w-4 h-4" />
                        Edit
                      </span>
                    )}
                    <button
                      onClick={handleOpenPromptCreateAd}
                      disabled={creatingAd[-1]}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent/20 text-accent text-sm hover:bg-accent/30 transition-colors"
                    >
                      {creatingAd[-1] ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Megaphone className="w-4 h-4" />
                      )}
                      Create Ad
                    </button>
                    <button
                      onClick={() => {
                        // Pre-load this image into the Oracle with Content + Video
                        const img = openPromptResult?.type === 'image' ? openPromptResult.image : null
                        if (!img) return
                        setOraclePreloadImage({
                          base64: img.base64,
                          mimeType: img.mimeType,
                          preview: img.storageUrl || `data:${img.mimeType};base64,${img.base64}`,
                        })
                        setOraclePreloadMode('video')
                        setOraclePlaceholder('Describe the animation or motion you want...')
                        // Reset open-prompt state and go back to Oracle
                        setOpenPromptResult(null)
                        setOpenPromptText('')
                        setMode(null)
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/30 transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      Make Video
                    </button>
                  </div>
                </div>

                {/* Adjust input */}
                <div className="bg-bg-card border border-border rounded-xl p-4">
                  <label className="text-xs text-zinc-500 mb-2 block">Adjust this image</label>
                  <div className="flex gap-2">
                    <input
                      value={openPromptAdjustText}
                      onChange={(e) => setOpenPromptAdjustText(e.target.value)}
                      placeholder="e.g. make the background darker, add more contrast..."
                      className="flex-1 bg-bg-dark border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && openPromptAdjustText.trim()) handleOpenPromptAdjust()
                      }}
                    />
                    <button
                      onClick={handleOpenPromptAdjust}
                      disabled={!openPromptAdjustText.trim() || openPromptAdjusting}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        openPromptAdjustText.trim() && !openPromptAdjusting
                          ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                          : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                      )}
                    >
                      {openPromptAdjusting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Adjust
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Video Result */}
            {openPromptResult?.type === 'video' && (
              <div className="space-y-4">
                <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Generating state */}
                  {openPromptVideoJob && (openPromptVideoJob.status === 'queued' || openPromptVideoJob.status === 'generating' || openPromptVideoJob.status === 'rendering' || openPromptVideoJob.status === 'extending') && (
                    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                      <Loader2 className="w-10 h-10 text-orange-400 animate-spin mb-4" />
                      <p className="text-white font-medium mb-1">
                        {openPromptVideoJob.status === 'queued' ? 'Queued...' :
                         openPromptVideoJob.status === 'extending' ? 'Extending video...' :
                         'Generating video...'}
                      </p>
                      <p className="text-zinc-500 text-sm">This typically takes 1-3 minutes</p>
                      {openPromptVideoJob.progress_pct !== undefined && openPromptVideoJob.progress_pct > 0 && (
                        <div className="w-48 mt-4">
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round(openPromptVideoJob.progress_pct)}%` }}
                            />
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">{Math.round(openPromptVideoJob.progress_pct)}%</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Failed state */}
                  {openPromptVideoJob?.status === 'failed' && (
                    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                      <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
                      <p className="text-white font-medium mb-1">Video generation failed</p>
                      <p className="text-zinc-500 text-sm">{openPromptVideoJob.error_message || 'An unexpected error occurred'}</p>
                      <button
                        onClick={() => {
                          setOpenPromptVideoJob(null)
                          setOpenPromptResult(null)
                          setMode(null)
                        }}
                        className="mt-4 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700"
                      >
                        Try Again
                      </button>
                    </div>
                  )}

                  {/* Completed video */}
                  {openPromptVideoJob?.status === 'complete' && (openPromptVideoJob.final_video_url || openPromptVideoJob.raw_video_url) && (
                    <div>
                      <div className="flex items-center justify-center gap-3 bg-zinc-900/50 p-4">
                        <video
                          src={openPromptVideoJob.final_video_url || openPromptVideoJob.raw_video_url}
                          controls
                          className="max-h-[600px] rounded-lg"
                          autoPlay
                          muted
                        />
                        {(openPromptVideoJob.provider === 'veo-ext' || openPromptVideoJob.provider === 'veo') && (
                          <button
                            onClick={handleOpenPromptExtend}
                            disabled={openPromptExtending || (aiUsage !== null && aiUsage.remaining < 25)}
                            className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {openPromptExtending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            <span className="whitespace-nowrap">+ 7 sec</span>
                            <span className="text-[10px] text-amber-400/60">25 credits</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 p-4 flex-wrap">
                        <a
                          href={openPromptVideoJob.final_video_url || openPromptVideoJob.raw_video_url}
                          download={`open-prompt-video-${Date.now()}.mp4`}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </a>
                        <Link
                          href={`/dashboard/creative-studio/video-editor?jobId=${openPromptVideoJob.id}`}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Video
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Launch Wizard Modal */}
        {showLaunchWizard && currentAccountId && (
          <LaunchWizard
            adAccountId={currentAccountId}
            onComplete={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)
            }}
            onCancel={() => {
              setShowLaunchWizard(false)
              setWizardCreatives([])
              setWizardCopy(null)
            }}
            preloadedCreatives={wizardCreatives}
            initialCopy={wizardCopy || undefined}
          />
        )}
      </div>
    )
  }

  // Inspiration mode - show gallery
  if (mode === 'inspiration') {
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 lg:px-8 py-6">
          <div className="max-w-[1000px] mx-auto">
            <InspirationGallery
              onSelectExample={handleSelectInspiration}
              onBack={() => setMode(null)}
            />
          </div>
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
                {mode === 'create' ? 'Create Ad' : mode === 'upload' ? 'Upload Ad' : isRefreshMode ? 'Refresh Ad' : 'Clone Ad'}
              </h1>
              <span className={cn(
                'px-2 py-0.5 text-xs font-semibold rounded',
                mode === 'create' ? 'bg-accent/20 text-accent' : mode === 'upload' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'
              )}>
                {mode === 'create' ? 'ORIGINAL' : mode === 'upload' ? 'CUSTOM' : isRefreshMode ? 'CREATIVE REFRESH' : 'STYLE MATCH'}
              </span>
            </div>
            <p className="text-zinc-500 mt-1 ml-7">
              {mode === 'create'
                ? 'Generate original ads from your product page'
                : mode === 'upload'
                ? 'Generate ads from your uploaded image'
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
                currentStep === 3 || (mode === 'create' && currentStep === 2) ? 'text-white' : 'text-zinc-500'
              )}>
                <span className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                  generatedAds.length > 0
                    ? 'bg-emerald-500 text-white'
                    : (currentStep === 3 || (mode === 'create' && currentStep === 2))
                      ? 'bg-accent text-white'
                      : 'bg-zinc-700'
                )}>
                  {generatedAds.length > 0 ? '✓' : mode === 'clone' ? '3' : '2'}
                </span>
                Generate
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

          {/* Create mode: Shared ProductInput component (always rendered, handles collapsed/expanded) */}
          {mode === 'create' && (
            <>
              <ProductInput
                ref={productInputRef}
                onChange={(knowledge: ProductKnowledge, images: ProductImage[], selectedIndices: number[]) => {
                  // Bridge ProductKnowledge → ProductInfo by including selected image data
                  const firstSelected = selectedIndices.length > 0 ? images[selectedIndices[0]] : null
                  const assembled: ProductInfo = {
                    name: knowledge.name,
                    description: knowledge.description,
                    features: knowledge.features,
                    benefits: knowledge.benefits,
                    painPoints: knowledge.painPoints,
                    testimonialPoints: knowledge.testimonialPoints,
                    keyMessages: knowledge.keyMessages,
                    targetAudience: knowledge.targetAudience,
                    category: knowledge.category,
                    uniqueSellingPoint: knowledge.uniqueSellingPoint,
                    imageBase64: firstSelected?.base64,
                    imageMimeType: firstSelected?.mimeType,
                  }
                  setProductInfo(assembled)
                  setProductImageOptions(images as ProductImageOption[])
                  setSelectedProductImageIndices(selectedIndices)
                }}
                onOpenMediaLibrary={() => setCreateMediaLibraryOpen(true)}
                onImageFromLibrary={createImageFromLibrary}
                initialUrl={productUrl}
                initialProductKnowledge={productInfo ? {
                  name: productInfo.name,
                  description: productInfo.description,
                  features: productInfo.features,
                  benefits: productInfo.benefits,
                  painPoints: productInfo.painPoints,
                  testimonialPoints: productInfo.testimonialPoints,
                  keyMessages: productInfo.keyMessages,
                  targetAudience: productInfo.targetAudience,
                  category: productInfo.category,
                  uniqueSellingPoint: productInfo.uniqueSellingPoint,
                } as ProductKnowledge : undefined}
                autoAnalyze={!!productUrl.trim() && !productInfo}
                collapsed={currentStep > 1}
                onCollapsedChange={(collapsed) => { if (!collapsed) setCurrentStep(1) }}
                accentColor="amber"
              />
              {/* Continue button for create mode (ProductInput doesn't include step navigation) */}
              {currentStep === 1 && productInfo?.name && (
                <button
                  onClick={() => setCurrentStep(3)}
                  className={cn(
                    'w-full px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                    'bg-accent hover:bg-accent/90 text-white'
                  )}
                >
                  <ChevronRight className="w-4 h-4" />
                  Continue to Generate
                </button>
              )}
            </>
          )}

          {/* Step 1: Product URL or Manual Entry + Pill Selectors (Clone mode) */}
          {currentStep === 1 && mode !== 'create' && (
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
                        placeholder="yourstore.com/products/awesome-product"
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

                    {isAnalyzingProduct && (
                      <AnalyzingStatus />
                    )}

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
                      {/* Product image upload — hidden for video modes since Step 2 handles images */}
                      {(
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

          {/* Product Info Card (shows after step 1) — hidden for create mode (ProductInput has its own collapsed view) */}
          {productInfo && mode !== 'upload' && mode !== 'create' && (
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

              {/* Image-related controls — hidden for video modes (they have their own image selection card) */}
              {(
                <>
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
                              'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all',
                              selectedProductImageIdx === i
                                ? 'border-purple-500 ring-2 ring-purple-500/30'
                                : 'border-border hover:border-zinc-500'
                            )}
                          >
                            <img
                              src={`data:${img.mimeType};base64,${img.base64}`}
                              alt={img.description || `Image ${i + 1}`}
                              className="w-full h-full object-contain bg-zinc-900"
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
                </>
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


          {/* Media Library Modal for Create mode ProductInput */}
          {createMediaLibraryOpen && user?.id && currentAccountId && (
            <MediaLibraryModal
              isOpen={createMediaLibraryOpen}
              onClose={() => setCreateMediaLibraryOpen(false)}
              userId={user.id}
              adAccountId={currentAccountId}
              selectedItems={[]}
              onSelectionChange={async (items) => {
                setCreateMediaLibraryOpen(false)
                if (items.length === 0) return
                const item = items[0]
                if (!('hash' in item)) return
                const mediaItem = item as MediaImage & { mediaType: 'image' }
                try {
                  const res = await fetch('/api/creative-studio/download-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: mediaItem.url }),
                  })
                  if (res.ok) {
                    const data = await res.json()
                    setCreateImageFromLibrary({
                      base64: data.base64,
                      mimeType: data.mimeType || 'image/jpeg',
                      preview: mediaItem.url,
                    })
                    // Reset after a tick so ProductInput can consume it
                    setTimeout(() => setCreateImageFromLibrary(null), 100)
                  }
                } catch {}
              }}
              maxSelection={1}
              allowedTypes={['image']}
            />
          )}

          {/* Media Library Modal for Open Prompt source image */}
          {openPromptShowLibrary && user?.id && currentAccountId && (
            <MediaLibraryModal
              isOpen={openPromptShowLibrary}
              onClose={() => setOpenPromptShowLibrary(false)}
              userId={user.id}
              adAccountId={currentAccountId}
              selectedItems={[]}
              onSelectionChange={async (items) => {
                setOpenPromptShowLibrary(false)
                if (items.length === 0) return

                const item = items[0]
                if (!('hash' in item)) return

                const mediaItem = item as MediaImage & { mediaType: 'image' }

                setOpenPromptDownloadingLibrary(true)
                try {
                  const res = await fetch('/api/creative-studio/download-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: mediaItem.url }),
                  })

                  if (res.ok) {
                    const data = await res.json()
                    setOpenPromptSourceImages(prev => prev.length >= 3 ? prev : [...prev, {
                      base64: data.base64,
                      mimeType: data.mimeType || 'image/jpeg',
                      preview: mediaItem.url,
                    }])
                  }
                } catch {} finally {
                  setOpenPromptDownloadingLibrary(false)
                }
              }}
              maxSelection={3}
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
                              {currentImage.storageUrl && (
                                <button
                                  onClick={() => router.push(`/dashboard/creative-studio/image-editor?imageUrl=${encodeURIComponent(currentImage.storageUrl!)}`)}
                                  className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors"
                                  title="Edit in Image Editor"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
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
                          {/* Aspect ratio + style + product image toggle row */}
                          <div className="flex flex-wrap gap-2 items-end">
                            <div className="shrink-0">
                              <label className="block text-xs text-zinc-500 mb-1.5">Ratio</label>
                              <div className="flex rounded-lg border border-border overflow-hidden">
                                {([['1:1', 'Square'], ['9:16', 'Portrait'], ['16:9', 'Landscape']] as const).map(([ratio, label]) => (
                                  <button
                                    key={ratio}
                                    onClick={() => setImageAspectRatios(prev => ({ ...prev, [index]: ratio }))}
                                    className={cn(
                                      'px-2.5 py-[6px] text-xs transition-colors',
                                      (imageAspectRatios[index] || '1:1') === ratio
                                        ? 'bg-accent/20 text-white font-medium'
                                        : 'bg-bg-dark text-zinc-400 hover:text-white hover:bg-bg-hover'
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
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
                            {productInfo?.imageBase64 && (
                              <div className="shrink-0">
                                <label className="block text-xs text-zinc-500 mb-1.5">Source Image</label>
                                <button
                                  onClick={() => setIncludeProductImage(prev => ({ ...prev, [index]: prev[index] === false ? true : false }))}
                                  className={cn(
                                    'px-2.5 py-[6px] rounded-lg border text-xs transition-colors',
                                    includeProductImage[index] !== false
                                      ? 'border-green-500/40 bg-green-500/10 text-green-400'
                                      : 'border-border bg-bg-dark text-zinc-500 hover:text-zinc-300'
                                  )}
                                >
                                  {includeProductImage[index] !== false ? 'Included' : 'Excluded'}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Image prompt for Create/Upload mode */}
                          {(mode === 'create' || mode === 'upload') && (
                            <div>
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
                          )}
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
