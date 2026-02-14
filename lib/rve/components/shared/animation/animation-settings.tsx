import React, { useState } from "react";
import { AnimationTemplate, animationTemplates } from "../../../adaptors/default-animation-adaptors";
import { AnimationPreview } from "./animation-preview";
import { AnimationSection } from "./animation-section";

/**
 * AnimationSettingsProps interface defines the required props for the AnimationSettings component
 */
interface AnimationSettingsProps {
  /** Currently selected enter animation ID */
  selectedEnterAnimation?: string;
  /** Currently selected exit animation ID */
  selectedExitAnimation?: string;
  /** Callback function triggered when an enter animation is selected */
  onEnterAnimationSelect?: (animationId: string) => void;
  /** Callback function triggered when an exit animation is selected */
  onExitAnimationSelect?: (animationId: string) => void;
}

/**
 * AnimationSettings component provides a unified interface for selecting enter and exit animations
 * Uses the animation templates directly for consistent key mapping
 */
export const AnimationSettings: React.FC<AnimationSettingsProps> = ({
  selectedEnterAnimation,
  selectedExitAnimation,
  onEnterAnimationSelect,
  onExitAnimationSelect,
}) => {
  const [openSections, setOpenSections] = useState<{
    enter: boolean;
    exit: boolean;
  }>({
    enter: false,
    exit: false,
  });

  const toggleSection = (section: "enter" | "exit") => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Add a "None" option for both enter and exit
  const noneAnimation: AnimationTemplate = {
    key: "none",
    name: "None",
    preview: "No animation",
    enter: () => ({}),
    exit: () => ({}),
  };

  // Convert animationTemplates to array with keys
  const animationArray = Object.values(animationTemplates);
  

  // All animations are available for both enter and exit since each template has both functions
  const allAnimations = [noneAnimation, ...animationArray];

  return (
    <div className="space-y-2">
      {/* Enter Animations Section */}
      <AnimationSection
        title="Enter Animations"
        count={allAnimations.length}
        isOpen={openSections.enter}
        onToggle={() => toggleSection("enter")}
      >
        {allAnimations.map((animation, index) => (
          <AnimationPreview
            key={`enter-${animation.key}-${index}`}
            animation={animation}
            isSelected={selectedEnterAnimation === animation.key}
            onClick={() => {
              console.log("Selecting enter animation:", animation.key);
              onEnterAnimationSelect?.(animation.key!);
            }}
            animationType="enter"
          />
        ))}
      </AnimationSection>

      {/* Exit Animations Section */}
      <AnimationSection
        title="Exit Animations"
        count={allAnimations.length}
        isOpen={openSections.exit}
        onToggle={() => toggleSection("exit")}
      >
        {allAnimations.map((animation, index) => (
          <AnimationPreview
            key={`exit-${animation.key}-${index}`}
            animation={animation}
            isSelected={selectedExitAnimation === animation.key}
            onClick={() => {
              console.log("Selecting exit animation:", animation.key);
              onExitAnimationSelect?.(animation.key!);
            }}
          />
        ))}
      </AnimationSection>
    </div>
  );
};