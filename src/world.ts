import * as THREE from "three";
import { BLOCKS, Block } from "./blocks";
import { CHUNK, DATA_R, HEIGHT, HERO_R, MESH_R, SEA, STORAGE_PREFIX } from "./constants";
import type { ForgeMaterials } from "./materials";
import { buildColumnGroup } from "./mesh";
import { fillColumn } from "./terrain";

type Column = {
  blocks: Uint8Array;
  heights: Uint8Array;
};

type Edit = { x: number; y: number; z: number; id: number };

function columnKey(cx: number, cz: number): string {
  return cx + "," + cz;
}

function blockIndex(lx: number, y: number, lz: number): number {
  return lx + lz * CHUNK + y * CHUNK * CHUNK;
}

export class VoxelWorld {
  private readonly columns = new Map<string, Column>();
  private readonly groups = new Map<string, THREE.Group>();
  private readonly meshed = new Set<string>();
  private readonly urgent: string[] = [];
  private edits: Edit[] = [];
  private readonly editAt = new Map<string, number>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly materials: ForgeMaterials,
    private readonly seed: number,
    private readonly seedKey: string,
  ) {
    this.loadEdits();
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return Block.Core;
    if (y >= HEIGHT) return Block.Air;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const col = this.columns.get(columnKey(cx, cz));
    if (!col) return Block.Air;
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    return col.blocks[blockIndex(lx, y, lz)] ?? Block.Air;
  }

  /** Unloaded ground counts as solid so a sprint cannot fall through a seam. */
  solidAt(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const col = this.columns.get(columnKey(cx, cz));
    if (!col) return true;
    const id = col.blocks[blockIndex(x - cx * CHUNK, y, z - cz * CHUNK)] ?? Block.Air;
    return BLOCKS[id]?.solid ?? false;
  }

  surfaceY(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.ensureColumn(cx, cz);
    for (let y = HEIGHT - 1; y >= 0; y--) {
      if (this.solidAt(x, y, z)) return y + 1;
    }
    return SEA + 2;
  }

  findStand(x: number, z: number): THREE.Vector3 {
    const preferred = new Set<number>([Block.Grass, Block.Sand, Block.Snow, Block.Dirt, Block.Stone, Block.Plank]);
    for (let r = 0; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const wx = x + dx;
          const wz = z + dz;
          const y = this.surfaceY(wx, wz);
          if (this.getBlock(wx, y, wz) !== Block.Air || this.getBlock(wx, y + 1, wz) !== Block.Air) continue;
          const below = this.getBlock(wx, y - 1, wz);
          if (!preferred.has(below)) continue;
          return new THREE.Vector3(wx + 0.5, y, wz + 0.5);
        }
      }
    }
    const y = this.surfaceY(x, z);
    return new THREE.Vector3(x + 0.5, y, z + 0.5);
  }

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y <= 1 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const col = this.ensureColumn(cx, cz);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const i = blockIndex(lx, y, lz);
    const prev = col.blocks[i] ?? Block.Air;
    if (prev === id) return false;
    if (BLOCKS[prev]?.unbreakable) return false;
    col.blocks[i] = id;
    this.noteEdit(x, y, z, id);
    this.saveEdits();
    this.meshNow(cx, cz);
    this.queueNeighbors(x, z);
    return true;
  }

  update(px: number, pz: number): void {
    const ccx = Math.floor(px / CHUNK);
    const ccz = Math.floor(pz / CHUNK);

    for (let n = 0; n < 3; n++) {
      const missing = this.nearest(ccx, ccz, DATA_R, (cx, cz) => !this.columns.has(columnKey(cx, cz)));
      if (!missing) break;
      this.ensureColumn(missing[0], missing[1]);
    }

    let built = 0;
    while (this.urgent.length > 0 && built < 2) {
      const k = this.urgent.pop();
      if (!k) break;
      const [cx, cz] = k.split(",").map(Number) as [number, number];
      if (this.columns.has(k)) this.meshNow(cx!, cz!);
      built++;
    }

    for (let n = built; n < 2; n++) {
      const next = this.nearest(ccx, ccz, MESH_R, (cx, cz) => !this.meshed.has(columnKey(cx, cz)));
      if (!next) break;
      if (!this.neighborsReady(next[0], next[1])) break;
      this.meshNow(next[0], next[1]);
    }

    this.unloadFar(ccx, ccz);
  }

  heroProgress(x: number, z: number): { done: number; total: number } {
    const ccx = Math.floor(x / CHUNK);
    const ccz = Math.floor(z / CHUNK);
    let done = 0;
    let total = 0;
    const reach = Math.ceil(HERO_R);
    const limit = HERO_R * HERO_R;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dz * dz > limit) continue;
        total++;
        if (this.meshed.has(columnKey(ccx + dx, ccz + dz))) done++;
      }
    }
    return { done, total };
  }

  private ensureColumn(cx: number, cz: number): Column {
    const k = columnKey(cx, cz);
    const existing = this.columns.get(k);
    if (existing) return existing;
    const blocks = new Uint8Array(CHUNK * HEIGHT * CHUNK);
    const heights = new Uint8Array(CHUNK * CHUNK);
    fillColumn(cx, cz, this.seed, blocks, heights, blockIndex);
    this.applyEdits(cx, cz, blocks);
    const col: Column = { blocks, heights };
    this.columns.set(k, col);
    return col;
  }

  private meshNow(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) this.ensureColumn(cx + dx, cz + dz);
    }
    const k = columnKey(cx, cz);
    const previous = this.groups.get(k);
    if (previous) this.dispose(previous);
    const col = this.columns.get(k);
    if (!col) return;
    const group = buildColumnGroup(
      cx,
      cz,
      {
        get: (x, y, z) => this.getBlock(x, y, z),
        height: (lx, lz) => col.heights[lx + lz * CHUNK] ?? SEA,
      },
      this.materials,
    );
    this.scene.add(group);
    this.groups.set(k, group);
    this.meshed.add(k);
  }

  private queueNeighbors(x: number, z: number): void {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const extra: [number, number][] = [];
    if (lx === 0) extra.push([cx - 1, cz]);
    if (lx === CHUNK - 1) extra.push([cx + 1, cz]);
    if (lz === 0) extra.push([cx, cz - 1]);
    if (lz === CHUNK - 1) extra.push([cx, cz + 1]);
    if (lx === 0 && lz === 0) extra.push([cx - 1, cz - 1]);
    if (lx === 0 && lz === CHUNK - 1) extra.push([cx - 1, cz + 1]);
    if (lx === CHUNK - 1 && lz === 0) extra.push([cx + 1, cz - 1]);
    if (lx === CHUNK - 1 && lz === CHUNK - 1) extra.push([cx + 1, cz + 1]);
    for (const [nx, nz] of extra) {
      const k = columnKey(nx, nz);
      if (this.meshed.has(k)) this.urgent.push(k);
    }
  }

  private neighborsReady(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.columns.has(columnKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  private nearest(
    ccx: number,
    ccz: number,
    radius: number,
    want: (cx: number, cz: number) => boolean,
  ): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    const reach = Math.ceil(radius);
    const limit = radius * radius;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dz * dz;
        if (d > limit || d >= bestD) continue;
        const cx = ccx + dx;
        const cz = ccz + dz;
        if (!want(cx, cz)) continue;
        bestD = d;
        best = [cx, cz];
      }
    }
    return best;
  }

  private unloadFar(ccx: number, ccz: number): void {
    const limit = (DATA_R + 2.5) * (DATA_R + 2.5);
    for (const k of [...this.columns.keys()]) {
      const parts = k.split(",");
      const cx = Number(parts[0]);
      const cz = Number(parts[1]);
      const dx = cx - ccx;
      const dz = cz - ccz;
      if (dx * dx + dz * dz <= limit) continue;
      this.columns.delete(k);
      this.meshed.delete(k);
      const group = this.groups.get(k);
      if (group) this.dispose(group);
      this.groups.delete(k);
    }
  }

  private dispose(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
  }

  private noteEdit(x: number, y: number, z: number, id: number): void {
    const k = x + "," + y + "," + z;
    const at = this.editAt.get(k);
    if (at !== undefined) {
      const edit = this.edits[at];
      if (edit) edit.id = id;
      return;
    }
    this.editAt.set(k, this.edits.length);
    this.edits.push({ x, y, z, id });
    if (this.edits.length > 6000) {
      const dropped = this.edits.shift();
      this.editAt.clear();
      if (dropped) {
        this.edits.forEach((edit, index) => {
          this.editAt.set(edit.x + "," + edit.y + "," + edit.z, index);
        });
      }
    }
  }

  private applyEdits(cx: number, cz: number, blocks: Uint8Array): void {
    if (this.edits.length === 0) return;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (const edit of this.edits) {
      if (edit.x < x0 || edit.x >= x0 + CHUNK || edit.z < z0 || edit.z >= z0 + CHUNK) continue;
      if (edit.y <= 1 || edit.y >= HEIGHT) continue;
      blocks[blockIndex(edit.x - x0, edit.y, edit.z - z0)] = edit.id;
    }
  }

  private loadEdits(): void {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + this.seedKey);
      if (!raw) return;
      for (const part of raw.split(";")) {
        if (!part) continue;
        const bits = part.split(",");
        const x = Number(bits[0]);
        const y = Number(bits[1]);
        const z = Number(bits[2]);
        const id = Number(bits[3]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (!BLOCKS[id]) continue;
        this.noteEdit(x, y, z, id);
      }
    } catch {
      /* private mode and full disks should not block play */
    }
  }

  private saveEdits(): void {
    try {
      const body = this.edits.map((edit) => `${edit.x},${edit.y},${edit.z},${edit.id}`).join(";");
      localStorage.setItem(STORAGE_PREFIX + this.seedKey, body);
    } catch {
      /* ignore quota */
    }
  }
}
