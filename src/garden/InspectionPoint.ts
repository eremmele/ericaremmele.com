import * as THREE from "three";
import type { InspectionPointData, PortfolioItem } from "../types";

export const INTERACT_RADIUS = 3.2;
/** Start turning to face the player inside this range. */
const FOLLOW_RADIUS = INTERACT_RADIUS * 2.6;
/** World size matching the former CSS3D card (200×125px × 0.012). */
const CARD_W = 2.4;
const CARD_H = 1.5;
/** Sit in the canopy so leaves can depth-occlude the frame. */
const FLOAT_HEIGHT = 1.12;
/** 2× atlas — mipmaps + soft alpha give edge AA without MSAA on the garden pass. */
const TEX_W = 800;
const TEX_H = 500;
const UP = new THREE.Vector3(0, 1, 0);
/** Unlit brightness lift — isolates cards from garden exposure/lights. */
const CARD_BRIGHT = 1.28;

export class InspectionPoint {
  readonly data: InspectionPointData;
  readonly item: PortfolioItem;
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly pickTarget: THREE.Object3D;

  private readonly material: THREE.ShaderMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private thumbnailHidden = false;
  private baseOpacity = 1;
  private readonly restQuat = new THREE.Quaternion();
  private readonly targetQuat = new THREE.Quaternion();
  private readonly _camWorld = new THREE.Vector3();
  /** Reused for soft-edge blit so we don't alloc on every redraw. */
  private readonly bodyCanvas: HTMLCanvasElement = document.createElement("canvas");

  constructor(data: InspectionPointData, item: PortfolioItem) {
    this.data = data;
    this.item = item;
    this.group = new THREE.Group();
    this.group.position.set(...data.position);

    // Rest facing: toward garden origin so distant cards read as placed, not spinning.
    const rdx = -data.position[0];
    const rdz = -data.position[2];
    if (rdx * rdx + rdz * rdz > 0.01) {
      this.restQuat.setFromAxisAngle(UP, Math.atan2(rdx, rdz));
    }
    this.targetQuat.copy(this.restQuat);

    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.drawCard(null);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    // Unlit card + optional test against garden depth texture (edge-blur path
    // clears canvas depth, so hardware depthTest alone can't nest into leaves).
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        opacity: { value: this.baseOpacity },
        bright: { value: CARD_BRIGHT },
        sceneDepth: { value: null },
        useSceneDepth: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform sampler2D sceneDepth;
        uniform float opacity;
        uniform float bright;
        uniform float useSceneDepth;
        uniform vec2 resolution;
        varying vec2 vUv;

        void main() {
          vec4 texel = texture2D(map, vUv);
          if (texel.a < 0.02) discard;

          if (useSceneDepth > 0.5) {
            vec2 screenUv = gl_FragCoord.xy / resolution;
            float gardenZ = texture2D(sceneDepth, screenUv).r;
            // Small bias so coplanar / thin leaves win over the card plane.
            if (gl_FragCoord.z > gardenZ + 0.0002) discard;
          }

          gl_FragColor = vec4(texel.rgb * bright, texel.a * opacity);
        }
      `,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), this.material);
    this.mesh.name = `project-card-${data.id}`;
    this.mesh.position.y = FLOAT_HEIGHT;
    this.mesh.quaternion.copy(this.restQuat);
    this.mesh.renderOrder = 2;
    this.mesh.userData.inspectionPoint = this;

    this.group.add(this.mesh);
    this.pickTarget = this.mesh;

    this.loadImage(item.image);
  }

  /**
   * When edge-blur is on, pass the sharp garden depth texture so cards discard
   * behind leaves. Pass null to rely on the canvas depth buffer (no-blur path).
   */
  setGardenDepth(depth: THREE.Texture | null, drawingBufferSize: THREE.Vector2): void {
    const use = depth ? 1 : 0;
    const u = this.material.uniforms;
    if (u.useSceneDepth.value !== use) u.useSceneDepth.value = use;
    if (u.sceneDepth.value !== depth) u.sceneDepth.value = depth;
    const res = u.resolution.value as THREE.Vector2;
    if (res.x !== drawingBufferSize.x || res.y !== drawingBufferSize.y) {
      res.copy(drawingBufferSize);
    }
  }

  /** Hide the garden thumbnail while its project overlay is open. */
  setThumbnailVisible(visible: boolean): void {
    this.thumbnailHidden = !visible;
    this.mesh.visible = visible;
    if (!visible) {
      this.material.uniforms.opacity.value = 0;
    }
  }

  update(elapsed: number, playerPosition: THREE.Vector3, camera: THREE.Camera): boolean {
    const distance = this.group.position.distanceTo(playerPosition);
    const active = distance <= INTERACT_RADIUS;

    // Soft float
    this.mesh.position.y = FLOAT_HEIGHT + Math.sin(elapsed * 1.2 + this.group.position.x) * 0.06;

    // Near: yaw toward the camera so the card reads head-on (camera is under player).
    // Far: ease back to rest facing. Yaw-only keeps cards upright.
    camera.getWorldPosition(this._camWorld);
    if (distance <= FOLLOW_RADIUS) {
      const dx = this._camWorld.x - this.group.position.x;
      const dz = this._camWorld.z - this.group.position.z;
      if (dx * dx + dz * dz > 1e-6) {
        this.targetQuat.setFromAxisAngle(UP, Math.atan2(dx, dz));
      }
    } else {
      this.targetQuat.copy(this.restQuat);
    }
    this.mesh.quaternion.slerp(this.targetQuat, distance <= FOLLOW_RADIUS ? 0.14 : 0.06);

    if (!this.thumbnailHidden) {
      this.baseOpacity = active ? 1 : distance < INTERACT_RADIUS * 2.2 ? 1 : 0.92;
      this.material.uniforms.opacity.value = this.baseOpacity;
      this.mesh.visible = true;
    }

    return active;
  }

  distanceTo(point: THREE.Vector3): number {
    return this.group.position.distanceTo(point);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  private loadImage(src: string): void {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      this.drawCard(img);
      this.texture.needsUpdate = true;
    };
    img.onerror = () => {
      this.drawCard(null);
      this.texture.needsUpdate = true;
    };
    // Defer off the critical garden path (same idea as the old CSS cards).
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    const start = (): void => {
      img.src = src;
    };
    if (typeof ric === "function") ric(start, { timeout: 1800 });
    else window.setTimeout(start, 400);
  }

  private drawCard(image: CanvasImageSource | null): void {
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const w = TEX_W;
    const h = TEX_H;
    const edge = 3; // transparent fringe for mip/AA soft silhouette
    const pad = 40;
    const mediaBottom = 88;
    // Sharp corners — soft fringe AA doesn't clip a curve the way rounded+strokeRect did.
    const radius = 0;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Soft outer AA: light blur on the silhouette only (keeps type/media crisp enough).
    const body = this.bodyCanvas;
    if (body.width !== w || body.height !== h) {
      body.width = w;
      body.height = h;
    }
    const bctx = body.getContext("2d", { alpha: true });
    if (!bctx) return;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, w, h);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = "high";

    const bx = edge;
    const by = edge;
    const bw = w - edge * 2;
    const bh = h - edge * 2;

    roundRect(bctx, bx, by, bw, bh, radius);
    bctx.fillStyle = "#141414";
    bctx.fill();

    bctx.save();
    roundRect(bctx, bx, by, bw, bh, radius);
    bctx.clip();

    // Border follows the same path as the fill (no strokeRect chopping corners).
    bctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    bctx.lineWidth = 3;
    bctx.lineJoin = "miter";
    roundRect(bctx, bx + 1.5, by + 1.5, bw - 3, bh - 3, radius);
    bctx.stroke();

    // Media well
    const mx = bx + pad;
    const my = by + pad;
    const mw = bw - pad * 2;
    const mh = bh - pad - mediaBottom;
    bctx.save();
    roundRect(bctx, mx, my, mw, mh, radius);
    bctx.clip();
    bctx.fillStyle = "#222222";
    bctx.fillRect(mx, my, mw, mh);
    if (image) {
      bctx.filter = "brightness(1.12) contrast(1.04)";
      drawCover(bctx, image, mx, my, mw, mh);
      bctx.filter = "none";
    }
    bctx.restore();

    // Meta — brighter than before so cards stay readable in the canopy
    bctx.fillStyle = "rgb(198, 198, 198)";
    bctx.font = "700 40px degular, system-ui, sans-serif";
    bctx.textBaseline = "middle";
    const metaY = by + bh - mediaBottom / 2 - 2;
    const title = this.item.title.toUpperCase();
    bctx.fillText(title, mx, metaY, mw * 0.72);

    bctx.font = "400 40px degular, system-ui, sans-serif";
    bctx.textAlign = "right";
    bctx.fillText(this.item.year ?? "", bx + bw - pad, metaY);
    bctx.textAlign = "left";
    bctx.restore();

    // Feather the alpha edge (~1px AA) without blurring interior much
    ctx.filter = "blur(0.85px)";
    ctx.drawImage(body, 0, 0);
    ctx.filter = "none";
    // Re-draw sharp interior inset so type/media stay crisp
    ctx.save();
    roundRect(ctx, bx + 1.25, by + 1.25, bw - 2.5, bh - 2.5, radius);
    ctx.clip();
    ctx.drawImage(body, 0, 0);
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const iw =
    "naturalWidth" in image
      ? (image as HTMLImageElement).naturalWidth || (image as HTMLImageElement).width
      : (image as ImageBitmap).width;
  const ih =
    "naturalHeight" in image
      ? (image as HTMLImageElement).naturalHeight || (image as HTMLImageElement).height
      : (image as ImageBitmap).height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function getNearestPoint(
  points: InspectionPoint[],
  position: THREE.Vector3,
): InspectionPoint | null {
  let nearest: InspectionPoint | null = null;
  let best = Infinity;

  for (const point of points) {
    const distance = point.distanceTo(position);
    if (distance < INTERACT_RADIUS && distance < best) {
      best = distance;
      nearest = point;
    }
  }

  return nearest;
}
