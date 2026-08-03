/**
 * Full-viewport light rays — soft-light shafts over the garden.
 * Offsets are stable across resize so chrome show/hide never reshuffles them.
 * No-ops when the canvas is CSS-hidden (opacity 0) so it costs nothing.
 */
const ANGLE = (65 * Math.PI) / 180;
const OPACITY = 1.0;
const THICKNESS = 1;
const DRIFT_PX_PER_SEC = 8;
const DENSITY = 0.055;

export class LightRays {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Normalized offsets in [-0.5, 0.5] — scaled by extent at draw time. */
  private readonly normOffsets: number[] = [];
  private driftX = 0;
  private lastTs = 0;
  private raf = 0;
  private readonly active: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D context unavailable for light rays");
    this.ctx = ctx;

    // CSS currently sets opacity: 0 — skip the entire RAF loop until re-enabled.
    const cssOpacity = Number.parseFloat(getComputedStyle(canvas).opacity || "1");
    this.active = Number.isFinite(cssOpacity) && cssOpacity > 0.01;
    if (!this.active) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    this.seedOffsets();
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
    if (!this.active || this.raf || document.hidden) return;
    this.raf = requestAnimationFrame((ts) => this.animate(ts));
  }

  private seedOffsets(): void {
    if (this.normOffsets.length > 0) return;
    const count = Math.max(24, Math.round(1200 * DENSITY));
    for (let i = 0; i < count; i += 1) {
      let t = Math.random();
      if (Math.random() < 0.22) {
        t = Math.min(1, t + (Math.random() - 0.5) * 0.04);
      }
      this.normOffsets.push(t - 0.5);
    }
    this.normOffsets.sort((a, b) => a - b);
  }

  resize(): void {
    if (!this.active) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw(w, h, this.lastTs > 0 ? this.lastTs / 1000 : 0);
  }

  private draw(w: number, h: number, tsSec: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = `rgba(255, 255, 255, ${OPACITY})`;
    ctx.lineCap = "butt";

    const cos = Math.cos(ANGLE);
    const sin = Math.sin(ANGLE);
    const px = -sin;
    const py = cos;
    const halfLen = (w + h) * 0.75;
    const cx = w * 0.5 + this.driftX;
    const cy = h * 0.5;
    const extent = (w + h) * Math.SQRT1_2 * 2;
    const wrap = w + h;
    const motionPhase = wrap > 0 ? this.driftX / wrap : 0;

    for (const norm of this.normOffsets) {
      const offset = norm * extent;
      const ox = cx + px * offset;
      const oy = cy + py * offset;
      const phaseA = offset * 0.045 + motionPhase * 8 + tsSec * 0.18;
      const phaseB = offset * 0.013 - motionPhase * 5 - tsSec * 0.12;
      const width01 = (Math.sin(phaseA) + Math.sin(phaseB)) * 0.25 + 0.5;
      ctx.lineWidth = THICKNESS + 2 * width01;
      ctx.beginPath();
      ctx.moveTo(ox - cos * halfLen, oy - sin * halfLen);
      ctx.lineTo(ox + cos * halfLen, oy + sin * halfLen);
      ctx.stroke();
    }
  }

  private animate(ts: number): void {
    this.raf = 0;
    if (!this.active || document.hidden) {
      this.lastTs = 0;
      return;
    }
    if (this.lastTs === 0) this.lastTs = ts;
    const dt = Math.min(0.1, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    this.driftX -= DRIFT_PX_PER_SEC * dt;
    const wrap = window.innerWidth + window.innerHeight;
    if (wrap > 0) {
      if (this.driftX <= -wrap) this.driftX += wrap;
      else if (this.driftX > 0) this.driftX -= wrap;
    }

    this.draw(window.innerWidth, window.innerHeight, ts / 1000);
    this.schedule();
  }
}
