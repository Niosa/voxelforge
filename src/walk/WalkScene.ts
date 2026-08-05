/**
 * WalkScene — initialises and manages a noa-engine voxel world anchored
 * to a geodetic position on the Cesium globe.
 */

import { Engine } from 'noa-engine';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

import type { TerraEntity, WalkAnchor, VoxelChunkMap, VoxelBlock, WorldMob, WorldNpc } from '@/entities/types';
import { BLOCKS, BLOCK_AIR, getBlockGroup } from './blockRegistry';
import { blockToChunkKey } from './GeoAnchor';
import { useWalkStore } from '@/state/walkStore';
import {
  WALK_REACH_BLOCKS,
  isBlockWithinReach,
  placementPosition,
  nextTouchPitch,
  walkAnchorsMatch,
  walkBlockTarget,
  viewBobOffset,
} from './WalkInteraction';
import {
  createPlanetLocalFrame,
  localChunkToPlanetKey,
  lonLatToPlanetMeters,
  type PlanetLocalFrame,
} from '@/planet/spatial/PlanetGrid';
import { MAX_NATURAL_TERRAIN_Y, PlanetTerrainSampler } from '@/planet/terrain/PlanetTerrainSampler';
import { useUiStore } from '@/state/uiStore';
import { useWorldStore } from '@/state/worldStore';
import { PersistentWalkNpcManager, type NpcConversationBubble } from './PersistentWalkNpcManager';
import { WalkTrafficManager } from './WalkTrafficManager';
import { WalkNodeSimulation } from './WalkNodeSimulation';
import { PersistentWalkMobManager } from './PersistentWalkMobManager';

const BLOCK_DOOR_CLOSED = 23;
const BLOCK_DOOR_OPEN = 24;
const BLOCK_DOOR_CLOSED_UPPER = 46;
const BLOCK_DOOR_OPEN_UPPER = 47;
const DOOR_BLOCKS = new Set([BLOCK_DOOR_CLOSED, BLOCK_DOOR_OPEN, BLOCK_DOOR_CLOSED_UPPER, BLOCK_DOOR_OPEN_UPPER]);
const BLOCK_TORCH = 21;
const MAX_ACTIVE_TORCH_LIGHTS = 24;

function toggledDoorBlock(blockId: number): number {
  switch (blockId) {
    case BLOCK_DOOR_CLOSED: return BLOCK_DOOR_OPEN;
    case BLOCK_DOOR_OPEN: return BLOCK_DOOR_CLOSED;
    case BLOCK_DOOR_CLOSED_UPPER: return BLOCK_DOOR_OPEN_UPPER;
    case BLOCK_DOOR_OPEN_UPPER: return BLOCK_DOOR_CLOSED_UPPER;
    default: return blockId;
  }
}

type NoaInstance = Engine;

interface NoaShellRuntime {
  onTick: (dt: number) => void;
  onRender: (dt: number, framePart: number) => void;
  _data: {
    frameCB: FrameRequestCallback;
    intervalID: number;
  };
}

interface VoxelNdarray {
  set(x: number, y: number, z: number, blockId: number): void;
}

function stopEngine(noa: Engine): void {
  noa.setPaused(true);
  noa.container.setPointerLock(false);
  // noa 0.33 has no public teardown API; stop its internal shell at this adapter boundary.
  const shell = noa.container._shell as unknown as NoaShellRuntime;
  window.clearInterval(shell._data.intervalID);
  shell.onTick = () => undefined;
  shell.onRender = () => undefined;
  shell._data.frameCB = () => undefined;
  noa.container.canvas.remove();
}

function createPlantMesh(noa: Engine, name: string, color: string, textureUrl?: string): Mesh {
  const scene = noa.rendering.getScene();
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.emissiveColor = material.diffuseColor.scale(0.12);
  material.backFaceCulling = false;
  if (textureUrl) {
    const texture = new Texture(textureUrl, scene, false, true, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHATEST;
    material.alphaCutOff = 0.1;
    // Preserve the authored texture colours instead of tinting them pink.
    material.diffuseColor = Color3.White();
    material.emissiveColor = Color3.Black();
  }
  const first = MeshBuilder.CreatePlane(`${name}-a`, { width: 0.72, height: 0.82, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const second = MeshBuilder.CreatePlane(`${name}-b`, { width: 0.72, height: 0.82, sideOrientation: Mesh.DOUBLESIDE }, scene);
  first.position.y = 0.41;
  second.position.y = 0.41;
  second.rotation.y = Math.PI / 2;
  first.material = material;
  second.material = material;
  const merged = Mesh.MergeMeshes([first, second], true, true, undefined, false, false);
  if (!merged) throw new Error(`Unable to create ${name} plant mesh`);
  merged.material = material;
  return merged;
}

function createTorchMesh(noa: Engine): Mesh {
  const scene = noa.rendering.getScene();
  const material = new StandardMaterial('torch-material', scene);
  const texture = new Texture('/textures/blocks/torch_on.png', scene, false, true, Texture.NEAREST_SAMPLINGMODE);
  texture.hasAlpha = true;
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.1;
  material.backFaceCulling = false;
  material.emissiveColor = new Color3(0.72, 0.42, 0.12);
  material.disableLighting = false;

  const first = MeshBuilder.CreatePlane('torch-a', { width: 0.34, height: 0.78, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const second = MeshBuilder.CreatePlane('torch-b', { width: 0.34, height: 0.78, sideOrientation: Mesh.DOUBLESIDE }, scene);
  first.position.y = 0.39;
  second.position.y = 0.39;
  second.rotation.y = Math.PI / 2;
  first.material = material;
  second.material = material;
  const merged = Mesh.MergeMeshes([first, second], true, true, undefined, false, false);
  if (!merged) throw new Error('Unable to create torch mesh');
  merged.material = material;
  return merged;
}

export interface WalkSceneOptions {
  anchor: WalkAnchor;
  container: HTMLElement;
  savedChunks?: VoxelChunkMap;
  savedAnchor?: WalkAnchor;
  entities?: Record<string, TerraEntity>;
  npcs?: Record<string, WorldNpc>;
  mobs?: Record<string, WorldMob>;
  seed?: number;
  onNpcConversation?: (conversation: NpcConversationBubble) => void;
}

export interface WalkSceneResult {
  chunks: VoxelChunkMap;
  generatedChunks: string[];
  npcs: Record<string, WorldNpc>;
  mobs: Record<string, WorldMob>;
}

function hexToRgbFloats(hex: string): [number, number, number] {
  if (!hex || hex === 'transparent') return [1, 1, 1];
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return [1, 1, 1];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

export class WalkScene {
  readonly noa: NoaInstance;
  private _dirty = new Set<string>();
  private _generated = new Set<string>();
  private readonly _frame: PlanetLocalFrame;
  private readonly _terrain: PlanetTerrainSampler;
  private readonly _npcs: PersistentWalkNpcManager;
  private readonly _traffic: WalkTrafficManager;
  private readonly _mobs: PersistentWalkMobManager;
  private _lastTickAt = performance.now();
  private _touchSprinting = false;
  private _keyboardSprinting = false;
  private _bobPhase = 0;
  private _cameraBaseOffsetY = 1.62;
  private _lastNodeStepAt = performance.now();
  private readonly _nodeSimulation: WalkNodeSimulation;
  private _creativeFlying = false;
  private readonly _torchPositions = new Map<string, [number, number, number]>();
  private readonly _torchLights = new Map<string, PointLight>();
  private _lastTorchLightSyncAt = 0;

  private constructor(
    noa: NoaInstance,
    frame: PlanetLocalFrame,
    terrain: PlanetTerrainSampler,
    npcs: PersistentWalkNpcManager,
    traffic: WalkTrafficManager,
    mobs: PersistentWalkMobManager,
  ) {
    this.noa = noa;
    this._frame = frame;
    this._terrain = terrain;
    this._npcs = npcs;
    this._traffic = traffic;
    this._mobs = mobs;
    this._nodeSimulation = new WalkNodeSimulation({
      getBlock: (x, y, z) => this.noa.getBlock(x, y, z),
      setBlock: (blockId, position) => { this.noa.setBlock(blockId, position); },
      onChanged: (position) => { this._dirty.add(blockToChunkKey(...position)); },
    });
    const follow = (this.noa.ents as unknown as {
      getState: (id: number, component: string) => { offset?: number[] } | undefined;
    }).getState(this.noa.camera.cameraTarget, 'followsEntity');
    if (follow?.offset && Number.isFinite(follow.offset[1])) this._cameraBaseOffsetY = follow.offset[1]!;
  }

  static create(opts: WalkSceneOptions): WalkScene {
    const frame = createPlanetLocalFrame(opts.anchor);
    const terrain = new PlanetTerrainSampler(opts.entities ?? {}, opts.seed);
    const anchorGlobalX = frame.originX + Math.floor(frame.spawnX);
    const anchorGlobalZ = frame.originZ + Math.floor(frame.spawnZ);
    const [safeX, spawnHeight, safeZ] = terrain.findSafeSpawn(anchorGlobalX, anchorGlobalZ);
    const compactChunkRadius = useUiStore.getState().performanceMode;
    const noa: NoaInstance = new Engine({
      debug: false,
      silent: true,
      playerHeight: 1.8,
      playerWidth: 0.6,
      playerStart: [safeX - frame.originX + 0.5, spawnHeight, safeZ - frame.originZ + 0.5],
      playerAutoStep: true,
      blockTestDistance: WALK_REACH_BLOCKS,
      sensitivityX: 7.5,
      sensitivityY: 7.5,
      sensitivityMultOutsidePointerlock: 0,
      dragCameraOutsidePointerLock: false,
      preventDefaults: true,
      bindings: {
        forward: ['KeyW', 'ArrowUp'],
        backward: ['KeyS', 'ArrowDown'],
        left: ['KeyA', 'ArrowLeft'],
        right: ['KeyD', 'ArrowRight'],
        fire: 'Mouse1',
        'mid-fire': ['Mouse2', 'KeyQ'],
        'alt-fire': 'Mouse3',
        jump: 'Space',
        'fly-down': 'KeyC',
        sprint: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'],
      },
      chunkSize: 32,
      chunkAddDistance: compactChunkRadius ? [1, 1] : [2, 1],
      chunkRemoveDistance: compactChunkRadius ? [2, 2] : [3, 2],
      gravity: [0, -20, 0],
      fluidDensity: 1.15,
      fluidDrag: 0.65,
      domElement: opts.container,
    });
    const playerMovement = noa.ents.getMovement(noa.playerEntity);
    // Minecraft's normal walk is roughly 4.3 blocks/second. NOA defaults to
    // 10, which made traversal feel like a permanent sprint.
    playerMovement.maxSpeed = 4.3;
    playerMovement.moveForce = 24;
    playerMovement.responsiveness = 12;
    const plantMeshes = new Map<number, Mesh>([
      [25, createPlantMesh(noa, 'tall-grass', '#65a30d')],
      [26, createPlantMesh(noa, 'wildflower', '#f472b6', '/textures/blocks/flower_rose.png')],
      [BLOCK_TORCH, createTorchMesh(noa)],
    ]);
    for (const block of BLOCKS) {
      if (block.id === BLOCK_AIR) continue;
      const plantMesh = plantMeshes.get(block.id);
      if (plantMesh) {
        noa.registry.registerBlock(block.id, { blockMesh: plantMesh, solid: false, opaque: false });
        continue;
      }
      const isAlpha = block.name === 'glass'
        || block.name.includes('water')
        || block.name === 'ice'
        || block.name.includes('leaves');
      const isFluid = getBlockGroup(block.id, 'liquid') > 0;
      if (typeof block.textures === 'string') {
        const matName = `${block.name}_mat`;
        noa.registry.registerMaterial(matName, {
          textureURL: block.textures,
          texHasAlpha: isAlpha,
        });
        noa.registry.registerBlock(block.id, {
          material: matName,
          solid: block.solid,
          opaque: block.solid && !isAlpha,
          fluid: isFluid,
        });
      } else if (Array.isArray(block.textures)) {
        const topMat = `${block.name}_top`;
        const botMat = `${block.name}_bot`;
        const sideMat = `${block.name}_side`;
        noa.registry.registerMaterial(topMat, { textureURL: block.textures[0]!, texHasAlpha: isAlpha });
        noa.registry.registerMaterial(botMat, { textureURL: block.textures[1]!, texHasAlpha: isAlpha });
        noa.registry.registerMaterial(sideMat, { textureURL: block.textures[2]!, texHasAlpha: isAlpha });
        noa.registry.registerBlock(block.id, {
          material: [topMat, botMat, sideMat],
          solid: block.solid,
          opaque: block.solid && !isAlpha,
          fluid: isFluid,
        });
      } else {
        const rgb = hexToRgbFloats(block.color);
        noa.registry.registerMaterial(block.name, { color: rgb });
        noa.registry.registerBlock(block.id, {
          material: block.name,
          solid: block.solid,
          opaque: block.solid && !isAlpha,
          fluid: isFluid,
        });
      }
    }

    const npcManager = new PersistentWalkNpcManager(
      noa,
      frame,
      terrain,
      opts.npcs ?? {},
      anchorGlobalX,
      anchorGlobalZ,
      () => useUiStore.getState().timeOfDay,
      compactChunkRadius,
    );
    const theme = useWorldStore.getState().world.properties?.theme ?? 'medieval';
    const traffic = new WalkTrafficManager(noa, frame, terrain, opts.npcs ?? {}, compactChunkRadius, theme === 'modern');
    const mobs = new PersistentWalkMobManager(noa, frame, terrain, opts.mobs ?? {}, opts.seed ?? 0, anchorGlobalX, anchorGlobalZ, compactChunkRadius);
    const scene = new WalkScene(noa, frame, terrain, npcManager, traffic, mobs);
    const legacyBlocks: VoxelBlock[] = [];
    if (opts.savedChunks && opts.savedAnchor && walkAnchorsMatch(opts.anchor, opts.savedAnchor)) {
      const [legacyOriginX, legacyOriginZ] = lonLatToPlanetMeters(opts.savedAnchor.lon, opts.savedAnchor.lat);
      for (const [key, blocks] of Object.entries(opts.savedChunks)) {
        if (key.startsWith('planet/')) continue;
        for (const block of blocks) {
          legacyBlocks.push({
            bx: Math.floor(legacyOriginX) + block.bx,
            by: block.by,
            bz: Math.floor(legacyOriginZ) + block.bz,
            blockId: block.blockId,
          });
        }
      }
    }

    noa.world.on('worldDataNeeded', (
      id: string,
      data: VoxelNdarray,
      x: number,
      y: number,
      z: number,
    ) => {
      const size = 32;
      const localChunkKey = `${Math.floor(x / size)},${Math.floor(y / size)},${Math.floor(z / size)}`;
      scene._generated.add(localChunkToPlanetKey(frame, localChunkKey));
      // Chunks entirely above the compiler's bounded terrain/decorations are
      // already zero-filled by NOA. Avoid millions of redundant air writes.
      if (y <= MAX_NATURAL_TERRAIN_Y) {
        for (let i = 0; i < size; i++) {
          for (let k = 0; k < size; k++) {
            const globalX = frame.originX + x + i;
            const globalZ = frame.originZ + z + k;
            const column = terrain.blocksForColumn(globalX, globalZ, y, size);
            for (let j = 0; j < size; j++) {
              data.set(i, j, k, column[j]!);
            }
          }
        }
      }

      if (opts.savedChunks) {
        const saved = opts.savedChunks[localChunkToPlanetKey(frame, localChunkKey)] ?? [];
        for (const blk of [...saved, ...legacyBlocks]) {
            const lx = blk.bx - (frame.originX + x);
            const ly = blk.by - y;
            const lz = blk.bz - (frame.originZ + z);
            if (lx >= 0 && lx < size && ly >= 0 && ly < size && lz >= 0 && lz < size) {
              data.set(lx, ly, lz, blk.blockId);
              if (getBlockGroup(blk.blockId, 'liquid') > 0) {
                scene._nodeSimulation.enqueue([blk.bx - frame.originX, blk.by, blk.bz - frame.originZ]);
              }
              if (blk.blockId === BLOCK_TORCH) {
                scene.registerTorch([blk.bx - frame.originX, blk.by, blk.bz - frame.originZ]);
              }
            }
        }
      }

      noa.world.setChunkData(id, data);
    });

    noa.inputs.down.on('fire', () => scene.breakTargetedBlock());
    noa.inputs.down.on('alt-fire', () => {
      if (scene.toggleTargetedDoor()) return;
      const conversation = scene.interactWithTargetedNpc();
      if (conversation) {
        opts.onNpcConversation?.(conversation);
        return;
      }
      scene.placeSelectedBlock();
    });
    noa.on('tick', () => {
      scene.updateSwimming();
      scene._npcs.update();
      scene._mobs.update();
      const now = performance.now();
      scene._traffic.update((now - scene._lastTickAt) / 1_000);
      scene._lastTickAt = now;
      if (now - scene._lastNodeStepAt >= 80) {
        scene._nodeSimulation.step();
        scene._lastNodeStepAt = now;
      }
      scene.updatePlayerSpeed();
      scene.updateCreativeFlight();
      scene.syncTorchLights(now);
      scene.updateViewBobbing();
    });

    return scene;
  }

  applyTouchLookDelta(dx: number, dy: number): void {
    if (!this.noa) return;
    const sens = 0.003;
    this.noa.camera.heading += dx * sens;
    this.noa.camera.pitch = nextTouchPitch(this.noa.camera.pitch, dy, sens);
    // noa only refreshes its direction vector from mouse input while pointer lock is
    // active. Touch controls change the angles directly, so keep the pick ray in sync.
    const cosPitch = Math.cos(this.noa.camera.pitch);
    const direction = this.noa.camera._dirVector as ArrayLike<number> & { [index: number]: number };
    direction[0] = Math.sin(this.noa.camera.heading) * cosPitch;
    direction[1] = -Math.sin(this.noa.camera.pitch);
    direction[2] = Math.cos(this.noa.camera.heading) * cosPitch;
  }

  applyTouchMovement(forward: number, side: number): void {
    if (!this.noa || !this.noa.inputs) return;
    this.noa.inputs.state['forward'] = forward > 0.2;
    this.noa.inputs.state['backward'] = forward < -0.2;
    this.noa.inputs.state['left'] = side < -0.2;
    this.noa.inputs.state['right'] = side > 0.2;
  }

  jump(): void {
    this.noa.inputs.state['jump'] = true;
    window.setTimeout(() => {
      this.noa.inputs.state['jump'] = false;
    }, 100);
  }

  setSprinting(active: boolean): void {
    this._touchSprinting = active;
  }

  setKeyboardSprinting(active: boolean): void {
    this._keyboardSprinting = active;
  }

  releasePointerLock(): void {
    this.noa.container.setPointerLock(false);
  }

  toggleCreativeFlight(): boolean {
    this._creativeFlying = !this._creativeFlying;
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    if (body) {
      body.gravityMultiplier = this._creativeFlying ? 0 : 1;
      body.velocity[1] = 0;
    }
    return this._creativeFlying;
  }

  isCreativeFlightActive(): boolean {
    return this._creativeFlying;
  }

  private updateCreativeFlight(): void {
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    const movement = this.noa.ents.getMovement(this.noa.playerEntity);
    if (!body) return;
    body.gravityMultiplier = this._creativeFlying ? 0 : 1;
    movement.airMoveMult = this._creativeFlying ? 1 : 0.5;
    if (!this._creativeFlying) return;

    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting;
    const vertical = (this.noa.inputs.state['jump'] ? 1 : 0) - (this.noa.inputs.state['fly-down'] ? 1 : 0);
    body.velocity[1] = vertical * (sprinting ? 10 : 6.5);
  }

  private updatePlayerSpeed(): void {
    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting;
    const movement = this.noa.ents.getMovement(this.noa.playerEntity);
    movement.maxSpeed = this._creativeFlying ? (sprinting ? 12 : 8) : (sprinting ? 7.2 : 4.3);
    movement.moveForce = this._creativeFlying ? 40 : (sprinting ? 32 : 24);
  }

  private updateViewBobbing(): void {
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    const follow = (this.noa.ents as unknown as {
      getState: (id: number, component: string) => { offset?: number[] } | undefined;
    }).getState(this.noa.camera.cameraTarget, 'followsEntity');
    if (!body || !follow?.offset) return;
    const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2]);
    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting;
    const grounded = !body.inFluid && body.resting[1] < 0;
    if (grounded && horizontalSpeed >= 0.15) {
      this._bobPhase += Math.min(0.42, horizontalSpeed * (sprinting ? 0.085 : 0.07));
    } else {
      this._bobPhase *= 0.72;
    }
    const target = this._cameraBaseOffsetY + viewBobOffset(this._bobPhase, horizontalSpeed, sprinting, grounded);
    follow.offset[1] += (target - follow.offset[1]) * 0.32;
  }

  getNpcCount(): number {
    return this._npcs.count;
  }

  interactWithNearestNpc(): NpcConversationBubble | null {
    return this._npcs.interact(this.noa.ents.getPosition(this.noa.playerEntity));
  }

  interactWithTargetedNpc(): NpcConversationBubble | null {
    return this._npcs.interactTargeted();
  }

  closeNpcConversation(npcId: string): void {
    this._npcs.closeConversation(npcId);
  }

  private updateSwimming(): void {
    if (!this.noa.inputs.state['jump']) return;
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    if (!body?.inFluid) return;

    // NOA supplies buoyancy and fluid drag; a held jump input adds the active
    // upward stroke needed for Minecraft-like swimming toward the surface.
    body.applyForce([0, 18, 0]);
  }

  placeSelectedBlock(): boolean {
    const blockId = useWalkStore.getState().selectedBlockId;
    if (blockId === BLOCK_AIR || !BLOCKS.some((block) => block.id === blockId && block.placeable !== false)) return false;

    const playerPosition = this.noa.ents.getPosition(this.noa.playerEntity);
    const target = this.currentBlockTarget();
    const position = placementPosition(target, playerPosition);
    if (!position) return false;

    if (blockId === BLOCK_DOOR_CLOSED) {
      const upper: [number, number, number] = [position[0], position[1] + 1, position[2]];
      if (this.noa.getBlock(...upper) !== BLOCK_AIR) return false;
      const lowerPlaced = this.noa.addBlock(blockId, position) === blockId;
      const upperPlaced = lowerPlaced && this.noa.addBlock(BLOCK_DOOR_CLOSED_UPPER, upper) === BLOCK_DOOR_CLOSED_UPPER;
      if (!upperPlaced) {
        if (lowerPlaced) this.noa.setBlock(BLOCK_AIR, position);
        return false;
      }
      this._dirty.add(blockToChunkKey(...position));
      this._dirty.add(blockToChunkKey(...upper));
      this._nodeSimulation.enqueueNeighborhood([...position]);
      return true;
    }

    const placed = this.noa.addBlock(blockId, position) === blockId;
    if (placed) {
      this._dirty.add(blockToChunkKey(...position));
      this._nodeSimulation.enqueueNeighborhood([...position]);
      if (blockId === BLOCK_TORCH) this.registerTorch(position);
    }
    return placed;
  }

  breakTargetedBlock(): boolean {
    const playerPosition = this.noa.ents.getPosition(this.noa.playerEntity);
    const target = this.currentBlockTarget();
    if (!target || !isBlockWithinReach(playerPosition, target.position)) return false;

    const blockId = this.noa.getBlock(...target.position);
    this.noa.setBlock(BLOCK_AIR, target.position);
    if (blockId === BLOCK_TORCH) this.unregisterTorch(target.position);
    this._dirty.add(blockToChunkKey(...target.position));
    this._nodeSimulation.enqueueNeighborhood([...target.position]);
    if (DOOR_BLOCKS.has(blockId)) {
      for (const offset of [-1, 1]) {
        const counterpart: [number, number, number] = [target.position[0], target.position[1] + offset, target.position[2]];
        const counterpartId = this.noa.getBlock(...counterpart);
        if (!DOOR_BLOCKS.has(counterpartId)) continue;
        this.noa.setBlock(BLOCK_AIR, counterpart);
        this._dirty.add(blockToChunkKey(...counterpart));
        break;
      }
    }
    return true;
  }

  toggleTargetedDoor(): boolean {
    const hit = this.noa.pick(undefined, undefined, WALK_REACH_BLOCKS, (blockId) => blockId !== BLOCK_AIR);
    const target: { position: readonly [number, number, number] } | null = hit ? {
      position: [
        Math.floor(hit.position[0] - hit.normal[0]),
        Math.floor(hit.position[1] - hit.normal[1]),
        Math.floor(hit.position[2] - hit.normal[2]),
      ] as [number, number, number],
    } : this.currentBlockTarget();
    if (!target) return false;
    const currentId = this.noa.getBlock(target.position[0], target.position[1], target.position[2]);
    if (!DOOR_BLOCKS.has(currentId)) return false;
    const nextId = toggledDoorBlock(currentId);
    this.noa.setBlock(nextId, target.position);
    this._dirty.add(blockToChunkKey(target.position[0], target.position[1], target.position[2]));
    for (const offset of [-1, 1]) {
      const counterpart: [number, number, number] = [target.position[0], target.position[1] + offset, target.position[2]];
      const counterpartId = this.noa.getBlock(...counterpart);
      if (!DOOR_BLOCKS.has(counterpartId)) continue;
      this.noa.setBlock(toggledDoorBlock(counterpartId), counterpart);
      this._dirty.add(blockToChunkKey(...counterpart));
      break;
    }
    return true;
  }

  private currentBlockTarget() {
    const current = walkBlockTarget(this.noa.targetedBlock);
    if (current) return current;

    // Resolve a fresh pick at click/tap time so interaction doesn't depend on the
    // engine's once-per-frame targetedBlock cache.
    const hit = this.noa.pick();
    if (!hit) return null;
    const adjacent: [number, number, number] = [
      Math.floor(hit.position[0]),
      Math.floor(hit.position[1]),
      Math.floor(hit.position[2]),
    ];
    return {
      adjacent,
      position: [
        adjacent[0] - hit.normal[0],
        adjacent[1] - hit.normal[1],
        adjacent[2] - hit.normal[2],
      ] as [number, number, number],
    };
  }

  private torchKey(position: readonly number[]): string {
    return `${position[0]},${position[1]},${position[2]}`;
  }

  private registerTorch(position: readonly number[]): void {
    const stored: [number, number, number] = [position[0]!, position[1]!, position[2]!];
    this._torchPositions.set(this.torchKey(stored), stored);
    this._lastTorchLightSyncAt = 0;
  }

  private unregisterTorch(position: readonly number[]): void {
    const key = this.torchKey(position);
    this._torchPositions.delete(key);
    this._torchLights.get(key)?.dispose();
    this._torchLights.delete(key);
  }

  private syncTorchLights(now: number): void {
    if (now - this._lastTorchLightSyncAt < 250) return;
    this._lastTorchLightSyncAt = now;
    const player = this.noa.ents.getPosition(this.noa.playerEntity);
    const nearest = [...this._torchPositions.entries()]
      .map(([key, position]) => ({
        key,
        position,
        distanceSq: (position[0] - player[0]!) ** 2 + (position[1] - player[1]!) ** 2 + (position[2] - player[2]!) ** 2,
      }))
      .filter((entry) => entry.distanceSq <= 28 ** 2)
      .sort((a, b) => a.distanceSq - b.distanceSq)
      .slice(0, MAX_ACTIVE_TORCH_LIGHTS);
    const active = new Set(nearest.map((entry) => entry.key));

    for (const [key, light] of this._torchLights) {
      if (active.has(key)) continue;
      light.dispose();
      this._torchLights.delete(key);
    }
    for (const entry of nearest) {
      let light = this._torchLights.get(entry.key);
      if (!light) {
        light = new PointLight(`torch-light-${entry.key}`, Vector3.Zero(), this.noa.rendering.getScene());
        light.diffuse = new Color3(1, 0.58, 0.2);
        light.specular = new Color3(0.35, 0.18, 0.06);
        light.intensity = 1.55;
        light.range = 11;
        this._torchLights.set(entry.key, light);
      }
      const local = [0, 0, 0];
      this.noa.globalToLocal(
        [entry.position[0] + 0.5, entry.position[1] + 0.68, entry.position[2] + 0.5],
        null,
        local,
      );
      light.position.set(local[0]!, local[1]!, local[2]!);
    }
  }

  dispose(): WalkSceneResult {
    const result: VoxelChunkMap = {};
    const size = 32;

    for (const chunkKey of this._dirty) {
      const [cxS, cyS, czS] = chunkKey.split(',');
      const cx = Number(cxS), cy = Number(cyS), cz = Number(czS);
      const blocks: VoxelBlock[] = [];

      for (let i = 0; i < size; i++) {
        for (let k = 0; k < size; k++) {
          const localBx = cx * size + i;
          const localBz = cz * size + k;
          const bx = this._frame.originX + localBx;
          const bz = this._frame.originZ + localBz;
          const surface = this._terrain.sampleSurface(bx, bz);
          for (let j = 0; j < size; j++) {
            const by = cy * size + j;
            const id: number = this.noa.getBlock(localBx, by, localBz);
            if (id !== this._terrain.blockAt(bx, by, bz, surface)) {
              blocks.push({ bx, by, bz, blockId: id });
            }
          }
        }
      }

      result[localChunkToPlanetKey(this._frame, chunkKey)] = blocks;
    }

    const npcs = this._npcs.snapshot();
    const mobs = this._mobs.snapshot();
    this._npcs.dispose();
    this._mobs.dispose();
    this._traffic.dispose();
    for (const light of this._torchLights.values()) light.dispose();
    this._torchLights.clear();
    try { stopEngine(this.noa); } catch (_) { /* Best-effort cleanup around noa internals. */ }
    return { chunks: result, generatedChunks: [...this._generated], npcs, mobs };
  }
}
