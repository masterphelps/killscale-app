import React, { useState } from "react";
import { cn } from "../../../utils/general/utils";
import type { AnimationTemplate } from "../../../templates/animation-templates";

interface AnimationPreviewProps {
  animation: AnimationTemplate;
  isSelected: boolean;
  onClick: () => void;
  animationType?: "enter" | "exit";
}

export const AnimationPreview: React.FC<AnimationPreviewProps> = ({
  animation,
  isSelected,
  onClick,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const getAnimationStyle = () => {
    if (!animation.enter || animation.name === "None") return {};
    
    const styles = animation.enter(isHovering ? 40 : 0, 40) || {};
    return {
      ...styles,
      transition: "all 0.6s ease-out",
    };
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        "aspect-square w-full rounded-sm border border-border p-2 transition-all duration-200",
        "flex flex-col items-center justify-center gap-1",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-primary/5"
      )}
    >
      {/* Preview Circle */}
      <div className="relative h-6 w-6">
        <div
          className={cn(
            "h-6 w-6 rounded-full transition-opacity duration-300",
            isSelected ? "border-primary border-dashed border-2" : "border border-border"
          )}
          style={{ opacity: isHovering ? 0.3 : 0.8 }}
        />
        
        {animation.name !== "None" && (
          <div
            className="absolute inset-0 h-6 w-6 rounded-full border-2 border-dashed border-primary"
            style={{
              ...getAnimationStyle(),
              opacity: isHovering ? 1 : 0,
            }}
          />
        )}
      </div>

      {/* Animation Name */}
      <p
        className={cn(
          "text-[10px] font-extralight text-center",
          isSelected ? "text-primary" : "text-muted-foreground"
        )}
      >
        {animation.name}
      </p>
    </button>
  );
};
