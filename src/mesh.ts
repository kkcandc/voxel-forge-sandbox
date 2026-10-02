import * as THREE from "three";
import { BLOCKS, Block, faceTile, hidesFace } from "./blocks";
import { CHUNK, HEIGHT, SEA } from "./constants";
import type { ForgeMaterials } from "./materials";
import { hash3 } from "./noise";
import { tileUV } from "./textures";

const AO = [0.78, 0.88, 0.95, 1];

type Face = { n: [number, number, number]; corners: [number, number, number][] };

const FACES: Face[] = [
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

export function assertFaceWindings(): void {
  for (const face of FACES) {
    const c = face.corners;
    const e1 = [c[1][0] - c[0][0], c[1][1] - c[0][1], c[1][2] - c[0][2]];
    const e2 = [c[3][0] - c[0][0], c[3][1] - c[0][1], c[3][2] - c[0][2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const d = n[0] * face.n[0] + n[1] * face.n[1] + n[2] * face.n[2];
    if (d <= 0) throw new Error(`Flipped face winding ${face.n.join(",")}`);
  }
}

type Sampler = {
  get(x: number, y: number, z: number): number;
  height(lx: number, lz: number): number;
};

type Bucket = {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
};

function bucket(): Bucket {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function cornerUV(
  normal: [number, number, number],
  corner: [number, number, number],
  origin: [number, number, number],
  uv: { u0: number; v0: number; u1: number; v1: number },
): [number, number] {
  const lx = corner[0] - origin[0];
  const ly = corner[1] - origin[1];
  const lz = corner[2] - origin[2];
  let u = 0;
  let v = 0;
  if (normal[0] !== 0) {
    u = lz;
    v = ly;
  } else if (normal[1] !== 0) {
    u = lx;
    v = lz;
  } else {
    u = lx;
    v = ly;
  }
  return [uv.u0 + (uv.u1 - uv.u0) * u, uv.v0 + (uv.v1 - uv.v0) * v];
}

function pushQuadLocal(
  b: Bucket,
  corners: [number, number, number][],
  normal: [number, number, number],
  origin: [number, number, number],
  tile: number,
  rgb: [number, number, number],
  aos: number[],
): void {
  const base = b.positions.length / 3;
  const uv = tileUV(tile);
  for (let i = 0; i < 4; i++) {
    const c = corners[i]!;
    b.positions.push(c[0], c[1], c[2]);
    b.normals.push(normal[0], normal[1], normal[2]);
    const [u, v] = cornerUV(normal, c, origin, uv);
    b.uvs.push(u, v);
    const s = aos[i]!;
    b.colors.push(rgb[0] * s, rgb[1] * s, rgb[2] * s);
  }
  const flip = aos[0]! + aos[2]! < aos[1]! + aos[3]!;
  if (!flip) b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else b.indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
}

function occludes(sample: Sampler, x: number, y: number, z: number): boolean {
  const id = sample.get(x, y, z);
  return Boolean(BLOCKS[id]?.opaque);
}

function cornerAO(
  sample: Sampler,
  x: number,
  y: number,
  z: number,
  n: [number, number, number],
  c: [number, number, number],
): number {
  const sx = c[0] === 0 ? -1 : 1;
  const sy = c[1] === 0 ? -1 : 1;
  const sz = c[2] === 0 ? -1 : 1;
  let ax = 0;
  let ay = 0;
  let az = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  if (n[0] !== 0) {
    ay = sy;
    bz = sz;
  } else if (n[1] !== 0) {
    ax = sx;
    bz = sz;
  } else {
    ax = sx;
    by = sy;
  }
  const ox = n[0];
  const oy = n[1];
  const oz = n[2];
  const s1 = occludes(sample, x + ox + ax, y + oy + ay, z + oz + az);
  const s2 = occludes(sample, x + ox + bx, y + oy + by, z + oz + bz);
  const sc = occludes(sample, x + ox + ax + bx, y + oy + ay + by, z + oz + az + bz);
  if (s1 && s2) return AO[0]!;
  const level = 3 - (Number(s1) + Number(s2) + Number(sc));
  return AO[level]!;
}

function shadeAt(y: number, surface: number, underSea: boolean): number {
  const depth = surface - y;
  let light = depth <= 0 ? 1 : Math.max(0.4, 1 - depth * 0.048);
  if (underSea && y < SEA - 1) {
    const water = SEA - y;
    light *= Math.max(0.32, 1 - water * 0.07);
  }
  return light;
}

export function buildColumnGroup(
  cx: number,
  cz: number,
  sample: Sampler,
  materials: ForgeMaterials,
): THREE.Group {
  const buckets = {
    opaque: bucket(),
    cutout: bucket(),
    glass: bucket(),
    water: bucket(),
    glow: bucket(),
  };
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;

  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const surface = sample.height(lx, lz);
      const underSea = surface < SEA;
      for (let y = 0; y < HEIGHT; y++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const id = sample.get(wx, y, wz);
        if (id === Block.Air) continue;
        const def = BLOCKS[id];
        if (!def) continue;

        if (def.flora) {
          const tint = 0.94 + hash3(wx, y, wz, 5) * 0.12;
          const rgb: [number, number, number] = [tint, tint, tint];
          const tile = faceTile(id, 1);
          const origin: [number, number, number] = [lx, y, lz];
          pushQuadLocal(
            buckets.cutout,
            [
              [lx, y, lz],
              [lx + 1, y, lz + 1],
              [lx + 1, y + 1, lz + 1],
              [lx, y + 1, lz],
            ],
            [0.7071, 0, 0.7071],
            origin,
            tile,
            rgb,
            [1, 1, 1, 1],
          );
          pushQuadLocal(
            buckets.cutout,
            [
              [lx + 1, y, lz],
              [lx, y, lz + 1],
              [lx, y + 1, lz + 1],
              [lx + 1, y + 1, lz],
            ],
            [-0.7071, 0, 0.7071],
            [lx + 1, y, lz],
            tile,
            rgb,
            [1, 1, 1, 1],
          );
          continue;
        }

        let light = shadeAt(y, surface, underSea);
        if (def.glow) light = Math.max(light, 0.88);
        if (def.liquid || def.glass) light = Math.max(light, 0.75);
        const tint = 0.93 + hash3(wx, y, wz, 11) * 0.12;
        const rgb: [number, number, number] = [tint * light, tint * light, tint * light];
        const key = def.liquid ? "water" : def.glass ? "glass" : def.glow ? "glow" : def.cutout ? "cutout" : "opaque";
        const dest = buckets[key];
        const origin: [number, number, number] = [lx, y, lz];

        for (const face of FACES) {
          const nid = sample.get(wx + face.n[0], y + face.n[1], wz + face.n[2]);
          if (hidesFace(nid, id)) continue;
          const aos = face.corners.map((c) => {
            const raw = cornerAO(sample, wx, y, wz, face.n, c);
            return def.opaque ? raw : 1 - (1 - raw) * 0.35;
          });
          const corners = face.corners.map(
            (c) => [lx + c[0], y + c[1], lz + c[2]] as [number, number, number],
          );
          pushQuadLocal(dest, corners, face.n, origin, faceTile(id, face.n[1]), rgb, aos);
        }
      }
    }
  }

  const group = new THREE.Group();
  group.position.set(x0, 0, z0);
  group.name = `col-${cx}-${cz}`;

  const bind = (b: Bucket, material: THREE.Material, order: number) => {
    if (b.indices.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(b.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(b.indices), 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = order;
    group.add(mesh);
  };

  bind(buckets.opaque, materials.opaque, 0);
  bind(buckets.glow, materials.glow, 0);
  bind(buckets.cutout, materials.cutout, 1);
  bind(buckets.glass, materials.glass, 2);
  bind(buckets.water, materials.water, 3);
  return group;
}
