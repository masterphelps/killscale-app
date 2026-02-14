import React, { useEffect, useRef } from 'react';
import { TimelineTrack as TimelineTrackType } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineTrackGutterProps {
  tracks: TimelineTrackType[];
}

export const TimelineTrackGutter: React.FC<TimelineTrackGutterProps> = ({
  tracks,
}) => {
  const scrollProxyRef = useRef<HTMLDivElement>(null);
  
  // Synchronize scroll between the proxy scrollbar and the timeline content
  useEffect(() => {
    const tracksScrollContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
    const scrollProxy = scrollProxyRef.current;
    
    if (!tracksScrollContainer || !scrollProxy) return;

    let isProxyScrolling = false;
    let isContentScrolling = false;

    // When proxy scrollbar scrolls, update content (vertical only)
    const handleProxyScroll = () => {
      if (isContentScrolling) {
        isContentScrolling = false;
        return;
      }
      isProxyScrolling = true;
      tracksScrollContainer.scrollTop = scrollProxy.scrollTop;
    };

    // When content scrolls, update proxy (vertical only)
    const handleContentScroll = () => {
      if (isProxyScrolling) {
        isProxyScrolling = false;
        return;
      }
      isContentScrolling = true;
      scrollProxy.scrollTop = tracksScrollContainer.scrollTop;
    };

    scrollProxy.addEventListener('scroll', handleProxyScroll);
    tracksScrollContainer.addEventListener('scroll', handleContentScroll);

    return () => {
      scrollProxy.removeEventListener('scroll', handleProxyScroll);
      tracksScrollContainer.removeEventListener('scroll', handleContentScroll);
    };
  }, []);

  return (
    <div 
      className="flex flex-col h-full border-l border-border overflow-hidden border-l"
      style={{ 
        width: `15px`,
      }}
    >
      {/* Header spacer to match TimelineMarkers height - fixed at top */}
      <div 
        className="flex-shrink-0 border-b border-border"
        style={{ height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px` }}
      />
      
      {/* Proxy scrollbar - this is the visible scrollbar that users interact with */}
      <div 
        ref={scrollProxyRef}
        className="flex-1 overflow-y-auto overflow-x-hidden track-gutter-scroll border-l"
        style={{
          width: '100%',
        }}
      >
        {/* Empty content that matches the timeline content's scroll dimensions */}
        <div 
          className="proxy-scrollbar-content"
          style={{
            width: '1px',
            height: `${tracks.length * TIMELINE_CONSTANTS.TRACK_HEIGHT}px`,
          }}
        />
      </div>
    </div>
  );
};

