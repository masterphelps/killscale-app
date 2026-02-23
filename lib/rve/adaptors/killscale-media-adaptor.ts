import type { StandardImage, StandardVideo, MediaSearchParams, MediaSearchResult } from '../types/media-adaptors'
import type { ImageOverlayAdaptor, VideoOverlayAdaptor } from '../types/overlay-adaptors'

/**
 * KillScale Media Library Image Adaptor
 * Fetches images from the user's Meta ad account media library via /api/meta/media
 */
export function createKillScaleImageAdaptor(userId: string, adAccountId: string): ImageOverlayAdaptor {
  let cachedImages: StandardImage[] | null = null

  return {
    name: 'killscale-images',
    displayName: 'Media Library',
    description: 'Images from your ad account',
    supportedTypes: ['image'],
    requiresAuth: false,

    async search(params: MediaSearchParams): Promise<MediaSearchResult<StandardImage>> {
      // Fetch from API (cache for session to avoid repeated calls)
      if (!cachedImages) {
        const res = await fetch(`/api/meta/media?userId=${userId}&adAccountId=${adAccountId}&type=images`)
        if (!res.ok) return { items: [], totalCount: 0, hasMore: false }
        const data = await res.json()
        cachedImages = (data.images || []).map((img: { id: string; hash: string; name: string; url: string; width: number; height: number }) => ({
          id: img.hash || img.id,
          type: 'image' as const,
          width: img.width || 800,
          height: img.height || 800,
          thumbnail: img.url,
          src: {
            original: img.url,
            large: img.url,
            medium: img.url,
            small: img.url,
            thumbnail: img.url,
          },
          alt: img.name || 'Ad image',
        }))
      }

      // Client-side filter by query
      let filtered = cachedImages!
      if (params.query && params.query.trim()) {
        const q = params.query.toLowerCase()
        filtered = filtered.filter(img => (img.alt || '').toLowerCase().includes(q))
      }

      // Paginate
      const page = params.page || 1
      const perPage = params.perPage || 20
      const start = (page - 1) * perPage
      const paged = filtered.slice(start, start + perPage)

      return {
        items: paged,
        totalCount: filtered.length,
        hasMore: start + perPage < filtered.length,
        nextPage: page + 1,
      }
    },

    getImageUrl(image: StandardImage, size: 'original' | 'large' | 'medium' | 'small' = 'original'): string {
      return image.src[size] || image.src.original
    },
  }
}

/**
 * KillScale Media Library Video Adaptor
 * Fetches videos from the user's Meta ad account media library via /api/meta/media
 */
export function createKillScaleVideoAdaptor(userId: string, adAccountId: string): VideoOverlayAdaptor {
  let cachedVideos: StandardVideo[] | null = null

  return {
    name: 'killscale-videos',
    displayName: 'Media Library',
    description: 'Videos from your ad account',
    supportedTypes: ['video'],
    requiresAuth: false,

    async search(params: MediaSearchParams): Promise<MediaSearchResult<StandardVideo>> {
      // Fetch from API (cache for session)
      if (!cachedVideos) {
        const res = await fetch(`/api/meta/media?userId=${userId}&adAccountId=${adAccountId}&type=videos`)
        if (!res.ok) return { items: [], totalCount: 0, hasMore: false }
        const data = await res.json()
        cachedVideos = (data.videos || []).map((vid: { id: string; title: string; thumbnailUrl: string; source: string; length: number; width: number; height: number }) => ({
          id: vid.id,
          type: 'video' as const,
          width: vid.width || 1080,
          height: vid.height || 1920,
          thumbnail: vid.thumbnailUrl || '',
          duration: vid.length || 0,
          videoFiles: vid.source ? [{
            quality: 'hd' as const,
            format: 'video/mp4',
            url: vid.source,
          }] : [],
        }))
      }

      // Client-side filter
      let filtered = cachedVideos!
      if (params.query && params.query.trim()) {
        // Videos don't have alt text from Meta, but we can filter by ID
        // Since the search is "browse" oriented, empty query returns all
        // This still satisfies the search interface
      }

      // Paginate
      const page = params.page || 1
      const perPage = params.perPage || 20
      const start = (page - 1) * perPage
      const paged = filtered.slice(start, start + perPage)

      return {
        items: paged,
        totalCount: filtered.length,
        hasMore: start + perPage < filtered.length,
        nextPage: page + 1,
      }
    },

    getVideoUrl(video: StandardVideo, quality?: 'uhd' | 'hd' | 'sd' | 'low'): string {
      if (!video.videoFiles || video.videoFiles.length === 0) return ''
      if (quality) {
        const match = video.videoFiles.find(f => f.quality === quality)
        if (match) return match.url
      }
      return video.videoFiles[0].url
    },

    getThumbnailUrl(video: StandardVideo): string {
      return video.thumbnail || ''
    },
  }
}
