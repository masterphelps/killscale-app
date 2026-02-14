import { useState, useCallback, useEffect } from "react";
import { AspectRatio } from "../types";
import { getDimensionsForAspectRatio } from "../utils/aspect-ratio-transform";

/**
 * Custom hook for managing aspect ratio and player dimensions.
 * @param initialRatio - The initial aspect ratio to use (default: "16:9")
 * @param onRatioChange - Callback function to call when the aspect ratio changes (optional)
 * @returns An object containing aspect ratio state and related functions
 */

export const useAspectRatio = (
  initialRatio: AspectRatio = "16:9",
  onRatioChange?: (ratio: AspectRatio) => void
) => {
  // Single source of truth for aspect ratio
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialRatio);

  // Update aspect ratio when initialRatio changes (e.g., when project loads)
  useEffect(() => {
    if (initialRatio && initialRatio !== aspectRatio) {
      setAspectRatio(initialRatio);
    }
  }, [initialRatio]);

  const handleAspectRatioChange = useCallback(
    (newRatio: AspectRatio) => {
      setAspectRatio(newRatio);
      onRatioChange?.(newRatio);
    },
    [onRatioChange]
  );

  const [playerDimensions, setPlayerDimensions] = useState({
    width: 640,
    height: 360,
  }); // Default 16:9 dimensions

  /**
   * Updates the player dimensions based on the container size and current aspect ratio.
   * @param containerWidth - The width of the container
   * @param containerHeight - The height of the container
   */
  const updatePlayerDimensions = useCallback(
    (containerWidth: number, containerHeight: number) => {
      let width, height;

      // Calculate target aspect ratio
      const targetRatio =
        aspectRatio === "16:9"
          ? 16 / 9
          : aspectRatio === "9:16"
          ? 9 / 16
          : aspectRatio === "1:1"
          ? 1
          : 4 / 5;

      // Compare container ratio with target ratio to determine fitting strategy
      const containerRatio = containerWidth / containerHeight;

      if (containerRatio > targetRatio) {
        // Container is wider than target ratio - fit to height
        height = containerHeight;
        width = height * targetRatio;
      } else {
        // Container is taller than target ratio - fit to width
        width = containerWidth;
        height = width / targetRatio;
      }

      setPlayerDimensions({ width, height });
    },
    [aspectRatio]
  );

  /**
   * Returns the standard dimensions for the current aspect ratio.
   * @returns An object containing the width and height for the current aspect ratio
   */
  const getAspectRatioDimensions = useCallback(() => {
    return getDimensionsForAspectRatio(aspectRatio);
  }, [aspectRatio]);

  return {
    aspectRatio,
    setAspectRatio: handleAspectRatioChange,
    playerDimensions,
    updatePlayerDimensions,
    getAspectRatioDimensions,
  };
};
