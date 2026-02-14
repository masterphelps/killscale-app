import React, { useState, useCallback, useEffect, useRef } from "react";
import { TimelineTrack } from "../types";

interface HistoryState {
  past: TimelineTrack[][];
  present: TimelineTrack[];
  future: TimelineTrack[][];
}

export function useTimelineHistory(
  tracks: TimelineTrack[],
  setTracks: (tracks: TimelineTrack[]) => void,
  onTracksChange?: (tracks: TimelineTrack[]) => void,
  updatePresentHistoryRef?: React.MutableRefObject<boolean>
) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: tracks,
    future: [],
  });

  // Track if we're in the middle of an undo/redo operation to prevent infinite loops
  const isUndoRedoOperation = useRef(false);
  
  // Track if this is the initial setup to ensure first change is captured
  const isInitialized = useRef(false);
  
  // Track if we've established the baseline state (when tracks are first populated)
  const hasEstablishedBaseline = useRef(false);

  // Aggressive batching state - batch ALL changes within time window
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const batchStartStateRef = useRef<TimelineTrack[] | null>(null);
  const lastChangeTimeRef = useRef<number>(0);
  
  // Batching configuration
  const BATCH_WINDOW_MS = 250; // Batch changes within 250ms
  const RAPID_CHANGE_THRESHOLD_MS = 50; // Consider changes within 50ms as "rapid"

  // Function to commit any pending batch
  const commitBatch = useCallback(() => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    
    if (batchStartStateRef.current) {
      // Only save if there was actually a change from the start of the batch
      if (JSON.stringify(batchStartStateRef.current) !== JSON.stringify(tracks)) {
        // Save the batch start state to history, with current tracks as present
        setHistory((prev) => ({
          past: [...prev.past, batchStartStateRef.current!],
          present: tracks,
          future: [], // Clear future when new action is performed
        }));
      }
      batchStartStateRef.current = null;
    }
  }, [tracks]);

  // Update history when tracks change (but not during undo/redo operations)
  useEffect(() => {
    if (isUndoRedoOperation.current) {
      isUndoRedoOperation.current = false;
      return;
    }

    // Skip the very first initialization
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }

    // Check if this is the first time tracks have meaningful content (baseline establishment)
    if (!hasEstablishedBaseline.current) {
      // Consider tracks meaningful if they have items or if there are multiple tracks
      const hasMeaningfulContent = tracks.some(track => track.items.length > 0) || tracks.length > 1;
      
      if (hasMeaningfulContent) {
        // This is our baseline state - update present but don't add to history
        hasEstablishedBaseline.current = true;
        setHistory((prev) => ({
          ...prev,
          present: tracks,
        }));
        return;
      } else {
        // Still waiting for meaningful content, don't record anything
        return;
      }
    }

    // Check if updatePresentHistoryRef is set
    const shouldUpdatePresentHistory = updatePresentHistoryRef?.current === true;
    
    // If updatePresentHistoryRef is set, just update present state without adding to history
    if (shouldUpdatePresentHistory) {
      console.log('Replacing current "present" state with new tracks since updatePresentHistoryRef is set');
      setHistory((prev) => ({
        ...prev,
        present: tracks,
      }));
      // Reset the flag after using it
      if (updatePresentHistoryRef) {
        updatePresentHistoryRef.current = false;
      }
      return;
    }

    const now = Date.now();
    const timeSinceLastChange = now - lastChangeTimeRef.current;
    lastChangeTimeRef.current = now;

    // Check if this is a rapid change (within threshold)
    const isRapidChange = timeSinceLastChange < RAPID_CHANGE_THRESHOLD_MS;

    if (isRapidChange || batchTimeoutRef.current) {
      // We're in rapid change mode or already batching
      
      // If this is the first change in a batch, save the starting state
      if (!batchStartStateRef.current) {
        setHistory((prev) => {
          batchStartStateRef.current = prev.present;
          // Just update present state, don't add to history yet
          return {
            ...prev,
            present: tracks,
          };
        });
      } else {
        // Just update present state during batching
        setHistory((prev) => ({
          ...prev,
          present: tracks,
        }));
      }

      // Clear existing timeout and set new one
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }

      // Set timeout to commit batch after inactivity
      batchTimeoutRef.current = setTimeout(() => {
        commitBatch();
      }, BATCH_WINDOW_MS);

    } else {
      // This is a standalone change - commit any existing batch first, then save this change
      if (batchStartStateRef.current) {
        commitBatch();
        // After committing batch, we need to save this new change as well
        // But we need to wait for the batch commit to complete first
        setTimeout(() => {
          setHistory((prev) => ({
            past: [...prev.past, prev.present],
            present: tracks,
            future: [], // Clear future when new action is performed
          }));
        }, 0);
      } else {
        // No batch pending, save this change immediately
        setHistory((prev) => ({
          past: [...prev.past, prev.present],
          present: tracks,
          future: [], // Clear future when new action is performed
        }));
      }
    }
  }, [tracks, commitBatch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);

  const undo = useCallback(() => {
    // Commit any pending batch before undo
    if (batchStartStateRef.current) {
      commitBatch();
    }

    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];

      // Mark that we're performing an undo operation
      isUndoRedoOperation.current = true;

      // Update tracks directly
      setTracks(newPresent);
      onTracksChange?.(newPresent);

      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, [setTracks, onTracksChange, commitBatch]);

  const redo = useCallback(() => {
    // Commit any pending batch before redo
    if (batchStartStateRef.current) {
      commitBatch();
    }

    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = prev.future.slice(1);
      const newPresent = prev.future[0];

      // Mark that we're performing a redo operation
      isUndoRedoOperation.current = true;

      // Update tracks directly
      setTracks(newPresent);
      onTracksChange?.(newPresent);

      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, [setTracks, onTracksChange, commitBatch]);

  const clearHistory = useCallback(() => {
    // Clear any pending batch
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    batchStartStateRef.current = null;

    setHistory({
      past: [],
      present: tracks,
      future: [],
    });
    isInitialized.current = false; // Reset initialization flag
    hasEstablishedBaseline.current = false; // Reset baseline flag
  }, [tracks]);

  return {
    undo,
    redo,
    clearHistory,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
} 