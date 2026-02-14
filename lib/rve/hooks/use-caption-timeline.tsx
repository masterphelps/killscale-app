import { useEffect, useRef, useState } from "react";
import { CaptionOverlay } from "../types";
import { format, addMilliseconds } from 'date-fns';

/**
 * Formats milliseconds into a readable time string (MM:SS.S)
 */
export const formatTime = (ms: number): string => {
  const date = addMilliseconds(new Date(0), ms);
  return format(date, 'mm:ss.S');
};

/**
 * Parses a time string (MM:SS or MM:SS.m) into milliseconds
 */
export const parseTimeString = (timeStr: string): number => {
  const timeRegex = /^(\d{1,2}):(\d{2})(?:\.(\d))?$/;
  const match = timeStr.match(timeRegex);
  
  if (!match) return -1;
  
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const tenths = match[3] ? parseInt(match[3], 10) : 0;
  
  if (seconds >= 60) return -1;
  
  return minutes * 60000 + seconds * 1000 + tenths * 100;
};

/**
 * Validates that start time is before end time and doesn't overlap with adjacent captions
 */
export const validateTiming = (startMs: number, endMs: number, captionIndex: number, captions: any[]) => {
  if (startMs >= endMs) {
    return { isValid: false, error: "Start time must be before end time" };
  }
  
  // Check overlap with previous caption
  if (captionIndex > 0 && startMs < captions[captionIndex - 1].endMs) {
    return { isValid: false, error: "Overlaps with previous caption" };
  }
  
  // Check overlap with next caption
  if (captionIndex < captions.length - 1 && endMs > captions[captionIndex + 1].startMs) {
    return { isValid: false, error: "Overlaps with next caption" };
  }
  
  return { isValid: true, error: null };
};

interface UseCaptionTimelineProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentMs: number;
}

export const useCaptionTimeline = ({
  localOverlay,
  setLocalOverlay,
  currentMs,
}: UseCaptionTimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCaptionRef = useRef<HTMLDivElement>(null);
  const lastScrolledCaptionIndex = useRef<number>(-1);
  
  const [timingErrors, setTimingErrors] = useState<{[key: number]: string}>({});
  const [inputValues, setInputValues] = useState<{[key: string]: string}>({});

  // Auto-scroll logic
  useEffect(() => {
    if (
      !containerRef.current ||
      !activeCaptionRef.current ||
      !localOverlay?.captions
    )
      return;

    // Convert absolute currentMs to relative time for comparison with stored caption timings
    const overlayStartMs = (localOverlay.from / 30) * 1000;
    const relativeCurrentMs = Math.max(0, currentMs - overlayStartMs);
    
    const activeIndex = localOverlay.captions.findIndex(
      (caption) => relativeCurrentMs >= caption.startMs && relativeCurrentMs < caption.endMs
    );

    // Only scroll if we've moved to a different caption
    if (
      activeIndex !== -1 &&
      activeIndex !== lastScrolledCaptionIndex.current
    ) {
      const container = containerRef.current;
      const activeElement = activeCaptionRef.current;

      const containerHeight = container.clientHeight;
      const elementTop = activeElement.offsetTop;
      const elementHeight = activeElement.clientHeight;

      // Calculate the ideal scroll position to center the element
      const scrollTo = elementTop - containerHeight / 2 + elementHeight / 2;

      container.scrollTo({
        top: scrollTo,
        behavior: "smooth",
      });

      lastScrolledCaptionIndex.current = activeIndex;
    }
  }, [currentMs, localOverlay?.captions, localOverlay?.from]);

  const getInputKey = (captionIndex: number, field: 'startMs' | 'endMs') => 
    `${captionIndex}-${field}`;

  const getInputValue = (captionIndex: number, field: 'startMs' | 'endMs') => {
    const key = getInputKey(captionIndex, field);
    if (inputValues[key]) {
      return inputValues[key];
    }
    
    // Convert overlay position from frames to milliseconds for absolute timing display
    const overlayStartMs = (localOverlay.from / 30) * 1000;
    const relativeTime = localOverlay.captions[captionIndex][field];
    const absoluteTime = overlayStartMs + relativeTime;
    
    return formatTime(absoluteTime);
  };

  const handleInputChange = (captionIndex: number, field: 'startMs' | 'endMs', value: string) => {
    const key = getInputKey(captionIndex, field);
    setInputValues(prev => ({ ...prev, [key]: value }));
  };

  const handleCaptionTextChange = (captionIndex: number, newText: string) => {
    if (!localOverlay?.captions) return;

    const newCaptions = [...localOverlay.captions];
    const currentCaption = newCaptions[captionIndex];

    const words = newText.split(/\s+/).filter((word) => word.length > 0);

    const captionDuration = currentCaption.endMs - currentCaption.startMs;
    const wordDuration = words.length > 0 ? captionDuration / words.length : 0;

    const newWords = words.map((word, idx) => ({
      word,
      startMs: Math.round(currentCaption.startMs + idx * wordDuration),
      endMs: Math.round(currentCaption.startMs + (idx + 1) * wordDuration),
      confidence: 1,
    }));

    newCaptions[captionIndex] = {
      ...currentCaption,
      text: newText,
      words: newWords,
    };

    setLocalOverlay({
      ...localOverlay,
      captions: newCaptions,
    });
  };

  const handleTimingChange = (captionIndex: number, field: 'startMs' | 'endMs', timeString: string) => {
    if (!localOverlay?.captions) return;

    const absoluteTime = parseTimeString(timeString);
    if (absoluteTime === -1) {
      setTimingErrors(prev => ({ ...prev, [captionIndex]: "Invalid time format (MM:SS or MM:SS.m)" }));
      return;
    }

    // Convert absolute time back to relative time for storage
    const overlayStartMs = (localOverlay.from / 30) * 1000;
    const newTime = Math.max(0, absoluteTime - overlayStartMs);

    const newCaptions = [...localOverlay.captions];
    const currentCaption = newCaptions[captionIndex];
    
    const updatedCaption = { ...currentCaption, [field]: newTime };
    
    // Validate timing
    const validation = validateTiming(
      updatedCaption.startMs, 
      updatedCaption.endMs, 
      captionIndex, 
      newCaptions
    );
    
    if (!validation.isValid) {
      setTimingErrors(prev => ({ ...prev, [captionIndex]: validation.error! }));
      return;
    }

    // Clear any existing errors for this caption
    setTimingErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[captionIndex];
      return newErrors;
    });

    // Clear the input value to sync back to formatted time
    const key = getInputKey(captionIndex, field);
    setInputValues(prev => {
      const newValues = { ...prev };
      delete newValues[key];
      return newValues;
    });

    // Recalculate word timings if both start and end are valid
    const captionDuration = updatedCaption.endMs - updatedCaption.startMs;
    const words = updatedCaption.text.split(/\s+/).filter((word) => word.length > 0);
    const wordDuration = words.length > 0 ? captionDuration / words.length : 0;

    const newWords = words.map((word, idx) => ({
      word,
      startMs: Math.round(updatedCaption.startMs + idx * wordDuration),
      endMs: Math.round(updatedCaption.startMs + (idx + 1) * wordDuration),
      confidence: 1,
    }));

    newCaptions[captionIndex] = {
      ...updatedCaption,
      words: newWords,
    };

    setLocalOverlay({
      ...localOverlay,
      captions: newCaptions,
    });
  };

  return {
    containerRef,
    activeCaptionRef,
    timingErrors,
    getInputValue,
    handleInputChange,
    handleCaptionTextChange,
    handleTimingChange,
  };
}; 