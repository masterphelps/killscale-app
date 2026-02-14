/**
 * Utility for loading full Google Fonts for text rendering
 * Handles font loading for both editor preview and server-side rendering
 */

import { loadFontFromInfo } from '@remotion/google-fonts/from-info';
import type { FontInfo } from '@remotion/google-fonts';
import { getInfo as getRobotoFontInfo } from '@remotion/google-fonts/Roboto';
import { continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';

/**
 * Interface for font loading configuration
 */
export interface LoadFontInfo {
  fontFamily: string;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  fontInfosDuringRendering: FontInfo | null;
}

// Cache for font info to avoid redundant API calls
const fontInfoPromiseCache: Record<string, Promise<FontInfo>> = {};

/**
 * Loads font info either from API (in editor) or from pre-collected data (during rendering)
 * Falls back to Roboto font on error for graceful degradation
 * 
 * @param options - Font loading options
 * @returns Promise resolving to FontInfo
 */
const loadFontInfo = async ({
  fontFamily,
  fontInfosDuringRendering,
}: {
  fontFamily: string;
  fontInfosDuringRendering: FontInfo | null;
}): Promise<FontInfo> => {
  // During rendering, use pre-collected font info
  if (fontInfosDuringRendering) {
    return fontInfosDuringRendering;
  }

  // In editor, fetch from API with caching
  if (!fontInfoPromiseCache[fontFamily]) {
    fontInfoPromiseCache[fontFamily] = fetch(`/api/fonts/${fontFamily}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch font info for ${fontFamily}: ${res.statusText}`);
        }
        return res.json() as Promise<FontInfo>;
      })
      .catch((error) => {
        console.warn(
          `Failed to load font "${fontFamily}", falling back to Roboto.`,
          `Error: ${error.message}`,
          `For custom fonts, see: https://remotion.dev/docs/google-fonts`
        );
        
        // Remove from cache on error so it can be retried
        delete fontInfoPromiseCache[fontFamily];
        
        // Return Roboto as fallback
        return getRobotoFontInfo();
      });
  }

  return fontInfoPromiseCache[fontFamily];
};

/**
 * Loads a font from text item configuration
 * Handles both editor and rendering contexts
 * 
 * @param item - Font configuration from text item
 * @returns Promise that resolves when font is loaded
 */
export const loadFontFromTextItem = async (item: LoadFontInfo): Promise<void> => {
  try {
    // Get font info (with fallback to Roboto on error)
    const fontInfo = await loadFontInfo({
      fontFamily: item.fontFamily,
      fontInfosDuringRendering: item.fontInfosDuringRendering,
    });

    // Determine font variant based on weight and style
    const variant = item.fontStyle === 'italic' ? 'italic' : 'normal';

    // If using fallback font, adjust weight to available ones
    let fontWeight = item.fontWeight;
    if (fontInfo.fontFamily === 'Roboto' && item.fontFamily !== 'Roboto') {
      // Roboto supports all standard weights, but ensure we use a valid one
      const validWeights = ['100', '300', '400', '500', '700', '900'];
      if (!validWeights.includes(fontWeight)) {
        fontWeight = '400'; // Default to regular
      }
    }

    // Load font with specific weight
    await loadFontFromInfo(fontInfo, variant, {
      weights: [fontWeight],
    }).waitUntilDone();
  } catch (error) {
    console.error(`Failed to load font ${item.fontFamily}:`, error);
    // Don't throw - we've already fallen back to Roboto
  }
};

/**
 * Hook for loading fonts in React components with Remotion integration
 * Handles delayRender/continueRender for proper font loading during rendering
 * 
 * @param fontInfo - Font loading configuration
 * @returns Loading state
 */
export const useLoadFontFromTextItem = (fontInfo: LoadFontInfo | null): boolean => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!fontInfo) {
      setLoaded(true);
      return;
    }

    let handle: number | null = null;
    let cancelled = false;

    const loadFont = async () => {
      // Delay render until font is loaded
      handle = delayRender(`Loading font ${fontInfo.fontFamily}`);

      try {
        await loadFontFromTextItem(fontInfo);
        
        if (!cancelled) {
          setLoaded(true);
        }
      } catch (error) {
        console.error('Font loading error:', error);
        // Set loaded to true even on error to prevent infinite loading
        if (!cancelled) {
          setLoaded(true);
        }
      } finally {
        if (handle !== null) {
          continueRender(handle);
        }
      }
    };

    loadFont();

    return () => {
      cancelled = true;
      if (handle !== null) {
        continueRender(handle);
      }
    };
  }, [fontInfo?.fontFamily, fontInfo?.fontWeight, fontInfo?.fontStyle]);

  return loaded;
};

/**
 * Context for providing font infos during rendering
 * This is used to pass pre-collected font data to text layers
 */
import { createContext } from 'react';

export const FontInfoContext = createContext<Record<string, FontInfo>>({});
