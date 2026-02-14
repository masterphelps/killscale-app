import React from "react";
import { Button } from "../../ui/button";
import { Play, Pause } from "lucide-react";
import { StandardAudio } from "../../../types/media-adaptors";
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from "../../advanced-timeline/hooks/use-new-item-drag";

/**
 * Type for audio tracks with source attribution
 */
type AudioWithSource = StandardAudio & {
  _source: string;
  _sourceDisplayName: string;
};

interface SoundCardProps {
  sound: AudioWithSource;
  playingTrack: string | null;
  onTogglePlay: (soundId: string) => void;
  onAddToTimeline: (sound: AudioWithSource) => void;
  showSourceBadge?: boolean;
  enableTimelineDrag?: boolean;
}

/**
 * SoundCard Component
 *
 * Renders an individual sound card with play controls and metadata.
 * Clicking the card adds the sound to the timeline.
 * Clicking the play button toggles sound preview.
 * Can be dragged to the timeline when enableTimelineDrag is true.
 *
 * @component
 */
const SoundCard: React.FC<SoundCardProps> = ({
  sound,
  playingTrack,
  onTogglePlay,
  onAddToTimeline,
  showSourceBadge = false,
  enableTimelineDrag = false,
}) => {
  // Handle drag start for timeline integration
  const handleDragStart = (e: React.DragEvent) => {
    if (!enableTimelineDrag) return;
    
    // Set drag data for timeline - structure data to match AudioItemData interface
    const dragData = {
      isNewItem: true,
      type: "audio", // Use "audio" to match TrackItemType.AUDIO
      label: sound.title,
      duration: sound.duration, // Duration in seconds
      data: {
        ...sound, // Include all sound metadata
        src: sound.file, // Audio source URL for waveform generation
      },
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Set global drag state for timeline
    setCurrentNewItemDragType(dragData.type);
    setCurrentNewItemDragData(dragData);
    
    // Create a custom drag preview
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    dragPreview.style.color = 'white';
    dragPreview.style.borderRadius = '6px';
    dragPreview.style.fontSize = '12px';
    dragPreview.style.fontWeight = '500';
    dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    dragPreview.textContent = `🎵 ${sound.title}`;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 20, 20);
    
    // Clean up the preview element after drag starts
    setTimeout(() => {
      dragPreview.remove();
    }, 0);
  };
  
  const handleDragEnd = () => {
    if (!enableTimelineDrag) return;
    
    // Clear drag state
    setCurrentNewItemDragType(null);
    setCurrentNewItemDragData(null);
  };

  return (
    <div
      onClick={() => onAddToTimeline(sound)}
      draggable={enableTimelineDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="group flex items-center gap-3 p-3 bg-card rounded-md 
        border border-sidebar-border hover:bg-accent
         duration-150 cursor-pointer relative shadow-sm border-base-300"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay(sound.id);
        }}
        className="h-8 w-8 rounded-full shrink-0 text-foreground"
      >
        {playingTrack === sound.id ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-extralight text-foreground truncate mb-1">
          {sound.title}
        </p>
        <p className="text-xs font-extralight text-muted-foreground truncate">
          {sound.artist} • {sound.duration}s
        </p>
      </div>

      {/* Source Attribution Badge - positioned absolutely on the right */}
      {showSourceBadge && (
        <span className="absolute font-extralight top-2 right-2 text-[10px] px-1 py-0.5 bg-muted text-muted-foreground rounded text-center leading-none">
          {sound._sourceDisplayName}
        </span>
      )}
    </div>
  );
};

export default SoundCard;
export type { AudioWithSource, SoundCardProps }; 