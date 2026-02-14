import React, { useCallback } from "react";
import { AbsoluteFill } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";

import { Overlay } from "../../types";
import { SortedOutlines } from "../../components/selection/sorted-outlines";
import { Layer } from "./layer";
import { AlignmentGuides } from "../../components/selection/alignment-guides";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";


/**
 * Props for the Main component
 */
export type MainProps = {
  /** Array of overlay objects to be rendered */
  readonly overlays: Overlay[];
  /** Function to set the currently selected overlay ID */
  readonly setSelectedOverlayId: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  /** Currently selected overlay ID, or null if none selected */
  readonly selectedOverlayId: number | null;
  /**
   * Function to update an overlay
   * @param overlayId - The ID of the overlay to update
   * @param updater - Function that receives the current overlay and returns an updated version
   */
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  /** Duration in frames of the composition */
  readonly durationInFrames: number;
  /** Frames per second of the composition */
  readonly fps: number;
  /** Width of the composition */
  readonly width: number;
  /** Height of the composition */
  readonly height: number;
  /** Base URL for media assets (optional) */
  readonly baseUrl?: string;
  /** Whether to show alignment guides */
  readonly showAlignmentGuides?: boolean;
  /** Background color for the canvas */
  readonly backgroundColor?: string;
  /** Font infos for rendering (populated during SSR/Lambda rendering) */
  readonly fontInfos?: Record<string, FontInfo>;
};

const outer: React.CSSProperties = {
  backgroundColor: "white",
};
const layerContainer: React.CSSProperties = {
  overflow: "hidden",
  maxWidth: "3000px",
};

/**
 * Main component that renders a canvas-like area with overlays and their outlines.
 * Handles selection of overlays and provides a container for editing them.
 *
 * @param props - Component props of type MainProps
 * @returns React component that displays overlays and their interactive outlines
 */
export const Main: React.FC<MainProps> = ({
  overlays,
  setSelectedOverlayId,
  selectedOverlayId,
  changeOverlay,
  width,
  height,
  baseUrl,
  showAlignmentGuides = true,
  backgroundColor = "white",
  fontInfos,
}) => {
  // Initialize alignment guides hook with responsive snap threshold
  // Calculate snap threshold as a percentage of canvas size for consistent sensitivity
  const snapThreshold = Math.min(width, height) * 0.01; // 1% of the smaller dimension
  const alignmentGuides = useAlignmentGuides({
    canvasWidth: width,
    canvasHeight: height,
    snapThreshold,
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }

      setSelectedOverlayId(null);
    },
    [setSelectedOverlayId]
  );

  return (
    <AbsoluteFill
      style={{
        ...outer,
        backgroundColor,
      }}
      onPointerDown={onPointerDown}
    >
      <AbsoluteFill style={layerContainer}>
        {overlays.map((overlay) => {
          return (
            <Layer
              key={overlay.id}
              overlay={overlay}
              {...(baseUrl && { baseUrl })}
              {...(fontInfos && { fontInfos })}
            />
          );
        })}
      </AbsoluteFill>
      <SortedOutlines
        selectedOverlayId={selectedOverlayId}
        overlays={overlays}
        changeOverlay={changeOverlay}
        alignmentGuides={alignmentGuides}
      />
      
      {/* Render alignment guides overlay */}
      {showAlignmentGuides && (
        <AlignmentGuides
          guideState={alignmentGuides.guideState}
          canvasWidth={width}
          canvasHeight={height}
        />
      )}
    </AbsoluteFill>
  );
};