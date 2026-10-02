import * as THREE from "three";
import { ForgeAudio } from "./audio";
import { BLOCKS, Block, PALETTE } from "./blocks";
import { SEA } from "./constants";
import { bindInput, breaking, consumeEdges, keyHeld, placing, setPlaying, slot } from "./input";
import { createMaterials } from "./materials";
import { assertFaceWindings } from "./mesh";
import { hashSeed } from "./noise";
import { Particles } from "./particles";
import { raycast } from "./pick";
import { Player } from "./player";
import { SkyRig } from "./sky";
import { BIOME_NAME, findVista, sampleTerrain } from "./terrain";
import { createAtlas } from "./textures";
import { dayLabel, mountHud, paintSlot, paintStatus, setLookHint, setTarget, showPlay } from "./ui";
import { VoxelWorld } from "./world";

assertFaceWindings();

const WORDS_A = ["amber", "lumen", "cedar", "willow", "quartz", "brook", "harbor", "pebble", "cairn", "aurora", "drift", "halo", "flint"];
const WORDS_B = ["grove", "shore", "vale", "reach", "field", "light", "wind", "path", "rise", "basin", "ridge"];

function randomSeed(): string {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)] ?? "lumen";
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)] ?? "shore";
  return `${a}-${b}-${Math.floor(Math.random() * 90 + 10)}`;
}

const params = new URLSearchParams(location.search);
const seedKey = params.get("seed")?.trim() || randomSeed();
if (!params.get("seed")) {
  params.set("seed", seedKey);
  history.replaceState(null, "", `?${params.toString()}`);
}
const seed = hashSeed(seedKey) || 1;
const rawTime = params.get("t");
let timeOfDay = 0.7;
if (rawTime !== null && rawTime.trim() !== "") {
  const parsed = Number(rawTime);
  if (Number.isFinite(parsed)) timeOfDay = parsed;
}
let timeRun = true;

const canvasEl = document.getElementById("view");
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error("Missing canvas");
const canvas: HTMLCanvasElement = canvasEl;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
if (!renderer.getContext()) {
  const enter = document.getElementById("enter");
  if (enter) enter.textContent = "This browser could not start WebGL.";
  throw new Error("WebGL unavailable");
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xe7a27a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe7a27a, 64, 130);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 800);

const atlas = createAtlas();
const materials = createMaterials(atlas.texture);
const world = new VoxelWorld(scene, materials, seed, seedKey);
const sky = new SkyRig(scene);
const player = new Player(world);
const audio = new ForgeAudio();
const particles = new Particles(scene);

const vista = findVista(seed);
const stand = world.findStand(vista.x, vista.z);
const sunScratch = new THREE.Vector3();
sky.direction(timeOfDay, sunScratch);
const introPos = new THREE.Vector3(stand.x - sunScratch.x * 34, stand.y + 13, stand.z - sunScratch.z * 34);
player.placeAt(stand.x, stand.y, stand.z, Math.atan2(sunScratch.x, sunScratch.z));

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 }),
);
outline.visible = false;
scene.add(outline);
const ghost = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
);
ghost.visible = false;
scene.add(ghost);

mountHud(atlas.canvas);
bindInput(canvas);
highlightSeed();

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const autostart = params.get("play") === "1";
let phase: "boot" | "title" | "play" = "boot";
let heroReady = false;
let breakCd = 0;
let placeCd = 0;
let fps = 60;
let fpsTimer = 0;
let lightScan = 0;
let adapted = false;
const rayDir = new THREE.Vector3();
const eye = new THREE.Vector3();
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

document.getElementById("enter")?.addEventListener("click", () => {
  const field = document.getElementById("seed");
  const next = field instanceof HTMLInputElement ? field.value.trim() : seedKey;
  if (next && next !== seedKey) {
    location.href = `?seed=${encodeURIComponent(next)}`;
    return;
  }
  if (heroReady) begin();
});

document.getElementById("copy")?.addEventListener("click", async () => {
  const field = document.getElementById("seed");
  const next = field instanceof HTMLInputElement ? field.value.trim() || seedKey : seedKey;
  const url = new URL(location.href);
  url.searchParams.set("seed", next);
  try {
    await navigator.clipboard.writeText(url.toString());
    const copy = document.getElementById("copy");
    if (copy) copy.textContent = "Copied";
  } catch {
    /* clipboard can be blocked; the address bar still holds the seed */
  }
});

document.getElementById("seeds")?.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  const next = button?.getAttribute("data-seed");
  if (next) location.href = `?seed=${encodeURIComponent(next)}`;
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter" && phase !== "play" && !(event.target instanceof HTMLInputElement)) {
    document.getElementById("enter")?.dispatchEvent(new MouseEvent("click"));
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener("pointerlockchange", () => {
  document.body.classList.toggle("locked", document.pointerLockElement === canvas);
});

window.addEventListener("pointerdown", () => audio.unlock());

let last = performance.now();
requestAnimationFrame(frame);

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  materials.time.value = now / 1000;
  fps = fps * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;
  fpsTimer += dt;
  if (!adapted && fpsTimer > 4 && fps < 42 && renderer.getPixelRatio() > 1) {
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    adapted = true;
  }

  const focus = phase === "play" ? player.position : stand;
  world.update(focus.x, focus.z);
  const progress = world.heroProgress(stand.x, stand.z);
  if (!heroReady && progress.total > 0 && progress.done >= progress.total) {
    heroReady = true;
    canvas.classList.add("ready");
    phase = "title";
    if (autostart) begin();
  }

  if (phase !== "play") aimIntro(now / 1000);
  else play(dt);

  const underwater = world.getBlock(
    Math.floor(camera.position.x),
    Math.floor(camera.position.y),
    Math.floor(camera.position.z),
  ) === Block.Water;
  const atmo = sky.update(timeOfDay, camera, player.position, underwater, phase === "play", now / 1000);
  sky.applyFog(scene, atmo);
  renderer.toneMappingExposure = sky.exposure(atmo, underwater);
  const sunLit = underwater ? 0.7 : Math.min(1, 0.62 + atmo.day * 0.38 + atmo.sunset * 0.08);
  materials.opaque.color.setScalar(sunLit);
  materials.cutout.color.setScalar(sunLit);
  materials.glass.color.setScalar(Math.min(1, sunLit + 0.12));
  materials.water.color.setScalar(Math.min(1, sunLit + 0.06));
  particles.update(dt);

  const sample = sampleTerrain(Math.floor(focus.x), Math.floor(focus.z), seed);
  const bearing = ((-player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  paintStatus({
    seed: seedKey,
    when: dayLabel(timeOfDay),
    facing: COMPASS[Math.round(bearing / (Math.PI / 4)) % 8] ?? "N",
    place: BIOME_NAME[sample.biome] ?? "Wilds",
    fps: `${Math.round(fps)} fps`,
    mode: phase === "play" && player.flying ? "Flying" : phase === "play" && !timeRun ? "Sun held" : "",
    load: progress.total ? progress.done / progress.total : 0,
    dial: ((timeOfDay % 1) + 1) % 1,
    ready: heroReady,
  });
  paintSlot();
  setLookHint(phase === "play" && !coarse && document.pointerLockElement !== canvas);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function aimIntro(elapsed: number): void {
  sky.direction(timeOfDay, sunScratch);
  const drift = reduceMotion ? 0 : Math.sin(elapsed * 0.18) * 5;
  const sideX = -sunScratch.z;
  const sideZ = sunScratch.x;
  introPos.set(
    stand.x + sunScratch.x * 24 + sideX * 16 + drift,
    stand.y + 18,
    stand.z + sunScratch.z * 24 + sideZ * 16,
  );
  const ground = sampleTerrain(Math.floor(introPos.x), Math.floor(introPos.z), seed).h;
  introPos.y = Math.max(introPos.y, Math.max(ground, SEA) + 6);
  const dx = stand.x - introPos.x;
  const dy = stand.y + 2.2 - introPos.y;
  const dz = stand.z - introPos.z;
  camera.position.copy(introPos);
  camera.rotation.order = "YXZ";
  camera.rotation.y = Math.atan2(-dx, -dz);
  camera.rotation.x = Math.atan2(dy, Math.hypot(dx, dz));
  camera.rotation.z = 0;
}

function begin(): void {
  if (phase === "play") return;
  phase = "play";
  player.yaw = camera.rotation.y;
  player.pitch = Math.max(-0.32, Math.min(0.15, camera.rotation.x));
  setPlaying(true);
  showPlay(true);
  audio.unlock();
  if (!coarse) canvas.requestPointerLock();
}

function play(dt: number): void {
  const edges = consumeEdges();
  if (edges.pause) timeRun = !timeRun;
  if (edges.noon) timeOfDay = 0.48;
  if (edges.golden) timeOfDay = 0.7;
  if (edges.fly) player.flying = !player.flying;
  if (edges.respawn) player.respawn();
  if (timeRun) timeOfDay += dt / 220;
  if (keyHeld("BracketLeft")) timeOfDay -= dt * 0.12;
  if (keyHeld("BracketRight")) timeOfDay += dt * 0.12;

  const motion = player.update(dt, camera, reduceMotion);
  if (motion.jumped) audio.jump();
  if (motion.landed) audio.land();

  breakCd -= dt;
  placeCd -= dt;
  player.eyePosition(eye);
  camera.getWorldDirection(rayDir);
  const hit = raycast(world, camera.position, rayDir, player.flying ? 8 : 6.4);
  outline.visible = false;
  ghost.visible = false;
  setTarget("");

  if (hit) {
    const def = BLOCKS[hit.id];
    setTarget(def?.name ?? "");
    outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    outline.visible = true;
    const placeId = PALETTE[slot] ?? Block.Grass;
    const empty = world.getBlock(hit.px, hit.py, hit.pz);
    const flora = BLOCKS[empty]?.flora;
    if ((empty === Block.Air || flora) && !overlaps(hit.px, hit.py, hit.pz)) {
      ghost.position.set(hit.px + 0.5, hit.py + 0.5, hit.pz + 0.5);
      (ghost.material as THREE.MeshBasicMaterial).color.set(BLOCKS[placeId]?.color ?? 0xffffff);
      ghost.visible = true;
    }
    if (breaking() && breakCd <= 0 && def && !def.unbreakable) {
      if (world.setBlock(hit.x, hit.y, hit.z, Block.Air)) {
        particles.burst(hit.x, hit.y, hit.z, hit.id);
        audio.dig();
      }
      breakCd = 0.16;
    } else if (!breaking()) {
      breakCd = 0;
    }
    if (placing() && placeCd <= 0 && ghost.visible) {
      if (world.setBlock(hit.px, hit.py, hit.pz, placeId)) audio.place();
      placeCd = 0.16;
    } else if (!placing()) {
      placeCd = 0;
    }
  }

  lightScan -= dt;
  if (lightScan <= 0) {
    lightScan = 0.3;
    const found: THREE.Vector3[] = [];
    const x0 = Math.floor(player.position.x);
    const y0 = Math.floor(player.position.y);
    const z0 = Math.floor(player.position.z);
    for (let z = z0 - 6; z <= z0 + 6; z++) {
      for (let y = y0 - 4; y <= y0 + 4; y++) {
        for (let x = x0 - 6; x <= x0 + 6; x++) {
          if (world.getBlock(x, y, z) === Block.Lumen) found.push(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
        }
      }
    }
    found.sort((a, b) => a.distanceToSquared(player.position) - b.distanceToSquared(player.position));
    sky.ore.forEach((light, index) => {
      const at = found[index];
      if (!at) {
        light.intensity = 0;
        return;
      }
      light.position.copy(at);
      light.intensity = 14;
    });
  }
  const holding = PALETTE[slot] === Block.Lumen;
  sky.hold.intensity = holding ? 10 : 0;
  if (holding) sky.hold.position.copy(camera.position);
}

function overlaps(x: number, y: number, z: number): boolean {
  const minX = player.position.x - 0.28;
  const maxX = player.position.x + 0.28;
  const minY = player.position.y;
  const maxY = player.position.y + 1.72;
  const minZ = player.position.z - 0.28;
  const maxZ = player.position.z + 0.28;
  return x + 1 > minX && x < maxX && y + 1 > minY && y < maxY && z + 1 > minZ && z < maxZ;
}

if (import.meta.env.DEV) {
  (window as unknown as { __forge?: unknown }).__forge = { player, world, camera };
}

function highlightSeed(): void {
  document.querySelectorAll<HTMLButtonElement>("#seeds button").forEach((button) => {
    button.classList.toggle("on", button.dataset.seed === seedKey);
  });
}
