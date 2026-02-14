import React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible";

/**
 * Interface for the AnimationSection component
 */
interface AnimationSectionProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * AnimationSection displays a collapsible section of animations
 */
export const AnimationSection: React.FC<AnimationSectionProps> = ({
  title,
  count,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className="w-full"
    >
      <div className="border rounded-md overflow-hidden bg-card">
        <CollapsibleTrigger className="w-full flex justify-between items-center px-4 py-3 bg-card hover:bg-accent/50 duration-200 ease-out">
          <div className="flex items-center gap-2">
            <span className="font-extralight text-xs text-foreground">
              {title}
            </span>
            <span className="text-xs px-1 py-0.5 rounded-full bg-muted text-muted-foreground font-extralight">
              ({count})
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`duration-200 ease-out text-foreground ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 bg-card border-t">
            <div className="grid grid-cols-4 gap-2">{children}</div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};