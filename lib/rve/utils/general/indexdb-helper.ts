/**
 * IndexedDB Helper Utility
 *
 * Provides functions to interact with IndexedDB for autosaving editor state.
 */

const DB_NAME = "VideoEditorProDB";
const DB_VERSION = 4;
const PROJECTS_STORE = "projects";
const AUTOSAVE_STORE = "autosave";

/**
 * Clear the database completely (useful for development/debugging)
 * @returns Promise that resolves when the database is cleared
 */
export const clearDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

    deleteRequest.onsuccess = () => {
      resolve();
    };

    deleteRequest.onerror = (event) => {
      console.error("[IndexedDB] Error clearing database:", event);
      reject("Error clearing database");
    };

    deleteRequest.onblocked = () => {
      console.warn(
        "[IndexedDB] Database deletion blocked - close all tabs using this database"
      );
      reject("Database deletion blocked");
    };
  });
};

/**
 * Initialize the IndexedDB database
 * @returns Promise that resolves when the database is ready
 */
export const initDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      console.error("[IndexedDB] IndexedDB not supported");
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      console.error("[IndexedDB] Error opening database:", error);

      // If it's a version error, provide more helpful information
      if (error && error.name === "VersionError") {
        console.error(
          "[IndexedDB] Database version conflict. Consider clearing the database or updating the version number."
        );
      }

      reject(
        new Error(
          `Error opening IndexedDB: ${error?.message || "Unknown error"}`
        )
      );
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create projects store
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projectsStore = db.createObjectStore(PROJECTS_STORE, {
          keyPath: "id",
        });
        projectsStore.createIndex("name", "name", { unique: false });
        projectsStore.createIndex("lastModified", "lastModified", {
          unique: false,
        });
      }

      // Create autosave store
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        const autosaveStore = db.createObjectStore(AUTOSAVE_STORE, {
          keyPath: "id",
        });
        autosaveStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
};

/**
 * Save editor state to autosave store
 * @param projectId Unique identifier for the project
 * @param editorState Current state of the editor
 * @returns Promise that resolves when the save is complete
 */
export const saveEditorState = async (
  projectId: string,
  editorState: any
): Promise<void> => {
  try {
    const db = await initDatabase();
    const transaction = db.transaction([AUTOSAVE_STORE], "readwrite");
    const store = transaction.objectStore(AUTOSAVE_STORE);

    const autosaveData = {
      id: projectId,
      editorState,
      timestamp: new Date().getTime(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(autosaveData);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        console.error("[IndexedDB] Error saving editor state:", event);
        reject(new Error("Error saving editor state"));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[IndexedDB] Failed to save editor state:", error);
    throw error;
  }
};

/**
 * Load editor state from autosave store
 * @param projectId Unique identifier for the project
 * @returns Promise that resolves with the editor state or null if not found
 */
export const loadEditorState = async (
  projectId: string
): Promise<any | null> => {
  try {
    const db = await initDatabase();
    const transaction = db.transaction([AUTOSAVE_STORE], "readonly");
    const store = transaction.objectStore(AUTOSAVE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(projectId);

      request.onsuccess = () => {
        const result = request.result;
        const editorState = result ? result.editorState : null;

        resolve(editorState);
      };

      request.onerror = (event) => {
        console.error("[IndexedDB] Error loading editor state:", event);
        reject(new Error("Error loading editor state"));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[IndexedDB] Failed to load editor state:", error);
    throw error;
  }
};

/**
 * Clear autosave data for a project
 * @param projectId Unique identifier for the project
 * @returns Promise that resolves when the delete is complete
 */
export const clearAutosave = async (projectId: string): Promise<void> => {
  try {
    const db = await initDatabase();
    const transaction = db.transaction([AUTOSAVE_STORE], "readwrite");
    const store = transaction.objectStore(AUTOSAVE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(projectId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        console.error("Error clearing autosave:", event);
        reject("Error clearing autosave");
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("Failed to clear autosave:", error);
    throw error;
  }
};

/**
 * Check if there's an autosave for a project
 * @param projectId Unique identifier for the project
 * @returns Promise that resolves with the timestamp of the autosave or null if not found
 */
export const hasAutosave = async (
  projectId: string
): Promise<number | null> => {
  try {
    const db = await initDatabase();
    const transaction = db.transaction([AUTOSAVE_STORE], "readonly");
    const store = transaction.objectStore(AUTOSAVE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(projectId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.timestamp : null);
      };

      request.onerror = (event) => {
        console.error("Error checking autosave:", event);
        reject("Error checking autosave");
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("Failed to check autosave:", error);
    throw error;
  }
};

/**
 * Get all autosave records
 * @returns Promise that resolves with an array of all autosave records
 */
export const getAllAutosaves = async (): Promise<
  Array<{ id: string; editorState: any; timestamp: number }>
> => {
  try {
    const db = await initDatabase();
    const transaction = db.transaction([AUTOSAVE_STORE], "readonly");
    const store = transaction.objectStore(AUTOSAVE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        // Sort by timestamp descending (newest first)
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };

      request.onerror = (event) => {
        console.error("Error getting all autosaves:", event);
        reject("Error getting all autosaves");
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("Failed to get all autosaves:", error);
    throw error;
  }
};
