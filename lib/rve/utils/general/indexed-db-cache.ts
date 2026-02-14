/**
 * Generic IndexedDB Cache Implementation
 * 
 * A reusable IndexedDB cache class that provides common caching operations
 * with automatic purging of old entries and deduplication of ongoing operations.
 */

import { isIndexedDBSupported } from './browser-check';

// Default cache retention period: 30 days
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CacheRecord {
  id: string;
}

export interface CacheMetadata {
  id: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface CacheConfig {
  dbName: string;
  storeName: string;
  version: number;
  maxAgeMs?: number; // Optional: max age for automatic cleanup (default: 30 days)
  purgeOnUpgrade?: boolean; // Optional: purge old records when upgrading (default: true)
}

/**
 * Generic IndexedDB cache class with automatic purging and deduplication
 */
export class IndexedDBCache<T extends CacheRecord> {
  private config: CacheConfig;
  private ongoingOperations = new Map<string, Promise<T | null>>();
  private maxAgeMs: number;
  private localStorageKey: string;
  private metadataStoreName: string;
  private purgeOnUpgrade: boolean;

  constructor(config: CacheConfig) {
    this.config = config;
    this.maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.localStorageKey = `lastCleanup_${config.storeName}`; // Always auto-generated
    this.metadataStoreName = `${config.storeName}_metadata`;
    this.purgeOnUpgrade = config.purgeOnUpgrade ?? true; // Default to true
  }

  /**
   * Open the IndexedDB database with proper upgrade handling
   */
  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!isIndexedDBSupported()) {
        reject(new Error('IndexedDB is not supported in this browser'));
        return;
      }

      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = (event) => {
        console.error(`[${this.config.dbName}] Error opening database:`, event);
        reject(new Error(`Could not open ${this.config.dbName}`));
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        
        // If upgrading and purgeOnUpgrade is enabled, clear old records
        if (oldVersion > 0 && this.purgeOnUpgrade) {
          console.log(`[${this.config.dbName}] Upgrading from version ${oldVersion} to ${this.config.version}, clearing old records...`);
          
          // Delete old stores if they exist
          if (db.objectStoreNames.contains(this.config.storeName)) {
            db.deleteObjectStore(this.config.storeName);
            console.log(`[${this.config.dbName}] Deleted old ${this.config.storeName} store`);
          }
          
          if (db.objectStoreNames.contains(this.metadataStoreName)) {
            db.deleteObjectStore(this.metadataStoreName);
            console.log(`[${this.config.dbName}] Deleted old ${this.metadataStoreName} store`);
          }
        }
        
        // Create main object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          db.createObjectStore(this.config.storeName, { keyPath: 'id' });
        }

        // Create metadata store if it doesn't exist
        if (!db.objectStoreNames.contains(this.metadataStoreName)) {
          const metadataStore = db.createObjectStore(this.metadataStoreName, { keyPath: 'id' });
          
          // Create index for metadata (for efficient pruning)
          metadataStore.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
        }
      };
    });
  }

  /**
   * Get a cached record by key
   * Automatically updates the lastUsedAt timestamp in metadata
   */
  async get(key: string): Promise<T | null> {
    try {
      if (!isIndexedDBSupported()) {
        return null;
      }

      const db = await this.openDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.config.storeName], 'readonly');
        const store = transaction.objectStore(this.config.storeName);
        
        const request = store.get(key);
        
        request.onsuccess = () => {
          const result = request.result as T | undefined;
          if (result) {
            // Update lastUsedAt timestamp in metadata (non-blocking)
            this.updateLastUsedAt(key).catch(error => 
              console.warn(`[${this.config.dbName}] Failed to update lastUsedAt for key ${key}:`, error)
            );
            resolve(result);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error getting cached record for key ${key}:`, event);
          reject(new Error(`Failed to get cached record for key ${key}`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`[${this.config.dbName}] Error getting cached record for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Update the lastUsedAt timestamp in metadata to indicate recent usage
   */
  private async updateLastUsedAt(key: string): Promise<void> {
    try {
      if (!isIndexedDBSupported()) {
        return;
      }

      const db = await this.openDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.metadataStoreName], 'readwrite');
        const metadataStore = transaction.objectStore(this.metadataStoreName);
        
        // First get the existing metadata
        const getRequest = metadataStore.get(key);
        
        getRequest.onsuccess = () => {
          const existingMetadata = getRequest.result as CacheMetadata | undefined;
          
          if (existingMetadata) {
            // Update the lastUsedAt timestamp
            const updatedMetadata: CacheMetadata = {
              ...existingMetadata,
              lastUsedAt: Date.now()
            };
            
            const putRequest = metadataStore.put(updatedMetadata);
            
            putRequest.onsuccess = () => {
              resolve();
            };
            
            putRequest.onerror = (event) => {
              console.error(`[${this.config.dbName}] Error updating lastUsedAt for key ${key}:`, event);
              reject(new Error(`Failed to update lastUsedAt for key ${key}`));
            };
          } else {
            // If no metadata exists, create it (this shouldn't happen in normal operation)
            console.warn(`[${this.config.dbName}] No metadata found for key ${key}, creating new metadata`);
            const newMetadata: CacheMetadata = {
              id: key,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            
            const putRequest = metadataStore.put(newMetadata);
            
            putRequest.onsuccess = () => {
              resolve();
            };
            
            putRequest.onerror = (event) => {
              console.error(`[${this.config.dbName}] Error creating metadata for key ${key}:`, event);
              reject(new Error(`Failed to create metadata for key ${key}`));
            };
          }
        };
        
        getRequest.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error getting metadata for key ${key}:`, event);
          reject(new Error(`Failed to get metadata for key ${key}`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`[${this.config.dbName}] Error updating lastUsedAt for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Store a record in the cache
   * Automatically creates metadata with timestamps and runs cleanup check
   */
  async put(record: T): Promise<void> {
    try {
      if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB is not supported');
      }

      const db = await this.openDB();
      const now = Date.now();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.config.storeName, this.metadataStoreName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const metadataStore = transaction.objectStore(this.metadataStoreName);
        
        // Store the main record
        const recordRequest = store.put(record);
        
        recordRequest.onsuccess = () => {
          // Create metadata record
          const metadata: CacheMetadata = {
            id: record.id,
            createdAt: now,
            lastUsedAt: now
          };
          
          const metadataRequest = metadataStore.put(metadata);
          
          metadataRequest.onsuccess = () => {
            resolve();
          };
          
          metadataRequest.onerror = (event) => {
            console.error(`[${this.config.dbName}] Error storing metadata for key ${record.id}:`, event);
            reject(new Error(`Failed to store metadata for key ${record.id}`));
          };
        };
        
        recordRequest.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error storing cached record for key ${record.id}:`, event);
          reject(new Error(`Failed to store cached record for key ${record.id}`));
        };
        
        transaction.oncomplete = () => {
          db.close();
          // Run cleanup check after successful put (non-blocking)
          this.checkAndRunCleanup().catch(error => 
            console.warn(`[${this.config.dbName}] Cleanup check failed for ${this.config.storeName}:`, error)
          );
        };
      });
    } catch (error) {
      console.error(`[${this.config.dbName}] Error storing cached record for key ${record.id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a record from the cache by key
   * Also deletes the associated metadata
   */
  async delete(key: string): Promise<boolean> {
    try {
      if (!isIndexedDBSupported()) {
        return false;
      }

      const db = await this.openDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.config.storeName, this.metadataStoreName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const metadataStore = transaction.objectStore(this.metadataStoreName);
        
        // Delete both the main record and metadata
        const recordRequest = store.delete(key);
        const metadataRequest = metadataStore.delete(key);
        
        let recordDeleted = false;
        let metadataDeleted = false;
        
        const checkComplete = () => {
          if (recordDeleted && metadataDeleted) {
            resolve(true);
          }
        };
        
        recordRequest.onsuccess = () => {
          recordDeleted = true;
          checkComplete();
        };
        
        metadataRequest.onsuccess = () => {
          metadataDeleted = true;
          checkComplete();
        };
        
        recordRequest.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error deleting cached record for key ${key}:`, event);
          reject(new Error(`Failed to delete cached record for key ${key}`));
        };
        
        metadataRequest.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error deleting metadata for key ${key}:`, event);
          reject(new Error(`Failed to delete metadata for key ${key}`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`[${this.config.dbName}] Error deleting cached record for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Prune old entries from the cache based on lastUsedAt in metadata
   */
  async pruneOldEntries(maxAgeMs: number): Promise<void> {
    try {
      if (!isIndexedDBSupported()) {
        return;
      }

      const db = await this.openDB();
      const cutoff = Date.now() - maxAgeMs;
      const cutoffDate = new Date(cutoff).toISOString();
      
      console.log(`[${this.config.dbName}] Starting prune of entries older than ${cutoffDate} (${maxAgeMs}ms ago)`);
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.config.storeName, this.metadataStoreName], 'readwrite');
        const store = transaction.objectStore(this.config.storeName);
        const metadataStore = transaction.objectStore(this.metadataStoreName);
        
        // Find the lastUsedAt index in metadata for pruning based on usage
        const lastUsedAtIndex = metadataStore.index('lastUsedAt');
        if (!lastUsedAtIndex) {
          console.warn(`[${this.config.dbName}] No 'lastUsedAt' index found for ${this.metadataStoreName}, skipping prune`);
          resolve();
          return;
        }
        
        let deletedCount = 0;
        const request = lastUsedAtIndex.openCursor(IDBKeyRange.upperBound(cutoff));
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
          if (cursor) {
            const metadata = cursor.value as CacheMetadata;
            const key = metadata.id;
            const lastUsedDate = new Date(metadata.lastUsedAt).toISOString();
            
            console.log(`[${this.config.dbName}] Deleting old entry: ${key} (last used: ${lastUsedDate})`);
            
            // Delete both the main record and metadata
            store.delete(key);
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            console.log(`[${this.config.dbName}] Prune completed. Deleted ${deletedCount} old entries`);
            resolve();
          }
        };
        
        request.onerror = (event) => {
          console.error(`[${this.config.dbName}] Error pruning old entries:`, event);
          reject(new Error(`Failed to prune old entries from ${this.config.storeName}`));
        };
        
        transaction.oncomplete = () => {
          db.close();
        };
      });
    } catch (error) {
      console.error(`[${this.config.dbName}] Error pruning old entries:`, error);
    }
  }

  /**
   * Check and run cleanup if it has been more than a day since the last cleanup
   * This is called automatically after put operations
   */
  private async checkAndRunCleanup(): Promise<void> {
    try {
      // Check if we should run cleanup (e.g., once per day)
      const lastCleanup = localStorage.getItem(this.localStorageKey);
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      if (!lastCleanup || (now - parseInt(lastCleanup)) > oneDay) {
        console.log(`[${this.config.dbName}] Running scheduled cleanup for ${this.config.storeName}...`);
        await this.pruneOldEntries(this.maxAgeMs);
        localStorage.setItem(this.localStorageKey, now.toString());
        console.log(`[${this.config.dbName}] Cleanup completed for ${this.config.storeName}`);
      }
    } catch (error) {
      console.warn(`[${this.config.dbName}] Smart cleanup failed for ${this.config.storeName}:`, error);
    }
  }

  /**
   * Get or create a cached record with deduplication
   * This prevents multiple concurrent operations for the same key
   */
  async getOrCreate<K>(
    key: string,
    factory: () => Promise<T>,
  ): Promise<T | null> {
    const operationKey = key;
    
    // Check if there's already an ongoing operation for this key
    if (this.ongoingOperations.has(operationKey)) {
      console.log(`[${this.config.dbName}] Reusing ongoing operation for key: ${operationKey}`);
      return this.ongoingOperations.get(operationKey)!;
    }

    // Create the operation promise immediately to prevent race conditions
    const operationPromise = (async () => {
      try {
        // Check cache first
        const cached = await this.get(key);
        if (cached) {
          return cached;
        }

        // Create the record if not cached
        const record = await factory();
        await this.put(record);
        // Return the original record (timestamps are handled in metadata)
        return record;
      } finally {
        // Clean up the ongoing operation when done
        this.ongoingOperations.delete(operationKey);
      }
    })();

    // Store the promise for concurrent requests immediately
    this.ongoingOperations.set(operationKey, operationPromise);

    return operationPromise;
  }
}
