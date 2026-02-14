import { useCurrentFrame, interpolate, Html5Audio } from "remotion";
import { SoundOverlay } from "../../../types";
import { toAbsoluteUrl } from "../../general/url-helper";
import { useEditorContext } from "../../../contexts/editor-context";

interface SoundLayerContentProps {
  overlay: SoundOverlay;
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

export const SoundLayerContent: React.FC<SoundLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const { baseUrl: contextBaseUrl } = useSafeEditorContext();
  const frame = useCurrentFrame();
  
  // Use prop baseUrl first, then context baseUrl
  const resolvedBaseUrl = baseUrl || contextBaseUrl;

  // Safety check - don't render Audio if src is missing
  if (!overlay.src || overlay.src.trim() === '') {
    console.warn('SoundLayerContent: No src provided for sound overlay', overlay);
    return null;
  }

  // Determine the audio source URL
  let audioSrc = overlay.src;

  // If it's an API route, use toAbsoluteUrl to ensure proper domain
  if (overlay.src.startsWith("/api/")) {
    audioSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }
  // If it's a relative URL and baseUrl is provided, use baseUrl
  else if (overlay.src.startsWith("/") && resolvedBaseUrl) {
    audioSrc = `${resolvedBaseUrl}${overlay.src}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (overlay.src.startsWith("/")) {
    audioSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }

  // Calculate volume with fade in/out
  const baseVolume = overlay.styles?.volume ?? 1;
  const fadeIn = Math.max(0, overlay.styles?.fadeIn ?? 0); // Ensure non-negative
  const fadeOut = Math.max(0, overlay.styles?.fadeOut ?? 0); // Ensure non-negative
  
  // Calculate fade multiplier based on current frame
  // Assuming 30fps for fade calculation
  const fps = 30;
  const fadeInFrames = fadeIn * fps;
  const fadeOutFrames = fadeOut * fps;
  const totalFrames = overlay.durationInFrames || 0;
  
  let fadeMultiplier = 1;
  
  // Apply fade in
  if (fadeIn > 0 && frame < fadeInFrames) {
    const fadeInMultiplier = interpolate(
      frame,
      [0, fadeInFrames],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    fadeMultiplier *= fadeInMultiplier;
  }
  
  // Apply fade out
  if (fadeOut > 0 && frame > totalFrames - fadeOutFrames) {
    const fadeOutMultiplier = interpolate(
      frame,
      [totalFrames - fadeOutFrames, totalFrames],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );
    fadeMultiplier *= fadeOutMultiplier;
  }
  
  const finalVolume = baseVolume * fadeMultiplier;

  return (
    <Html5Audio
      src={audioSrc}
      trimBefore={overlay.startFromSound || 0}
      volume={finalVolume}
    />
  );
}; 