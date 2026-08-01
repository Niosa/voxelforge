import {
  Viewer,
  Cartesian3,
  HeadingPitchRoll,
} from 'cesium';

export interface VehicleDrivingState {
  isDriving: boolean;
  vehicleId: string | null;
  speed: number;
  maxSpeed: number;
  steeringAngle: number;
  heading: number;
  lon: number;
  lat: number;
}

class VehicleController {
  private active = false;
  private vehicleId: string | null = null;
  private lon = 0;
  private lat = 0;
  private heading = 0;
  private speed = 0;
  private maxSpeed = 16.0; // 16 m/s (~58 km/h)
  private accel = 12.0; // m/s^2
  private brake = 18.0; // m/s^2
  private turnRate = 1.8; // rad/s

  enterVehicle(id: string, startLon: number, startLat: number, startHeading = 0): void {
    this.active = true;
    this.vehicleId = id;
    this.lon = startLon;
    this.lat = startLat;
    this.heading = startHeading;
    this.speed = 0;
  }

  exitVehicle(): { lon: number; lat: number } | null {
    if (!this.active) return null;
    this.active = false;
    const exitPos = { lon: this.lon + 0.00003, lat: this.lat };
    this.vehicleId = null;
    this.speed = 0;
    return exitPos;
  }

  isDrivingActive(): boolean {
    return this.active;
  }

  getDrivingState(): VehicleDrivingState {
    return {
      isDriving: this.active,
      vehicleId: this.vehicleId,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      steeringAngle: 0,
      heading: this.heading,
      lon: this.lon,
      lat: this.lat,
    };
  }

  updateDrivingPhysics(
    forwardInput: number,
    steerInput: number,
    dt: number,
  ): { lon: number; lat: number; heading: number } | null {
    if (!this.active) return null;

    // Acceleration & Braking
    if (forwardInput > 0) {
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt * forwardInput);
    } else if (forwardInput < 0) {
      this.speed = Math.max(-this.maxSpeed * 0.4, this.speed - this.brake * dt * Math.abs(forwardInput));
    } else {
      // Natural Friction Damping
      this.speed *= 0.94;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }

    // Steering
    if (Math.abs(this.speed) > 0.1 && Math.abs(steerInput) > 0.05) {
      const turnDir = this.speed >= 0 ? 1 : -1;
      this.heading += steerInput * this.turnRate * dt * turnDir;
    }

    // Displacement
    const degPerMeterLat = 1 / 111_000;
    const degPerMeterLon = 1 / (111_000 * Math.cos((this.lat * Math.PI) / 180));

    const moveDist = this.speed * dt;
    this.lat += Math.cos(this.heading) * moveDist * degPerMeterLat;
    this.lon += Math.sin(this.heading) * moveDist * degPerMeterLon;

    return { lon: this.lon, lat: this.lat, heading: this.heading };
  }

  updateFollowCamera(viewer: Viewer): void {
    if (!this.active || !viewer || viewer.isDestroyed()) return;

    // 3rd-Person Vehicle Follow Camera: 5.5 meters behind, 2.2 meters up
    const camHeading = this.heading;
    const camPitch = -0.18; // Looking slightly down at car

    const degPerMeterLat = 1 / 111_000;
    const degPerMeterLon = 1 / (111_000 * Math.cos((this.lat * Math.PI) / 180));

    const camLon = this.lon - Math.sin(camHeading) * 5.5 * degPerMeterLon;
    const camLat = this.lat - Math.cos(camHeading) * 5.5 * degPerMeterLat;

    const camPos = Cartesian3.fromDegrees(camLon, camLat, 2.2);
    viewer.camera.setView({
      destination: camPos,
      orientation: new HeadingPitchRoll(camHeading, camPitch, 0),
    });
    viewer.scene.requestRender();
  }
}

export const vehicleController = new VehicleController();
