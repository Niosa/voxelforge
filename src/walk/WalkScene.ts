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
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Color4 } from '@babylonjs/core/Maths/math.color';

import type { TerraEntity, WalkAnchor, VoxelChunkMap, VoxelBlock, WorldMob, WorldNpc } from '@/entities/types';
import { BLOCKS, BLOCK_AIR, BLOCK_BY_ID, getBlockGroup } from './blockRegistry';
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
import {
  PersistentWalkNpcManager,
  type NpcConversationBubble,
  type NpcConversationChoice,
} from './PersistentWalkNpcManager';
import { WalkTrafficManager } from './WalkTrafficManager';
import { WalkNodeSimulation } from './WalkNodeSimulation';
import { PersistentWalkMobManager } from './PersistentWalkMobManager';
import { firstConnectedGamepad, nextGamepadSprintToggle, readWalkGamepad, type WalkGamepadState } from '@/input/walkGamepad';
import { soundEngine } from '@/audio/soundEngine';

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
    const texture = new Texture(textureUrl, scene, true, true, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHATEST;
    material.alphaCutOff = 0.25;
    material.diffuseColor = Color3.White();
    material.disableLighting = true;
    material.emissiveTexture = texture;
    material.emissiveColor = Color3.White();
    material.specularColor = Color3.Black();
  }

  // Canonical Minecraft X-Crossed Quad Plant Mesh (2 diagonal intersecting double-sided planes rotated 45deg and -45deg)
  const quad1 = MeshBuilder.CreatePlane(`${name}-q1`, { width: 0.92, height: 0.92, sideOrientation: Mesh.DOUBLESIDE }, scene);
  quad1.rotation.y = Math.PI / 4;
  quad1.position.y = 0.46;
  quad1.material = material;
  quad1.bakeCurrentTransformIntoVertices();

  const quad2 = MeshBuilder.CreatePlane(`${name}-q2`, { width: 0.92, height: 0.92, sideOrientation: Mesh.DOUBLESIDE }, scene);
  quad2.rotation.y = -Math.PI / 4;
  quad2.position.y = 0.46;
  quad2.material = material;
  quad2.bakeCurrentTransformIntoVertices();

  const merged = Mesh.MergeMeshes([quad1, quad2], true, true, undefined, false, true);
  if (!merged) throw new Error(`Unable to create ${name} plant mesh`);
  merged.position.setAll(0);
  merged.material = material;
  return merged;
}



function createTorchMesh(noa: Engine, face: 'up' | 'north' | 'south' | 'east' | 'west' = 'up'): Mesh {
  const scene = noa.rendering.getScene();
  const material = new StandardMaterial(`torch-material-${face}`, scene);
  const texture = new Texture('/textures/blocks/torch_on.png', scene, false, true, Texture.NEAREST_SAMPLINGMODE);
  texture.hasAlpha = true;
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.1;
  material.backFaceCulling = true;
  material.emissiveColor = new Color3(0.72, 0.42, 0.12);
  material.disableLighting = false;

  const torchUv = new Vector4(6 / 16, 0, 10 / 16, 1);
  const faceUV = Array.from({ length: 6 }, () => torchUv.clone());
  const torch = MeshBuilder.CreateBox(`torch-model-${face}`, {
    width: 0.16,
    height: 0.625,
    depth: 0.16,
    faceUV,
  }, scene);

  // Position and rotate the torch mesh based on the face it's mounted to
  torch.position.y = 0.3125; // Default center (bottom of mesh at y=0)
  
  if (face !== 'up') {
    const angle = Math.PI / 4; // 45 degrees
    const offset = 0.35; // How far out from the wall center
    const heightOffset = 0.15; // Raised slightly on the wall

    torch.position.y += heightOffset;
    if (face === 'north') {
      torch.rotation.x = angle;
      torch.position.z = offset;
    } else if (face === 'south') {
      torch.rotation.x = -angle;
      torch.position.z = -offset;
    } else if (face === 'east') {
      torch.rotation.z = angle;
      torch.position.x = offset;
    } else if (face === 'west') {
      torch.rotation.z = -angle;
      torch.position.x = -offset;
    }
  }

  torch.material = material;
  torch.bakeCurrentTransformIntoVertices();
  torch.position.setAll(0);
  return torch;
}

function createDoorMesh(noa: Engine, name: string, textureUrl: string, open: boolean): Mesh {
  const scene = noa.rendering.getScene();
  const material = new StandardMaterial(`${name}-material`, scene);
  const texture = new Texture(textureUrl, scene, false, true, Texture.NEAREST_SAMPLINGMODE);
  texture.hasAlpha = true;
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.18;
  material.backFaceCulling = false;
  material.diffuseColor = Color3.White();
  // Object-meshed blocks do not receive the same voxel-face lighting as the
  // terrain mesh. Keeping the albedo emissive preserves the authored door
  // colours on both sides instead of producing black, back-lit panels.
  material.disableLighting = true;
  material.emissiveTexture = texture;
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();

  const door = MeshBuilder.CreateBox(name, {
    width: 0.92,
    height: 1,
    depth: 0.08,
  }, scene);
  door.position.y = 0.5;
  // Generated entrances live on the minimum-Z (front) wall. NOA centers custom
  // meshes at z + 0.5 by default, so bake the panel back onto that wall face.
  door.position.z = -0.44;
  if (open) {
    // NOA centers block meshes inside their voxel. Rotate in place so both
    // door states remain attached to the generated doorway.
    door.rotation.y = Math.PI / 2;
    door.position.x = -0.42;
  }
  door.material = material;
  door.bakeCurrentTransformIntoVertices();
  door.position.setAll(0);
  return door;
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
  onCreativeFlightChanged?: (active: boolean) => void;
  onInventoryToggle?: () => void;
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
  private _lastAgentUpdateAt = performance.now();
  private _lastTrafficUpdateAt = performance.now();
  private readonly _agentUpdateIntervalMs: number;
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
  private _gamepadHadMovement = false;
  private _gamepadMoveScale = 0;
  private _gamepadSprinting = false;
  private _gamepadSprintToggled = false;
  private _gamepadJumpHeld = false;
  private _gamepadDescendHeld = false;
  private _previousGamepadState: WalkGamepadState | null = null;
  private _gamepadLookX = 0;
  private _gamepadLookY = 0;
  private _smoothedGamepadLookX = 0;
  private _smoothedGamepadLookY = 0;
  private _inventoryOpen = false;
  private _wasGrounded = true;
  private _wasJumpPressed = false;
  private _lastFootstepAt = 0;
  private readonly _chunkQueue: Array<{
    id: string;
    data: VoxelNdarray;
    x: number;
    y: number;
    z: number;
  }> = [];
  private _chunkProcessingScheduled = false;

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
    this._agentUpdateIntervalMs = useUiStore.getState().performanceMode ? 150 : 75;
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
      // NOA auto-step repeats collision sweeps whenever a grounded player moves
      // into dense geometry. City streets made that retry visible as stutter;
      // Minecraft-style one-block traversal already has an explicit jump.
      playerAutoStep: false,
      // The planet frame already keeps coordinates local. NOA's default
      // 25-block origin rebase made terrain meshes and custom thin instances
      // diverge during vertical flight, so defer rebasing far beyond a walk site.
      originRebaseDistance: 32_768,
      blockTestDistance: WALK_REACH_BLOCKS,
      sensitivityX: 7.5,
      sensitivityY: 7.5,
      sensitivityMultOutsidePointerlock: 0,
      dragCameraOutsidePointerLock: false,
      preventDefaults: true,
      ambientColor: [0.76, 0.79, 0.84],
      lightDiffuse: [0.82, 0.84, 0.88],
      lightSpecular: [0.12, 0.12, 0.14],
      lightVector: [0.55, -1, 0.35],
      AOmultipliers: [0.98, 0.92, 0.78],
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
    const fillLight = new HemisphericLight('walk-soft-fill', new Vector3(0, 1, 0), noa.rendering.getScene());
    fillLight.diffuse = new Color3(0.72, 0.79, 0.9);
    fillLight.groundColor = new Color3(0.32, 0.28, 0.24);
    fillLight.specular = Color3.Black();
    fillLight.intensity = 0.52;
    noa.container.canvas.tabIndex = 0;
    const playerMovement = noa.ents.getMovement(noa.playerEntity);
    // Minecraft's normal walk is roughly 4.3 blocks/second. NOA defaults to
    // 10, which made traversal feel like a permanent sprint.
    playerMovement.maxSpeed = 4.3;
    playerMovement.moveForce = 24;
    playerMovement.responsiveness = 12;
    // A fixed ~7.1 m/s launch under 20 m/s² gravity peaks at roughly 1.25
    // blocks, matching Minecraft's standing jump without variable-height boost.
    playerMovement.jumpImpulse = 7.1;
    playerMovement.jumpForce = 0;
    playerMovement.jumpTime = 0;
    playerMovement.airJumps = 0;
    const plantMeshes = new Map<number, Mesh>([
      [25, createPlantMesh(noa, 'tall-grass', '#65a30d', '/textures/blocks/azalea_leaves.png')],
      [26, createPlantMesh(noa, 'rose', '#ef4444', '/textures/blocks/flower_rose.png')],
      [63, createPlantMesh(noa, 'dandelion', '#facc15', '/textures/blocks/flower_rose.png')],
      [64, createPlantMesh(noa, 'blue_orchid', '#38bdf8', '/textures/blocks/flower_rose.png')],
      [65, createPlantMesh(noa, 'allium', '#e879f9', '/textures/blocks/flower_rose.png')],
      [66, createPlantMesh(noa, 'mushroom_red', '#ef4444', '/textures/blocks/flower_rose.png')],
      [67, createPlantMesh(noa, 'mushroom_brown', '#a16207', '/textures/blocks/flower_rose.png')],
      [68, createPlantMesh(noa, 'fern', '#15803d', '/textures/blocks/azalea_leaves.png')],
      [70, createPlantMesh(noa, 'reeds', '#84cc16', '/textures/blocks/azalea_leaves.png')],
      [71, createPlantMesh(noa, 'dead_bush', '#a16207', '/textures/blocks/azalea_leaves.png')],
      [72, createPlantMesh(noa, 'seagrass', '#065f46', '/textures/blocks/azalea_leaves.png')],
      [73, createPlantMesh(noa, 'sunflower', '#eab308', '/textures/blocks/flower_rose.png')],
      [BLOCK_TORCH, createTorchMesh(noa, 'up')],
      [88, createTorchMesh(noa, 'north')],
      [89, createTorchMesh(noa, 'south')],
      [90, createTorchMesh(noa, 'east')],
      [91, createTorchMesh(noa, 'west')],
    ]);
    const doorMeshes = new Map<number, Mesh>([
      [BLOCK_DOOR_CLOSED, createDoorMesh(noa, 'door-closed-lower', '/textures/blocks/door_wood_lower.png', false)],
      [BLOCK_DOOR_OPEN, createDoorMesh(noa, 'door-open-lower', '/textures/blocks/door_wood_lower.png', true)],
      [BLOCK_DOOR_CLOSED_UPPER, createDoorMesh(noa, 'door-closed-upper', '/textures/blocks/door_wood_upper.png', false)],
      [BLOCK_DOOR_OPEN_UPPER, createDoorMesh(noa, 'door-open-upper', '/textures/blocks/door_wood_upper.png', true)],
    ]);
    for (const block of BLOCKS) {
      if (block.id === BLOCK_AIR) continue;
      const doorMesh = doorMeshes.get(block.id);
      if (doorMesh) {
        noa.registry.registerBlock(block.id, {
          blockMesh: doorMesh,
          solid: block.solid,
          opaque: false,
        });
        continue;
      }
      const plantMesh = plantMeshes.get(block.id);
      if (plantMesh) {
        noa.registry.registerBlock(block.id, { blockMesh: plantMesh, solid: false, opaque: false });
        continue;
      }
      const isAlpha = block.name === 'glass'
        || block.name.includes('water')
        || block.name === 'ice'
        || block.name === 'wildflower'
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
    const legacyBlocksByChunk = new Map<string, VoxelBlock[]>();
    for (const block of legacyBlocks) {
      const localX = block.bx - frame.originX;
      const localZ = block.bz - frame.originZ;
      const key = blockToChunkKey(localX, block.by, localZ);
      const indexed = legacyBlocksByChunk.get(key) ?? [];
      indexed.push(block);
      legacyBlocksByChunk.set(key, indexed);
    }

    noa.world.on('worldDataNeeded', (
      id: string,
      data: VoxelNdarray,
      x: number,
      y: number,
      z: number,
    ) => {
      scene.enqueueChunk(id, data, x, y, z, opts, frame, terrain, legacyBlocksByChunk);
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
      const now = performance.now();
      scene.updateGamepad(opts.onNpcConversation, opts.onCreativeFlightChanged, opts.onInventoryToggle);
      scene.updateSwimming();
      if (now - scene._lastAgentUpdateAt >= scene._agentUpdateIntervalMs) {
        scene._npcs.update(now);
        scene._mobs.update(now);
        scene._lastAgentUpdateAt = now;
      }
      scene._traffic.update((now - scene._lastTrafficUpdateAt) / 1_000);
      scene._lastTrafficUpdateAt = now;
      if (now - scene._lastNodeStepAt >= (compactChunkRadius ? 120 : 80)) {
        scene._nodeSimulation.step();
        scene._lastNodeStepAt = now;
      }
      scene.updatePlayerSpeed();
      scene.updateCreativeFlight();
      scene.syncTorchLights(now);
      scene.updateViewBobbing();
      scene.updateMovementSounds(now);
    });
    noa.on('beforeRender', (dt: number) => scene.updateGamepadLook(dt));

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

  private updateGamepad(
    onNpcConversation?: (conversation: NpcConversationBubble) => void,
    onCreativeFlightChanged?: (active: boolean) => void,
    onInventoryToggle?: () => void,
  ): void {
    const gamepads = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    const gamepad = firstConnectedGamepad(gamepads);
    if (!gamepad) {
      if (this._gamepadHadMovement) this.applyTouchMovement(0, 0);
      this._gamepadHadMovement = false;
      this._gamepadMoveScale = 0;
      this._gamepadSprinting = false;
      this._gamepadSprintToggled = false;
      this._gamepadJumpHeld = false;
      this._gamepadDescendHeld = false;
      this._previousGamepadState = null;
      this._gamepadLookX = 0;
      this._gamepadLookY = 0;
      return;
    }

    const state = readWalkGamepad(gamepad);
    const previous = this._previousGamepadState;
    if (state.toggleInventory && !previous?.toggleInventory) onInventoryToggle?.();
    if (this._inventoryOpen) {
      if (this._gamepadHadMovement) this.applyTouchMovement(0, 0);
      this._gamepadHadMovement = false;
      this._gamepadLookX = 0;
      this._gamepadLookY = 0;
      this._previousGamepadState = state;
      return;
    }
    const hasMovement = Math.abs(state.forward) > 0.05 || Math.abs(state.side) > 0.05;
    if (hasMovement || this._gamepadHadMovement) {
      this.applyTouchMovement(state.forward, state.side);
    }
    this._gamepadHadMovement = hasMovement;
    this._gamepadMoveScale = hasMovement ? Math.min(1, Math.hypot(state.forward, state.side)) : 0;
    this._gamepadSprintToggled = nextGamepadSprintToggle(
      this._gamepadSprintToggled,
      state.sprint,
      previous?.sprint ?? false,
    );
    this._gamepadSprinting = this._gamepadSprintToggled && hasMovement;
    this._gamepadJumpHeld = state.jump;
    this._gamepadDescendHeld = state.descend;

    this._gamepadLookX = state.lookX;
    this._gamepadLookY = state.lookY;
    if (state.jump && !previous?.jump && !this._creativeFlying) this.jump();
    if (state.breakBlock && !previous?.breakBlock) this.breakTargetedBlock();
    if (state.useOrPlace && !previous?.useOrPlace) {
      if (!this.toggleTargetedDoor()) {
        const conversation = this.interactWithTargetedNpc();
        if (conversation) onNpcConversation?.(conversation);
        else this.placeSelectedBlock();
      }
    }
    if (state.toggleFlight && !previous?.toggleFlight) {
      onCreativeFlightChanged?.(this.toggleCreativeFlight());
    }
    if (state.previousSlot && !previous?.previousSlot) {
      useWalkStore.getState().cycleHotbar(-1);
    }
    if (state.nextSlot && !previous?.nextSlot) {
      useWalkStore.getState().cycleHotbar(1);
    }
    this._previousGamepadState = state;
  }

  private updateGamepadLook(dtMs: number): void {
    const dtSeconds = Math.min(0.05, Math.max(0, dtMs) / 1_000);
    const smoothing = 1 - Math.exp(-dtSeconds * 20);
    this._smoothedGamepadLookX += (this._gamepadLookX - this._smoothedGamepadLookX) * smoothing;
    this._smoothedGamepadLookY += (this._gamepadLookY - this._smoothedGamepadLookY) * smoothing;
    if (Math.abs(this._smoothedGamepadLookX) < 0.0001 && Math.abs(this._smoothedGamepadLookY) < 0.0001) return;
    const radiansPerPixel = 0.003;
    const yawSpeed = 3.4;
    const pitchSpeed = 2.8;
    this.applyTouchLookDelta(
      this._smoothedGamepadLookX * yawSpeed * dtSeconds / radiansPerPixel,
      this._smoothedGamepadLookY * pitchSpeed * dtSeconds / radiansPerPixel,
    );
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

  setInventoryOpen(active: boolean): void {
    this._inventoryOpen = active;
    if (active) {
      this.applyTouchMovement(0, 0);
      this._gamepadLookX = 0;
      this._gamepadLookY = 0;
    }
  }

  releasePointerLock(): void {
    this.noa.container.setPointerLock(false);
  }

  focusControls(): void {
    this.noa.container.canvas.focus({ preventScroll: true });
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

    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting || this._gamepadSprinting;
    const vertical = (this.noa.inputs.state['jump'] || this._gamepadJumpHeld ? 1 : 0)
      - (this.noa.inputs.state['fly-down'] || this._gamepadDescendHeld ? 1 : 0);
    body.velocity[1] = vertical * (sprinting ? 10 : 6.5);
  }

  private updatePlayerSpeed(): void {
    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting || this._gamepadSprinting;
    const movement = this.noa.ents.getMovement(this.noa.playerEntity);
    const analogScale = this._gamepadMoveScale > 0 ? Math.max(0.35, this._gamepadMoveScale) : 1;
    movement.maxSpeed = (this._creativeFlying ? (sprinting ? 14 : 8) : (sprinting ? 8.4 : 4.3)) * analogScale;
    movement.moveForce = this._creativeFlying ? 44 : (sprinting ? 38 : 24);
  }

  private updateViewBobbing(): void {
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    const follow = (this.noa.ents as unknown as {
      getState: (id: number, component: string) => { offset?: number[] } | undefined;
    }).getState(this.noa.camera.cameraTarget, 'followsEntity');
    if (!body || !follow?.offset) return;
    const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2]);
    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting || this._keyboardSprinting || this._gamepadSprinting;
    const grounded = !body.inFluid && body.resting[1] < 0;
    if (grounded && horizontalSpeed >= 0.15) {
      this._bobPhase += Math.min(0.42, horizontalSpeed * (sprinting ? 0.085 : 0.07));
    } else {
      this._bobPhase *= 0.72;
    }
    const target = this._cameraBaseOffsetY + viewBobOffset(this._bobPhase, horizontalSpeed, sprinting, grounded);
    follow.offset[1] += (target - follow.offset[1]) * 0.32;
  }

  private updateMovementSounds(now: number): void {
    const body = this.noa.ents.getPhysicsBody(this.noa.playerEntity);
    if (!body) return;
    const grounded = !body.inFluid && body.resting[1] < 0;
    const jumpPressed = Boolean(this.noa.inputs.state['jump']) || this._gamepadJumpHeld;
    if (jumpPressed && !this._wasJumpPressed && !body.inFluid && (grounded || body.velocity[1] > 0)) {
      soundEngine.playJump();
    }
    if (grounded && !this._wasGrounded) soundEngine.playLand();

    const horizontalSpeed = Math.hypot(body.velocity[0], body.velocity[2]);
    const sprinting = Boolean(this.noa.inputs.state['sprint']) || this._touchSprinting
      || this._keyboardSprinting || this._gamepadSprinting;
    const stepInterval = sprinting ? 230 : 360;
    if (grounded && horizontalSpeed > 0.7 && now - this._lastFootstepAt >= stepInterval) {
      const position = this.noa.ents.getPosition(this.noa.playerEntity);
      const below = this.noa.getBlock(
        Math.floor(position[0]!),
        Math.floor(position[1]! - 0.08),
        Math.floor(position[2]!),
      );
      soundEngine.playFootstep(BLOCK_BY_ID.get(below)?.name ?? 'grass');
      this._lastFootstepAt = now;
    }
    this._wasGrounded = grounded;
    this._wasJumpPressed = jumpPressed;
  }

  getNpcCount(): number {
    return this._npcs.count;
  }

  interactWithNearestNpc(): NpcConversationBubble | null {
    const conversation = this._npcs.interact(this.noa.ents.getPosition(this.noa.playerEntity));
    if (conversation) soundEngine.playNpcTalk();
    return conversation;
  }

  interactWithTargetedNpc(): NpcConversationBubble | null {
    const conversation = this._npcs.interactTargeted();
    if (conversation) soundEngine.playNpcTalk();
    return conversation;
  }

  continueNpcConversation(npcId: string): NpcConversationBubble | null {
    const conversation = this._npcs.continueConversation(npcId);
    if (conversation) soundEngine.playNpcTalk();
    return conversation;
  }

  respondToNpc(npcId: string, choice: NpcConversationChoice['id']): NpcConversationBubble | null {
    const conversation = this._npcs.respond(npcId, choice);
    if (conversation) soundEngine.playNpcTalk();
    return conversation;
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
    let blockId = useWalkStore.getState().selectedBlockId;
    if (blockId === BLOCK_AIR || !BLOCKS.some((block) => block.id === blockId && block.placeable !== false)) return false;

    const playerPosition = this.noa.ents.getPosition(this.noa.playerEntity);
    const target = this.currentBlockTarget();
    const position = placementPosition(target, playerPosition);
    if (!position) return false;

    if (blockId === BLOCK_TORCH) {
      if (target?.normal) {
        if (target.normal[1] === -1) return false; // Cannot place on ceiling
        const supportId = this.noa.getBlock(target.position[0], target.position[1], target.position[2]);
        if (!BLOCK_BY_ID.get(supportId)?.solid) return false; // Must attach to solid block
        
        if (target.normal[0] === 1) blockId = 91; // torch_west (placed on east face)
        else if (target.normal[0] === -1) blockId = 90; // torch_east (placed on west face)
        else if (target.normal[2] === 1) blockId = 89; // torch_south (placed on north face)
        else if (target.normal[2] === -1) blockId = 88; // torch_north (placed on south face)
      }
    }

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
      soundEngine.playBlockPlace('door');
      return true;
    }

    const placed = this.noa.addBlock(blockId, position) === blockId;
    if (placed) {
      this._dirty.add(blockToChunkKey(...position));
      this._nodeSimulation.enqueueNeighborhood([...position]);
      if (blockId === 21 || (blockId >= 88 && blockId <= 91)) this.registerTorch(position);
      soundEngine.playBlockPlace(BLOCK_BY_ID.get(blockId)?.name ?? 'block');
    }
    return placed;
  }

  breakTargetedBlock(): boolean {
    const playerPosition = this.noa.ents.getPosition(this.noa.playerEntity);
    const target = this.currentBlockTarget();
    if (!target || !isBlockWithinReach(playerPosition, target.position)) return false;

    const blockId = this.noa.getBlock(...target.position);
    this.noa.setBlock(BLOCK_AIR, target.position);
    soundEngine.playBlockBreak(BLOCK_BY_ID.get(blockId)?.name ?? 'stone');
    if (blockId === 21 || (blockId >= 88 && blockId <= 91)) this.unregisterTorch(target.position);
    this._dirty.add(blockToChunkKey(...target.position));
    this._nodeSimulation.enqueueNeighborhood([...target.position]);
    
    // Pop off any torches that were attached to this block
    const tx = target.position[0], ty = target.position[1], tz = target.position[2];
    const checkTorch = (dx: number, dy: number, dz: number, requiredId: number) => {
      const p: [number, number, number] = [tx + dx, ty + dy, tz + dz];
      if (this.noa.getBlock(...p) === requiredId) {
        this.noa.setBlock(BLOCK_AIR, p);
        this.unregisterTorch(p);
        this._dirty.add(blockToChunkKey(...p));
      }
    };
    checkTorch(0, 1, 0, 21); // Floor torch above
    checkTorch(0, 0, 1, 89); // torch_south (placed on north face, so it's at z+1)
    checkTorch(0, 0, -1, 88); // torch_north (placed on south face, so it's at z-1)
    checkTorch(1, 0, 0, 91); // torch_west (placed on east face, so it's at x+1)
    checkTorch(-1, 0, 0, 90); // torch_east (placed on west face, so it's at x-1)

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
    const opening = currentId === BLOCK_DOOR_CLOSED || currentId === BLOCK_DOOR_CLOSED_UPPER;
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
    soundEngine.playDoorToggle(opening);
    return true;
  }

  private currentBlockTarget() {
    // NOA's default pick predicate only selects solid blocks, which makes
    // non-colliding leaves, grass, flowers, and torches impossible to mine.
    // Resolve a fresh click-time pick that includes nodes but skips fluids.
    const hit = this.noa.pick(undefined, undefined, WALK_REACH_BLOCKS, (blockId) => (
      blockId !== BLOCK_AIR && getBlockGroup(blockId, 'liquid') === 0
    ));
    if (!hit) {
      const current = walkBlockTarget(this.noa.targetedBlock);
      return current;
    }
    const adjacent: [number, number, number] = [
      Math.floor(hit.position[0]),
      Math.floor(hit.position[1]),
      Math.floor(hit.position[2]),
    ];
    return {
      adjacent,
      normal: hit.normal,
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
    this._torchFX.get(key)?.light.dispose();
    this._torchFX.get(key)?.flame.dispose();
    this._torchFX.get(key)?.smoke.dispose();
    this._torchFX.delete(key);
  }

  private readonly _torchFX = new Map<string, { light: PointLight, flame: ParticleSystem, smoke: ParticleSystem }>();
  private _lastTorchLightSyncAt = 0;

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
      .slice(0, useUiStore.getState().performanceMode ? 8 : MAX_ACTIVE_TORCH_LIGHTS);
    const active = new Set(nearest.map((entry) => entry.key));

    for (const [key, fx] of this._torchFX) {
      if (active.has(key)) continue;
      fx.light.dispose();
      fx.flame.dispose();
      fx.smoke.dispose();
      this._torchFX.delete(key);
    }
    const scene = this.noa.rendering.getScene();
    for (const entry of nearest) {
      let fx = this._torchFX.get(entry.key);
      if (!fx) {
        const light = new PointLight(`torch-light-${entry.key}`, Vector3.Zero(), scene);
        light.diffuse = new Color3(1, 0.58, 0.2);
        light.specular = new Color3(0.35, 0.18, 0.06);
        light.intensity = 1.55;
        light.range = 11;
        
        const flame = new ParticleSystem(`torch-flame-${entry.key}`, 10, scene);
        flame.particleTexture = new Texture('/textures/blocks/torch_on.png', scene); // Simple texture reuse
        flame.minSize = 0.03;
        flame.maxSize = 0.05;
        flame.minLifeTime = 0.1;
        flame.maxLifeTime = 0.3;
        flame.minEmitPower = 0.2;
        flame.maxEmitPower = 0.4;
        flame.direction1 = new Vector3(-0.1, 1, -0.1);
        flame.direction2 = new Vector3(0.1, 1, 0.1);
        flame.color1 = new Color4(1, 0.8, 0.2, 1);
        flame.color2 = new Color4(1, 0.4, 0.0, 1);
        flame.colorDead = new Color4(1, 0.2, 0.0, 0);
        flame.emitRate = 12;
        flame.start();

        const smoke = new ParticleSystem(`torch-smoke-${entry.key}`, 10, scene);
        smoke.particleTexture = new Texture('/textures/blocks/torch_on.png', scene);
        smoke.minSize = 0.04;
        smoke.maxSize = 0.08;
        smoke.minLifeTime = 0.3;
        smoke.maxLifeTime = 0.8;
        smoke.minEmitPower = 0.1;
        smoke.maxEmitPower = 0.3;
        smoke.direction1 = new Vector3(-0.2, 1, -0.2);
        smoke.direction2 = new Vector3(0.2, 1, 0.2);
        smoke.color1 = new Color4(0.2, 0.2, 0.2, 0.8);
        smoke.color2 = new Color4(0.1, 0.1, 0.1, 0.4);
        smoke.colorDead = new Color4(0, 0, 0, 0);
        smoke.emitRate = 8;
        smoke.start();

        fx = { light, flame, smoke };
        this._torchFX.set(entry.key, fx);
      }
      
      const blockId = this.noa.getBlock(entry.position[0], entry.position[1], entry.position[2]);
      let lx = 0.5, ly = 0.68, lz = 0.5;
      if (blockId === 88) { lz = 0.85; ly = 0.85; } // north torch (wall at negative Z, leans positive Z)
      else if (blockId === 89) { lz = 0.15; ly = 0.85; } // south torch (wall at positive Z, leans negative Z)
      else if (blockId === 90) { lx = 0.15; ly = 0.85; } // east torch (wall at positive X, leans negative X)
      else if (blockId === 91) { lx = 0.85; ly = 0.85; } // west torch (wall at negative X, leans positive X)

      const local = [0, 0, 0];
      this.noa.globalToLocal(
        [entry.position[0] + lx, entry.position[1] + ly, entry.position[2] + lz],
        null,
        local,
      );
      const pos = new Vector3(local[0]!, local[1]!, local[2]!);
      fx.light.position = pos;
      fx.flame.emitter = pos;
      fx.smoke.emitter = pos;
    }
  }

  private restoreSavedChunkBlocks(
    localChunkKey: string,
    data: VoxelNdarray,
    frame: PlanetLocalFrame,
    x: number,
    y: number,
    z: number,
    size: number,
    legacyBlocksByChunk: Map<string, VoxelBlock[]>,
    savedChunks?: VoxelChunkMap,
  ): void {
    if (!savedChunks) return;
    const saved = savedChunks[localChunkToPlanetKey(frame, localChunkKey)] ?? [];
    const blocksToRestore = legacyBlocksByChunk.has(localChunkKey)
      ? saved.concat(legacyBlocksByChunk.get(localChunkKey)!)
      : saved;
    for (const blk of blocksToRestore) {
      const lx = blk.bx - (frame.originX + x);
      const ly = blk.by - y;
      const lz = blk.bz - (frame.originZ + z);
      if (lx >= 0 && lx < size && ly >= 0 && ly < size && lz >= 0 && lz < size) {
        data.set(lx, ly, lz, blk.blockId);
        if (getBlockGroup(blk.blockId, 'liquid') > 0) {
          this._nodeSimulation.enqueue([blk.bx - frame.originX, blk.by, blk.bz - frame.originZ]);
        }
        if (blk.blockId === 21 || (blk.blockId >= 88 && blk.blockId <= 91)) {
          this.registerTorch([blk.bx - frame.originX, blk.by, blk.bz - frame.originZ]);
        }
      }
    }
  }

  enqueueChunk(
    id: string,
    data: VoxelNdarray,
    x: number,
    y: number,
    z: number,
    opts: WalkSceneOptions,
    frame: PlanetLocalFrame,
    terrain: PlanetTerrainSampler,
    legacyBlocksByChunk: Map<string, VoxelBlock[]>,
  ): void {
    const size = 32;
    const localChunkKey = `${Math.floor(x / size)},${Math.floor(y / size)},${Math.floor(z / size)}`;
    this._generated.add(localChunkToPlanetKey(frame, localChunkKey));

    const [minE, maxE] = terrain.fastElevationRange(frame.originX + x, frame.originZ + z, size);

    if (y > maxE || y > MAX_NATURAL_TERRAIN_Y) {
      this.noa.world.setChunkData(id, data);
      return;
    }

    if (y + size < minE && y > -20) {
      for (let i = 0; i < size; i++) {
        for (let k = 0; k < size; k++) {
          for (let j = 0; j < size; j++) {
            data.set(i, j, k, 1);
          }
        }
      }
      this.restoreSavedChunkBlocks(localChunkKey, data, frame, x, y, z, size, legacyBlocksByChunk, opts.savedChunks);
      this.noa.world.setChunkData(id, data);
      return;
    }

    this._chunkQueue.push({ id, data, x, y, z });
    this.scheduleChunkProcessing(opts, frame, terrain, legacyBlocksByChunk);
  }

  private scheduleChunkProcessing(
    opts: WalkSceneOptions,
    frame: PlanetLocalFrame,
    terrain: PlanetTerrainSampler,
    legacyBlocksByChunk: Map<string, VoxelBlock[]>,
  ): void {
    if (this._chunkProcessingScheduled) return;
    this._chunkProcessingScheduled = true;
    setTimeout(() => {
      this._chunkProcessingScheduled = false;
      this.processChunkQueue(opts, frame, terrain, legacyBlocksByChunk);
    }, 0);
  }

  private processChunkQueue(
    opts: WalkSceneOptions,
    frame: PlanetLocalFrame,
    terrain: PlanetTerrainSampler,
    legacyBlocksByChunk: Map<string, VoxelBlock[]>,
  ): void {
    if (this._chunkQueue.length === 0) return;

    const playerPos = (this.noa.ents.getPosition(this.noa.playerEntity) as number[]) ?? [0, 0, 0];
    const px = playerPos[0] ?? 0;
    const py = playerPos[1] ?? 0;
    const pz = playerPos[2] ?? 0;

    this._chunkQueue.sort((a, b) => {
      const dA = (a.x + 16 - px) ** 2 + (a.y + 16 - py) ** 2 + (a.z + 16 - pz) ** 2;
      const dB = (b.x + 16 - px) ** 2 + (b.y + 16 - py) ** 2 + (b.z + 16 - pz) ** 2;
      return dA - dB;
    });

    const startTime = performance.now();
    const TIME_BUDGET_MS = 6;

    while (this._chunkQueue.length > 0) {
      const chunk = this._chunkQueue.shift()!;
      const { id, data, x, y, z } = chunk;
      const size = 32;
      const localChunkKey = `${Math.floor(x / size)},${Math.floor(y / size)},${Math.floor(z / size)}`;

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

      this.restoreSavedChunkBlocks(localChunkKey, data, frame, x, y, z, size, legacyBlocksByChunk, opts.savedChunks);
      this.noa.world.setChunkData(id, data);

      if (performance.now() - startTime >= TIME_BUDGET_MS) {
        break;
      }
    }

    if (this._chunkQueue.length > 0) {
      this.scheduleChunkProcessing(opts, frame, terrain, legacyBlocksByChunk);
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
