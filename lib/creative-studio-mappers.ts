import type { StudioAsset } from '@/components/creative-studio/types'
import type { ActiveAd, CopyVariation } from '@/app/dashboard/creative-studio/creative-studio-context'

interface ResolvedMedia {
  storageUrl: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
}

/**
 * Maps an ActiveAd (individual ad row from active-ads API) into a StudioAsset
 * so it can be rendered by MediaGalleryCard / GalleryGrid.
 */
export function activeAdToStudioAsset(ad: ActiveAd, resolved: ResolvedMedia): StudioAsset {
  const isVideo = ad.media_type === 'video' || !!ad.video_id
  return {
    id: ad.ad_id,
    mediaHash: ad.media_hash || ad.ad_id,
    mediaType: isVideo ? 'video' : 'image',
    name: ad.ad_name,
    imageUrl: resolved.imageUrl,
    thumbnailUrl: resolved.thumbnailUrl,
    storageUrl: resolved.storageUrl,
    width: null,
    height: null,
    fileSize: null,
    downloadStatus: null,
    syncedAt: null,
    hasPerformanceData: true,
    spend: ad.spend,
    revenue: ad.revenue,
    roas: ad.roas,
    ctr: ad.ctr,
    cpm: ad.cpm,
    cpc: ad.cpc,
    impressions: ad.impressions,
    clicks: ad.clicks,
    videoViews: ad.videoViews,
    videoThruplay: ad.videoThruplay,
    videoP100: ad.videoP100,
    avgWatchTime: null,
    videoPlays: ad.videoPlays,
    outboundClicks: ad.outboundClicks,
    thumbstopRate: ad.thumbstopRate,
    holdRate: ad.holdRate,
    completionRate: ad.completionRate,
    hookScore: ad.hookScore,
    holdScore: ad.holdScore,
    clickScore: ad.clickScore,
    convertScore: ad.convertScore,
    fatigueScore: 0,
    fatigueStatus: 'healthy',
    daysActive: 0,
    firstSeen: null,
    lastSeen: null,
    adCount: 1,
    adsetCount: 1,
    campaignCount: 1,
    isStarred: false,
  }
}

/**
 * Maps a CopyVariation (aggregated copy text group) into a StudioAsset
 * so it can be rendered by MediaGalleryCard / GalleryGrid.
 */
export function copyVariationToStudioAsset(variation: CopyVariation): StudioAsset {
  const isVideo = variation.mediaType === 'video'
  return {
    id: variation.key,
    mediaHash: variation.key,
    mediaType: isVideo ? 'video' : 'image',
    name: variation.headline || (variation.primaryText ? variation.primaryText.slice(0, 60) : 'Untitled'),
    imageUrl: !isVideo ? variation.representativeThumbnail : null,
    thumbnailUrl: isVideo ? variation.representativeThumbnail : variation.representativeThumbnail,
    storageUrl: null,
    width: null,
    height: null,
    fileSize: null,
    downloadStatus: null,
    syncedAt: null,
    hasPerformanceData: true,
    spend: variation.spend,
    revenue: variation.revenue,
    roas: variation.roas,
    ctr: variation.ctr,
    cpm: 0,
    cpc: variation.cpc,
    impressions: variation.impressions,
    clicks: variation.clicks,
    videoViews: null,
    videoThruplay: null,
    videoP100: null,
    avgWatchTime: null,
    videoPlays: null,
    outboundClicks: null,
    thumbstopRate: null,
    holdRate: null,
    completionRate: null,
    hookScore: variation.hookScore,
    holdScore: variation.holdScore,
    clickScore: variation.clickScore,
    convertScore: variation.convertScore,
    fatigueScore: 0,
    fatigueStatus: 'healthy',
    daysActive: 0,
    firstSeen: null,
    lastSeen: null,
    adCount: variation.adCount,
    adsetCount: 0,
    campaignCount: 0,
    isStarred: false,
  }
}
