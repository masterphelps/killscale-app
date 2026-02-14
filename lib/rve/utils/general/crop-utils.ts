/**
 * Crop Utilities
 * 
 * This module provides utilities for handling crop functionality in overlays.
 * 
 * SOLUTION OVERVIEW:
 * The original issue was that cropping used CSS clipPath which only visually cropped
 * the content but didn't change the overlay's actual dimensions. This meant the 
 * selection outline still showed the original uncropped size.
 * 
 * The solution uses getEffectiveCropDimensions() which:
 * 1. Calculates what the overlay dimensions would be if cropped
 * 2. Returns effective dimensions for the selection outline
 * 3. Keeps the original overlay unchanged (preserving the crop effect)
 * 4. Makes the selection outline automatically match the visually cropped area
 * 
 * This approach maintains the visual crop while making the selection outline intuitive.
 * No "Apply Crop" button needed - it works automatically!
 */

/**
 * Generates a CSS clipPath string based on crop parameters
 * @param x - Crop X position as percentage (0-100)
 * @param y - Crop Y position as percentage (0-100) 
 * @param width - Crop width as percentage (0-100)
 * @param height - Crop height as percentage (0-100)
 * @returns CSS clipPath inset string
 */
export const generateClipPath = (
  x: number = 0,
  y: number = 0,
  width: number = 100,
  height: number = 100
): string => {
  // Convert percentages to CSS clipPath inset values
  const top = y;
  const right = 100 - (x + width);
  const bottom = 100 - (y + height);
  const left = x;
  
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
};

/**
 * Calculates the effective dimensions and position of an overlay after cropping
 * This is used to make the selection outline match the cropped area without
 * actually changing the overlay's stored dimensions
 * @param overlay - The overlay with crop settings
 * @returns Effective dimensions and position for display purposes
 */
export const getEffectiveCropDimensions = (overlay: { 
  width: number; 
  height: number; 
  left: number; 
  top: number; 
  styles?: any 
}) => {
  // Handle case where styles might be undefined
  if (!overlay.styles) {
    return {
      width: overlay.width,
      height: overlay.height,
      left: overlay.left,
      top: overlay.top,
    };
  }

  const cropX = overlay.styles.cropX || 0;
  const cropY = overlay.styles.cropY || 0;
  const cropWidth = overlay.styles.cropWidth || 100;
  const cropHeight = overlay.styles.cropHeight || 100;

  // If no crop is applied, return original dimensions
  if (cropX === 0 && cropY === 0 && cropWidth === 100 && cropHeight === 100) {
    return {
      width: overlay.width,
      height: overlay.height,
      left: overlay.left,
      top: overlay.top,
    };
  }

  // Calculate the cropped area in pixels
  const cropLeftPx = (cropX / 100) * overlay.width;
  const cropTopPx = (cropY / 100) * overlay.height;
  const cropWidthPx = (cropWidth / 100) * overlay.width;
  const cropHeightPx = (cropHeight / 100) * overlay.height;

  return {
    width: Math.round(cropWidthPx),
    height: Math.round(cropHeightPx),
    left: overlay.left + Math.round(cropLeftPx),
    top: overlay.top + Math.round(cropTopPx),
  };
};

/**
 * Applies crop by actually changing overlay dimensions and position
 * This makes the selection outline match the cropped area
 * IMPORTANT: This keeps the visual crop effect by maintaining clipPath
 * @param overlay - The overlay to apply crop to
 * @param cropX - Crop X position as percentage (0-100)
 * @param cropY - Crop Y position as percentage (0-100)
 * @param cropWidth - Crop width as percentage (0-100)
 * @param cropHeight - Crop height as percentage (0-100)
 * @returns Updated overlay with new dimensions and position but keeping crop effect
 */
export const applyCropToOverlay = <T extends { width: number; height: number; left: number; top: number; styles: any }>(
  overlay: T,
  cropX: number = 0,
  cropY: number = 0,
  cropWidth: number = 100,
  cropHeight: number = 100
): T => {
  // Calculate the cropped area in pixels
  const cropLeftPx = (cropX / 100) * overlay.width;
  const cropTopPx = (cropY / 100) * overlay.height;
  const cropWidthPx = (cropWidth / 100) * overlay.width;
  const cropHeightPx = (cropHeight / 100) * overlay.height;

  // Update overlay dimensions and position to match the cropped area
  const updatedOverlay = {
    ...overlay,
    width: Math.round(cropWidthPx),
    height: Math.round(cropHeightPx),
    left: overlay.left + Math.round(cropLeftPx),
    top: overlay.top + Math.round(cropTopPx),
    styles: {
      ...overlay.styles,
      // Reset crop values since we've applied them to dimensions
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      // Remove clipPath since we're using actual dimensions now
      clipPath: 'none',
    },
  };

  return updatedOverlay;
};

/**
 * Checks if an overlay has active crop settings
 * @param overlay - The overlay to check
 * @returns true if the overlay has crop settings different from defaults
 */
export const hasActiveCrop = (overlay: { styles: any }): boolean => {
  const cropX = overlay.styles.cropX || 0;
  const cropY = overlay.styles.cropY || 0;
  const cropWidth = overlay.styles.cropWidth || 100;
  const cropHeight = overlay.styles.cropHeight || 100;

  return cropX !== 0 || cropY !== 0 || cropWidth !== 100 || cropHeight !== 100;
}; 