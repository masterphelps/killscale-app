'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Search, Wand2, Sparkles, ExternalLink, Copy, Check, Loader2, AlertCircle, Link as LinkIcon, Package, ChevronRight, Download, ImagePlus, Calendar, BarChart3, ChevronLeft, FolderPlus, Send, Megaphone, PlusCircle, Layers, Lightbulb, Upload, X, FileText, RefreshCw } from 'lucide-react'
import { LaunchWizard, type Creative } from '@/components/launch-wizard'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/lib/account'
import { useSubscription } from '@/lib/subscription'
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
  imageUrl?: string
  imageBase64?: string
  imageMimeType?: string
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

export default function AdStudioPage() {
  const { user } = useAuth()
  const { currentAccountId } = useAccount()
  const { plan } = useSubscription()

  const isPro = !!plan

  // Mode selection: null = landing page, 'create' = original ads, 'clone' = copy competitor style, 'inspiration' = browse gallery, 'upload' = upload own image
  const [mode, setMode] = useState<'create' | 'clone' | 'inspiration' | 'upload' | null>(null)

  // Step tracking
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Step 1: Product URL or Manual Entry
  const [productUrl, setProductUrl] = useState('')
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false)
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null)
  const [productError, setProductError] = useState<string | null>(null)

  // Manual product entry (alternative to URL)
  const [useManualEntry, setUseManualEntry] = useState(false)
  const [manualProductName, setManualProductName] = useState('')
  const [manualProductDescription, setManualProductDescription] = useState('')
  const [manualProductImage, setManualProductImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [isUploadingManualImage, setIsUploadingManualImage] = useState(false)

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
  const [imageStyle, setImageStyle] = useState<'clone' | 'lifestyle' | 'product' | 'minimal' | 'bold' | 'refresh'>('clone')
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

  // Save copy state
  const [savingCopyIndex, setSavingCopyIndex] = useState<number | null>(null)
  const [savedCopyIds, setSavedCopyIds] = useState<Record<number, boolean>>({})

  // AI generation usage tracking
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; status: string } | null>(null)

  // Fetch AI generation usage
  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/ai/usage?userId=${user.id}`)
      .then(res => res.json())
      .then(data => { if (data.limit !== undefined) setAiUsage(data) })
      .catch(() => {})
  }, [user?.id])

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

      setProductInfo(data.product)
      // Create mode skips competitor search, goes straight to generate
      // Clone mode with pre-selected ad (from inspiration) also skips to generate
      if (mode === 'create' || selectedAd) {
        setCurrentStep(3)
      } else {
        setCurrentStep(2)
      }
    } catch (err) {
      setProductError('Failed to analyze product URL')
    } finally {
      setIsAnalyzingProduct(false)
    }
  }, [productUrl, mode, selectedAd])

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
    setProductInfo({
      name: manualProductName.trim(),
      description: manualProductDescription.trim() || undefined,
      imageBase64: manualProductImage?.base64,
      imageMimeType: manualProductImage?.mimeType,
    })

    // Move to next step
    if (mode === 'create' || selectedAd) {
      setCurrentStep(3)
    } else {
      setCurrentStep(2)
    }
  }, [manualProductName, manualProductDescription, manualProductImage, mode, selectedAd])

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
    setImageStyle('clone') // Default to clone style when using inspiration

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
    setImageStyle('refresh')
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

      // Save session for AI Tasks page
      if (ads.length > 0) {
        try {
          const sessionRes = await fetch('/api/creative-studio/ad-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              adAccountId: currentAccountId,
              productUrl,
              productInfo,
              competitorCompany: selectedCompany,
              competitorAd: selectedAd,
              generatedAds: ads,
              imageStyle,
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
  }, [mode, selectedAd, productInfo, user?.id, currentAccountId, productUrl, selectedCompany, imageStyle, isRefreshMode])

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
        style: imageStyle,
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
        if (res.status === 429 && data.limit) {
          setAiUsage({ used: data.used, limit: data.limit, status: data.status })
        }
        setImageErrors(prev => ({ ...prev, [index]: data.error || 'Failed to generate image' }))
        return
      }

      // Optimistically update usage counter
      setAiUsage(prev => prev ? { ...prev, used: prev.used + 1 } : prev)

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
  }, [productInfo, imageStyle, referenceAdImage, user?.id, currentAccountId, sessionId, generatedImages, saveImageToSession, imagePrompts, isRefreshMode])

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
    if (!uploadedImage || !uploadPrompt.trim() || !user?.id || !currentAccountId) return

    setIsGenerating(true)
    setGeneratedAds([])
    setSessionId(null)

    try {
      // Create a simple product info from the prompt
      const uploadProductInfo: ProductInfo = {
        name: 'Custom Product',
        description: uploadPrompt,
        imageBase64: uploadedImage.base64,
        imageMimeType: uploadedImage.mimeType,
      }
      setProductInfo(uploadProductInfo)

      // Generate ad copy variations using the prompt as the product description
      const res = await fetch('/api/creative-studio/generate-from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: uploadProductInfo }),
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

      // Save session for AI Tasks page
      if (ads.length > 0) {
        try {
          const sessionRes = await fetch('/api/creative-studio/ad-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              adAccountId: currentAccountId,
              productUrl: 'upload',
              productInfo: uploadProductInfo,
              competitorCompany: null,
              competitorAd: null,
              generatedAds: ads,
              imageStyle,
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
      console.error('Generation failed:', err)
      setProductError('Failed to generate ads. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [uploadedImage, uploadPrompt, user?.id, currentAccountId, imageStyle])

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

            {/* Mode Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Create Mode */}
              <button
                onClick={() => setMode('create')}
                className="group p-6 bg-bg-card border border-border rounded-2xl text-left hover:border-accent/50 hover:bg-bg-card/80 transition-all"
              >
                <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent/30 transition-colors">
                  <PlusCircle className="w-7 h-7 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Create</h2>
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
                <h2 className="text-xl font-semibold text-white mb-2">Clone</h2>
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
                <h2 className="text-xl font-semibold text-white mb-2">Inspiration</h2>
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
                <h2 className="text-xl font-semibold text-white mb-2">Upload</h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Upload your own photo and describe your ad.
                </p>
                <div className="mt-4 flex items-center gap-2 text-cyan-400 text-sm font-medium">
                  Upload image <ChevronRight className="w-4 h-4" />
                </div>
              </button>
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
                  generatedAds.length > 0 ? 'bg-emerald-500 text-white' : (currentStep === 3 || (mode === 'create' && currentStep === 2)) ? 'bg-accent text-white' : 'bg-zinc-700'
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

          {/* Step 1: Product URL or Manual Entry */}
          {currentStep === 1 && (
            <div className="bg-bg-card border border-border rounded-xl p-6 space-y-4">
              {!useManualEntry ? (
                <>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <LinkIcon className="w-5 h-5 text-accent" />
                    Enter Your Product URL
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Paste a link to your product page. We'll extract the product details automatically.
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
                      }}
                      className="text-sm text-zinc-500 hover:text-white transition-colors"
                    >
                      Use URL instead
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Product image upload */}
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

                    {/* Continue button */}
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
                  {/* Image Style Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Image style:</span>
                    <select
                      value={imageStyle}
                      onChange={(e) => setImageStyle(e.target.value as typeof imageStyle)}
                      className="bg-bg-dark border border-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-accent"
                    >
                      {/* Clone/Refresh options only when we have a reference ad */}
                      {referenceAdImage && isRefreshMode && (
                        <option value="refresh">Refresh (new variation)</option>
                      )}
                      {referenceAdImage && !isRefreshMode && (
                        <option value="clone">Clone (match reference)</option>
                      )}
                      <option value="lifestyle">Lifestyle</option>
                      <option value="product">Product</option>
                      <option value="minimal">Minimal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
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
              {/* AI Generation Usage */}
              {aiUsage && (
                <div className={cn(
                  'flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-fit',
                  aiUsage.used >= aiUsage.limit
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-zinc-800 text-zinc-400'
                )}>
                  <ImagePlus className="w-3 h-3" />
                  {aiUsage.used >= aiUsage.limit
                    ? `Image generation limit reached (${aiUsage.limit}${aiUsage.status === 'active' ? '/mo' : ' total'})`
                    : `${aiUsage.limit - aiUsage.used} image generation${aiUsage.limit - aiUsage.used !== 1 ? 's' : ''} remaining${aiUsage.status === 'active' ? ' this month' : ''}`
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
                          {/* Image prompt field - required for Create/Upload mode, optional for Clone */}
                          {(mode === 'create' || mode === 'upload') && (
                            <div>
                              <label className="block text-xs text-zinc-500 mb-1.5">
                                {mode === 'upload' ? 'Creative direction' : 'Describe how you want the ad to look'} <span className="text-red-400">*</span>
                              </label>
                              <textarea
                                value={imagePrompts[index] || ''}
                                onChange={(e) => setImagePrompts(prev => ({ ...prev, [index]: e.target.value }))}
                                placeholder="e.g., 'Lifestyle photo of someone using the product outdoors with warm sunset lighting' or 'Clean product shot on white background with subtle shadows'"
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
                            disabled={generatingImageIndex !== null || ((mode === 'create' || mode === 'upload') && !imagePrompts[index]?.trim()) || (aiUsage != null && aiUsage.used >= aiUsage.limit)}
                            className={cn(
                              'w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                              mode === 'upload'
                                ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30'
                                : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30',
                              (generatingImageIndex !== null || ((mode === 'create' || mode === 'upload') && !imagePrompts[index]?.trim()) || (aiUsage != null && aiUsage.used >= aiUsage.limit)) && 'opacity-50 cursor-not-allowed'
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
                                Generate Image
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
            initialEntityType="ad"
            preloadedCreatives={wizardCreatives}
            initialCopy={wizardCopy || undefined}
          />
        </div>
      )}
    </div>
  )
}
