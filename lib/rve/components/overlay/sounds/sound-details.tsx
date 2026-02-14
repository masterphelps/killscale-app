import React, { useRef, useState, useEffect, useCallback } from "react";
import { SoundOverlay } from "../../../types";
import { Play, Pause } from "lucide-react";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Toggle } from "../../ui/toggle";

/**
 * Interface for the props passed to the SoundDetails component
 * @interface
 * @property {SoundOverlay} localOverlay - The current sound overlay object containing source and styles
 * @property {Function} setLocalOverlay - Callback function to update the sound overlay
 */
interface SoundDetailsProps {
  localOverlay: SoundOverlay;
  setLocalOverlay: (overlay: SoundOverlay) => void;
}

/**
 * SoundDetails Component
 *
 * A component that provides an interface for playing and controlling sound overlays.
 * Features include:
 * - Play/pause functionality
 * - Volume control with mute/unmute option
 * - Visual feedback for playback state
 *
 * @component
 * @param {SoundDetailsProps} props - Component props
 * @returns {JSX.Element} Rendered component
 */
export const SoundDetails: React.FC<SoundDetailsProps> = ({
  localOverlay,
  setLocalOverlay,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(localOverlay.mediaSrcDuration ?? 10);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Memoized event handler to prevent unnecessary re-renders
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current && audioRef.current.duration) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  useEffect(() => {
    audioRef.current = new Audio(localOverlay.src);
    
    audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [localOverlay.src, localOverlay.mediaSrcDuration, handleLoadedMetadata]);

  /**
   * Toggles the play/pause state of the audio
   * Handles audio playback and updates the UI state
   */
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current
        .play()
        .catch((error) => console.error("Error playing audio:", error));
    }
    setIsPlaying(!isPlaying);
  };

  /**
   * Updates the styles of the sound overlay
   * @param {Partial<SoundOverlay["styles"]>} updates - Partial style updates to apply
   */
  const handleStyleChange = (updates: Partial<SoundOverlay["styles"]>) => {
    const updatedOverlay = {
      ...localOverlay,
      styles: {
        ...localOverlay.styles,
        ...updates,
      },
    };
    setLocalOverlay(updatedOverlay);
  };

  /**
   * Handles fade in changes with cross-validation against fade out
   * Ensures fadeIn + fadeOut <= duration by adjusting fadeOut if necessary
   * @param {number[]} value - New fade in value from slider
   */
  const handleFadeInChange = (value: number[]) => {
    const newFadeIn = Math.max(0, Math.min(value[0], duration));
    const currentFadeOut = localOverlay?.styles?.fadeOut ?? 0;
    
    if (newFadeIn + currentFadeOut > duration) {
      const adjustedFadeOut = Math.max(0, duration - newFadeIn);
      handleStyleChange({ fadeIn: newFadeIn, fadeOut: adjustedFadeOut });
    } else {
      handleStyleChange({ fadeIn: newFadeIn });
    }
  };

  /**
   * Handles fade out changes with cross-validation against fade in
   * Ensures fadeIn + fadeOut <= duration by adjusting fadeIn if necessary
   * @param {number[]} value - New fade out value from slider
   */
  const handleFadeOutChange = (value: number[]) => {
    const newFadeOut = Math.max(0, Math.min(value[0], duration));
    const currentFadeIn = localOverlay?.styles?.fadeIn ?? 0;
    
    if (currentFadeIn + newFadeOut > duration) {
      const adjustedFadeIn = Math.max(0, duration - newFadeOut);
      handleStyleChange({ fadeIn: adjustedFadeIn, fadeOut: newFadeOut });
    } else {
      handleStyleChange({ fadeOut: newFadeOut });
    }
  };

  return (
    <div className="space-y-4">
      {/* Sound Info with Play Button */}
      <div className="flex items-center gap-3 p-4 bg-card rounded-md border">
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePlay}
          className="h-8 w-8 rounded-full bg-transparent hover:bg-accent text-foreground text-foreground  "
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 text-foreground" />
          ) : (
            <Play className="h-4 w-4 text-foreground" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extralight text-foreground truncate">
            {localOverlay.content}
          </p>
        </div>
      </div>

      {/* Settings Tabs */}

      <div className="space-y-4 mt-4">
        <div className="space-y-6">
          {/* Volume Settings */}
          <div className="space-y-4 rounded-md bg-card p-4 border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extralight text-foreground">Volume</h3>
              <Toggle
                pressed={(localOverlay?.styles?.volume ?? 1) === 0}
                onPressedChange={(pressed) =>
                  handleStyleChange({
                    volume: pressed ? 0 : 1,
                  })
                }
                size="sm"
                className="text-xs"
              >
                {(localOverlay?.styles?.volume ?? 1) === 0 ? "Unmute" : "Mute"}
              </Toggle>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Slider
                value={[localOverlay?.styles?.volume ?? 1]}
                onValueChange={(value) =>
                  handleStyleChange({ volume: value[0] })
                }
                min={0}
                max={1}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground min-w-[40px] text-right">
                {Math.round((localOverlay?.styles?.volume ?? 1) * 100)}%
              </span>
            </div>
          </div>

          {/* Fade In Settings */}
          <div className="space-y-4 rounded-md bg-card p-4 border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extralight text-foreground">Fade In</h3>
              <span className="text-xs text-muted-foreground">
                {(localOverlay?.styles?.fadeIn ?? 0).toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Slider
                value={[Math.max(0, Math.min(localOverlay?.styles?.fadeIn ?? 0, duration))]}
                onValueChange={handleFadeInChange}
                min={0}
                max={duration}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Fade Out Settings */}
          <div className="space-y-4 rounded-md bg-card p-4 border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extralight text-foreground">Fade Out</h3>
              <span className="text-xs text-muted-foreground">
                {(localOverlay?.styles?.fadeOut ?? 0).toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Slider
                value={[Math.max(0, Math.min(localOverlay?.styles?.fadeOut ?? 0, duration))]}
                onValueChange={handleFadeOutChange}
                min={0}
                max={duration}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
