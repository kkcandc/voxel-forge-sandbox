import * as THREE from "three";
import { Tile } from "./blocks";
import { fbm2, hash2, smoothstep } from "./noise";

const COLS = 16;
const ROWS = 2;
const TILE = 16;

export function tileUV(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const tx = tile % COLS;
  const ty = Math.floor(tile / COLS);
  const du = 1 / COLS;
  const dv = 1 / ROWS;
  const padU = 0.5 / (COLS * TILE);
  const padV = 0.5 / (ROWS * TILE);
  return {
    u0: tx * du + padU,
    u1: (tx + 1) * du - padU,
    v0: 1 - (ty + 1) * dv + padV,
    v1: 1 - ty * dv - padV,
  };
}

type RGB = [number, number, number, number];

function painter(data: Uint8ClampedArray, width: number) {
  const put = (tile: number, x: number, y: number, r: number, g: number, b: number, a = 255) => {
    const tx = (tile % COLS) * TILE + x;
    const ty = Math.floor(tile / COLS) * TILE + y;
    const i = (ty * width + tx) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  };
  const fill = (tile: number, r: number, g: number, b: number, a = 255) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) put(tile, x, y, r, g, b, a);
  };
  const jitter = (tile: number, x: number, y: number, rgb: RGB, amt: number) => {
    const n = hash2(x + tile * 17, y + tile * 3, 9);
    const k = (n - 0.5) * amt;
    put(tile, x, y, rgb[0] + k, rgb[1] + k, rgb[2] + k, rgb[3]);
  };
  return { put, fill, jitter };
}

export function createAtlas(): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const image = ctx.createImageData(canvas.width, canvas.height);
  const { put, fill, jitter } = painter(image.data, canvas.width);

  const speck = (tile: number, base: RGB, amt: number, holes = 0) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = hash2(x, y, tile + 3);
        if (holes && n > holes && x > 0 && y > 0 && x < 15 && y < 15) {
          put(tile, x, y, base[0], base[1], base[2], 0);
          continue;
        }
        jitter(tile, x, y, base, amt);
      }
    }
  };

  speck(Tile.GrassTop, [92, 176, 78, 255], 28);
  for (let i = 0; i < 36; i++) {
    const x = Math.floor(hash2(i, 2, 1) * 16);
    const y = Math.floor(hash2(i, 4, 2) * 14);
    put(Tile.GrassTop, x, y, 186, 214, 96);
    if (y + 1 < 16) put(Tile.GrassTop, x, y + 1, 64, 140, 58);
  }

  speck(Tile.Dirt, [138, 92, 54, 255], 22);
  speck(Tile.GrassSide, [138, 92, 54, 255], 18);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < TILE; x++) jitter(Tile.GrassSide, x, y, [88, 168, 72, 255], 26);
  }
  for (let x = 0; x < TILE; x++) {
    if (hash2(x, 8, 4) > 0.55) {
      put(Tile.GrassSide, x, 4, 76, 150, 64);
      if (hash2(x, 9, 4) > 0.6) put(Tile.GrassSide, x, 5, 70, 130, 58);
    }
  }

  speck(Tile.Stone, [142, 144, 150, 255], 16);
  for (let i = 0; i < 14; i++) {
    const x = 1 + Math.floor(hash2(i, 1, 5) * 13);
    const y = 1 + Math.floor(hash2(i, 2, 5) * 13);
    put(Tile.Stone, x, y, 96, 98, 104);
    put(Tile.Stone, Math.min(15, x + 1), y, 110, 112, 118);
  }

  speck(Tile.Sand, [226, 204, 146, 255], 18);
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(hash2(i, 3, 6) * 16);
    const y = Math.floor(hash2(i, 5, 6) * 16);
    put(Tile.Sand, x, y, 236, 220, 170);
  }

  fill(Tile.LogSide, 112, 74, 44);
  for (let x = 0; x < TILE; x++) {
    const dark = x % 4 === 0;
    for (let y = 0; y < TILE; y++) {
      const n = hash2(x, y, 12);
      const base = dark ? 78 : 118 + n * 20;
      put(Tile.LogSide, x, y, base, base * 0.62, base * 0.38);
    }
  }
  fill(Tile.LogTop, 168, 124, 74);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.abs(d - 3) < 0.7 || Math.abs(d - 5.5) < 0.6;
      if (ring) put(Tile.LogTop, x, y, 92, 62, 36);
      else if (d < 1.2) put(Tile.LogTop, x, y, 70, 46, 28);
    }
  }

  speck(Tile.Leaves, [62, 148, 70, 255], 30, 0.9);
  speck(Tile.Pine, [38, 108, 86, 255], 24, 0.9);

  fill(Tile.Water, 58, 142, 196, 230);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wave = y === 4 || y === 5 || y === 11 || (y === 12 && hash2(x, y, 2) > 0.4);
      if (wave) put(Tile.Water, x, y, 170, 214, 232, 240);
      else jitter(Tile.Water, x, y, [52, 132, 190, 225], 16);
    }
  }

  speck(Tile.Snow, [238, 244, 250, 255], 10);
  for (let y = 12; y < 16; y++) {
    for (let x = 0; x < TILE; x++) put(Tile.Snow, x, y, 214, 226, 236);
  }

  fill(Tile.Plank, 198, 154, 96);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (y % 4 === 0) put(Tile.Plank, x, y, 150, 108, 62);
      else jitter(Tile.Plank, x, y, [204, 158, 98, 255], 14);
      if (x === 0 || x === 15) put(Tile.Plank, x, y, 160, 116, 68);
    }
  }

  fill(Tile.Glass, 214, 236, 242, 255);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      if (edge) put(Tile.Glass, x, y, 236, 248, 252);
      else put(Tile.Glass, x, y, 186, 220, 230);
    }
  }

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy) / 8;
      const hot = clamp01(1 - d);
      put(
        Tile.Lumen,
        x,
        y,
        255,
        150 + hot * 100,
        40 + hot * 140,
      );
    }
  }

  speck(Tile.Clay, [188, 104, 74, 255], 20);
  speck(Tile.Cobble, [118, 120, 126, 255], 20);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const cell = (Math.floor(x / 4) + Math.floor(y / 4) * 3) % 2;
      if (x % 4 === 0 || y % 4 === 0) put(Tile.Cobble, x, y, 78, 80, 86);
      else if (cell) jitter(Tile.Cobble, x, y, [132, 134, 140, 255], 12);
    }
  }

  speck(Tile.Core, [42, 40, 48, 255], 8);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(hash2(i, 1, 8) * 16);
    const y = Math.floor(hash2(i, 2, 8) * 16);
    put(Tile.Core, x, y, 255, 122, 48);
  }

  fill(Tile.Petal, 0, 0, 0, 0);
  const petal = (x: number, y: number, r: number, g: number, b: number) => {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) put(Tile.Petal, x, y, r, g, b, 255);
  };
  for (const [dx, dy] of [
    [0, -3],
    [3, 0],
    [0, 3],
    [-3, 0],
    [2, -2],
    [2, 2],
    [-2, 2],
    [-2, -2],
  ] as const) {
    petal(8 + dx, 8 + dy, 232, 120, 156);
    petal(8 + Math.sign(dx), 8 + Math.sign(dy), 244, 170, 190);
  }
  petal(8, 8, 255, 214, 96);
  petal(7, 8, 255, 200, 80);
  petal(8, 7, 255, 220, 120);

  fill(Tile.Tuft, 0, 0, 0, 0);
  const blades = [3, 6, 8, 10, 13];
  for (const x of blades) {
    const h = 7 + Math.floor(hash2(x, 1, 3) * 5);
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      const lean = k > 4 ? (hash2(x, k, 2) > 0.5 ? 1 : 0) : 0;
      put(Tile.Tuft, Math.min(15, x + lean), y, k > h - 2 ? 170 : 86, k > h - 2 ? 200 : 150, 70, 255);
    }
  }

  speck(Tile.Spine, [78, 150, 72, 255], 18);
  for (let x = 0; x < TILE; x += 3) {
    for (let y = 0; y < TILE; y++) put(Tile.Spine, x, y, 48, 110, 52);
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, canvas };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function iconURL(canvas: HTMLCanvasElement, tile: number): string {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  const tx = (tile % COLS) * TILE;
  const ty = Math.floor(tile / COLS) * TILE;
  ctx.drawImage(canvas, tx, ty, TILE, TILE, 0, 0, TILE, TILE);
  return c.toDataURL();
}

export function createCloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2(x * 0.02, y * 0.02, 77, 5);
      const a = smoothstep(0.5, 0.78, n);
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.floor(a * a * 210);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, "rgba(255,248,230,1)");
  g.addColorStop(0.18, "rgba(255,220,150,0.95)");
  g.addColorStop(0.45, "rgba(255,170,80,0.35)");
  g.addColorStop(1, "rgba(255,140,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
