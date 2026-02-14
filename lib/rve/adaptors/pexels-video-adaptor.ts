import { VideoAdaptor, StandardVideo, MediaSearchParams, MediaSearchResult } from '../types/media-adaptors';
import { VideoOverlayAdaptor } from '../types/overlay-adaptors';

// Original Pexels Video API response interface
interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

interface PexelsVideoResponse {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: PexelsVideoFile[];
  video_pictures: Array<{
    id: number;
    picture: string;
    nr: number;
  }>;
}

interface PexelsVideoSearchResponse {
  page: number;
  per_page: number;
  videos: PexelsVideoResponse[];
  total_results: number;
  next_page?: string;
  prev_page?: string;
}

/**
 * Pexels Video Adaptor
 * Transforms Pexels Video API responses into the standard MediaItem format
 */
export const pexelsVideoAdaptor: VideoAdaptor = {
  name: 'pexels-videos',
  displayName: 'Pexels Videos',
  description: 'High-quality stock videos from Pexels',
  supportedTypes: ['video'],
  requiresAuth: true,
  authFields: [
    {
      key: 'apiKey',
      label: 'Pexels API Key',
      type: 'password',
      required: true,
      placeholder: 'Enter your Pexels API key',
    },
  ],

  async search(params: MediaSearchParams, config?: Record<string, any>): Promise<MediaSearchResult<StandardVideo>> {
    const apiKey = config?.apiKey;
    if (!apiKey) {
      throw new Error('Pexels API key is required');
    }

    const searchParams = new URLSearchParams({
      query: params.query,
      per_page: (params.perPage || 20).toString(),
      page: (params.page || 1).toString(),
    });

    // Add orientation filter if specified
    if (params.orientation) {
      searchParams.append('orientation', params.orientation);
    }

    // Add size filter if specified - map to Pexels video sizes
    if (params.size) {
      const sizeMap = {
        small: 'small',
        medium: 'medium',
        large: 'large',
      };
      searchParams.append('size', sizeMap[params.size] || 'medium');
    }

    try {
      const response = await fetch(
        `https://api.pexels.com/videos/search?${searchParams.toString()}`,
        {
          headers: {
            Authorization: apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Pexels Video API error: ${response.status} ${response.statusText}`);
      }

      const data: PexelsVideoSearchResponse = await response.json();

      // Transform Pexels response to standard format
      const standardVideos: StandardVideo[] = data.videos.map(transformPexelsVideoToStandard);

      return {
        items: standardVideos,
        totalCount: data.total_results,
        hasMore: !!data.next_page,
        nextPage: data.page + 1,
      };
    } catch (error) {
      console.error('Error fetching videos from Pexels:', error);
      throw error;
    }
  },

  getVideoUrl(video: StandardVideo, quality: 'uhd' | 'hd' | 'sd' | 'low' = 'hd'): string {
    const qualityFile = video.videoFiles.find(file => file.quality === quality);
    return qualityFile?.url || video.videoFiles[0]?.url || '';
  },

  getThumbnailUrl(video: StandardVideo): string {
    return video.thumbnail;
  },
};

/**
 * Transform a Pexels video response to the standard format
 */
function transformPexelsVideoToStandard(pexelsVideo: PexelsVideoResponse): StandardVideo {
  // Map Pexels quality names to standard quality names
  const qualityMap: Record<string, 'uhd' | 'hd' | 'sd' | 'low'> = {
    'uhd': 'uhd',
    'hd': 'hd',
    'sd': 'sd',
    'mobile': 'low',
  };

  const videoFiles = pexelsVideo.video_files.map(file => ({
    quality: qualityMap[file.quality.toLowerCase()] || 'sd',
    format: file.file_type,
    url: file.link,
  }));

  return {
    id: pexelsVideo.id,
    type: 'video',
    width: pexelsVideo.width,
    height: pexelsVideo.height,
    thumbnail: pexelsVideo.image,
    duration: pexelsVideo.duration,
    videoFiles,
    attribution: {
      author: pexelsVideo.user.name,
      source: 'Pexels',
      license: 'Pexels License',
      url: pexelsVideo.url,
    },
  };
}

/**
 * Factory function to create a Pexels video adaptor with API key
 * @param apiKey - Your Pexels API key
 * @returns Configured Pexels video adaptor ready to use
 */
export const createPexelsVideoAdaptor = (apiKey: string): VideoOverlayAdaptor => {
  return {
    ...pexelsVideoAdaptor,
    // Override search to pass the API key in config
    async search(params: MediaSearchParams, config?: Record<string, any>): Promise<MediaSearchResult<StandardVideo>> {
      return pexelsVideoAdaptor.search(params, { ...config, apiKey });
    }
  };
}; 