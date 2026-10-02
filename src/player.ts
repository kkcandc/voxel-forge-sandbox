import * as THREE from "three";
import { Block } from "./blocks";
import { axisForward, axisRight, keyHeld, lookDelta } from "./input";
import type { VoxelWorld } from "./world";

const EYE = 1.58;
const HEIGHT = 1.72;
const HALF = 0.28;
const GRAVITY = 26;
const JUMP = 8.7;
const WALK = 4.7;
const SPRINT = 7.5;
const FLY = 13.5;

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.12;
  flying = false;
  onGround = false;
  readonly spawn = new THREE.Vector3();
  private coyote = 0;
  private jumpBuf = 0;
  private wasJump = false;
  private lastJumpTap = 0;
  private bob = 0;
  private landedHard = false;
  private readonly wishVec = new THREE.Vector3();
  private readonly eyeVec = new THREE.Vector3();

  constructor(private readonly world: VoxelWorld) {}

  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.spawn.set(x, y, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = -0.08;
    this.flying = false;
    this.onGround = false;
  }

  respawn(): void {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.flying = false;
  }

  get inWater(): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const feet = this.world.getBlock(x, Math.floor(this.position.y + 0.2), z);
    const head = this.world.getBlock(x, Math.floor(this.position.y + 1.3), z);
    return feet === Block.Water || head === Block.Water;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, reduceMotion: boolean): { jumped: boolean; landed: boolean } {
    const look = lookDelta();
    this.yaw -= look.x * 0.00215;
    this.pitch -= look.y * 0.00215;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    const jump = keyHeld("Space") || keyHeld("touch-jump");
    const jumpEdge = jump && !this.wasJump;
    this.wasJump = jump;
    if (jumpEdge) {
      const now = performance.now();
      if (now - this.lastJumpTap < 280) this.flying = !this.flying;
      this.lastJumpTap = now;
      this.jumpBuf = 0.14;
    } else {
      this.jumpBuf -= dt;
    }

    let jumped = false;
    let landed = false;
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      const hit = this.integrate(step, jump);
      jumped = jumped || hit.jumped;
      landed = landed || hit.landed;
    }

    if (this.position.y < -8) this.respawn();

    const eye = this.eyePosition(this.eyeVec);
    const moving = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && moving > 1.2 && !reduceMotion) this.bob += dt * moving * 1.55;
    const bobAmp = reduceMotion ? 0 : Math.min(0.045, moving * 0.006);
    camera.position.set(
      eye.x + Math.cos(this.bob * 0.5) * bobAmp * 0.35,
      eye.y + Math.sin(this.bob) * bobAmp,
      eye.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.x = this.pitch;
    camera.rotation.y = this.yaw;
    camera.rotation.z = 0;

    const sprinting = keyHeld("ShiftLeft") || keyHeld("ShiftRight") || keyHeld("ControlLeft");
    const targetFov = this.flying ? 78 : sprinting && moving > 2 ? 80 : 72;
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-8 * dt));
    camera.updateProjectionMatrix();

    return { jumped, landed };
  }

  eyePosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.position).setY(this.position.y + EYE);
  }

  private integrate(dt: number, jumpHeld: boolean): { jumped: boolean; landed: boolean } {
    const swimming = this.inWater && !this.flying;
    const sprinting = keyHeld("ShiftLeft") || keyHeld("ShiftRight") || keyHeld("ControlLeft");
    let speed = this.flying ? FLY : sprinting ? SPRINT : WALK;
    if (swimming) speed *= 0.62;

    const wish = this.wish(this.flying);
    const accel = this.flying ? 8 : this.onGround ? 14 : swimming ? 6 : 3;
    const blend = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wish.x * speed - this.velocity.x) * blend;
    this.velocity.z += (wish.z * speed - this.velocity.z) * blend;

    let jumped = false;
    if (this.flying) {
      const up = (jumpHeld ? 1 : 0) - (keyHeld("ShiftLeft") || keyHeld("ShiftRight") || keyHeld("touch-down") ? 1 : 0);
      const target = up * FLY * 0.72 + wish.y * speed;
      this.velocity.y += (target - this.velocity.y) * (1 - Math.exp(-8 * dt));
    } else if (swimming) {
      this.velocity.y *= Math.exp(-2.4 * dt);
      this.velocity.y += 7 * dt;
      if (jumpHeld) this.velocity.y += 12 * dt;
      if (this.velocity.y > 4.5) this.velocity.y = 4.5;
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -24) this.velocity.y = -24;
      if (this.onGround) this.coyote = 0.12;
      else this.coyote -= dt;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.velocity.y = JUMP;
        this.jumpBuf = 0;
        this.coyote = 0;
        this.onGround = false;
        jumped = true;
      }
    }

    const wasGround = this.onGround;
    this.onGround = false;
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    const beforeY = this.velocity.y;
    this.position.y += this.velocity.y * dt;
    let landed = false;
    if (this.blocked(this.position)) {
      this.position.y -= this.velocity.y * dt;
      if (beforeY < 0) {
        this.onGround = true;
        landed = !wasGround && beforeY < -7 && !this.landedHard;
        this.landedHard = beforeY < -7;
      }
      this.velocity.y = 0;
    } else {
      this.landedHard = false;
    }
    return { jumped, landed };
  }

  private wish(flying: boolean): THREE.Vector3 {
    const forward = axisForward();
    const right = axisRight();
    const cp = flying ? Math.cos(this.pitch) : 1;
    const sp = flying ? Math.sin(this.pitch) : 0;
    const fx = -Math.sin(this.yaw) * cp;
    const fy = sp;
    const fz = -Math.cos(this.yaw) * cp;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const wish = this.wishVec.set(fx * forward + rx * right, fy * forward, fz * forward + rz * right);
    if (wish.lengthSq() > 1) wish.normalize();
    return wish;
  }

  private moveAxis(axis: "x" | "z", delta: number): void {
    if (delta === 0) return;
    this.position[axis] += delta;
    if (!this.blocked(this.position)) return;
    if (this.onGround || this.flying) {
      this.position.y += 1.02;
      if (!this.blocked(this.position)) return;
      this.position.y -= 1.02;
    }
    this.position[axis] -= delta;
    this.velocity[axis] = 0;
  }

  private blocked(pos: THREE.Vector3): boolean {
    const minX = Math.floor(pos.x - HALF);
    const maxX = Math.floor(pos.x + HALF - 1e-4);
    const minY = Math.floor(pos.y + 0.001);
    const maxY = Math.floor(pos.y + HEIGHT - 0.001);
    const minZ = Math.floor(pos.z - HALF);
    const maxZ = Math.floor(pos.z + HALF - 1e-4);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.solidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }
}
