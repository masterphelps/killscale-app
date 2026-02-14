// Base interface for all media items
export interface BaseMediaItem {
  id: string | number;
  width: number;
  height: number;
  thumbnail?: string;
  isLocked?: boolean;
}

// Standard interface for image content
export interface StandardImage extends BaseMediaItem {
  type: 'image';
  src: {
    original: string;
    large?: string;
    medium?: string;
    small?: string;
    thumbnail?: string;
  };
  alt?: string;
  attribution?: {
    author?: string;
    source?: string;
    license?: string;
    url?: string;
  };
}

// Standard interface for video content
export interface StandardVideo extends BaseMediaItem {
  type: 'video';
  thumbnail: string;
  duration?: number;
  videoFiles: Array<{
    quality: 'uhd' | 'hd' | 'sd' | 'low';
    format: string; // e.g., 'video/mp4', 'video/webm'
    url: string;
    fileSize?: number;
  }>;
  attribution?: {
    author?: string;
    source?: string;
    license?: string;
    url?: string;
  };
}

// Standard interface for audio content
export interface StandardAudio {
  id: string;
  title: string;
  artist: string;
  duration: number; // duration in seconds
  file: string; // URL to audio file
  thumbnail?: string; // optional waveform or cover art
  attribution?: {
    author?: string;
    source?: string;
    license?: string;
    url?: string;
  };
}

// Union type for all media items
export type MediaItem = StandardImage | StandardVideo | StandardAudio;

// Search result interface
export interface MediaSearchResult<T extends MediaItem = MediaItem> {
  items: T[];
  totalCount?: number;
  hasMore?: boolean;
  nextPage?: string | number;
}

// Search parameters interface
export interface MediaSearchParams {
  query: string;
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  category?: string;
  color?: string;
  size?: 'small' | 'medium' | 'large';
}

// Base adaptor interface
export interface BaseMediaAdaptor {
  name: string;
  displayName: string;
  description?: string;
  supportedTypes: Array<'image' | 'video'>;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
}

// Image adaptor interface
export interface ImageAdaptor extends BaseMediaAdaptor {
  supportedTypes: ['image'];
  search: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MediaSearchResult<StandardImage>>;
  getImageUrl: (image: StandardImage, size?: 'original' | 'large' | 'medium' | 'small') => string;
}

// Video adaptor interface
export interface VideoAdaptor extends BaseMediaAdaptor {
  supportedTypes: ['video'];
  search: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MediaSearchResult<StandardVideo>>;
  getVideoUrl: (video: StandardVideo, quality?: 'uhd' | 'hd' | 'sd' | 'low') => string;
  getThumbnailUrl: (video: StandardVideo) => string;
}

// Combined adaptor interface for providers that support both images and videos
export interface MediaAdaptor extends BaseMediaAdaptor {
  supportedTypes: Array<'image' | 'video'>;
  searchImages: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MediaSearchResult<StandardImage>>;
  searchVideos: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MediaSearchResult<StandardVideo>>;
  getImageUrl: (image: StandardImage, size?: 'original' | 'large' | 'medium' | 'small') => string;
  getVideoUrl: (video: StandardVideo, quality?: 'uhd' | 'hd' | 'sd' | 'low') => string;
  getThumbnailUrl: (video: StandardVideo) => string;
}

// Configuration interface for adaptors
export interface AdaptorConfig {
  [key: string]: any;
}

// Registry for managing adaptors
export interface AdaptorRegistry {
  imageAdaptors: Map<string, ImageAdaptor>;
  videoAdaptors: Map<string, VideoAdaptor>;
  mediaAdaptors: Map<string, MediaAdaptor>;
  
  registerImageAdaptor: (id: string, adaptor: ImageAdaptor) => void;
  registerVideoAdaptor: (id: string, adaptor: VideoAdaptor) => void;
  registerMediaAdaptor: (id: string, adaptor: MediaAdaptor) => void;
  
  getImageAdaptor: (id: string) => ImageAdaptor | undefined;
  getVideoAdaptor: (id: string) => VideoAdaptor | undefined;
  getMediaAdaptor: (id: string) => MediaAdaptor | undefined;
  
  getAvailableImageAdaptors: () => Array<{ id: string; adaptor: ImageAdaptor }>;
  getAvailableVideoAdaptors: () => Array<{ id: string; adaptor: VideoAdaptor }>;
  getAvailableMediaAdaptors: () => Array<{ id: string; adaptor: MediaAdaptor }>;
} 