import React from 'react';

interface TimelineResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  isResizing: boolean;
}

/**
 * Draggable resize handle component for the timeline
 * Allows users to adjust the height of the timeline by dragging up or down
 * Supports both mouse and touch interactions for mobile devices
 */
export const TimelineResizeHandle: React.FC<TimelineResizeHandleProps> = ({ 
  onMouseDown, 
  onTouchStart,
  isResizing 
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={`
        h-1 bg-border hover:bg-primary transition-colors cursor-ns-resize
        flex items-center justify-center group relative
        ${isResizing ? 'bg-primary' : ''}
      `}
      style={{
        touchAction: 'none',
      }}
    >
      {/* Visual indicator for the resize handle */}
      <div className="absolute inset-x-0 top-0 h-1 " />

    </div>
  );
};

