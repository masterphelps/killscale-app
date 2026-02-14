import React, { useEffect, useRef } from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineHorizontalGutterProps {
  zoomScale: number;
  totalDuration: number;
}

export const TimelineHorizontalGutter: React.FC<TimelineHorizontalGutterProps> = ({
  zoomScale,
}) => {
  const scrollProxyRef = useRef<HTMLDivElement>(null);
  
  // Synchronize horizontal scroll between the proxy scrollbar and the timeline content
  useEffect(() => {
    const markersScrollContainer = document.querySelector('.timeline-markers-wrapper') as HTMLElement;
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
    const scrollProxy = scrollProxyRef.current;
    
    if (!markersScrollContainer || !tracksScrollContainer || !scrollProxy) return;

    let lastProxyScrollLeft = scrollProxy.scrollLeft;
    let lastContentScrollLeft = markersScrollContainer.scrollLeft;

    // When proxy scrollbar scrolls, update both markers and tracks
    const handleProxyScroll = () => {
      const currentScrollLeft = scrollProxy.scrollLeft;
      
      // Check if this is actually a change from the proxy (not triggered by content sync)
      if (Math.abs(currentScrollLeft - lastProxyScrollLeft) < 0.5) {
        return;
      }
      
      lastProxyScrollLeft = currentScrollLeft;
      
      // Calculate the scroll ratio to handle any differences in scrollable width
      const proxyMaxScroll = scrollProxy.scrollWidth - scrollProxy.clientWidth;
      
      // Safety check: if no scrollable area, set to 0
      if (proxyMaxScroll <= 0) {
        markersScrollContainer.scrollLeft = 0;
        tracksScrollContainer.scrollLeft = 0;
        return;
      }
      
      const proxyScrollRatio = Math.max(0, Math.min(1, currentScrollLeft / proxyMaxScroll));
      const contentMaxScroll = markersScrollContainer.scrollWidth - markersScrollContainer.clientWidth;
      const targetScrollLeft = Math.round(proxyScrollRatio * contentMaxScroll);
      
      // Update content scroll positions
      lastContentScrollLeft = targetScrollLeft;
      markersScrollContainer.scrollLeft = targetScrollLeft;
      tracksScrollContainer.scrollLeft = targetScrollLeft;
    };

    // When content scrolls (either markers or tracks), update proxy
    const handleContentScroll = () => {
      const currentScrollLeft = tracksScrollContainer.scrollLeft || markersScrollContainer.scrollLeft;
      
      // Check if this is actually a change from the content (not triggered by proxy sync)
      if (Math.abs(currentScrollLeft - lastContentScrollLeft) < 0.5) {
        return;
      }
      
      lastContentScrollLeft = currentScrollLeft;
      
      // Calculate the scroll ratio from content
      const contentMaxScroll = markersScrollContainer.scrollWidth - markersScrollContainer.clientWidth;
      
      // Safety check: if no scrollable area, set to 0
      if (contentMaxScroll <= 0) {
        scrollProxy.scrollLeft = 0;
        return;
      }
      
      const contentScrollRatio = Math.max(0, Math.min(1, currentScrollLeft / contentMaxScroll));
      
      // Apply ratio to proxy
      const proxyMaxScroll = scrollProxy.scrollWidth - scrollProxy.clientWidth;
      const targetScrollLeft = Math.round(contentScrollRatio * proxyMaxScroll);
      
      lastProxyScrollLeft = targetScrollLeft;
      scrollProxy.scrollLeft = targetScrollLeft;
    };

    scrollProxy.addEventListener('scroll', handleProxyScroll);
    markersScrollContainer.addEventListener('scroll', handleContentScroll);
    tracksScrollContainer.addEventListener('scroll', handleContentScroll);

    return () => {
      scrollProxy.removeEventListener('scroll', handleProxyScroll);
      markersScrollContainer.removeEventListener('scroll', handleContentScroll);
      tracksScrollContainer.removeEventListener('scroll', handleContentScroll);
    };
  }, []);

  // Calculate the content width based on zoom scale - MUST match getTimelineContentStyles
  const contentWidth = `${Math.max(100, 100 * zoomScale)}%`;

  return (
    <div 
      className="flex w-full border-t border-border overflow-hidden"
      style={{ 
        height: `13px`,
      }}
    >
      {/* Spacer to match TimelineTrackHandles width - fixed at left */}
      <div 
        className="hidden md:block flex-shrink-0 border-r border-border"
        style={{ width: `${TIMELINE_CONSTANTS.HANDLE_WIDTH}px` }}
      />
      
      {/* Proxy scrollbar - this is the visible scrollbar that users interact with */}
      <div 
        ref={scrollProxyRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
        style={{
          height: '100%',
        }}
      >
        {/* Empty content that matches the timeline content's scroll dimensions */}
        <div 
          className="proxy-scrollbar-content"
          style={{
            width: contentWidth,
            height: '1px', /* Minimal height for horizontal scrollbar */
          }}
        />
      </div>

      {/* Spacer to match TimelineTrackGutter width - fixed at right */}
      <div 
        className="hidden md:block flex-shrink-0 border-l border-border"
        style={{ width: `15px` }}
      />
    </div>
  );
};

