import { ImageAdaptor, StandardImage, MediaSearchParams, MediaSearchResult } from '../types/media-adaptors';
import { ImageOverlayAdaptor } from '../types/overlay-adaptors';

// Original Pexels API response interface
interface PexelsImageResponse {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}

interface PexelsSearchResponse {
  page: number;
  per_page: number;
  photos: PexelsImageResponse[];
  total_results: number;
  next_page?: string;
  prev_page?: string;
}

/**
 * Pexels Image Adaptor
 * Transforms Pexels API responses into the standard MediaItem format
 */
export const pexelsImageAdaptor: ImageAdaptor = {
  name: 'pexels-images',
  displayName: 'Pexels Images',
  description: 'High-quality stock images from Pexels',
  supportedTypes: ['image'],
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

  async search(params: MediaSearchParams, config?: Record<string, any>): Promise<MediaSearchResult<StandardImage>> {
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

    // Add color filter if specified
    if (params.color) {
      searchParams.append('color', params.color);
    }

    // Add size filter if specified
    if (params.size) {
      searchParams.append('size', params.size);
    }

    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?${searchParams.toString()}`,
        {
          headers: {
            Authorization: apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Pexels API error: ${response.status} ${response.statusText}`);
      }

      const data: PexelsSearchResponse = await response.json();

      // Transform Pexels response to standard format
      const standardImages: StandardImage[] = data.photos.map(transformPexelsImageToStandard);

      return {
        items: standardImages,
        totalCount: data.total_results,
        hasMore: !!data.next_page,
        nextPage: data.page + 1,
      };
    } catch (error) {
      console.error('Error fetching images from Pexels:', error);
      throw error;
    }
  },

  getImageUrl(image: StandardImage, size: 'original' | 'large' | 'medium' | 'small' = 'medium'): string {
    return image.src[size] || image.src.original;
  },
};

/**
 * Transform a Pexels image response to the standard format
 */
function transformPexelsImageToStandard(pexelsImage: PexelsImageResponse): StandardImage {
  return {
    id: pexelsImage.id,
    type: 'image',
    width: pexelsImage.width,
    height: pexelsImage.height,
    thumbnail: pexelsImage.src.small,
    src: {
      original: pexelsImage.src.original,
      large: pexelsImage.src.large,
      medium: pexelsImage.src.medium,
      small: pexelsImage.src.small,
      thumbnail: pexelsImage.src.tiny,
    },
    alt: pexelsImage.alt,
    attribution: {
      author: pexelsImage.photographer,
      source: 'Pexels',
      license: 'Pexels License',
      url: pexelsImage.url,
    },
  };
}

/**
 * Factory function to create a Pexels image adaptor with API key
 * @param apiKey - Your Pexels API key
 * @returns Configured Pexels image adaptor ready to use
 */
export const createPexelsImageAdaptor = (apiKey: string): ImageOverlayAdaptor => {
  return {
    ...pexelsImageAdaptor,
    // Override search to pass the API key in config
    async search(params: MediaSearchParams, config?: Record<string, any>): Promise<MediaSearchResult<StandardImage>> {
      return pexelsImageAdaptor.search(params, { ...config, apiKey });
    }
  };
}; 