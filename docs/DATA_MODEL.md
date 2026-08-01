# Data Model

- World.version must be `1`
- Entity ids: ULID string
- Geometry: GeoJSON CRS84 (lon, lat degrees), WGS84
- Polygon rings: exterior closed, CCW preferred
- `parentId`: null for top-level continents/islands
- Colors: `#RRGGBB` hex string
- `images[].blobKey`: IndexedDB key (Phase 5)

See `src/entities/types.ts` as the single source of truth.
