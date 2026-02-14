import { useCallback } from "react";
import { Overlay, OverlayType, ClipOverlay, ImageOverlay } from "../types";

/**
 * Custom hook for handling crop updates on VIDEO and IMAGE overlays.
 * Provides a consistent interface for updating crop properties across components.
 * 
 * @param overlay - The overlay to apply crop changes to
 * @param changeOverlay - Function to update the overlay in the editor state
 * @returns A callback function to handle crop property updates
 */
export const useCropHandling = (
  overlay: Overlay,
  changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void
) => {
  const handleCropChange = useCallback(
    (updates: {
      cropEnabled?: boolean;
      cropX?: number;
      cropY?: number;
      cropWidth?: number;
      cropHeight?: number;
      clipPath?: string;
    }) => {
      if (overlay.type === OverlayType.VIDEO) {
        changeOverlay(overlay.id, (o) => {
          const videoOverlay = o as ClipOverlay;
          return {
            ...videoOverlay,
            styles: {
              ...videoOverlay.styles,
              ...updates,
            },
          };
        });
      } else if (overlay.type === OverlayType.IMAGE) {
        changeOverlay(overlay.id, (o) => {
          const imageOverlay = o as ImageOverlay;
          return {
            ...imageOverlay,
            styles: {
              ...imageOverlay.styles,
              ...updates,
            },
          };
        });
      }
    },
    [overlay, changeOverlay]
  );

  return handleCropChange;
};

