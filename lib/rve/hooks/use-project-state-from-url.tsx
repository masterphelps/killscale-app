import { useState, useEffect, useRef } from "react";
import { Overlay, AspectRatio } from "../types";
import { hasAutosave, clearAutosave } from "../utils/general/indexdb-helper";

// Empty default overlays — KillScale always provides overlays via defaultOverlays prop
const DEFAULT_OVERLAYS: Overlay[] = [];

/**
 * Custom hook to load project state (overlays) from API via URL parameter.
 *
 * ## How it works:
 * 1. Reads a project ID from URL query parameters (e.g., ?projectId=456)
 * 2. Calls the local Next.js API route: GET /api/projects?id={id}
 * 3. The local API route proxies the request to your external API
 * 4. Returns the overlays and aspect ratio to initialize the editor state
 * 5. If there's existing autosaved work, shows a confirmation modal
 *
 * ## Setup Required:
 * You need to configure your external API in your environment variables:
 * - `NEXT_PUBLIC_PROJECTS_API_URL`: Your external API endpoint
 * - `PROJECTS_API_KEY`: Your API key for authentication (kept secure server-side)
 * - `NEXT_PUBLIC_DISABLE_PROJECT_LOADING`: Set to 'true' to disable this feature
 *
 * The API proxy is located at: `/app/api/projects/route.ts`
 *
 * ## Expected API Response Format:
 * ```json
 * {
 *   "id": "123",
 *   "name": "My Project",
 *   "aspect_ratio": "16:9",
 *   "overlays": [
 *     { "id": 1, "type": "text", "content": "Hello", ... },
 *     { "id": 2, "type": "image", "src": "https://...", ... }
 *   ]
 * }
 * ```
 *
 * ## Usage Example:
 * ```typescript
 * // In your React component:
 * const { overlays, aspectRatio, isLoading, showModal, onConfirmLoad, onCancelLoad } = 
 *   useProjectStateFromUrl('projectId', 'MyProject');
 *
 * // Wait for loading before rendering:
 * if (isLoading) return <div>Loading project...</div>;
 *
 * // Navigate to editor with project state:
 * window.location.href = `/editor?projectId=11127c3f-9081-470f-a46e-c6063a3bfd90`;
 * ```
 *
 * @param paramName - Name of the URL parameter to read (e.g., 'projectId')
 * @param projectId - Project ID for autosave checking
 * @returns Object containing overlays, aspect ratio, loading state, and modal controls
 */
export function useProjectStateFromUrl(
  paramName: string = "projectId",
  projectId: string = "TestComponent"
): {
  overlays: Overlay[];
  aspectRatio: AspectRatio | null;
  backgroundColor: string | null;
  isLoading: boolean;
  showModal: boolean;
  onConfirmLoad: () => void;
  onCancelLoad: () => void;
} {
  const fallbackOverlays = DEFAULT_OVERLAYS;
  const [overlays, setOverlays] = useState<Overlay[]>(fallbackOverlays);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null);
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Store project data when we need user confirmation
  const pendingProjectDataRef = useRef<{ overlays: Overlay[]; aspectRatio?: AspectRatio; backgroundColor?: string } | null>(null);

  // Use ref to avoid adding fallbackOverlays to dependency array
  const fallbackOverlaysRef = useRef(fallbackOverlays);

  // Update ref when fallbackOverlays change
  useEffect(() => {
    fallbackOverlaysRef.current = fallbackOverlays;
  }, [fallbackOverlays]);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    // Check if project loading is disabled via environment variable
    const isDisabled =
      process.env.NEXT_PUBLIC_DISABLE_PROJECT_LOADING === "true";

    if (isDisabled) {
      console.log(
        "[useProjectStateFromUrl] Project loading is disabled via environment variable"
      );
      setOverlays(fallbackOverlaysRef.current);
      setIsLoading(false);
      return;
    }

    const loadProjectState = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const paramValue = searchParams.get(paramName);

        // No parameter in URL - use fallback
        if (!paramValue) {
          console.log(
            `[useProjectStateFromUrl] No '${paramName}' parameter found, using fallback overlays`
          );
          setOverlays(fallbackOverlaysRef.current);
          setIsLoading(false);
          return;
        }

        console.log(
          `[useProjectStateFromUrl] Fetching project state '${paramValue}' from API...`
        );

        // Fetch project state from API
        const response = await fetch(`/api/projects?id=${paramValue}`);

        if (!response.ok) {
          console.warn(
            `[useProjectStateFromUrl] API returned ${response.status} for parameter '${paramValue}'`
          );
          setOverlays(fallbackOverlaysRef.current);
          setIsLoading(false);
          return;
        }

        const projectData = await response.json();

        // Validate project structure
        if (!projectData.overlays || !Array.isArray(projectData.overlays)) {
          console.error(
            `[useProjectStateFromUrl] Project '${paramValue}' does not have a valid overlays array`,
            projectData
          );
          setOverlays(fallbackOverlaysRef.current);
          setIsLoading(false);
          return;
        }

        console.log(
          `[useProjectStateFromUrl] Successfully fetched ${projectData.overlays.length} overlays from project '${paramValue}'`
        );

        // Extract aspect ratio if provided (API uses snake_case, convert to camelCase)
        const projectAspectRatio: AspectRatio | undefined = projectData.aspect_ratio || projectData.aspectRatio;
        if (projectAspectRatio) {
          console.log(
            `[useProjectStateFromUrl] Project aspect ratio: ${projectAspectRatio}`
          );
        }

        // Extract background color if provided (API uses snake_case, convert to camelCase)
        const projectBackgroundColor: string | undefined = projectData.background_color ?? projectData.backgroundColor;
        if (projectBackgroundColor) {
          console.log(
            `[useProjectStateFromUrl] Project background color: ${projectBackgroundColor}`
          );
        }

        // Check if there's existing autosave data
        const hasExistingAutosave = await hasAutosave(projectId);

        if (hasExistingAutosave) {
          // Store project data and show modal for user decision
          console.log(
            "[useProjectStateFromUrl] Existing autosave found, showing confirmation modal"
          );
          pendingProjectDataRef.current = {
            overlays: projectData.overlays,
            aspectRatio: projectAspectRatio,
            backgroundColor: projectBackgroundColor
          };
          setShowModal(true);
          setIsLoading(false);
        } else {
          // No autosave conflict - load project directly
          console.log(
            "[useProjectStateFromUrl] No autosave conflict, loading project"
          );
          setOverlays(projectData.overlays);
          if (projectAspectRatio) {
            setAspectRatio(projectAspectRatio);
          }
          if (projectBackgroundColor) {
            setBackgroundColor(projectBackgroundColor);
          }
          setIsLoading(false);
        }
      } catch (error) {
        console.error(
          `[useProjectStateFromUrl] Failed to load project:`,
          error
        );
        setOverlays(fallbackOverlaysRef.current);
        setIsLoading(false);
      }
    };

    loadProjectState();
  }, [paramName, projectId]);

  // Handler for when user confirms they want to load the project
  const onConfirmLoad = async () => {
    if (pendingProjectDataRef.current) {
      console.log(
        "[useProjectStateFromUrl] User confirmed load, clearing autosave and loading project"
      );
      await clearAutosave(projectId);
      setOverlays(pendingProjectDataRef.current.overlays);
      if (pendingProjectDataRef.current.aspectRatio) {
        setAspectRatio(pendingProjectDataRef.current.aspectRatio);
      }
      if (pendingProjectDataRef.current.backgroundColor) {
        setBackgroundColor(pendingProjectDataRef.current.backgroundColor);
      }
      pendingProjectDataRef.current = null;
    }
    setShowModal(false);
  };

  // Handler for when user cancels and wants to keep their work
  const onCancelLoad = () => {
    console.log(
      "[useProjectStateFromUrl] User chose to keep existing work"
    );
    setOverlays(fallbackOverlaysRef.current);
    pendingProjectDataRef.current = null;
    setShowModal(false);
  };

  return {
    overlays,
    aspectRatio,
    backgroundColor,
    isLoading,
    showModal,
    onConfirmLoad,
    onCancelLoad,
  };
}
