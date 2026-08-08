import type { TerraEntity } from '@/entities/types';

export interface PlaceSearchResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  category: string;
  isRealEarth?: boolean;
}

const SEARCH_CACHE_PREFIX = 'tf_search_cache_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 Hours

function getCachedSearchResults(query: string): PlaceSearchResult[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const key = SEARCH_CACHE_PREFIX + query.toLowerCase().trim();
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
        return parsed.results;
      }
    }
  } catch (err) {
    console.warn('Search cache read error:', err);
  }
  return null;
}

function setCachedSearchResults(query: string, results: PlaceSearchResult[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = SEARCH_CACHE_PREFIX + query.toLowerCase().trim();
    const data = JSON.stringify({
      results,
      timestamp: Date.now(),
    });
    localStorage.setItem(key, data);
  } catch (err) {
    // Gracefully handle localStorage quota limits
  }
}

export function rebuildSearchIndex(_entities: unknown): void {
  // MiniSearch index placeholder
}

/**
 * Searches local entities in the active world store.
 */
export function searchLocalEntities(
  query: string,
  entities: Record<string, TerraEntity>,
): PlaceSearchResult[] {
  if (!query || query.trim().length < 2) return [];

  const q = query.toLowerCase().trim();
  const results: PlaceSearchResult[] = [];

  for (const entity of Object.values(entities)) {
    if (
      entity.name.toLowerCase().includes(q) ||
      entity.tags.some((t) => t.toLowerCase().includes(q)) ||
      entity.type.toLowerCase().includes(q)
    ) {
      results.push({
        id: entity.id,
        name: entity.name,
        displayName: `${entity.name} (${entity.type})`,
        lat: 0,
        lon: 0,
        type: entity.type,
        category: 'Local Place',
        isRealEarth: false,
      });
    }
  }

  return results;
}

/**
 * Searches real-world locations via OpenStreetMap Nominatim API with persistent caching.
 */
export async function searchRealEarthPlaces(
  query: string,
): Promise<PlaceSearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.toLowerCase().trim();

  // Try local storage cache first to avoid hitting the API
  // Storage may be unavailable on mobile in private mode
  if (typeof localStorage !== 'undefined') {
    const cached = getCachedSearchResults(cleanQuery);
    if (cached) {
      return cached;
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(
      query.trim(),
    )}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
      type: string;
      class: string;
    }>;

    const results = data.map((item) => {
      const parts = item.display_name.split(',');
      const shortName = parts[0] ? parts[0].trim() : item.display_name;
      return {
        id: `nominatim-${item.place_id}`,
        name: shortName,
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type || 'place',
        category: item.class || 'landmark',
        isRealEarth: true,
      };
    });

    // Write to cache
    if (typeof localStorage !== 'undefined') {
      setCachedSearchResults(cleanQuery, results);
    }

    return results;
  } catch (err) {
    console.warn('Real Earth geocoding note:', err);
    return [];
  }
}
