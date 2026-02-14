import { useState, useCallback, useEffect } from "react";
import { Overlay, OverlayType, CaptionStyles, CaptionOverlay } from "../types";
import { defaultCaptionStyles } from "../components/overlay/captions/caption-settings";

/**
 * Hook to manage overlay elements in the editor
 * Overlays can be text, videos, or sounds that are positioned on the timeline
 * @param initialOverlays - Default overlays to initialize with
 * @param waitForAutosave - If true, wait for autosave check before using initialOverlays
 * @returns Object containing overlay state and management functions
 */
export const useOverlays = (initialOverlays?: Overlay[], waitForAutosave?: boolean) => {
  // Initialize with provided overlays or default overlays (unless waiting for autosave)
  const [overlays, setOverlays] = useState<Overlay[]>(
    waitForAutosave ? [] : (initialOverlays || [])
  );
  
  // Track if we've applied initial overlays when waitForAutosave is true
  const [hasAppliedInitial, setHasAppliedInitial] = useState(!waitForAutosave);

  // Tracks which overlay is currently selected for editing
  const [selectedOverlayId, setSelectedOverlayId] = useState<number | null>(
    null
  );

  // Multi-select support: tracks which overlays are currently selected
  const [selectedOverlayIds, setSelectedOverlayIds] = useState<number[]>([]);

  // Keep single selection and multiselect in sync for backward compatibility
  useEffect(() => {
    if (selectedOverlayId !== null && !selectedOverlayIds.includes(selectedOverlayId)) {
      setSelectedOverlayIds([selectedOverlayId]);
    } else if (selectedOverlayId === null && selectedOverlayIds.length > 0) {
      setSelectedOverlayIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOverlayId]); // Intentionally omit selectedOverlayIds to avoid infinite loop

  // Update single selection when multiselect changes (use first selected item)
  useEffect(() => {
    if (selectedOverlayIds.length === 1 && selectedOverlayIds[0] !== selectedOverlayId) {
      setSelectedOverlayId(selectedOverlayIds[0]);
    } else if (selectedOverlayIds.length === 0 && selectedOverlayId !== null) {
      setSelectedOverlayId(null);
    } else if (selectedOverlayIds.length > 1 && selectedOverlayId !== selectedOverlayIds[0]) {
      setSelectedOverlayId(selectedOverlayIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOverlayIds]); // Intentionally omit selectedOverlayId to avoid infinite loop

  /**
   * Updates properties of a specific overlay
   * Supports both direct property updates and functional updates
   * @example
   * // Direct update
   * changeOverlay(1, { width: 100 })
   * // Functional update
   * changeOverlay(1, (overlay) => ({ ...overlay, width: overlay.width + 10 }))
   */
  const changeOverlay = useCallback(
    (
      overlayId: number,
      updater: Partial<Overlay> | ((overlay: Overlay) => Overlay)
    ) => {
      setOverlays((prevOverlays) =>
        prevOverlays.map((overlay) => {
          if (overlay.id !== overlayId) return overlay;
          return typeof updater === "function"
            ? updater(overlay)
            : ({ ...overlay, ...updater } as Overlay);
        })
      );
    },
    []
  );

  /**
   * Adds a new overlay to the editor
   * Automatically generates a new unique ID and appends it to the overlays array
   * Deselects any currently selected overlay
   */
  const addOverlay = useCallback((newOverlay: Omit<Overlay, "id">) => {
    let newId: number;
    setOverlays((prevOverlays) => {
      newId =
        prevOverlays.length > 0
          ? Math.max(...prevOverlays.map((o) => o.id)) + 1
          : 0;
      const overlayWithNewId = { ...newOverlay, id: newId } as Overlay;
      return [...prevOverlays, overlayWithNewId];
    });
    setSelectedOverlayId(newId!);
  }, []);

  /**
   * Removes an overlay by its ID and clears the selection
   */
  const deleteOverlay = useCallback((id: number) => {
    setOverlays((prevOverlays) =>
      prevOverlays.filter((overlay) => overlay.id !== id)
    );
    setSelectedOverlayId(null);
    setSelectedOverlayIds((prevIds) => prevIds.filter((prevId) => prevId !== id));
  }, []);

  /**
   * Removes all overlays on a specified row
   * @param row The row number to clear
   */
  const deleteOverlaysByRow = useCallback((row: number) => {
    setOverlays((prevOverlays) =>
      prevOverlays.filter((overlay) => overlay.row !== row)
    );
    setSelectedOverlayId(null);
  }, []);

  /**
   * Creates a copy of an existing overlay
   * The duplicated overlay is positioned immediately after the original in the timeline
   */
  const duplicateOverlay = useCallback((id: number) => {
    setOverlays((prevOverlays) => {
      const overlayToDuplicate = prevOverlays.find(
        (overlay) => overlay.id === id
      );
      if (!overlayToDuplicate) return prevOverlays;

      const newId = Math.max(...prevOverlays.map((o) => o.id)) + 1;

      // Find any overlays that would overlap with the duplicated position
      const overlaysInRow = prevOverlays.filter(
        (o) => o.row === overlayToDuplicate.row && o.id !== id
      );

      // Calculate initial position for duplicate
      let newFrom =
        overlayToDuplicate.from + overlayToDuplicate.durationInFrames;

      // Check for overlaps and adjust position if needed
      let hasOverlap = true;
      while (hasOverlap) {
        hasOverlap = overlaysInRow.some((existingOverlay) => {
          const duplicateEnd = newFrom + overlayToDuplicate.durationInFrames;
          const existingEnd =
            existingOverlay.from + existingOverlay.durationInFrames;

          // Check for any overlap
          return (
            (newFrom >= existingOverlay.from && newFrom < existingEnd) ||
            (duplicateEnd > existingOverlay.from &&
              duplicateEnd <= existingEnd) ||
            (newFrom <= existingOverlay.from && duplicateEnd >= existingEnd)
          );
        });

        if (hasOverlap) {
          // If there's an overlap, try positioning after the last overlay in the row
          const lastOverlay = [...overlaysInRow].sort(
            (a, b) =>
              b.from + b.durationInFrames - (a.from + a.durationInFrames)
          )[0];
          newFrom = lastOverlay
            ? lastOverlay.from + lastOverlay.durationInFrames + 1
            : newFrom + 1;
        }
      }

      const duplicatedOverlay: Overlay = {
        ...overlayToDuplicate,
        id: newId,
        from: newFrom,
      };

      return [...prevOverlays, duplicatedOverlay];
    });
  }, []);

  /**
   * Splits an overlay into two separate overlays at a specified frame
   * Useful for creating cuts or transitions in video/audio content
   * @example
   * // Split an overlay at frame 100
   * splitOverlay(1, 100)
   */
  const splitOverlay = useCallback((id: number, splitFrame: number) => {
    const fps = 30; // Make this configurable
    const msPerFrame = 1000 / fps;

    setOverlays((prevOverlays) => {
      const overlayToSplit = prevOverlays.find((overlay) => overlay.id === id);
      if (!overlayToSplit) {
        console.log("Overlay not found:", id);
        return prevOverlays;
      }

      console.log(`=== Starting ${overlayToSplit.type} Split Operation ===`);
      console.log(`Split requested at frame ${splitFrame} (${splitFrame * msPerFrame}ms)`);
      console.log("Original overlay:", overlayToSplit);

      // Validate split point
      if (
        splitFrame <= overlayToSplit.from ||
        splitFrame >= overlayToSplit.from + overlayToSplit.durationInFrames
      ) {
        console.warn("Invalid split point");
        return prevOverlays;
      }

      const firstPartDuration = splitFrame - overlayToSplit.from;
      const secondPartDuration =
        overlayToSplit.durationInFrames - firstPartDuration;
      const newId = Math.max(...prevOverlays.map((o) => o.id)) + 1;

      // Calculate start times for media overlays
      const secondHalfStartTime = calculateSecondHalfStartTime(
        overlayToSplit,
        firstPartDuration
      );

      // Create split overlays
      const [firstHalf, secondHalf] = createSplitOverlays(
        overlayToSplit,
        newId,
        splitFrame,
        firstPartDuration,
        secondPartDuration,
        secondHalfStartTime
      );

      console.log("Split results:", { firstHalf, secondHalf });

      return prevOverlays
        .map((overlay) => (overlay.id === id ? firstHalf : overlay))
        .concat(secondHalf);
    });
  }, []);

  const updateOverlayStyles = useCallback(
    (overlayId: number, styles: Partial<CaptionStyles>) => {
      changeOverlay(overlayId, (overlay) => {
        if (overlay.type !== OverlayType.CAPTION) return overlay;
        return {
          ...overlay,
          styles: {
            ...(overlay.styles || defaultCaptionStyles),
            ...styles,
          },
        };
      });
    },
    [changeOverlay]
  );

  const resetOverlays = useCallback(() => {
    setOverlays([]);
    setSelectedOverlayId(null);
    setSelectedOverlayIds([]);
  }, []);

  /**
   * Handler for overlay changes - wrapper around changeOverlay
   * Used specifically for timeline operations and drag/drop
   */
  const handleOverlayChange = useCallback((updatedOverlay: Overlay) => {
    changeOverlay(updatedOverlay.id, () => updatedOverlay);
  }, [changeOverlay]);

  /**
   * Apply initial overlays if we're waiting for autosave and no saved state was loaded
   */
  const applyInitialOverlaysIfNeeded = useCallback((savedStateExists: boolean) => {
    if (waitForAutosave && !hasAppliedInitial) {
      if (!savedStateExists && initialOverlays) {
        setOverlays(initialOverlays);
      }
      setHasAppliedInitial(true);
    }
  }, [waitForAutosave, hasAppliedInitial, initialOverlays]);

  return {
    overlays,
    selectedOverlayId,
    setSelectedOverlayId,
    // Multi-select support
    selectedOverlayIds,
    setSelectedOverlayIds,
    setOverlays,
    changeOverlay,
    addOverlay,
    deleteOverlay,
    deleteOverlaysByRow,
    duplicateOverlay,
    splitOverlay,
    updateOverlayStyles,
    resetOverlays,
    handleOverlayChange, // Add the missing function
    applyInitialOverlaysIfNeeded, // Add this new function
  };
};

/**
 * Calculates the starting time for the second half of a split media overlay
 * For clips and sounds, we need to adjust their internal start times
 * to maintain continuity after the split
 */
const calculateSecondHalfStartTime = (
  overlay: Overlay,
  firstPartDurationInFrames: number
): number => {
  // Convert frames to seconds (assuming 30 FPS)
  const firstPartDurationInSeconds = firstPartDurationInFrames / 30;
  
  if (overlay.type === OverlayType.VIDEO) {
    return (overlay.videoStartTime || 0) + firstPartDurationInSeconds;
  }
  if (overlay.type === OverlayType.SOUND) {
    return (overlay.startFromSound || 0) + firstPartDurationInSeconds;
  }
  return 0;
};

/**
 * Creates two new overlay objects from an original overlay when splitting
 * The first half maintains the original ID and timing
 * The second half gets a new ID and adjusted timing properties
 * Preserves all other properties from the original overlay
 */
const createSplitOverlays = (
  original: Overlay,
  newId: number,
  splitFrame: number,
  firstPartDuration: number,
  secondPartDuration: number,
  secondHalfStartTime: number
): [Overlay, Overlay] => {
  const fps = 30;
  const msPerFrame = 1000 / fps;
  const splitTimeMs = splitFrame * msPerFrame;

  if (original.type === OverlayType.CAPTION) {
    // Calculate absolute time ranges for both splits
    const originalStartMs = original.from * msPerFrame;
    const splitOffsetMs = splitTimeMs - originalStartMs; // Time relative to overlay start

    console.log("🎯 Split Timing Calculations:", {
      originalStartMs,
      splitTimeMs,
      splitOffsetMs,
      originalCaptions: original.captions.map((c) => ({
        text: c.text,
        startMs: c.startMs,
        endMs: c.endMs,
      })),
    });

    // Split captions at word level, keeping timestamps relative to their overlay
    const firstHalfCaptions = original.captions
      .filter((caption) => caption.startMs < splitOffsetMs)
      .map((caption) => ({
        ...caption,
        endMs: Math.min(caption.endMs, splitOffsetMs),
        words: caption.words
          .filter((word) => word.startMs < splitOffsetMs)
          .map((word) => ({
            ...word,
            endMs: Math.min(word.endMs, splitOffsetMs),
          })),
      }))
      .filter((caption) => caption.words.length > 0)
      .map((caption) => ({
        ...caption,
        text: caption.words.map((w) => w.word).join(" "),
      }));

    const secondHalfCaptions = original.captions
      .filter((caption) => caption.endMs > splitOffsetMs)
      .map((caption) => ({
        ...caption,
        startMs: Math.max(0, caption.startMs - splitOffsetMs),
        endMs: caption.endMs - splitOffsetMs,
        words: caption.words
          .filter((word) => word.endMs > splitOffsetMs)
          .map((word) => ({
            ...word,
            startMs: Math.max(0, word.startMs - splitOffsetMs),
            endMs: word.endMs - splitOffsetMs,
          })),
      }))
      .filter((caption) => caption.words.length > 0)
      .map((caption) => ({
        ...caption,
        text: caption.words.map((w) => w.word).join(" "),
      }));

    console.log("📑 Split Results:", {
      firstHalf: {
        captionCount: firstHalfCaptions.length,
        captions: firstHalfCaptions.map((c) => ({
          text: c.text,
          startMs: c.startMs,
          endMs: c.endMs,
          wordCount: c.words.length,
        })),
      },
      secondHalf: {
        captionCount: secondHalfCaptions.length,
        captions: secondHalfCaptions.map((c) => ({
          text: c.text,
          startMs: c.startMs,
          endMs: c.endMs,
          wordCount: c.words.length,
        })),
      },
    });

    // Create the split overlays with adjusted captions
    const firstHalf: CaptionOverlay = {
      ...original,
      durationInFrames: firstPartDuration,
      captions: firstHalfCaptions,
    };

    const secondHalf: CaptionOverlay = {
      ...original,
      id: newId,
      from: splitFrame,
      durationInFrames: secondPartDuration,
      captions: secondHalfCaptions,
    };

    return [firstHalf, secondHalf];
  }

  // Helper function to split waveform data for audio overlays
  const splitWaveformData = (originalWaveformData: any, firstDuration: number, secondDuration: number, totalDuration: number) => {
    if (!originalWaveformData?.peaks?.length) {
      return [null, null];
    }

    const totalPeaks = originalWaveformData.peaks.length;
    const firstPeakCount = Math.floor((firstDuration / totalDuration) * totalPeaks);

    const firstHalfPeaks = originalWaveformData.peaks.slice(0, firstPeakCount);
    const secondHalfPeaks = originalWaveformData.peaks.slice(firstPeakCount);

    return [
      {
        peaks: firstHalfPeaks,
        length: Math.floor((originalWaveformData.length || 0) * (firstDuration / totalDuration))
      },
      {
        peaks: secondHalfPeaks,
        length: Math.floor((originalWaveformData.length || 0) * (secondDuration / totalDuration))
      }
    ];
  };

  // For audio overlays, try to preserve and split waveform data
  let firstHalfWaveformData = null;
  let secondHalfWaveformData = null;

  if (original.type === OverlayType.SOUND && (original as any).waveformData) {
    const totalDurationSeconds = original.durationInFrames / fps;
    const firstDurationSeconds = firstPartDuration / fps;
    const secondDurationSeconds = secondPartDuration / fps;

    [firstHalfWaveformData, secondHalfWaveformData] = splitWaveformData(
      (original as any).waveformData,
      firstDurationSeconds,
      secondDurationSeconds,
      totalDurationSeconds
    );
  }

  const firstHalf: Overlay = {
    ...original,
    durationInFrames: firstPartDuration,
    // Preserve split waveform data for audio overlays
    ...(original.type === OverlayType.SOUND && firstHalfWaveformData && {
      waveformData: firstHalfWaveformData,
    }),
  };

  const secondHalf: Overlay = {
    ...original,
    id: newId,
    from: splitFrame,
    durationInFrames: secondPartDuration,
    ...(original.type === OverlayType.VIDEO && {
      videoStartTime: secondHalfStartTime,
    }),
    ...(original.type === OverlayType.SOUND && {
      startFromSound: secondHalfStartTime,
      // Preserve split waveform data for audio overlays
      ...(secondHalfWaveformData && { waveformData: secondHalfWaveformData }),
    }),
  };

  return [firstHalf, secondHalf];
};
