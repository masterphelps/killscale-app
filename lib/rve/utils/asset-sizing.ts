/**
 * Utility functions for intelligent asset sizing when importing media
 */

interface AssetSize {
  width: number;
  height: number;
}

interface CanvasSize {
  width: number;
  height: number;
}

interface SizedAsset {
  width: number;
  height: number;
}

/**
 * Calculates intelligent sizing for an asset based on canvas dimensions and asset dimensions.
 * 
 * Rules:
 * 1. If asset is smaller than canvas, use asset's original size
 * 2. If asset is larger than canvas, scale it down intelligently:
 *    - If aspect ratios match, fill the canvas
 *    - If aspect ratios don't match, scale the largest dimension to fit canvas
 *      while maintaining original aspect ratio
 * 
 * @param assetSize - Original dimensions of the asset
 * @param canvasSize - Canvas/viewport dimensions
 * @returns Calculated dimensions for the asset
 */
export function calculateIntelligentAssetSize(
  assetSize: AssetSize,
  canvasSize: CanvasSize
): SizedAsset {
  const { width: assetWidth, height: assetHeight } = assetSize;
  const { width: canvasWidth, height: canvasHeight } = canvasSize;

  // If asset is smaller than canvas in both dimensions, use original size
  if (assetWidth <= canvasWidth && assetHeight <= canvasHeight) {
    return {
      width: assetWidth,
      height: assetHeight,
    };
  }

  // Calculate aspect ratios
  const assetAspectRatio = assetWidth / assetHeight;
  const canvasAspectRatio = canvasWidth / canvasHeight;

  // If aspect ratios are very close (within 1% tolerance), fill the canvas
  const aspectRatioTolerance = 0.01;
  if (Math.abs(assetAspectRatio - canvasAspectRatio) < aspectRatioTolerance) {
    return {
      width: canvasWidth,
      height: canvasHeight,
    };
  }

  // Calculate scale factors for both dimensions
  const widthScale = canvasWidth / assetWidth;
  const heightScale = canvasHeight / assetHeight;

  // Use the smaller scale factor to ensure the asset fits within canvas bounds
  const scale = Math.min(widthScale, heightScale);

  const scaledWidth = assetWidth * scale;
  const scaledHeight = assetHeight * scale;

  return {
    width: Math.round(scaledWidth),
    height: Math.round(scaledHeight),
  };
}

/**
 * Helper function to get asset dimensions from StandardVideo/StandardImage
 */
export function getAssetDimensions(asset: {
  width?: number;
  height?: number;
}): AssetSize | null {
  if (!asset.width || !asset.height) {
    return null;
  }
  
  return {
    width: asset.width,
    height: asset.height,
  };
}

/**
 * Helper function to get asset dimensions from various asset types with size property
 */
export function getAssetDimensionsFromSize(asset: {
  size?: { width: number; height: number };
}): AssetSize | null {
  if (!asset.size) {
    return null;
  }
  
  return {
    width: asset.size.width,
    height: asset.size.height,
  };
} 