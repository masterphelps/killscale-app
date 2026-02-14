import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import {
  OverlayAdaptors,
  VideoOverlayAdaptor,
  ImageOverlayAdaptor,
  SoundOverlayAdaptor,
  TextOverlayAdaptor,
  StickerOverlayAdaptor,
  TemplateOverlayAdaptor,
  AnimationOverlayAdaptor,
  MergedSearchResult,
  shuffleArray
} from '../types/overlay-adaptors';
import { MediaSearchParams, StandardVideo, StandardImage, StandardAudio } from '../types/media-adaptors';
import { TextOverlayTemplate } from '../templates/text-overlay-templates';
import { StickerTemplateConfig, StickerCategory } from '../types/sticker-templates';
import { TemplateOverlay } from '../types';
import { getDefaultAudioAdaptors } from '../adaptors/default-audio-adaptors';
import { getDefaultTextAdaptors } from '../adaptors/default-text-adaptors';
import { getDefaultTemplateAdaptors } from '../adaptors/default-templates-adaptor';
import { getDefaultAnimationAdaptors, AnimationTemplate } from '../adaptors/default-animation-adaptors';

interface MediaAdaptorContextType {
  // Raw adaptors
  videoAdaptors: VideoOverlayAdaptor[];
  imageAdaptors: ImageOverlayAdaptor[];
  audioAdaptors: SoundOverlayAdaptor[];
  textAdaptors: TextOverlayAdaptor[];
  stickerAdaptors: StickerOverlayAdaptor[];
  templateAdaptors: TemplateOverlayAdaptor[];
  animationAdaptors: AnimationOverlayAdaptor[];
  
  // Merged search functions
  searchVideos: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MergedSearchResult<StandardVideo>>;
  searchImages: (params: MediaSearchParams, config?: Record<string, any>) => Promise<MergedSearchResult<StandardImage>>;
  searchAudio: (params: { query?: string; page?: number; perPage?: number; }, config?: Record<string, any>) => Promise<MergedSearchResult<StandardAudio>>;
  getTextTemplates: (config?: Record<string, any>) => Promise<MergedSearchResult<TextOverlayTemplate>>;
  getStickerTemplates: (category?: StickerCategory, config?: Record<string, any>) => Promise<MergedSearchResult<StickerTemplateConfig>>;
  getTemplateOverlays: (params?: { searchQuery?: string; page?: number; perPage?: number; }, config?: Record<string, any>) => Promise<MergedSearchResult<TemplateOverlay>>;
  getAnimationTemplates: (config?: Record<string, any>) => Promise<MergedSearchResult<AnimationTemplate>>;
}

const MediaAdaptorContext = createContext<MediaAdaptorContextType | null>(null);

interface MediaAdaptorProviderProps {
  children: ReactNode;
  adaptors?: OverlayAdaptors;
}

export const MediaAdaptorProvider: React.FC<MediaAdaptorProviderProps> = ({ 
  children, 
  adaptors
}) => {
  // Resolve adaptors with defaults
  const resolvedAdaptors = useMemo(() => {
    const resolvedAdaptorsConfig = {
      videoAdaptors: adaptors?.video || [],
      imageAdaptors: adaptors?.images || [],
      audioAdaptors: adaptors?.audio || getDefaultAudioAdaptors(),
      textAdaptors: adaptors?.text || getDefaultTextAdaptors(),
      stickerAdaptors: adaptors?.stickers || [],
      templateAdaptors: adaptors?.templates || getDefaultTemplateAdaptors(),
      animationAdaptors: adaptors?.animations || getDefaultAnimationAdaptors(),
    };
    
    return resolvedAdaptorsConfig;
  }, [adaptors]);

  // Video search across all video adaptors
  const searchVideos = useCallback(async (
    params: MediaSearchParams, 
    config?: Record<string, any>
  ): Promise<MergedSearchResult<StandardVideo>> => {
    const activeAdaptors = resolvedAdaptors.videoAdaptors;
    
    if (activeAdaptors.length === 0) {
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor searches in parallel
    const searchPromises = activeAdaptors.map(async (adaptor) => {
      try {
        const result = await adaptor.search(params, config);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error searching videos with ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0, hasMore: false },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Merge and attribute results
    const mergedItems: Array<StandardVideo & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<StandardVideo>['sourceResults'] = [];

    searchResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: result.hasMore || false,
        ...(error && { error })
      });
    });

    // Shuffle merged results to mix sources
    const shuffledItems = shuffleArray(mergedItems);

    return {
      items: shuffledItems,
      totalCount: mergedItems.length,
      hasMore: sourceResults.some(s => s.hasMore),
      sourceResults
    };
  }, [resolvedAdaptors.videoAdaptors]);

  // Image search across all image adaptors
  const searchImages = useCallback(async (
    params: MediaSearchParams, 
    config?: Record<string, any>
  ): Promise<MergedSearchResult<StandardImage>> => {
    const activeAdaptors = resolvedAdaptors.imageAdaptors;
    
    if (activeAdaptors.length === 0) {
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor searches in parallel
    const searchPromises = activeAdaptors.map(async (adaptor) => {
      try {
        const result = await adaptor.search(params, config);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error searching images with ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0, hasMore: false },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Merge and attribute results
    const mergedItems: Array<StandardImage & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<StandardImage>['sourceResults'] = [];

    searchResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: result.hasMore || false,
        ...(error && { error })
      });
    });

    // Shuffle merged results to mix sources
    const shuffledItems = shuffleArray(mergedItems);

    return {
      items: shuffledItems,
      totalCount: mergedItems.length,
      hasMore: sourceResults.some(s => s.hasMore),
      sourceResults
    };
  }, [resolvedAdaptors.imageAdaptors]);

  // Audio search across all audio adaptors
  const searchAudio = useCallback(async (
    params: { query?: string; page?: number; perPage?: number; }, 
    config?: Record<string, any>
  ): Promise<MergedSearchResult<StandardAudio>> => {
    const activeAdaptors = resolvedAdaptors.audioAdaptors;
    
    if (activeAdaptors.length === 0) {
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor searches in parallel
    const searchPromises = activeAdaptors.map(async (adaptor) => {
      try {
        const result = await adaptor.search(params, config);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error searching audio with ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0, hasMore: false },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Merge and attribute results
    const mergedItems: Array<StandardAudio & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<StandardAudio>['sourceResults'] = [];

    searchResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: result.hasMore || false,
        ...(error && { error })
      });
    });

    // Shuffle merged results to mix sources
    const shuffledItems = shuffleArray(mergedItems);

    return {
      items: shuffledItems,
      totalCount: mergedItems.length,
      hasMore: sourceResults.some(s => s.hasMore),
      sourceResults
    };
  }, [resolvedAdaptors.audioAdaptors]);

  // Text templates across all text adaptors
  const getTextTemplates = useCallback(async (
    config?: Record<string, any>
  ): Promise<MergedSearchResult<TextOverlayTemplate>> => {
    const activeAdaptors = resolvedAdaptors.textAdaptors;
    
    if (activeAdaptors.length === 0) {
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor template fetches in parallel
    const templatePromises = activeAdaptors.map(async (adaptor) => {
      try {
        const result = await adaptor.getTemplates(config);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error fetching text templates from ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0 },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const templateResults = await Promise.all(templatePromises);

    // Merge and attribute results
    const mergedItems: Array<TextOverlayTemplate & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<TextOverlayTemplate>['sourceResults'] = [];

    templateResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: false, // Text templates typically don't paginate
        ...(error && { error })
      });
    });

    // Return items in original order (no shuffling for text templates)
    return {
      items: mergedItems,
      totalCount: mergedItems.length,
      hasMore: false, // Text templates typically don't paginate
      sourceResults
    };
  }, [resolvedAdaptors.textAdaptors]);

  const getStickerTemplates = useCallback(async (
  ): Promise<MergedSearchResult<StickerTemplateConfig>> => {
    // TODO: Implement in stickers step
    return { items: [], totalCount: 0, hasMore: false, sourceResults: [] };
  }, []);

  // Animation templates across all animation adaptors
  const getAnimationTemplates = useCallback(async (
    config?: Record<string, any>
  ): Promise<MergedSearchResult<AnimationTemplate>> => {
    const activeAdaptors = resolvedAdaptors.animationAdaptors;
    
    if (activeAdaptors.length === 0) {
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor template fetches in parallel
    const templatePromises = activeAdaptors.map(async (adaptor) => {
      try {
        const result = await adaptor.getTemplates(config);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error fetching animation templates from ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0 },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const templateResults = await Promise.all(templatePromises);

    // Merge and attribute results
    const mergedItems: Array<AnimationTemplate & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<AnimationTemplate>['sourceResults'] = [];

    templateResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: false, // Animation templates typically don't paginate
        ...(error && { error })
      });
    });

    // Shuffle merged results to mix sources
    const shuffledItems = shuffleArray(mergedItems);

    return {
      items: shuffledItems,
      totalCount: mergedItems.length,
      hasMore: false, // Animation templates typically don't paginate
      sourceResults
    };
  }, [resolvedAdaptors.animationAdaptors]);

  // Template overlays across all template adaptors
  const getTemplateOverlays = useCallback(async (
    params: { searchQuery?: string; page?: number; perPage?: number; } = {},
    config?: Record<string, any>
  ): Promise<MergedSearchResult<TemplateOverlay>> => {
    const activeAdaptors = resolvedAdaptors.templateAdaptors;
    
    console.log('getTemplateOverlays called with params:', params);
    console.log('Active template adaptors:', activeAdaptors);
    
    if (activeAdaptors.length === 0) {
      console.log('No active template adaptors found');
      return { 
        items: [], 
        totalCount: 0, 
        hasMore: false, 
        sourceResults: [] 
      };
    }

    // Execute all adaptor template fetches in parallel
    const templatePromises = activeAdaptors.map(async (adaptor) => {
      try {
        console.log(`Fetching templates from adaptor: ${adaptor.name}`);
        const result = await adaptor.getTemplates(params, config);
        console.log(`Result from ${adaptor.name}:`, result);
        return {
          adaptor,
          result,
          error: null
        };
      } catch (error) {
        console.error(`Error fetching templates from ${adaptor.name}:`, error);
        return {
          adaptor,
          result: { items: [], totalCount: 0, hasMore: false },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const templateResults = await Promise.all(templatePromises);
    console.log('All template results:', templateResults);

    // Merge and attribute results
    const mergedItems: Array<TemplateOverlay & { _source: string; _sourceDisplayName: string }> = [];
    const sourceResults: MergedSearchResult<TemplateOverlay>['sourceResults'] = [];

    templateResults.forEach(({ adaptor, result, error }) => {
      // Add source attribution to each item
      const attributedItems = result.items.map(item => ({
        ...item,
        _source: adaptor.name,
        _sourceDisplayName: adaptor.displayName
      }));
      
      mergedItems.push(...attributedItems);
      
      sourceResults.push({
        adaptorName: adaptor.name,
        adaptorDisplayName: adaptor.displayName,
        itemCount: result.items.length,
        hasMore: result.hasMore || false,
        ...(error && { error })
      });
    });

    // Shuffle merged results to mix sources
    const shuffledItems = shuffleArray(mergedItems);
    console.log('Final merged items:', shuffledItems);

    return {
      items: shuffledItems,
      totalCount: mergedItems.length,
      hasMore: sourceResults.some(s => s.hasMore),
      sourceResults
    };
  }, [resolvedAdaptors.templateAdaptors]);

  const contextValue = useMemo(() => ({
    videoAdaptors: resolvedAdaptors.videoAdaptors,
    imageAdaptors: resolvedAdaptors.imageAdaptors,
    audioAdaptors: resolvedAdaptors.audioAdaptors,
    textAdaptors: resolvedAdaptors.textAdaptors,
    stickerAdaptors: resolvedAdaptors.stickerAdaptors,
    templateAdaptors: resolvedAdaptors.templateAdaptors,
    animationAdaptors: resolvedAdaptors.animationAdaptors,
    searchVideos,
    searchImages,
    searchAudio,
    getTextTemplates,
    getStickerTemplates,
    getTemplateOverlays,
    getAnimationTemplates,
  }), [resolvedAdaptors, searchVideos, searchImages, searchAudio, getTextTemplates, getStickerTemplates, getTemplateOverlays, getAnimationTemplates]);

  return (
    <MediaAdaptorContext.Provider value={contextValue}>
      {children}
    </MediaAdaptorContext.Provider>
  );
};

export const useMediaAdaptors = (): MediaAdaptorContextType => {
  const context = useContext(MediaAdaptorContext);
  if (!context) {
    throw new Error('useMediaAdaptors must be used within MediaAdaptorProvider');
  }
  return context;
}; 