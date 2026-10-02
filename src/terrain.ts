import { HEIGHT, SEA } from "./constants";
import { Block, type BlockId } from "./blocks";
import { clamp, fbm2, fbm3, hash2, hash3, lerp, smoothstep } from "./noise";

export const Biome = {
  Ocean: 0,
  Beach: 1,
  Meadow: 2,
  Grove: 3,
  Highlands: 4,
  Dunes: 5,
} as const;

export type BiomeId = (typeof Biome)[keyof typeof Biome];

export const BIOME_NAME = ["Sea", "Shore", "Meadow", "Grove", "Highlands", "Dunes"];

export type TerrainSample = {
  h: number;
  biome: BiomeId;
  moist: number;
};

const cache = new Map<string, TerrainSample>();

export function clearTerrainCache(): void {
  cache.clear();
}

export function sampleTerrain(x: number, z: number, seed: number): TerrainSample {
  const key = x + "," + z;
  const hit = cache.get(key);
  if (hit) return hit;

  const warpX = fbm2(x * 0.0032, z * 0.0032, seed + 11, 3) - 0.5;
  const warpZ = fbm2(x * 0.0032 + 19, z * 0.0032, seed + 29, 3) - 0.5;
  const px = x * 0.00155 + warpX * 34;
  const pz = z * 0.00155 + warpZ * 34;

  const cont = fbm2(px, pz, seed, 5);
  const hill = fbm2(x * 0.0075 + 4, z * 0.0075, seed + 5, 4);
  const detail = fbm2(x * 0.028, z * 0.028, seed + 8, 3);
  const ridgeNoise = fbm2(x * 0.0042 + 90, z * 0.0042, seed + 17, 4);
  const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
  const mount = smoothstep(0.56, 0.8, fbm2(x * 0.0021 + 40, z * 0.0021 - 12, seed + 3, 3));
  const temp = fbm2(x * 0.0018 + 220, z * 0.0018, seed + 70, 3);
  const moist = fbm2(x * 0.0018, z * 0.0018 + 180, seed + 90, 3);

  const land = smoothstep(0.4, 0.52, cont);
  const oceanFloor = SEA - 12 + cont * 16;
  const landH =
    SEA +
    (hill - 0.42) * 18 +
    (detail - 0.5) * 3.2 +
    ridge * ridge * mount * 38;
  let h = Math.round(lerp(oceanFloor, landH, land));
  h = clamp(h, 2, HEIGHT - 18);

  let biome: BiomeId = Biome.Meadow;
  if (h < SEA - 1) biome = Biome.Ocean;
  else if (h <= SEA + 1) biome = Biome.Beach;
  else if (h > 82 || (mount > 0.62 && h > 70)) biome = Biome.Highlands;
  else if (temp > 0.63 && moist < 0.4 && h < 68) biome = Biome.Dunes;
  else if (moist > 0.57) biome = Biome.Grove;
  else biome = Biome.Meadow;

  const sample: TerrainSample = { h, biome, moist };
  if (cache.size > 250000) cache.clear();
  cache.set(key, sample);
  return sample;
}

function cave(x: number, y: number, z: number, seed: number): boolean {
  const n = fbm3(x * 0.065, y * 0.09, z * 0.065, seed + 123, 3);
  return Math.abs(n - 0.5) < 0.032;
}

function surfaceOf(biome: BiomeId, h: number, moist: number): BlockId {
  if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.Dunes) return Block.Sand;
  if (biome === Biome.Highlands && (h > 88 || moist > 0.55)) return Block.Snow;
  if (biome === Biome.Highlands && h > 64) return Block.Stone;
  return Block.Grass;
}

export type TreeKind = "broad" | "pine" | "spine";

export function treeAt(x: number, z: number, seed: number): TreeKind | null {
  const s = sampleTerrain(x, z, seed);
  if (s.h < SEA + 2 || s.h > HEIGHT - 22) return null;
  const slope =
    Math.abs(sampleTerrain(x + 1, z, seed).h - s.h) +
    Math.abs(sampleTerrain(x, z + 1, seed).h - s.h);
  if (slope > 2) return null;
  const r = hash2(x, z, seed + 17);
  if (s.biome === Biome.Grove && r > 0.968) return r > 0.99 ? "broad" : "pine";
  if (s.biome === Biome.Highlands && s.h < 84 && r > 0.978) return "pine";
  if (s.biome === Biome.Meadow && r > 0.989) return "broad";
  if (s.biome === Biome.Dunes && r > 0.993) return "spine";
  return null;
}

/**
 * Fills one vertical column of the world. `write` receives world x, y, z.
 * Only blocks inside [x0, x1) × [z0, z1) are written.
 */
export function fillColumn(
  cx: number,
  cz: number,
  seed: number,
  blocks: Uint8Array,
  heights: Uint8Array,
  index: (lx: number, y: number, lz: number) => number,
): void {
  const x0 = cx * 16;
  const z0 = cz * 16;

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      const sample = sampleTerrain(wx, wz, seed);
      const h = sample.h;
      heights[lx + lz * 16] = h;
      const surface = surfaceOf(sample.biome, h, sample.moist);

      for (let y = 0; y < HEIGHT; y++) {
        let id: BlockId = Block.Air;
        if (y <= 1) id = Block.Core;
        else if (y > h && y < SEA) id = Block.Water;
        else if (y <= h) {
          const depth = h - y;
          if (depth === 0) id = surface;
          else if (surface === Block.Sand && depth < 4) id = Block.Sand;
          else if (surface === Block.Snow && depth < 3) id = depth === 1 ? Block.Snow : Block.Stone;
          else if (surface === Block.Stone && depth < 3) id = Block.Stone;
          else if (depth < 4) id = Block.Dirt;
          else id = Block.Stone;

          if (
            id !== Block.Core &&
            y > 5 &&
            y < h - 4 &&
            y > SEA - 2 &&
            cave(wx, y, wz, seed)
          ) {
            id = Block.Air;
          }

          if (id === Block.Stone && hash3(wx, y, wz, seed + 9) > 0.9) id = Block.Cobble;
          if (
            id === Block.Dirt &&
            sample.biome === Biome.Grove &&
            depth > 1 &&
            depth < 4 &&
            hash3(wx, y, wz, seed + 4) > 0.72
          ) {
            id = Block.Clay;
          }
          if (
            (id === Block.Stone || id === Block.Cobble) &&
            y > 6 &&
            y < 34 &&
            hash3(wx >> 1, y >> 1, wz >> 1, seed + 50) > 0.9975 &&
            hash3(wx, y, wz, seed + 51) > 0.35
          ) {
            id = Block.Lumen;
          }
        }
        blocks[index(lx, y, lz)] = id;
      }
    }
  }

  stampTrees(x0, z0, seed, blocks, index);
  stampFlora(x0, z0, seed, blocks, heights, index);
}

function trySet(
  blocks: Uint8Array,
  index: (lx: number, y: number, lz: number) => number,
  x0: number,
  z0: number,
  x: number,
  y: number,
  z: number,
  id: BlockId,
  onlyEmpty: boolean,
): void {
  if (y <= 1 || y >= HEIGHT) return;
  const lx = x - x0;
  const lz = z - z0;
  if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16) return;
  const i = index(lx, y, lz);
  const cur = blocks[i]!;
  if (onlyEmpty && cur !== Block.Air && cur !== Block.Tuft && cur !== Block.Petal && cur !== Block.Leaves && cur !== Block.Pine) {
    return;
  }
  if (onlyEmpty && (cur === Block.Water || cur === Block.Core)) return;
  blocks[i] = id;
}

function stampTrees(
  x0: number,
  z0: number,
  seed: number,
  blocks: Uint8Array,
  index: (lx: number, y: number, lz: number) => number,
): void {
  const pad = 6;
  for (let z = z0 - pad; z < z0 + 16 + pad; z++) {
    for (let x = x0 - pad; x < x0 + 16 + pad; x++) {
      const kind = treeAt(x, z, seed);
      if (!kind) continue;
      const h = sampleTerrain(x, z, seed).h;
      if (kind === "spine") {
        const tall = 2 + Math.floor(hash2(x, z, seed + 3) * 3);
        for (let i = 1; i <= tall; i++) trySet(blocks, index, x0, z0, x, h + i, z, Block.Spine, true);
        continue;
      }
      if (kind === "broad") {
        const trunk = 4 + Math.floor(hash2(x, z, seed + 3) * 3);
        for (let i = 0; i < trunk; i++) trySet(blocks, index, x0, z0, x, h + i, z, Block.Log, i === 0 ? false : true);
        const top = h + trunk;
        for (let y = top - 2; y <= top + 1; y++) {
          const r = y >= top ? 1 : 2;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
              if (dx === 0 && dz === 0 && y <= top) continue;
              if (hash2(x + dx, z + dz + y * 3, seed) > 0.93 && r === 2) continue;
              trySet(blocks, index, x0, z0, x + dx, y, z + dz, Block.Leaves, true);
            }
          }
        }
        continue;
      }
      const trunk = 8;
      for (let i = 0; i < trunk; i++) trySet(blocks, index, x0, z0, x, h + i, z, Block.Log, i === 0 ? false : true);
      const radii = [2, 2, 2, 1, 1, 1, 0];
      for (let layer = 0; layer < radii.length; layer++) {
        const y = h + 3 + layer;
        const r = radii[layer]!;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) > r) continue;
            if (dx === 0 && dz === 0 && layer < 4) continue;
            trySet(blocks, index, x0, z0, x + dx, y, z + dz, Block.Pine, true);
          }
        }
      }
    }
  }
}

function stampFlora(
  x0: number,
  z0: number,
  seed: number,
  blocks: Uint8Array,
  heights: Uint8Array,
  index: (lx: number, y: number, lz: number) => number,
): void {
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const h = heights[lx + lz * 16]!;
      if (h < SEA + 1 || h + 1 >= HEIGHT) continue;
      const ground = blocks[index(lx, h, lz)]!;
      if (ground !== Block.Grass) continue;
      const above = blocks[index(lx, h + 1, lz)]!;
      if (above !== Block.Air) continue;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const r = hash2(wx, wz, seed + 99);
      if (r > 0.975) blocks[index(lx, h + 1, lz)] = Block.Petal;
      else if (r > 0.84) blocks[index(lx, h + 1, lz)] = Block.Tuft;
    }
  }
}

export type Vista = { x: number; z: number; h: number; biome: BiomeId };

/** Picks a shoreline overlook so the first frame has water, land, and sky. */
export function findVista(seed: number): Vista {
  let best: Vista = { x: 0, z: 0, h: SEA + 4, biome: Biome.Meadow };
  let bestScore = -Infinity;
  const ring = [18, 34, 52];

  for (let z = -168; z <= 168; z += 8) {
    for (let x = -168; x <= 168; x += 8) {
      const s = sampleTerrain(x, z, seed);
      if (s.h < SEA + 2 || s.h > SEA + 16) continue;
      if (s.biome === Biome.Ocean) continue;
      let coast = 0;
      let relief = 0;
      let minH = s.h;
      let maxH = s.h;
      for (const dist of ring) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const sx = x + Math.round(Math.cos(a) * dist);
          const sz = z + Math.round(Math.sin(a) * dist);
          const o = sampleTerrain(sx, sz, seed);
          if (o.h < SEA) coast++;
          if (o.h < minH) minH = o.h;
          if (o.h > maxH) maxH = o.h;
        }
      }
      relief = maxH - minH;
      const shoreBonus = s.biome === Biome.Beach || s.biome === Biome.Meadow ? 4 : 0;
      const score = coast * 2.4 + Math.min(relief, 28) + shoreBonus - Math.hypot(x, z) * 0.012;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, h: s.h, biome: s.biome };
      }
    }
  }
  return best;
}
