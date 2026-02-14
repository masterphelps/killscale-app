import { useState, useEffect } from 'react';
import { parseMedia } from '@remotion/media-parser';

interface UseSrcDurationOptions {
  fps?: number; // frames per second for frame conversion, defaults to 30
}

interface UseSrcDurationResult {
  durationInSeconds: number | null;
  durationInFrames: number | null;
  isLoading: boolean;
  error: string | null;
  dimensions: { width: number; height: number } | null;
}

/**
 * Hook to get source duration of media files using @remotion/media-parser
 * Supports both File objects and URL strings
 * Returns duration in both seconds and frames
 */
export const useSrcDuration = (
  src: string | File | null | undefined,
  options: UseSrcDurationOptions = {}
): UseSrcDurationResult => {
  const { fps = 30 } = options;
  
  const [durationInSeconds, setDurationInSeconds] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setDurationInSeconds(null);
      setDimensions(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const parseDuration = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        let srcPath: string = '';
        const reader: any = undefined;

        // Handle File objects vs URL strings
        if (src instanceof File) {
          // For File objects in browser, create a temporary URL
          if (typeof window !== 'undefined') {
            srcPath = URL.createObjectURL(src);
          } else {
            // In Node.js environment, File objects are not supported
            throw new Error('File objects are not supported in Node.js environment. Use file path string instead.');
          }
        } else {
          // For URL strings, use directly
          srcPath = src;
          
          // For local file paths in Node.js, we'd need to dynamically import nodeReader
          if (src.startsWith('/') && typeof window === 'undefined') {
            // We'll handle this case in a separate function if needed
            throw new Error('Local file paths in Node.js environment are not supported in this context. Use URLs instead.');
          }
        }

        const parseOptions: any = {
          src: srcPath,
          fields: {
            durationInSeconds: true,
            dimensions: true,
          },
        };

        // Add reader for Node.js environments or local file paths
        if (reader) {
          parseOptions.reader = reader;
        }

        const result = await parseMedia(parseOptions);

        if (isCancelled) return;

        if ((result as any).durationInSeconds !== undefined) {
          setDurationInSeconds((result as any).durationInSeconds);
        }

        if ((result as any).dimensions) {
          setDimensions((result as any).dimensions);
        }

        // Clean up blob URL if we created one
        if (src instanceof File && typeof window !== 'undefined' && srcPath) {
          URL.revokeObjectURL(srcPath);
        }

      } catch (err) {
        if (isCancelled) return;
        
        console.error('Error parsing media duration:', err);
        setError(err instanceof Error ? err.message : 'Failed to parse media duration');
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    parseDuration();

    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [src, fps]);

  // Calculate duration in frames
  const durationInFrames = durationInSeconds !== null ? Math.round(durationInSeconds * fps) : null;

  return {
    durationInSeconds,
    durationInFrames,
    isLoading,
    error,
    dimensions,
  };
};

/**
 * Standalone function to get source duration (useful for one-off parsing)
 */
export const getSrcDuration = async (
  src: string | File,
  options: UseSrcDurationOptions = {}
): Promise<{
  durationInSeconds: number;
  durationInFrames: number;
  dimensions?: { width: number; height: number };
}> => {
  const { fps = 30 } = options;
  
  let srcPath: string;
  const reader: any = undefined;

  // Handle File objects vs URL strings
  if (src instanceof File) {
    if (typeof window !== 'undefined') {
      srcPath = URL.createObjectURL(src);
    } else {
      throw new Error('File objects are not supported in Node.js environment. Use file path string instead.');
    }
  } else {
    srcPath = src;
    
    // For local file paths in Node.js, we'd need to dynamically import nodeReader
    if (src.startsWith('/') && typeof window === 'undefined') {
      throw new Error('Local file paths in Node.js environment are not supported in this context. Use URLs instead.');
    }
  }

  try {
    const parseOptions: any = {
      src: srcPath,
      fields: {
        durationInSeconds: true,
        dimensions: true,
      },
    };

    if (reader) {
      parseOptions.reader = reader;
    }

    const result = await parseMedia(parseOptions);

    // Clean up blob URL if we created one
    if (src instanceof File && typeof window !== 'undefined') {
      URL.revokeObjectURL(srcPath);
    }

    if ((result as any).durationInSeconds === undefined) {
      throw new Error('Could not determine media duration');
    }

    return {
      durationInSeconds: (result as any).durationInSeconds,
      durationInFrames: Math.round((result as any).durationInSeconds * fps),
      dimensions: (result as any).dimensions || undefined,
    };

  } catch (error) {
    // Clean up blob URL on error if we created one
    if (src instanceof File && typeof window !== 'undefined') {
      try {
        URL.revokeObjectURL(srcPath);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}; 