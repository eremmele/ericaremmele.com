/**
 * Full-viewport light rays — white, 1px, 20% opacity, soft-light blend.
 */
const ANGLE = (65 * Math.PI) / 180; // steeper than the original 45°
// Canvas alpha is kept at 1.0; overall intensity is controlled via `.light-rays { opacity }`.
const OPACITY = 1.0;
const THICKNESS = 1; // base; per-ray width varies 1–5px at draw time
const DRIFT_PX_PER_SEC = 8;
/** Approximate rays per 1000px of diagonal coverage. */
const DENSITY = 0.055;

export class LightRays {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Offsets along the perpendicular axis, in CSS pixels (stable across resize). */
  private offsets: number[] = [];
  private seedExtent = 0;
  private driftX = 0;
  private lastTs = 0;
  private raf = 0;
  private skipDraw = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for light rays");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.lastTs = 0;
        this.schedule();
      }
    });
    this.schedule();
  }

  private schedule(): void {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame((ts) => this.animate(ts));
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const extent = (w + h) * Math.SQRT1_2 * 2;
    this.ensureOffsets(extent);
    this.draw(w, h, 0);
  }

  private draw(w: number, h: number, tsSec: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(255, 255, 255, ${OPACITY})`;
    ctx.lineCap = "butt";

    const cos = Math.cos(ANGLE);
    const sin = Math.sin(ANGLE);
    // Perpendicular unit vector
    const px = -sin;
    const py = cos;
    // Half-length long enough to cross the full viewport from any offset
    const halfLen = (w + h) * 0.75;
    const cx = w * 0.5 + this.driftX;
    const cy = h * 0.5;

    const wrap = window.innerWidth + window.innerHeight;
    const motionPhase = wrap > 0 ? this.driftX / wrap : 0;

    for (const offset of this.offsets) {
      const ox = cx + px * offset;
      const oy = cy + py * offset;
      // Vary beam width with smooth "random" oscillation (drift + time),
      // tuned to be subtle: 1–3px.
      const phaseA = offset * 0.045 + motionPhase * 8 + tsSec * 0.18;
      const phaseB = offset * 0.013 - motionPhase * 5 - tsSec * 0.12;
      const width01 = (Math.sin(phaseA) + Math.sin(phaseB)) * 0.25 + 0.5; // 0..1
      const lineW = THICKNESS + 2 * width01; // 1..3px
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(ox - cos * halfLen, oy - sin * halfLen);
      ctx.lineTo(ox + cos * halfLen, oy + sin * halfLen);
      ctx.stroke();
    }
  }

  private animate(ts: number): void {
    this.raf = 0;
    if (document.hidden) {
      this.lastTs = 0;
      return;
    }
    if (this.lastTs === 0) this.lastTs = ts;
    const dt = Math.min(0.1, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    this.driftX -= DRIFT_PX_PER_SEC * dt; // right-to-left drift
    const wrap = window.innerWidth + window.innerHeight;
    if (this.driftX <= -wrap) this.driftX += wrap;

    // ~30fps draw — rays are slow-moving ambience, not gameplay-critical.
    this.skipDraw = !this.skipDraw;
    if (!this.skipDraw) {
      this.draw(window.innerWidth, window.innerHeight, ts / 1000);
    }
    this.schedule();
  }
}
