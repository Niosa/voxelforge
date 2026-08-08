type BorderRing = [number, number][];

let countryBordersCache: BorderRing[] | null = null;
let stateBordersCache: BorderRing[] | null = null;
let cityBordersCache: BorderRing[] | null = null;

let countryPromise: Promise<BorderRing[]> | null = null;
let statePromise: Promise<BorderRing[]> | null = null;
let cityPromise: Promise<BorderRing[]> | null = null;

/**
 * Dynamically loads and caches country & coastline rings on demand.
 */
export async function getCountryBorders(): Promise<BorderRing[]> {
  if (countryBordersCache) return countryBordersCache;
  if (!countryPromise) {
    countryPromise = Promise.all([
      import('./precision_country_rings.json'),
      import('./precision_coastline_rings.json'),
    ]).then(([countryData, coastlineData]) => {
      const combined = [
        ...(countryData.default as BorderRing[]),
        ...(coastlineData.default as BorderRing[]),
      ];
      countryBordersCache = combined;
      return combined;
    });
  }
  return countryPromise;
}

/**
 * Dynamically loads and caches state/province border rings on demand.
 */
export async function getStateBorders(): Promise<BorderRing[]> {
  if (stateBordersCache) return stateBordersCache;
  if (!statePromise) {
    statePromise = import('./precision_state_rings.json').then((data) => {
      const rings = data.default as BorderRing[];
      stateBordersCache = rings;
      return rings;
    });
  }
  return statePromise;
}

/**
 * Dynamically loads and caches city district border rings on demand.
 */
export async function getCityBorders(): Promise<BorderRing[]> {
  if (cityBordersCache) return cityBordersCache;
  if (!cityPromise) {
    cityPromise = import('./precision_city_rings.json').then((data) => {
      const rings = data.default as BorderRing[];
      cityBordersCache = rings;
      return rings;
    });
  }
  return cityPromise;
}