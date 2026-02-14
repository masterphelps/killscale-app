import React from 'react';

import { Scissors } from 'lucide-react';
import { Button } from '../../../ui/button';  
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';

interface SplittingToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const SplittingToggle: React.FC<SplittingToggleProps> = ({ 
  enabled, 
  onToggle 
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
                ? ' border-destructive ' 
                : ' text-muted-foreground'
            }`}
            onTouchStart={(e) => e.preventDefault()}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Scissors className={`w-4 h-4 transition-all duration-300 `} />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="bg-popover border-border text-popover-foreground shadow-md"
        >
          {enabled 
            ? 'Click timeline items to split them' 
            : 'Enable splitting mode'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    </div>
  );
}; 