import * as THREE from "three";
import { BLOCKS } from "./blocks";

type Speck = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

export class Particles {
  private readonly specks: Speck[] = [];
  private readonly geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private readonly mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor(private readonly scene: THREE.Scene) {}

  burst(x: number, y: number, z: number, id: number): void {
    const color = BLOCKS[id]?.color ?? 0xffffff;
    let mat = this.mats.get(color);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color });
      this.mats.set(color, mat);
    }
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5);
      velocity.multiplyScalar(3.2);
      this.scene.add(mesh);
      this.specks.push({ mesh, velocity, life: 0.45 + Math.random() * 0.2 });
    }
  }

  update(dt: number): void {
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const speck = this.specks[i]!;
      speck.life -= dt;
      speck.velocity.y -= 14 * dt;
      speck.mesh.position.addScaledVector(speck.velocity, dt);
      const scale = Math.max(speck.life, 0);
      speck.mesh.scale.setScalar(scale);
      if (speck.life <= 0) {
        this.scene.remove(speck.mesh);
        this.specks.splice(i, 1);
      }
    }
  }
}
