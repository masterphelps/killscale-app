import React, { useRef, useCallback, useEffect, useState } from "react";
import { useCurrentFrame } from "remotion";
import { ImageOverlay } from "../../../types";
import { animationTemplates, getAnimationKey } from "../../../adaptors/default-animation-adaptors";
import { layout3DTemplates, getLayout3DKey } from "../../../adaptors/default-3d-layout-adaptors";
import { Img } from "remotion";
import { toAbsoluteUrl } from "../../general/url-helper";
import { useEditorContext } from "../../../contexts/editor-context";
import { calculateObjectFitDimensions } from "../helpers/object-fit-calculator";

/**
 * Props for the ImageLayerContent component
 * @interface ImageLayerContentProps
 * @property {ImageOverlay} overlay - The image overlay object containing source and style information
 * @property {string | undefined} baseUrl - The base URL for the image
 */
interface ImageLayerContentProps {
  overlay: ImageOverlay;
  baseUrl?: string;
}

/**
 * Hook to safely use editor context only when available
 */
const useSafeEditorContext = () => {
  try {
    return useEditorContext();
  } catch {
    return { baseUrl: undefined };
  }
};

/**
 * ImageLayerContent Component
 *
 * @component
 * @description
 * Renders an image layer in the video editor with animation support.
 * Features include:
 * - Enter/exit animations
 * - Style customization (fit, position, opacity)
 * - Transform effects
 * - Visual effects (filters, shadows, borders)
 * - Filter presets (retro, vintage, noir, etc.)
 * - Border radius customization
 *
 * The component handles both the visual presentation and animation
 * timing for image overlays.
 *
 * @example
 * ```tsx
 * <ImageLayerContent
 *   overlay={{
 *     src: "path/to/image.jpg",
 *     styles: {
 *       objectFit: "cover",
 *       filter: "contrast(120%) saturate(110%)", // Can be a preset or custom filter
 *       borderRadius: "8px",
 *       animation: {
 *         enter: "fadeIn",
 *         exit: "fadeOut"
 *       }
 *     }
 *   }}
 * />
 * ```
 */
export const ImageLayerContent: React.FC<ImageLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const frame = useCurrentFrame();
  const { baseUrl: contextBaseUrl } = useSafeEditorContext();
  const isExitPhase = frame >= overlay.durationInFrames - 30;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Use prop baseUrl first, then context baseUrl
  const resolvedBaseUrl = baseUrl || contextBaseUrl;

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

  // Apply 3D layout transformation
  const layout3DTransform = 
    overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none"
      ? layout3DTemplates[getLayout3DKey(overlay.styles.layout3D.layout)]?.transform()
      : {};

  // Create adaptive transition based on 3D layout type
  // Note: clipPath is excluded from transitions to ensure instant crop updates
  const getTransitionForLayout = (layoutKey?: string) => {
    if (!layoutKey || layoutKey === "none") {
      return "transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-out, filter 0.3s ease-out";
    }
    
    // Different transitions for different layout types
    switch (layoutKey) {
      case "tilt-left":
      case "tilt-right":
      case "tilt-up":
      case "tilt-down":
        return "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out, filter 0.3s ease-out";
      
      case "card-left":
      case "card-right":
        return "transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-out, filter 0.3s ease-out";
      
      case "book":
      case "skewed":
        return "transform 1.0s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.3s ease-out, filter 0.3s ease-out";
      
      case "floating":
      case "billboard":
        return "transform 0.9s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease-out, filter 0.3s ease-out";
        
      default:
        return "transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-out, filter 0.3s ease-out";
    }
  };

  // Add subtle micro-interaction scale effect
  const getMicroInteractionScale = (layoutKey?: string) => {
    if (!layoutKey || layoutKey === "none") return "";
    
    // Add a very subtle scale for certain dramatic effects
    switch (layoutKey) {
      case "floating":
      case "billboard":
        return " scale(1.02)";
      case "card-left":
      case "card-right":
      case "book":
        return " scale(1.01)";
      default:
        return "";
    }
  };

  // Get current animation object safely
  const currentAnimation = isExitPhase ? exitAnimation : enterAnimation;

  /**
   * Combine base styles with current animation phase and 3D layout
   */
  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: overlay.styles.objectFit || "cover",
    objectPosition: overlay.styles.objectPosition,
    opacity: overlay.styles.opacity,
    filter: overlay.styles.filter || "none",
    // Ensure transparent background when 3D effects are active to prevent white background
    backgroundColor: overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none" 
      ? "transparent" 
      : "transparent",
    // Additional 3D rendering properties to prevent background issues
    ...(overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none" && {
      backfaceVisibility: "hidden" as any,
      WebkitBackfaceVisibility: "hidden" as any,
      transformOrigin: "center center",
    }),
    // Combine transforms: base transform, 3D layout, micro-interaction, and animation
    transform: [
      overlay.styles.transform || "",
      layout3DTransform.transform || "",
      getMicroInteractionScale(overlay.styles.layout3D?.layout),
      currentAnimation?.transform || ""
    ].filter(Boolean).join(" ") || "none",
    transformStyle: layout3DTransform.transformStyle as any || "flat",
    // Adaptive smooth transitions based on 3D layout type
    transition: getTransitionForLayout(overlay.styles.layout3D?.layout),
    // Apply animation properties without overriding the combined transform
    ...(currentAnimation?.opacity !== undefined && { opacity: currentAnimation.opacity }),
    ...(currentAnimation?.filter !== undefined && { filter: currentAnimation.filter }),
    ...(currentAnimation?.clipPath !== undefined && { clipPath: currentAnimation.clipPath }),
  };

  /**
   * Create a container style that includes padding, background color, and 3D layout z-index
   */
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: overlay.styles.padding || "0px",
    // Force transparent background when 3D effects are active to prevent white background
    backgroundColor: overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none" 
      ? "transparent" 
      : overlay.styles.paddingBackgroundColor || "transparent",
    display: "flex", // Use flexbox for centering
    alignItems: "center",
    justifyContent: "center",
    // Padding should be part of the total size
    boxSizing: "border-box",
    // Radius/border/shadow should wrap the padded container
    borderRadius: overlay.styles.borderRadius || "0px",
    border: overlay.styles.border || "none",
    boxShadow: overlay.styles.boxShadow || "none",
    // Ensure inner image respects rounded corners, but allow overflow when 3D layout is active
    overflow: overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none" 
      ? "visible" 
      : "hidden",
    // Apply clipPath at the container level so padding is also cropped
    clipPath: overlay.styles.clipPath || "none",
    // Apply z-index from 3D layout if available
    zIndex: layout3DTransform.zIndex || overlay.styles.zIndex || "auto",
    // Ensure the container preserves 3D transforms
    transformStyle: layout3DTransform.transformStyle as any || "flat",
    // Additional 3D rendering properties to ensure proper background handling
    ...(overlay.styles.layout3D?.layout && overlay.styles.layout3D.layout !== "none" && {
      transformOrigin: "center center",
      backfaceVisibility: "hidden" as any,
    }),
    // Smooth transitions for container changes (excluding clipPath and padding for instant updates)
    transition: "background-color 0.4s ease-out, border-radius 0.4s ease-out, border 0.4s ease-out, box-shadow 0.4s ease-out",
  };

  // Determine the image source URL
  let imageSrc = overlay.src;

  // If it's an API route, use toAbsoluteUrl to ensure proper domain
  if (overlay.src.startsWith("/api/")) {
    imageSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }
  // If it's a relative URL and baseUrl is provided, use baseUrl
  else if (overlay.src.startsWith("/") && resolvedBaseUrl) {
    imageSrc = `${resolvedBaseUrl}${overlay.src}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (overlay.src.startsWith("/")) {
    imageSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }

  // Process image with greenscreen removal when enabled
  const processImageWithGreenscreen = useCallback(() => {
    if (!canvasRef.current || !imageRef.current || !imageLoaded || !overlay.greenscreen?.enabled) {
      return;
    }

    const context = canvasRef.current.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    // Get dimensions
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    const imgWidth = imageRef.current.naturalWidth || canvasWidth;
    const imgHeight = imageRef.current.naturalHeight || canvasHeight;

    // Clear canvas
    context.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate objectFit positioning using helper
    const objectFit = overlay.styles.objectFit || "cover";
    const { drawX, drawY, drawWidth, drawHeight } = calculateObjectFitDimensions(
      imgWidth,
      imgHeight,
      canvasWidth,
      canvasHeight,
      objectFit
    );

    // Draw the image to canvas
    context.drawImage(imageRef.current, drawX, drawY, drawWidth, drawHeight);

    // Get image data for pixel manipulation
    const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const { data } = imageData;

    // Get greenscreen configuration with defaults
    const config = overlay.greenscreen;
    const sensitivity = config.sensitivity ?? 100;
    const redThreshold = config.threshold?.red ?? 100;
    const greenMin = config.threshold?.green ?? 100;
    const blueThreshold = config.threshold?.blue ?? 100;
    const smoothing = config.smoothing ?? 0;
    const spill = config.spill ?? 0;

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const alpha = data[i + 3];

      // Check if pixel is green (greenscreen)
      if (green > greenMin && red < redThreshold && blue < blueThreshold) {
        // Calculate how "green" this pixel is for smooth transition
        const greenness = (green - Math.max(red, blue)) / 255;
        const alphaReduction = Math.min(1, greenness * (sensitivity / 100));
        
        // Apply transparency based on greenness and sensitivity
        data[i + 3] = alpha * (1 - alphaReduction);
      } else if (spill > 0) {
        // Remove green spill from non-green pixels
        const greenSpill = Math.max(0, green - Math.max(red, blue));
        if (greenSpill > 0) {
          data[i + 1] = Math.max(0, green - greenSpill * spill);
        }
      }
    }

    // Apply smoothing if enabled (simple box blur on alpha channel)
    if (smoothing > 0) {
      const smoothedData = new Uint8ClampedArray(data);
      const radius = Math.min(10, smoothing);
      
      for (let y = radius; y < canvasHeight - radius; y++) {
        for (let x = radius; x < canvasWidth - radius; x++) {
          let alphaSum = 0;
          let count = 0;

          // Average alpha values in neighborhood
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const idx = ((y + dy) * canvasWidth + (x + dx)) * 4;
              alphaSum += data[idx + 3];
              count++;
            }
          }

          const idx = (y * canvasWidth + x) * 4;
          smoothedData[idx + 3] = alphaSum / count;
        }
      }

      // Copy smoothed alpha back
      for (let i = 3; i < data.length; i += 4) {
        data[i] = smoothedData[i];
      }
    }

    // Put processed image data back to canvas
    context.putImageData(imageData, 0, 0);
  }, [imageLoaded, overlay.greenscreen, overlay.styles.objectFit]);

  // Process image when it loads and when greenscreen settings change
  useEffect(() => {
    if (imageLoaded && overlay.greenscreen?.enabled) {
      processImageWithGreenscreen();
    }
  }, [imageLoaded, overlay.greenscreen, overlay.width, overlay.height, processImageWithGreenscreen]);

  // If greenscreen removal is enabled, use canvas-based rendering
  if (overlay.greenscreen?.enabled) {
    return (
      <div style={containerStyle}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Hidden image that we'll process */}
          <img
            ref={imageRef}
            src={imageSrc}
            onLoad={() => setImageLoaded(true)}
            style={{ 
              ...imageStyle,
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0,
            }}
            alt=""
            crossOrigin="anonymous"
          />
          {/* Canvas that displays processed image with greenscreen removed */}
          <canvas
            ref={canvasRef}
            width={overlay.width}
            height={overlay.height}
            style={{
              ...imageStyle,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />
        </div>
      </div>
    );
  }

  // Normal rendering without greenscreen removal
  return (
    <div style={containerStyle}>
      <Img src={imageSrc} style={imageStyle} alt="" />
    </div>
  );
}; 