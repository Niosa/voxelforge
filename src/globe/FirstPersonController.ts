import {
  Cartographic,
  Cartesian3,
  Color,
  Math as CesiumMath,
  HeadingPitchRoll,
  PerspectiveFrustum,
} from 'cesium';
import { getViewer } from '@/globe/CesiumViewer';
import { useUiStore, type FirstPersonBuildingType } from '@/state/uiStore';
import { firstPersonBuilder } from '@/drawing/FirstPersonBuilder';
import { voxelCoords } from '@/globe/voxels/CoordinateSystem';
import { voxelManager } from '@/globe/voxels/VoxelChunk';
import { animateCameraTransition } from '@/globe/CameraTransition';
import { npcManager } from '@/globe/npcManager';

const HOTBAR_SLOTS: FirstPersonBuildingType[] = [
  'house',
  'castle',
  'watchtower',
  'gate',
  'wall',
  'road',
  'flagpole',
  'tree',
];

export class FirstPersonController {
  private active = false;
  private animFrameId: number | null = null;
  private originalFov: number | null = null;

  // Position state
  private currentLon = 0;
  private currentLat = 0;
  private currentHeight = 1.62; // 1.62 meters eye height (Minecraft standard)

  // Jump & Gravity Physics
  private verticalVelocity = 0;
  private isGrounded = true;
  private groundEyeHeight = 1.62;
  private lastFrameTime = 0;

  // Smooth Movement Velocity
  private velocityForward = 0;
  private velocitySide = 0;

  // Flight Mode Toggle (Double Tap Space)
  private isFlying = false;
  private lastSpaceTime = 0;

  // Orientation angles (radians)
  private heading = 0;
  private pitch = 0;
  private targetHeading = 0;
  private targetPitch = 0;

  // Mobile Touch Inputs
  private touchForward = 0;
  private touchSide = 0;

  // Key states
  private keysPressed: Record<string, boolean> = {};

  // Pointer lock state
  private isPointerLocked = false;

  /** Set mobile joystick movement ratios (-1 to +1) */
  setTouchMovement(forward: number, side: number): void {
    this.touchForward = Math.max(-1, Math.min(1, forward));
    this.touchSide = Math.max(-1, Math.min(1, side));
  }

  /** Rotate camera heading and pitch from mobile touch drag */
  addTouchLookDelta(deltaX: number, deltaY: number): void {
    const sensitivity = 0.0028;
    this.targetHeading += deltaX * sensitivity;
    this.targetPitch -= deltaY * sensitivity;

    const maxPitch = CesiumMath.toRadians(85);
    this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
  }

  /** Trigger mobile jump or upward impulse in flight */
  triggerJump(): void {
    if (this.isFlying) {
      this.currentHeight = Math.min(500, this.currentHeight + 2.5);
    } else if (this.isGrounded) {
      this.verticalVelocity = 8.4;
      this.isGrounded = false;
    }
  }

  /** Toggle flight mode on mobile */
  toggleFlight(): void {
    this.isFlying = !this.isFlying;
    this.verticalVelocity = 0;
  }

  /** Query flight active status */
  isFlightActive(): boolean {
    return this.isFlying;
  }

  /** Enter First-Person Mode at target coordinates or current camera focal point */
  enter(targetLon?: number, targetLat?: number): void {
    const viewer = getViewer();
    if (!viewer || this.active) return;

    const camera = viewer.camera;

    // Determine initial ground position
    if (typeof targetLon === 'number' && typeof targetLat === 'number') {
      this.currentLon = targetLon;
      this.currentLat = targetLat;
    } else {
      const cartographic = camera.positionCartographic;
      this.currentLon = CesiumMath.toDegrees(cartographic.longitude);
      this.currentLat = CesiumMath.toDegrees(cartographic.latitude);
    }

    this.heading = camera.heading;
    this.pitch = -0.05; // Looking slightly forward
    this.targetHeading = this.heading;
    this.targetPitch = this.pitch;

    // Set 95° Field of View for wide, natural Minecraft ground perspective
    if (camera.frustum instanceof PerspectiveFrustum) {
      this.originalFov = camera.frustum.fov ?? null;
      camera.frustum.fov = CesiumMath.toRadians(95);
    }

    // Anchor the voxel grid to the player's starting ground position
    const carto = Cartographic.fromDegrees(this.currentLon, this.currentLat);
    const terrainH = viewer.scene.globe.getHeight(carto) ?? 0;
    this.currentHeight = terrainH + 1.62;
    this.groundEyeHeight = terrainH + 1.62;
    voxelCoords.setAnchor(this.currentLon, this.currentLat, terrainH);
    firstPersonBuilder.init();

    // Use static ground color & hide dynamic LoD imagery in walk mode for ultra performance
    viewer.scene.globe.baseColor = Color.fromCssColorString('#2d5a27');
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const layer = viewer.imageryLayers.get(i);
      if (layer) layer.show = false;
    }

    // Enable terrain depth testing in 1st-person mode so solid 3D terrain prevents below-ground flickering
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // Disable Cesium standard orbit & tilt controls
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableZoom = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;

    this.active = true;
    useUiStore.getState().setFirstPersonActive(true);
    useUiStore.getState().setInspectorOpen(false);
    useUiStore.getState().setTool('walk');

    // Request Pointer Lock (Mouse Capture)
    this.requestPointerLock();

    // Attach Event Listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    viewer.canvas.addEventListener('click', this.handleCanvasClick);

    // Start smooth fly-down lerp from orbit to ground
    const startPose = {
      position: camera.position.clone(),
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      fov: (camera.frustum instanceof PerspectiveFrustum) ? camera.frustum.fov : undefined,
    };

    const targetPos = Cartesian3.fromDegrees(this.currentLon, this.currentLat, this.currentHeight);
    const endPose = {
      position: targetPos,
      heading: this.heading,
      pitch: this.pitch,
      roll: 0,
      fov: CesiumMath.toRadians(95),
    };

    animateCameraTransition(viewer, startPose, endPose, 1100, () => {
      if (viewer.isDestroyed()) return;
      this.startLoop();
    });
  }

  /** Exit First-Person Mode and restore orbital camera view */
  exit(): void {
    const viewer = getViewer();
    if (!viewer || !this.active) return;

    this.active = false;
    this.isFlying = false;
    useUiStore.getState().setFirstPersonActive(false);
    useUiStore.getState().setTool('select');

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    if (viewer) {
      viewer.canvas.removeEventListener('click', this.handleCanvasClick);
    }
    this.keysPressed = {};
    this.touchForward = 0;
    this.touchSide = 0;

    // Restore Cesium standard orbit controls and original FoV smoothly
    if (viewer) {
      for (let i = 0; i < viewer.imageryLayers.length; i++) {
        const layer = viewer.imageryLayers.get(i);
        if (layer) layer.show = true;
      }
      viewer.scene.globe.depthTestAgainstTerrain = true;

      const currentCamPos = viewer.camera.position.clone();
      const startPose = {
        position: currentCamPos,
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
        fov: (viewer.camera.frustum instanceof PerspectiveFrustum) ? viewer.camera.frustum.fov : undefined,
      };

      const orbitPos = Cartesian3.fromDegrees(this.currentLon, this.currentLat, 8_000_000);
      const endPose = {
        position: orbitPos,
        heading: 0,
        pitch: -CesiumMath.PI_OVER_TWO + 0.05,
        roll: 0,
        fov: this.originalFov ?? CesiumMath.toRadians(60),
      };

      animateCameraTransition(viewer, startPose, endPose, 1200, () => {
        if (viewer.isDestroyed()) return;
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
        viewer.scene.screenSpaceCameraController.enableZoom = true;
        viewer.scene.screenSpaceCameraController.enableTilt = true;
        viewer.scene.screenSpaceCameraController.enableLook = true;
        viewer.scene.requestRender();
      });
    }
  }

  isActive(): boolean {
    return this.active;
  }

  requestPointerLock(): void {
    const viewer = getViewer();
    if (viewer && viewer.canvas) {
      viewer.canvas.requestPointerLock?.();
    }
  }

  getCurrentPosition(): { lon: number; lat: number; height: number; heading: number } {
    return { lon: this.currentLon, lat: this.currentLat, height: this.currentHeight, heading: this.heading };
  }

  private handleContextMenu = (e: MouseEvent) => {
    if (this.active) {
      e.preventDefault(); // Prevent right-click context menu in Minecraft 1st person mode
    }
  };

  private handleCanvasClick = () => {
    if (this.active && !document.pointerLockElement) {
      this.requestPointerLock();
    }
  };

  private handlePointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement !== null;
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.active) return;

    // Right Click (button === 2) places voxel block in Minecraft mode!
    if (e.button === 2) {
      firstPersonBuilder.placeCurrentStructure();
    } else if (e.button === 0 && this.isPointerLocked) {
      // Left Click (button === 0) deletes targeted voxel block in Minecraft mode!
      firstPersonBuilder.deleteTargetedBlock();
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (!this.active) return;
    e.preventDefault(); // Scroll wheel cycles through Minecraft hotbar slots 1-8

    const currentType = useUiStore.getState().firstPersonBuildingType;
    let idx = HOTBAR_SLOTS.indexOf(currentType);
    if (idx === -1) idx = 0;

    if (e.deltaY > 0) {
      idx = (idx + 1) % HOTBAR_SLOTS.length;
    } else if (e.deltaY < 0) {
      idx = (idx - 1 + HOTBAR_SLOTS.length) % HOTBAR_SLOTS.length;
    }

    useUiStore.getState().setFirstPersonBuildingType(HOTBAR_SLOTS[idx]!);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.active) return;

    // Use Pointer Lock relative delta movement if active, or right-drag fallback
    if (this.isPointerLocked || (e.buttons & 1) !== 0 || (e.buttons & 2) !== 0) {
      const sensitivity = 0.0022;
      this.targetHeading += e.movementX * sensitivity;
      this.targetPitch -= e.movementY * sensitivity;

      // Clamp pitch to look up/down limits (-85 deg to +85 deg)
      const maxPitch = CesiumMath.toRadians(85);
      this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;

    // Hotbar Direct Keys 1 through 8
    const num = Number.parseInt(e.key, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 8) {
      const targetSlot = HOTBAR_SLOTS[num - 1];
      if (targetSlot) {
        useUiStore.getState().setFirstPersonBuildingType(targetSlot);
      }
      return;
    }

    // Key 'E' places block in Minecraft mode
    if (e.key === 'e' || e.key === 'E') {
      firstPersonBuilder.placeCurrentStructure();
      return;
    }

    // Double Tap Space toggles Minecraft Flight Mode; Single Tap Space jumps when grounded!
    if (e.key === ' ') {
      const now = performance.now();
      if (now - this.lastSpaceTime < 280) {
        this.isFlying = !this.isFlying;
        this.verticalVelocity = 0;
      } else if (!this.isFlying && this.isGrounded) {
        // Minecraft Jump Impulse (8.4 m/s upward velocity to clear 1m blocks)
        this.verticalVelocity = 8.4;
        this.isGrounded = false;
      }
      this.lastSpaceTime = now;
    }

    if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Shift', 'Control'].includes(e.key)) {
      this.keysPressed[e.key.toLowerCase()] = true;
    } else if (e.key === 'Escape') {
      this.exit();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (!this.active) return;
    this.keysPressed[e.key.toLowerCase()] = false;
  };

  private startLoop(): void {
    this.lastFrameTime = performance.now();
    const loop = () => {
      if (!this.active) return;
      this.updatePhysics();
      this.updateCameraTransform();
      npcManager.update(this.currentLon, this.currentLat);
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private updatePhysics(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this.lastFrameTime || now)) / 1000);
    this.lastFrameTime = now;

    // 1. Smoothly interpolate camera look angles (Exponential decay lerp)
    const lerpFactor = 0.25;
    this.heading += (this.targetHeading - this.heading) * lerpFactor;
    this.pitch += (this.targetPitch - this.pitch) * lerpFactor;

    // 2. Velocity Acceleration & Friction Damping (Exact Minecraft 1.0m scale)
    const isSprint = this.keysPressed['control'] || this.keysPressed['shift'];
    const accelSpeed = isSprint ? 0.00000022 : 0.00000014; // Exact 4.3 m/s walking & 5.6 m/s sprinting
    const friction = 0.78; // Velocity damping factor

    let desiredForward = 0;
    let desiredSide = 0;

    if (this.keysPressed['w'] || this.keysPressed['arrowup']) desiredForward += accelSpeed;
    if (this.keysPressed['s'] || this.keysPressed['arrowdown']) desiredForward -= accelSpeed;
    if (this.keysPressed['d'] || this.keysPressed['arrowright']) desiredSide += accelSpeed;
    if (this.keysPressed['a'] || this.keysPressed['arrowleft']) desiredSide -= accelSpeed;

    if (Math.abs(this.touchForward) > 0.01) {
      desiredForward += accelSpeed * this.touchForward;
    }
    if (Math.abs(this.touchSide) > 0.01) {
      desiredSide += accelSpeed * this.touchSide;
    }

    this.velocityForward = this.velocityForward * friction + desiredForward;
    this.velocitySide = this.velocitySide * friction + desiredSide;

    if (Math.abs(this.velocityForward) > 0.000000001 || Math.abs(this.velocitySide) > 0.000000001) {
      const cosH = Math.cos(this.heading);
      const sinH = Math.sin(this.heading);

      // Candidate position
      const deltaLon = (this.velocitySide * cosH + this.velocityForward * sinH);
      const deltaLat = (this.velocityForward * cosH - this.velocitySide * sinH);

      const nextLon = this.currentLon + deltaLon;
      const nextLat = this.currentLat + deltaLat;

      // Solid Voxel Collision & Step-Up Physics Check
      const viewer = getViewer();
      const carto = Cartographic.fromDegrees(nextLon, nextLat);
      const currentGroundH = viewer ? (viewer.scene.globe.getHeight(carto) ?? 0) : 0;
      const nextWorldPos = Cartesian3.fromDegrees(nextLon, nextLat, currentGroundH);
      const nextLocalPos = voxelCoords.worldToLocal(nextWorldPos);
      const { cx, cy, cz, lx, ly } = voxelCoords.localToChunk(nextLocalPos);

      let maxBlockTopZ = 0; // Local ENU meters above ground anchor
      const chunk = voxelManager.getChunk(cx, cy, cz);
      if (chunk) {
        for (let checkZ = 0; checkZ < 32; checkZ++) {
          if (chunk.getBlock(lx, ly, checkZ)) {
            maxBlockTopZ = Math.max(maxBlockTopZ, (checkZ + 1) * 1.0);
          }
        }
      }

      const playerFeetZ = this.currentHeight - 1.62;

      if (!this.isFlying && maxBlockTopZ > 0) {
        const stepDiff = maxBlockTopZ - playerFeetZ;
        if (stepDiff > 0.05 && stepDiff <= 1.15) {
          // Automatic 1-block step up onto block top!
          this.groundEyeHeight = maxBlockTopZ + 1.62;
          this.currentLon = nextLon;
          this.currentLat = nextLat;
        } else if (stepDiff > 1.15) {
          // Solid wall collision: block movement into wall!
          this.velocityForward = 0;
          this.velocitySide = 0;
        } else {
          this.currentLon = nextLon;
          this.currentLat = nextLat;
        }
      } else {
        if (!this.isFlying && maxBlockTopZ === 0) {
          this.groundEyeHeight = 1.62;
        }
        this.currentLon = nextLon;
        this.currentLat = nextLat;
      }
    }

    // 3. Jump & Gravity Physics System (Minecraft Java 1.20 Exact Constants)
    if (this.isFlying) {
      // Flight Mode: Flying up/down smoothly with Space / Shift
      if (this.keysPressed[' ']) {
        this.currentHeight = Math.min(500, this.currentHeight + 10.0 * dt);
      }
      if (this.keysPressed['shift']) {
        this.currentHeight = Math.max(this.groundEyeHeight, this.currentHeight - 10.0 * dt);
      }
      this.verticalVelocity = 0;
    } else {
      // Ground Mode: Gravity + Jump Physics
      if (!this.isGrounded) {
        const gravity = 32.0; // m/s^2 heavy snappy Minecraft gravity
        this.verticalVelocity -= gravity * dt;
        this.currentHeight += this.verticalVelocity * dt;

        // Ground landing collision check
        if (this.currentHeight <= this.groundEyeHeight) {
          this.currentHeight = this.groundEyeHeight;
          this.verticalVelocity = 0;
          this.isGrounded = true;
        }
      } else {
        this.currentHeight = this.groundEyeHeight;
      }
    }
  }

  private cachedTerrainHeight = 0;

  private updateCameraTransform(): void {
    const viewer = getViewer();
    if (!viewer) return;

    // Sample terrain elevation safely using persistent cached height
    const globe = viewer.scene.globe;
    const carto = Cartographic.fromDegrees(this.currentLon, this.currentLat);
    const rawH = globe.getHeight(carto);
    if (typeof rawH === 'number' && !isNaN(rawH)) {
      this.cachedTerrainHeight = rawH;
    }

    const terrainHeight = this.cachedTerrainHeight;
    const totalAltitude = terrainHeight + this.currentHeight;

    const cameraPos = Cartesian3.fromDegrees(this.currentLon, this.currentLat, totalAltitude);
    const hpr = new HeadingPitchRoll(this.heading, this.pitch, 0);

    viewer.camera.setView({
      destination: cameraPos,
      orientation: hpr,
    });
    viewer.scene.requestRender();
  }
}

export const firstPersonController = new FirstPersonController();
