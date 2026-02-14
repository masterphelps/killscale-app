import React, { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";
import { TextOverlay } from "../../../types";
import { animationTemplates } from "../../../templates/animation-templates";
import { getAnimationKey } from "../../../adaptors/default-animation-adaptors";
import { useLoadFontFromTextItem } from "../../text/load-font-from-text-item";

interface TextLayerContentProps {
  overlay: TextOverlay;
  fontInfos?: Record<string, FontInfo>;
}

export const TextLayerContent: React.FC<TextLayerContentProps> = ({
  overlay,
  fontInfos,
}) => {
  const frame = useCurrentFrame();
  
  // Get font family - handle legacy Tailwind classes for backward compatibility
  const getFontFamily = (): string => {
    const fontValue = overlay.styles.fontFamily;
    
    // Handle legacy Tailwind font classes for backward compatibility
    if (fontValue?.startsWith('font-')) {
      switch (fontValue) {
        case "font-sans":
          return "Inter";
        case "font-serif":
          return "Merriweather";
        case "font-mono":
          return "Roboto Mono";
        case "font-retro":
          return "VT323";
        case "font-league-spartan":
          return "League Spartan";
        case "font-bungee-inline":
          return "Bungee Inline";
        default:
          return "Inter"; // Default fallback for unknown Tailwind classes
      }
    }
    
    // If it's not a Tailwind class, it's already a font family name
    return fontValue || "Inter";
  };

  const fontFamily = getFontFamily();
  const fontWeight = String(overlay.styles.fontWeight || '400');
  const fontStyle = (overlay.styles.fontStyle || 'normal') as 'normal' | 'italic';
  
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

  // Calculate if we're in the exit phase (last 30 frames)
  const isExitPhase = frame >= overlay.durationInFrames - 30;

  // Apply enter animation only during entry phase
  const enterAnimation =
    !isExitPhase && overlay.styles.animation?.enter
      ? animationTemplates[getAnimationKey(overlay.styles.animation.enter)]?.enter(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply exit animation only during exit phase
  const exitAnimation =
    isExitPhase && overlay.styles.animation?.exit
      ? animationTemplates[getAnimationKey(overlay.styles.animation.exit)]?.exit(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Memoize font size calculation for performance during resizing
  const fontSize = useMemo(() => {
    const lines = overlay.content.split("\n");
    const numLines = lines.length;
    const maxLineLength = Math.max(...lines.map((line) => line.length));
    
    // If no content, return a reasonable default based on container size
    if (!overlay.content.trim() || maxLineLength === 0) {
      return Math.min(48, overlay.height * 0.6);
    }
    
    // Extract actual padding from styles and convert to pixels
    const extractPadding = (paddingStr: string | undefined) => {
      if (!paddingStr) return { vertical: 0, horizontal: 0 };
      
      // Handle different padding formats: "24px", "24px 48px", "24px 48px 24px 48px"
      const values = paddingStr.split(' ').map(v => {
        if (v.endsWith('px')) return parseInt(v);
        if (v.endsWith('em')) return parseInt(v) * 16; // Rough conversion
        return 0;
      });
      
      if (values.length === 1) {
        // Same padding all around: "24px"
        return { vertical: values[0] * 2, horizontal: values[0] * 2 };
      } else if (values.length === 2) {
        // Vertical and horizontal: "24px 48px"
        return { vertical: values[0] * 2, horizontal: values[1] * 2 };
      } else if (values.length === 4) {
        // Top, right, bottom, left: "24px 48px 24px 48px"
        return { vertical: values[0] + values[2], horizontal: values[1] + values[3] };
      }
      return { vertical: values[0] * 2, horizontal: values[0] * 2 }; // fallback
    };
    
    const padding = extractPadding(overlay.styles.padding);
    const actualPaddingVertical = padding.vertical;
    const actualPaddingHorizontal = padding.horizontal;
    
    // Account for borders too
    const borderWidth = overlay.styles.border ? 2 : 0; // Rough estimate for border
    
    const lineHeightFactor = parseFloat(overlay.styles.lineHeight || "1.2");
    
    // Calculate available space accounting for actual padding and borders
    const availableWidth = Math.max(20, overlay.width - actualPaddingHorizontal - (borderWidth * 2));
    const availableHeight = Math.max(20, overlay.height - actualPaddingVertical - (borderWidth * 2));
    
    // Height-based calculation (primary constraint)
    const heightBasedSize = (availableHeight / numLines) / lineHeightFactor;
    
    // Width-based calculation with more realistic character width
    // Use a more generous character width ratio for better scaling
    const avgCharWidthRatio = 0.5; // Less conservative
    const widthBasedSize = availableWidth / (maxLineLength * avgCharWidthRatio);
    
    // Use the more restrictive constraint
    let calculatedSize = Math.min(heightBasedSize, widthBasedSize);
    
    // Apply minimal safety margin - users can resize if needed
    calculatedSize *= 0.95; // Only 5% safety margin
    
    // Gentler penalties for challenging text layouts
    if (maxLineLength > 40) {
      calculatedSize *= Math.max(0.85, 1 - (maxLineLength - 40) / 200);
    }
    
    if (numLines > 4) {
      calculatedSize *= Math.max(0.9, 1 - (numLines - 4) * 0.02);
    }
    
    // Only apply small container penalty for very tiny containers
    if (overlay.width < 60 || overlay.height < 20) {
      calculatedSize *= 0.9;
    }
    
    // Set more generous bounds
    const minSize = Math.max(8, Math.min(16, overlay.height * 0.1));
    const maxSize = Math.min(
      overlay.height * 0.8,  // Much more generous - 80% of height
      overlay.width * 0.15,  // More generous width ratio
      200 // Higher absolute maximum
    );
    
    const finalSize = Math.max(minSize, Math.min(calculatedSize, maxSize));
    
    // Apply font size scale factor if provided
    const fontSizeScale = overlay.styles.fontSizeScale || 1;
    return finalSize * fontSizeScale;
  }, [overlay.width, overlay.height, overlay.content, overlay.styles.padding, overlay.styles.border, overlay.styles.lineHeight, overlay.styles.fontSizeScale]);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center", // Center vertically
    textAlign: overlay.styles.textAlign,
    justifyContent:
      overlay.styles.textAlign === "center"
        ? "center"
        : overlay.styles.textAlign === "right"
        ? "flex-end"
        : "flex-start",
    overflow: "hidden",
    boxSizing: "border-box",
    position: "relative",
    userSelect: "none", // Prevent text selection during overlay interactions
    WebkitUserSelect: "none", // Safari support
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fontSize: _templateFontSize, ...restStyles } = overlay.styles;

  const textStyle: React.CSSProperties = {
    ...restStyles,
    animation: undefined,
    fontSize: `${fontSize}px`, // Always use our calculated fontSize
    fontFamily: fontFamily, // Use original font name, not loadedFontFamily
    maxWidth: "100%",
    maxHeight: "100%",
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    lineHeight: overlay.styles.lineHeight || "1.2",
    // Only add default padding if template doesn't have padding
    padding: overlay.styles.padding || "0.1em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxSizing: "border-box",
    userSelect: "none", // Prevent text selection during overlay interactions
    WebkitUserSelect: "none", // Safari support
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Procedural behaviors keyed off animation.enter for text-only effects
  const enterKey = overlay.styles.animation?.enter;
  const content = overlay.content || "Enter text...";
  let renderedContent: React.ReactNode = content;

  if (enterKey === 'typing') {
    const charDelay = 2; // frames per char
    const speed = 0.5; // multiplier
    const visibleCount = Math.min(
      content.length,
      Math.floor((frame * speed) / Math.max(1, charDelay))
    );
    renderedContent = content.slice(0, visibleCount);
  } 

  return (
    <div style={containerStyle}>
      <div style={textStyle}>
        {renderedContent}
      </div>
    </div>
  );
}; 