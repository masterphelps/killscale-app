import { useState, useCallback } from "react";
import { Overlay } from "../types";

export interface GuidePosition {
  id: string;
  x?: number;
  y?: number;
  type: "canvas-center-x" | "canvas-center-y" | "canvas-edge-left" | "canvas-edge-right" | "canvas-edge-top" | "canvas-edge-bottom" | "element-left" | "element-right" | "element-top" | "element-bottom" | "element-center-x" | "element-center-y";
  elementId?: number;
}

export interface AlignmentGuideState {
  isActive: boolean;
  guides: GuidePosition[];
  snapThreshold: number;
}

interface UseAlignmentGuidesOptions {
  canvasWidth: number;
  canvasHeight: number;
  snapThreshold?: number;
}

export const useAlignmentGuides = ({
  canvasWidth,
  canvasHeight,
  snapThreshold = 5,
}: UseAlignmentGuidesOptions) => {
  const [guideState, setGuideState] = useState<AlignmentGuideState>({
    isActive: false,
    guides: [],
    snapThreshold,
  });

  /**
   * Calculate potential guide positions based on all overlays and canvas bounds
   */
  const calculateGuidePositions = useCallback(
    (
      draggedOverlay: Overlay,
      allOverlays: Overlay[]
    ): GuidePosition[] => {
      const guides: GuidePosition[] = [];

      // Canvas center guides
      guides.push({
        id: "canvas-center-x",
        x: canvasWidth / 2,
        type: "canvas-center-x",
      });
      guides.push({
        id: "canvas-center-y",
        y: canvasHeight / 2,
        type: "canvas-center-y",
      });

      // Canvas edge guides
      guides.push({
        id: "canvas-edge-left",
        x: 0,
        type: "canvas-edge-left",
      });
      guides.push({
        id: "canvas-edge-right",
        x: canvasWidth,
        type: "canvas-edge-right",
      });
      guides.push({
        id: "canvas-edge-top",
        y: 0,
        type: "canvas-edge-top",
      });
      guides.push({
        id: "canvas-edge-bottom",
        y: canvasHeight,
        type: "canvas-edge-bottom",
      });

      // Other overlays guides
      allOverlays
        .filter((overlay) => overlay.id !== draggedOverlay.id)
        .forEach((overlay) => {
          const overlayLeft = overlay.left;
          const overlayRight = overlay.left + overlay.width;
          const overlayTop = overlay.top;
          const overlayBottom = overlay.top + overlay.height;
          const overlayCenterX = overlay.left + overlay.width / 2;
          const overlayCenterY = overlay.top + overlay.height / 2;

          // Vertical guides (x positions)
          guides.push({
            id: `element-${overlay.id}-left`,
            x: overlayLeft,
            type: "element-left",
            elementId: overlay.id,
          });
          guides.push({
            id: `element-${overlay.id}-right`,
            x: overlayRight,
            type: "element-right",
            elementId: overlay.id,
          });
          guides.push({
            id: `element-${overlay.id}-center-x`,
            x: overlayCenterX,
            type: "element-center-x",
            elementId: overlay.id,
          });

          // Horizontal guides (y positions)
          guides.push({
            id: `element-${overlay.id}-top`,
            y: overlayTop,
            type: "element-top",
            elementId: overlay.id,
          });
          guides.push({
            id: `element-${overlay.id}-bottom`,
            y: overlayBottom,
            type: "element-bottom",
            elementId: overlay.id,
          });
          guides.push({
            id: `element-${overlay.id}-center-y`,
            y: overlayCenterY,
            type: "element-center-y",
            elementId: overlay.id,
          });
        });

      return guides;
    },
    [canvasWidth, canvasHeight]
  );

  /**
   * Find active guides that the dragged overlay is close to
   */
  const findActiveGuides = useCallback(
    (
      draggedOverlay: Overlay,
      allOverlays: Overlay[]
    ): GuidePosition[] => {
      const allGuides = calculateGuidePositions(draggedOverlay, allOverlays);
      const candidateGuides: Array<GuidePosition & { distance: number; alignmentType: string }> = [];

      const draggedLeft = draggedOverlay.left;
      const draggedRight = draggedOverlay.left + draggedOverlay.width;
      const draggedTop = draggedOverlay.top;
      const draggedBottom = draggedOverlay.top + draggedOverlay.height;
      const draggedCenterX = draggedOverlay.left + draggedOverlay.width / 2;
      const draggedCenterY = draggedOverlay.top + draggedOverlay.height / 2;

      // Use a larger snap threshold for canvas edges to make them more "magnetic"
      const edgeSnapThreshold = snapThreshold * 2;

      allGuides.forEach((guide) => {
        const isCanvasEdge = guide.type.startsWith("canvas-edge");
        const currentSnapThreshold = isCanvasEdge ? edgeSnapThreshold : snapThreshold;

        if (guide.x !== undefined) {
          // Vertical guides - check if any part of dragged element is close
          const distanceToLeft = Math.abs(guide.x - draggedLeft);
          const distanceToRight = Math.abs(guide.x - draggedRight);
          const distanceToCenterX = Math.abs(guide.x - draggedCenterX);

          // Determine which alignment this guide represents
          let alignmentType = '';
          let distance = Infinity;

          if (distanceToLeft <= currentSnapThreshold) {
            alignmentType = 'left';
            distance = distanceToLeft;
          }
          if (distanceToRight <= currentSnapThreshold && distanceToRight < distance) {
            alignmentType = 'right';
            distance = distanceToRight;
          }
          if (distanceToCenterX <= currentSnapThreshold && distanceToCenterX < distance) {
            alignmentType = 'center-x';
            distance = distanceToCenterX;
          }

          if (distance <= currentSnapThreshold) {
            candidateGuides.push({
              ...guide,
              distance,
              alignmentType,
            });
          }
        }

        if (guide.y !== undefined) {
          // Horizontal guides - check if any part of dragged element is close
          const distanceToTop = Math.abs(guide.y - draggedTop);
          const distanceToBottom = Math.abs(guide.y - draggedBottom);
          const distanceToCenterY = Math.abs(guide.y - draggedCenterY);

          // Determine which alignment this guide represents
          let alignmentType = '';
          let distance = Infinity;

          if (distanceToTop <= currentSnapThreshold) {
            alignmentType = 'top';
            distance = distanceToTop;
          }
          if (distanceToBottom <= currentSnapThreshold && distanceToBottom < distance) {
            alignmentType = 'bottom';
            distance = distanceToBottom;
          }
          if (distanceToCenterY <= currentSnapThreshold && distanceToCenterY < distance) {
            alignmentType = 'center-y';
            distance = distanceToCenterY;
          }

          if (distance <= currentSnapThreshold) {
            candidateGuides.push({
              ...guide,
              distance,
              alignmentType,
            });
          }
        }
      });

      // Group guides by alignment type and position, then select the best one for each
      const guidesByAlignmentAndPosition = new Map<string, typeof candidateGuides>();
      
      candidateGuides.forEach((guide) => {
        const position = guide.x !== undefined ? `x-${guide.x}` : `y-${guide.y}`;
        const key = `${guide.alignmentType}-${position}`;
        
        if (!guidesByAlignmentAndPosition.has(key)) {
          guidesByAlignmentAndPosition.set(key, []);
        }
        guidesByAlignmentAndPosition.get(key)!.push(guide);
      });

      // For each alignment type and position, select the best guide (prioritize canvas > element)
      const selectedGuides: GuidePosition[] = [];
      
      guidesByAlignmentAndPosition.forEach((guides) => {
        // Sort by priority: canvas-center > canvas-edge > element, then by distance
        guides.sort((a, b) => {
          const aPriority = a.type.startsWith('canvas-center') ? 3 : 
                          a.type.startsWith('canvas-edge') ? 2 : 1;
          const bPriority = b.type.startsWith('canvas-center') ? 3 : 
                          b.type.startsWith('canvas-edge') ? 2 : 1;
          
          if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
          }
          
          return a.distance - b.distance; // Closer distance first
        });

        // Take the best guide for this alignment type and position
        const bestGuide = guides[0];
        selectedGuides.push({
          id: bestGuide.id,
          x: bestGuide.x,
          y: bestGuide.y,
          type: bestGuide.type,
          elementId: bestGuide.elementId,
        });
      });

      return selectedGuides;
    },
    [calculateGuidePositions, snapThreshold]
  );

  /**
   * Calculate snap position for a dragged overlay
   */
  const calculateSnapPosition = useCallback(
    (
      draggedOverlay: Overlay,
      allOverlays: Overlay[]
    ): { left: number; top: number } => {
      const activeGuides = findActiveGuides(draggedOverlay, allOverlays);
      
      let snappedLeft = draggedOverlay.left;
      let snappedTop = draggedOverlay.top;

      // Enhanced snap thresholds
      const edgeSnapThreshold = snapThreshold * 2;

      // Find the closest X snap
      let closestXDistance = edgeSnapThreshold + 1;
      let targetX: number | null = null;
      
      activeGuides.forEach((guide) => {
        if (guide.x !== undefined) {
          const draggedLeft = draggedOverlay.left;
          const draggedRight = draggedOverlay.left + draggedOverlay.width;
          const draggedCenterX = draggedOverlay.left + draggedOverlay.width / 2;
          
          const isCanvasEdge = guide.type.startsWith("canvas-edge");
          const currentSnapThreshold = isCanvasEdge ? edgeSnapThreshold : snapThreshold;

          // Check snap to left edge
          const distanceToLeft = Math.abs(guide.x - draggedLeft);
          if (distanceToLeft < closestXDistance && distanceToLeft <= currentSnapThreshold) {
            closestXDistance = distanceToLeft;
            targetX = guide.x;
          }

          // Check snap to right edge
          const distanceToRight = Math.abs(guide.x - draggedRight);
          if (distanceToRight < closestXDistance && distanceToRight <= currentSnapThreshold) {
            closestXDistance = distanceToRight;
            targetX = guide.x - draggedOverlay.width;
          }

          // Check snap to center
          const distanceToCenterX = Math.abs(guide.x - draggedCenterX);
          if (distanceToCenterX < closestXDistance && distanceToCenterX <= currentSnapThreshold) {
            closestXDistance = distanceToCenterX;
            targetX = guide.x - draggedOverlay.width / 2;
          }
        }
      });

      if (targetX !== null) {
        snappedLeft = targetX;
      }

      // Find the closest Y snap
      let closestYDistance = edgeSnapThreshold + 1;
      let targetY: number | null = null;
      
      activeGuides.forEach((guide) => {
        if (guide.y !== undefined) {
          const draggedTop = draggedOverlay.top;
          const draggedBottom = draggedOverlay.top + draggedOverlay.height;
          const draggedCenterY = draggedOverlay.top + draggedOverlay.height / 2;
          
          const isCanvasEdge = guide.type.startsWith("canvas-edge");
          const currentSnapThreshold = isCanvasEdge ? edgeSnapThreshold : snapThreshold;

          // Check snap to top edge
          const distanceToTop = Math.abs(guide.y - draggedTop);
          if (distanceToTop < closestYDistance && distanceToTop <= currentSnapThreshold) {
            closestYDistance = distanceToTop;
            targetY = guide.y;
          }

          // Check snap to bottom edge
          const distanceToBottom = Math.abs(guide.y - draggedBottom);
          if (distanceToBottom < closestYDistance && distanceToBottom <= currentSnapThreshold) {
            closestYDistance = distanceToBottom;
            targetY = guide.y - draggedOverlay.height;
          }

          // Check snap to center
          const distanceToCenterY = Math.abs(guide.y - draggedCenterY);
          if (distanceToCenterY < closestYDistance && distanceToCenterY <= currentSnapThreshold) {
            closestYDistance = distanceToCenterY;
            targetY = guide.y - draggedOverlay.height / 2;
          }
        }
      });

      if (targetY !== null) {
        snappedTop = targetY;
      }

      return { left: snappedLeft, top: snappedTop };
    },
    [findActiveGuides, snapThreshold]
  );

  /**
   * Update guides during drag
   */
  const updateGuides = useCallback(
    (draggedOverlay: Overlay, allOverlays: Overlay[]) => {
      const activeGuides = findActiveGuides(draggedOverlay, allOverlays);
      
      setGuideState({
        isActive: true,
        guides: activeGuides,
        snapThreshold,
      });
    },
    [findActiveGuides, snapThreshold]
  );

  /**
   * Clear guides when dragging stops
   */
  const clearGuides = useCallback(() => {
    setGuideState({
      isActive: false,
      guides: [],
      snapThreshold,
    });
  }, [snapThreshold]);

  return {
    guideState,
    updateGuides,
    clearGuides,
    calculateSnapPosition,
  };
}; 