import * as THREE from "three";
import type { InspectionPointData, PortfolioItem } from "../types";

export const INTERACT_RADIUS = 3.2;
/** World size matching the former CSS3D card (200×125px × 0.012). */
const CARD_W = 2.4;
const CARD_H = 1.5;
const FLOAT_HEIGHT = 1.35;
const TEX_W = 400;
const TEX_H = 250;

export class InspectionPoint {
  readonly data: InspectionPointData;
  readonly item: PortfolioItem;
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly pickTarget: THREE.Object3D;

  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private thumbnailHidden = false;
  private baseOpacity = 0.72;

  constructor(data: InspectionPointData, item: PortfolioItem) {
    this.data = data;
    this.item = item;
    this.group = new THREE.Group();
    this.group.position.set(...data.position);

    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.drawCard(null);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.needsUpdate = true;

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      opacity: this.baseOpacity,
      // Bias slightly toward camera so cards nest cleanly among dense particles.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), this.material);
    this.mesh.name = `project-card-${data.id}`;
    this.mesh.position.y = FLOAT_HEIGHT;
    this.mesh.renderOrder = 2;
    this.mesh.userData.inspectionPoint = this;

    this.group.add(this.mesh);
    this.pickTarget = this.mesh;

    this.loadImage(item.image);
  }

  /** Hide the garden thumbnail while its project overlay is open. */
  setThumbnailVisible(visible: boolean): void {
    this.thumbnailHidden = !visible;
    this.mesh.visible = visible;
    if (!visible) {
      this.material.opacity = 0;
    }
  }

  update(elapsed: number, playerPosition: THREE.Vector3, camera: THREE.Camera): boolean {
    const distance = this.group.position.distanceTo(playerPosition);
    const active = distance <= INTERACT_RADIUS;

    // Soft float + face the camera (billboard)
    this.mesh.position.y = FLOAT_HEIGHT + Math.sin(elapsed * 1.2 + this.group.position.x) * 0.06;
    this.mesh.quaternion.copy(camera.quaternion);

    if (!this.thumbnailHidden) {
      this.baseOpacity = active ? 1 : distance < INTERACT_RADIUS * 2.2 ? 0.9 : 0.78;
      this.material.opacity = this.baseOpacity;
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
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const w = TEX_W;
    const h = TEX_H;
    const pad = 20;
    const mediaBottom = 44;
    const radius = 8;

    ctx.clearRect(0, 0, w, h);

    // Frame
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // Media well
    const mx = pad;
    const my = pad;
    const mw = w - pad * 2;
    const mh = h - pad - mediaBottom;
    ctx.save();
    roundRect(ctx, mx, my, mw, mh, radius);
    ctx.clip();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(mx, my, mw, mh);
    if (image) {
      drawCover(ctx, image, mx, my, mw, mh);
    }
    ctx.restore();

    // Meta
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.font = "700 20px degular, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const metaY = h - mediaBottom / 2 - 2;
    const title = this.item.title.toUpperCase();
    ctx.fillText(title, pad, metaY, mw * 0.72);

    ctx.font = "400 20px degular, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(this.item.year ?? "", w - pad, metaY);
    ctx.textAlign = "left";
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
