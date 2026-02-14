import React from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ZoomControls } from './zoom-controls';
import { PlaybackControls } from './playback-controls';
import { SplittingToggle } from './splitting-toggle';
import { SplitAtSelectionButton } from './split-at-selection-button';
import { UndoRedoControls } from './undo-redo-controls';
import { AspectRatioDropdown } from './aspect-ratio-dropdown';
import { AspectRatio } from '../../../../types';
import { Overlay } from '../../../../types';

interface TimelineHeaderProps {
  totalDuration: number;
  currentTime?: number;
  showZoomControls?: boolean;
  zoomScale?: number;
  setZoomScale?: (scale: number, isDragging?: boolean) => void;
  resetZoom?: () => void;
  startSliderDrag?: () => void;
  endSliderDrag?: () => void;
  // Playback controls
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeekToStart?: () => void;
  onSeekToEnd?: () => void;
  showPlaybackControls?: boolean;
  // Playback speed controls
  playbackRate?: number;
  setPlaybackRate?: (rate: number) => void;
  // Auto-remove empty tracks
  autoRemoveEmptyTracks?: boolean;
  onToggleAutoRemoveEmptyTracks?: (enabled: boolean) => void;
  // Splitting mode (legacy - hidden)
  splittingEnabled?: boolean;
  onToggleSplitting?: (enabled: boolean) => void;
  // Split at selection (new functionality)
  onSplitAtSelection?: () => void;
  hasSelectedItem?: boolean;
  selectedItemsCount?: number;
  showSplitAtSelection?: boolean;
  // Undo/Redo controls
  showUndoRedoControls?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Aspect ratio controls
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  showAspectRatioControls?: boolean;
  // Visibility controls
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Debug export
  overlays?: Overlay[];
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  totalDuration,
  currentTime = 0,
  showZoomControls = false,
  zoomScale,
  setZoomScale,
  resetZoom,
  startSliderDrag,
  endSliderDrag,
  isPlaying = false,
  onPlay,
  onPause,
  onSeekToStart,
  onSeekToEnd,
  showPlaybackControls = false,
  playbackRate = 1,
  setPlaybackRate,
  splittingEnabled = false,
  onToggleSplitting,
  onSplitAtSelection,
  hasSelectedItem = false,
  selectedItemsCount = 0,
  showSplitAtSelection = true,
  showUndoRedoControls = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  aspectRatio = "16:9",
  onAspectRatioChange,
  showAspectRatioControls = true,
  isCollapsed = false,
  onToggleCollapse,
  // overlays = [],
}) => {
  const formatTime = (timeInSeconds: number) => {
    // Convert seconds to milliseconds
    const milliseconds = Math.round(timeInSeconds * 1000);
    // Use date-fns-tz to format in UTC timezone, avoiding local timezone offset issues
    return formatInTimeZone(milliseconds, 'UTC', 'm:ss.SS');
  };

  // Debug export function
  // const exportOverlaysAsTemplate = () => {
  //   const template = {
  //     id: `debug-export-${Date.now()}`,
  //     name: "Debug Export",
  //     description: "Debug export of current overlays",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //     createdBy: {
  //       id: "debug-user",
  //       name: "Debug User"
  //     },
  //     category: "Debug",
  //     tags: ["debug", "export"],
  //     duration: totalDuration,
  //     aspectRatio: aspectRatio,
  //     overlays: overlays
  //   };

  //   // Create and download JSON file
  //   const dataStr = JSON.stringify(template, null, 2);
  //   const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  //   const exportFileDefaultName = `debug-overlays-${Date.now()}.json`;
    
  //   const linkElement = document.createElement('a');
  //   linkElement.setAttribute('href', dataUri);
  //   linkElement.setAttribute('download', exportFileDefaultName);
  //   linkElement.click();

  //   // Also log to console for easy copying
  //   console.log('Exported overlays:', template);
  // };

  return (
    <div className=" bg-background flex justify-between items-center border border-border px-3 py-2.5">
      {/* Left section: Undo/Redo and Split at Selection */}
      <div className="flex items-center gap-2 flex-1 justify-start">
        {showUndoRedoControls && onUndo && onRedo && (
          <UndoRedoControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        )}
     
        {/* Legacy splitting toggle - hidden but kept for backward compatibility */}
        {false && onToggleSplitting && (
          <SplittingToggle
            enabled={splittingEnabled}
            onToggle={onToggleSplitting!}
          />
        )}

        {/* New split at selection button */}
        {showSplitAtSelection && onSplitAtSelection && (
          <SplitAtSelectionButton
            onSplitAtSelection={onSplitAtSelection}
            hasSelectedItem={hasSelectedItem}
            selectedItemsCount={selectedItemsCount}
          />
        )}

        {/* Debug Export Button - Comment out this section to hide */}
        {/* {true && (
          <button
            onClick={exportOverlaysAsTemplate}
            className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-md font-medium transition-colors"
            title="Export overlays as JSON template (Debug)"
          >
            Debug Export
          </button>
        )} */}
      </div>

      {/* Center section: Playback controls */}
      <div className="flex items-center justify-center gap-2 grow">
        {showPlaybackControls && (
          <PlaybackControls
            isPlaying={isPlaying}
            onPlay={onPlay}
            onPause={onPause}
            onSeekToStart={onSeekToStart}
            onSeekToEnd={onSeekToEnd}
            currentTime={currentTime}
            totalDuration={totalDuration}
            formatTime={formatTime}
            playbackRate={playbackRate}
            setPlaybackRate={setPlaybackRate}
          />
        )}
      </div>

      {/* Right section: Aspect Ratio, Zoom Controls and Scale Display */}
      <div className="flex items-center gap-3 flex-1 justify-end">
        {showAspectRatioControls && onAspectRatioChange && (
          <AspectRatioDropdown
            aspectRatio={aspectRatio}
            onAspectRatioChange={onAspectRatioChange}
          />
        )}
        {showZoomControls && zoomScale !== undefined && setZoomScale && (
          <ZoomControls
            zoomScale={zoomScale}
            setZoomScale={setZoomScale}
            resetZoom={resetZoom}
            startSliderDrag={startSliderDrag}
            endSliderDrag={endSliderDrag}
          />
        )}
        
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground"
            title={isCollapsed ? "Expand Timeline" : "Collapse Timeline"}
            type="button"
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};