import React from 'react';

interface TimelineItemLabelProps {
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  defaultLabel: string;
  iconClassName?: string;
  isHovering?: boolean; // Add hover state prop
  showBackground?: boolean; // Add background flag
}

export const TimelineItemLabel: React.FC<TimelineItemLabelProps> = ({
  icon: Icon,
  label,
  defaultLabel,
  iconClassName = "w-3 h-3 text-white/80",
  isHovering = false, // Default to false
  showBackground = false // Default to false
}) => {
  return (
    <div className={`flex items-center h-full w-full overflow-hidden px-2 transition-all duration-200 ease-out ${
      isHovering ? 'ml-6' : 'ml-4'
    }`}>
      <div className="flex items-center min-w-0 w-full overflow-hidden">
        <div className={`flex items-center p-1 rounded-sm overflow-hidden ${showBackground ? 'bg-yellow-600 opacity-80' : ''}`}>
          <div className="flex-shrink-0 mr-2 flex items-center overflow-hidden">
            <Icon className={showBackground ? `w-3 h-3 flex-shrink-0 ${showBackground ? 'text-white' : ''} ${iconClassName.includes('text-red-') ? 'text-red-400' : 'text-white'}` : `${iconClassName} flex-shrink-0`} />
          </div>
          <div className="min-w-0 overflow-hidden">
            <div className={`truncate text-xs font-normal whitespace-nowrap ${
              showBackground ? 'text-white' : 'text-white' 
            }`}>
              {label || defaultLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 