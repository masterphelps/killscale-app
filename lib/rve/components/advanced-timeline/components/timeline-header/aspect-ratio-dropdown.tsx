
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import { 
  Monitor, 
  Square, 
  Smartphone, 
  Instagram,
  Settings2,
  Check,
  ChevronDown
} from 'lucide-react';
import { Button } from '../../../ui/button';
import type { AspectRatio } from '../../../../types';

interface AspectRatioDropdownProps {
  /** Current aspect ratio */
  aspectRatio: AspectRatio;
  /** Callback when aspect ratio changes */
  onAspectRatioChange: (ratio: AspectRatio) => void;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// Aspect ratio options with icons and display names
const ASPECT_RATIO_OPTIONS = [
  {
    value: "16:9" as AspectRatio,
    label: "16:9",
    description: "Widescreen",
    icon: Monitor,
    color: "text-blue-500"
  },
  {
    value: "9:16" as AspectRatio,
    label: "9:16", 
    description: "Vertical",
    icon: Smartphone,
    color: "text-purple-500"
  },
  {
    value: "1:1" as AspectRatio,
    label: "1:1",
    description: "Square",
    icon: Square,
    color: "text-green-500"
  },
  {
    value: "4:5" as AspectRatio,
    label: "4:5",
    description: "Portrait",
    icon: Instagram,
    color: "text-pink-500"
  }
];

export const AspectRatioDropdown: React.FC<AspectRatioDropdownProps> = ({
  aspectRatio,
  onAspectRatioChange,
  disabled = false,
  className = "",
}) => {
  // Find the current aspect ratio option
  const currentOption = ASPECT_RATIO_OPTIONS.find(option => option.value === aspectRatio);
  
  /**
   * When aspect ratio changes, all overlays are automatically transformed
   * to maintain their relative positions on the new canvas size.
   * This is handled by the editor provider using aspect-ratio-transform utility.
   */

  return (
    <div className="hidden md:block">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          disabled={disabled}
          className={`gap-2 min-w-[90px] justify-between border-border bg-background hover:bg-accent hover:text-accent-foreground shadow-none ${className}`}
          onTouchStart={(e) => e.preventDefault()}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="flex items-center gap-2">
            {currentOption && (
              <>
                <currentOption.icon className={`h-3.5 w-3.5 ${currentOption.color}`} />
                <span className="ext-text-primary font-extralight text-xs">{currentOption.label}</span>
              </>
            )}
          </div>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-56 border-border bg-popover" align="start">
        <DropdownMenuLabel className="flex items-center gap-2 text-popover-foreground font-extralight">
          <Settings2 className="h-4 w-4" />
          Aspect Ratio
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuRadioGroup 
          value={aspectRatio} 
          onValueChange={(value) => onAspectRatioChange(value as AspectRatio)}
        >
          {ASPECT_RATIO_OPTIONS.map((option) => (
            <DropdownMenuRadioItem 
              key={option.value} 
              value={option.value}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <option.icon className={`h-4 w-4 ${option.color}`} />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-extralight">{option.label}</span>
                  {aspectRatio === option.value && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-extralight">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}; 
