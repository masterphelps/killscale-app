import React from "react";
import { StickerOverlay } from "../../../types";

/**
 * Props interface for sticker components
 */
export interface StickerComponentProps {
  overlay: StickerOverlay;
  isSelected: boolean;
  onUpdate?: (updates: Partial<StickerOverlay>) => void;
}

/**
 * Base sticker component for simple shapes and icons
 */
export const BaseStickerComponent: React.FC<StickerComponentProps> = ({
  overlay,
  isSelected,
}) => {
  const stickerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.min(overlay.width, overlay.height) * 0.6,
    color: overlay.styles?.fill || "#000000",
    backgroundColor: overlay.styles?.stroke || "transparent",
    borderRadius: "8px",
    border: isSelected ? "2px solid #3b82f6" : "none",
    opacity: overlay.styles?.opacity || 1,
    transform: `scale(${overlay.styles?.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
    filter: overlay.styles?.filter || "none",
    cursor: "pointer",
    userSelect: "none",
    transition: "all 0.2s ease-in-out",
  };

  return (
    <div style={stickerStyle}>
      <span>{overlay.content}</span>
    </div>
  );
};

/**
 * SVG-based sticker component for more complex graphics
 */
export const SVGStickerComponent: React.FC<StickerComponentProps & { svgContent: string }> = ({
  overlay,
  isSelected,
  svgContent,
}) => {
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: isSelected ? "2px solid #3b82f6" : "none",
    opacity: overlay.styles?.opacity || 1,
    transform: `scale(${overlay.styles?.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
    filter: overlay.styles?.filter || "none",
    cursor: "pointer",
    transition: "all 0.2s ease-in-out",
  };

  return (
    <div style={containerStyle}>
      <div 
        dangerouslySetInnerHTML={{ __html: svgContent }}
        style={{
          width: "100%",
          height: "100%",
          fill: overlay.styles?.fill || "currentColor",
          stroke: overlay.styles?.stroke,
          strokeWidth: overlay.styles?.strokeWidth,
        }}
      />
    </div>
  );
};

/**
 * Animated sticker component for dynamic effects
 */
export const AnimatedStickerComponent: React.FC<StickerComponentProps & { animationType: string }> = ({
  overlay,
  isSelected,
  animationType,
}) => {
  const getAnimationClass = () => {
    switch (animationType) {
      case "pulse":
        return "animate-pulse";
      case "bounce":
        return "animate-bounce";
      case "spin":
        return "animate-spin";
      case "ping":
        return "animate-ping";
      default:
        return "";
    }
  };

  const stickerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.min(overlay.width, overlay.height) * 0.6,
    color: overlay.styles?.fill || "#000000",
    backgroundColor: overlay.styles?.stroke || "transparent",
    borderRadius: "8px",
    border: isSelected ? "2px solid #3b82f6" : "none",
    opacity: overlay.styles?.opacity || 1,
    transform: `scale(${overlay.styles?.scale || 1}) rotate(${overlay.rotation || 0}deg)`,
    filter: overlay.styles?.filter || "none",
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <div style={stickerStyle} className={getAnimationClass()}>
      <span>{overlay.content}</span>
    </div>
  );
}; 