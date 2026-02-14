import React from "react";
import type { FontInfo } from "@remotion/google-fonts";
import { TextLayerContent } from "./components/text-layer-content";
import { OverlayType, type ShapeOverlay } from "../../types";
import { CaptionLayerContent } from "./components/caption-layer-content";
import { VideoLayerContent } from "./components/video-layer-content";
import { ImageLayerContent } from "./components/image-layer-content";
import { SoundLayerContent } from "./components/sound-layer-content";
import { StickerLayerContent } from "./components/sticker-layer-content";
import { Overlay } from "../../types";

/**
 * Props for LayerContent component
 * @interface LayerContentProps
 * @property {Overlay} overlay - The overlay object to render
 * @property {string | undefined} baseUrl - Optional base URL for media assets
 * @property {Record<string, FontInfo>} fontInfos - Font infos for rendering (populated during SSR/Lambda rendering)
 */
export interface LayerContentProps {
  overlay: Overlay;
  baseUrl?: string;
  fontInfos?: Record<string, FontInfo>;
}

/**
 * LayerContent Component
 *
 * @component
 * @description
 * A component that renders different types of content layers in the video editor.
 * It acts as a switch component that determines which specific layer component
 * to render based on the overlay type.
 *
 * Supported overlay types:
 * - VIDEO: Renders video content with VideoLayerContent
 * - TEXT: Renders text overlays with TextLayerContent
 * - SHAPE: Renders colored shapes
 * - IMAGE: Renders images with ImageLayerContent
 * - CAPTION: Renders captions with CaptionLayerContent
 * - SOUND: Renders audio elements using Remotion's Audio component
 *
 * Each layer type maintains consistent sizing through commonStyle,
 * with specific customizations applied as needed.
 *
 * @example
 * ```tsx
 * <LayerContent overlay={{
 *   type: OverlayType.TEXT,
 *   content: "Hello World",
 *   // ... other overlay properties
 * }} />
 * ```
 */
export const LayerContent: React.FC<LayerContentProps> = ({
  overlay,
  baseUrl,
  fontInfos,
}) => {
  /**
   * Common styling applied to all layer types
   * Ensures consistent dimensions across different content types
   */
  const commonStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
  };

  switch (overlay.type) {
    case OverlayType.VIDEO:
      return (
        <div style={{ ...commonStyle }}>
          <VideoLayerContent key={`video-${overlay.id}`} overlay={overlay} {...(baseUrl && { baseUrl })} />
        </div>
      );

    case OverlayType.TEXT:
      return (
        <div style={{ ...commonStyle }}>
          <TextLayerContent overlay={overlay} {...(fontInfos && { fontInfos })} />
        </div>
      );

    case OverlayType.IMAGE:
      return (
        <div style={{ ...commonStyle }}>
          <ImageLayerContent overlay={overlay} {...(baseUrl && { baseUrl })} />
        </div>
      );

    case OverlayType.CAPTION:
      return (
        <div
          style={{
            ...commonStyle,
            position: "relative",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <CaptionLayerContent overlay={overlay} {...(fontInfos && { fontInfos })} />
        </div>
      );

    case OverlayType.SHAPE:
      return (
        <div
          style={{
            ...commonStyle,
            backgroundColor: (overlay as ShapeOverlay).styles.fill || 'transparent',
            borderRadius: (overlay as ShapeOverlay).styles.borderRadius || '0px',
          }}
        />
      );

    case OverlayType.STICKER:
      return (
        <div style={{ ...commonStyle }}>
          <StickerLayerContent overlay={overlay} isSelected={false} />
        </div>
      );

    case OverlayType.SOUND:
      return <SoundLayerContent overlay={overlay} {...(baseUrl && { baseUrl })} />;

    default:
      return null;
  }
}; 