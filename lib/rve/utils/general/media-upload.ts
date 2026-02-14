/**
 * Media Upload Utility (Hybrid Approach)
 *
 * This utility provides functions for:
 * - Uploading media files to the server (development)
 * - Falling back to client-side blob storage (production)
 * - Generating thumbnails
 * - Getting media duration
 */

import { getUserId } from "./user-id";
import { UserMediaItem, addMediaItem } from "./indexdb";
import { MediaBunnyThumbnailService } from "../../services/media-bunny-thumbnail-service";
import { getSrcDuration } from "../../hooks/use-src-duration";

/**
 * Uploads a file with hybrid approach: server upload with blob fallback
 * Tries server upload first, falls back to blob storage if server fails
 */
export const uploadMediaFile = async (file: File): Promise<UserMediaItem> => {
  try {
    // Generate thumbnail and get duration using new media-parser
    const thumbnail = await generateThumbnail(file);
    let duration: number | undefined;
    
    // Only try to get duration for video and audio files, not images
    if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
      try {
        const result = await getSrcDuration(file);
        duration = result.durationInSeconds;
      } catch (error) {
        console.warn("Failed to get duration with media-parser, falling back to legacy method:", error);
        duration = await getMediaDuration(file);
      }
    } else {
      // Images don't have duration, set to undefined
      duration = undefined;
    }

    // Determine file type
    let fileType: "video" | "image" | "audio";
    if (file.type.startsWith("video/")) {
      fileType = "video";
    } else if (file.type.startsWith("image/")) {
      fileType = "image";
    } else if (file.type.startsWith("audio/")) {
      fileType = "audio";
    } else {
      throw new Error("Unsupported file type");
    }

    // Get user ID
    const userId = getUserId();
    
    // Try server upload first
    try {
      const serverResult = await uploadToServer(file, userId);
      
      // Create media item for IndexedDB with server path
      const mediaItem: UserMediaItem = {
        id: serverResult.id,
        userId,
        name: file.name,
        type: fileType,
        serverPath: serverResult.serverPath,
        size: serverResult.size,
        lastModified: file.lastModified,
        thumbnail: thumbnail || "",
        duration: duration || 0,
        createdAt: Date.now(),
      };

      // Store in IndexedDB
      await addMediaItem(mediaItem);
      return mediaItem;
      
    } catch (serverError) {
      console.warn("Server upload failed, falling back to blob storage:", serverError);
      
      // Fallback to blob storage
      return await uploadAsBlob(file, userId, fileType, thumbnail, duration);
    }

  } catch (error) {
    console.error("Error uploading media file:", error);
    throw error;
  }
};

/**
 * Attempts to upload file to server
 */
async function uploadToServer(file: File, userId: string) {
  // Create form data for upload
  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  // Upload file to server
  const response = await fetch("/api/latest/local-media/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to upload file");
  }

  return await response.json();
}

/**
 * Stores file as blob in IndexedDB (fallback for production)
 */
async function uploadAsBlob(
  file: File, 
  userId: string, 
  fileType: "video" | "image" | "audio", 
  thumbnail: string, 
  duration: number | undefined
): Promise<UserMediaItem> {
  // Generate a unique ID for the file
  const fileId = crypto.randomUUID();

  // Convert file to blob for storage in IndexedDB
  const fileBlob = new Blob([file], { type: file.type });
  
  // Create blob URL immediately for use as serverPath
  const blobUrl = URL.createObjectURL(fileBlob);
  
  // Create media item for IndexedDB with blob storage
  const mediaItem: UserMediaItem = {
    id: fileId,
    userId,
    name: file.name,
    type: fileType,
    serverPath: blobUrl, // Use actual blob URL directly
    size: file.size,
    lastModified: file.lastModified,
    thumbnail: thumbnail || "",
    duration: duration || 0,
    createdAt: Date.now(),
    fileBlob: fileBlob, // Store the actual file data for later blob URL creation if needed
  };

  // Store in IndexedDB
  await addMediaItem(mediaItem);
  return mediaItem;
}

/**
 * Generates a thumbnail for image or video files using MediaBunny for videos
 */
export const generateThumbnail = async (file: File): Promise<string> => {
  if (file.type.startsWith("image/")) {
    // For images, use FileReader as before
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve((e.target?.result as string) || "");
      };
      reader.onerror = () => {
        console.error("Error reading image file");
        resolve("");
      };
      reader.readAsDataURL(file);
    });
  } else if (file.type.startsWith("video/")) {
    // For videos, use MediaBunny for more reliable thumbnail generation
    try {
      const thumbnail = await MediaBunnyThumbnailService.generateThumbnail(file, {
        width: 320,
        height: 180,
        timestampSeconds: 1, // Capture at 1 second
        quality: 0.8,
      });
      return thumbnail;
    } catch (error) {
      console.error("MediaBunny thumbnail generation failed, falling back to canvas method:", error);
      
      // Fallback to the old canvas method if MediaBunny fails
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";

        // Set timeout to handle cases where video loading hangs
        const timeoutId = setTimeout(() => {
          console.warn("Video thumbnail generation timed out");
          resolve("");
        }, 5000); // 5 second timeout

        video.onloadedmetadata = () => {
          // Set the time to 1 second or the middle of the video
          video.currentTime = Math.min(1, video.duration / 2);
        };

        video.onloadeddata = () => {
          clearTimeout(timeoutId);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnail = canvas.toDataURL("image/jpeg");
            resolve(thumbnail);
          } catch (error) {
            console.error("Error generating video thumbnail:", error);
            resolve("");
          } finally {
            URL.revokeObjectURL(video.src);
          }
        };

        video.onerror = () => {
          clearTimeout(timeoutId);
          console.error("Error loading video for thumbnail");
          URL.revokeObjectURL(video.src);
          resolve("");
        };

        video.src = URL.createObjectURL(file);
      });
    }
  } else {
    // For audio files, use a default audio icon
    return "";
  }
};

/**
 * Gets the duration of a media file using MediaBunny for videos
 */
export const getMediaDuration = async (
  file: File
): Promise<number | undefined> => {
  if (file.type.startsWith("video/")) {
    // For videos, try MediaBunny first for more reliable duration detection
    try {
      const metadata = await MediaBunnyThumbnailService.getVideoMetadata(file);
      return metadata.duration;
    } catch (error) {
      console.error("MediaBunny duration detection failed, falling back to HTML video element:", error);
      
      // Fallback to HTML video element
      return new Promise((resolve) => {
        const video = document.createElement("video");

        // Set timeout to handle cases where media loading hangs
        const timeoutId = setTimeout(() => {
          console.warn("Video duration detection timed out");
          URL.revokeObjectURL(video.src);
          resolve(undefined);
        }, 5000); // 5 second timeout

        video.preload = "metadata";
        video.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          resolve(video.duration);
          URL.revokeObjectURL(video.src);
        };
        video.onerror = () => {
          clearTimeout(timeoutId);
          console.error("Error getting video duration");
          URL.revokeObjectURL(video.src);
          resolve(undefined);
        };
        video.src = URL.createObjectURL(file);
      });
    }
  } else if (file.type.startsWith("audio/")) {
    // For audio files, continue using HTML audio element
    return new Promise((resolve) => {
      const audio = document.createElement("audio");

      // Set timeout to handle cases where media loading hangs
      const timeoutId = setTimeout(() => {
        console.warn("Audio duration detection timed out");
        URL.revokeObjectURL(audio.src);
        resolve(undefined);
      }, 5000); // 5 second timeout

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        clearTimeout(timeoutId);
        resolve(audio.duration);
        URL.revokeObjectURL(audio.src);
      };
      audio.onerror = () => {
        clearTimeout(timeoutId);
        console.error("Error getting audio duration");
        URL.revokeObjectURL(audio.src);
        resolve(undefined);
      };
      audio.src = URL.createObjectURL(file);
    });
  }
  return undefined;
};

/**
 * Deletes a media file from the server
 */
export const deleteMediaFile = async (
  userId: string,
  filePath: string
): Promise<boolean> => {
  try {
    const response = await fetch("/api/media/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, filePath }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete file");
    }

    return true;
  } catch (error) {
    console.error("Error deleting media file:", error);
    return false;
  }
};
