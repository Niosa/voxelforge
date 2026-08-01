import {
  Viewer,
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidTerrainProvider,
  Terrain,
  Math as CesiumMath,
  SceneMode,
  SingleTileImageryProvider,
  createOsmBuildingsAsync,
  createGooglePhotorealistic3DTileset,
  WebMercatorTilingScheme,
  Event as CesiumEvent,
  Ion,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { TerraEntity } from '@/entities/types';
import { getBiomeTextureCanvas, clearBiomeTextureCaches, type BiomeType } from '@/geo/biomeTexture';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';
import { LruCache } from '@/utils/lruCache';


class ProceduralFantasyImageryProvider {
  tilingScheme: WebMercatorTilingScheme;
  tileWidth: number;
  tileHeight: number;
  minimumLevel: number;
  maximumLevel: number;
  errorEvent: CesiumEvent;
  ready: boolean;

  private version = 1;
  // Bounded: panning/zooming a fantasy world generates endless 256px tile canvases;
  // an unbounded map grows until Safari kills the tab on low-memory devices.
  private tileCache = new LruCache<string, HTMLCanvasElement>(800);
  private sortedPolygonEntities: TerraEntity[] = [];

  constructor(private entities: Record<string, TerraEntity>, private theme: string) {
    this.tilingScheme = new WebMercatorTilingScheme();
    this.tileWidth = 256;
    this.tileHeight = 256;
    this.minimumLevel = 0;
    this.maximumLevel = 18;
    this.errorEvent = new CesiumEvent();
    this.ready = true;
    this.rebuildSortedEntities();
  }

  private rebuildSortedEntities() {
    const ents = Object.values(this.entities || {});
    this.sortedPolygonEntities = ents
      .filter((e) => e && e.geometry && (e.geometry.type === 'Polygon' || e.geometry.type === 'MultiPolygon') && !e.properties?.isVoxelBlock)
      .sort((a, b) => {
        const getArea = (ent: typeof a) => {
          const polyGeom = ent.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
          const coords = polyGeom.type === 'Polygon' ? polyGeom.coordinates[0] : polyGeom.coordinates[0]?.[0] ?? [];
          if (!coords || coords.length === 0) return 0;
          let minLn = 180, maxLn = -180, minLat = 90, maxLat = -90;
          for (const coord of coords as any) {
            const ln = coord[0];
            const lt = coord[1];
            if (ln < minLn) minLn = ln;
            if (ln > maxLn) maxLn = ln;
            if (lt < minLat) minLat = lt;
            if (lt > maxLat) maxLat = lt;
          }
          return (maxLn - minLn) * (maxLat - minLat);
        };
        return getArea(b) - getArea(a);
      });
  }

  updateEntities(newEntities: Record<string, TerraEntity>) {
    this.version++;
    this.entities = newEntities;
    this.tileCache.clear();
    this.rebuildSortedEntities();
  }

  /** Drops all cached tile canvases (memory hygiene for backgrounded tabs). */
  clearTileCache() {
    this.tileCache.clear();
  }

  get tileDiscardPolicy() { return undefined; }
  get credit() { return undefined; }
  get hasAlphaChannel() { return true; }
  get rectangle() { return this.tilingScheme.rectangle; }

  requestImage(x: number, y: number, level: number): Promise<HTMLCanvasElement> {
    const tileKey = `v${this.version}_${level}_${x}_${y}`;
    const cached = this.tileCache.get(tileKey);
    if (cached) return Promise.resolve(cached);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(canvas);

    try {
      const rect = this.tilingScheme.tileXYToRectangle(x, y, level);
      const nativeRect = this.tilingScheme.rectangleToNativeRectangle(rect);
      const projection = this.tilingScheme.projection;
      const west = CesiumMath.toDegrees(rect.west);
      const south = CesiumMath.toDegrees(rect.south);
      const east = CesiumMath.toDegrees(rect.east);
      const north = CesiumMath.toDegrees(rect.north);

      // Render deep dark space/ocean base
      ctx.fillStyle = '#071422';
      ctx.fillRect(0, 0, 256, 256);

      // Draw grid graticules on level 0-4
      if (level < 5) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, 256, 256);
      }

      const nativeW = nativeRect.east - nativeRect.west;
      const nativeH = nativeRect.north - nativeRect.south;

      // Draw Polygons
      for (const entity of this.sortedPolygonEntities) {
        const geom = entity.geometry;
        const polyGeom = geom as GeoJSON.Polygon | GeoJSON.MultiPolygon;
        // Every landmass part (islands) is drawn; interior rings become holes.
        const parts: number[][][][] =
          polyGeom.type === 'Polygon'
            ? [polyGeom.coordinates as number[][][]]
            : (polyGeom.coordinates as number[][][][]);

        for (const rings of parts) {
        const ring = rings?.[0] as any as [number, number][];
        if (!ring || ring.length === 0) continue;

        // Check bounding box overlap
        let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
        for (const [ln, lt] of ring) {
          if (ln < minLon) minLon = ln;
          if (ln > maxLon) maxLon = ln;
          if (lt < minLat) minLat = lt;
          if (lt > maxLat) maxLat = lt;
        }

        if (west > maxLon || east < minLon || south > maxLat || north < minLat) {
          continue;
        }

        const projectRing = (r: [number, number][], p: Path2D) => {
          for (let i = 0; i < r.length; i++) {
            const [lon, lat] = r[i]!;
            const carto = Cartographic.fromDegrees(lon, lat);
            const projected = projection.project(carto);
            const tx = ((projected.x - nativeRect.west) / nativeW) * 256;
            const ty = ((nativeRect.north - projected.y) / nativeH) * 256;
            if (i === 0) p.moveTo(tx, ty);
            else p.lineTo(tx, ty);
          }
          p.closePath();
        };

        const path = new Path2D();
        projectRing(ring, path);
        // Interior rings (erase holes / lakes) are punched out via 'evenodd'
        for (let hI = 1; hI < rings.length; hI++) {
          const hole = rings[hI] as [number, number][] | undefined;
          if (hole && hole.length > 2) projectRing(hole, path);
        }

        const biome = (entity.properties?.biome as BiomeType) ?? 'satellite-blend';
        const isLandmass = entity.type === 'continent' || entity.type === 'island';
        const isUrban = entity.type === 'city' || entity.type === 'town' || biome === 'city-urban';
        const color = entity.color || '#38bdf8';
        const topography = (entity.properties?.topography as any) ?? 'plains';
        const climate = (entity.properties?.climate as any) ?? 'temperate';

        // 1. Coastal Water Shelf & Beach Rim (rendered outside landmass path)
        if (isLandmass) {
          ctx.save();
          // Shallow Turquoise Ocean Lagoon Shelf
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = Math.min(12, Math.max(2, 16 - level * 0.9));
          ctx.stroke(path);

          // Golden Sandy Beach Rim
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = Math.min(6, Math.max(1, 8 - level * 0.4));
          ctx.stroke(path);
          ctx.restore();
        }

        // 2. Interior Landmass & Ecosystem Rendering (Clipped to path)
        ctx.save();
        ctx.clip(path, 'evenodd');

        const activeBiome = isUrban ? 'city-urban' : biome;

        const biomeCanvas = getBiomeTextureCanvas({
          biome: activeBiome,
          color,
          seedStr: entity.id,
          topography,
          climate,
          level,
          west,
          east,
          south,
          north,
          resolution: useUiStore.getState().performanceMode ? 128 : 256,
        });
        const pattern = ctx.createPattern(biomeCanvas, 'repeat');
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, 256, 256);
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 256, 256);
        }

        // 3. Suburban Feathering for City Boundaries (Morphs into surrounding greenery)
        if (isUrban) {
          ctx.save();
          ctx.fillStyle = 'rgba(34, 197, 94, 0.35)'; // Suburban green garden blend
          ctx.fill(path, 'evenodd');
          ctx.restore();
        }

        ctx.restore();

        // 5. Shoreline Border Stroke
        ctx.save();
        ctx.strokeStyle = isLandmass ? '#eab308' : color;
        ctx.lineWidth = Math.max(1.2, 3.0 - level * 0.2);
        ctx.stroke(path);
        ctx.restore();
        } // end per-part (island) loop
      }

      // Draw Point city/town grids with world-anchored continuous LoD scaling
      for (const entity of Object.values(this.entities || {})) {
        if (!entity || !entity.geometry) continue;
        if (entity.geometry.type !== 'Point') continue;
        if (entity.type !== 'city' && entity.type !== 'town') continue;

        const [lon, lat] = entity.geometry.coordinates;
        renderWorldAnchoredCity(
          ctx,
          west,
          east,
          south,
          north,
          lon,
          lat,
          entity.type === 'city' ? 0.06 : 0.035,
          this.theme,
          entity.type === 'city',
          level,
        );
      }
    } catch (err) {
      console.warn('Tile render error:', err);
    }

    // LruCache auto-evicts the least-recently-used tile when the cap is reached
    this.tileCache.set(tileKey, canvas);
    return Promise.resolve(canvas);
  }
}

/**
 * World-anchored continuous satellite LoD city renderer.
 * Every road, block, rooftop, shadow, and detail is pinned to geographic coordinates (lon, lat),
 * providing smooth, scale-invariant satellite zoom without texture pops or shifts.
 */
function renderWorldAnchoredCity(
  ctx: CanvasRenderingContext2D,
  west: number,
  east: number,
  south: number,
  north: number,
  cLon: number,
  cLat: number,
  radiusDeg: number,
  theme: string,
  isMajorCity: boolean,
  level: number,
) {
  // Bounding box test
  if (west > cLon + radiusDeg * 1.5 || east < cLon - radiusDeg * 1.5 || south > cLat + radiusDeg * 1.5 || north < cLat - radiusDeg * 1.5) {
    return;
  }

  const degWidth = east - west;
  const degHeight = north - south;

  ctx.save();

  const cx = ((cLon - west) / degWidth) * 256;
  const cy = (1 - (cLat - south) / degHeight) * 256;
  const rPx = (radiusDeg / degWidth) * 256;

  // High Altitude / Orbital View (level <= 10): render organic star/sprawl footprint & arterial highways
  if (level <= 10) {
    ctx.save();
    // 1. Arterial Highway Rays radiating outward
    ctx.strokeStyle = theme === 'modern' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(120, 113, 108, 0.7)';
    ctx.lineWidth = Math.max(1, Math.min(3, rPx * 0.15));
    const rayAngles = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3];
    for (const angle of rayAngles) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * rPx * 2.2, cy + Math.sin(angle) * rPx * 2.2);
      ctx.stroke();
    }

    // 2. Organic Irregular Sprawl Footprint Path
    ctx.fillStyle = theme === 'modern' ? 'rgba(51, 65, 85, 0.85)' : 'rgba(87, 83, 78, 0.85)';
    ctx.beginPath();
    const points = 16;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noiseR = rPx * (0.75 + 0.25 * Math.sin(angle * 4 + cLon * 10) + 0.15 * Math.cos(angle * 7));
      const px = cx + Math.cos(angle) * noiseR;
      const py = cy + Math.sin(angle) * noiseR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 3. Central Downtown Glow Core
    ctx.fillStyle = theme === 'modern' ? '#38bdf8' : '#fef08a';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, rPx * 0.35), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // Detailed Street & Building Block View (level >= 11)
  const x0 = Math.max(0, Math.floor(((cLon - radiusDeg * 1.4 - west) / degWidth) * 256));
  const x1 = Math.min(256, Math.ceil(((cLon + radiusDeg * 1.4 - west) / degWidth) * 256));
  const y0 = Math.max(0, Math.floor(((north - (cLat + radiusDeg * 1.4)) / degHeight) * 256));
  const y1 = Math.min(256, Math.ceil(((north - (cLat - radiusDeg * 1.4)) / degHeight) * 256));

  if (x0 >= x1 || y0 >= y1) {
    ctx.restore();
    return;
  }

  const isModern = theme === 'modern';
  const gridLimit = isModern ? (isMajorCity ? 2 : 1) : (isMajorCity ? 2 : 1);
  const blockSpacing = Math.max(8, (rPx * 0.8) / (gridLimit + 0.2));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rPx * 1.3, 0, Math.PI * 2);
  ctx.clip();

  if (isModern) {
    // 1. Dark Asphalt Base Foundation
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, rPx * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // 2. Multi-Lane Asphalt Road Network & Main Avenues
    ctx.fillStyle = '#1e293b';
    const roadWidth = Math.max(4, blockSpacing * 0.32);
    for (let i = -gridLimit; i <= gridLimit + 1; i++) {
      const rx = cx + (i - 0.5) * blockSpacing;
      const ry = cy + (i - 0.5) * blockSpacing;
      ctx.fillRect(rx - roadWidth / 2, cy - rPx * 1.35, roadWidth, rPx * 2.7);
      ctx.fillRect(cx - rPx * 1.35, ry - roadWidth / 2, rPx * 2.7, roadWidth);
    }

    // 3. Yellow Median Centerlines & White Crosswalk Stripes
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - rPx * 1.3); ctx.lineTo(cx, cy + rPx * 1.3);
    ctx.moveTo(cx - rPx * 1.3, cy); ctx.lineTo(cx + rPx * 1.3, cy);
    ctx.stroke();

    // White Crosswalk dashes at intersections
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([2, 2]);
    for (let i = -gridLimit; i <= gridLimit; i++) {
      const rx = cx + i * blockSpacing;
      const ry = cy + i * blockSpacing;
      ctx.beginPath();
      ctx.moveTo(rx - blockSpacing * 0.4, ry); ctx.lineTo(rx + blockSpacing * 0.4, ry);
      ctx.moveTo(rx, ry - blockSpacing * 0.4); ctx.lineTo(rx, ry + blockSpacing * 0.4);
      ctx.stroke();
    }
    ctx.setLineDash([]); // Reset line dash

    // 4. Zoned City Blocks, Foundations & Rooftop Features
    for (let dx = -gridLimit; dx <= gridLimit; dx++) {
      for (let dy = -gridLimit; dy <= gridLimit; dy++) {
        const bx = cx + dx * blockSpacing;
        const by = cy + dy * blockSpacing;
        const bw = blockSpacing * 0.68;
        const bh = blockSpacing * 0.68;
        const hash = Math.abs(dx * 17 + dy * 31) % 5;

        // Cast Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(bx - bw / 2 + 3, by - bh / 2 + 3, bw, bh);

        if (dx === 0 && dy === 0) {
          // Central Megastructure Plaza Pad
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);

          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(bx - bw * 0.3, by - bh * 0.3, bw * 0.6, bh * 0.6);

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
        } else if (hash === 0) {
          // Urban Park Block
          ctx.fillStyle = '#15803d';
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);

          // Fountain pool
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(bx, by, Math.max(2, bw * 0.22), 0, Math.PI * 2);
          ctx.fill();

          // Tree clusters
          ctx.fillStyle = '#166534';
          ctx.beginPath();
          ctx.arc(bx - bw * 0.25, by - bh * 0.25, bw * 0.15, 0, Math.PI * 2);
          ctx.arc(bx + bw * 0.25, by + bh * 0.25, bw * 0.15, 0, Math.PI * 2);
          ctx.fill();
        } else if (hash === 4) {
          // Commercial Parking Lot Grid
          ctx.fillStyle = '#334155';
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);

          // Parking stall lines
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let px = bx - bw * 0.35; px <= bx + bw * 0.35; px += 4) {
            ctx.moveTo(px, by - bh * 0.3); ctx.lineTo(px, by + bh * 0.3);
          }
          ctx.stroke();
        } else {
          // Commercial Skyscraper / Office Block
          const roofColor = hash === 1 ? '#0369a1' : hash === 2 ? '#475569' : '#334155';
          ctx.fillStyle = roofColor;
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);

          // Helipad on large towers
          if (bw >= 12 && hash === 1) {
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(bx, by, bw * 0.25, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('H', bx, by);
          } else if (bw >= 10) {
            // Rooftop HVAC Penthouse
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(bx - bw * 0.2, by - bh * 0.2, bw * 0.4, bh * 0.4);
          }
        }
      }
    }
  } else {
    // Medieval / Fantasy Town Vector Renderer
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(cx, cy, rPx * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Cobblestone ring avenues
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = Math.max(1.5, blockSpacing * 0.2);
    const rings = isMajorCity ? [rPx * 0.5, rPx * 0.95] : [rPx * 0.65];
    for (const rDist of rings) {
      ctx.beginPath();
      ctx.arc(cx, cy, rDist, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radial spokes
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * rPx * 1.2, cy + Math.sin(angle) * rPx * 1.2);
      ctx.stroke();
    }

    // Cottages along rings
    for (let rIdx = 0; rIdx < rings.length; rIdx++) {
      const rDist = rings[rIdx]!;
      const count = isMajorCity ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rIdx;
        const hx = cx + Math.cos(angle) * rDist;
        const hy = cy + Math.sin(angle) * rDist;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(hx - 2 + 1.5, hy - 2 + 1.5, 4, 4);

        ctx.fillStyle = '#a0522d';
        ctx.fillRect(hx - 2, hy - 2, 4, 4);
      }
    }

    // Central Citadel / Keep
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(cx - 4 + 2, cy - 4 + 2, 8, 8);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
  }

  ctx.restore();
}

export type ImageryStyle =
  | 'osm'
  | 'satellite'
  | 'opentopo'
  | 'carto-light'
  | 'carto-dark'
  | 'stylized';

let viewer: Viewer | null = null;
let currentImageryStyle: ImageryStyle = 'satellite';
let isFantasyWorld = true;
let isTerrain3DActive = true;
let isLightingActive = false;

let parchmentDataUrl: string | null = null;
let fantasySatelliteDataUrl: string | null = null;

function getParchmentTextureUrl(): string {
  if (parchmentDataUrl) return parchmentDataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const W = canvas.width;
  const H = canvas.height;

  // Deep rich aged parchment & oceanic ink base
  const grad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1200);
  grad.addColorStop(0, '#101d33');
  grad.addColorStop(0.4, '#0c1626');
  grad.addColorStop(0.8, '#080f1c');
  grad.addColorStop(1, '#04070d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Organic ocean depth variation & aged paper stains
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const radius = 30 + Math.random() * 120;
    const radGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    radGrad.addColorStop(0, 'rgba(30, 64, 110, 0.12)');
    radGrad.addColorStop(1, 'rgba(8, 15, 28, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cartographic Graticule Grid (Lat/Long Lines) with Roman Numerals
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1;
  ctx.font = '10px serif';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';

  for (let x = 0; x < W; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 16-Point Antique Compass Rose in Ocean (Center Left)
  drawCompassRose(ctx, 420, 580, 110);
  drawCompassRose(ctx, 1650, 360, 85);

  // Ocean Wave Hatching Ripples (`~ ~ ~ ~`)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.font = '12px serif';
  for (let i = 0; i < 90; i++) {
    const wx = (Math.sin(i * 1.5) * 0.5 + 0.5) * W;
    const wy = (Math.cos(i * 2.3) * 0.5 + 0.5) * H;
    ctx.fillText('~ ~ ~', wx, wy);
  }

  // Illustrated Ocean Sea Monster / Kraken Tentacles
  drawSeaMonster(ctx, 720, 780);

  parchmentDataUrl = canvas.toDataURL('image/png');
  return parchmentDataUrl;
}

/** Draws an authentic 16-point antique compass rose with radiating rhumb lines */
function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
) {
  // Radiating Rhumb Lines
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
  ctx.lineWidth = 1;
  for (let a = 0; a < 360; a += 22.5) {
    const rad = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * (r * 3.5), cy + Math.sin(rad) * (r * 3.5));
    ctx.stroke();
  }

  // Outer Compass Rings
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();

  // 16 Points Star
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    const isMajor = i % 4 === 0;
    const isMedium = i % 2 === 0;
    const tipR = isMajor ? r : isMedium ? r * 0.65 : r * 0.45;
    const baseR = r * 0.2;

    const tipX = cx + Math.sin(angle) * tipR;
    const tipY = cy - Math.cos(angle) * tipR;
    const midX = cx + Math.sin(angle + Math.PI / 16) * baseR;
    const midY = cy - Math.cos(angle + Math.PI / 16) * baseR;

    // Dark half
    ctx.fillStyle = isMajor ? '#d97706' : '#0284c7';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(midX, midY);
    ctx.closePath();
    ctx.fill();

    // Light half
    const prevMidX = cx + Math.sin(angle - Math.PI / 16) * baseR;
    const prevMidY = cy - Math.cos(angle - Math.PI / 16) * baseR;
    ctx.fillStyle = isMajor ? '#fef08a' : '#e0f2fe';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(prevMidX, prevMidY);
    ctx.closePath();
    ctx.fill();
  }

  // Cardinal Direction Numerals (N, S, E, W)
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 14px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r - 14);
  ctx.fillText('S', cx, cy + r + 14);
  ctx.fillText('E', cx + r + 14, cy);
  ctx.fillText('W', cx - r - 14, cy);
}

/** Draws cartographic sea monster artwork on ocean floor */
function drawSeaMonster(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  // Tentacle curves
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 25, y);
    ctx.bezierCurveTo(
      x + i * 25 + 20,
      y - 30,
      x + i * 25 - 20,
      y - 60,
      x + i * 25 + 10,
      y - 80,
    );
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.font = 'italic 11px serif';
  ctx.fillText('Here Be Monsters', x - 10, y + 22);
}

export function rebuildFantasySatelliteTexture(entities: Record<string, TerraEntity>, theme = 'medieval'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const W = canvas.width;
  const H = canvas.height;

  // 1. Render realistic space/ocean backdrop with radial shading & wind currents
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 1200);
  grad.addColorStop(0, '#0a1729'); // Deep slate indigo ocean
  grad.addColorStop(0.5, '#07101e');
  grad.addColorStop(1, '#02050b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative graticule/grid ink
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 2. Draw each country/region polygon directly onto the master texture
  for (const entity of Object.values(entities)) {
    if (entity.geometry.type !== 'Polygon' && entity.geometry.type !== 'MultiPolygon') {
      continue;
    }

    const geom = entity.geometry;
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0]?.[0] ?? [];
    if (!ring || ring.length === 0) continue;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i]!;
      const px = ((lon + 180) / 360) * W;
      const py = ((90 - lat) / 180) * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const biome = (entity.properties.biome as BiomeType) ?? 'satellite-blend';
    const color = entity.color;
    const topography = (entity.properties.topography as any) ?? 'plains';
    const climate = (entity.properties.climate as any) ?? 'temperate';

    // Retrieve the pre-compiled biome texture canvas synchronously!
    const biomeCanvas = getBiomeTextureCanvas({
      biome,
      color,
      seedStr: entity.id,
      topography,
      climate,
    });

    const pattern = ctx.createPattern(biomeCanvas, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Border outline shading
    ctx.strokeStyle = Color.fromCssColorString(color).withAlpha(0.25).toCssColorString();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Paint cities, forest clusters, and landmark locations onto the base imagery
  for (const entity of Object.values(entities)) {
    if (entity.geometry.type !== 'Point') continue;
    const [lon, lat] = entity.geometry.coordinates;
    const px = ((lon + 180) / 360) * W;
    const py = ((90 - lat) / 180) * H;

    if (entity.type === 'city' || entity.type === 'town') {
      const isCity = entity.type === 'city';
      if (theme === 'modern') {
        const gridLimit = isCity ? 2 : 1;

        // Draw asphalt base foundation
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(px - 14 * gridLimit, py - 14 * gridLimit, 28 * gridLimit, 28 * gridLimit);

        // Draw grey block grids (concrete foundations)
        ctx.fillStyle = '#334155';
        for (let dx = -gridLimit; dx <= gridLimit; dx++) {
          for (let dy = -gridLimit; dy <= gridLimit; dy++) {
            const bLng = lon + dx * 0.0006;
            const bLat = lat + dy * 0.0006;
            const bx = ((bLng + 180) / 360) * W;
            const by = ((90 - bLat) / 180) * H;
            ctx.fillRect(bx - 3, by - 3, 6, 6);
          }
        }

        // Draw building shadows (northwest sun casts shadow to southeast)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        for (let dx = -gridLimit; dx <= gridLimit; dx++) {
          for (let dy = -gridLimit; dy <= gridLimit; dy++) {
            if (dx === 0 && dy === 0) continue;
            const bLng = lon + dx * 0.0006;
            const bLat = lat + dy * 0.0006;
            const bx = ((bLng + 180) / 360) * W;
            const by = ((90 - bLat) / 180) * H;
            // Shift shadow 2.5px right and down
            ctx.fillRect(bx - 2 + 2.5, by - 2 + 2.5, 4, 4);
          }
        }

        // Draw building roofs matching 3D skyscrapers
        for (let dx = -gridLimit; dx <= gridLimit; dx++) {
          for (let dy = -gridLimit; dy <= gridLimit; dy++) {
            if (dx === 0 && dy === 0) continue;
            const bLng = lon + dx * 0.0006;
            const bLat = lat + dy * 0.0006;
            const bx = ((bLng + 180) / 360) * W;
            const by = ((90 - bLat) / 180) * H;
            const colorCode = Math.abs(dx * 3 + dy * 5) % 3;
            ctx.fillStyle = colorCode === 0 ? '#0284c7' : colorCode === 1 ? '#475569' : '#94a3b8';
            ctx.fillRect(bx - 2, by - 2, 4, 4);
          }
        }

        // Draw central megastructure shadow and roof
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(px - 3 + 3.5, py - 3 + 3.5, 6, 6);
        ctx.fillStyle = '#38bdf8'; // Glowing glass blue
        ctx.fillRect(px - 3, py - 3, 6, 6);
      } else {
        // Medieval Fantasy style: paint thatched cottages and cobblestone ring footprint
        ctx.fillStyle = '#1e3a1e'; // deep grass background
        ctx.beginPath();
        ctx.arc(px, py, isCity ? 18 : 10, 0, Math.PI * 2);
        ctx.fill();

        // Draw cobblestone ring paths matching house rings in townStructures
        ctx.strokeStyle = '#78716c'; // cobblestone grey
        ctx.lineWidth = 1.5;
        const rings = isCity ? [0.0012, 0.0024] : [0.0016];
        for (const dist of rings) {
          const rPx = (dist / 360) * W;
          ctx.beginPath();
          ctx.arc(px, py, rPx, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw cottage roofs and shadows (red-brown sienna/timber)
        const houseCount = isCity ? 28 : 14;
        for (let rIdx = 0; rIdx < rings.length; rIdx++) {
          const dist = rings[rIdx]!;
          const count = Math.floor(houseCount / rings.length);
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rIdx;
            const hLng = lon + Math.cos(angle) * dist;
            const hLat = lat + Math.sin(angle) * dist;
            const hx = ((hLng + 180) / 360) * W;
            const hy = ((90 - hLat) / 180) * H;

            // Cottage shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(hx - 1.5 + 1.5, hy - 1.5 + 1.5, 3, 3);
            // Cottage roof sienna splotch
            ctx.fillStyle = '#a0522d';
            ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
          }
        }

        // Draw central Keep/Citadel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(px - 3 + 2, py - 3 + 2, 6, 6);
        ctx.fillStyle = '#3b82f6'; // Blue citadel roof
        ctx.fillRect(px - 3, py - 3, 6, 6);
      }
    } else if (entity.tags.includes('forest')) {
      // Paint green forest point clusters on the base map
      ctx.fillStyle = 'rgba(21, 128, 61, 0.5)';
      for (let i = 0; i < 5; i++) {
        const ox = (Math.sin(i * 4) * 5);
        const oy = (Math.cos(i * 4) * 5);
        ctx.beginPath();
        ctx.arc(px + ox, py + oy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  fantasySatelliteDataUrl = canvas.toDataURL('image/png');
  return fantasySatelliteDataUrl;
}

export function getFantasySatelliteTextureUrl(): string {
  if (fantasySatelliteDataUrl) return fantasySatelliteDataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createRadialGradient(512, 256, 0, 512, 256, 600);
  grad.addColorStop(0, '#0a1929');
  grad.addColorStop(0.6, '#071422');
  grad.addColorStop(1, '#030a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  fantasySatelliteDataUrl = canvas.toDataURL('image/png');
  return fantasySatelliteDataUrl;
}

export function getViewer(): Viewer | null {
  return viewer;
}

export function getCurrentImageryStyle(): ImageryStyle {
  return currentImageryStyle;
}

export function getIsFantasyWorld(): boolean {
  return isFantasyWorld;
}

export function getIsTerrain3DActive(): boolean {
  return isTerrain3DActive;
}

export function getIsLightingActive(): boolean {
  return isLightingActive;
}

let google3DTileset: any = null;
let isGoogle3DActive = false;
let osmBuildingsTileset: any = null;
let isOsmBuildingsActive = false;

export function getIsGoogle3DActive(): boolean {
  return isGoogle3DActive;
}

export async function setGoogle3DBuildings(enabled: boolean): Promise<void> {
  if (!viewer || viewer.isDestroyed()) return;
  isGoogle3DActive = enabled;

  try {
    if (enabled) {
      if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
        Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
      }

      // Turn off OSM buildings
      if (isOsmBuildingsActive) {
        await setOsmBuildings(false);
      }
      // Turn off separate 3D Terrain since Google 3D tileset includes its own photorealistic terrain mesh.
      if (isTerrain3DActive) {
        isTerrain3DActive = false;
        viewer.terrainProvider = new EllipsoidTerrainProvider();
      }

      if (!google3DTileset) {
        google3DTileset = await createGooglePhotorealistic3DTileset({
          onlyUsingWithGoogleGeocoder: true,
        });
      }
      if (google3DTileset && !viewer.scene.primitives.contains(google3DTileset)) {
        viewer.scene.primitives.add(google3DTileset);
      }
    } else {
      if (google3DTileset && viewer.scene.primitives.contains(google3DTileset)) {
        viewer.scene.primitives.remove(google3DTileset);
      }
    }
  } catch (err) {
    console.warn('Google 3D Tiles load note:', err);
    isGoogle3DActive = false;
  }
}

export function getIsOsmBuildingsActive(): boolean {
  return isOsmBuildingsActive;
}

export async function setOsmBuildings(enabled: boolean): Promise<void> {
  if (!viewer || viewer.isDestroyed()) return;
  isOsmBuildingsActive = enabled;

  try {
    if (enabled) {
      // Turn off Google 3D Tiles
      if (isGoogle3DActive) {
        await setGoogle3DBuildings(false);
      }
      if (!osmBuildingsTileset) {
        osmBuildingsTileset = await createOsmBuildingsAsync();
      }
      if (osmBuildingsTileset && !viewer.scene.primitives.contains(osmBuildingsTileset)) {
        viewer.scene.primitives.add(osmBuildingsTileset);
      }
    } else {
      if (osmBuildingsTileset && viewer.scene.primitives.contains(osmBuildingsTileset)) {
        viewer.scene.primitives.remove(osmBuildingsTileset);
      }
    }
  } catch (err) {
    console.warn('OSM Buildings load note:', err);
  }
}

export function setFantasyWorldFlag(fantasy: boolean): void {
  isFantasyWorld = fantasy;
  // Automatically disable real Earth buildings when entering a fantasy world
  if (fantasy) {
    if (isOsmBuildingsActive) {
      setOsmBuildings(false);
    }
    if (isGoogle3DActive) {
      setGoogle3DBuildings(false);
    }
  }

  if (viewer && !viewer.isDestroyed()) {
    // Read the active world from the store so entities and theme are always
    // available regardless of whether the viewer was just created or already
    // existed (singleton early-return path).
    const activeWorld = useWorldStore.getState().world;
    const entities = fantasy ? (activeWorld.entities ?? {}) : undefined;
    const theme = activeWorld.properties?.theme || 'medieval';
    setGlobeImageryStyle(currentImageryStyle, entities, theme);
    syncWorldBordersData(viewer);
  }
}

/**
 * Applies (or relaxes) memory-saving viewer settings based on the uiStore
 * performanceMode flag. Called at viewer creation and whenever the user
 * toggles Performance Mode in the UI.
 */
export function applyPerformanceModeSettings(): void {
  if (!viewer || viewer.isDestroyed()) return;
  const perf = useUiStore.getState().performanceMode;
  try {
    // Fewer, coarser globe tiles = fewer GPU textures. 4.0 (not 6.0) keeps
    // satellite imagery acceptably sharp on the iPad 9 Retina screen while
    // still cutting tile count ~4x vs the 2.0 default.
    viewer.scene.globe.maximumScreenSpaceError = perf ? 4.0 : 2.0;
    (viewer.scene.globe as unknown as { tileCacheSize: number }).tileCacheSize = perf ? 50 : 100;
    viewer.resolutionScale = perf ? 0.75 : 1.0;
    viewer.scene.fog.enabled = !perf;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = !perf;
    }
    viewer.scene.requestRender();
  } catch (err) {
    console.warn('Performance mode settings note:', err);
  }
}

/** Clears transient globe-side caches (called after long backgrounding to cut jetsam odds). */
export function clearEphemeralGlobeCaches(): void {
  if (!viewer || viewer.isDestroyed()) return;
  const count = viewer.imageryLayers.length;
  for (let i = 0; i < count; i++) {
    const provider = viewer.imageryLayers.get(i)?.imageryProvider as unknown as {
      clearTileCache?: () => void;
    };
    provider?.clearTileCache?.();
  }
}

let backgroundHygieneAttached = false;
let tabHiddenAt: number | null = null;

/**
 * iOS Safari loves to jetsam backgrounded tabs that resume with large heap
 * footprints. After >30s hidden, drop the ephemeral canvas/tile caches so a
 * resumed tab starts light (they rebuild lazily on demand).
 */
function attachBackgroundCacheHygiene(): void {
  if (backgroundHygieneAttached || typeof document === 'undefined') return;
  backgroundHygieneAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      tabHiddenAt = Date.now();
      return;
    }
    if (tabHiddenAt !== null && Date.now() - tabHiddenAt > 30_000) {
      clearEphemeralGlobeCaches();
      clearBiomeTextureCaches();
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }
    tabHiddenAt = null;
  });
}

export function setGlobeTerrain3D(enabled: boolean): void {
  if (!viewer || viewer.isDestroyed()) return;
  isTerrain3DActive = enabled;

  try {
    if (enabled) {
      // Turn off Google 3D Tiles to avoid double terrain rendering conflict
      if (isGoogle3DActive) {
        setGoogle3DBuildings(false);
      }
      viewer.scene.setTerrain(Terrain.fromWorldTerrain());
    } else {
      viewer.terrainProvider = new EllipsoidTerrainProvider();
    }
  } catch (err) {
    console.warn('3D Terrain activation note:', err);
    viewer.terrainProvider = new EllipsoidTerrainProvider();
  }
}

export function setGlobeAtmosphereLighting(enabled: boolean): void {
  if (!viewer || viewer.isDestroyed()) return;
  isLightingActive = enabled;
  viewer.scene.globe.enableLighting = enabled;
  viewer.scene.globe.showGroundAtmosphere = enabled;
}

export function updateFantasyImageryEntities(entities: Record<string, TerraEntity>): void {
  if (!viewer || viewer.isDestroyed() || !isFantasyWorld) return;
  const count = viewer.imageryLayers.length;
  let updated = false;
  for (let i = 0; i < count; i++) {
    const layer = viewer.imageryLayers.get(i);
    const provider = layer?.imageryProvider as any;
    if (provider && typeof provider.updateEntities === 'function') {
      provider.updateEntities(entities);
      // Toggle layer visibility to flush Cesium's cached GPU tile textures
      // and force immediate real-time re-rendering of visible fantasy tile imagery.
      layer.show = false;
      layer.show = true;
      updated = true;
    }
  }
  if (updated) {
    viewer.scene.requestRender();
  }
}

export function setGlobeImageryStyle(
  style: ImageryStyle,
  entities?: Record<string, TerraEntity>,
  theme = 'medieval',
): void {
  if (!viewer || viewer.isDestroyed()) return;
  currentImageryStyle = style;

  try {
    viewer.imageryLayers.removeAll();

    if (style === 'stylized') {
      const url = getParchmentTextureUrl();
      if (url) {
        try {
          viewer.imageryLayers.addImageryProvider(
            new SingleTileImageryProvider({ url }),
          );
        } catch (e) {
          console.warn('Parchment texture failed:', e);
        }
      }
      viewer.scene.globe.baseColor = Color.fromCssColorString('#0b172a');
    } else {
      const activeEntities = entities || {};
      try {
        viewer.imageryLayers.addImageryProvider(
          new ProceduralFantasyImageryProvider(activeEntities, theme) as any,
        );
      } catch (e) {
        console.warn('Fantasy imagery provider failed, using solid color:', e);
      }
      viewer.scene.globe.baseColor = Color.fromCssColorString('#071422');
    }
  } catch (err) {
    console.warn('Imagery provider update warning:', err);
  }
}

import { syncWorldBordersData } from '@/globe/borderOverlay';

export function createTerraforgeViewer(container: HTMLElement): Viewer {
  if (viewer && !viewer.isDestroyed()) {
    // Viewer already exists — return it as-is.
    // Do NOT call container.appendChild here: moving Cesium's DOM nodes
    // during React Strict Mode's second effect invocation causes a React
    // "incorrect node tree" error because the DOM is modified outside React.
    return viewer;
  }

  // Intentionally NO Ion.defaultAccessToken — offline/free public imagery globe
  viewer = new Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: document.createElement('div'),
    terrainProvider: new EllipsoidTerrainProvider(),
    sceneMode: SceneMode.SCENE3D,
  });

  // Remove the default Cesium base layer immediately so we control all imagery
  viewer.imageryLayers.removeAll();

  // Configure Google Earth Style Camera Controls
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableRotate = true;
  controller.enableTranslate = true; // Natural Google Earth 3D surface panning
  controller.enableTilt = true;
  controller.enableZoom = true;
  controller.enableCollisionDetection = true; // Prevents camera clipping through terrain
  controller.zoomFactor = 12.0;
  controller.inertiaSpin = 0.86; // Smooth Google Earth momentum
  controller.inertiaZoom = 0.86;
  controller.minimumZoomDistance = 25.0; // Min height 25m above ground
  controller.maximumZoomDistance = 18_000_000.0; // Max orbital height keeping globe centered
  controller.bounceAnimationTime = 0.0;

  // Mobile Performance Tuning & Render Mode Optimization
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = 10.0;
  viewer.scene.globe.maximumScreenSpaceError = 2.0;

  viewer.scene.backgroundColor = Color.fromCssColorString('#020617');
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0b172a');
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.logarithmicDepthBuffer = true;
  viewer.scene.fog.enabled = true;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
  }

  // Apply low-power overrides (tile quality, resolution scale, atmosphere) if enabled
  applyPerformanceModeSettings();
  attachBackgroundCacheHygiene();

  // Gracefully handle iPad sleep/resume & WebGL context loss
  const canvas = viewer.canvas;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost, awaiting restoration...');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  });

  // Set initial imagery layer & load world borders according to active world
  const activeWorld = useWorldStore.getState().world;
  setFantasyWorldFlag(true);
  setGlobeImageryStyle('satellite', activeWorld.entities, activeWorld.properties?.theme || 'medieval');
  syncWorldBordersData(viewer);

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-98.5, 39.8, 12_500_000),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-90),
      roll: 0,
    },
  });



  return viewer;
}

export function recenterGlobe(): void {
  if (!viewer || viewer.isDestroyed()) return;
  const currentPos = viewer.camera.positionCartographic;
  const lon = currentPos ? CesiumMath.toDegrees(currentPos.longitude) : -98.5;
  const lat = currentPos ? CesiumMath.toDegrees(currentPos.latitude) : 39.8;

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, 12_500_000),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-90),
      roll: 0,
    },
    duration: 1.2,
  });
}

export function destroyTerraforgeViewer(): void {
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy();
  }
  viewer = null;
}
