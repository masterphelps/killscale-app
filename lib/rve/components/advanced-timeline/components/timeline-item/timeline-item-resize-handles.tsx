import React from 'react';

interface TimelineItemResizeHandlesProps {
  onDragStart?: boolean;
  splittingEnabled?: boolean;
  isHovering?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  isMultiSelected?: boolean; // New prop to indicate multi-selection
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>, position: 'left' | 'right') => void;
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>, position: 'left' | 'right') => void;
}

export const TimelineItemResizeHandles: React.FC<TimelineItemResizeHandlesProps> = ({
  onDragStart,
  splittingEnabled = false,
  isHovering = false,
  isSelected = false,
  isDragging = false,
  isMultiSelected = false,
  onMouseDown,
  onTouchStart,
}) => {
  // Hide resize handles if dragging is not enabled, splitting is enabled, or multiple items are selected
  if (!onDragStart || splittingEnabled || isMultiSelected) {
    return null;
  }

  const handleMouseDown = (position: 'left' | 'right') => (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e, position);
  };

  const handleTouchStart = (position: 'left' | 'right') => (e: React.TouchEvent<HTMLDivElement>) => {
    onTouchStart?.(e, position);
  };

  const baseHandleClasses = `
    absolute top-0 bottom-0 z-50
    bg-gray-400/20 backdrop-blur-sm
    hover:bg-gray-400/30 
    ${isHovering || isSelected ? "opacity-100 " : "opacity-0 group-hover:opacity-100"}
    transition-all duration-200 ease-in-out
    border-gray-400/30
  `.trim();

  const cursorStyle: React.CSSProperties = !isDragging 
    ? { cursor: "ew-resize" } 
    : { cursor: "grabbing" };

  return (
    <>
      {/* Resize handle - left */}
      <div
        className={`${baseHandleClasses} left-0 border-r border-l rounded-l-[4px] touch-none`}
        style={{ width: '12px', minWidth: '12px', ...cursorStyle }}
        onMouseDown={handleMouseDown('left')}
        onTouchStart={handleTouchStart('left')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-x-0.5 flex ml-0">
            <div className="w-[1px] h-4 bg-black rounded-full shadow-glow" />
            <div className="w-[1px] h-4 bg-black rounded-full shadow-glow" />
          </div>
        </div>
      </div>
      
      {/* Resize handle - right */}
      <div
        className={`${baseHandleClasses} right-0 border-r border-l rounded-r-[4px] touch-none`}
        style={{ width: '12px', minWidth: '12px', ...cursorStyle }}
        onMouseDown={handleMouseDown('right')}
        onTouchStart={handleTouchStart('right')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-x-0.5 flex mr-0">
            <div className="w-[1px] h-4 bg-black rounded-full shadow-glow" />
            <div className="w-[1px] h-4 bg-black rounded-full shadow-glow" />
          </div>
        </div>
      </div>
    </>
  );
}; 