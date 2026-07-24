import * as THREE from "three";
import type { HeightField } from "./HeightField";

export type NavigationInput = {
  forward: number;
  turn: number;
};

export class NavigationController {
  readonly camera: THREE.PerspectiveCamera;
  readonly player: THREE.Object3D;

  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private readonly moveSpeed = 7;
  private readonly turnSpeed = 2.2;
  private readonly eyeHeight = 1.65;
  private readonly groundFollow = 18;
  private bounds: THREE.Box3;
  private heightField: HeightField | null = null;
  private walkCircle: { x: number; z: number; radius: number } | null = null;
  private targetEyeY = 1.65;
  private readonly keys = new Set<string>();
  private pointerLocked = false;
  private lookTouchId: number | null = null;
  private lastLookTouch = { x: 0, y: 0 };
  private moveTouch = { x: 0, y: 0, active: false };
  /** Penderecki-style soft look-around from cursor (no lock required). */
  private mouseTarget = { x: 0, y: 0 };
  private mouseShift = { x: 0, y: 0 };
  private readonly mouseLookMax = { x: 0.12, y: 0.07 };

  constructor(aspect: number, bounds: THREE.Box3) {
    this.bounds = bounds;
    // Tighter near plane + log depth elsewhere reduces forward-motion z flicker
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.2, 200);
    this.player = new THREE.Object3D();
    this.player.add(this.camera);
    this.player.position.set(0, this.eyeHeight, 6);
    this.yaw = Math.PI;
    this.applyRotation();
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  setBounds(bounds: THREE.Box3): void {
    this.bounds = bounds;
  }

  setHeightField(heightField: HeightField | null): void {
    this.heightField = heightField;
  }

  setWalkCircle(circle: { x: number; z: number; radius: number } | null): void {
    this.walkCircle = circle;
  }

  setSpawn(position: THREE.Vector3): void {
    this.player.position.copy(position);
    this.constrainToWalkable(this.player.position);
    this.targetEyeY = this.sampleEyeY(this.player.position.x, this.player.position.z);
    this.player.position.y = this.targetEyeY;
  }

  bind(element: HTMLElement, canvas: HTMLCanvasElement): void {
    window.addEventListener("keydown", (event) => {
      if (
        event.code === "ArrowUp" ||
        event.code === "ArrowDown" ||
        event.code === "ArrowLeft" ||
        event.code === "ArrowRight"
      ) {
        event.preventDefault();
      }
      this.keys.add(event.code);
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener("click", () => {
      if (!this.pointerLocked && !this.isTouchPrimary()) {
        canvas.requestPointerLock();
      }
    });

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      this.mouseTarget.x = THREE.MathUtils.clamp(nx, -1, 1);
      this.mouseTarget.y = THREE.MathUtils.clamp(ny, -1, 1);

      if (!this.pointerLocked) return;
      this.yaw -= event.movementX * 0.0022;
      this.pitch -= event.movementY * 0.0022;
      this.clampPitch();
      this.applyRotation();
    });

    canvas.addEventListener(
      "touchstart",
      (event) => {
        for (const touch of Array.from(event.changedTouches)) {
          if (touch.clientX > window.innerWidth * 0.45 && this.lookTouchId === null) {
            this.lookTouchId = touch.identifier;
            this.lastLookTouch = { x: touch.clientX, y: touch.clientY };
          }
        }
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchmove",
      (event) => {
        for (const touch of Array.from(event.changedTouches)) {
          if (touch.identifier !== this.lookTouchId) continue;
          const dx = touch.clientX - this.lastLookTouch.x;
          const dy = touch.clientY - this.lastLookTouch.y;
          this.lastLookTouch = { x: touch.clientX, y: touch.clientY };
          this.yaw -= dx * 0.004;
          this.pitch -= dy * 0.004;
          this.clampPitch();
          this.applyRotation();
        }
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchend",
      (event) => {
        for (const touch of Array.from(event.changedTouches)) {
          if (touch.identifier === this.lookTouchId) {
            this.lookTouchId = null;
          }
        }
      },
      { passive: true },
    );

    element.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  bindTouchPad(pad: HTMLElement): void {
    let touchId: number | null = null;
    let origin = { x: 0, y: 0 };

    pad.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        const touch = event.changedTouches[0];
        touchId = touch.identifier;
        origin = { x: touch.clientX, y: touch.clientY };
        this.moveTouch.active = true;
      },
      { passive: false },
    );

    pad.addEventListener(
      "touchmove",
      (event) => {
        event.preventDefault();
        const touch = Array.from(event.changedTouches).find((t) => t.identifier === touchId);
        if (!touch) return;
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        const max = 48;
        this.moveTouch.x = THREE.MathUtils.clamp(dx / max, -1, 1);
        this.moveTouch.y = THREE.MathUtils.clamp(dy / max, -1, 1);
      },
      { passive: false },
    );

    const reset = () => {
      touchId = null;
      this.moveTouch = { x: 0, y: 0, active: false };
    };

    pad.addEventListener("touchend", reset);
    pad.addEventListener("touchcancel", reset);
  }

  requestPointerLock(canvas: HTMLCanvasElement): void {
    if (!this.isTouchPrimary()) {
      canvas.requestPointerLock();
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(delta: number): void {
    const input = this.readInput();

    if (input.turn !== 0) {
      this.yaw -= input.turn * this.turnSpeed * delta;
      this.applyRotation();
    }

    if (input.forward !== 0) {
      const move = new THREE.Vector3(0, 0, -input.forward);
      move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.velocity.copy(move.multiplyScalar(this.moveSpeed * delta));
      this.player.position.add(this.velocity);
    }

    this.constrainToWalkable(this.player.position);

    // Soft cursor parallax (Penderecki manor feel)
    const ease = 1 - Math.exp(-6 * delta);
    this.mouseShift.x += (this.mouseTarget.x - this.mouseShift.x) * ease;
    this.mouseShift.y += (this.mouseTarget.y - this.mouseShift.y) * ease;
    this.applyRotation();

    // Smooth height every frame — no skipped raycasts (those caused forward strobing)
    this.targetEyeY = this.sampleEyeY(this.player.position.x, this.player.position.z);
    const t = 1 - Math.exp(-this.groundFollow * delta);
    this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, this.targetEyeY, t);
  }

  /** Keep the player on the garden footprint (box + circular object bounds). */
  private constrainToWalkable(pos: THREE.Vector3): void {
    pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.min.x, this.bounds.max.x);
    pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.min.z, this.bounds.max.z);

    if (!this.walkCircle) return;
    const dx = pos.x - this.walkCircle.x;
    const dz = pos.z - this.walkCircle.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.walkCircle.radius && dist > 1e-6) {
      const scale = this.walkCircle.radius / dist;
      pos.x = this.walkCircle.x + dx * scale;
      pos.z = this.walkCircle.z + dz * scale;
    }
  }

  getPosition(): THREE.Vector3 {
    return this.player.position.clone();
  }

  getForward(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return forward;
  }

  private sampleEyeY(x: number, z: number): number {
    if (!this.heightField) return this.eyeHeight;
    return this.heightField.sample(x, z) + this.eyeHeight;
  }

  private readInput(): NavigationInput {
    let forward = 0;
    let turn = 0;

    if (this.keys.has("ArrowUp")) forward += 1;
    if (this.keys.has("ArrowDown")) forward -= 1;
    if (this.keys.has("ArrowRight")) turn += 1;
    if (this.keys.has("ArrowLeft")) turn -= 1;

    if (this.moveTouch.active) {
      forward = THREE.MathUtils.clamp(this.moveTouch.y * -1, -1, 1);
      turn = THREE.MathUtils.clamp(this.moveTouch.x, -1, 1);
    }

    return { forward, turn };
  }

  private clampPitch(): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
  }

  private applyRotation(): void {
    this.player.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(
      this.pitch + this.mouseShift.y * this.mouseLookMax.y,
      this.mouseShift.x * this.mouseLookMax.x,
      0,
    );
  }

  private isTouchPrimary(): boolean {
    return window.matchMedia("(pointer: coarse)").matches;
  }
}
