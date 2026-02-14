/**
 * Utility for loading font previews in the editor dropdown
 * Loads a minimal subset of the font containing only the characters in the font name
 * This ensures fast loading times for the font selection UI
 */

import { useState, useCallback } from 'react';

// Global cache to track loaded preview fonts
const globalLoadedFonts = new Set<string>();

// Global cache to track failed font loads (to prevent retries)
const globalFailedFonts = new Set<string>();

/**
 * Creates a preview-specific font name to avoid conflicts with full fonts
 * @param fontFamily - The original font family name
 * @returns The preview font name (e.g., "RobotoPreview")
 */
export const makeFontPreviewName = (fontFamily: string): string => {
  return `${fontFamily}Preview`;
};

/**
 * Loads a font subset for preview purposes
 * Only loads the characters needed to display the font name
 * 
 * @param previewName - The font name as it appears in Google Fonts URL (e.g., "Open+Sans")
 * @param fontFamily - The actual font family name (e.g., "Open Sans")
 * @returns Promise that resolves when the font is loaded
 */
export const loadFontPreview = async (
  previewName: string,
  fontFamily: string,
): Promise<void> => {
  const previewFontName = makeFontPreviewName(fontFamily);
  
  // Check if already loaded
  if (globalLoadedFonts.has(previewFontName)) {
    return;
  }

  // Check if previously failed - don't retry
  if (globalFailedFonts.has(previewFontName)) {
    return;
  }

  try {
    // Fetch CSS with only characters needed for font name
    const response = await fetch(
      `https://fonts.googleapis.com/css?family=${previewName}:400&text=${encodeURIComponent(fontFamily)}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.statusText}`);
    }

    const cssText = await response.text();
    
    // Extract the font URL from the CSS
    const urlMatch = cssText.match(/url\((.*?)\)/);
    if (!urlMatch || !urlMatch[1]) {
      throw new Error('Could not extract font URL from CSS');
    }

    const fontUrl = urlMatch[1];
    
    // Create and load the font face
    const fontFace = new FontFace(
      previewFontName,
      `url(${fontUrl})`,
      {
        weight: '400',
        style: 'normal',
      }
    );

    await fontFace.load();
    document.fonts.add(fontFace);
    
    // Mark as loaded
    globalLoadedFonts.add(previewFontName);
  } catch (error) {
    // Mark as failed to prevent retries
    globalFailedFonts.add(previewFontName);
    console.error(`Failed to load font preview for ${fontFamily}:`, error);
    throw error;
  }
};

/**
 * Hook for managing font preview loading in React components
 * Provides a convenient interface for loading and tracking font previews
 * Uses React state to trigger re-renders when fonts load
 */
export const useFontPreviewLoader = () => {
  // Local state that triggers React updates when fonts load
  const [, setLoadedFontsVersion] = useState(0);
  
  const loadFontForPreview = useCallback(async (fontFamily: string, previewUrl?: string) => {
    // Use provided previewUrl or fallback to replacing spaces with +
    const urlName = previewUrl || fontFamily.replace(/\s+/g, '+');
    const previewFontName = makeFontPreviewName(fontFamily);
    const wasAlreadyLoaded = globalLoadedFonts.has(previewFontName);
    const wasFailed = globalFailedFonts.has(previewFontName);
    
    // Don't try to load if already loaded or previously failed
    if (wasAlreadyLoaded || wasFailed) {
      return;
    }
    
    await loadFontPreview(urlName, fontFamily);
    
    // Force a re-render after font loads (only if it wasn't already loaded)
    if (!wasAlreadyLoaded) {
      setLoadedFontsVersion(v => v + 1);
    }
  }, []);
  
  const isFontLoaded = useCallback((fontFamily: string): boolean => {
    return globalLoadedFonts.has(makeFontPreviewName(fontFamily));
  }, []);
  
  return {
    loadFontForPreview,
    loadedFonts: globalLoadedFonts,
    isFontLoaded,
    makeFontPreviewName,
  };
};

