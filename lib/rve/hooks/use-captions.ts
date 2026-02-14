import { useState, useCallback } from 'react';
import { Caption, CaptionWord, CaptionOverlay, OverlayType } from '../types';
import { useEditorContext } from '../contexts/editor-context';
import { useTimelinePositioning } from './use-timeline-positioning';

interface SRTParseError {
  type: 'validation' | 'format' | 'timing' | 'encoding';
  message: string;
  line?: number;
  details?: string;
}

interface ParseSRTResult {
  success: boolean;
  captions?: Caption[];
  errors?: SRTParseError[];
  totalCaptions?: number;
}

interface GenerateFromTextParams {
  text: string;
  wordsPerMinute?: number;
  sentenceGapMs?: number;
}

interface CaptionsHookState {
  isProcessing: boolean;
  isError: boolean;
  error: string | null;
  lastParseResult: ParseSRTResult | null;
}

/**
 * Custom hook for managing caption operations including SRT parsing,
 * text generation, and validation
 */
export const useCaptions = () => {
  const [state, setState] = useState<CaptionsHookState>({
    isProcessing: false,
    isError: false,
    error: null,
    lastParseResult: null,
  });

  const {
    overlays,
    currentFrame,
    setOverlays,
    setSelectedOverlayId,
  } = useEditorContext();

  const { addAtPlayhead } = useTimelinePositioning();

  /**
   * Converts SRT timestamp format (HH:MM:SS,mmm) to milliseconds
   */
  const parseTimeString = useCallback((timeString: string): number => {
    try {
      const [time, milliseconds] = timeString.split(',');
      if (!time || milliseconds === undefined) {
        throw new Error('Invalid time format');
      }

      const [hours, minutes, seconds] = time.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(Number(milliseconds))) {
        throw new Error('Non-numeric time components');
      }

      if (hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
        throw new Error('Invalid time values');
      }

      const ms = Number(milliseconds);
      if (ms < 0 || ms >= 1000) {
        throw new Error('Invalid milliseconds value');
      }

      return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
    } catch (error) {
      throw new Error(`Failed to parse time "${timeString}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  /**
   * Removes HTML tags from SRT text while preserving line breaks
   */
  const cleanSRTText = useCallback((text: string): string => {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\{[^}]*\}/g, '') // Remove curly brace formatting
      .trim();
  }, []);

  /**
   * Validates SRT file structure and content
   */
  const validateSRTStructure = useCallback((content: string): SRTParseError[] => {
    const errors: SRTParseError[] = [];
    
    if (!content || content.trim().length === 0) {
      errors.push({
        type: 'validation',
        message: 'File is empty',
      });
      return errors;
    }

    // Check for basic SRT structure
    const lines = content.split('\n');
    if (lines.length < 3) {
      errors.push({
        type: 'validation',
        message: 'File too short - must contain at least one subtitle entry',
      });
    }

    // Check for presence of timestamp pattern
    const timestampPattern = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;
    if (!timestampPattern.test(content)) {
      errors.push({
        type: 'format',
        message: 'No valid SRT timestamps found. Expected format: HH:MM:SS,mmm --> HH:MM:SS,mmm',
      });
    }

    return errors;
  }, []);

  /**
   * Distributes words evenly across a caption's time duration
   */
  const distributeWordTiming = useCallback((
    words: string[],
    startMs: number,
    endMs: number
  ): CaptionWord[] => {
    if (words.length === 0) return [];
    
    const duration = endMs - startMs;
    const wordDuration = duration / words.length;

    return words.map((word, index) => ({
      word: word.trim(),
      startMs: Math.round(startMs + index * wordDuration),
      endMs: Math.round(startMs + (index + 1) * wordDuration),
      confidence: 0.95,
    }));
  }, []);

  /**
   * Parses SRT file content into Caption objects
   */
  const parseSRT = useCallback(async (content: string): Promise<ParseSRTResult> => {
    setState(prev => ({ ...prev, isProcessing: true, isError: false, error: null }));

    try {
      // Validate basic structure
      const structureErrors = validateSRTStructure(content);
      if (structureErrors.length > 0) {
        return { success: false, errors: structureErrors };
      }

      const captions: Caption[] = [];
      const errors: SRTParseError[] = [];
      
      // Split content into subtitle blocks
      const blocks = content.trim().split(/\n\s*\n/);
      
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex].trim();
        if (!block) continue;

        const lines = block.split('\n').map(line => line.trim());
        
        try {
          // Parse subtitle number
          const subtitleNumber = parseInt(lines[0]);
          if (isNaN(subtitleNumber)) {
            errors.push({
              type: 'format',
              message: `Invalid subtitle number: "${lines[0]}"`,
              line: blockIndex + 1,
            });
            continue;
          }

          // Parse timing line
          if (lines.length < 2) {
            errors.push({
              type: 'format',
              message: 'Missing timing line',
              line: blockIndex + 1,
            });
            continue;
          }

          const timingMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
          if (!timingMatch) {
            errors.push({
              type: 'format',
              message: `Invalid timing format: "${lines[1]}"`,
              line: blockIndex + 1,
              details: 'Expected format: HH:MM:SS,mmm --> HH:MM:SS,mmm',
            });
            continue;
          }

          const [, startTime, endTime] = timingMatch;
          
          let startMs: number;
          let endMs: number;
          
          try {
            startMs = parseTimeString(startTime);
            endMs = parseTimeString(endTime);
          } catch (error) {
            errors.push({
              type: 'timing',
              message: `Invalid time format in subtitle ${subtitleNumber}`,
              line: blockIndex + 1,
              details: error instanceof Error ? error.message : 'Unknown timing error',
            });
            continue;
          }

          // Validate timing logic
          if (startMs >= endMs) {
            errors.push({
              type: 'timing',
              message: `Start time must be before end time in subtitle ${subtitleNumber}`,
              line: blockIndex + 1,
            });
            continue;
          }

          // Extract subtitle text (lines 3 onwards)
          if (lines.length < 3) {
            errors.push({
              type: 'format',
              message: `No subtitle text found for subtitle ${subtitleNumber}`,
              line: blockIndex + 1,
            });
            continue;
          }

          const rawText = lines.slice(2).join('\n');
          const cleanText = cleanSRTText(rawText);
          
          if (!cleanText) {
            errors.push({
              type: 'validation',
              message: `Empty subtitle text for subtitle ${subtitleNumber}`,
              line: blockIndex + 1,
            });
            continue;
          }

          // Create word timing
          const words = cleanText.split(/\s+/).filter(word => word.length > 0);
          const wordTiming = distributeWordTiming(words, startMs, endMs);

          captions.push({
            text: cleanText,
            startMs,
            endMs,
            timestampMs: null,
            confidence: 0.95,
            words: wordTiming,
          });

        } catch (error) {
          errors.push({
            type: 'format',
            message: `Failed to parse subtitle block ${blockIndex + 1}`,
            line: blockIndex + 1,
            details: error instanceof Error ? error.message : 'Unknown parsing error',
          });
        }
      }

      // Sort captions by start time
      captions.sort((a, b) => a.startMs - b.startMs);

      // Validate timing overlaps
      for (let i = 0; i < captions.length - 1; i++) {
        const current = captions[i];
        const next = captions[i + 1];
        
        if (current.endMs > next.startMs) {
          errors.push({
            type: 'timing',
            message: `Subtitle timing overlap detected between subtitle ${i + 1} and ${i + 2}`,
            details: `Subtitle ${i + 1} ends at ${current.endMs}ms but subtitle ${i + 2} starts at ${next.startMs}ms`,
          });
        }
      }

      const result: ParseSRTResult = {
        success: captions.length > 0,
        captions: captions.length > 0 ? captions : undefined,
        errors: errors.length > 0 ? errors : undefined,
        totalCaptions: captions.length,
      };

      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        isError: !result.success,
        error: !result.success ? 'Failed to parse SRT file' : null,
        lastParseResult: result,
      }));

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        isError: true, 
        error: errorMessage,
        lastParseResult: { success: false, errors: [{ type: 'validation', message: errorMessage }] },
      }));

      return { 
        success: false, 
        errors: [{ type: 'validation', message: errorMessage }] 
      };
    }
  }, [validateSRTStructure, parseTimeString, cleanSRTText, distributeWordTiming]);

  /**
   * Generates captions from plain text input
   */
  const generateFromText = useCallback(async ({
    text,
    wordsPerMinute = 160,
    sentenceGapMs = 500,
  }: GenerateFromTextParams): Promise<Caption[]> => {
    setState(prev => ({ ...prev, isProcessing: true, isError: false, error: null }));

    try {
      if (!text.trim()) {
        throw new Error('Text cannot be empty');
      }

      const sentences = text
        .split(/[.!?]+/)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 0);

      if (sentences.length === 0) {
        throw new Error('No valid sentences found in text');
      }

      let currentStartTime = 0;
      const msPerWord = (60 * 1000) / wordsPerMinute;

      const captions: Caption[] = sentences.map((sentence) => {
        const words = sentence.split(/\s+/).filter(word => word.length > 0);
        const sentenceStartTime = currentStartTime;

        const wordTiming = distributeWordTiming(
          words,
          sentenceStartTime,
          sentenceStartTime + words.length * msPerWord
        );

        const caption: Caption = {
          text: sentence,
          startMs: sentenceStartTime,
          endMs: sentenceStartTime + words.length * msPerWord,
          timestampMs: null,
          confidence: 0.99,
          words: wordTiming,
        };

        currentStartTime = caption.endMs + sentenceGapMs;
        return caption;
      });

      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        lastParseResult: { success: true, captions, totalCaptions: captions.length },
      }));

      return captions;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate captions';
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        isError: true, 
        error: errorMessage,
      }));
      throw new Error(errorMessage);
    }
  }, [distributeWordTiming]);

  /**
   * Creates a caption overlay from caption data and adds it to the timeline
   */
  const createCaptionOverlay = useCallback((captions: Caption[]): CaptionOverlay => {
    if (captions.length === 0) {
      throw new Error('Cannot create overlay with empty captions');
    }

    // Calculate total duration
    const lastCaption = captions[captions.length - 1];
    const totalDurationMs = lastCaption.endMs;
    const calculatedDurationInFrames = Math.ceil((totalDurationMs / 1000) * 30);

    // Add at playhead position
    const { from, row, updatedOverlays } = addAtPlayhead(
      currentFrame,
      overlays,
      'top'
    );

    // Generate ID
    const newId = updatedOverlays.length > 0 ? Math.max(...updatedOverlays.map((o) => o.id)) + 1 : 0;

    const newCaptionOverlay: CaptionOverlay = {
      id: newId,
      type: OverlayType.CAPTION,
      from,
      durationInFrames: calculatedDurationInFrames,
      captions,
      left: 230,
      top: 414,
      width: 833,
      height: 269,
      rotation: 0,
      isDragging: false,
      row,
    };

    // Update overlays with both the shifted overlays and the new overlay in a single operation
    const finalOverlays = [...updatedOverlays, newCaptionOverlay];
    setOverlays(finalOverlays);
    setSelectedOverlayId(newId);
    
    return newCaptionOverlay;
  }, [addAtPlayhead, overlays, currentFrame, setOverlays, setSelectedOverlayId]);

  /**
   * Handles file upload and parsing
   */
  const handleFileUpload = useCallback(async (file: File): Promise<ParseSRTResult> => {
    if (!file) {
      throw new Error('No file provided');
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.srt')) {
      throw new Error('File must have .srt extension');
    }

    // Validate file size (max 1MB for SRT files)
    const maxSize = 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      throw new Error('File size too large. SRT files should be under 1MB.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) {
            reject(new Error('Failed to read file content'));
            return;
          }

          const result = await parseSRT(content);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file, 'utf-8');
    });
  }, [parseSRT]);

  /**
   * Resets the hook state
   */
  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      isError: false,
      error: null,
      lastParseResult: null,
    });
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    parseSRT,
    generateFromText,
    createCaptionOverlay,
    handleFileUpload,
    reset,
    
    // Utilities
    parseTimeString,
    cleanSRTText,
    distributeWordTiming,
  };
}; 