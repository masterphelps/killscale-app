import type { VideoRenderer, RenderParams, RenderResponse, ProgressParams } from './types/renderer';
import type { ProgressResponse } from './types';

/**
 * No-op renderer for RVE. Server-side rendering requires Chromium
 * and can't run on Vercel serverless. This stub satisfies the
 * VideoRenderer interface requirement.
 */
export const stubRenderer: VideoRenderer = {
  async renderVideo(_params: RenderParams): Promise<RenderResponse> {
    return { renderId: 'stub-render-id' };
  },
  async getProgress(_params: ProgressParams): Promise<ProgressResponse> {
    return { type: 'error', message: 'Server-side rendering is not available. Use the Save button to export your overlay configuration.' };
  },
};
