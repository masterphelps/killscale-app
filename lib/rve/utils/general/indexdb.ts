/**
 * IndexedDB Utility
 * 
 * This utility provides functions to:
 * - Initialize the database
 * - Add, retrieve, update, and delete media items
 * - Query media items by user ID
 */

import { isIndexedDBSupported } from './browser-check';

// Database configuration
const DB_NAME = 'VideoEditorDB';
const DB_VERSION = 4; // Increment version to handle blob storage and fix version conflicts
const MEDIA_STORE = 'userMedia';

// Media item interface
export interface UserMediaItem {
  id: string;
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  serverPath: string;
  size: number;
  lastModified: number;
  thumbnail?: string;
  duration?: number;
  createdAt: number;
  fileBlob?: Blob; // Store the actual file data for client-side storage
}

/**
 * Initialize the IndexedDB database
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBSupported()) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      console.error('Error opening IndexedDB:', event);
      
      // If it's a version error, provide more helpful information
      if (error && error.name === 'VersionError') {
        console.error('Database version conflict detected. The database may need to be cleared.');
        console.error('To fix this, you can call clearIndexedDB() from the browser console.');
        
        // Automatically attempt to clear and recreate the database
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          console.log('Database cleared due to version conflict. Retrying...');
          // Retry opening the database
          const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
          retryRequest.onsuccess = (retryEvent) => {
            const db = (retryEvent.target as IDBOpenDBRequest).result;
            resolve(db);
          };
          retryRequest.onerror = () => {
            reject(new Error('Could not open IndexedDB after clearing'));
          };
          retryRequest.onupgradeneeded = (retryEvent) => {
            const db = (retryEvent.target as IDBOpenDBRequest).result;
            
            // Create object store for user media
            if (!db.objectStoreNames.contains(MEDIA_STORE)) {
              const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
              store.createIndex('userId', 'userId', { unique: false });
              store.createIndex('type', 'type', { unique: false });
              store.createIndex('createdAt', 'createdAt', { unique: false });
            }
          };
        };
        deleteRequest.onerror = () => {
          reject(new Error('Could not clear IndexedDB to resolve version conflict'));
        };
      } else {
        reject(new Error('Could not open IndexedDB'));
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store for user media
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

/**
 * Add a media item to the database
 */
export const addMediaItem = async (mediaItem: UserMediaItem): Promise<string> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      
      const request = store.add(mediaItem);
      
      request.onsuccess = () => {
        resolve(mediaItem.id);
      };
      
      request.onerror = (event) => {
        console.error('Error adding media item:', event);
        reject(new Error('Failed to add media item'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in addMediaItem:', error);
    throw error;
  }
};

/**
 * Get a media item by ID
 */
export const getMediaItem = async (id: string): Promise<UserMediaItem | null> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      
      const request = store.get(id);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = (event) => {
        console.error('Error getting media item:', event);
        reject(new Error('Failed to get media item'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in getMediaItem:', error);
    // Return null instead of throwing if IndexedDB is not supported
    if (error instanceof Error && error.message.includes('not supported')) {
      return null;
    }
    throw error;
  }
};

/**
 * Get all media items for a user
 */
export const getUserMediaItems = async (userId: string): Promise<UserMediaItem[]> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      const index = store.index('userId');
      
      const request = index.getAll(userId);
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = (event) => {
        console.error('Error getting user media items:', event);
        reject(new Error('Failed to get user media items'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in getUserMediaItems:', error);
    // Return empty array instead of throwing if IndexedDB is not supported
    if (error instanceof Error && error.message.includes('not supported')) {
      return [];
    }
    throw error;
  }
};

/**
 * Delete a media item by ID
 */
export const deleteMediaItem = async (id: string): Promise<boolean> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve(true);
      };
      
      request.onerror = (event) => {
        console.error('Error deleting media item:', event);
        reject(new Error('Failed to delete media item'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in deleteMediaItem:', error);
    // Return false instead of throwing if IndexedDB is not supported
    if (error instanceof Error && error.message.includes('not supported')) {
      return false;
    }
    throw error;
  }
};

/**
 * Clear all media items for a user
 */
export const clearUserMedia = async (userId: string): Promise<boolean> => {
  try {
    // Get all user media items
    const mediaItems = await getUserMediaItems(userId);
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      
      // Delete each item
      let deleteCount = 0;
      
      for (const item of mediaItems) {
        // Revoke blob URL if it exists
        if (item.serverPath && item.serverPath.startsWith('blob:')) {
          URL.revokeObjectURL(item.serverPath);
        }
        
        const request = store.delete(item.id);
        
        request.onsuccess = () => {
          deleteCount++;
          if (deleteCount === mediaItems.length) {
            resolve(true);
          }
        };
        
        request.onerror = (event) => {
          console.error('Error deleting media item:', event);
          reject(new Error('Failed to clear user media'));
        };
      }
      
      // If there are no items to delete, resolve immediately
      if (mediaItems.length === 0) {
        resolve(true);
      }
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in clearUserMedia:', error);
    // Return false instead of throwing if IndexedDB is not supported
    if (error instanceof Error && error.message.includes('not supported')) {
      return false;
    }
    throw error;
  }
};

/**
 * Get a blob URL for a media item stored in IndexedDB
 * This creates a new blob URL from the stored file data
 */
export const getMediaBlobUrl = async (id: string): Promise<string | null> => {
  try {
    const mediaItem = await getMediaItem(id);
    if (!mediaItem || !mediaItem.fileBlob) {
      return null;
    }
    
    // Create a new blob URL from the stored blob
    return URL.createObjectURL(mediaItem.fileBlob);
  } catch (error) {
    console.error('Error getting media blob URL:', error);
    return null;
  }
};

/**
 * Update a media item's blob URL (useful when URLs need to be refreshed)
 */
export const refreshMediaBlobUrl = async (id: string): Promise<string | null> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const mediaItem = getRequest.result as UserMediaItem;
        
        if (!mediaItem || !mediaItem.fileBlob) {
          resolve(null);
          return;
        }
        
        // Revoke old URL if it exists
        if (mediaItem.serverPath && mediaItem.serverPath.startsWith('blob:')) {
          URL.revokeObjectURL(mediaItem.serverPath);
        }
        
        // Create new blob URL
        const newBlobUrl = URL.createObjectURL(mediaItem.fileBlob);
        mediaItem.serverPath = newBlobUrl;
        
        // Update the item in the database
        const putRequest = store.put(mediaItem);
        
        putRequest.onsuccess = () => {
          resolve(newBlobUrl);
        };
        
        putRequest.onerror = (event) => {
          console.error('Error updating media item blob URL:', event);
          resolve(null);
        };
      };
      
      getRequest.onerror = (event) => {
        console.error('Error getting media item for URL refresh:', event);
        reject(new Error('Failed to refresh blob URL'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Error in refreshMediaBlobUrl:', error);
    return null;
  }
};

/**
 * Utility function to clear the IndexedDB database completely
 * This can be called from the browser console to fix version conflicts
 */
export const clearIndexedDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    
    deleteRequest.onsuccess = () => {
      console.log('IndexedDB database cleared successfully');
      resolve();
    };
    
    deleteRequest.onerror = (event) => {
      console.error('Error clearing IndexedDB database:', event);
      reject(new Error('Failed to clear IndexedDB database'));
    };
    
    deleteRequest.onblocked = () => {
      console.warn('IndexedDB deletion blocked. Please close all tabs using this application and try again.');
      reject(new Error('IndexedDB deletion blocked'));
    };
  });
};

// Make clearIndexedDB available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).clearIndexedDB = clearIndexedDB;
}
