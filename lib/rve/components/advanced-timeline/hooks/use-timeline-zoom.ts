import { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react";
import { ZOOM_CONSTRAINTS } from "../constants";
import { calculateViewportDuration } from "../utils";

export type ZoomState = {
  scale: number;
  scroll: number;
};

/**
 * A custom hook that manages zoom and scroll behavior for a timeline component.
 * Handles both programmatic and wheel-based zooming while maintaining the zoom point
 * relative to the cursor position.
 *
 * @param timelineRef - Reference to the timeline element
 * @returns {Object} An object containing:
 *   - zoomScale: Current zoom level
 *   - scrollPosition: Current scroll position
 *   - setZoomScale: Function to directly set zoom level
 *   - setScrollPosition: Function to directly set scroll position
 *   - handleZoom: Function to handle programmatic zooming
 *   - handleWheelZoom: Event handler for wheel-based zooming
 */
export const useTimelineZoom = (
  timelineRef: React.RefObject<HTMLDivElement | null>,
  currentFrame?: number,
  fps?: number,
  totalDuration?: number
) => {
  const [zoomState, setZoomState] = useState<ZoomState>({
    scale: ZOOM_CONSTRAINTS.default,
    scroll: 0,
  });

  // Track slider drag state to prevent calculation errors during rapid changes
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const sliderDragInitialState = useRef<{
    playheadScreenX: number;
    initialScale: number;
    scrollLeft: number;
    viewportWidth: number;
  } | null>(null);
  
  // Use ref to track the actual current zoom scale to prevent stale state during rapid updates
  const currentScaleRef = useRef<number>(zoomState.scale);
  
  // Track pending scroll that needs to be applied after layout
  const pendingScrollRef = useRef<number | null>(null);

  const calculateNewZoom = useCallback(
    (prevZoom: number, delta: number): number => {
      // Tiered zoom steps based on current zoom level
      let stepMultiplier = 1;
      
      if (prevZoom <= 3) {
        // 0-300%: Normal step (good for fine control)
        stepMultiplier = 1;
      } else if (prevZoom <= 10) {
        // 300-1000%: 2x step
        stepMultiplier = 2;
      } else if (prevZoom <= 20) {
        // 1000-2000%: 4x step
        stepMultiplier = 4;
      } else {
        // 2000%+: 6x step (for very high zoom levels)
        stepMultiplier = 6;
      }
      
      const tieredStep = delta * ZOOM_CONSTRAINTS.step * stepMultiplier;
      
      return Math.min(
        ZOOM_CONSTRAINTS.max,
        Math.max(ZOOM_CONSTRAINTS.min, prevZoom + tieredStep)
      );
    },
    []
  );

  const handleZoom = useCallback(
    (delta: number, clientX?: number) => {
      const scrollContainer = timelineRef?.current?.parentElement;
      if (!scrollContainer) {
        console.warn('No scroll container found for zoom operation');
        return;
      }

      const newZoom = calculateNewZoom(zoomState.scale, delta);
      if (newZoom === zoomState.scale) return;

      // Ensure the timeline is properly measured
      const rect = scrollContainer.getBoundingClientRect();
      if (rect.width === 0) {
        console.warn('Scroll container has zero width, deferring zoom');
        // Defer the zoom operation to next frame when layout is complete
        requestAnimationFrame(() => {
          handleZoom(delta, clientX);
        });
        return;
      }

      let zoomCenterX: number;

      if (clientX !== undefined) {
        // Mouse-based zoom (CMD+Scroll) - use mouse position
        zoomCenterX = clientX;
      } else {
        // Button/slider zoom - use playhead position as zoom center
        if (currentFrame !== undefined && fps && totalDuration) {
          const currentTimeInSeconds = currentFrame / fps;
          
          // Get the actual timeline element and scroll container
          const timelineElement = timelineRef?.current;
          
          if (timelineElement) {
            // Check if timeline element is properly initialized
            const timelineRect = timelineElement.getBoundingClientRect();
            
            
            if (timelineRect.width === 0) {
              console.warn('Timeline element has zero width, using viewport center');
              zoomCenterX = rect.left + rect.width / 2;
            } else {
              // Calculate viewport duration based on current zoom
              // This matches how the timeline actually renders
              const compositionDuration = totalDuration; // Assuming totalDuration is compositionDuration
              const viewportDuration = calculateViewportDuration(compositionDuration, zoomState.scale);
              
              // Calculate the playhead position as a percentage of viewport duration
              // This matches how TimelineMarker calculates its position
              const playheadPercentage = (currentTimeInSeconds / viewportDuration) * 100;
              
              // Get the current width of the timeline element
              const timelineWidth = timelineElement.offsetWidth;
              
              // Calculate where the playhead is in the timeline
              const playheadPositionInTimeline = (playheadPercentage / 100) * timelineWidth;
              
              // Get the playhead's position in the viewport
              const playheadInViewport = playheadPositionInTimeline - scrollContainer.scrollLeft;
              
              // Set zoom center to maintain playhead position in viewport
              zoomCenterX = rect.left + playheadInViewport;
            }
          } else {
            console.warn('No timeline element found, using viewport center');
            // Fallback to center of viewport
            zoomCenterX = rect.left + rect.width / 2;
          }
        } else {
          console.warn('Missing required values for playhead zoom, using viewport center', {
            currentFrame,
            fps,
            totalDuration
          });
          // Fallback to center of viewport if no playhead info
          zoomCenterX = rect.left + rect.width / 2;
        }
      }

      const relativeX = zoomCenterX - rect.left + scrollContainer.scrollLeft;
      const zoomFactor = newZoom / zoomState.scale;
      const newScroll = relativeX * zoomFactor - (zoomCenterX - rect.left);

      // Apply scroll immediately - no requestAnimationFrame delay
      scrollContainer.scrollLeft = newScroll;

      setZoomState({ scale: newZoom, scroll: newScroll });
      
      // On first load, the timeline might not have updated its width yet
      // If we detect this scenario, recalculate scroll position after layout
      if (scrollContainer.scrollWidth <= scrollContainer.clientWidth && newZoom > 1) {
        
        // Store the values we need for recalculation
        const savedZoomCenterX = zoomCenterX;
        const savedRect = rect;
        const savedRelativeX = relativeX;
        const savedZoomFactor = zoomFactor;
        
        requestAnimationFrame(() => {
          // Check if timeline has now expanded
          if (scrollContainer.scrollWidth > scrollContainer.clientWidth) {
            // Recalculate scroll with the saved zoom center
            const recalculatedScroll = savedRelativeX * savedZoomFactor - (savedZoomCenterX - savedRect.left);
            
            scrollContainer.scrollLeft = Math.max(0, Math.min(recalculatedScroll, scrollContainer.scrollWidth - scrollContainer.clientWidth));
          }
        });
      }
    },
    [timelineRef, zoomState.scale, calculateNewZoom, currentFrame, fps, totalDuration]
  );

  const setZoomScale = useCallback(
    (newScale: number, isDragging?: boolean) => {
      const scrollContainer = timelineRef?.current?.parentElement;
      if (!scrollContainer) return;

      // Clamp the new scale to valid range
      const clampedScale = Math.min(ZOOM_CONSTRAINTS.max, Math.max(ZOOM_CONSTRAINTS.min, newScale));
      if (clampedScale === currentScaleRef.current) return;

      // For slider dragging, use optimized calculation to prevent jumping
      if (isDragging && currentFrame !== undefined && fps && totalDuration) {
        const rect = scrollContainer.getBoundingClientRect();
        const currentTimeInSeconds = currentFrame / fps;

        // Initialize drag state on first drag call
        if (!sliderDragInitialState.current) {
          const currentViewportDuration = calculateViewportDuration(totalDuration, currentScaleRef.current);
          const timelineWidth = timelineRef.current?.offsetWidth || rect.width;
          const playheadPercentage = (currentTimeInSeconds / currentViewportDuration) * 100;
          const playheadPositionInTimeline = (playheadPercentage / 100) * timelineWidth;
          const playheadScreenX = playheadPositionInTimeline - scrollContainer.scrollLeft;

          sliderDragInitialState.current = {
            playheadScreenX,
            initialScale: currentScaleRef.current,
            scrollLeft: scrollContainer.scrollLeft,
            viewportWidth: rect.width
          };
        }

        // Calculate new scroll position to maintain playhead at same screen position
        const newViewportDuration = calculateViewportDuration(totalDuration, clampedScale);
        const playheadPercentageInNewZoom = (currentTimeInSeconds / newViewportDuration) * 100;
        
        // CRITICAL: Use currentScaleRef to prevent stale state during rapid slider updates
        const scaleRatio = clampedScale / currentScaleRef.current;
        const oldTimelineWidth = timelineRef.current?.offsetWidth || rect.width;
        const newTimelineWidth = oldTimelineWidth * scaleRatio;
        
        // Calculate playhead position in new timeline
        const playheadPositionInNewTimeline = (playheadPercentageInNewZoom / 100) * newTimelineWidth;
        
        // Calculate scroll to maintain playhead at same screen X position
        const targetScreenX = sliderDragInitialState.current.playheadScreenX;
        const newScrollLeft = playheadPositionInNewTimeline - targetScreenX;

        // CRITICAL FIX: Queue scroll for application after layout
        // Don't apply scroll immediately - browser will clamp it based on OLD scrollWidth!
        // We need to wait for React to update the timeline width first.
        pendingScrollRef.current = Math.max(0, newScrollLeft);
        
        // Update ref BEFORE state to ensure next rapid call uses correct value
        currentScaleRef.current = clampedScale;
        setZoomState({ scale: clampedScale, scroll: newScrollLeft });
      } else {
        // For non-dragging (button clicks), use the existing handleZoom logic
        const delta = clampedScale - currentScaleRef.current;
        currentScaleRef.current = clampedScale;
        handleZoom(delta, undefined);
      }
    },
    [handleZoom, currentFrame, fps, totalDuration, timelineRef]
  );
  
  // Keep ref in sync with state (for cases where state is updated elsewhere)
  useEffect(() => {
    currentScaleRef.current = zoomState.scale;
  }, [zoomState.scale]);
  
  // Apply pending scroll after React has updated the layout (after timeline width changes)
  // This prevents browser scroll clamping based on old scrollWidth
  useLayoutEffect(() => {
    if (pendingScrollRef.current !== null) {
      const scrollContainer = timelineRef?.current?.parentElement;
      if (scrollContainer) {
        scrollContainer.scrollLeft = pendingScrollRef.current;
      }
      pendingScrollRef.current = null;
    }
  }, [zoomState.scale, timelineRef]);

  const handleZoomToPlayhead = useCallback(
    (newScale: number) => {
      const scrollContainer = timelineRef?.current?.parentElement;
      if (!scrollContainer || currentFrame === undefined || !fps || !totalDuration) {
        // Fallback to simple zoom if we don't have playhead info
        setZoomState({ ...zoomState, scale: newScale });
        return;
      }

      if (newScale === zoomState.scale) return;
      
      // Calculate playhead position as percentage of timeline content
      const currentTimeInSeconds = currentFrame / fps;
      const compositionDuration = totalDuration; 
      const viewportDuration = calculateViewportDuration(compositionDuration, zoomState.scale);
      const playheadPercentage = (currentTimeInSeconds / viewportDuration) * 100;
      
      // Convert percentage to pixel position in current timeline width
      const timelineWidth = scrollContainer.scrollWidth;
      const playheadPositionInTimeline = (playheadPercentage / 100) * timelineWidth;
      
      // Use the same zoom calculation as handleZoom but with playhead position
      const zoomFactor = newScale / zoomState.scale;
      const playheadScreenPosition = playheadPositionInTimeline - scrollContainer.scrollLeft;
      const newScroll = playheadPositionInTimeline * zoomFactor - playheadScreenPosition;

      // Apply scroll immediately
      scrollContainer.scrollLeft = Math.max(0, newScroll);

      setZoomState({ scale: newScale, scroll: newScroll });
    },
    [timelineRef, currentFrame, fps, totalDuration, zoomState]
  );

  const handleWheelZoom = useCallback(
    (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // Use a base wheel step that will be made dynamic in calculateNewZoom
        const delta = -Math.sign(event.deltaY) * ZOOM_CONSTRAINTS.wheelStep;
        handleZoom(delta, event.clientX); // Pass mouse position for wheel zoom
      }
    },
    [handleZoom]
  );

  const resetZoom = useCallback(() => {
    const scrollContainer = timelineRef?.current?.parentElement;
    if (scrollContainer) {
      // Reset scroll position to beginning
      scrollContainer.scrollLeft = 0;
    }
    
    // Reset zoom scale to default and scroll to 0
    setZoomState({ 
      scale: ZOOM_CONSTRAINTS.default, 
      scroll: 0 
    });
  }, [timelineRef, zoomState.scale]);

  // Functions to manage slider drag state
  const startSliderDrag = useCallback(() => {
    setIsSliderDragging(true);
  }, []);

  const endSliderDrag = useCallback(() => {
    setIsSliderDragging(false);
    sliderDragInitialState.current = null;
  }, []);

  return {
    zoomScale: zoomState.scale,
    scrollPosition: zoomState.scroll,
    setZoomScale: setZoomScale,
    setZoomScaleToPlayhead: handleZoomToPlayhead,
    setScrollPosition: (newScroll: number) =>
      setZoomState({ ...zoomState, scroll: newScroll }),
    handleZoom,
    handleWheelZoom,
    resetZoom,
    startSliderDrag,
    endSliderDrag,
    isSliderDragging,
  };
}; 