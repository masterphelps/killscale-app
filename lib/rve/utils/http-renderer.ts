import { VideoRenderer, RenderParams, RenderResponse, ProgressParams, ProgressResponse, RenderTypeInfo } from "../types/renderer";

/**
 * HTTP-based video renderer implementation
 */
export class HttpRenderer implements VideoRenderer {
  private endpoint: string;
  private renderTypeInfo: RenderTypeInfo;

  constructor(endpoint: string, renderType: RenderTypeInfo) {
    this.endpoint = endpoint;
    this.renderTypeInfo = renderType;
  }

  async renderVideo(params: RenderParams): Promise<RenderResponse> {
    const response = await fetch(`${this.endpoint}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Render request failed: ${response.statusText}`);
    }

    const responseData = await response.json();
    
    // Handle different response structures
    // Lambda renderer wraps response in { type: "success", data: ... }
    // SSR renderer returns response directly
    if (responseData.type === "success" && responseData.data) {
      return responseData.data;
    }
    
    // Direct response (SSR)
    return responseData;
  }

  async getProgress(params: ProgressParams): Promise<ProgressResponse> {
    const response = await fetch(`${this.endpoint}/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Progress request failed: ${response.statusText}`);
    }

    const responseData = await response.json();
    
    // Handle different response structures
    // Lambda renderer wraps response in { type: "success", data: ... }
    // SSR renderer returns response directly
    if (responseData.type === "success" && responseData.data) {
      return responseData.data;
    }
    
    // Direct response (SSR)
    return responseData;
  }

  get renderType(): RenderTypeInfo {
    return this.renderTypeInfo;
  }
} 