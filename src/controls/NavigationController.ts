import * as THREE from "three";
import type { HeightField } from "./HeightField";

export type NavigationInput = {
  forward: number;
  turn: number;
};

export class NavigationController {
  readonly camera: THREE.PerspectiveCamera;
  readonly player: THREE.Object3D;
  private static readonly INITIAL_RIGHT_ARROW_STEPS = 16;
  private static readonly KEYBOARD_STEP_FPS = 60;

  private yaw = 0;
  private pitch = 0;
  /** Smoothed planar velocity (units/sec) — accel/decel instead of binary on/off. */
  private readonly planarVel = new THREE.Vector3();
  private turnRate = 0;
  private readonly moveSpeed = 7.4;
  private readonly turnSpeed = 2.35;
  /** How quickly planar velocity catches desired input (higher = snappier). */
  private readonly moveAccel = 22;
  private readonly moveDecel = 26;
  private readonly turnAccel = 18;
  private readonly turnDecel = 22;
  private readonly eyeHeight = 1.65;
  private readonly groundFollow = 28;
  private readonly heightSmooth = 22;
  private bounds: THREE.Box3;
  private heightField: HeightField | null = null;
  private walkCircle: { x: number; z: number; radius: number } | null = null;
  private targetEyeY = 1.65;
  private readonly keys = new Set<string>();
  private lookTouchId: number | null = null;
  private lastLookTouch = { x: 0, y: 0 };
  private moveTouch = { x: 0, y: 0, active: false };
  /** Desktop click-drag virtual stick (separate from on-screen pad). */
  private dragMoveId: number | null = null;
  /** Penderecki-style soft look-around from cursor (no lock required). */
  private mouseTarget = { x: 0, y: 0 };
  private mouseShift = { x: 0, y: 0 };
  private readonly mouseLookMax = { x: 0.12, y: 0.07 };
  private readonly _wishDir = new THREE.Vector3();
  private readonly _desiredVel = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private turnAnim: {
    startYaw: number;
    deltaYaw: number;
    startedAt: number;
    durationMs: number;
  } | null = null;

  constructor(aspect: number, bounds: THREE.Box3) {
    this.bounds = bounds;
    // Tighter near plane + log depth elsewhere reduces forward-motion z flicker
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.2, 200);
    this.player = new THREE.Object3D();
    this.player.add(this.camera);
    this.player.position.set(0, this.eyeHeight, 6);
    this.yaw = Math.PI;
    this.yaw -=
      (this.turnSpeed / NavigationController.KEYBOARD_STEP_FPS) *
      NavigationController.INITIAL_RIGHT_ARROW_STEPS;
    this.applyRotation();
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

    canvas.addEventListener("mousemove", (event) => {
      if (this.moveTouch.active || this.lookTouchId !== null || this.dragMoveId !== null) return;
      const rect = canvas.getBoundingClientRect();
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      this.mouseTarget.x = THREE.MathUtils.clamp(nx, -1, 1);
      this.mouseTarget.y = THREE.MathUtils.clamp(ny, -1, 1);
    });

    // Desktop: click-hold-drag anywhere on the garden to move (virtual stick).
    this.bindCanvasDragMove(canvas);

    // Look: finger on the garden (joystick is a separate DOM control).
    canvas.addEventListener(
      "touchstart",
      (event) => {
        for (const touch of Array.from(event.changedTouches)) {
          if (this.lookTouchId !== null) continue;
          if (this.isOverMoveChrome(touch.clientX, touch.clientY)) continue;
          this.lookTouchId = touch.identifier;
          this.lastLookTouch = { x: touch.clientX, y: touch.clientY };
          this.mouseTarget.x = 0;
          this.mouseTarget.y = 0;
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
          // Slightly softer than before so aiming feels controllable one-handed.
          this.yaw -= dx * 0.0032;
          this.pitch -= dy * 0.0026;
          this.clampPitch();
          this.applyRotation();
        }
      },
      { passive: true },
    );

    const endLook = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    canvas.addEventListener("touchend", endLook, { passive: true });
    canvas.addEventListener("touchcancel", endLook, { passive: true });

    element.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  setKeyPressed(code: string, pressed: boolean): void {
    if (pressed) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Instant yaw equal to holding → for `steps` frames at 60fps. */
  turnRightSteps(steps = NavigationController.INITIAL_RIGHT_ARROW_STEPS): void {
    this.turnAnim = null;
    this.yaw -= (this.turnSpeed / NavigationController.KEYBOARD_STEP_FPS) * steps;
    this.applyRotation();
  }

  /** Animate yaw over time so nav clicks feel like turning right. */
  animateTurnRightSteps(
    steps = NavigationController.INITIAL_RIGHT_ARROW_STEPS,
    durationMs = 700,
  ): void {
    const deltaYaw = (this.turnSpeed / NavigationController.KEYBOARD_STEP_FPS) * steps;
    this.turnAnim = {
      startYaw: this.yaw,
      deltaYaw,
      startedAt: performance.now(),
      durationMs,
    };
    // Cancel residual cursor-look so the click position doesn't jerk the view.
    this.mouseTarget.x = 0;
    this.mouseTarget.y = 0;
  }

  bindTouchPad(pad: HTMLElement): void {
    let touchId: number | null = null;
    let origin = { x: 0, y: 0 };
    const knob = pad.querySelector<HTMLElement>(".move-pad__knob");
    const radius = 42;
    const deadzone = 0.14;

    const setKnob = (nx: number, ny: number): void => {
      if (!knob) return;
      knob.style.transform = `translate(calc(-50% + ${nx * radius}px), calc(-50% + ${ny * radius}px))`;
    };

    const applyStick = (clientX: number, clientY: number): void => {
      const dx = clientX - origin.x;
      const dy = clientY - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, radius);
      const nx = (dx / len) * (clamped / radius);
      const ny = (dy / len) * (clamped / radius);
      setKnob(nx, ny);

      const mag = Math.hypot(nx, ny);
      if (mag < deadzone) {
        this.moveTouch.x = 0;
        this.moveTouch.y = 0;
        return;
      }
      const scale = (mag - deadzone) / (1 - deadzone);
      this.moveTouch.x = (nx / mag) * scale;
      this.moveTouch.y = (ny / mag) * scale;
    };

    const reset = (): void => {
      touchId = null;
      this.moveTouch = { x: 0, y: 0, active: false };
      setKnob(0, 0);
    };

    pad.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.preventDefault();
        pad.setPointerCapture(event.pointerId);
        touchId = event.pointerId;
        const rect = pad.getBoundingClientRect();
        origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.moveTouch.active = true;
        this.mouseTarget.x = 0;
        this.mouseTarget.y = 0;
        applyStick(event.clientX, event.clientY);
      },
      { passive: false },
    );

    pad.addEventListener(
      "pointermove",
      (event) => {
        if (touchId !== event.pointerId) return;
        event.preventDefault();
        applyStick(event.clientX, event.clientY);
      },
      { passive: false },
    );

    pad.addEventListener("pointerup", reset);
    pad.addEventListener("pointercancel", reset);
    pad.addEventListener("lostpointercapture", reset);
  }

  /** Mouse click-hold-drag on the canvas acts as a virtual move stick. */
  private bindCanvasDragMove(canvas: HTMLCanvasElement): void {
    let origin = { x: 0, y: 0 };
    const radius = 80;
    const deadzone = 0.12;

    const applyStick = (clientX: number, clientY: number): void => {
      const dx = clientX - origin.x;
      const dy = clientY - origin.y;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, radius);
      const nx = (dx / len) * (clamped / radius);
      const ny = (dy / len) * (clamped / radius);
      const mag = Math.hypot(nx, ny);
      if (mag < deadzone) {
        this.moveTouch.x = 0;
        this.moveTouch.y = 0;
        return;
      }
      const scale = (mag - deadzone) / (1 - deadzone);
      this.moveTouch.x = (nx / mag) * scale;
      this.moveTouch.y = (ny / mag) * scale;
    };

    const reset = (pointerId: number): void => {
      if (this.dragMoveId !== pointerId) return;
      this.dragMoveId = null;
      this.moveTouch = { x: 0, y: 0, active: false };
    };

    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (window.matchMedia("(pointer: coarse)").matches) return;
      if (document.body.classList.contains("portfolio-open")) return;
      this.dragMoveId = event.pointerId;
      origin = { x: event.clientX, y: event.clientY };
      this.moveTouch = { x: 0, y: 0, active: true };
      this.mouseTarget.x = 0;
      this.mouseTarget.y = 0;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (this.dragMoveId !== event.pointerId) return;
      applyStick(event.clientX, event.clientY);
    });

    canvas.addEventListener("pointerup", (event) => reset(event.pointerId));
    canvas.addEventListener("pointercancel", (event) => reset(event.pointerId));
    canvas.addEventListener("lostpointercapture", (event) => reset(event.pointerId));
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(delta: number): void {
    const dt = Math.max(0, Math.min(delta, 0.05));
    const input = this.readInput();

    if (this.turnAnim) {
      const { startYaw, deltaYaw, startedAt, durationMs } = this.turnAnim;
      const t = Math.min(1, (performance.now() - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const nextYaw = startYaw - deltaYaw * eased;
      const yawDelta = nextYaw - this.yaw;
      this.yaw = nextYaw;
      this.planarVel.applyAxisAngle(NavigationController.UP, yawDelta);
      this.turnRate = 0;
      if (t >= 1) this.turnAnim = null;
    } else {
      const desiredTurn = input.turn * this.turnSpeed;
      const turnLambda = Math.abs(desiredTurn) > Math.abs(this.turnRate) ? this.turnAccel : this.turnDecel;
      const turnEase = 1 - Math.exp(-turnLambda * dt);
      this.turnRate += (desiredTurn - this.turnRate) * turnEase;
      if (Math.abs(this.turnRate) < 1e-4) this.turnRate = 0;
      const yawDelta = -this.turnRate * dt;
      this.yaw += yawDelta;
      this.planarVel.applyAxisAngle(NavigationController.UP, yawDelta);
    }

    // Wish direction in XZ from facing + forward input.
    this._wishDir.set(0, 0, -input.forward);
    this._wishDir.applyAxisAngle(NavigationController.UP, this.yaw);
    this._desiredVel.copy(this._wishDir).multiplyScalar(this.moveSpeed);

    const speedingUp =
      this._desiredVel.lengthSq() > this.planarVel.lengthSq() + 1e-6 ||
      this._desiredVel.dot(this.planarVel) < 0;
    const moveLambda = speedingUp || input.forward !== 0 ? this.moveAccel : this.moveDecel;
    const moveEase = 1 - Math.exp(-moveLambda * dt);
    this.planarVel.x += (this._desiredVel.x - this.planarVel.x) * moveEase;
    this.planarVel.z += (this._desiredVel.z - this.planarVel.z) * moveEase;
    if (this.planarVel.lengthSq() < 1e-6) {
      this.planarVel.x = 0;
      this.planarVel.z = 0;
    } else {
      this.player.position.x += this.planarVel.x * dt;
      this.player.position.z += this.planarVel.z * dt;
    }

    this.constrainToWalkable(this.player.position);

    // Soft cursor parallax — slightly snappier so look doesn't feel lagged.
    const lookEase = 1 - Math.exp(-9 * dt);
    this.mouseShift.x += (this.mouseTarget.x - this.mouseShift.x) * lookEase;
    this.mouseShift.y += (this.mouseTarget.y - this.mouseShift.y) * lookEase;
    this.applyRotation();

    // Sample a bit ahead along motion so height stays underfoot without bobbing.
    const speed = Math.hypot(this.planarVel.x, this.planarVel.z);
    let sampleX = this.player.position.x;
    let sampleZ = this.player.position.z;
    if (speed > 1e-3) {
      const ahead = Math.min(0.4, speed * 0.055);
      sampleX += (this.planarVel.x / speed) * ahead;
      sampleZ += (this.planarVel.z / speed) * ahead;
    }
    const sampledY = this.sampleEyeY(sampleX, sampleZ);
    const heightEase = 1 - Math.exp(-this.heightSmooth * dt);
    this.targetEyeY += (sampledY - this.targetEyeY) * heightEase;
    const followEase = 1 - Math.exp(-this.groundFollow * dt);
    this.player.position.y = THREE.MathUtils.lerp(this.player.position.y, this.targetEyeY, followEase);
  }

  /** Keep the player on the garden footprint (box + circular bounds). */
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
      const stickForward = THREE.MathUtils.clamp(this.moveTouch.y * -1, -1, 1);
      const stickTurn = THREE.MathUtils.clamp(this.moveTouch.x, -1, 1);
      // Desktop click-hold with no drag should not mute arrow keys.
      if (this.dragMoveId !== null) {
        if (stickForward !== 0 || stickTurn !== 0) {
          forward = stickForward;
          turn = stickTurn;
        }
      } else {
        forward = stickForward;
        turn = stickTurn;
      }
    }

    return { forward, turn };
  }

  /** Avoid starting look on the virtual stick / bottom chrome. */
  private isOverMoveChrome(clientX: number, clientY: number): boolean {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const phone = w <= 767;
    if (phone) {
      const cx = w / 2;
      const band = 150;
      return clientY > h - band && Math.abs(clientX - cx) < 90;
    }
    return clientX < Math.min(160, w * 0.32);
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
}
