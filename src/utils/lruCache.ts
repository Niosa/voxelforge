/**
 * Minimal LRU (least-recently-used) cache with a hard size cap.
 * Used to bound canvas/texture caches so long sessions on low-memory
 * devices (older iPads) don't grow memory until Safari kills the tab.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number, private readonly onEvict?: (key: K, value: V) => void) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Refresh recency
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const oldestVal = this.map.get(oldest);
      if (this.onEvict && oldestVal !== undefined) {
        this.onEvict(oldest, oldestVal);
      }
      this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
