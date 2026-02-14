import { z } from "zod";
import { useCallback, useMemo, useState } from "react";
import { CompositionProps } from "../types";
import { useRenderer } from "../contexts/renderer-context";

// Define possible states for the rendering process
export type State =
  | { status: "init" } // Initial state
  | { status: "invoking" } // API call is being made
  | {
      // Video is being rendered
      renderId: string;
      progress: number;
      status: "rendering";
      bucketName?: string; // Make bucketName optional
    }
  | {
      // Error occurred during rendering
      renderId: string | null;
      status: "error";
      error: Error;
    }
  | {
      // Rendering completed successfully
      url: string;
      size: number;
      status: "done";
    };

// Utility function to create a delay
const wait = async (milliSeconds: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, milliSeconds);
  });
};

/**
 * Custom hook to manage video rendering process using pluggable renderer
 * 
 * @param id - Unique identifier for the composition
 * @param inputProps - Composition properties for rendering
 * @returns Object containing render controls and state
 * 
 * @example
 * ```tsx
 * const { renderMedia, state, undo } = useRendering("my-composition", {
 *   overlays: [],
 *   durationInFrames: 900,
 *   width: 1920,
 *   height: 1080,
 *   fps: 30,
 *   src: "video.mp4"
 * });
 * 
 * // Start rendering
 * await renderMedia();
 * 
 * // Check state
 * if (state.status === "done") {
 *   console.log("Video ready:", state.url);
 * }
 * ```
 */
export const useRendering = (
  id: string,
  inputProps: z.infer<typeof CompositionProps>
) => {
  const rendererConfig = useRenderer();
  
  // Maintain current state of the rendering process
  const [state, setState] = useState<State>({
    status: "init",
  });

  // Main function to handle the rendering process
  const renderMedia = useCallback(async () => {
    // Prevent multiple concurrent renders
    if (state.status === "invoking" || state.status === "rendering") {
      console.log(`Render already in progress, ignoring new render request. Current status: ${state.status}`);
      return;
    }
    
    console.log(`Starting renderMedia process`);
    setState({
      status: "invoking",
    });
    
    try {
      const { renderer, pollingInterval = 1000, initialDelay = 0 } = rendererConfig;

      console.log("Calling renderVideo with inputProps", inputProps);
      const response = await renderer.renderVideo({ id, inputProps });
      const renderId = response.renderId;
      const bucketName = response.bucketName;

      // Apply initial delay if configured
      if (initialDelay > 0) {
        await wait(initialDelay);
      }

      setState({
        status: "rendering",
        progress: 0,
        renderId,
        ...(bucketName && { bucketName }),
      });

      // Wait a short moment before first progress check to allow async render process to initialize
      await wait(100);

      let pending = true;

      while (pending) {
        console.log(`Checking progress for renderId=${renderId}`);
        const result = await renderer.getProgress({
          id: renderId,
          ...(bucketName && { bucketName }),
        });
        
        console.log("Progress result", result);
        
        switch (result.type) {
          case "error": {
            console.error(`Render error: ${result.message}`);
            setState({
              status: "error",
              renderId: renderId,
              error: new Error(result.message),
            });
            pending = false;
            break;
          }
          case "done": {
            console.log(
              `Render complete: url=${result.url}, size=${result.size}`
            );
            setState({
              size: result.size,
              url: result.url,
              status: "done",
            });
            pending = false;
            break;
          }
          case "progress": {
            console.log(`Render progress: ${result.progress}%`);
            setState({
              status: "rendering",
              progress: result.progress,
              renderId: renderId,
              ...(bucketName && { bucketName }),
            });
            await wait(pollingInterval);
            break;
          }
        }
      }
    } catch (err) {
      console.error("Unexpected error during rendering:", err);
      setState({
        status: "error",
        error: err as Error,
        renderId: null,
      });
    }
  }, [id, inputProps, rendererConfig, state.status]);

  // Reset the rendering state back to initial
  const undo = useCallback(() => {
    setState({ status: "init" });
  }, []);

  // Return memoized values to prevent unnecessary re-renders
  return useMemo(
    () => ({
      renderMedia, // Function to start rendering
      state, // Current state of the render
      undo, // Function to reset the state
    }),
    [renderMedia, state, undo]
  );
};
