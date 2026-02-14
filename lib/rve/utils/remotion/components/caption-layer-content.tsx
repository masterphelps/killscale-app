import React from "react";
import { useCurrentFrame } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";
import { Caption, CaptionOverlay } from "../../../types";
import { defaultCaptionStyles } from "../../../components/overlay/captions/caption-settings";
import { useLoadFontFromTextItem } from "../../text/load-font-from-text-item";

/**
 * Props for the CaptionLayerContent component
 * @interface CaptionLayerContentProps
 * @property {CaptionOverlay} overlay - The caption overlay object containing timing and style information
 * @property {Record<string, FontInfo>} fontInfos - Font infos for rendering (populated during SSR/Lambda rendering)
 */
interface CaptionLayerContentProps {
  overlay: CaptionOverlay;
  fontInfos?: Record<string, FontInfo>;
}

/**
 * CaptionLayerContent Component
 *
 * @component
 * @description
 * Renders animated captions in the video editor with word-by-word highlighting.
 * Features include:
 * - Word-by-word timing and animation
 * - Customizable text styles and animations
 * - Smooth transitions between words
 * - Dynamic highlighting based on current frame
 *
 * The component calculates timing for each word and applies appropriate
 * styling and animations based on the current playback position.
 *
 * @example
 * ```tsx
 * <CaptionLayerContent
 *   overlay={{
 *     captions: [...],
 *     styles: {...},
 *     // other overlay properties
 *   }}
 * />
 * ```
 */
export const CaptionLayerContent: React.FC<CaptionLayerContentProps> = ({
  overlay,
  fontInfos,
}) => {
  const frame = useCurrentFrame();
  const frameMs = (frame / 30) * 1000;
  const styles = overlay.styles || defaultCaptionStyles;
  
  // Use font from overlay styles or default to Inter
  const fontFamily = styles.fontFamily || "Inter";
  const fontWeight = String(styles.fontWeight || '400');
  const fontStyle = 'normal' as 'normal' | 'italic'; // Captions don't typically use italic
  
  // Use the proper font loading hook
  // During rendering, fontInfos will be provided and fontInfo will be extracted from it
  // In editor, fontInfos will be undefined and font will be fetched from API
  const fontInfo = fontInfos?.[fontFamily] || null;
  useLoadFontFromTextItem({
    fontFamily: fontFamily,
    fontWeight: fontWeight,
    fontStyle: fontStyle,
    fontInfosDuringRendering: fontInfo,
  });

  /**
   * Finds the current caption based on the frame timestamp
   */
  const currentCaption = overlay.captions.find(
    (caption) => frameMs >= caption.startMs && frameMs <= caption.endMs
  );

  if (!currentCaption) return null;

  /**
   * Renders individual words with highlight animations
   * @param caption - The current caption object containing words and timing
   */
  const renderWords = (caption: Caption) => {
    return caption?.words?.map((word, index) => {
      const isHighlighted = frameMs >= word.startMs && frameMs <= word.endMs;
      const progress = isHighlighted
        ? Math.min((frameMs - word.startMs) / 300, 1)
        : 0;

      const highlightStyle =
        styles.highlightStyle || defaultCaptionStyles.highlightStyle;

      return (
        <span
          key={`${word.word}-${index}`}
          className="inline-block transition-all duration-200"
          style={{
            color: isHighlighted ? highlightStyle?.color : styles.color,
            backgroundColor: isHighlighted
              ? highlightStyle?.backgroundColor
              : "transparent",
            opacity: isHighlighted ? 1 : 0.85,
            transform: isHighlighted
              ? `scale(${
                  1 +
                  (highlightStyle?.scale
                    ? (highlightStyle.scale - 1) * progress
                    : 0.08)
                })`
              : "scale(1)",
            fontWeight: isHighlighted
              ? highlightStyle?.fontWeight || 600
              : styles.fontWeight || 400,
            textShadow: isHighlighted
              ? highlightStyle?.textShadow
              : styles.textShadow,
            padding: highlightStyle?.padding || "4px 8px",
            borderRadius: highlightStyle?.borderRadius || "4px",
            margin: "0 2px",
            fontFamily: fontFamily, // Use original font name
          }}
        >
          {word.word}
        </span>
      );
    });
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{
        ...styles,
        width: "100%",
        height: "100%",
        fontFamily: fontFamily, // Use original font name
      }}
    >
      <div
        className="leading-relaxed tracking-wide"
        style={{
          whiteSpace: "pre-wrap",
          width: "100%",
          textAlign: "center",
          wordBreak: "break-word",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "2px",
        }}
      >
        {renderWords(currentCaption)}
      </div>
    </div>
  );
}; 