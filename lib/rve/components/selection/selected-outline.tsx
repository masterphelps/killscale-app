import React, { useCallback, useMemo } from "react";
import { useCurrentScale } from "remotion";
import { Overlay, OverlayType, ClipOverlay, ImageOverlay } from "../../types";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";
import { getEffectiveCropDimensions } from "../../utils/crop-utils";
import { useOverlaySelection } from "../../hooks/use-overlay-section";
import { useCropHandling } from "../../hooks/use-crop-handling";

/**
 * SelectionOutline is a component that renders a draggable, resizable outline around selected overlays.
 * It provides visual feedback and interaction handles for manipulating overlay elements.
 *
 * @component
 * @param {Object} props
 * @param {Overlay} props.overlay - The overlay object containing position, size, and other properties
 * @param {Function} props.changeOverlay - Callback to update overlay properties
 * @param {Function} props.setSelectedOverlayId - Function to update the currently selected overlay
 * @param {number|null} props.selectedOverlayId - ID of the currently selected overlay
 * @param {boolean} props.isDragging - Whether the overlay is currently being dragged
 */
export const SelectionOutline: React.FC<{
  overlay: Overlay;
  changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  selectedOverlayId: number | null;
  isDragging: boolean;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({
  overlay,
  changeOverlay,
  selectedOverlayId,
  isDragging,
  alignmentGuides,
  allOverlays,
}) => {
  const scale = useCurrentScale();
  const scaledBorder = Math.ceil(1 / scale);

  const [hovered, setHovered] = React.useState(false);

  const onMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const isSelected = overlay.id === selectedOverlayId;

  // Use shared crop handling hook
  const handleCropChange = useCropHandling(overlay, changeOverlay);

  // Handle double-click to enable cropping
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Only enable crop for VIDEO and IMAGE types
      if (overlay.type === OverlayType.VIDEO || overlay.type === OverlayType.IMAGE) {
        const currentOverlay = overlay as ClipOverlay | ImageOverlay;
        
        // If crop is not already enabled, enable it with default values
        if (!currentOverlay.styles?.cropEnabled) {
          handleCropChange({
            cropEnabled: true,
            cropX: currentOverlay.styles?.cropX ?? 0,
            cropY: currentOverlay.styles?.cropY ?? 0,
            cropWidth: currentOverlay.styles?.cropWidth ?? 100,
            cropHeight: currentOverlay.styles?.cropHeight ?? 100,
          });
        }
      }
    },
    [overlay, handleCropChange]
  );

  const style: React.CSSProperties = useMemo(() => {
    // Get effective dimensions based on crop settings when crop is enabled
    const effectiveDimensions = getEffectiveCropDimensions(overlay);
    
    // Selection outlines should match layer stacking
    // But start at 1000 to be above content
    // e.g. row 4 = z-index 960, row 0 = z-index 1000
    const baseZIndex = 1000 - (overlay.row || 0) * 10;

    // Selected items get a small boost to appear above their layer
    // but not enough to override higher layers (max +5 to stay within row spacing of 10)
    const selectionBoost = isSelected ? 5 : 0;
    const zIndex = baseZIndex + selectionBoost;

    return {
      width: Number.isFinite(effectiveDimensions.width) ? effectiveDimensions.width : 0,
      height: Number.isFinite(effectiveDimensions.height) ? effectiveDimensions.height : 0,
      left: effectiveDimensions.left,
      top: effectiveDimensions.top,
      position: "absolute",
      outline:
        (hovered && !isDragging) || isSelected
          ? `${scaledBorder}px solid var(--primary-500)`
          : undefined,
      transform: `rotate(${overlay.rotation || 0}deg)`,
      transformOrigin: "center center",
      userSelect: "none",
      touchAction: "none",
      zIndex,
      pointerEvents: "all",
      cursor: "pointer",
    };
  }, [overlay, hovered, isDragging, isSelected, scaledBorder]);

  const startDragging = useCallback(
    (e: PointerEvent | React.MouseEvent) => {
      const initialX = e.clientX;
      const initialY = e.clientY;

      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const offsetY = (pointerMoveEvent.clientY - initialY) / scale;
        
        // Calculate the intended position without snapping
        const intendedLeft = overlay.left + offsetX;
        const intendedTop = overlay.top + offsetY;
        
        // Create a temporary overlay with the intended position for alignment calculations
        const tempOverlay = {
          ...overlay,
          left: intendedLeft,
          top: intendedTop,
          isDragging: true,
        };
        
        // Update alignment guides based on current position
        alignmentGuides.updateGuides(tempOverlay, allOverlays);
        
        // Calculate snap position
        const snapPosition = alignmentGuides.calculateSnapPosition(tempOverlay, allOverlays);
        
        changeOverlay(overlay.id, (o) => {
          return {
            ...o,
            left: Math.round(snapPosition.left),
            top: Math.round(snapPosition.top),
            isDragging: true,
          };
        });
      };

      const onPointerUp = () => {
        // Clear alignment guides when dragging ends
        alignmentGuides.clearGuides();
        
        changeOverlay(overlay.id, (o) => {
          return {
            ...o,
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
    [overlay, scale, changeOverlay, alignmentGuides, allOverlays]
  );

  const { handleOverlaySelect } = useOverlaySelection();

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // Prevent text selection during drag
      if (e.button !== 0) {
        return;
      }

      handleOverlaySelect(overlay);
      startDragging(e);
    },
    [overlay, handleOverlaySelect, startDragging]
  );

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onPointerEnter={onMouseEnter}
        onPointerLeave={onMouseLeave}
        onDoubleClick={handleDoubleClick}
        style={style}
      >
        {/* Handles are now rendered separately in SelectionHandles component */}
      </div>
    </>
  );
};
