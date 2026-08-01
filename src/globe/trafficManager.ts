import {
  Viewer,
  Color,
  Cartesian3,
  HeadingPitchRoll,
  Transforms,
  Entity,
  DistanceDisplayCondition,
  ConstantPositionProperty,
  ConstantProperty,
  HeightReference,
} from 'cesium';
import type { TerraEntity } from '@/entities/types';
import { geometryCentroid } from '@/geo/centroid';
import { useWorldStore } from '@/state/worldStore';
import { useUiStore } from '@/state/uiStore';


// Distance display condition: traffic renders from ground level up to regional altitude (350km)
const trafficDistanceCondition = new DistanceDisplayCondition(0, 350_000);

export interface Waypoint {
  lon: number;
  lat: number;
}

export interface SubPartOffset {
  entity: Entity;
  localX: number; // Right (+) / Left (-)
  localY: number; // Forward (+) / Backward (-)
  localZ: number; // Up (+) / Down (-)
}

export interface VehicleState {
  id: string;
  cityId: string;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  progress: number; // 0..1 along current segment
  speed: number; // meters per second
  color: Color;
  width: number;
  length: number;
  height: number;
  mainEntity: Entity;
  subParts: SubPartOffset[];
  isCarriage: boolean;
  laneOffsetMeters: number; // Right-hand driving offset
}

export class TrafficManager {
  private viewer: Viewer | null = null;
  private vehicles: Map<string, VehicleState> = new Map();
  private activeCityIds: Set<string> = new Set();
  private lastUpdateTime: number = performance.now();
  private removeTickListener: (() => void) | null = null;

  public setViewer(viewer: Viewer | null): void {
    if (this.viewer === viewer) return;
    if (this.removeTickListener) {
      this.removeTickListener();
      this.removeTickListener = null;
    }
    this.clear();
    this.viewer = viewer;

    if (this.viewer) {
      this.removeTickListener = this.viewer.clock.onTick.addEventListener(() => {
        if (!useUiStore.getState().firstPersonActive) {
          this.update();
        }
      });
    }
  }

  public clear(): void {
    if (this.removeTickListener) {
      this.removeTickListener();
      this.removeTickListener = null;
    }
    if (this.viewer && !this.viewer.isDestroyed()) {
      for (const v of this.vehicles.values()) {
        this.viewer.entities.remove(v.mainEntity);
        for (const sub of v.subParts) {
          this.viewer.entities.remove(sub.entity);
        }
      }
    }
    this.vehicles.clear();
    this.activeCityIds.clear();
  }

  /**
   * Synchronizes active vehicle fleets for cities present in the world.
   */
  public syncCityTraffic(entities: Record<string, TerraEntity>): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    const uiState = useUiStore.getState();
    const trafficEnabled = uiState.trafficEnabled !== false && !uiState.performanceMode;

    if (!trafficEnabled) {
      if (this.vehicles.size > 0) this.clear();
      return;
    }

    const currentCityIds = new Set<string>();
    const cities: TerraEntity[] = [];

    for (const ent of Object.values(entities)) {
      if (ent.type === 'city' || ent.type === 'town') {
        currentCityIds.add(ent.id);
        cities.push(ent);
      }
    }

    // Remove vehicles for cities that no longer exist
    for (const [vId, vehicle] of this.vehicles.entries()) {
      if (!currentCityIds.has(vehicle.cityId)) {
        if (this.viewer && !this.viewer.isDestroyed()) {
          this.viewer.entities.remove(vehicle.mainEntity);
          for (const sub of vehicle.subParts) {
            this.viewer.entities.remove(sub.entity);
          }
        }
        this.vehicles.delete(vId);
      }
    }

    // Spawn vehicle fleets for any city missing active vehicles
    const theme = useWorldStore.getState().world.properties?.theme || 'medieval';
    for (const city of cities) {
      const hasVehicles = Array.from(this.vehicles.values()).some((v) => v.cityId === city.id);
      if (!hasVehicles) {
        this.spawnCityFleet(city, theme);
      }
    }

    // Inter-city highway traffic between adjacent cities if 2+ cities exist
    if (cities.length >= 2 && !this.activeCityIds.has('inter_city_highways')) {
      this.spawnInterCityTraffic(cities, theme);
      currentCityIds.add('inter_city_highways');
    }

    this.activeCityIds = currentCityIds;
  }

  /**
   * Spawns inter-city highway transport routes between settlement pairs.
   */
  private spawnInterCityTraffic(cities: TerraEntity[], theme: string): void {
    if (!this.viewer) return;

    const isModern = theme === 'modern';
    for (let i = 0; i < cities.length - 1; i++) {
      const c1 = cities[i]!;
      const c2 = cities[i + 1]!;
      const [lon1, lat1] = geometryCentroid(c1.geometry);
      const [lon2, lat2] = geometryCentroid(c2.geometry);

      const highwayForward: Waypoint[] = [
        { lon: lon1, lat: lat1 },
        { lon: lon2, lat: lat2 },
      ];
      const highwayBackward: Waypoint[] = [
        { lon: lon2, lat: lat2 },
        { lon: lon1, lat: lat1 },
      ];

      this.createVehicle(
        `highway_${i}_fwd`,
        'inter_city_highways',
        highwayForward,
        isModern ? Color.fromCssColorString('#0284c7') : Color.fromCssColorString('#7c2d12'),
        isModern ? 8.5 : 5.0,
        isModern ? 28.0 : 12.0,
        isModern ? 7.0 : 4.5,
        isModern ? 18.0 : 7.0,
        !isModern,
        2.5,
      );

      this.createVehicle(
        `highway_${i}_bwd`,
        'inter_city_highways',
        highwayBackward,
        isModern ? Color.fromCssColorString('#f8fafc') : Color.fromCssColorString('#b45309'),
        isModern ? 6.5 : 5.0,
        isModern ? 16.0 : 10.0,
        isModern ? 4.5 : 4.0,
        isModern ? 22.0 : 8.0,
        !isModern,
        2.5,
      );
    }
  }

  /**
   * Spawns a localized vehicle fleet for a city based on architectural theme.
   */
  private spawnCityFleet(city: TerraEntity, theme: string): void {
    if (!this.viewer) return;

    const [lon, lat] = geometryCentroid(city.geometry);
    const isCity = city.type === 'city';
    const isTouch = typeof navigator !== 'undefined' && ((navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window);
    const vehicleCount = isCity ? (isTouch ? 8 : 12) : (isTouch ? 4 : 6);
    const isModern = theme === 'modern';

    if (isModern) {
      let minLon = lon - 0.002, maxLon = lon + 0.002, minLat = lat - 0.002, maxLat = lat + 0.002;
      if (city.geometry.type === 'Polygon' || city.geometry.type === 'MultiPolygon') {
        const rings: [number, number][][] = [];
        if (city.geometry.type === 'Polygon') {
          rings.push(city.geometry.coordinates[0] as [number, number][]);
        } else if (city.geometry.type === 'MultiPolygon') {
          for (const poly of city.geometry.coordinates) {
            if (poly[0]) rings.push(poly[0] as [number, number][]);
          }
        }
        let bMinLng = 180, bMaxLng = -180, bMinLat = 90, bMaxLat = -90;
        for (const ring of rings) {
          for (const [pLon, pLat] of ring) {
            if (pLon < bMinLng) bMinLng = pLon;
            if (pLon > bMaxLng) bMaxLng = pLon;
            if (pLat < bMinLat) bMinLat = pLat;
            if (pLat > bMaxLat) bMaxLat = pLat;
          }
        }
        if (bMaxLng > bMinLng && bMaxLat > bMinLat) {
          minLon = bMinLng; maxLon = bMaxLng; minLat = bMinLat; maxLat = bMaxLat;
        }
      }

      const midLon = (minLon + maxLon) / 2;
      const midLat = (minLat + maxLat) / 2;

      // Multi-corridor street grid routes with outer ring bypass
      const routes: Waypoint[][] = [
        // Outer Ring Beltway (Clockwise)
        [
          { lon: minLon, lat: minLat },
          { lon: minLon, lat: maxLat },
          { lon: maxLon, lat: maxLat },
          { lon: maxLon, lat: minLat },
        ],
        // Outer Ring Beltway (Counter-Clockwise)
        [
          { lon: maxLon, lat: minLat },
          { lon: maxLon, lat: maxLat },
          { lon: minLon, lat: maxLat },
          { lon: minLon, lat: minLat },
        ],
        // Central North-South Avenue
        [
          { lon: midLon, lat: minLat },
          { lon: midLon, lat: maxLat },
          { lon: midLon + 0.0003, lat: maxLat },
          { lon: midLon + 0.0003, lat: minLat },
        ],
        // Central East-West Avenue
        [
          { lon: minLon, lat: midLat },
          { lon: maxLon, lat: midLat },
          { lon: maxLon, lat: midLat + 0.0003 },
          { lon: minLon, lat: midLat + 0.0003 },
        ],
        // Diagonal Expressway Corridor
        [
          { lon: minLon, lat: minLat },
          { lon: maxLon, lat: maxLat },
          { lon: maxLon, lat: minLat },
          { lon: minLon, lat: maxLat },
        ],
      ];

      const modernColors = [
        Color.fromCssColorString('#ef4444'), // Red Sport Sedan
        Color.fromCssColorString('#eab308'), // Yellow City Taxi
        Color.fromCssColorString('#3b82f6'), // Electric Blue Coupe
        Color.fromCssColorString('#f8fafc'), // White Pearl SUV
        Color.fromCssColorString('#0284c7'), // Metro Transit Bus
        Color.fromCssColorString('#10b981'), // Emerald Hatchback
        Color.fromCssColorString('#8b5cf6'), // Purple Luxury Sedan
        Color.fromCssColorString('#475569'), // Slate Delivery Van
      ];

      for (let i = 0; i < vehicleCount; i++) {
        const route = routes[i % routes.length]!;
        const color = modernColors[i % modernColors.length]!;
        const isBus = i % 4 === 0;
        const isVan = i % 5 === 0 && !isBus;

        const width = isBus ? 8.5 : isVan ? 7.0 : 5.5;
        const length = isBus ? 24.0 : isVan ? 16.0 : 13.0;
        const height = isBus ? 6.5 : isVan ? 5.5 : 3.8;
        const speed = isBus ? 9.0 : 12.0 + (i % 3) * 3.0;

        const vId = `${city.id}_v_${i}`;
        this.createVehicle(
          vId,
          city.id,
          route,
          color,
          width,
          length,
          height,
          speed,
          false,
          1.8 + (i % 2) * 0.8,
        );
      }
    } else {
      // Medieval / Fantasy Town: Circular ring roads and cobblestone avenues
      const radii = isCity ? [0.0012, 0.0024] : [0.0016];
      let carriageIdx = 0;

      for (const rDist of radii) {
        const ringWaypoints: Waypoint[] = [];
        const wpCount = 16;
        for (let w = 0; w < wpCount; w++) {
          const angle = (w / wpCount) * Math.PI * 2;
          ringWaypoints.push({
            lon: lon + Math.cos(angle) * rDist,
            lat: lat + Math.sin(angle) * rDist,
          });
        }

        const carriageColors = [
          Color.fromCssColorString('#7c2d12'), // Timber Mahogany
          Color.fromCssColorString('#78716c'), // Cobblestone Grey
          Color.fromCssColorString('#b45309'), // Amber Wood
          Color.fromCssColorString('#451a03'), // Dark Oak
        ];

        const vehiclesPerRing = Math.floor(vehicleCount / radii.length);
        for (let i = 0; i < vehiclesPerRing; i++) {
          const color = carriageColors[i % carriageColors.length]!;
          const width = 5.0;
          const length = 10.0;
          const height = 4.2;
          const speed = 4.5 + (i % 2) * 1.5;

          const vId = `${city.id}_c_${carriageIdx++}`;
          this.createVehicle(
            vId,
            city.id,
            ringWaypoints,
            color,
            width,
            length,
            height,
            speed,
            true,
            1.5,
          );
        }
      }
    }
  }

  /**
   * Helper function to instantiate 3D vehicles.
   */
  private createVehicle(
    id: string,
    cityId: string,
    route: Waypoint[],
    color: Color,
    width: number,
    length: number,
    height: number,
    speed: number,
    isCarriage: boolean,
    laneOffsetMeters: number,
  ): void {
    if (!this.viewer) return;

    const startWpIdx = 0;
    const startPt = route[startWpIdx]!;
    const nextPt = route[(startWpIdx + 1) % route.length]!;
    const initialHeading = this.computeHeading(startPt, nextPt);

    const posCartesian = Cartesian3.fromDegrees(startPt.lon, startPt.lat, height / 2);
    const orientQuat = Transforms.headingPitchRollQuaternion(
      posCartesian,
      new HeadingPitchRoll(initialHeading, 0, 0)
    );

    // Main Chassis Entity
    const mainEntity = this.viewer.entities.add({
      name: `Vehicle ${id}`,
      position: new ConstantPositionProperty(posCartesian) as any,
      orientation: new ConstantProperty(orientQuat) as any,
      box: {
        dimensions: new Cartesian3(width, length, height),
        material: color,
        distanceDisplayCondition: trafficDistanceCondition,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      },
    });

    this.vehicles.set(id, {
      id,
      cityId,
      waypoints: route,
      currentWaypointIndex: startWpIdx,
      progress: Math.random() * 0.8,
      speed,
      color,
      width,
      length,
      height,
      mainEntity,
      subParts: [],
      isCarriage,
      laneOffsetMeters,
    });
  }

  /**
   * Main animation loop update tick: advances all active vehicles smoothly along their routes.
   */
  public update(): void {
    if (!this.viewer || this.viewer.isDestroyed() || this.vehicles.size === 0) return;

    const now = performance.now();
    const dtSeconds = (now - this.lastUpdateTime) / 1000;
    if (dtSeconds < 0.033) return; // Throttle to max 30 FPS to protect CPU main thread
    this.lastUpdateTime = now;
    const dt = Math.min(0.1, dtSeconds);

    for (const vehicle of this.vehicles.values()) {
      const waypoints = vehicle.waypoints;
      if (!waypoints || waypoints.length < 2) continue;

      const currWp = waypoints[vehicle.currentWaypointIndex]!;
      const nextWpIdx = (vehicle.currentWaypointIndex + 1) % waypoints.length;
      const nextWp = waypoints[nextWpIdx]!;

      // Approximate segment length in meters
      const segDistance = this.computeDistanceMeters(currWp, nextWp);
      if (segDistance < 0.1) continue;

      // Advance progress along segment
      vehicle.progress += (vehicle.speed * dt) / segDistance;

      if (vehicle.progress >= 1.0) {
        vehicle.progress -= 1.0;
        vehicle.currentWaypointIndex = nextWpIdx;
      }

      // Interpolate current center coordinates
      const p1 = waypoints[vehicle.currentWaypointIndex]!;
      const p2 = waypoints[(vehicle.currentWaypointIndex + 1) % waypoints.length]!;

      const rawLon = p1.lon + (p2.lon - p1.lon) * vehicle.progress;
      const rawLat = p1.lat + (p2.lat - p1.lat) * vehicle.progress;

      const heading = this.computeHeading(p1, p2);

      // Compute Right-Hand Lane Offset perpendicular to heading vector
      const rightHeading = heading + Math.PI / 2;
      const degPerMeterLat = 1 / 111_000;
      const degPerMeterLon = 1 / (111_000 * Math.cos((rawLat * Math.PI) / 180));

      const offsetLon = Math.sin(rightHeading) * vehicle.laneOffsetMeters * degPerMeterLon;
      const offsetLat = Math.cos(rightHeading) * vehicle.laneOffsetMeters * degPerMeterLat;

      const currentLon = rawLon + offsetLon;
      const currentLat = rawLat + offsetLat;

      const posCartesian = Cartesian3.fromDegrees(currentLon, currentLat, vehicle.height / 2);
      const orientQuat = Transforms.headingPitchRollQuaternion(
        posCartesian,
        new HeadingPitchRoll(heading, 0, 0)
      );

      // Safe Cesium position & orientation property value updates
      if (vehicle.mainEntity.position instanceof ConstantPositionProperty) {
        vehicle.mainEntity.position.setValue(posCartesian);
      } else {
        vehicle.mainEntity.position = new ConstantPositionProperty(posCartesian) as any;
      }

      if (vehicle.mainEntity.orientation instanceof ConstantProperty) {
        vehicle.mainEntity.orientation.setValue(orientQuat);
      } else {
        vehicle.mainEntity.orientation = new ConstantProperty(orientQuat) as any;
      }
    }

    this.viewer.scene.requestRender();
  }

  private computeHeading(p1: Waypoint, p2: Waypoint): number {
    const dLon = (p2.lon - p1.lon) * Math.cos((p1.lat * Math.PI) / 180);
    const dLat = p2.lat - p1.lat;
    return Math.atan2(dLon, dLat);
  }

  private computeDistanceMeters(p1: Waypoint, p2: Waypoint): number {
    const rad = Math.PI / 180;
    const dLat = (p2.lat - p1.lat) * rad;
    const dLon = (p2.lon - p1.lon) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * rad) * Math.cos(p2.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6_371_000 * c;
  }
}

export const trafficManager = new TrafficManager();

