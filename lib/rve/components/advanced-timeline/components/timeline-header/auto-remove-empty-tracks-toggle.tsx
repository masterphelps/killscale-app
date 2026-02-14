import { FoldVertical } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../components/ui/tooltip';
import React from 'react';



interface AutoRemoveEmptyTracksToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AutoRemoveEmptyTracksToggle: React.FC<AutoRemoveEmptyTracksToggleProps> = ({
  enabled,
  onToggle,
}) => {
  return (
    <div className="hidden md:block">
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={() => onToggle(!enabled)}
            variant={enabled ? "outline" : "ghost"}
            size="icon"
            className={`transition-all duration-200 relative ${
              enabled 
                ? 'border-primary ' 
                : ' text-muted-foreground'
            }`}
            onTouchStart={(e) => e.preventDefault()}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <FoldVertical className={`w-4 h-4 transition-all duration-300 `} />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="bg-popover border-border text-popover-foreground shadow-md"
        >
          {enabled 
            ? 'Auto-remove empty tracks' 
            : 'Enable auto-removal of empty tracks'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    </div>
  );
}; 