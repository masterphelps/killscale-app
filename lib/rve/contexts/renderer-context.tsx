import React, { createContext, useContext, ReactNode } from "react";
import { RendererConfig } from "../types/renderer";

/**
 * Context for providing video renderer implementation
 */
const RendererContext = createContext<RendererConfig | null>(null);

/**
 * Props for the RendererProvider component
 */
export interface RendererProviderProps {
  children: ReactNode;
  config: RendererConfig;
}

/**
 * Provider component that makes video renderer available to child components
 * 
 * @example
 * ```tsx
 * const myRenderer: VideoRenderer = {
 *   renderVideo: async (params) => {
 *     // Your rendering implementation
 *     const response = await fetch('/api/render', {
 *       method: 'POST',
 *       body: JSON.stringify(params)
 *     });
 *     return response.json();
 *   },
 *   getProgress: async (params) => {
 *     // Your progress checking implementation
 *     const response = await fetch('/api/progress', {
 *       method: 'POST', 
 *       body: JSON.stringify(params)
 *     });
 *     return response.json();
 *   }
 * };
 * 
 * <RendererProvider config={{ renderer: myRenderer }}>
 *   <VideoEditor />
 * </RendererProvider>
 * ```
 */
export const RendererProvider: React.FC<RendererProviderProps> = ({
  children,
  config,
}) => {
  return (
    <RendererContext.Provider value={config}>
      {children}
    </RendererContext.Provider>
  );
};

/**
 * Hook to access the current renderer configuration
 * 
 * @throws Error if used outside of RendererProvider
 * @returns The current renderer configuration
 */
export const useRenderer = (): RendererConfig => {
  const context = useContext(RendererContext);
  
  if (!context) {
    throw new Error(
      "useRenderer must be used within a RendererProvider. " +
      "Please wrap your component tree with <RendererProvider config={{renderer: yourRenderer}}>"
    );
  }
  
  return context;
};

/**
 * Hook to check if renderer is available (doesn't throw)
 * 
 * @returns The renderer configuration if available, null otherwise
 */
export const useOptionalRenderer = (): RendererConfig | null => {
  return useContext(RendererContext);
}; 