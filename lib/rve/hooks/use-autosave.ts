import { useEffect, useRef, useState } from "react";
import {
  saveEditorState,
  loadEditorState
} from "../utils/general/indexdb-helper";

interface AutosaveOptions {
  /**
   * Interval in milliseconds between autosaves
   * @default 5000 (5 seconds)
   */
  interval?: number;

  /**
   * Function to call when an autosave is loaded
   */
  onLoad?: (data: any) => void;

  /**
   * Function to call when an autosave is saved
   */
  onSave?: () => void;

  /**
   * Whether a project is currently loading from URL
   * If true, autosave will wait before loading from IndexedDB
   */
  isLoadingProject?: boolean;
}

/**
 * Hook for automatically saving editor state to IndexedDB
 *
 * @param projectId Unique identifier for the project
 * @param state Current state to be saved
 * @param options Configuration options for autosave behavior
 * @returns Object with functions to manually save and load state
 */
export const useAutosave = (
  projectId: string,
  state: any,
  options: AutosaveOptions = {}
) => {
  const { interval = 5000, onLoad, onSave, isLoadingProject = false } = options;

  const timerRef = useRef<any | null>(null);
  const lastSavedStateRef = useRef<string>("");
  const [hasCheckedForAutosave, setHasCheckedForAutosave] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Automatically load saved state on mount, but only once and after project loading completes
  useEffect(() => {
    const autoLoadState = async () => {
      if (hasCheckedForAutosave) return;

      // Wait for project loading to complete before loading from IndexedDB
      // This ensures project overlays take precedence over saved state
      if (isLoadingProject) {
        console.log('[Autosave] Waiting for project to load before checking IndexedDB...');
        return;
      }

      try {
        console.log('[Autosave] Checking for saved state in IndexedDB...');
        const loadedState = await loadEditorState(projectId);
        
        if (loadedState && onLoad) {
          console.log('[Autosave] Restored saved state from IndexedDB');
          onLoad(loadedState);
        } else {
          console.log('[Autosave] No saved state found in IndexedDB');
        }
        setHasCheckedForAutosave(true);
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error('[Autosave] Failed to auto-load state:', error);
        // Always complete the load even if it fails to prevent infinite loading
        setHasCheckedForAutosave(true);
        setIsInitialLoadComplete(true);
      }
    };

    autoLoadState();
  }, [projectId, onLoad, hasCheckedForAutosave, isLoadingProject]);

  // Set up autosave timer
  useEffect(() => {
    // Don't start autosave if projectId is not valid
    if (!projectId) return;

    const saveIfChanged = async () => {
      const currentStateString = JSON.stringify(state);

      // Only save if state has changed since last save
      if (currentStateString !== lastSavedStateRef.current) {
        try {
          await saveEditorState(projectId, state);
          lastSavedStateRef.current = currentStateString;
          if (onSave) onSave();
        } catch (error) {
          console.error('[Autosave] Save failed:', error);
        }
      }
    };

    // Set up interval for autosave
    timerRef.current = setInterval(saveIfChanged, interval);

    // Clean up timer on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [projectId, state, interval, onSave]);

  // Function to manually save state
  const saveState = async () => {
    try {
      await saveEditorState(projectId, state);
      lastSavedStateRef.current = JSON.stringify(state);
      if (onSave) onSave();
      return true;
    } catch (error) {
      console.error('[Autosave] Manual save failed:', error);
      return false;
    }
  };

  // Function to manually load state
  const loadState = async () => {
    try {
      const loadedState = await loadEditorState(projectId);
      if (loadedState && onLoad) {
        onLoad(loadedState);
      }
      return loadedState;
    } catch (error) {
      console.error('[Autosave] Manual load failed:', error);
      return null;
    }
  };

  return {
    saveState,
    loadState,
    isInitialLoadComplete,
  };
};
