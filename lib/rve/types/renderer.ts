import { z } from "zod";
import { CompositionProps, type ProgressResponse as BaseProgressResponse } from "./index";

// Re-export ProgressResponse for consistency
export type ProgressResponse = BaseProgressResponse;

/**
 * Response from initiating a render
 */
export interface RenderResponse {
  renderId: string;
  bucketName?: string;
}

/**
 * Parameters for starting a render
 */
export interface RenderParams {
  id: string;
  inputProps: z.infer<typeof CompositionProps>;
}

/**
 * Parameters for checking render progress
 */
export interface ProgressParams {
  id: string;
  bucketName?: string;
}

/**
 * Render type information that can be included in renderer implementations
 */
export interface RenderTypeInfo {
  /** The type of rendering (ssr or lambda) */
  type: "ssr" | "lambda";
  /** Entry point for the renderer */
  entryPoint: string;
}

/**
 * Interface that consumers must implement to provide rendering capabilities
 */
export interface VideoRenderer {
  /**
   * Start rendering a video with the given parameters
   * @param params - Render parameters including composition ID and props
   * @returns Promise resolving to render response with renderId
   */
  renderVideo(params: RenderParams): Promise<RenderResponse>;

  /**
   * Check the progress of a render
   * @param params - Progress parameters including renderId and optional bucketName
   * @returns Promise resolving to progress response
   */
  getProgress(params: ProgressParams): Promise<ProgressResponse>;

  /**
   * Optional render type information
   * This allows the renderer to specify its own type and configuration
   */
  renderType?: RenderTypeInfo;
}

/**
 * Configuration for the rendering system
 */
export interface RendererConfig {
  /**
   * The video renderer implementation to use
   */
  renderer: VideoRenderer;
  
  /**
   * Optional polling interval in milliseconds (default: 1000)
   */
  pollingInterval?: number;
  
  /**
   * Optional initial delay before starting progress polling in milliseconds (default: 0)
   */
  initialDelay?: number;
} 