/**
 * Calculates the draw dimensions and position for an image/video on a canvas
 * based on CSS objectFit behavior
 * 
 * @param sourceWidth - The natural width of the source media
 * @param sourceHeight - The natural height of the source media
 * @param canvasWidth - The canvas width to draw into
 * @param canvasHeight - The canvas height to draw into
 * @param objectFit - The CSS objectFit mode
 * @returns Object with drawX, drawY, drawWidth, drawHeight
 */
export function calculateObjectFitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  objectFit: "contain" | "cover" | "fill" | "none" | "scale-down" = "cover"
): {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
} {
  let drawX = 0;
  let drawY = 0;
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;

  switch (objectFit) {
    case "contain": {
      const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      drawWidth = sourceWidth * scale;
      drawHeight = sourceHeight * scale;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
      break;
    }

    case "cover": {
      const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      drawWidth = sourceWidth * scale;
      drawHeight = sourceHeight * scale;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
      break;
    }

    case "fill":
      // Use full canvas dimensions (already set as defaults)
      break;

    case "none": {
      drawWidth = sourceWidth;
      drawHeight = sourceHeight;
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
      break;
    }

    case "scale-down": {
      // Use "none" if source is smaller, otherwise use "contain"
      if (sourceWidth > canvasWidth || sourceHeight > canvasHeight) {
        const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
        drawWidth = sourceWidth * scale;
        drawHeight = sourceHeight * scale;
      } else {
        drawWidth = sourceWidth;
        drawHeight = sourceHeight;
      }
      drawX = (canvasWidth - drawWidth) / 2;
      drawY = (canvasHeight - drawHeight) / 2;
      break;
    }
  }

  return { drawX, drawY, drawWidth, drawHeight };
}

