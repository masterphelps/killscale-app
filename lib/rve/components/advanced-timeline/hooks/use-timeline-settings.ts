import { useState, useEffect, useCallback } from 'react';

export interface UseTimelineSettingsProps {
  autoRemoveEmptyTracks: boolean;
  onAutoRemoveEmptyTracksChange?: (enabled: boolean) => void;
}

export interface UseTimelineSettingsReturn {
  isAutoRemoveEnabled: boolean;
  isSplittingEnabled: boolean;
  handleToggleAutoRemoveEmptyTracks: (enabled: boolean) => void;
  handleToggleSplitting: (enabled: boolean) => void;
}

export const useTimelineSettings = ({ 
  autoRemoveEmptyTracks, 
  onAutoRemoveEmptyTracksChange 
}: UseTimelineSettingsProps): UseTimelineSettingsReturn => {
  const [isAutoRemoveEnabled, setIsAutoRemoveEnabled] = useState<boolean>(autoRemoveEmptyTracks);
  const [isSplittingEnabled, setIsSplittingEnabled] = useState<boolean>(false);

  // Update auto-remove setting when prop changes
  useEffect(() => {
    setIsAutoRemoveEnabled(autoRemoveEmptyTracks);
  }, [autoRemoveEmptyTracks]);

  // Toggle auto-remove empty tracks setting
  const handleToggleAutoRemoveEmptyTracks = useCallback((enabled: boolean) => {
    setIsAutoRemoveEnabled(enabled);
    onAutoRemoveEmptyTracksChange?.(enabled);
  }, [onAutoRemoveEmptyTracksChange]);
  
  // Toggle splitting mode
  const handleToggleSplitting = useCallback((enabled: boolean) => {
    setIsSplittingEnabled(enabled);
  }, []);

  return {
    isAutoRemoveEnabled,
    isSplittingEnabled,
    handleToggleAutoRemoveEmptyTracks,
    handleToggleSplitting,
  };
}; 