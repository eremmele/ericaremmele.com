/**
 * Full-viewport light rays — white, 1px, 20% opacity, soft-light blend.
 */
const ANGLE = (65 * Math.PI) / 180; // steeper than the original 45°
const OPACITY = 0.2;
const THICKNESS = 1;
/** Approximate rays per 1000px of diagonal coverage. */
const DENSITY = 0.055;

export class LightRays {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Offsets along the perpendicular axis, in CSS pixels (stable across resize). */
  private offsets: number[] = [];
  private seedExtent = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for light rays");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private ensureOffsets(extent: number): void {
    if (this.offsets.length > 0 && Math.abs(extent - this.seedExtent) < 80) {
      return;
    }
    this.seedExtent = extent;
    const count = Math.max(24, Math.round(extent * DENSITY));
    const offsets: number[] = [];
    for (let i = 0; i < count; i += 1) {
      // Bias slightly toward clustered shafts (a few closer pairs)
      let t = Math.random();
      if (Math.random() < 0.22) {
        t = Math.min(1, t + (Math.random() - 0.5) * 0.04);
      }
      offsets.push((t - 0.5) * extent);
    }
    offsets.sort((a, b) => a - b);
    this.offsets = offsets;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const extent = (w + h) * Math.SQRT1_2 * 2;
    this.ensureOffsets(extent);
    this.draw(w, h);
  }

  private draw(w: number, h: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(255, 255, 255, ${OPACITY})`;
    ctx.lineWidth = THICKNESS;
    ctx.lineCap = "butt";

    const cos = Math.cos(ANGLE);
    const sin = Math.sin(ANGLE);
    // Perpendicular unit vector
    const px = -sin;
    const py = cos;
    // Half-length long enough to cross the full viewport from any offset
    const halfLen = (w + h) * 0.75;
    const cx = w * 0.5;
    const cy = h * 0.5;

    for (const offset of this.offsets) {
      const ox = cx + px * offset;
      const oy = cy + py * offset;
      ctx.beginPath();
      ctx.moveTo(ox - cos * halfLen, oy - sin * halfLen);
      ctx.lineTo(ox + cos * halfLen, oy + sin * halfLen);
      ctx.stroke();
    }
  }
}
