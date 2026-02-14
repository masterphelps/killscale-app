import React from 'react';

interface TimelineItemSplitLineProps {
  splittingEnabled?: boolean;
  isHovering?: boolean;
  splitPosition?: number | null;
}

export const TimelineItemSplitLine: React.FC<TimelineItemSplitLineProps> = ({
  splittingEnabled = false,
  isHovering = false,
  splitPosition,
}) => {
  if (!splittingEnabled || !isHovering || splitPosition === null) {
    return null;
  }

  return (
    <>
      {/* Main split line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20 shadow-lg"
        style={{
          left: `${splitPosition}%`,
          transform: 'translateX(-50%)',
          boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
        }}
      />
      {/* Split line glow effect for better visibility */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-red-500/30 pointer-events-none z-19 blur-sm"
        style={{
          left: `${splitPosition}%`,
          transform: 'translateX(-50%)',
        }}
      />
    </>
  );
}; 