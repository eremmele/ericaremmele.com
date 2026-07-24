import * as THREE from "three";

/**
 * FloatingParticlesBlack — matches Framer code component props:
 * black void, white dots, count 50, size ~2, opacity 0.6, speed 0.5.
 * Lives in the Three.js scene so the garden occludes it (truly behind).
 */
export class FloatingParticlesBlack {
  readonly points: THREE.Points;
  private readonly velocities: Float32Array;
  private readonly positions: Float32Array;
  private readonly speed: number;
  private readonly bounds = new THREE.Vector3(70, 45, 70);

  constructor(
    scene: THREE.Scene,
    options: {
      particleCount?: number;
      particleOpacity?: number;
      movementSpeed?: number;
      size?: number;
    } = {},
  ) {
    const count = options.particleCount ?? 50;
    this.speed = options.movementSpeed ?? 0.5;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      this.positions[i3] = (Math.random() - 0.5) * this.bounds.x * 2;
      this.positions[i3 + 1] = Math.random() * this.bounds.y;
      this.positions[i3 + 2] = (Math.random() - 0.5) * this.bounds.z * 2;

      const angle = Math.random() * Math.PI * 2;
      const mag = (0.15 + Math.random() * 0.85) * this.speed * 0.02;
      this.velocities[i3] = Math.cos(angle) * mag;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * mag * 0.6;
      this.velocities[i3 + 2] = Math.sin(angle) * mag;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: options.size ?? 0.12,
      opacity: options.particleOpacity ?? 0.6,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -100;
    scene.add(this.points);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05) * 60;
    const hx = this.bounds.x;
    const hy = this.bounds.y;
    const hz = this.bounds.z;

    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] += this.velocities[i] * dt;
      this.positions[i + 1] += this.velocities[i + 1] * dt;
      this.positions[i + 2] += this.velocities[i + 2] * dt;

      if (this.positions[i] < -hx) this.positions[i] = hx;
      if (this.positions[i] > hx) this.positions[i] = -hx;
      if (this.positions[i + 1] < 0) this.positions[i + 1] = hy;
      if (this.positions[i + 1] > hy) this.positions[i + 1] = 0;
      if (this.positions[i + 2] < -hz) this.positions[i + 2] = hz;
      if (this.positions[i + 2] > hz) this.positions[i + 2] = -hz;
    }

    const attr = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.PointsMaterial).dispose();
    this.points.removeFromParent();
  }
}
