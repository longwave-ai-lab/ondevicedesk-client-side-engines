const IDB_NAME = 'micro_utility_models_cache';
const IDB_STORE = 'weights';
const IDB_VERSION = 1;

/**
 * Checks whether Origin Private File System (OPFS) is supported in current environment.
 */
export async function isOpfsSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return false;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return !!root;
  } catch {
    return false;
  }
}

/**
 * Retrieves the OPFS root directory handle if supported, or null.
 */
export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    return null;
  }
  try {
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

/**
 * Open or create the IndexedDB database used for model caching fallback.
 */
function openModelDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSaveModel(modelKey: string, data: ArrayBuffer): Promise<boolean> {
  const db = await openModelDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ key: modelKey, data, cachedAt: Date.now() });
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbLoadModel(modelKey: string): Promise<ArrayBuffer | null> {
  const db = await openModelDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(modelKey);
      req.onsuccess = () => {
        db.close();
        if (req.result && req.result.data instanceof ArrayBuffer) {
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbDeleteModel(modelKey: string): Promise<boolean> {
  const db = await openModelDb();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(modelKey);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbHasModel(modelKey: string): Promise<boolean> {
  const data = await idbLoadModel(modelKey);
  return data !== null;
}

/**
 * Caches model weights to OPFS, with automatic IndexedDB fallback.
 */
export async function cacheModelWeights(
  modelKey: string,
  data: ArrayBuffer
): Promise<boolean> {
  try {
    const root = await getOpfsRoot();
    if (root) {
      const fileHandle = await root.getFileHandle(modelKey, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      return true;
    }
  } catch {
    // Fall through to IndexedDB fallback
  }

  return await idbSaveModel(modelKey, data);
}

/**
 * Loads cached model weights from OPFS, with automatic IndexedDB fallback.
 */
export async function loadCachedModelWeights(
  modelKey: string
): Promise<ArrayBuffer | null> {
  try {
    const root = await getOpfsRoot();
    if (root) {
      const fileHandle = await root.getFileHandle(modelKey);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    }
  } catch {
    // Fall through to IndexedDB fallback
  }

  return await idbLoadModel(modelKey);
}

/**
 * Checks if model weights are present in OPFS or IndexedDB cache.
 */
export async function hasCachedModel(modelKey: string): Promise<boolean> {
  try {
    const root = await getOpfsRoot();
    if (root) {
      await root.getFileHandle(modelKey);
      return true;
    }
  } catch {
    // Check fallback
  }

  return await idbHasModel(modelKey);
}

/**
 * Deletes cached model weights from OPFS and IndexedDB.
 */
export async function deleteCachedModel(modelKey: string): Promise<boolean> {
  let deletedAny = false;
  try {
    const root = await getOpfsRoot();
    if (root) {
      await root.removeEntry(modelKey);
      deletedAny = true;
    }
  } catch {
    // Ignore error if not found in OPFS
  }

  const idbDeleted = await idbDeleteModel(modelKey);
  return deletedAny || idbDeleted;
}

/**
 * Streams a model from a remote URL with byte progress callbacks and caches it into OPFS/IndexedDB.
 * If already cached, instantly resolves from cache without network traffic.
 */
export async function streamAndCacheModel(
  url: string,
  modelKey: string,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<ArrayBuffer> {
  // Check local cache first
  const cached = await loadCachedModelWeights(modelKey);
  if (cached) {
    if (onProgress) {
      onProgress(cached.byteLength, cached.byteLength);
    }
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model from ${url}: ${response.status} ${response.statusText}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  let buffer: ArrayBuffer;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        if (onProgress) {
          onProgress(loadedBytes, totalBytes > 0 ? totalBytes : loadedBytes);
        }
      }
    }

    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    buffer = merged.buffer;
  } else {
    buffer = await response.arrayBuffer();
    if (onProgress) {
      onProgress(buffer.byteLength, buffer.byteLength);
    }
  }

  // Persist into OPFS / IndexedDB
  await cacheModelWeights(modelKey, buffer);

  return buffer;
}
