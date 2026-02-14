import React, { useCallback } from "react";
import { useCurrentScale } from "remotion";
import { ClipOverlay, ImageOverlay } from "../../types";
import { generateClipPath, getEffectiveCropDimensions } from "../../utils/crop-utils";

// Generic type for overlays that support cropping
type CroppableOverlay = ClipOverlay | ImageOverlay;

const CROP_LINE_WIDTH = 4;
const CROP_BAR_LENGTH = 30; // Length of the drag bars

/**
 * CropOverlay component renders draggable crop lines within an overlay's bounds.
 * It shows visual crop boundaries that can be adjusted by dragging the edges.
 * Works with both video and image overlays when crop is enabled.
 *
 * @component
 * @param {Object} props
 * @param {CroppableOverlay} props.overlay - The overlay object with crop settings
 * @param {Function} props.onCropChange - Callback to update crop values
 */
export const CropOverlay: React.FC<{
  overlay: CroppableOverlay;
  onCropChange: (updates: {
    cropEnabled?: boolean;
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    clipPath?: string;
  }) => void;
}> = ({ overlay, onCropChange }) => {
  const scale = useCurrentScale();
  const lineWidth = Math.ceil(CROP_LINE_WIDTH / scale);
  const barLength = Math.ceil(CROP_BAR_LENGTH / scale);
  const borderSize = 1 / scale;

  const cropX = overlay.styles.cropX || 0;
  const cropY = overlay.styles.cropY || 0;
  const cropWidth = overlay.styles.cropWidth || 100;
  const cropHeight = overlay.styles.cropHeight || 100;

  // Calculate crop boundaries in pixels relative to the original overlay
  const cropLeftPx = (cropX / 100) * overlay.width;
  const cropTopPx = (cropY / 100) * overlay.height;
  const cropRightPx = ((cropX + cropWidth) / 100) * overlay.width;
  const cropBottomPx = ((cropY + cropHeight) / 100) * overlay.height;

  // The crop handles should always be positioned relative to the selection outline
  // When crop is enabled and has been modified, the selection outline uses effective dimensions
  // So we need to offset the crop handles to align with the original overlay boundaries
  const effectiveDimensions = getEffectiveCropDimensions(overlay);
  const isUsingEffectiveDimensions = 
    effectiveDimensions.width !== overlay.width || 
    effectiveDimensions.height !== overlay.height;
  
  // Calculate offset only when selection outline is using effective dimensions
  const offsetX = isUsingEffectiveDimensions ? effectiveDimensions.left - overlay.left : 0;
  const offsetY = isUsingEffectiveDimensions ? effectiveDimensions.top - overlay.top : 0;

  const createDragHandler = useCallback(
    (
      type: 'left' | 'right' | 'top' | 'bottom'
    ) => {
      return (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection during drag
        if (e.button !== 0) return;

        const initialX = e.clientX;
        const initialY = e.clientY;

        const onPointerMove = (pointerMoveEvent: PointerEvent) => {
          const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
          const offsetY = (pointerMoveEvent.clientY - initialY) / scale;
          const updates: any = {};

          if (type === 'left') {
            // Moving left edge - affects cropX and cropWidth
            const newCropLeftPx = Math.max(0, Math.min(cropRightPx - 10, cropLeftPx + offsetX));
            const newCropX = (newCropLeftPx / overlay.width) * 100;
            const newCropWidth = cropWidth - (newCropX - cropX);
            updates.cropX = Math.round(newCropX);
            updates.cropWidth = Math.round(newCropWidth);
          }

          if (type === 'right') {
            // Moving right edge - affects cropWidth
            const newCropRightPx = Math.max(cropLeftPx + 10, Math.min(overlay.width, cropRightPx + offsetX));
            const newCropWidth = ((newCropRightPx - cropLeftPx) / overlay.width) * 100;
            updates.cropWidth = Math.round(newCropWidth);
          }

          if (type === 'top') {
            // Moving top edge - affects cropY and cropHeight
            const newCropTopPx = Math.max(0, Math.min(cropBottomPx - 10, cropTopPx + offsetY));
            const newCropY = (newCropTopPx / overlay.height) * 100;
            const newCropHeight = cropHeight - (newCropY - cropY);
            updates.cropY = Math.round(newCropY);
            updates.cropHeight = Math.round(newCropHeight);
          }

          if (type === 'bottom') {
            // Moving bottom edge - affects cropHeight
            const newCropBottomPx = Math.max(cropTopPx + 10, Math.min(overlay.height, cropBottomPx + offsetY));
            const newCropHeight = ((newCropBottomPx - cropTopPx) / overlay.height) * 100;
            updates.cropHeight = Math.round(newCropHeight);
          }

          // Generate new clipPath based on updated values
          const finalCropX = updates.cropX !== undefined ? updates.cropX : cropX;
          const finalCropY = updates.cropY !== undefined ? updates.cropY : cropY;
          const finalCropWidth = updates.cropWidth !== undefined ? updates.cropWidth : cropWidth;
          const finalCropHeight = updates.cropHeight !== undefined ? updates.cropHeight : cropHeight;
          
          updates.clipPath = generateClipPath(finalCropX, finalCropY, finalCropWidth, finalCropHeight);
          
          onCropChange(updates);
        };

        const onPointerUp = () => {
          window.removeEventListener("pointermove", onPointerMove);
        };

        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerup", onPointerUp, { once: true });
      };
    },
    [overlay, scale, cropX, cropY, cropWidth, cropHeight, cropLeftPx, cropTopPx, cropRightPx, cropBottomPx, onCropChange]
  );

  // Base z-index should be higher than selection outline but lower than resize handles
  const baseZIndex = 15000;

  // Drag bar styles
  const dragBarStyle: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "white",
    border: `${borderSize}px solid #3B8BF2`,
    pointerEvents: "all",
    zIndex: baseZIndex + 1,
  };

  return (
    <>
      {/* Left drag bar */}
      <div
        style={{
          ...dragBarStyle,
          left: cropLeftPx - lineWidth - offsetX,
          top: cropTopPx + (cropBottomPx - cropTopPx) / 2 - barLength / 2 - offsetY,
          width: lineWidth,
          height: barLength,
          cursor: "ew-resize",
        }}
        onPointerDown={createDragHandler('left')}
      />
      
      {/* Right drag bar */}
      <div
        style={{
          ...dragBarStyle,
          left: cropRightPx - offsetX,
          top: cropTopPx + (cropBottomPx - cropTopPx) / 2 - barLength / 2 - offsetY,
          width: lineWidth,
          height: barLength,
          cursor: "ew-resize",
        }}
        onPointerDown={createDragHandler('right')}
      />
      
      {/* Top drag bar */}
      <div
        style={{
          ...dragBarStyle,
          left: cropLeftPx + (cropRightPx - cropLeftPx) / 2 - barLength / 2 - offsetX,
          top: cropTopPx - lineWidth - offsetY,
          width: barLength,
          height: lineWidth,
          cursor: "ns-resize",
        }}
        onPointerDown={createDragHandler('top')}
      />
      
      {/* Bottom drag bar */}
      <div
        style={{
          ...dragBarStyle,
          left: cropLeftPx + (cropRightPx - cropLeftPx) / 2 - barLength / 2 - offsetX,
          top: cropBottomPx - offsetY,
          width: barLength,
          height: lineWidth,
          cursor: "ns-resize",
        }}
        onPointerDown={createDragHandler('bottom')}
      />
    </>
  );
}; 