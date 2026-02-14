import React from 'react';
import { Scissors } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../ui/tooltip';

interface SplitAtSelectionButtonProps {
  onSplitAtSelection: () => void;
  disabled?: boolean;
  hasSelectedItem?: boolean;
  selectedItemsCount?: number;
}

export const SplitAtSelectionButton: React.FC<SplitAtSelectionButtonProps> = ({ 
  onSplitAtSelection,
  disabled = false,
  hasSelectedItem = false,
  selectedItemsCount = 0
}) => {
  const isDisabled = disabled || !hasSelectedItem;

  const getTooltipMessage = () => {
    if (selectedItemsCount === 0) {
      return 'Select an item to split at playhead';
    }
    if (selectedItemsCount > 1) {
      return 'Select only one item to split';
    }
    if (!hasSelectedItem) {
      return 'Move playhead over selected item to split';
    }
    return 'Split selected item at playhead';
  };

  return (
    <div className="hidden md:block">
      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onSplitAtSelection}
              variant="ghost"
              size="icon"
              disabled={isDisabled}
              className={`transition-all duration-200 relative ${
                isDisabled 
                  ? 'text-muted-foreground opacity-50 cursor-not-allowed' 
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              onTouchStart={(e) => e.preventDefault()}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Scissors className="w-4 h-4 transition-all duration-300" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={8}
            className="bg-popover border-border text-popover-foreground shadow-md"
          >
{getTooltipMessage()}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}; 