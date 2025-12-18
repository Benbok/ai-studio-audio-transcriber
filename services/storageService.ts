/**
 * IndexedDB Storage Service for Recording History
 * Stores audio blobs and transcription metadata
 */

const DB_NAME = 'VoiceScribeDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

export interface RecordingMetadata {
    id?: number;
    timestamp: number;
    duration?: number; // in seconds
    mode: string;
    provider: string;
    tone?: string;
    text: string;
    audioBlob: Blob;
    mimeType: string;
}

/**
 * Initialize IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                // Create indexes for efficient querying
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                objectStore.createIndex('mode', 'mode', { unique: false });
                objectStore.createIndex('provider', 'provider', { unique: false });
            }
        };
    });
};

/**
 * Save a new recording to IndexedDB
 */
export const saveRecording = async (
    audioBlob: Blob,
    text: string,
    metadata: {
        mode: string;
        provider: string;
        tone?: string;
        duration?: number;
    }
): Promise<number> => {
    const db = await initDB();

    const recording: RecordingMetadata = {
        timestamp: Date.now(),
        text,
        audioBlob,
        mimeType: audioBlob.type || 'audio/webm',
        ...metadata,
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(recording);

        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get all recordings (sorted by timestamp, newest first)
 */
export const getAllRecordings = async (): Promise<RecordingMetadata[]> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev'); // Descending order

        const recordings: RecordingMetadata[] = [];

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
                recordings.push(cursor.value);
                cursor.continue();
            } else {
                resolve(recordings);
            }
        };

        request.onerror = () => reject(request.error);
    });
};

/**
 * Get a single recording by ID
 */
export const getRecording = async (id: number): Promise<RecordingMetadata | null> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Update an existing recording (e.g., after re-transcription)
 */
export const updateRecording = async (
    id: number,
    updates: Partial<RecordingMetadata>
): Promise<void> => {
    const db = await initDB();
    const existing = await getRecording(id);

    if (!existing) {
        throw new Error(`Recording with id ${id} not found`);
    }

    const updated = { ...existing, ...updates, id };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(updated);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

/**
 * Delete a recording by ID
 */
export const deleteRecording = async (id: number): Promise<void> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get the audio blob for a recording
 */
export const getRecordingAudio = async (id: number): Promise<Blob | null> => {
    const recording = await getRecording(id);
    return recording?.audioBlob || null;
};

/**
 * Clear all recordings (for testing or user request)
 */
export const clearAllRecordings = async (): Promise<void> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};
