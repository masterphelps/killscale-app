import { 
  VideoAdaptor, 
  ImageAdaptor, 
  StandardAudio 
} from './media-adaptors';
import { TextOverlayTemplate } from '../templates/text-overlay-templates';
import { StickerTemplateConfig, StickerCategory } from './sticker-templates';
import { TemplateOverlay } from './index';
import { AnimationTemplate } from '../adaptors/default-animation-adaptors';

// Enhanced result interface with source attribution
export interface MergedSearchResult<T> {
  items: Array<T & { 
    _source: string; // Which adaptor this item came from
    _sourceDisplayName: string; // Human-readable source name
  }>;
  totalCount: number;
  hasMore: boolean;
  sourceResults: Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>;
}

// Video adaptor (extends existing media adaptor)
export interface VideoOverlayAdaptor extends VideoAdaptor {
  // Already defined in media-adaptors.ts
}

// Image adaptor (extends existing media adaptor)  
export interface ImageOverlayAdaptor extends ImageAdaptor {
  // Already defined in media-adaptors.ts
}

// Audio/Sound adaptor
export interface SoundOverlayAdaptor {
  name: string;
  displayName: string;
  description?: string;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
  search(params: { query?: string; page?: number; perPage?: number; }, config?: Record<string, any>): Promise<{
    items: StandardAudio[];
    totalCount?: number;
    hasMore?: boolean;
  }>;
  getAudioUrl(audio: StandardAudio): string;
}

// Text adaptor
export interface TextOverlayAdaptor {
  name: string;
  displayName: string;
  description?: string;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
  getTemplates(config?: Record<string, any>): Promise<{
    items: TextOverlayTemplate[];
    totalCount?: number;
  }>;
}

// Sticker adaptor
export interface StickerOverlayAdaptor {
  name: string;
  displayName: string;
  description?: string;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
  getCategories(config?: Record<string, any>): Promise<{
    items: StickerCategory[];
  }>;
  getTemplates(category?: StickerCategory, config?: Record<string, any>): Promise<{
    items: StickerTemplateConfig[];
    totalCount?: number;
  }>;
}

// Template adaptor
export interface TemplateOverlayAdaptor {
  name: string;
  displayName: string;
  description?: string;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
  getTemplates(params?: { searchQuery?: string; page?: number; perPage?: number; }, config?: Record<string, any>): Promise<{
    items: TemplateOverlay[];
    totalCount?: number;
    hasMore?: boolean;
  }>;
}

// Animation adaptor
export interface AnimationOverlayAdaptor {
  name: string;
  displayName: string;
  description?: string;
  requiresAuth: boolean;
  authFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
  }>;
  getTemplates(config?: Record<string, any>): Promise<{
    items: AnimationTemplate[];
    totalCount?: number;
  }>;
}

// Overall adaptor configuration
export interface OverlayAdaptors {
  video?: VideoOverlayAdaptor[];
  images?: ImageOverlayAdaptor[];
  audio?: SoundOverlayAdaptor[];
  text?: TextOverlayAdaptor[];
  stickers?: StickerOverlayAdaptor[];
  templates?: TemplateOverlayAdaptor[];
  animations?: AnimationOverlayAdaptor[];
}

// Utility function to shuffle array (for mixing sources)
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
} 