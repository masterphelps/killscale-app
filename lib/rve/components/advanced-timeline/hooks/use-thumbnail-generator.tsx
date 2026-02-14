import { getOrCreateThumbnailSprite, ThumbnailRect } from '../../../utils/general/thumbnail-cache';
import React, { useState, useEffect, useRef } from 'react';

// Module-level tracking for background thumbnail generation to prevent race conditions
// across multiple hook instances using the same video
const backgroundGenerationStarted = new Set<string>();
const backgroundGenerationReady = new Set<string>();

// Thumbnail generation intervals
const ZOOMED_IN_SHORT_INTERVAL_SEC  = 1;   // This is the lowest we'll go when zoomed in for a video under 7 minute
const ZOOMED_IN_NORMAL_INTERVAL_SEC = 5;   // This is the lowest we'll go when zoomed in for a video under 1 hour
const ZOOMED_IN_LONG_INTERVAL_SEC   = 10;  // This is the lowest we'll go when zoomed in for a video over 1 hour
const ZOOMED_OUT_INTERVAL_SEC       = 60;  // For when secPerPixel < SEC_PER_PIXEL_BIG_THRESHOLD
const ZOOMED_WAY_OUT_INTERVAL_SEC   = 180; // For when secPerPixel > SEC_PER_PIXEL_BIG_THRESHOLD

// Cut-off durations to choose if we use the short/long intervals to make sure we don't get too many thumbnails
// for longer videos
const ZOOMED_IN_SHORT_CUT_OFF_DURATION_SEC = 60 * 7; // 7 minutes
const ZOOMED_IN_LONG_CUT_OFF_DURATION_SEC  = 60 * 60; // 1 hour

// Separate cut-off if video is so short we can always use the zoomed in short interval
const ZOOMED_IN_ALWAYS_CUT_OFF_DURATION_SEC = 60 * 3; // 3 minutes

// Using 40px thumbnails which matches the height of the 40px timeline item.  We could reduce this to say 20px
// (which will get resized to 40px) to reduce the size of cached image or play with the intervals above.
const THUMBNAIL_HEIGHT_PX = 40;

// If secPerPixel exceeds this threshold we consider ourselves "really zoomed out" and use a larger interval
// so we can get thumbnails faster.
const SEC_PER_PIXEL_BIG_THRESHOLD = 1.45;

interface ThumbnailGeneratorResult {
  spriteUrl: string | null;
  rectForTime: ((timestampSec: number) => ThumbnailRect) | null;
  isLoading: boolean;
  error: string | null;
  intervalSec: number; // The interval value that was actually used
}

interface UseThumbnailGeneratorProps {
  videoId?: string;
  videoSrc?: string;
  duration: number;
  itemWidth: number;
  itemHeight: number;
}

export const useThumbnailGenerator = ({
  videoId,
  videoSrc,
  duration,
  itemWidth,
  itemHeight
}: UseThumbnailGeneratorProps): ThumbnailGeneratorResult => {
  const [spriteBlob, setSpriteBlob] = useState<Blob | null>(null);
  const [rectForTime, setRectForTime] = useState<((timestampSec: number) => ThumbnailRect) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const zoomedOutIntervalRef = useRef(0);
  const currentCacheKeyRef = useRef<string | null>(null);
  
  // Create a stable background cache key for this video+interval combo
  const backgroundCacheKeyRef = useRef<string | null>(null);

  const isShortVideo = duration < ZOOMED_IN_SHORT_CUT_OFF_DURATION_SEC;
  const isLongVideo = duration > ZOOMED_IN_LONG_CUT_OFF_DURATION_SEC;
  let zoomedInIntervalSec = ZOOMED_IN_NORMAL_INTERVAL_SEC;
  if (isLongVideo) {
    zoomedInIntervalSec = ZOOMED_IN_LONG_INTERVAL_SEC;
  } else if (isShortVideo) {
    zoomedInIntervalSec = ZOOMED_IN_SHORT_INTERVAL_SEC;
  }

  // Determine interval based on secPerPixel
  const determineInterval = (duration: number, itemWidth: number): number => {
    // If the zoomed in thumbnails are ready, always use them since they are the most accurate else we'll use the zoomed
    // out interval...
    const bgCacheKey = backgroundCacheKeyRef.current;
    if (bgCacheKey && backgroundGenerationReady.has(bgCacheKey)) {
        return zoomedInIntervalSec;
    }

    // If duration is short enough, we can always use the zoomed in interval since will also look funny if we
    // only have 1 or 2 thumbnails for a short video when zoomed out.
    if (duration <= ZOOMED_IN_ALWAYS_CUT_OFF_DURATION_SEC) {
      return zoomedInIntervalSec;
    }

    // Else we don't have detailed thumbnails so we'll return the chosen zoomed out interval sec we've already determined
    if (zoomedOutIntervalRef.current > 0) {
        return zoomedOutIntervalRef.current;
    }

    // The first request we'll get will be fully zoomed out, and we'll choose interval to use for "zoomed out" which will
    // be larger if this is a very long video so we don't create a ton of thumbnails needlessly for zoomed out view.
    const secPerPixel = (duration || 0) / itemWidth;
    if (secPerPixel > SEC_PER_PIXEL_BIG_THRESHOLD) {
        zoomedOutIntervalRef.current = ZOOMED_WAY_OUT_INTERVAL_SEC;
    } else {
        zoomedOutIntervalRef.current = ZOOMED_OUT_INTERVAL_SEC;
    }
    
    return zoomedOutIntervalRef.current;
  };

  // Compute the current interval (if we have a valid itemWidth)
  const intervalSec = (itemWidth > 0 && duration > 0) ? determineInterval(duration, itemWidth) : 0;
  
  // Debug logging for interval selection
  //const backgroundReady = backgroundThumbnailsReadyRef.current;
  //console.log(`[ThumbnailGenerator] secPerPixel: ${secPerPixel.toFixed(2)}, chosen interval: ${intervalSec}s, backgroundReady: ${backgroundReady}`);

  // Generate thumbnails using the thumbnail cache
  useEffect(() => {
    if (!videoSrc || intervalSec === 0) {
      setSpriteBlob(null);
      setRectForTime(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Helper function to generate cache keys
    const generateCacheKey = (interval: number): string => {
      return `video-thumbnail-${videoId}-${interval}-${THUMBNAIL_HEIGHT_PX}`;
    };

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const generateThumbnails = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Create cache key
        const cacheKey = generateCacheKey(intervalSec);
        currentCacheKeyRef.current = cacheKey;
        
        const { blob, rectForTime: rectFn } = await getOrCreateThumbnailSprite(
          cacheKey,
          videoSrc,
          intervalSec,
          THUMBNAIL_HEIGHT_PX
        );

        if (!abortController.signal.aborted) {
          setSpriteBlob(blob);
          setRectForTime(() => rectFn);
          setIsLoading(false);
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to generate thumbnails';
          setError(errorMessage);
          setIsLoading(false);
        }
      }
    };

    // Generate background thumbnails if using zoomed-out interval
    const generateBackgroundThumbnails = () => {
      if (intervalSec > zoomedInIntervalSec) {
        // Create cache key for background generation
        const bgCacheKey = generateCacheKey(zoomedInIntervalSec);
        backgroundCacheKeyRef.current = bgCacheKey;
        
        // Use module-level Set to prevent race conditions across multiple hook instances.
        // Check and add atomically (JS is single-threaded so this is safe within sync code)
        if (backgroundGenerationStarted.has(bgCacheKey)) {
          return;
        }
        backgroundGenerationStarted.add(bgCacheKey);

        console.log(`[ThumbnailGenerator] Starting background generation for ${zoomedInIntervalSec}s interval (key: ${bgCacheKey})`);

        // Just kick off the process - don't wait for or use the result
        getOrCreateThumbnailSprite(
          bgCacheKey,
          videoSrc,
          zoomedInIntervalSec, // Always use zoomed-in interval for background
          THUMBNAIL_HEIGHT_PX
        ).then(() => {
          // Mark background thumbnails as ready at module level
          backgroundGenerationReady.add(bgCacheKey);
          console.log(`[ThumbnailGenerator] Background thumbnails ready! Will now use ${zoomedInIntervalSec}s interval (key: ${bgCacheKey})`);
        }).catch(err => {
          // On failure, remove from started set so it can be retried
          backgroundGenerationStarted.delete(bgCacheKey);
          console.warn('Background thumbnail generation failed:', err);
        });
      } else {
        // Even when not doing background generation, set the cache key so determineInterval works
        backgroundCacheKeyRef.current = generateCacheKey(zoomedInIntervalSec);
        console.log(`[ThumbnailGenerator] Skipping background generation (using ${intervalSec}s interval)`);
      }
    };

    generateThumbnails();
    generateBackgroundThumbnails();

    return () => {
      abortController.abort();
    };
  }, [videoSrc, videoId, intervalSec]);

  // Create sprite URL from blob and handle cleanup in the same effect
  // This ensures the cleanup function always revokes the exact URL it created
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!spriteBlob) {
      setSpriteUrl(null);
      return;
    }

    const url = URL.createObjectURL(spriteBlob);
    console.log(`[ThumbnailGenerator] Creating sprite URL: ${url} (cache key: ${currentCacheKeyRef.current})`);
    setSpriteUrl(url);

    return () => {
      console.log(`[ThumbnailGenerator] Cleaning up sprite URL: ${url} (cache key: ${currentCacheKeyRef.current})`);
      URL.revokeObjectURL(url);
    };
  }, [spriteBlob]);

  return {
    spriteUrl,
    rectForTime,
    isLoading,
    error,
    intervalSec
  };
};
