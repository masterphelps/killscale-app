import {
  useCurrentFrame,
  delayRender,
  continueRender,
  Html5Video
} from "remotion";
import { ClipOverlay } from "../../../types";
import { animationTemplates, getAnimationKey } from "../../../adaptors/default-animation-adaptors";
import { toAbsoluteUrl } from "../../general/url-helper";
import { useEffect, useRef, useCallback } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { FPS } from "../../../components/advanced-timeline/constants";
import { calculateObjectFitDimensions } from "../helpers/object-fit-calculator";

/**
 * Interface defining the props for the VideoLayerContent component
 */
interface VideoLayerContentProps {
  /** The overlay configuration object containing video properties and styles */
  overlay: ClipOverlay;
  /** The base URL for the video */
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
 * VideoLayerContent component renders a video layer with animations and styling
 *
 * This component handles:
 * - Video playback using Remotion's OffthreadVideo
 * - Enter/exit animations based on the current frame
 * - Styling including transform, opacity, border radius, etc.
 * - Video timing and volume controls
 * - Optional greenscreen removal using canvas processing
 *
 * @param props.overlay - Configuration object for the video overlay including:
 *   - src: Video source URL
 *   - videoStartTime: Start time offset for the video
 *   - durationInFrames: Total duration of the overlay
 *   - styles: Object containing visual styling properties and animations
 *   - greenscreen: Optional greenscreen removal configuration
 */
export const VideoLayerContent: React.FC<VideoLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const frame = useCurrentFrame();
  const { baseUrl: contextBaseUrl } = useSafeEditorContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProcessedFrameRef = useRef<CanvasImageSource | null>(null);

  // Use prop baseUrl first, then context baseUrl
  const resolvedBaseUrl = baseUrl || contextBaseUrl;

  // Determine the video source URL first
  let videoSrc = overlay.src;
  
  // If it's an API route, use toAbsoluteUrl to ensure proper domain
  if (overlay.src.startsWith("/api/")) {
    videoSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }
  // If it's a relative URL and baseUrl is provided, use baseUrl
  else if (overlay.src.startsWith("/") && resolvedBaseUrl) {
    videoSrc = `${resolvedBaseUrl}${overlay.src}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (overlay.src.startsWith("/")) {
    videoSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  } else {
  }

  useEffect(() => {
    const handle = delayRender("Loading video");

    // Create a video element to preload the video
    const video = document.createElement("video");
    video.src = videoSrc;
    

    const handleLoadedMetadata = () => {
      continueRender(handle);
    };

    const handleError = (error: ErrorEvent) => {
      console.error(`Error loading video ${overlay.src}:`, error);
      continueRender(handle);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      // Ensure we don't leave hanging render delays
      continueRender(handle);
    };
  }, [overlay.src, videoSrc]);

  // Process video frame with greenscreen removal
  const processVideoFrame = useCallback(
    (videoFrame: CanvasImageSource) => {
      if (!canvasRef.current || !overlay.greenscreen?.enabled) {
        return;
      }

      const context = canvasRef.current.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }

      // Store the last processed frame for reprocessing on resize
      lastProcessedFrameRef.current = videoFrame;

      // Get dimensions
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;
      const videoWidth = (videoFrame as HTMLVideoElement).videoWidth || canvasWidth;
      const videoHeight = (videoFrame as HTMLVideoElement).videoHeight || canvasHeight;

      // Clear canvas
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      // Calculate objectFit positioning using helper
      const objectFit = overlay.styles.objectFit || "cover";
      const { drawX, drawY, drawWidth, drawHeight } = calculateObjectFitDimensions(
        videoWidth,
        videoHeight,
        canvasWidth,
        canvasHeight,
        objectFit
      );

      // Draw the video frame to canvas
      context.drawImage(videoFrame, drawX, drawY, drawWidth, drawHeight);

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
    },
    [overlay.greenscreen, overlay.styles.objectFit]
  );

  // Reprocess last frame when dimensions change (handles resize while paused)
  useEffect(() => {
    if (overlay.greenscreen?.enabled && lastProcessedFrameRef.current) {
      processVideoFrame(lastProcessedFrameRef.current);
    }
  }, [overlay.width, overlay.height, processVideoFrame, overlay.greenscreen?.enabled]);

  // Greenscreen removal callback for video frame processing
  const onVideoFrame = useCallback(
    (videoFrame: CanvasImageSource) => {
      processVideoFrame(videoFrame);
    },
    [processVideoFrame]
  );

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

  const videoStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: overlay.styles.objectFit || "cover",
    opacity: overlay.styles.opacity,
    transform: overlay.styles.transform || "none",
    filter: overlay.styles.filter || "none",
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Create a container style that includes padding and background color
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: overlay.styles.padding || "0px",
    backgroundColor: overlay.styles.paddingBackgroundColor || "transparent",
    display: "flex", // Use flexbox for centering
    alignItems: "center",
    justifyContent: "center",
    // Padding should be part of the total size
    boxSizing: "border-box",
    // Radius/border/shadow should wrap the padded container
    borderRadius: overlay.styles.borderRadius || "0px",
    border: overlay.styles.border || "none",
    boxShadow: overlay.styles.boxShadow || "none",
    // Ensure inner video respects rounded corners
    overflow: "hidden",
    // Apply clipPath at the container level so padding is also cropped
    clipPath: overlay.styles.clipPath || "none",
  };

  // Convert videoStartTime from seconds to frames for OffthreadVideo
  const startFromFrames = Math.round((overlay.videoStartTime || 0) * FPS);
  
  // If greenscreen removal is enabled, use canvas-based rendering
  if (overlay.greenscreen?.enabled) {
    return (
      <div style={containerStyle}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Hidden video that feeds frames to canvas */}
          <Html5Video
            src={videoSrc}
            trimBefore={startFromFrames}
            style={{ 
              ...videoStyle,
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0,
            }}
            volume={overlay.styles.volume ?? 1}
            playbackRate={overlay.speed ?? 1}
          />
          {/* Canvas that displays processed video with greenscreen removed */}
          <canvas
            ref={canvasRef}
            width={overlay.width}
            height={overlay.height}
            style={{
              ...videoStyle,
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
      <Html5Video
        src={videoSrc}
        trimBefore={startFromFrames}
        style={videoStyle}
        volume={overlay.styles.volume ?? 1}
        playbackRate={overlay.speed ?? 1}
      />
    </div>
  );
}; 