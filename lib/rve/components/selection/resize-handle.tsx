import React, { useCallback, useMemo } from "react";
import { useCurrentScale } from "remotion";
import { Overlay, OverlayType } from "../../types";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";
import { getEffectiveCropDimensions } from "../../utils/crop-utils";

const HANDLE_SIZE = 12;

/**
 * ResizeHandle component renders a draggable handle for resizing overlays in the editor.
 * It appears as a small white square with a blue border at the corners of a selected overlay.
 *
 * @component
 * @param {Object} props
 * @param {'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'} props.type - Position of the handle
 * @param {Function} props.setOverlay - Callback to update the overlay's properties
 * @param {Overlay} props.overlay - The overlay object being resized
 *
 * Features:
 * - Scales appropriately with zoom level using Remotion's useCurrentScale
 * - Maintains correct z-index based on overlay row position
 * - Supports dragging to resize from any corner
 * - Prevents resizing below 1x1 pixels
 * - Updates overlay dimensions and position in real-time while dragging
 * - Not displayed for sound-type overlays
 */
export const ResizeHandle: React.FC<{
  type: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  setOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  overlay: Overlay;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({ type, setOverlay, overlay, alignmentGuides, allOverlays }) => {
  const scale = useCurrentScale();
  const size = Math.round(HANDLE_SIZE / scale);
  const borderSize = 1 / scale;

  const sizeStyle: React.CSSProperties = useMemo(() => {
    const zIndex = 999999;  
    return {
      position: "absolute",
      height: Number.isFinite(size) ? size : HANDLE_SIZE,
      width: Number.isFinite(size) ? size : HANDLE_SIZE,
      backgroundColor: "white",
      border: `${borderSize}px solid #3B8BF2`,
      zIndex,
      pointerEvents: "all",
    };
  }, [borderSize, size]);

  const margin = -size / 2 - borderSize;

  const style: React.CSSProperties = useMemo(() => {
    if (type === "top-left") {
      return {
        ...sizeStyle,
        marginLeft: margin,
        marginTop: margin,
        cursor: "nwse-resize",
      };
    }

    if (type === "top-right") {
      return {
        ...sizeStyle,
        marginTop: margin,
        marginRight: margin,
        right: 0,
        cursor: "nesw-resize",
      };
    }

    if (type === "bottom-left") {
      return {
        ...sizeStyle,
        marginBottom: margin,
        marginLeft: margin,
        bottom: 0,
        cursor: "nesw-resize",
      };
    }

    if (type === "bottom-right") {
      return {
        ...sizeStyle,
        marginBottom: margin,
        marginRight: margin,
        right: 0,
        bottom: 0,
        cursor: "nwse-resize",
      };
    }

    throw new Error("Unknown type: " + JSON.stringify(type));
  }, [margin, sizeStyle, type]);

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // Prevent text selection during drag
      if (e.button !== 0) {
        return;
      }

      const initialX = e.clientX;
      const initialY = e.clientY;

      // Get effective dimensions for positioning and calculations
      const effectiveDimensions = getEffectiveCropDimensions(overlay);

      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        const rawOffsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const rawOffsetY = (pointerMoveEvent.clientY - initialY) / scale;

        // Transform the screen-space offset to the local coordinate system
        // accounting for the overlay's rotation
        const rotation = overlay.rotation || 0;
        const radians = -rotation * (Math.PI / 180); // Negative to go from screen to local
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        const offsetX = rawOffsetX * cos - rawOffsetY * sin;
        const offsetY = rawOffsetX * sin + rawOffsetY * cos;

        const isLeft = type === "top-left" || type === "bottom-left";
        const isTop = type === "top-left" || type === "top-right";

        // Calculate the intended resize on effective dimensions first
        const intendedNewEffectiveWidth = effectiveDimensions.width + (isLeft ? -offsetX : offsetX);
        const intendedNewEffectiveHeight = effectiveDimensions.height + (isTop ? -offsetY : offsetY);
        const intendedNewEffectiveLeft = effectiveDimensions.left + (isLeft ? offsetX : 0);
        const intendedNewEffectiveTop = effectiveDimensions.top + (isTop ? offsetY : 0);

        // Calculate scale factors
        const scaleX = intendedNewEffectiveWidth / effectiveDimensions.width;
        const scaleY = intendedNewEffectiveHeight / effectiveDimensions.height;

        // Apply scale to original dimensions
        const intendedNewWidth = overlay.width * scaleX;
        const intendedNewHeight = overlay.height * scaleY;
        
        // Calculate new position to maintain the relationship between
        // effective and original position
        const effectiveOffsetX = effectiveDimensions.left - overlay.left;
        const effectiveOffsetY = effectiveDimensions.top - overlay.top;
        
        const intendedNewLeft = intendedNewEffectiveLeft - (effectiveOffsetX * scaleX);
        const intendedNewTop = intendedNewEffectiveTop - (effectiveOffsetY * scaleY);

        // Create a temporary overlay with the intended size/position for alignment calculations
        const tempOverlay = {
          ...overlay,
          width: Math.max(1, intendedNewWidth),
          height: Math.max(1, intendedNewHeight),
          left: intendedNewLeft,
          top: intendedNewTop,
          isDragging: true,
        };

        // Update alignment guides based on current resize position
        alignmentGuides.updateGuides(tempOverlay, allOverlays);

        setOverlay(overlay.id, (i) => {
          // For image and video overlays, maintain aspect ratio
          const shouldMaintainAspectRatio = overlay.type === OverlayType.IMAGE || overlay.type === OverlayType.VIDEO;
          
          let finalWidth, finalHeight, finalLeft, finalTop;
          
          if (shouldMaintainAspectRatio) {
            // Use the scale factors we calculated earlier
            finalWidth = Math.max(1, Math.round(overlay.width * scaleX));
            finalHeight = Math.max(1, Math.round(overlay.height * scaleY));
            
            // Use uniform scaling (pick the smaller scale to maintain aspect ratio)
            const uniformScale = Math.min(scaleX, scaleY);
            finalWidth = Math.max(1, Math.round(overlay.width * uniformScale));
            finalHeight = Math.max(1, Math.round(overlay.height * uniformScale));
            
            // Recalculate position based on uniform scale
            const newEffectiveWidth = effectiveDimensions.width * uniformScale;
            const newEffectiveHeight = effectiveDimensions.height * uniformScale;
            
            // Adjust position based on which corner is being dragged
            if (type === "top-left") {
              finalLeft = Math.round(effectiveDimensions.left + effectiveDimensions.width - newEffectiveWidth - (effectiveOffsetX * uniformScale));
              finalTop = Math.round(effectiveDimensions.top + effectiveDimensions.height - newEffectiveHeight - (effectiveOffsetY * uniformScale));
            } else if (type === "top-right") {
              finalLeft = Math.round(effectiveDimensions.left - (effectiveOffsetX * uniformScale));
              finalTop = Math.round(effectiveDimensions.top + effectiveDimensions.height - newEffectiveHeight - (effectiveOffsetY * uniformScale));
            } else if (type === "bottom-left") {
              finalLeft = Math.round(effectiveDimensions.left + effectiveDimensions.width - newEffectiveWidth - (effectiveOffsetX * uniformScale));
              finalTop = Math.round(effectiveDimensions.top - (effectiveOffsetY * uniformScale));
            } else { // bottom-right
              finalLeft = Math.round(effectiveDimensions.left - (effectiveOffsetX * uniformScale));
              finalTop = Math.round(effectiveDimensions.top - (effectiveOffsetY * uniformScale));
            }
          } else {
            // For other overlay types, allow free resizing
            finalWidth = Math.max(1, Math.round(intendedNewWidth));
            finalHeight = Math.max(1, Math.round(intendedNewHeight));
            finalLeft = Math.round(intendedNewLeft);
            finalTop = Math.round(intendedNewTop);
          }

          return {
            ...i,
            width: finalWidth,
            height: finalHeight,
            left: finalLeft,
            top: finalTop,
            isDragging: true,
          };
        });
      };

      const onPointerUp = () => {
        // Clear alignment guides when resizing ends
        alignmentGuides.clearGuides();
        
        setOverlay(overlay.id, (i) => {
          return {
            ...i,
            isDragging: false,
          };
        });
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, {
        once: true,
      });
    },
    [overlay, scale, setOverlay, type, alignmentGuides, allOverlays]
  );

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  return <div onPointerDown={onPointerDown} style={style} />;
};
