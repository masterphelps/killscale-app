'use client'

import { createContext, useContext } from 'react'
import type { StudioAsset, StudioAssetDetail } from '@/components/creative-studio/types'

// Types for active ads (individual ad-level data)
export interface ActiveAd {
  ad_id: string
  ad_name: string
  adset_id: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  status: string
  creative_id: string | null
  thumbnail_url: string | null
  image_url: string | null
  video_id: string | null
  media_hash: string | null
  media_type: string | null
  // Same three fields as StudioAsset from the media API
  storageUrl: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  primary_text: string | null
  headline: string | null
  description: string | null
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  roas: number
  ctr: number
  cpc: number
  cpm: number
  cpa: number
  aov: number
  videoViews: number | null
  videoThruplay: number | null
  videoP100: number | null
  videoPlays: number | null
  outboundClicks: number | null
  thumbstopRate: number | null
  holdRate: number | null
  completionRate: number | null
  hookScore: number | null
  holdScore: number | null
  clickScore: number | null
  convertScore: number | null
}

// Types for copy variations
export interface CopyVariation {
  key: string
  primaryText: string | null
  headline: string | null
  description: string | null
  adCount: number
  adNames: string[]
  isActive: boolean
  representativeThumbnail: string | null
  mediaType: string | null
  spend: number
  revenue: number
  impressions: number
  clicks: number
  roas: number
  ctr: number
  cpc: number
  hookScore: number | null
  holdScore: number | null
  clickScore: number | null
  convertScore: number | null
}

export interface CreativeStudioContextValue {
  // Data
  assets: StudioAsset[]
  isLoading: boolean
  isSyncing: boolean
  isDownloading: boolean
  downloadProgress: { completed: number; total: number }

  // Video sources
  videoSources: Record<string, string>
  fetchVideoSource: (videoId: string) => Promise<void>

  // Starred
  starredIds: Set<string>
  toggleStar: (id: string) => Promise<void>
  clearStarred: () => Promise<void>

  // Active ads
  activeAds: ActiveAd[]
  activeDailyBudget: number
  isLoadingActiveAds: boolean

  // Copy variations
  copyVariations: CopyVariation[]
  isLoadingCopy: boolean

  // Date range
  datePreset: string
  customStartDate: string
  customEndDate: string
  setDatePreset: (preset: string) => void
  setCustomStartDate: (date: string) => void
  setCustomEndDate: (date: string) => void
  showDatePicker: boolean
  setShowDatePicker: (show: boolean) => void

  // Theater modal (shared across all sub-pages)
  theaterItem: StudioAsset | null
  theaterDetail: StudioAssetDetail | null
  isTheaterLoading: boolean
  openTheater: (mediaHash: string) => void
  openTheaterWithAsset: (asset: StudioAsset) => void
  closeTheater: () => void

  // Actions
  refresh: () => Promise<void>
  handleSync: () => Promise<void>
  removeAsset: (mediaHash: string) => void
}

export const CreativeStudioContext = createContext<CreativeStudioContextValue | null>(null)

export function useCreativeStudio() {
  const ctx = useContext(CreativeStudioContext)
  if (!ctx) throw new Error('useCreativeStudio must be used within CreativeStudioProvider')
  return ctx
}
