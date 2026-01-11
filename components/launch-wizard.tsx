'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Rocket,
  Star,
  Package,
  Upload,
  X,
  Search,
  Check,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Image as ImageIcon,
  Video
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { cn, formatFileSize } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { MediaLibraryModal } from '@/components/media-library-modal'
import { AdPreviewPanel } from '@/components/ad-preview-panel'
import { uploadImageToMeta, uploadVideoToMeta } from '@/lib/meta-upload'
import type { MediaImage, MediaVideo } from '@/app/api/meta/media/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Generate thumbnail from video file using canvas
const generateVideoThumbnail = (videoUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.src = videoUrl
    video.muted = true
    video.playsInline = true

    video.onloadeddata = () => {
      // Seek to 0.1 seconds to get a frame (not black)
      video.currentTime = 0.1
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          resolve(dataUrl)
        } else {
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    }

    video.onerror = () => resolve(null)

    // Timeout fallback
    setTimeout(() => resolve(null), 5000)
  })
}

type Step =
  | 'account'           // Page selection
  | 'entity-type'       // NEW: Campaign vs Ad Set vs Ad vs Performance Set
  | 'select-campaign'   // NEW: For Ad Set and Ad paths
  | 'select-adset'      // NEW: For Ad path only
  | 'starred-ads'       // Performance Set path: select starred ads to include
  | 'budget'            // Campaign path only: CBO vs ABO
  | 'abo-options'       // Campaign path only
  | 'details'           // Campaign/Performance Set path
  | 'adset-details'     // NEW: Ad Set path
  | 'leadform'          // Campaign/Ad Set paths
  | 'targeting'         // Campaign/Ad Set/Performance Set paths
  | 'creatives'         // Campaign/Ad Set/Ad paths (NOT Performance Set)
  | 'copy'              // Campaign/Ad Set/Ad paths (NOT Performance Set)
  | 'review'            // All paths

interface LeadForm {
  id: string
  name: string
  status: string
  questions: string[]
  createdTime: string
  locale: string
}

interface Page {
  id: string
  name: string
}

interface Campaign {
  id: string
  name: string
  status: string
  objective?: string
  isCBO?: boolean
  dailyBudget?: number | null
  adSetCount?: number
  adCount?: number
}

interface AdSet {
  id: string
  name: string
  status: string
  dailyBudget?: number | null
  optimizationGoal?: string
}

interface Creative {
  file?: File
  preview: string
  type: 'image' | 'video'
  uploading?: boolean
  uploaded?: boolean
  uploadProgress?: number
  imageHash?: string
  videoId?: string
  thumbnailUrl?: string  // Auto-generated thumbnail URL for videos
  thumbnailHash?: string // Uploaded thumbnail image hash (more reliable)
  // Library item fields
  isFromLibrary?: boolean
  libraryId?: string
  name?: string
}

interface LocationResult {
  key: string
  name: string
  region: string
  countryName: string
}

interface TargetingOption {
  id: string
  name: string
  type: 'interest' | 'behavior'
  audienceSizeLower?: number
  audienceSizeUpper?: number
}

interface WizardState {
  adAccountId: string
  pageId: string
  // Entity type selection (new)
  entityType: 'campaign' | 'adset' | 'ad' | 'performance-set'
  // Selected starred ads for performance-set path
  selectedStarredAds: string[]  // Array of ad IDs
  // Selected campaign for adset/ad paths
  selectedCampaignId: string
  selectedCampaignName: string
  selectedCampaignObjective: 'leads' | 'conversions' | 'traffic' | null
  selectedCampaignIsCBO: boolean
  // Selected adset for ad path
  selectedAdsetId: string
  selectedAdsetName: string
  // Ad set budget (for adset path)
  adsetName: string
  adsetDailyBudget: number
  adsetHasSpendCap: boolean
  // Campaign path fields
  budgetType: 'cbo' | 'abo'
  aboOption: 'new' | 'existing'
  existingCampaignId: string
  campaignName: string
  objective: 'leads' | 'conversions' | 'traffic'
  conversionEvent: string  // The specific pixel event (PURCHASE, COMPLETE_REGISTRATION, etc.)
  selectedFormId: string   // Lead form ID for lead generation campaigns
  dailyBudget: number
  specialAdCategory: 'HOUSING' | 'CREDIT' | 'EMPLOYMENT' | null
  locationType: 'city' | 'country'
  locationKey: string
  locationName: string
  locationRadius: number
  targetingMode: 'broad' | 'custom'
  selectedInterests: TargetingOption[]
  selectedBehaviors: TargetingOption[]
  ageMin: number
  ageMax: number
  creatives: Creative[]
  creativeEnhancements: boolean
  primaryText: string
  headline: string
  description: string
  websiteUrl: string
  ctaType: string
  autoInjectUTMs: boolean
}

const OBJECTIVES = [
  { value: 'conversions', label: 'Website Conversions', hasEvents: true },
  { value: 'leads', label: 'Lead Generation', hasEvents: false },
  { value: 'traffic', label: 'Traffic (Website Visits)', hasEvents: false }
]

// Fallback conversion events if pixel fetch fails
const FALLBACK_CONVERSION_EVENTS = [
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'COMPLETE_REGISTRATION', label: 'Complete Registration' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'ADD_TO_CART', label: 'Add to Cart' },
  { value: 'INITIATE_CHECKOUT', label: 'Initiate Checkout' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT', label: 'Contact' },
  { value: 'SUBMIT_APPLICATION', label: 'Submit Application' }
]

const CTA_OPTIONS = [
  // Most common
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BOOK_NOW', label: 'Book Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'CALL_NOW', label: 'Call Now' },
  // E-commerce
  { value: 'BUY_NOW', label: 'Buy Now' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'ADD_TO_CART', label: 'Add to Cart' },
  { value: 'SEE_MENU', label: 'See Menu' },
  // Engagement
  { value: 'WATCH_MORE', label: 'Watch More' },
  { value: 'LISTEN_NOW', label: 'Listen Now' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'INSTALL_APP', label: 'Install App' },
  { value: 'USE_APP', label: 'Use App' },
  { value: 'PLAY_GAME', label: 'Play Game' },
  // Lead gen / Services
  { value: 'APPLY_NOW', label: 'Apply Now' },
  { value: 'REQUEST_TIME', label: 'Request Time' },
  { value: 'GET_DIRECTIONS', label: 'Get Directions' },
  { value: 'SEND_MESSAGE', label: 'Send Message' },
  { value: 'WHATSAPP_MESSAGE', label: 'WhatsApp Message' },
  { value: 'SEND_WHATSAPP_MESSAGE', label: 'Send WhatsApp Message' },
  { value: 'MESSAGE_PAGE', label: 'Message Page' },
  // Subscriptions / Content
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'GET_STARTED', label: 'Get Started' },
  { value: 'SEE_MORE', label: 'See More' },
  { value: 'OPEN_LINK', label: 'Open Link' },
  // Events / Donations
  { value: 'GET_TICKETS', label: 'Get Tickets' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'DONATE_NOW', label: 'Donate Now' },
  // Auto
  { value: 'GET_SHOWTIMES', label: 'Get Showtimes' },
  { value: 'REQUEST_QUOTE', label: 'Request Quote' },
  { value: 'TEST_DRIVE', label: 'Test Drive' },
  // Other
  { value: 'VOTE_NOW', label: 'Vote Now' },
  { value: 'FIND_A_GROUP', label: 'Find a Group' },
  { value: 'NO_BUTTON', label: 'No Button' }
]

const RADIUS_OPTIONS = [10, 15, 25, 50, 100]

// UTM parameters for KillScale Pixel tracking
// Uses Meta's dynamic URL parameters that get replaced at ad serve time
const KILLSCALE_UTM_TAGS = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.id}}'

// Build preview URL with UTMs (for display only)
function buildUrlWithUTMs(baseUrl: string): string {
  if (!baseUrl) return ''
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}${KILLSCALE_UTM_TAGS}`
}

export interface StarredAdForWizard {
  ad_id: string
  ad_name: string
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  spend: number
  revenue: number
  roas: number
  star_count?: number  // How many times this creative was starred (for universal performer badge)
}

interface PerformanceSetResult {
  usedAdIds: string[]  // The starred ad IDs that were used to build the Performance Set
}

interface LaunchWizardProps {
  adAccountId: string  // Passed from context - the currently selected ad account
  onComplete: (performanceSetResult?: PerformanceSetResult) => void
  onCancel: () => void
  // For Performance Set flow - preselect entity type and pass starred ads
  initialEntityType?: 'campaign' | 'adset' | 'ad' | 'performance-set'
  starredAds?: StarredAdForWizard[]
}

export function LaunchWizard({ adAccountId, onComplete, onCancel, initialEntityType, starredAds = [] }: LaunchWizardProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('account') // First step is now just Page selection
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deploymentPhase, setDeploymentPhase] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Data from APIs
  const [pages, setPages] = useState<Page[]>([])
  const [existingCampaigns, setExistingCampaigns] = useState<Campaign[]>([])
  const [existingAdsets, setExistingAdsets] = useState<AdSet[]>([])
  const [loadingAdsets, setLoadingAdsets] = useState(false)
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [locationQuery, setLocationQuery] = useState('')
  const [searchingLocations, setSearchingLocations] = useState(false)
  const [interestQuery, setInterestQuery] = useState('')
  const [interestResults, setInterestResults] = useState<TargetingOption[]>([])
  const [searchingInterests, setSearchingInterests] = useState(false)
  const [behaviorQuery, setBehaviorQuery] = useState('')
  const [behaviorResults, setBehaviorResults] = useState<TargetingOption[]>([])
  const [searchingBehaviors, setSearchingBehaviors] = useState(false)
  const [conversionEvents, setConversionEvents] = useState<{ value: string; label: string }[]>(FALLBACK_CONVERSION_EVENTS)
  const [loadingPixelEvents, setLoadingPixelEvents] = useState(false)
  const [leadForms, setLeadForms] = useState<LeadForm[]>([])
  const [loadingLeadForms, setLoadingLeadForms] = useState(false)
  const [leadFormsError, setLeadFormsError] = useState<string | null>(null)
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Form state - adAccountId comes from prop (sidebar context)
  const [state, setState] = useState<WizardState>({
    adAccountId: adAccountId, // Use the prop from sidebar context
    pageId: '',
    // Entity type selection (default to campaign, or use initialEntityType for Performance Set flow)
    entityType: initialEntityType || 'campaign',
    // Selected starred ads for performance-set path (pre-select all if coming from Performance Set flow)
    selectedStarredAds: initialEntityType === 'performance-set' ? starredAds.map(ad => ad.ad_id) : [],
    // Selected campaign for adset/ad paths
    selectedCampaignId: '',
    selectedCampaignName: '',
    selectedCampaignObjective: null,
    selectedCampaignIsCBO: true,
    // Selected adset for ad path
    selectedAdsetId: '',
    selectedAdsetName: '',
    // Ad set details
    adsetName: '',
    adsetDailyBudget: 50,
    adsetHasSpendCap: false,
    // Campaign path fields
    budgetType: 'cbo',
    aboOption: 'new',
    existingCampaignId: '',
    campaignName: '',
    objective: 'conversions',
    conversionEvent: 'PURCHASE',
    selectedFormId: '',
    dailyBudget: 50,
    specialAdCategory: null,
    locationType: 'country',
    locationKey: '',
    locationName: '',
    locationRadius: 25,
    targetingMode: 'broad',
    selectedInterests: [],
    selectedBehaviors: [],
    ageMin: 18,
    ageMax: 65,
    creatives: [],
    creativeEnhancements: false,
    primaryText: '',
    headline: '',
    description: '',
    websiteUrl: '',
    ctaType: 'GET_QUOTE',
    autoInjectUTMs: true
  })

  // Load initial data (pages for the selected ad account)
  useEffect(() => {
    if (user && adAccountId) {
      loadInitialData()
    }
  }, [user, adAccountId])

  const loadInitialData = async () => {
    if (!user || !adAccountId) return
    setLoading(true)

    try {
      // Fetch pages that can be used with this specific ad account
      // Uses Meta's promotable_pages endpoint
      const pagesRes = await fetch(`/api/meta/pages?userId=${user.id}&adAccountId=${encodeURIComponent(adAccountId)}`)
      const pagesData = await pagesRes.json()
      if (pagesData.pages) {
        setPages(pagesData.pages)
        if (pagesData.pages.length > 0) {
          setState(s => ({ ...s, pageId: pagesData.pages[0].id }))
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err)
      setError('Failed to load page data')
    } finally {
      setLoading(false)
    }
  }

  // Load campaigns when account changes
  useEffect(() => {
    if (state.adAccountId && user) {
      loadCampaigns()
    }
  }, [state.adAccountId, user])

  const loadCampaigns = async () => {
    if (!user || !state.adAccountId) return

    try {
      const res = await fetch(`/api/meta/campaigns?userId=${user.id}&adAccountId=${state.adAccountId}`)
      const data = await res.json()
      if (data.campaigns) {
        setExistingCampaigns(data.campaigns)
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    }
  }

  // Load ad sets for a specific campaign (for Ad path)
  const loadAdsets = async (campaignId: string) => {
    if (!user || !campaignId) return

    setLoadingAdsets(true)
    setExistingAdsets([])
    try {
      const res = await fetch(`/api/meta/adsets?userId=${user.id}&campaignId=${campaignId}&adAccountId=${state.adAccountId}`)
      const data = await res.json()
      if (data.adsets) {
        setExistingAdsets(data.adsets)
      }
    } catch (err) {
      console.error('Failed to load ad sets:', err)
    } finally {
      setLoadingAdsets(false)
    }
  }

  // Load conversion events for the dropdown
  const loadPixelEvents = useCallback(async () => {
    if (!user || !adAccountId) return

    setLoadingPixelEvents(true)
    try {
      const res = await fetch(`/api/meta/pixel-events?userId=${user.id}&adAccountId=${encodeURIComponent(adAccountId)}`)
      const data = await res.json()

      if (data.events && data.events.length > 0) {
        setConversionEvents(data.events)
      }
    } catch (err) {
      console.error('Failed to load pixel events:', err)
      setConversionEvents(FALLBACK_CONVERSION_EVENTS)
    } finally {
      setLoadingPixelEvents(false)
    }
  }, [user, adAccountId])

  // Load pixel events when wizard opens
  useEffect(() => {
    if (user && adAccountId) {
      loadPixelEvents()
    }
  }, [user, adAccountId, loadPixelEvents])

  // Load lead forms when page is selected and objective is leads
  const loadLeadForms = useCallback(async () => {
    if (!user || !state.pageId) return

    setLoadingLeadForms(true)
    setLeadFormsError(null)
    try {
      const res = await fetch(`/api/meta/lead-forms?userId=${user.id}&pageId=${state.pageId}`)
      const data = await res.json()

      if (data.error) {
        console.error('Lead forms API error:', data.error)
        setLeadFormsError(data.error)
        setLeadForms([])
        return
      }

      if (data.forms) {
        setLeadForms(data.forms)
        // Auto-select first form if available
        if (data.forms.length > 0 && !state.selectedFormId) {
          setState(s => ({ ...s, selectedFormId: data.forms[0].id }))
        }
      }
    } catch (err) {
      console.error('Failed to load lead forms:', err)
      setLeadFormsError('Failed to load forms')
      setLeadForms([])
    } finally {
      setLoadingLeadForms(false)
    }
  }, [user, state.pageId, state.selectedFormId])

  // Fetch lead forms when navigating to lead form step
  useEffect(() => {
    if (step === 'leadform' && state.pageId) {
      loadLeadForms()
    }
  }, [step, state.pageId, loadLeadForms])

  // Location search
  const searchLocations = useCallback(async (query: string) => {
    if (!user || query.length < 2) {
      setLocationResults([])
      return
    }

    setSearchingLocations(true)
    try {
      const res = await fetch(`/api/meta/locations?userId=${user.id}&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.locations) {
        setLocationResults(data.locations)
      }
    } catch (err) {
      console.error('Failed to search locations:', err)
    } finally {
      setSearchingLocations(false)
    }
  }, [user])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (locationQuery) {
        searchLocations(locationQuery)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [locationQuery, searchLocations])

  // Interest search
  const searchInterests = useCallback(async (query: string) => {
    if (!user || query.length < 2) {
      setInterestResults([])
      return
    }

    setSearchingInterests(true)
    try {
      const res = await fetch(`/api/meta/targeting?userId=${user.id}&type=interest&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.options) {
        setInterestResults(data.options)
      }
    } catch (err) {
      console.error('Failed to search interests:', err)
    } finally {
      setSearchingInterests(false)
    }
  }, [user])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (interestQuery) {
        searchInterests(interestQuery)
      } else {
        setInterestResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [interestQuery, searchInterests])

  // Behavior search
  const searchBehaviors = useCallback(async (query: string) => {
    if (!user || query.length < 2) {
      setBehaviorResults([])
      return
    }

    setSearchingBehaviors(true)
    try {
      const res = await fetch(`/api/meta/targeting?userId=${user.id}&type=behavior&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.options) {
        setBehaviorResults(data.options)
      }
    } catch (err) {
      console.error('Failed to search behaviors:', err)
    } finally {
      setSearchingBehaviors(false)
    }
  }, [user])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (behaviorQuery) {
        searchBehaviors(behaviorQuery)
      } else {
        setBehaviorResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [behaviorQuery, searchBehaviors])

  // Fetch access token for direct Meta uploads
  const fetchAccessToken = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(`/api/meta/token?userId=${user.id}`)
      const data = await res.json()
      if (data.accessToken) {
        setAccessToken(data.accessToken)
      }
    } catch (err) {
      console.error('Failed to fetch access token:', err)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchAccessToken()
    }
  }, [user, fetchAccessToken])

  // File handling - direct to Meta, so no size limit enforced by our server
  const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB - Meta's limit for videos

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const newCreatives: Creative[] = []
    const skippedFiles: string[] = []

    for (let i = 0; i < fileArray.length && state.creatives.length + newCreatives.length < 6; i++) {
      const file = fileArray[i]
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')

      if (!isImage && !isVideo) continue

      // Check file size (1GB for videos, 30MB for images)
      const maxSize = isVideo ? MAX_FILE_SIZE : 30 * 1024 * 1024
      if (file.size > maxSize) {
        skippedFiles.push(`${file.name} (${formatFileSize(file.size)} - max ${isVideo ? '1GB' : '30MB'})`)
        continue
      }

      if (isImage) {
        newCreatives.push({
          file,
          preview: URL.createObjectURL(file),
          type: 'image',
          name: file.name
        })
      } else {
        // For videos, generate a thumbnail from the first frame
        const videoUrl = URL.createObjectURL(file)
        const thumbnail = await generateVideoThumbnail(videoUrl)
        newCreatives.push({
          file,
          preview: thumbnail || videoUrl, // fallback to video URL if thumbnail fails
          type: 'video',
          name: file.name
        })
      }
    }

    if (skippedFiles.length > 0) {
      setError(`Files too large: ${skippedFiles.join(', ')}`)
    }

    setState(s => ({ ...s, creatives: [...s.creatives, ...newCreatives] }))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    processFiles(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFiles(files)
    }
  }

  const removeCreative = (index: number) => {
    setState(s => ({
      ...s,
      creatives: s.creatives.filter((_, i) => i !== index)
    }))
  }

  // Handle library selection
  const handleLibrarySelection = (items: ((MediaImage & { mediaType: 'image' }) | (MediaVideo & { mediaType: 'video' }))[]) => {
    const newCreatives: Creative[] = items.map(item => {
      if (item.mediaType === 'image') {
        const img = item as MediaImage & { mediaType: 'image' }
        return {
          preview: img.url,
          type: 'image' as const,
          uploaded: true,
          imageHash: img.hash,
          isFromLibrary: true,
          libraryId: img.id,
          name: img.name
        }
      } else {
        const vid = item as MediaVideo & { mediaType: 'video' }
        return {
          preview: vid.thumbnailUrl,
          type: 'video' as const,
          uploaded: true,
          videoId: vid.id,
          thumbnailUrl: vid.thumbnailUrl,  // Required for Meta API
          isFromLibrary: true,
          libraryId: vid.id,
          name: vid.title
        }
      }
    })

    // Add to existing creatives (up to 6 max)
    setState(s => ({
      ...s,
      creatives: [...s.creatives, ...newCreatives].slice(0, 6)
    }))
  }

  // Upload creatives directly to Meta
  // Returns the updated creatives array (don't rely on state due to async)
  const uploadCreatives = async (): Promise<{ success: boolean; creatives: Creative[] }> => {
    if (!user || !accessToken) {
      setError('Unable to upload - missing authentication')
      return { success: false, creatives: state.creatives }
    }

    const updatedCreatives = [...state.creatives]
    let allUploaded = true
    const cleanAdAccountId = state.adAccountId.replace(/^act_/, '')

    for (let i = 0; i < updatedCreatives.length; i++) {
      const creative = updatedCreatives[i]

      // Skip already uploaded or library items
      if (creative.uploaded || creative.isFromLibrary) continue
      if (!creative.file) continue

      updatedCreatives[i] = { ...creative, uploading: true, uploadProgress: 0 }
      setState(s => ({ ...s, creatives: [...updatedCreatives] }))

      try {
        const onProgress = (progress: number) => {
          updatedCreatives[i] = { ...updatedCreatives[i], uploadProgress: progress }
          setState(s => ({ ...s, creatives: [...updatedCreatives] }))
        }

        let result

        if (creative.type === 'image') {
          result = await uploadImageToMeta(creative.file, accessToken, cleanAdAccountId)
        } else {
          result = await uploadVideoToMeta(creative.file, accessToken, cleanAdAccountId, onProgress)
        }

        console.log('Upload result:', result)

        if (result.success) {
          updatedCreatives[i] = {
            ...creative,
            uploading: false,
            uploaded: true,
            uploadProgress: 100,
            imageHash: result.imageHash,
            videoId: result.videoId,
            thumbnailUrl: result.thumbnailUrl,
            thumbnailHash: result.thumbnailHash
          }
        } else {
          updatedCreatives[i] = { ...creative, uploading: false, uploadProgress: 0 }
          console.error('Upload failed:', result.error)
          allUploaded = false
        }
      } catch (err) {
        console.error('Upload error:', err)
        updatedCreatives[i] = { ...creative, uploading: false, uploadProgress: 0 }
        allUploaded = false
      }

      setState(s => ({ ...s, creatives: [...updatedCreatives] }))
    }

    return { success: allUploaded, creatives: updatedCreatives }
  }

  // Submit
  const handleSubmit = async () => {
    if (!user) return

    setSubmitting(true)
    setError(null)

    try {
      let res: Response
      let entityLabel: string
      let creativesWithHashes: { type: string; imageHash?: string; videoId?: string; thumbnailUrl?: string; thumbnailHash?: string; fileName: string }[] = []

      // Performance Set skips creative upload - it reuses existing creatives
      if (state.entityType !== 'performance-set') {
        setDeploymentPhase('Uploading creatives to Meta...')

        // First upload any remaining creatives
        const uploadResult = await uploadCreatives()
        if (!uploadResult.success) {
          throw new Error('Failed to upload some creatives')
        }

        // Use the returned creatives (not state, due to async setState)
        creativesWithHashes = uploadResult.creatives.map(c => ({
          type: c.type,
          imageHash: c.imageHash,
          videoId: c.videoId,
          thumbnailUrl: c.thumbnailUrl,
          thumbnailHash: c.thumbnailHash,
          fileName: c.name || c.file?.name || 'Untitled'
        }))
      }

      // Route to correct API based on entity type
      if (state.entityType === 'ad') {
        // Create just an ad
        setDeploymentPhase('Creating ad...')
        entityLabel = 'ad'

        res = await fetch('/api/meta/create-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: state.adAccountId,
            adsetId: state.selectedAdsetId,
            pageId: state.pageId,
            adName: state.headline || 'New Ad',
            objective: state.selectedCampaignObjective || 'conversions',
            formId: state.selectedCampaignObjective === 'leads' ? state.selectedFormId : undefined,
            creatives: creativesWithHashes,
            primaryText: state.primaryText,
            headline: state.headline,
            description: state.description,
            websiteUrl: state.websiteUrl,
            urlTags: state.autoInjectUTMs ? KILLSCALE_UTM_TAGS : undefined,
            ctaType: state.ctaType
          })
        })

      } else if (state.entityType === 'adset') {
        // Create ad set + ads
        setDeploymentPhase('Creating ad set and ads...')
        entityLabel = 'ad set'

        res = await fetch('/api/meta/create-adset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: state.adAccountId,
            campaignId: state.selectedCampaignId,
            pageId: state.pageId,
            adsetName: state.adsetName,
            objective: state.selectedCampaignObjective || 'conversions',
            conversionEvent: state.selectedCampaignObjective === 'conversions' ? state.conversionEvent : undefined,
            formId: state.selectedCampaignObjective === 'leads' ? state.selectedFormId : undefined,
            dailyBudget: state.adsetDailyBudget,
            isCBO: state.selectedCampaignIsCBO,
            hasSpendCap: state.adsetHasSpendCap,
            specialAdCategory: state.specialAdCategory,
            locationTarget: state.locationType === 'city'
              ? {
                  type: 'city',
                  key: state.locationKey,
                  name: state.locationName,
                  radius: state.locationRadius
                }
              : {
                  type: 'country',
                  countries: ['US']
                },
            creatives: creativesWithHashes,
            primaryText: state.primaryText,
            headline: state.headline,
            description: state.description,
            websiteUrl: state.websiteUrl,
            urlTags: state.autoInjectUTMs ? KILLSCALE_UTM_TAGS : undefined,
            ctaType: state.ctaType,
            creativeEnhancements: state.creativeEnhancements,
            targetingMode: state.targetingMode,
            selectedInterests: state.targetingMode === 'custom' ? state.selectedInterests : undefined,
            selectedBehaviors: state.targetingMode === 'custom' ? state.selectedBehaviors : undefined,
            ageMin: state.ageMin,
            ageMax: state.ageMax
          })
        })

      } else if (state.entityType === 'performance-set') {
        // Performance Set - CBO campaign from starred ads (reuse existing creatives)
        setDeploymentPhase('Fetching creatives from starred ads...')
        entityLabel = 'Performance Set'

        // Get the selected starred ads from the starredAds prop
        const selectedAds = starredAds.filter(ad => state.selectedStarredAds.includes(ad.ad_id))
        const adIds = selectedAds.map(ad => ad.ad_id).join(',')

        // Fetch creative IDs from the source ads
        const creativeRes = await fetch(`/api/meta/ad-creative?adIds=${adIds}&userId=${user.id}`)
        const creativeData = await creativeRes.json()

        if (!creativeRes.ok || !creativeData.creatives || creativeData.creatives.length === 0) {
          throw new Error(creativeData.error || 'Failed to fetch creatives from starred ads')
        }

        // Map creatives to the format expected by create-campaign
        const existingCreativeIds = creativeData.creatives.map((c: { adId: string; adName: string; creativeId: string }) => ({
          adId: c.adId,
          adName: c.adName,
          creativeId: c.creativeId
        }))

        setDeploymentPhase('Creating Performance Set...')

        res = await fetch('/api/meta/create-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: state.adAccountId,
            pageId: state.pageId,
            budgetType: 'cbo', // Performance Set is always CBO
            campaignName: state.campaignName || `Performance Set - ${new Date().toLocaleDateString()}`,
            objective: state.objective,
            conversionEvent: state.objective === 'conversions' ? state.conversionEvent : undefined,
            formId: state.objective === 'leads' ? state.selectedFormId : undefined,
            dailyBudget: state.dailyBudget,
            specialAdCategory: state.specialAdCategory,
            locationTarget: state.locationType === 'city'
              ? {
                  type: 'city',
                  key: state.locationKey,
                  name: state.locationName,
                  radius: state.locationRadius
                }
              : {
                  type: 'country',
                  countries: ['US']
                },
            // Performance Set specific - reuse existing creatives
            isPerformanceSet: true,
            existingCreativeIds,
            creativeEnhancements: state.creativeEnhancements,
            targetingMode: state.targetingMode,
            selectedInterests: state.targetingMode === 'custom' ? state.selectedInterests : undefined,
            selectedBehaviors: state.targetingMode === 'custom' ? state.selectedBehaviors : undefined,
            ageMin: state.ageMin,
            ageMax: state.ageMax
          })
        })

      } else {
        // Full campaign creation (existing behavior)
        setDeploymentPhase('Creating campaign, ad set, and ads...')
        entityLabel = 'campaign'

        res = await fetch('/api/meta/create-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: state.adAccountId,
            pageId: state.pageId,
            budgetType: state.budgetType,
            existingCampaignId: state.budgetType === 'abo' && state.aboOption === 'existing'
              ? state.existingCampaignId
              : undefined,
            campaignName: state.campaignName,
            objective: state.objective,
            conversionEvent: state.objective === 'conversions' ? state.conversionEvent : undefined,
            formId: state.objective === 'leads' ? state.selectedFormId : undefined,
            dailyBudget: state.dailyBudget,
            specialAdCategory: state.specialAdCategory,
            locationTarget: state.locationType === 'city'
              ? {
                  type: 'city',
                  key: state.locationKey,
                  name: state.locationName,
                  radius: state.locationRadius
                }
              : {
                  type: 'country',
                  countries: ['US']
                },
            creatives: creativesWithHashes,
            primaryText: state.primaryText,
            headline: state.headline,
            description: state.description,
            websiteUrl: state.websiteUrl,
            urlTags: state.autoInjectUTMs ? KILLSCALE_UTM_TAGS : undefined,
            ctaType: state.ctaType,
            creativeEnhancements: state.creativeEnhancements,
            targetingMode: state.targetingMode,
            selectedInterests: state.targetingMode === 'custom' ? state.selectedInterests : undefined,
            selectedBehaviors: state.targetingMode === 'custom' ? state.selectedBehaviors : undefined,
            ageMin: state.ageMin,
            ageMax: state.ageMax
          })
        })
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to create ${entityLabel}`)
      }

      // Sync data so the new campaign shows up immediately
      setDeploymentPhase('Syncing new campaign data...')
      try {
        const syncRes = await fetch('/api/meta/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            adAccountId: state.adAccountId,
            datePreset: 'last_7d',
            forceFullSync: true  // Force full sync to pick up new entities
          })
        })
        if (!syncRes.ok) {
          console.warn('Post-creation sync failed, but campaign was created successfully')
        }
      } catch (syncErr) {
        console.warn('Post-creation sync error:', syncErr)
        // Don't fail the whole operation if sync fails - campaign was created
      }

      // Pass Performance Set result if applicable
      if (state.entityType === 'performance-set') {
        onComplete({ usedAdIds: state.selectedStarredAds })
      } else {
        onComplete()
      }
    } catch (err) {
      console.error('Submit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSubmitting(false)
      setDeploymentPhase('')
    }
  }

  // Navigation - branching based on entityType
  const getNextStep = (): Step | null => {
    switch (step) {
      case 'account':
        return 'entity-type'

      case 'entity-type':
        if (state.entityType === 'campaign') {
          return 'budget'
        }
        if (state.entityType === 'performance-set') {
          return 'starred-ads'
        }
        // Both adset and ad paths go to select-campaign
        return 'select-campaign'

      case 'starred-ads':
        // Performance Set path: go to details (campaign name, objective)
        return 'details'

      case 'select-campaign':
        if (state.entityType === 'adset') {
          return 'adset-details'
        }
        // Ad path goes to select-adset
        return 'select-adset'

      case 'select-adset':
        // Ad path skips targeting, goes straight to creatives
        return 'creatives'

      case 'adset-details':
        // Ad set path: check objective from selected campaign
        return state.selectedCampaignObjective === 'leads' ? 'leadform' : 'targeting'

      // Campaign path (unchanged)
      case 'budget':
        return state.budgetType === 'abo' ? 'abo-options' : 'details'
      case 'abo-options':
        return 'details'
      case 'details':
        if (state.entityType === 'performance-set') {
          // Performance Set: skip leadform, go to targeting (always build fresh)
          return 'targeting'
        }
        return state.objective === 'leads' ? 'leadform' : 'targeting'

      // Shared steps
      case 'leadform':
        if (state.entityType === 'ad') {
          return 'creatives' // Ad path skips targeting
        }
        return 'targeting'
      case 'targeting':
        if (state.entityType === 'performance-set') {
          // Performance Set: skip creatives and copy, go straight to review
          return 'review'
        }
        return 'creatives'
      case 'creatives':
        return 'copy'
      case 'copy':
        return 'review'
      case 'review':
        return null
    }
  }

  const getPrevStep = (): Step | null => {
    switch (step) {
      case 'account':
        return null
      case 'entity-type':
        return 'account'

      case 'starred-ads':
        return 'entity-type'

      case 'select-campaign':
        return 'entity-type'
      case 'select-adset':
        return 'select-campaign'

      case 'adset-details':
        return 'select-campaign'

      // Campaign path
      case 'budget':
        return 'entity-type'
      case 'abo-options':
        return 'budget'
      case 'details':
        if (state.entityType === 'performance-set') {
          return 'starred-ads'
        }
        return state.budgetType === 'abo' ? 'abo-options' : 'budget'

      // Shared steps with branching
      case 'leadform':
        if (state.entityType === 'campaign') return 'details'
        if (state.entityType === 'adset') return 'adset-details'
        return 'select-adset' // Ad path shouldn't reach leadform, but fallback
      case 'targeting':
        if (state.entityType === 'performance-set') {
          return 'details'
        }
        if (state.entityType === 'campaign') {
          return state.objective === 'leads' ? 'leadform' : 'details'
        }
        // Ad set path
        return state.selectedCampaignObjective === 'leads' ? 'leadform' : 'adset-details'
      case 'creatives':
        if (state.entityType === 'ad') return 'select-adset'
        return 'targeting'
      case 'copy':
        return 'creatives'
      case 'review':
        if (state.entityType === 'performance-set') {
          return 'targeting' // Performance Set skips creatives and copy
        }
        return 'copy'
    }
  }

  const canProceed = (): boolean => {
    switch (step) {
      case 'account':
        return !!state.pageId

      case 'entity-type':
        return !!state.entityType

      case 'starred-ads':
        return state.selectedStarredAds.length > 0

      case 'select-campaign':
        return !!state.selectedCampaignId

      case 'select-adset':
        return !!state.selectedAdsetId

      case 'adset-details':
        // Name required, budget required for ABO or if spend cap enabled for CBO
        const needsBudget = !state.selectedCampaignIsCBO || state.adsetHasSpendCap
        return !!state.adsetName && (!needsBudget || state.adsetDailyBudget > 0)

      // Campaign path (unchanged)
      case 'budget':
        return true
      case 'abo-options':
        return state.aboOption === 'new' || !!state.existingCampaignId
      case 'details':
        return !!state.campaignName && state.dailyBudget > 0

      // Shared steps
      case 'leadform':
        return !!state.selectedFormId
      case 'targeting':
        const hasLocation = state.locationType === 'country' || !!state.locationKey
        if (state.targetingMode === 'broad') {
          return hasLocation
        }
        return hasLocation && (state.selectedInterests.length > 0 || state.selectedBehaviors.length > 0)
      case 'creatives':
        return state.creatives.length > 0
      case 'copy':
        return !!state.primaryText && !!state.headline && !!state.websiteUrl
      case 'review':
        return true
    }
  }

  const handleNext = () => {
    const next = getNextStep()
    if (next) {
      setStep(next)
      // Scroll to top of page on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleBack = () => {
    const prev = getPrevStep()
    if (prev) {
      setStep(prev)
      // Scroll to top of page on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </div>
    )
  }

  // Step content
  const renderStep = () => {
    switch (step) {
      case 'account':
        // This step is now just for Page selection (ad account comes from sidebar context)
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Select Facebook Page</label>
              <p className="text-xs text-zinc-500 mb-3">
                Choose which Page to use as the advertiser for your ads
              </p>
              {pages.length > 0 ? (
                <>
                  <Select
                    value={state.pageId}
                    onChange={(value) => setState(s => ({ ...s, pageId: value }))}
                    options={pages.map(page => ({ value: page.id, label: page.name }))}
                    placeholder="Select a page..."
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    This Page will be shown as the advertiser on your ads
                  </p>
                </>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-500 font-medium mb-1">No Pages found</p>
                  <p className="text-xs text-zinc-400">
                    To create ads, you need access to a Facebook Page. Please reconnect your Meta account
                    in Settings to grant Page access permissions, or make sure you're an admin of at least one Page.
                  </p>
                </div>
              )}
            </div>
          </div>
        )

      case 'entity-type':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">What do you want to create?</p>

            <button
              onClick={() => setState(s => ({ ...s, entityType: 'campaign' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.entityType === 'campaign'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <Rocket className="w-5 h-5 text-accent" />
                <span className="font-semibold">Full Campaign</span>
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                Create a new campaign with ad set and ads
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Best for new initiatives</span>
                <span>✓ Full control over structure</span>
              </div>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, entityType: 'adset' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.entityType === 'adset'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <FolderOpen className="w-5 h-5 text-purple-500" />
                <span className="font-semibold">Ad Set</span>
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                Add a new ad set to an existing campaign
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Test new targeting</span>
                <span>✓ Use proven campaign</span>
              </div>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, entityType: 'ad' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.entityType === 'ad'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <ImageIcon className="w-5 h-5 text-green-500" />
                <span className="font-semibold">Ad</span>
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                Add a new ad to an existing ad set
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Test new creative</span>
                <span>✓ Fastest option</span>
              </div>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, entityType: 'performance-set' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.entityType === 'performance-set'
                  ? "border-yellow-500 bg-yellow-500/10"
                  : "border-border hover:border-zinc-600",
                starredAds.length === 0 && "opacity-50 cursor-not-allowed"
              )}
              disabled={starredAds.length === 0}
            >
              <div className="flex items-center gap-3 mb-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">Performance Set</span>
                {starredAds.length > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">
                    {starredAds.length} starred
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                {starredAds.length > 0
                  ? "Build a CBO campaign from your starred winners"
                  : "Star winning ads from the Performance table first"
                }
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Scale proven winners</span>
                <span>✓ Fresh targeting</span>
              </div>
            </button>
          </div>
        )

      case 'select-campaign':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">
              Select which campaign to add your {state.entityType === 'adset' ? 'ad set' : 'ad'} to
            </p>

            {existingCampaigns.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {existingCampaigns.map((campaign) => {
                  // Map Meta objective to readable form
                  const objectiveMap: Record<string, 'leads' | 'conversions' | 'traffic'> = {
                    'OUTCOME_LEADS': 'leads',
                    'OUTCOME_SALES': 'conversions',
                    'OUTCOME_TRAFFIC': 'traffic',
                    'LEAD_GENERATION': 'leads',
                    'CONVERSIONS': 'conversions',
                    'LINK_CLICKS': 'traffic'
                  }
                  const mappedObjective = campaign.objective ? objectiveMap[campaign.objective] || null : null
                  const objectiveLabel = mappedObjective === 'leads' ? 'Leads' :
                    mappedObjective === 'conversions' ? 'Conversions' :
                    mappedObjective === 'traffic' ? 'Traffic' : 'Unknown'

                  return (
                    <button
                      key={campaign.id}
                      onClick={() => {
                        setState(s => ({
                          ...s,
                          selectedCampaignId: campaign.id,
                          selectedCampaignName: campaign.name,
                          selectedCampaignObjective: mappedObjective,
                          selectedCampaignIsCBO: campaign.isCBO ?? false
                        }))
                        // Load ad sets if user is creating an ad
                        if (state.entityType === 'ad') {
                          loadAdsets(campaign.id)
                        }
                      }}
                      className={cn(
                        "w-full p-4 rounded-xl border text-left transition-all",
                        state.selectedCampaignId === campaign.id
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                            state.selectedCampaignId === campaign.id
                              ? "border-accent bg-accent"
                              : "border-zinc-500"
                          )}>
                            {state.selectedCampaignId === campaign.id && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <div>
                            <span className="font-medium">{campaign.name}</span>
                            <p className="text-xs text-zinc-500">
                              {objectiveLabel} • {campaign.adSetCount || 0} ad sets • {campaign.adCount || 0} ads
                            </p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-1 rounded",
                          campaign.isCBO
                            ? "bg-yellow-500/20 text-yellow-500"
                            : "bg-zinc-500/20 text-zinc-400"
                        )}>
                          {campaign.isCBO ? 'CBO' : 'ABO'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-500 font-medium mb-1">No campaigns found</p>
                <p className="text-xs text-zinc-400">
                  You need at least one existing campaign to add an ad set or ad to it.
                  Try creating a full campaign first.
                </p>
              </div>
            )}

            {state.selectedCampaignId && (
              <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
                <p className="text-xs text-zinc-400">
                  {state.entityType === 'adset'
                    ? `Your ad set will inherit the "${state.selectedCampaignObjective}" objective from this campaign.`
                    : 'Next, select which ad set to add your ad to.'}
                </p>
              </div>
            )}
          </div>
        )

      case 'starred-ads':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">
              Select which starred ads to include in your Performance Set.
              These winning creatives will be combined into a single CBO campaign.
            </p>

            {/* Select All / Deselect All */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">
                {state.selectedStarredAds.length} of {starredAds.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setState(s => ({ ...s, selectedStarredAds: starredAds.map(ad => ad.ad_id) }))}
                  className="text-xs text-accent hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={() => setState(s => ({ ...s, selectedStarredAds: [] }))}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {starredAds.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {starredAds.map((ad) => {
                  const isSelected = state.selectedStarredAds.includes(ad.ad_id)
                  return (
                    <button
                      key={ad.ad_id}
                      onClick={() => {
                        setState(s => ({
                          ...s,
                          selectedStarredAds: isSelected
                            ? s.selectedStarredAds.filter(id => id !== ad.ad_id)
                            : [...s.selectedStarredAds, ad.ad_id]
                        }))
                      }}
                      className={cn(
                        "w-full p-4 rounded-xl border text-left transition-all",
                        isSelected
                          ? "border-yellow-500 bg-yellow-500/10"
                          : "border-border hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center",
                            isSelected
                              ? "border-yellow-500 bg-yellow-500"
                              : "border-zinc-500"
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-black" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{ad.ad_name}</span>
                              {ad.star_count && ad.star_count > 1 && (
                                <span className={cn(
                                  'text-xs font-bold px-1.5 py-0.5 rounded',
                                  ad.star_count >= 3
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-yellow-500/20 text-yellow-500'
                                )}>
                                  ⭐×{ad.star_count}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500">
                              {ad.campaign_name} → {ad.adset_name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold text-emerald-400">
                            {ad.roas.toFixed(2)}x
                          </div>
                          <div className="text-xs text-zinc-500">
                            ${ad.spend.toFixed(0)} spent
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-500 font-medium mb-1">No starred ads</p>
                <p className="text-xs text-zinc-400">
                  Star winning ads from the Performance table first, then come back here.
                </p>
              </div>
            )}

            {state.selectedStarredAds.length > 0 && (
              <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
                <p className="text-xs text-zinc-400">
                  A new CBO campaign will be created with all {state.selectedStarredAds.length} ads in a single ad set.
                  Targeting will be built fresh on the next step.
                </p>
              </div>
            )}
          </div>
        )

      case 'select-adset':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-800/50 rounded-lg mb-4">
              <p className="text-xs text-zinc-400">
                Campaign: <span className="text-white font-medium">{state.selectedCampaignName}</span>
              </p>
            </div>

            <p className="text-sm text-zinc-400">Select which ad set to add your ad to</p>

            {loadingAdsets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : existingAdsets.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {existingAdsets.map((adset) => (
                  <button
                    key={adset.id}
                    onClick={() => setState(s => ({
                      ...s,
                      selectedAdsetId: adset.id,
                      selectedAdsetName: adset.name
                    }))}
                    className={cn(
                      "w-full p-4 rounded-xl border text-left transition-all",
                      state.selectedAdsetId === adset.id
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-zinc-600"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        state.selectedAdsetId === adset.id
                          ? "border-accent bg-accent"
                          : "border-zinc-500"
                      )}>
                        {state.selectedAdsetId === adset.id && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div>
                        <span className="font-medium">{adset.name}</span>
                        <p className="text-xs text-zinc-500">
                          {adset.dailyBudget ? `$${adset.dailyBudget}/day` : 'Budget managed by campaign'}
                          {adset.status && ` • ${adset.status}`}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-500 font-medium mb-1">No ad sets found</p>
                <p className="text-xs text-zinc-400">
                  This campaign doesn't have any ad sets yet. Try creating an ad set first.
                </p>
              </div>
            )}

            {state.selectedAdsetId && (
              <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
                <p className="text-xs text-zinc-400">
                  Your ad will use the targeting settings from this ad set.
                </p>
              </div>
            )}
          </div>
        )

      case 'adset-details':
        return (
          <div className="space-y-6">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400">
                Adding to: <span className="text-white font-medium">{state.selectedCampaignName}</span>
                <span className="ml-2 text-zinc-500">
                  ({state.selectedCampaignObjective === 'leads' ? 'Leads' :
                    state.selectedCampaignObjective === 'conversions' ? 'Conversions' : 'Traffic'})
                </span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Ad Set Name</label>
              <input
                type="text"
                value={state.adsetName}
                onChange={(e) => setState(s => ({ ...s, adsetName: e.target.value }))}
                placeholder="e.g., Broad Audience - Cities"
                className="w-full px-4 py-3 bg-zinc-800 border border-border rounded-lg focus:outline-none focus:border-accent"
              />
            </div>

            {!state.selectedCampaignIsCBO ? (
              // ABO campaign - budget required
              <div>
                <label className="block text-sm font-medium mb-2">Daily Budget</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                  <input
                    type="number"
                    value={state.adsetDailyBudget}
                    onChange={(e) => setState(s => ({ ...s, adsetDailyBudget: parseFloat(e.target.value) || 0 }))}
                    className="w-full pl-8 pr-16 py-3 bg-zinc-800 border border-border rounded-lg focus:outline-none focus:border-accent"
                    min="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">/day</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  This is an ABO campaign - each ad set manages its own budget
                </p>
              </div>
            ) : (
              // CBO campaign - optional spend cap
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.adsetHasSpendCap}
                    onChange={(e) => setState(s => ({ ...s, adsetHasSpendCap: e.target.checked }))}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-accent focus:ring-accent"
                  />
                  <span className="text-sm">Set a daily spend cap for this ad set</span>
                </label>

                {state.adsetHasSpendCap && (
                  <div className="mt-3">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                      <input
                        type="number"
                        value={state.adsetDailyBudget}
                        onChange={(e) => setState(s => ({ ...s, adsetDailyBudget: parseFloat(e.target.value) || 0 }))}
                        className="w-full pl-8 pr-16 py-3 bg-zinc-800 border border-border rounded-lg focus:outline-none focus:border-accent"
                        min="1"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">/day max</span>
                    </div>
                  </div>
                )}

                <p className="text-xs text-zinc-500 mt-2">
                  This is a CBO campaign - the campaign budget is distributed automatically.
                  {!state.adsetHasSpendCap && ' You can optionally set a maximum daily spend for this ad set.'}
                </p>
              </div>
            )}
          </div>
        )

      case 'budget':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">Choose how your budget is managed</p>

            <button
              onClick={() => setState(s => ({ ...s, budgetType: 'cbo' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.budgetType === 'cbo'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">CBO - Andromeda Recommended</span>
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                Budget at campaign level. Meta distributes spend to best-performing ads automatically.
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Best for new campaigns</span>
                <span>✓ Recommended by Meta</span>
              </div>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, budgetType: 'abo' }))}
              className={cn(
                "w-full p-5 rounded-xl border text-left transition-all",
                state.budgetType === 'abo'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-zinc-400" />
                <span className="font-semibold">ABO - Legacy</span>
              </div>
              <p className="text-sm text-zinc-400 ml-8">
                Budget at ad set level. You control exactly how much each ad set spends.
              </p>
              <div className="flex gap-4 ml-8 mt-3 text-xs text-zinc-500">
                <span>✓ Good for adding to existing</span>
                <span>✓ More manual control</span>
              </div>
            </button>
          </div>
        )

      case 'abo-options':
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400 mb-4">Choose how to create your ABO campaign</p>

            <button
              onClick={() => setState(s => ({ ...s, aboOption: 'new' }))}
              className={cn(
                "w-full p-4 rounded-xl border text-left transition-all",
                state.aboOption === 'new'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2",
                  state.aboOption === 'new' ? "border-accent bg-accent" : "border-zinc-500"
                )} />
                <div>
                  <span className="font-medium">Create new ABO campaign</span>
                  <p className="text-sm text-zinc-500">Start fresh with a new campaign</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setState(s => ({ ...s, aboOption: 'existing' }))}
              className={cn(
                "w-full p-4 rounded-xl border text-left transition-all",
                state.aboOption === 'existing'
                  ? "border-accent bg-accent/10"
                  : "border-border hover:border-zinc-600"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2",
                  state.aboOption === 'existing' ? "border-accent bg-accent" : "border-zinc-500"
                )} />
                <div>
                  <span className="font-medium">Add to existing campaign</span>
                  <p className="text-sm text-zinc-500">Add a new ad set to one of your campaigns</p>
                </div>
              </div>
            </button>

            {state.aboOption === 'existing' && (
              <div className="mt-4 ml-7">
                <label className="block text-sm font-medium mb-2">Select Campaign</label>
                <Select
                  value={state.existingCampaignId}
                  onChange={(value) => setState(s => ({ ...s, existingCampaignId: value }))}
                  options={existingCampaigns.map(c => ({
                    value: c.id,
                    label: `${c.name} (${c.status})${c.adSetCount ? ` - ${c.adSetCount} ad set${c.adSetCount !== 1 ? 's' : ''}, ${c.adCount} ad${c.adCount !== 1 ? 's' : ''}` : ''}`
                  }))}
                  placeholder="Choose a campaign..."
                />
              </div>
            )}
          </div>
        )

      case 'details':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Name</label>
              <input
                type="text"
                value={state.campaignName}
                onChange={(e) => setState(s => ({ ...s, campaignName: e.target.value }))}
                placeholder="Summer Driveway Special"
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Objective</label>
              <Select
                value={state.objective}
                onChange={(value) => setState(s => ({ ...s, objective: value as WizardState['objective'] }))}
                options={OBJECTIVES.map(obj => ({ value: obj.value, label: obj.label }))}
              />
            </div>

            {/* Conversion Event - only shown for conversions objective */}
            {state.objective === 'conversions' && (
              <div>
                <label className="block text-sm font-medium mb-2">Conversion Event</label>
                <p className="text-xs text-zinc-500 mb-3">
                  Select the event your pixel sends when a conversion happens
                </p>
                {loadingPixelEvents ? (
                  <div className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-zinc-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading events...
                  </div>
                ) : (
                  <Select
                    value={state.conversionEvent}
                    onChange={(value) => setState(s => ({ ...s, conversionEvent: value }))}
                    options={conversionEvents}
                  />
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Daily Budget</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  type="number"
                  value={state.dailyBudget}
                  onChange={(e) => setState(s => ({ ...s, dailyBudget: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-bg-dark border border-border rounded-lg pl-8 pr-16 py-3 text-white focus:outline-none focus:border-accent"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">/day</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Start with $20-50/day. Scale winners.
              </p>
            </div>
          </div>
        )

      case 'leadform':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Select Lead Form</label>
              <p className="text-xs text-zinc-500 mb-3">
                Choose an Instant Form from your Facebook Page to collect leads
              </p>

              {loadingLeadForms ? (
                <div className="w-full bg-bg-dark border border-border rounded-lg px-4 py-8 text-zinc-500 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Loading forms...</span>
                </div>
              ) : leadFormsError ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm text-red-400 font-medium mb-1">Error loading forms</p>
                  <p className="text-xs text-zinc-400">{leadFormsError}</p>
                </div>
              ) : leadForms.length > 0 ? (
                <div className="space-y-2">
                  {leadForms.map((form) => (
                    <button
                      key={form.id}
                      onClick={() => setState(s => ({ ...s, selectedFormId: form.id }))}
                      className={cn(
                        "w-full p-4 rounded-xl border text-left transition-all",
                        state.selectedFormId === form.id
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex-shrink-0",
                          state.selectedFormId === form.id ? "border-accent bg-accent" : "border-zinc-500"
                        )}>
                          {state.selectedFormId === form.id && (
                            <div className="w-full h-full rounded-full bg-white scale-50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{form.name}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {form.questions.slice(0, 3).join(', ')}
                            {form.questions.length > 3 && ` +${form.questions.length - 3} more`}
                            {' • '}
                            {new Date(form.createdTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-500 font-medium mb-1">No forms found</p>
                  <p className="text-xs text-zinc-400">
                    Create a Lead Form in Facebook before creating a lead generation campaign.
                  </p>
                </div>
              )}
            </div>

            {/* Link to create form in Facebook */}
            <div className="pt-2">
              <a
                href="https://business.facebook.com/latest/instant_forms"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
              >
                <span>Create new form in Facebook</span>
                <span>→</span>
              </a>
            </div>

            {/* Refresh button */}
            {!loadingLeadForms && (
              <button
                onClick={loadLeadForms}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ↻ Refresh form list
              </button>
            )}
          </div>
        )

      case 'targeting':
        return (
          <div className="space-y-6">
            {/* Special Ad Categories */}
            <div>
              <label className="block text-sm font-medium mb-2">Special Ad Category (if applicable)</label>
              <div className="space-y-2">
                {[
                  { value: null, label: 'None of the below' },
                  { value: 'HOUSING', label: 'Housing (real estate, rentals, home services)' },
                  { value: 'CREDIT', label: 'Credit (loans, insurance, financial services)' },
                  { value: 'EMPLOYMENT', label: 'Employment (job listings, recruiting)' }
                ].map((cat) => (
                  <button
                    key={cat.value || 'none'}
                    onClick={() => setState(s => ({ ...s, specialAdCategory: cat.value as WizardState['specialAdCategory'] }))}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3",
                      state.specialAdCategory === cat.value
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-zinc-600"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      state.specialAdCategory === cat.value ? "border-accent bg-accent" : "border-zinc-500"
                    )}>
                      {state.specialAdCategory === cat.value && (
                        <Check className="w-2.5 h-2.5 text-white" />
                      )}
                    </div>
                    {cat.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Meta requires this for certain industries. If unsure, select "None".
              </p>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium mb-2">Service Area</label>
              <div className="space-y-3">
                <button
                  onClick={() => setState(s => ({ ...s, locationType: 'country', locationKey: '', locationName: '' }))}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3",
                    state.locationType === 'country'
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2",
                    state.locationType === 'country' ? "border-accent bg-accent" : "border-zinc-500"
                  )} />
                  Target entire United States (default)
                </button>

                <button
                  onClick={() => setState(s => ({ ...s, locationType: 'city' }))}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3",
                    state.locationType === 'city'
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2",
                    state.locationType === 'city' ? "border-accent bg-accent" : "border-zinc-500"
                  )} />
                  Target specific city + radius
                </button>
              </div>

              {state.locationType === 'city' && (
                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={state.locationName || locationQuery}
                      onChange={(e) => {
                        setLocationQuery(e.target.value)
                        setState(s => ({ ...s, locationName: '', locationKey: '' }))
                      }}
                      placeholder="Search city..."
                      className="w-full bg-bg-dark border border-border rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-accent"
                    />
                    {searchingLocations && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                    )}
                  </div>

                  {locationResults.length > 0 && !state.locationKey && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      {locationResults.slice(0, 5).map((loc) => (
                        <button
                          key={loc.key}
                          onClick={() => {
                            setState(s => ({
                              ...s,
                              locationKey: loc.key,
                              locationName: `${loc.name}, ${loc.region}`
                            }))
                            setLocationQuery('')
                            setLocationResults([])
                          }}
                          className="w-full px-4 py-3 text-left text-sm hover:bg-bg-hover border-b border-border last:border-0"
                        >
                          {loc.name}, {loc.region}, {loc.countryName}
                        </button>
                      ))}
                    </div>
                  )}

                  {state.locationKey && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">Radius:</span>
                      <Select
                        value={state.locationRadius.toString()}
                        onChange={(value) => setState(s => ({ ...s, locationRadius: parseInt(value) }))}
                        options={RADIUS_OPTIONS.map(r => ({ value: r.toString(), label: `${r} miles` }))}
                        className="w-32"
                      />
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-500 mt-3">
                Great for local service businesses like pressure washing, roofing, landscaping.
              </p>
            </div>

            {/* Age Range */}
            <div>
              <label className="block text-sm font-medium mb-2">Age Range</label>
              <div className="flex items-center gap-3">
                <select
                  value={state.ageMin}
                  onChange={(e) => {
                    const newMin = parseInt(e.target.value)
                    setState(s => ({
                      ...s,
                      ageMin: newMin,
                      // Ensure max is always >= min
                      ageMax: Math.max(s.ageMax, newMin)
                    }))
                  }}
                  className="bg-bg-dark border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
                >
                  {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
                    <option key={age} value={age}>{age}</option>
                  ))}
                </select>
                <span className="text-zinc-400">to</span>
                <select
                  value={state.ageMax}
                  onChange={(e) => {
                    const newMax = parseInt(e.target.value)
                    setState(s => ({
                      ...s,
                      ageMax: newMax,
                      // Ensure min is always <= max
                      ageMin: Math.min(s.ageMin, newMax)
                    }))
                  }}
                  className="bg-bg-dark border border-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
                >
                  {[18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(age => (
                    <option key={age} value={age}>{age === 65 ? '65+' : age}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Meta supports ages 18-65+ for targeting
              </p>
            </div>

            {/* Audience Targeting Mode */}
            <div>
              <label className="block text-sm font-medium mb-2">Audience Targeting</label>
              <div className="space-y-3">
                <button
                  onClick={() => setState(s => ({
                    ...s,
                    targetingMode: 'broad',
                    selectedInterests: [],
                    selectedBehaviors: []
                  }))}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left text-sm transition-all",
                    state.targetingMode === 'broad'
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2",
                      state.targetingMode === 'broad' ? "border-accent bg-accent" : "border-zinc-500"
                    )} />
                    <div>
                      <span className="font-medium">Broad Audience</span>
                      <span className="text-verdict-scale text-xs ml-2">(Recommended)</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 ml-7">
                    Let Meta's Advantage+ find your best customers automatically
                  </p>
                </button>

                <button
                  onClick={() => {
                    if (!state.specialAdCategory) {
                      setState(s => ({ ...s, targetingMode: 'custom' }))
                    }
                  }}
                  disabled={!!state.specialAdCategory}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left text-sm transition-all",
                    state.targetingMode === 'custom'
                      ? "border-accent bg-accent/10"
                      : state.specialAdCategory
                        ? "border-border opacity-50 cursor-not-allowed"
                        : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2",
                      state.targetingMode === 'custom' ? "border-accent bg-accent" : "border-zinc-500"
                    )} />
                    <span className="font-medium">Custom Targeting</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 ml-7">
                    {state.specialAdCategory
                      ? "Not available for Special Ad Categories"
                      : "Specify interests and behaviors to narrow your audience"
                    }
                  </p>
                </button>
              </div>

              {/* Custom Targeting Options */}
              {state.targetingMode === 'custom' && !state.specialAdCategory && (
                <div className="mt-4 space-y-4 pl-4 border-l-2 border-accent/30">
                  {/* Interests Search */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Interests</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        value={interestQuery}
                        onChange={(e) => setInterestQuery(e.target.value)}
                        placeholder="Search interests (e.g., fitness, cooking)..."
                        className="w-full bg-bg-dark border border-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"
                      />
                      {searchingInterests && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                      )}
                    </div>

                    {/* Interest Results Dropdown */}
                    {interestResults.length > 0 && (
                      <div className="mt-1 border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        {interestResults.map((opt) => {
                          const isSelected = state.selectedInterests.some(i => i.id === opt.id)
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                if (!isSelected) {
                                  setState(s => ({
                                    ...s,
                                    selectedInterests: [...s.selectedInterests, opt]
                                  }))
                                }
                                setInterestQuery('')
                                setInterestResults([])
                              }}
                              disabled={isSelected}
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm border-b border-border last:border-0",
                                isSelected
                                  ? "bg-accent/10 text-zinc-500"
                                  : "hover:bg-bg-hover"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span>{opt.name}</span>
                                {isSelected && <Check className="w-4 h-4 text-accent" />}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Selected Interests Chips */}
                    {state.selectedInterests.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {state.selectedInterests.map((interest) => (
                          <span
                            key={interest.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/20 text-accent rounded-full text-xs"
                          >
                            {interest.name}
                            <button
                              onClick={() => setState(s => ({
                                ...s,
                                selectedInterests: s.selectedInterests.filter(i => i.id !== interest.id)
                              }))}
                              className="hover:text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Behaviors Search */}
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Behaviors</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        value={behaviorQuery}
                        onChange={(e) => setBehaviorQuery(e.target.value)}
                        placeholder="Search behaviors (e.g., engaged shoppers)..."
                        className="w-full bg-bg-dark border border-border rounded-lg pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent"
                      />
                      {searchingBehaviors && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                      )}
                    </div>

                    {/* Behavior Results Dropdown */}
                    {behaviorResults.length > 0 && (
                      <div className="mt-1 border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        {behaviorResults.map((opt) => {
                          const isSelected = state.selectedBehaviors.some(b => b.id === opt.id)
                          return (
                            <button
                              key={opt.id}
                              onClick={() => {
                                if (!isSelected) {
                                  setState(s => ({
                                    ...s,
                                    selectedBehaviors: [...s.selectedBehaviors, opt]
                                  }))
                                }
                                setBehaviorQuery('')
                                setBehaviorResults([])
                              }}
                              disabled={isSelected}
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm border-b border-border last:border-0",
                                isSelected
                                  ? "bg-accent/10 text-zinc-500"
                                  : "hover:bg-bg-hover"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span>{opt.name}</span>
                                {isSelected && <Check className="w-4 h-4 text-accent" />}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Selected Behaviors Chips */}
                    {state.selectedBehaviors.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {state.selectedBehaviors.map((behavior) => (
                          <span
                            key={behavior.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs"
                          >
                            {behavior.name}
                            <button
                              onClick={() => setState(s => ({
                                ...s,
                                selectedBehaviors: s.selectedBehaviors.filter(b => b.id !== behavior.id)
                              }))}
                              className="hover:text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500">
                    People matching ANY of these interests or behaviors will see your ads.
                  </p>
                </div>
              )}
            </div>
          </div>
        )

      case 'creatives':
        return (
          <div className="space-y-6">
            {/* Error display */}
            {error && (
              <div className="bg-verdict-kill/10 border border-verdict-kill/30 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-verdict-kill flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-verdict-kill">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-zinc-400 hover:text-white text-xs mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Upload options */}
            <div>
              <label className="block text-sm font-medium mb-3">Add Creatives</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Upload new */}
                <div
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-zinc-600 hover:bg-bg-hover/50 transition-all"
                  onClick={() => document.getElementById('file-input')?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-white mb-1">Upload New</p>
                  <p className="text-xs text-zinc-500">
                    Images up to 30MB • Videos up to 1GB
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Browse library */}
                <button
                  onClick={() => setMediaLibraryOpen(true)}
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-zinc-600 hover:bg-bg-hover/50 transition-all"
                >
                  <FolderOpen className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-white mb-1">Browse Library</p>
                  <p className="text-xs text-zinc-500">
                    Select from existing uploads
                  </p>
                </button>
              </div>
            </div>

            {/* Previews */}
            {state.creatives.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">
                    Selected ({state.creatives.length}/6)
                  </label>
                  {state.creatives.length > 0 && (
                    <button
                      onClick={() => setState(s => ({ ...s, creatives: [] }))}
                      className="text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {state.creatives.map((creative, index) => {
                    // Determine the preview source
                    // - Images: use preview (blob URL or library URL)
                    // - Videos: use thumbnailUrl if available, else preview (generated thumbnail or library thumbnail)
                    const previewSrc = creative.type === 'image'
                      ? creative.preview
                      : (creative.thumbnailUrl || creative.preview)
                    // All creatives should have valid previews now (images use blob, videos use generated thumbnails)
                    const hasValidPreview = !!previewSrc

                    return (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-bg-hover group">
                      {hasValidPreview ? (
                        <img
                          src={previewSrc}
                          alt={creative.name || `Creative ${index + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        // Placeholder for local videos before upload completes
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                          <Video className="w-12 h-12 text-zinc-600" />
                        </div>
                      )}

                      {/* Type badge */}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-xs flex items-center gap-1">
                        {creative.type === 'video' ? (
                          <Video className="w-3 h-3" />
                        ) : (
                          <ImageIcon className="w-3 h-3" />
                        )}
                        {creative.isFromLibrary && (
                          <span className="text-accent">Library</span>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => removeCreative(index)}
                        className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      {/* Upload progress */}
                      {creative.uploading && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          {creative.uploadProgress !== undefined && (
                            <>
                              <span className="text-sm font-medium">{creative.uploadProgress}%</span>
                              <div className="w-3/4 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent transition-all duration-300"
                                  style={{ width: `${creative.uploadProgress}%` }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Uploaded checkmark */}
                      {creative.uploaded && !creative.uploading && (
                        <div className="absolute bottom-2 right-2 w-5 h-5 bg-verdict-scale rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </div>
                      )}

                      {/* File name */}
                      {creative.name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                          <p className="text-xs text-white truncate">{creative.name}</p>
                        </div>
                      )}
                    </div>
                  )})}

                  {state.creatives.length < 6 && (
                    <button
                      onClick={() => document.getElementById('file-input')?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-zinc-600 transition-colors"
                    >
                      <span className="text-2xl text-zinc-500">+</span>
                      <span className="text-xs text-zinc-600">Add more</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Creative settings */}
            <div className="pt-4 border-t border-border">
              <label className="block text-sm font-medium mb-3">Creative Settings</label>
              <div className="space-y-3">
                <button
                  onClick={() => setState(s => ({ ...s, creativeEnhancements: false }))}
                  className={cn(
                    "w-full p-4 rounded-xl border text-left transition-all",
                    !state.creativeEnhancements
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium">KillScale Recommended</span>
                    {!state.creativeEnhancements && (
                      <span className="ml-auto text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Selected</span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 ml-8">
                    Your creatives appear exactly as uploaded. No AI cropping, music, or text variations.
                  </p>
                </button>

                <button
                  onClick={() => setState(s => ({ ...s, creativeEnhancements: true }))}
                  className={cn(
                    "w-full p-4 rounded-xl border text-left transition-all",
                    state.creativeEnhancements
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">🔄</span>
                    <span className="font-medium">Meta Advantage+</span>
                  </div>
                  <p className="text-sm text-zinc-400 ml-8">
                    Meta may enhance your creatives with AI cropping, music, text variations, and more.
                  </p>
                </button>
              </div>
            </div>
          </div>
        )

      case 'copy':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Primary Text</label>
              <textarea
                value={state.primaryText}
                onChange={(e) => setState(s => ({ ...s, primaryText: e.target.value }))}
                placeholder="Your driveway looking rough? We'll make it look brand new..."
                rows={4}
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent resize-none"
              />
              <p className="text-xs text-zinc-500 mt-1">125 characters recommended</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Headline</label>
              <input
                type="text"
                value={state.headline}
                onChange={(e) => setState(s => ({ ...s, headline: e.target.value }))}
                placeholder="Free Quote - Same Day Service"
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-zinc-500 mt-1">40 characters max</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description <span className="text-zinc-500 font-normal">(optional)</span></label>
              <input
                type="text"
                value={state.description}
                onChange={(e) => setState(s => ({ ...s, description: e.target.value }))}
                placeholder="Professional service you can trust"
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-zinc-500 mt-1">Appears below headline in the link preview</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Website URL</label>
              <input
                type="url"
                value={state.websiteUrl}
                onChange={(e) => setState(s => ({ ...s, websiteUrl: e.target.value }))}
                placeholder="https://example.com/quote"
                className="w-full bg-bg-dark border border-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent"
              />
            </div>

            {/* UTM Auto-Injection Toggle */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🎯</span>
                  <div>
                    <span className="font-medium">KillScale Pixel Tracking</span>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Auto-add UTMs for per-ad attribution
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setState(s => ({ ...s, autoInjectUTMs: !s.autoInjectUTMs }))}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors",
                    state.autoInjectUTMs ? "bg-accent" : "bg-zinc-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                      state.autoInjectUTMs && "translate-x-5"
                    )}
                  />
                </button>
              </div>

              {/* Final URL Preview */}
              {state.autoInjectUTMs && state.websiteUrl && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label className="block text-xs text-zinc-500 mb-1.5">Final URL with tracking:</label>
                  <div className="bg-bg-dark rounded-lg px-3 py-2 text-xs font-mono text-zinc-400 break-all">
                    {buildUrlWithUTMs(state.websiteUrl)}
                  </div>
                  <p className="text-xs text-zinc-600 mt-1.5">
                    <code className="text-accent">{'{{ad.id}}'}</code> will be replaced with actual ad ID
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Call to Action</label>
              <Select
                value={state.ctaType}
                onChange={(value) => setState(s => ({ ...s, ctaType: value }))}
                options={CTA_OPTIONS.map(cta => ({ value: cta.value, label: cta.label }))}
              />
            </div>
          </div>
        )

      case 'review':
        // Dynamic review based on entity type
        const entityLabel = state.entityType === 'ad' ? 'Ad' : state.entityType === 'adset' ? 'Ad Set' : 'Campaign'
        const effectiveObjective = state.entityType === 'campaign' ? state.objective : state.selectedCampaignObjective

        return (
          <div className="space-y-6">
            <div className="bg-bg-hover rounded-xl p-5 space-y-4">
              {/* Campaign path */}
              {state.entityType === 'campaign' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Campaign</span>
                    <span className="font-medium">{state.campaignName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Budget Type</span>
                    <span className="font-medium uppercase">{state.budgetType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Objective</span>
                    <span className="font-medium capitalize">{state.objective}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Budget</span>
                    <span className="font-medium">${state.dailyBudget}/day</span>
                  </div>
                </>
              )}

              {/* Ad Set path */}
              {state.entityType === 'adset' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Adding to Campaign</span>
                    <span className="font-medium">{state.selectedCampaignName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Ad Set Name</span>
                    <span className="font-medium">{state.adsetName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Objective</span>
                    <span className="font-medium capitalize">{state.selectedCampaignObjective} (inherited)</span>
                  </div>
                  {(!state.selectedCampaignIsCBO || state.adsetHasSpendCap) && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Budget</span>
                      <span className="font-medium">
                        ${state.adsetDailyBudget}/day {state.selectedCampaignIsCBO ? '(cap)' : ''}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Ad path */}
              {state.entityType === 'ad' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Adding to Campaign</span>
                    <span className="font-medium">{state.selectedCampaignName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Adding to Ad Set</span>
                    <span className="font-medium">{state.selectedAdsetName}</span>
                  </div>
                </>
              )}

              {/* Common fields for campaign and adset */}
              {state.entityType !== 'ad' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Location</span>
                    <span className="font-medium">
                      {state.locationType === 'country' ? 'United States' : `${state.locationName} (${state.locationRadius}mi)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Audience</span>
                    <span className="font-medium">
                      {state.targetingMode === 'broad'
                        ? 'Broad (Advantage+)'
                        : `Custom (${state.selectedInterests.length + state.selectedBehaviors.length} selections)`
                      }
                    </span>
                  </div>
                </>
              )}

              {/* Creatives - all paths */}
              <div className="flex justify-between">
                <span className="text-zinc-400">Creatives</span>
                <span className="font-medium">{state.creatives.length} {state.creatives.length === 1 ? 'creative' : 'creatives'}</span>
              </div>

              {/* Enhancements - campaign and adset only */}
              {state.entityType !== 'ad' && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Enhancements</span>
                  <span className="font-medium">{state.creativeEnhancements ? 'Meta Advantage+' : 'KillScale Recommended'}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {state.entityType === 'campaign' && (
                <>
                  <div className="flex items-center gap-2 text-verdict-scale">
                    <Check className="w-4 h-4" />
                    <span>{state.budgetType === 'cbo' ? 'CBO Campaign' : 'ABO Campaign'} - Budget at {state.budgetType === 'cbo' ? 'campaign' : 'ad set'} level</span>
                  </div>
                  <div className="flex items-center gap-2 text-verdict-scale">
                    <Check className="w-4 h-4" />
                    <span>
                      {state.targetingMode === 'broad'
                        ? '1 Ad Set - Advantage+ Audience (broad)'
                        : `1 Ad Set - Custom targeting (${state.selectedInterests.length + state.selectedBehaviors.length} selections)`
                      }
                    </span>
                  </div>
                </>
              )}
              {state.entityType === 'adset' && (
                <div className="flex items-center gap-2 text-verdict-scale">
                  <Check className="w-4 h-4" />
                  <span>1 Ad Set with new targeting</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-verdict-scale">
                <Check className="w-4 h-4" />
                <span>{state.creatives.length} {state.creatives.length === 1 ? 'Ad' : 'Ads'} - Your creatives + copy</span>
              </div>
              <div className="flex items-center gap-2 text-verdict-scale">
                <Check className="w-4 h-4" />
                <span>Status: PAUSED - Review before activating</span>
              </div>
              <div className={cn(
                "flex items-center gap-2",
                state.autoInjectUTMs ? "text-accent" : "text-zinc-500"
              )}>
                <Check className="w-4 h-4" />
                <span>
                  {state.autoInjectUTMs
                    ? 'KillScale Pixel tracking enabled (UTMs auto-injected)'
                    : 'KillScale Pixel tracking disabled'
                  }
                </span>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-500">{entityLabel} will be created as PAUSED</p>
                <p className="text-zinc-400 mt-1">
                  You can activate it from KillScale or Meta Ads Manager when ready.
                </p>
              </div>
            </div>

            {/* Deployment Progress */}
            {submitting && deploymentPhase && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                  <div>
                    <p className="font-medium text-accent">{deploymentPhase}</p>
                    <p className="text-sm text-zinc-400 mt-1">This may take a moment for video uploads...</p>
                  </div>
                </div>
                {/* Show individual creative progress */}
                {state.creatives.some(c => c.uploading) && (
                  <div className="mt-4 space-y-2">
                    {state.creatives.map((creative, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {creative.type === 'video' ? (
                          <Video className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-zinc-400" />
                        )}
                        <span className="text-zinc-300 truncate flex-1">
                          {creative.name || creative.file?.name || `Creative ${i + 1}`}
                        </span>
                        {creative.uploading ? (
                          <span className="text-accent">{creative.uploadProgress || 0}%</span>
                        ) : creative.uploaded ? (
                          <Check className="w-4 h-4 text-verdict-scale" />
                        ) : (
                          <span className="text-zinc-500">Pending</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-verdict-kill/10 border border-verdict-kill/30 rounded-lg p-4 text-sm text-verdict-kill">
                {error}
              </div>
            )}
          </div>
        )
    }
  }

  const stepTitles: Record<Step, string> = {
    account: 'Select Page',
    'entity-type': 'What to Create',
    'select-campaign': 'Select Campaign',
    'select-adset': 'Select Ad Set',
    'starred-ads': 'Select Starred Ads',
    budget: 'Budget Structure',
    'abo-options': 'ABO Options',
    details: state.entityType === 'performance-set' ? 'Performance Set Details' : 'Campaign Details',
    'adset-details': 'Ad Set Details',
    leadform: 'Lead Form',
    targeting: 'Targeting',
    creatives: 'Creatives',
    copy: 'Ad Copy',
    review: 'Review & Deploy'
  }

  // Check if we should show preview panel (creatives, copy, review steps)
  const showPreviewPanel = ['creatives', 'copy', 'review'].includes(step)
  const selectedPage = pages.find(p => p.id === state.pageId)

  return (
    <>
      <div className={cn(
        "mx-auto transition-all duration-300",
        showPreviewPanel ? "max-w-5xl" : "max-w-2xl"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onCancel}
              className="p-2 hover:bg-bg-hover rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Rocket className="w-5 h-5 text-accent" />
                Launch Campaign
              </h1>
              <p className="text-sm text-zinc-500">{stepTitles[step]}</p>
            </div>
          </div>
        </div>

        {/* Content - Two column layout for creatives/copy/review */}
        <div className={cn(
          "mb-6",
          showPreviewPanel ? "grid lg:grid-cols-2 gap-4 lg:gap-6" : ""
        )}>
          {/* Form Panel */}
          <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6">
            {renderStep()}
          </div>

          {/* Preview Panel */}
          {showPreviewPanel && (
            <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-6 lg:sticky lg:top-6 lg:self-start">
              <h3 className="text-sm font-medium text-zinc-400 mb-4">Ad Preview</h3>
              <AdPreviewPanel
                creatives={state.creatives.map(c => ({
                  preview: c.preview,
                  type: c.type
                }))}
                primaryText={state.primaryText}
                headline={state.headline}
                description={state.description}
                websiteUrl={state.websiteUrl}
                ctaType={state.ctaType}
                pageName={selectedPage?.name || 'Your Page'}
                className="min-h-[400px]"
              />
            </div>
          )}
        </div>

        {/* Footer - with extra padding on mobile for iOS home bar */}
        <div className="flex items-center justify-between pb-safe-6 sm:pb-0">
          <button
            onClick={handleBack}
            disabled={!getPrevStep()}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              getPrevStep()
                ? "text-zinc-400 hover:text-white hover:bg-bg-hover"
                : "text-zinc-700 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step === 'review' ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Deploy to Meta
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Media Library Modal */}
      {user && (
        <MediaLibraryModal
          isOpen={mediaLibraryOpen}
          onClose={() => setMediaLibraryOpen(false)}
          userId={user.id}
          adAccountId={state.adAccountId}
          selectedItems={[]}
          onSelectionChange={handleLibrarySelection}
          maxSelection={6 - state.creatives.length}
        />
      )}
    </>
  )
}
