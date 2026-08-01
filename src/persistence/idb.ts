import type { World } from '@/entities/types';

const DB_NAME = 'terraforge_db';
const DB_VERSION = 1;
const STORE_WORLDS = 'worlds';

export interface WorldSummary {
  id: string;
  name: string;
  entityCount: number;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_WORLDS)) {
        db.createObjectStore(STORE_WORLDS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWorldToDB(world: World): Promise<void> {
  // IndexedDB may not be available on mobile browsers in private/incognito mode
  if (typeof indexedDB === 'undefined') {
    console.warn('IndexedDB not available - persistence disabled');
    return;
  }
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_WORLDS, 'readwrite');
    const store = tx.objectStore(STORE_WORLDS);

    const record = {
      ...world,
      updatedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save world to IndexedDB:', err);
  }
}

export async function loadWorldFromDB(id: string): Promise<World | null> {
  if (typeof indexedDB === 'undefined') {
    return null;
  }
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_WORLDS, 'readonly');
    const store = tx.objectStore(STORE_WORLDS);

    return await new Promise<World | null>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as World | null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load world from IndexedDB:', err);
    return null;
  }
}

export async function getAllWorldsFromDB(): Promise<WorldSummary[]> {
  if (typeof indexedDB === 'undefined') {
    return [];
  }
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_WORLDS, 'readonly');
    const store = tx.objectStore(STORE_WORLDS);

    const rawWorlds = await new Promise<unknown[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });

    return rawWorlds.map((item) => {
      const w = item as World;
      return {
        id: w.id,
        name: w.name,
        entityCount: w.entities ? Object.keys(w.entities).length : 0,
        updatedAt: (item as { updatedAt?: number }).updatedAt ?? Date.now(),
      };
    });
  } catch (err) {
    console.warn('Failed to fetch worlds from IndexedDB:', err);
    return [];
  }
}

export async function deleteWorldFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_WORLDS, 'readwrite');
    const store = tx.objectStore(STORE_WORLDS);

    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete world from IndexedDB:', err);
  }
}
