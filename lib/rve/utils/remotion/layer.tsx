import React, { useMemo } from "react";
import { Sequence } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";

import { Overlay } from "../../types";
import { LayerContent } from "./layer-content";

/**
 * Props for the Layer component
 * @interface LayerProps
 * @property {Overlay} overlay - The overlay object containing position, dimensions, and content information
 * @property {string | undefined} baseUrl - The base URL for the video
 * @property {Record<string, FontInfo>} fontInfos - Font infos for rendering (populated during SSR/Lambda rendering)
 */
export const Layer: React.FC<{
  overlay: Overlay;
  baseUrl?: string;
  fontInfos?: Record<string, FontInfo>;
}> = ({ overlay,  baseUrl, fontInfos }) => {
  /**
   * Memoized style calculations for the layer
   * Handles positioning, dimensions, rotation, and z-index based on:
   * - Overlay position (left, top)
   * - Dimensions (width, height)
   * - Rotation
   * - Row position for z-index stacking
   * - Selection state for pointer events
   *
   * @returns {React.CSSProperties} Computed styles for the layer
   */
  const style: React.CSSProperties = useMemo(() => {
    // Higher row numbers should be at the bottom
    // e.g. row 4 = z-index 60, row 0 = z-index 100
    const zIndex = 100 - (overlay.row || 0) * 10;

    return {
      position: "absolute",
      left: overlay.left,
      top: overlay.top,
      width: overlay.width,
      height: overlay.height,
      transform: `rotate(${overlay.rotation || 0}deg)`,
      transformOrigin: "center center",
      zIndex,
      // Always disable pointer events on the actual content layer
      // Interaction happens through SelectionOutline component instead
      pointerEvents: "none",
    };
  }, [
    overlay.height,
    overlay.left,
    overlay.top,
    overlay.width,
    overlay.rotation,
    overlay.row,
  ]);

  /**
   * Special handling for sound overlays
   * Sound overlays don't need positioning or visual representation,
   * they just need to be sequenced correctly
   */
  if (overlay.type === "sound") {
    return (
      <Sequence
        key={overlay.id}
        from={overlay.from}
        durationInFrames={overlay.durationInFrames}
      >
        <LayerContent overlay={overlay} {...(baseUrl && { baseUrl })} {...(fontInfos && { fontInfos })} />
      </Sequence>
    );
  }

  /**
   * Standard layer rendering for visual elements
   * Wraps the content in a Sequence for timing control and
   * a positioned div for layout management
   *
   * premountFor is used to preload assets before they appear, preventing
   * flickering at split points where a lower track video could briefly show through.
   * Note: premountFor requires removing layout="none" as the Sequence needs
   * a container to apply opacity: 0 and pointer-events: none during premount.
   * @see https://www.remotion.dev/docs/player/premounting
   */
  return (
    <Sequence
      key={overlay.id}
      from={overlay.from}
      durationInFrames={overlay.durationInFrames}
      premountFor={30}
    >
      <div style={style}>
        <LayerContent overlay={overlay} {...(baseUrl && { baseUrl })} {...(fontInfos && { fontInfos })} />
      </div>
    </Sequence>
  );
}; 