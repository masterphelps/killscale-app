/**
 * MediaBunny Thumbnail Service
 * 
 * Provides reliable thumbnail generation using MediaBunny for video files.
 * This service is designed to be used during the media upload process to generate
 * high-quality thumbnails that work consistently across different video formats and codecs.
 */

import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  timestampSeconds?: number; // Time in video to capture thumbnail from
  quality?: number; // JPEG quality (0-1)
}

export class MediaBunnyThumbnailService {
  private static readonly DEFAULT_WIDTH = 320;
  private static readonly DEFAULT_HEIGHT = 180;
  private static readonly DEFAULT_QUALITY = 0.8;
  private static readonly DEFAULT_TIMESTAMP = 1; // 1 second into video

  /**
   * Generate a thumbnail from a video file using MediaBunny
   * @param file - The video file to generate thumbnail from
   * @param options - Optional configuration for thumbnail generation
   * @returns Promise that resolves to a base64 data URL of the thumbnail
   */
  static async generateThumbnail(
    file: File,
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      width = MediaBunnyThumbnailService.DEFAULT_WIDTH,
      height = MediaBunnyThumbnailService.DEFAULT_HEIGHT,
      timestampSeconds = MediaBunnyThumbnailService.DEFAULT_TIMESTAMP,
      quality = MediaBunnyThumbnailService.DEFAULT_QUALITY,
    } = options;

    try {
      // Create MediaBunny input from file
      const input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      });

      // Get the primary video track
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error('File has no video track');
      }

      if (videoTrack.codec === null) {
        throw new Error('Unsupported video codec');
      }

      if (!(await videoTrack.canDecode())) {
        throw new Error('Unable to decode the video track');
      }

      // Get video duration and calculate appropriate timestamp
      const videoDuration = await videoTrack.computeDuration();
      const firstTimestamp = await videoTrack.getFirstTimestamp();
      
      // Use the smaller of requested timestamp or middle of video
      const targetTimestamp = Math.min(timestampSeconds, videoDuration / 2);
      const actualTimestamp = firstTimestamp + targetTimestamp;

      // Calculate dimensions maintaining aspect ratio
      const videoWidth = videoTrack.displayWidth;
      const videoHeight = videoTrack.displayHeight;
      const aspectRatio = videoWidth / videoHeight;

      let thumbnailWidth = width;
      let thumbnailHeight = height;

      // Maintain aspect ratio
      if (aspectRatio > width / height) {
        // Video is wider
        thumbnailHeight = Math.floor(width / aspectRatio);
      } else {
        // Video is taller or same ratio
        thumbnailWidth = Math.floor(height * aspectRatio);
      }

      // Create a CanvasSink for extracting resized frames
      const sink = new CanvasSink(videoTrack, {
        width: thumbnailWidth,
        height: thumbnailHeight,
        fit: 'fill',
      });

      // Generate thumbnail at the target timestamp
      const timestamps = [actualTimestamp];
      let dataUrl = '';

      // Get the thumbnail at the specified timestamp
      for await (const wrappedCanvas of sink.canvasesAtTimestamps(timestamps)) {
        if (wrappedCanvas) {
          const canvas = wrappedCanvas.canvas as HTMLCanvasElement;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          break; // We only need the first (and only) thumbnail
        }
      }
      
      return dataUrl;

    } catch (error) {
      console.error('MediaBunny thumbnail generation failed:', error);
      
      // Fallback to empty string if MediaBunny fails
      // This allows the upload to continue even if thumbnail generation fails
      return '';
    }
  }

  /**
   * Generate multiple thumbnails from a video file at different timestamps
   * @param file - The video file to generate thumbnails from
   * @param timestamps - Array of timestamps (in seconds) to capture
   * @param options - Optional configuration for thumbnail generation
   * @returns Promise that resolves to an array of base64 data URLs
   */
  static async generateMultipleThumbnails(
    file: File,
    timestamps: number[],
    options: ThumbnailOptions = {}
  ): Promise<string[]> {
    const thumbnails: string[] = [];

    for (const timestamp of timestamps) {
      try {
        const thumbnail = await MediaBunnyThumbnailService.generateThumbnail(file, {
          ...options,
          timestampSeconds: timestamp,
        });
        thumbnails.push(thumbnail);
      } catch (error) {
        console.error(`Failed to generate thumbnail at ${timestamp}s:`, error);
        thumbnails.push(''); // Add empty string for failed thumbnails
      }
    }

    return thumbnails;
  }

  /**
   * Get video metadata using MediaBunny
   * @param file - The video file to analyze
   * @returns Promise that resolves to video metadata
   */
  static async getVideoMetadata(file: File): Promise<{
    duration: number;
    width: number;
    height: number;
    codec: string | null;
    canDecode: boolean;
  }> {
    try {
      const input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      });

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error('File has no video track');
      }

      const duration = await videoTrack.computeDuration();
      const canDecode = await videoTrack.canDecode();

      return {
        duration,
        width: videoTrack.displayWidth,
        height: videoTrack.displayHeight,
        codec: videoTrack.codec,
        canDecode,
      };
    } catch (error) {
      console.error('Failed to get video metadata:', error);
      throw error;
    }
  }

  /**
   * Check if a file can be processed by MediaBunny
   * @param file - The file to check
   * @returns Promise that resolves to true if file can be processed
   */
  static async canProcessFile(file: File): Promise<boolean> {
    try {
      const input = new Input({
        source: new BlobSource(file),
        formats: ALL_FORMATS,
      });

      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        return false;
      }

      return await videoTrack.canDecode();
    } catch (error) {
      console.error('Cannot process file with MediaBunny:', error);
      return false;
    }
  }
} 