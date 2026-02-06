export type MediaType = 'image' | 'video' | 'carousel' | 'dynamic'

export type FatigueStatus = 'fresh' | 'healthy' | 'warning' | 'fatiguing' | 'fatigued'

// Unified type: one entity = one media asset (media_hash)
// Merges inventory (media_library) + performance (ad_data aggregated by media_hash)
export interface StudioAsset {
  // Identity (from media_library)
  id: string
  mediaHash: string
  mediaType: 'image' | 'video'
  name: string | null

  // Display (from media_library + Supabase Storage)
  imageUrl: string | null       // permanent CDN URL (images)
  thumbnailUrl: string | null   // video thumbnail
  storageUrl: string | null     // Supabase Storage (full file)
  width: number | null
  height: number | null
  fileSize: number | null
  downloadStatus: string | null
  syncedAt: string | null

  // Performance (aggregated from ad_data across ALL ads using this media_hash)
  hasPerformanceData: boolean
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpm: number
  cpc: number
  impressions: number
  clicks: number

  // Video metrics (null for images)
  videoViews: number | null
  videoThruplay: number | null
  videoP100: number | null
  avgWatchTime: number | null
  videoPlays: number | null
  outboundClicks: number | null
  thumbstopRate: number | null    // videoViews / impressions * 100
  holdRate: number | null         // thruplay / videoViews * 100
  completionRate: number | null   // p100 / impressions * 100

  // Composite scores (null if < $50 spend)
  hookScore: number | null        // video only
  holdScore: number | null        // video only
  clickScore: number | null       // all
  convertScore: number | null     // all

  // Fatigue
  fatigueScore: number
  fatigueStatus: FatigueStatus
  daysActive: number
  firstSeen: string | null
  lastSeen: string | null

  // Usage
  adCount: number
  adsetCount: number
  campaignCount: number

  // UI state
  isStarred: boolean

  // AI Analysis status (videos only)
  analysisStatus?: AnalysisStatus
}

// Detail data returned by media-detail endpoint (unified: inventory + performance)
export interface StudioAssetDetail {
  // Asset metadata (from media_library)
  media: {
    mediaHash: string
    mediaType: 'image' | 'video'
    name: string | null
    width: number | null
    height: number | null
    fileSize: number | null
    storageUrl: string | null
    imageUrl: string | null
    thumbnailUrl: string | null
    syncedAt: string | null
  }

  // Performance detail (from ad_data)
  dailyData: DailyMetrics[]
  earlyPeriod: { roas: number; ctr: number; cpm: number; thumbstopRate?: number; holdRate?: number }
  recentPeriod: { roas: number; ctr: number; cpm: number; thumbstopRate?: number; holdRate?: number }
  audiencePerformance: AudiencePerformance[]
  copyVariations: CopyVariation[]
  ads: {
    adId: string
    adName: string
    adsetName: string
    campaignName: string
    status: string
    spend: number
    roas: number
  }[]

  // Hierarchy (where is this used?)
  hierarchy: Array<{
    campaignId: string
    campaignName: string
    adsets: Array<{
      adsetId: string
      adsetName: string
      ads: Array<{
        adId: string
        adName: string
        status: string
      }>
    }>
  }>

  // Video playback
  videoSource: string | null

  // Usage counts
  totalAds: number
  totalAdsets: number
  totalCampaigns: number
}

export interface CopyVariation {
  creativeId: string
  headline: string
  body: string
  spend: number
  revenue: number
  roas: number
}

export interface DailyMetrics {
  date: string
  spend: number
  revenue: number
  roas: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
  thumbstopRate?: number | null
  holdRate?: number | null
}

export interface AudiencePerformance {
  adsetId: string
  adsetName: string
  spend: number
  revenue: number
  roas: number
  fatigueStatus: FatigueStatus
}

export interface CreativeHealthScore {
  score: number
  status: 'excellent' | 'good' | 'warning' | 'critical'
  factors: {
    diversity: { score: number; detail: string }
    fatigue: { score: number; detail: string }
    winnerHealth: { score: number; detail: string }
    freshPipeline: { score: number; detail: string }
  }
  recommendations: string[]
}

// Video Analysis Types (AI-powered)
export interface VideoAnalysisHookData {
  score: number
  timestamp: string
  assessment: string
  elements: string[]
  improvement: string
}

export interface VideoAnalysisHoldData {
  score: number
  assessment: string
  elements: string[]
  improvement: string
}

export interface VideoAnalysisClickData {
  score: number
  assessment: string
  elements: string[]
  improvement: string
}

export interface VideoAnalysisConvertData {
  score: number
  assessment: string
  elements: string[]
  improvement: string
}

export interface VideoAnalysis {
  // Overall assessment
  overallScore: number
  summary: string

  // Transcript
  transcript: string
  duration: number

  // Funnel stage breakdown
  hook: VideoAnalysisHookData
  hold: VideoAnalysisHoldData
  click: VideoAnalysisClickData
  convert: VideoAnalysisConvertData

  // Content analysis
  speakerStyle: 'talking_head' | 'voiceover' | 'text_only' | 'mixed' | 'none'
  visualStyle: 'ugc' | 'polished' | 'product_demo' | 'lifestyle' | 'mixed'
  emotionalTone: string
  keyMessages: string[]
  targetAudience: string

  // Top-level recommendations
  topStrength: string
  topWeakness: string
  quickWins: string[]
}

export interface ScriptSuggestion {
  title: string
  approach: string
  script: {
    hook: string
    body: string
    cta: string
  }
  estimatedDuration: string
  whyItWorks: string
}

export type AnalysisStatus = 'none' | 'pending' | 'processing' | 'complete' | 'error'

// Competitor Ad Types (from ScrapeCreators API)
export interface CompetitorAd {
  id: string
  pageId: string
  pageName: string
  startDate: string
  endDate: string | null
  isActive: boolean
  platforms: string[]
  body: string | null
  headline: string | null
  linkUrl: string | null
  ctaText: string | null
  mediaType: 'image' | 'video' | 'carousel' | 'text'
  imageUrl: string | null
  videoUrl: string | null
  videoThumbnail: string | null
  carouselCards: CompetitorCarouselCard[] | null
  daysActive: number
  collationCount: number
}

export interface CompetitorCarouselCard {
  imageUrl: string | null
  headline: string | null
  body: string | null
  linkUrl: string | null
  videoUrl?: string | null
}

export interface CompetitorStats {
  totalAds: number
  activeAds: number
  earliestAdDate: string | null
  mediaMix: { video: number; image: number; carousel: number; text: number }
  topLandingPages: Array<{ url: string; domain: string; count: number; percentage: number }>
}

export interface CompetitorSearchResult {
  name: string
  pageId: string
  logoUrl: string | null
  adCount?: number
}

// Inspiration Gallery Types
export type AdFormat = 'ugc' | 'product_hero' | 'lifestyle' | 'bold' | 'testimonial' | 'before_after'

export interface InspirationExample {
  id: string
  adFormat: AdFormat
  industryCategory: string | null
  pageName: string
  pageId: string | null
  mediaType: 'image' | 'video' | 'carousel'
  body: string | null
  headline: string | null
  imageUrl: string | null
  videoUrl: string | null
  videoThumbnail: string | null
  carouselCards: CompetitorCarouselCard[] | null
  daysActive: number
  isActive: boolean
  description: string | null
  isFeatured: boolean
}

export const AD_FORMAT_LABELS: Record<AdFormat, string> = {
  ugc: 'UGC',
  product_hero: 'Product Hero',
  lifestyle: 'Lifestyle',
  bold: 'Bold',
  testimonial: 'Testimonial',
  before_after: 'Before/After',
}

export const AD_FORMAT_COLORS: Record<AdFormat, { bg: string; text: string }> = {
  ugc: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  product_hero: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  lifestyle: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  bold: { bg: 'bg-red-500/20', text: 'text-red-400' },
  testimonial: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  before_after: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
}
