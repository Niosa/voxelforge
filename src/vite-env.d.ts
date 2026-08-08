/// <reference types="vite/client" />

interface Window {
  __voxelforgeDescend?: (lon?: number, lat?: number) => void;
  __voxelforgeWalkTouchLook?: (dx: number, dy: number) => void;
  __voxelforgeWalkTouchMove?: (forward: number, side: number) => void;
  __voxelforgeWalkJump?: () => void;
  __voxelforgeWalkSprint?: (active: boolean) => void;
  __voxelforgeWalkPlace?: () => boolean | undefined;
  __voxelforgeWalkBreak?: () => boolean | undefined;
  __voxelforgeWalkInteract?: () => boolean | undefined;
}
