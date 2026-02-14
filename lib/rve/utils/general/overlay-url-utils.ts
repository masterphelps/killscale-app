/**
 * Overlay URL Utility
 * 
 * This utility provides functions to convert overlays between blob URLs and original URLs.
 * Used for iframe communication, server persistence, and media caching.
 */


import { Overlay } from '../../types';
import { getCachedMediaOriginalUrl, getCachedMedia, cacheMedia } from './media-cache';

// Map to store original URL to blob URL mappings for restoration
// This allows us to restore blob URLs when overlays come back from iframes with original URLs
const originalUrlToBlobUrlMap = new Map<string, string>();

/**
 * Restore original URLs for overlays that have blob URLs
 * This ensures iframes/server receive the original URLs instead of cached blob URLs
 * 
 * Always stores the mapping for potential restoration and throws errors if original URL cannot be found.
 * 
 * @param overlays - Array of overlays to process
 * @returns Array of overlays with original URLs
 * @throws Error if original URL cannot be found for any blob URL
 */
export const restoreOriginalUrls = (overlays: Overlay[]): Overlay[] => {
  return overlays.map((overlay: Overlay) => {
    const overlayWithSrc = overlay as any; // Type assertion for overlays with src property
    const updatedOverlay: any = { ...overlay };
    let hasChanges = false;

    // Check if overlay has src property (ClipOverlay, SoundOverlay, ImageOverlay)
    if ('src' in overlay && overlayWithSrc.src && overlayWithSrc.src.startsWith('blob:')) {
      const originalUrl = getCachedMediaOriginalUrl(overlayWithSrc.src);
      if (originalUrl) {
        // Always store the mapping for potential restoration
        originalUrlToBlobUrlMap.set(originalUrl, overlayWithSrc.src);
        updatedOverlay.src = originalUrl;
        hasChanges = true;
      } else {
        throw new Error(`Could not find original URL for cached media: ${overlayWithSrc.src}`);
      }
    }

    // For ClipOverlay, also restore audioSrc if present
    if (overlay.type === 'video' && overlayWithSrc.audioSrc && overlayWithSrc.audioSrc.startsWith('blob:')) {
      const originalAudioUrl = getCachedMediaOriginalUrl(overlayWithSrc.audioSrc);
      if (originalAudioUrl) {
        // Always store the mapping for potential restoration
        originalUrlToBlobUrlMap.set(originalAudioUrl, overlayWithSrc.audioSrc);
        updatedOverlay.audioSrc = originalAudioUrl;
        hasChanges = true;
      } else {
        throw new Error(`Could not find original URL for cached audio: ${overlayWithSrc.audioSrc}`);
      }
    }

    return hasChanges ? updatedOverlay : overlay;
  });
};

/**
 * Restore blob URLs for overlays that have original URLs
 * This restores the cached blob URLs from the mapping or cache
 * 
 * @param overlays - Array of overlays to process
 * @returns Promise resolving to array of overlays with blob URLs
 */
export const restoreBlobUrls = async (overlays: Overlay[]): Promise<Overlay[]> => {
  const restoredOverlays = await Promise.all(
    overlays.map(async (overlay: Overlay) => {
      const overlayWithSrc = overlay as any; // Type assertion for overlays with src property
      const updatedOverlay: any = { ...overlay };
      let hasChanges = false;

      // Check if overlay has src property (ClipOverlay, SoundOverlay, ImageOverlay)
      if ('src' in overlay && overlayWithSrc.src && !overlayWithSrc.src.startsWith('blob:')) {
        // Check if we have a cached mapping
        const cachedBlobUrl = originalUrlToBlobUrlMap.get(overlayWithSrc.src);
        if (cachedBlobUrl) {
          updatedOverlay.src = cachedBlobUrl;
          hasChanges = true;
        } else {
          // Try to get cached media for this URL
          const blobUrl = await getCachedMedia(overlayWithSrc.src);
          if (blobUrl) {
            // Store the mapping for future use
            originalUrlToBlobUrlMap.set(overlayWithSrc.src, blobUrl);
            updatedOverlay.src = blobUrl;
            hasChanges = true;
          }
        }
      }

      // For ClipOverlay, also restore audioSrc if present
      if (overlay.type === 'video' && overlayWithSrc.audioSrc && !overlayWithSrc.audioSrc.startsWith('blob:')) {
        // Check if we have a cached mapping
        const cachedAudioBlobUrl = originalUrlToBlobUrlMap.get(overlayWithSrc.audioSrc);
        if (cachedAudioBlobUrl) {
          updatedOverlay.audioSrc = cachedAudioBlobUrl;
          hasChanges = true;
        } else {
          // Try to get cached media for this audio URL
          const audioBlobUrl = await getCachedMedia(overlayWithSrc.audioSrc);
          if (audioBlobUrl) {
            // Store the mapping for future use
            originalUrlToBlobUrlMap.set(overlayWithSrc.audioSrc, audioBlobUrl);
            updatedOverlay.audioSrc = audioBlobUrl;
            hasChanges = true;
          }
        }
      }

      return hasChanges ? updatedOverlay : overlay;
    })
  );

  return restoredOverlays;
};

/**
 * Cache original URLs to blob URLs for overlays
 * This converts original URLs to cached blob URLs by fetching and caching the media
 * 
 * @param overlays - Array of overlays to process
 * @returns Promise resolving to array of overlays with blob URLs
 */
export const cacheOverlaysToBlobUrls = async (overlays: Overlay[]): Promise<Overlay[]> => {
  return await Promise.all(
    overlays.map(async (overlay: Overlay) => {
      const overlayWithSrc = overlay as any; // Type assertion for overlays with src property
      const processedOverlay: any = { ...overlay };

      // Only process overlays with a src url
      if (overlayWithSrc.src) {
        try {
          // Attempt to cache the media
          const cachedUrl = await cacheMedia(overlayWithSrc.src, null);
          if (cachedUrl) {
            processedOverlay.src = cachedUrl;
          }
        } catch (error) {
          console.warn(`Failed to cache media ${overlayWithSrc.src}:`, error);
        }
      }

      // For ClipOverlay, also cache audioSrc if present
      if (overlay.type === 'video' && overlayWithSrc.audioSrc) {
        try {
          const cachedAudioUrl = await cacheMedia(overlayWithSrc.audioSrc, null);
          if (cachedAudioUrl) {
            processedOverlay.audioSrc = cachedAudioUrl;
          }
        } catch (error) {
          console.warn(`Failed to cache audio ${overlayWithSrc.audioSrc}:`, error);
        }
      }

      // Return overlay with cached URLs
      return processedOverlay;
    })
  );
};
