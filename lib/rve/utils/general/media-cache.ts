/**
 * Media Caching Utility
 * 
 * This utility provides functions to:
 * - Cache media from URLs to IndexedDB
 * - Retrieve media as blob URLs
 */

import { IndexedDBCache, CacheRecord } from './indexed-db-cache';

const DB_NAME = 'VideoEditorMediaCacheDB';
const DB_VERSION = 3;
const VIDEO_STORE = 'mediaCache';

// In-memory mapping from blob URL to original URL
const blobUrlToOriginalUrlMap = new Map<string, string>();

// Track ongoing fetch operations to prevent duplicate requests
const pendingFetches = new Map<string, Promise<string | null>>();

interface Cached extends CacheRecord {
  url: string;
  blob: Blob;
  size: number;
}

// Initialize the cache instance
const mediaCache = new IndexedDBCache<Cached>({
  dbName: DB_NAME,
  storeName: VIDEO_STORE,
  version: DB_VERSION
});

/**
 * Cache media from URL
 */
export const cacheMedia = async (url: string, requestUrl: string|null): Promise<string | null> => {
  try {
    // If this is already cached blob URL, we can just return it...
    if (!url.startsWith("https://")) {
      return url;
    }

    // Check if already cached
    const existingBlobUrl = await getCachedMedia(url);
    if (existingBlobUrl) {
      return existingBlobUrl;
    }

    // Check if there's already a pending fetch for this URL
    const existingFetch = pendingFetches.get(url);
    if (existingFetch) {
      console.log(`Cache MISS (waiting for existing fetch): ${url}`);
      return await existingFetch;
    }

    // If caching successful, replace src with cached URL
    console.log(`Cache MISS: ${url}`);

    // Create a new fetch promise and store it in pendingFetches
    const fetchPromise = performMediaFetch(url, requestUrl);
    pendingFetches.set(url, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      // Clean up the pending fetch regardless of success or failure
      pendingFetches.delete(url);
    }
  } catch (error) {
    console.error('Error caching media:', error);
    return null; // Return null if caching fails
  }
};

/**
 * Perform the actual media fetch and caching
 */
const performMediaFetch = async (url: string, requestUrl: string|null): Promise<string | null> => {
  try {
    // If no requestUrl provided, try to fetch the HEAD request to get the final URL incase we have to deal with CORS
    // credentials and redirects
    if (requestUrl === null) {
      const headResponse = await fetch(url, {method: "HEAD", credentials: "include"});
      if (headResponse.status === 200) {
        const redirectUrl = headResponse.headers.get('location');
        if (redirectUrl) {
          requestUrl = redirectUrl;
        }
      }
    }

    // Fetch the media
    const response = await fetch(requestUrl || url);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }

    const blob = await response.blob();

    // Cache the media using URL as ID
    const cachedMedia: Cached = {
      id: url, // Use URL directly as ID
      url,
      blob,
      size: blob.size
    };

    await mediaCache.put(cachedMedia);

    // Create blob URL
    const blobUrl = URL.createObjectURL(blob);
     
    // Store reverse mapping in memory
    blobUrlToOriginalUrlMap.set(blobUrl, url);
     
    return blobUrl;
  } catch (error) {
    console.error('Error performing media fetch:', error);
    throw error;
  }
};

/**
 * Get cached media as blob URL
 */
export const getCachedMedia = async (url: string): Promise<string | null> => {
  try {
    const result = await mediaCache.get(url); // Use URL directly as key
    
    if (result) {
      // Create blob URL from cached blob
      const blobUrl = URL.createObjectURL(result.blob);

      // Store reverse mapping in memory
      blobUrlToOriginalUrlMap.set(blobUrl, url);

      return blobUrl;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting cached media:', error);
    return null;
  }
};

/**
 * Get the original URL for a cached media blob URL
 */
export const getCachedMediaOriginalUrl = (blobUrl: string): string | null => {
  try {
    // Look up in memory mapping
    const originalUrl = blobUrlToOriginalUrlMap.get(blobUrl);
    if (originalUrl) {
      return originalUrl;
    }

    // If not found in memory, return null
    return null;
  } catch (error) {
    console.error('Error getting cached media original URL:', error);
    return null;
  }
};

/**
 * Revoke a specific blob URL and clean up tracking
 */
export const revokeBlobUrl = (blobUrl: string): void => {
  try {
    if (blobUrlToOriginalUrlMap.has(blobUrl)) {
      URL.revokeObjectURL(blobUrl);
      blobUrlToOriginalUrlMap.delete(blobUrl);
    }
  } catch (error) {
    console.error('Error revoking blob URL:', error);
  }
};

/**
 * Revoke all created blob URLs and clean up tracking
 */
export const revokeAllBlobUrls = (): void => {
  try {
    for (const blobUrl of Array.from(blobUrlToOriginalUrlMap.keys())) {
      URL.revokeObjectURL(blobUrl);
    }
    blobUrlToOriginalUrlMap.clear();
  } catch (error) {
    console.error('Error revoking all blob URLs:', error);
  }
};