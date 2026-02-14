import { useState, useCallback, useRef } from 'react';
import { calculateMousePosition } from '../utils';

/**
 * Custom hook to handle timeline mouse interactions
 * Uses CSS custom properties for ghost marker positioning to avoid React re-renders
 */
export const useTimelineInteractions = (
  timelineRef: React.RefObject<HTMLDivElement>,
  zoomScale: number = 1
) => {
  // Keep only essential React state that actually needs to trigger re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  
  // Throttle mouse move updates to improve performance
  const throttleRef = useRef<number | null>(null);
  const lastPositionRef = useRef<number | null>(null);
  const isGhostMarkerVisibleRef = useRef<boolean>(false);

  // Handle mouse movement using CSS custom properties (no React re-renders!)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging && timelineRef.current) {
      // Cancel previous throttled call
      if (throttleRef.current) {
        cancelAnimationFrame(throttleRef.current);
      }
      
      // Capture event properties before requestAnimationFrame (React nullifies synthetic events)
      const clientX = e.clientX;
      
      // Throttle using requestAnimationFrame for smooth 60fps updates
      throttleRef.current = requestAnimationFrame(() => {
        const element = timelineRef.current;
        if (!element) return;
        
        // Use the SAME approach as timeline-markers.tsx for consistency!
        // Always use .timeline-markers-container as the reference element
        const container = document.querySelector('.timeline-markers-container') as HTMLElement;
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
        
        // Calculate zoom-aware threshold for smoother tracking at high zoom levels
        // At 1x zoom: 0.1% threshold, at 30x zoom: 0.003% threshold (30x more precise)
        const threshold = Math.max(0.001, 0.1 / zoomScale);
        
        // Only update if position has changed significantly
        if (lastPositionRef.current === null || Math.abs(position - lastPositionRef.current) > threshold) {
          // Update CSS custom property directly - NO REACT RE-RENDER!
          // Use higher precision for positioning at high zoom levels
          const precision = zoomScale > 10 ? 6 : zoomScale > 5 ? 4 : 2;
          
          // Find the root timeline container (parent of both tracks and overlay)
          // Navigate up: timelineRef -> tracks-scroll-container -> root
          const rootContainer = element.parentElement?.parentElement;
          if (rootContainer) {
            rootContainer.style.setProperty('--ghost-marker-position', `${position.toFixed(precision)}%`);
            rootContainer.style.setProperty('--ghost-marker-visible', '1');
          }
          
          lastPositionRef.current = position;
          isGhostMarkerVisibleRef.current = true;
        }
      });
    }
  }, [isDragging, timelineRef, zoomScale]);

  // Handle mouse leave to hide ghost marker
  const handleMouseLeave = useCallback(() => {
    // Cancel any pending throttled updates
    if (throttleRef.current) {
      cancelAnimationFrame(throttleRef.current);
      throttleRef.current = null;
    }
    
    // Hide ghost marker using CSS custom property - NO REACT RE-RENDER!
    if (timelineRef.current && isGhostMarkerVisibleRef.current) {
      // Find the root timeline container (parent of both tracks and overlay)
      const rootContainer = timelineRef.current.parentElement?.parentElement;
      if (rootContainer) {
        rootContainer.style.setProperty('--ghost-marker-visible', '0');
      }
      isGhostMarkerVisibleRef.current = false;
    }
    
    lastPositionRef.current = null;
  }, [timelineRef]);

  return {
    ghostMarkerPosition: null, // Legacy prop for backward compatibility - always null now
    isDragging,
    isContextMenuOpen,
    setIsDragging,
    setIsContextMenuOpen,
    handleMouseMove,
    handleMouseLeave,
  };
}; 