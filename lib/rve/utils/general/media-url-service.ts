/**
 * Media URL Service
 * 
 * Handles media URLs for both server-stored files and blob storage.
 * Provides a unified interface for accessing media files regardless of storage method.
 */

/**
 * Gets the actual URL for a media file, handling both server paths and blob URLs
 * @param mediaPath - The serverPath from a UserMediaItem
 * @returns The actual URL to use for the media file
 */
export const getMediaUrl = async (mediaPath: string): Promise<string> => {
  // If it's already a blob URL, return as-is
  if (mediaPath.startsWith('blob:')) {
    return mediaPath;
  }
  
  // For server paths, return as-is (they will work with the serve endpoint)
  return mediaPath;
};

/**
 * Gets the serve URL for a media file (for server-stored files)
 * @param serverPath - The server path (e.g., "/users/userId/filename.mp4")
 * @returns The serve endpoint URL
 */
export const getServeUrl = (serverPath: string): string => {
  // Remove leading slash and construct serve URL
  const cleanPath = serverPath.startsWith('/') ? serverPath.slice(1) : serverPath;
  return `/api/latest/local-media/serve/${cleanPath}`;
};

/**
 * Checks if a media path is a blob URL
 * @param mediaPath - The serverPath from a UserMediaItem
 * @returns True if this is a blob URL
 */
export const isBlobUrl = (mediaPath: string): boolean => {
  return mediaPath.startsWith('blob:');
};

/**
 * Checks if a media path is a server path
 * @param mediaPath - The serverPath from a UserMediaItem
 * @returns True if this is a server path
 */
export const isServerPath = (mediaPath: string): boolean => {
  return !mediaPath.startsWith('blob:');
};

/**
 * Revokes a blob URL if it's a blob URL
 * @param url - The URL to potentially revoke
 */
export const revokeBlobUrl = (url: string): void => {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}; 