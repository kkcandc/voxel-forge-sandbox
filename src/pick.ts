import * as THREE from "three";
import type { VoxelWorld } from "./world";
import { Block } from "./blocks";

export type Hit = {
  x: number;
  y: number;
  z: number;
  id: number;
  px: number;
  py: number;
  pz: number;
};

export function raycast(world: VoxelWorld, origin: THREE.Vector3, dir: THREE.Vector3, max = 6.5): Hit | null {
  const d = dir.clone().normalize();
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = d.x >= 0 ? 1 : -1;
  const stepY = d.y >= 0 ? 1 : -1;
  const stepZ = d.z >= 0 ? 1 : -1;
  const tDeltaX = d.x === 0 ? Infinity : Math.abs(1 / d.x);
  const tDeltaY = d.y === 0 ? Infinity : Math.abs(1 / d.y);
  const tDeltaZ = d.z === 0 ? Infinity : Math.abs(1 / d.z);
  let tMaxX = d.x === 0 ? Infinity : (d.x > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX;
  let tMaxY = d.y === 0 ? Infinity : (d.y > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY;
  let tMaxZ = d.z === 0 ? Infinity : (d.z > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ;
  let faceX = 0;
  let faceY = 0;
  let faceZ = 0;

  for (let i = 0; i < 48; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== Block.Air) {
      return { x, y, z, id, px: x - faceX, py: y - faceY, pz: z - faceZ };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > max) return null;
      x += stepX;
      tMaxX += tDeltaX;
      faceX = stepX;
      faceY = 0;
      faceZ = 0;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > max) return null;
      y += stepY;
      tMaxY += tDeltaY;
      faceX = 0;
      faceY = stepY;
      faceZ = 0;
    } else {
      if (tMaxZ > max) return null;
      z += stepZ;
      tMaxZ += tDeltaZ;
      faceX = 0;
      faceY = 0;
      faceZ = stepZ;
    }
  }
  return null;
}
