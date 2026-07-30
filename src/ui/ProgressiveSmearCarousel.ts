/** Native rebuild of Framer ProgressiveSmearCarousel (coverflow + edge smear blur). */

import type { CarouselCaption, CarouselSlide } from "../types";

export type ProgressiveSmearCarouselOptions = {
  slides: CarouselSlide[];
  /** Static caption under the active card; does not change while slides cycle. */
  caption?: CarouselCaption;
  /** Center card width used only to derive side/center width ratio. */
  itemWidth?: number;
  itemHeight?: number;
  sideItemWidth?: number;
  gap?: number;
  maxRotation?: number;
  perspective?: number;
  scrollDamping?: number;
  blurSpread?: number;
  blurStrength?: number;
  /** Multiplier: center width = activeHeight * centerScale */
  centerScale?: number;
  /** Fired when the user scrolls or drags the carousel. */
  onUserInteract?: () => void;
  /** Fired when the user clicks without dragging (frustration tap). */
  onFrustrationTap?: () => void;
  /** Fired when the carousel settles on a new center slide. */
  onActiveSlideChange?: () => void;
};

type CardEls = {
  outer: HTMLDivElement;
  inner: HTMLDivElement;
  slide: CarouselSlide;
  iframe: HTMLIFrameElement | null;
  video: HTMLVideoElement | null;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map value through input/output stops (like Framer Motion interpolate). */
function interpolate(value: number, input: number[], output: number[]): number {
  if (value <= input[0]) return output[0];
  if (value >= input[input.length - 1]) return output[output.length - 1];
  for (let i = 0; i < input.length - 1; i++) {
    const i0 = input[i];
    const i1 = input[i + 1];
    if (value >= i0 && value <= i1) {
      const t = (value - i0) / (i1 - i0 || 1);
      return lerp(output[i], output[i + 1], t);
    }
  }
  return output[output.length - 1];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const GESTURE_DRAG_PX = 8;
/** Layout width embeds should render at (desktop site breakpoint). */
const EMBED_DESIGN_WIDTH = 1310;

export class ProgressiveSmearCarousel {
  private readonly root: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly hit: HTMLDivElement;
  private readonly caption: HTMLElement | null;
  private readonly cards: CardEls[] = [];
  private readonly slides: CarouselSlide[];
  private readonly onUserInteract?: () => void;
  private readonly onFrustrationTap?: () => void;
  private readonly onActiveSlideChange?: () => void;

  private readonly itemWidth: number;
  private readonly itemHeightFallback: number;
  private readonly sideItemWidth: number;
  private readonly gap: number;
  private readonly maxRotation: number;
  private readonly perspective: number;
  private readonly damping: number;
  private readonly centerScale: number;

  private scroll = 0;
  private scrollTarget = 0;
  private raf = 0;
  private snapTimer = 0;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerT = 0;
  private pointerVelocity = 0;
  private gestureStartX = 0;
  private gestureMoved = false;
  private lastActiveSlide = 0;
  private destroyed = false;
  private activeWidth = 0;
  private activeHeight = 0;

  constructor(root: HTMLElement, options: ProgressiveSmearCarouselOptions) {
    this.root = root;
    this.itemWidth = options.itemWidth ?? 500;
    this.itemHeightFallback = options.itemHeight ?? 285;
    this.sideItemWidth = options.sideItemWidth ?? 320;
    this.gap = options.gap ?? 64;
    this.maxRotation = options.maxRotation ?? 90;
    this.perspective = options.perspective ?? 400;
    this.damping = options.scrollDamping ?? 100;
    this.centerScale = options.centerScale ?? 1.6;
    this.onUserInteract = options.onUserInteract;
    this.onFrustrationTap = options.onFrustrationTap;
    this.onActiveSlideChange = options.onActiveSlideChange;

    const blurSpread = options.blurSpread ?? 25;
    const blurStrength = options.blurStrength ?? 24;

    // Pad to ≥18 like the Framer component so the loop feels continuous.
    const source = options.slides.filter(Boolean);
    const padded: CarouselSlide[] = [];
    while (padded.length < 18 && source.length > 0) padded.push(...source);
    this.slides = padded.length > 0 ? padded : source;

    this.root.classList.add("smear-carousel");
    this.root.style.perspective = `${Math.max(this.perspective, 1)}px`;

    this.hit = document.createElement("div");
    this.hit.className = "smear-carousel__hit";
    this.root.appendChild(this.hit);

    this.stage = document.createElement("div");
    this.stage.className = "smear-carousel__stage";
    this.root.appendChild(this.stage);

    for (let i = 0; i < this.slides.length; i++) {
      const slide = this.slides[i];
      const outer = document.createElement("div");
      outer.className = "smear-carousel__card";
      const inner = document.createElement("div");
      inner.className = "smear-carousel__card-media";

      let iframe: HTMLIFrameElement | null = null;
      let video: HTMLVideoElement | null = null;
      if (slide.kind === "image") {
        inner.style.backgroundImage = `url(${slide.src})`;
      } else if (slide.kind === "video") {
        inner.classList.add("smear-carousel__card-media--video");
        video = document.createElement("video");
        video.className = "smear-carousel__card-video";
        video.src = slide.src;
        if (slide.poster) video.poster = slide.poster;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.preload = "metadata";
        inner.appendChild(video);
      } else {
        inner.classList.add("smear-carousel__card-media--embed");
        iframe = document.createElement("iframe");
        iframe.className = "smear-carousel__card-embed";
        iframe.title = slide.title ?? "Project embed";
        iframe.setAttribute("loading", "lazy");
        iframe.setAttribute("tabindex", "-1");
        iframe.setAttribute("referrerpolicy", "no-referrer");
        iframe.setAttribute("aria-hidden", "true");
        inner.appendChild(iframe);
      }

      outer.appendChild(inner);
      this.stage.appendChild(outer);
      this.cards.push({ outer, inner, slide, iframe, video });
    }

    this.caption = options.caption ? this.buildCaption(options.caption) : null;
    if (this.caption) this.root.appendChild(this.caption);

    const leftBlur = document.createElement("div");
    leftBlur.className = "smear-carousel__edge smear-carousel__edge--left";
    leftBlur.style.width = `${blurSpread}%`;
    leftBlur.style.setProperty("--smear-blur", `${blurStrength}px`);
    this.root.appendChild(leftBlur);

    const rightBlur = document.createElement("div");
    rightBlur.className = "smear-carousel__edge smear-carousel__edge--right";
    rightBlur.style.width = `${blurSpread}%`;
    rightBlur.style.setProperty("--smear-blur", `${blurStrength}px`);
    this.root.appendChild(rightBlur);

    this.bind();
    this.layout();
    this.start();
  }

  /** Active (center) card size in CSS pixels. */
  getActiveCardSize(): { width: number; height: number } {
    return { width: this.activeWidth, height: this.activeHeight };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.snapTimer);
    this.unbind();
    this.root.replaceChildren();
    this.cards.length = 0;
  }

  private buildCaption(caption: CarouselCaption): HTMLElement {
    const el = document.createElement("div");
    el.className = "smear-carousel__caption";

    const title = document.createElement("p");
    title.className = "smear-carousel__caption-title";
    title.textContent = caption.title;

    const description = document.createElement("p");
    description.className = "smear-carousel__caption-description";
    description.textContent = caption.description;

    const category = document.createElement("p");
    category.className = "smear-carousel__caption-category";
    category.textContent = caption.category;

    el.append(title, description, category);
    return el;
  }

  private bind(): void {
    this.hit.addEventListener("wheel", this.onWheel, { passive: false });
    this.hit.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("resize", this.onResize);
  }

  private unbind(): void {
    this.hit.removeEventListener("wheel", this.onWheel);
    this.hit.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("resize", this.onResize);
  }

  private onResize = (): void => {
    this.layout();
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.onUserInteract?.();
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY * 0.8;
    this.scrollTarget += delta * 0.004;
    this.queueSnap();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.dragging = true;
    this.gestureStartX = event.clientX;
    this.gestureMoved = false;
    this.lastPointerX = event.clientX;
    this.lastPointerT = performance.now();
    this.pointerVelocity = 0;
    this.hit.setPointerCapture?.(event.pointerId);
    this.hit.style.cursor = "grabbing";
    window.clearTimeout(this.snapTimer);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    if (!this.gestureMoved && Math.abs(event.clientX - this.gestureStartX) > GESTURE_DRAG_PX) {
      this.gestureMoved = true;
      this.onUserInteract?.();
    }
    const now = performance.now();
    const dx = event.clientX - this.lastPointerX;
    const dt = Math.max(1, now - this.lastPointerT);
    this.pointerVelocity = (-dx / dt) * 1000;
    this.scrollTarget += -dx * 0.005;
    this.lastPointerX = event.clientX;
    this.lastPointerT = now;
  };

  private onPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.hit.style.cursor = "grab";
    if (!this.gestureMoved) {
      this.onFrustrationTap?.();
    }
    this.scrollTarget += -this.pointerVelocity * 0.0015;
    this.scrollTarget = Math.round(this.scrollTarget);
  };

  private queueSnap(): void {
    window.clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(() => {
      this.scrollTarget = Math.round(this.scrollTarget);
    }, 150);
  }

  private start(): void {
    let last = performance.now();
    const tick = (now: number): void => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(tick);

      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;
      if (dt === 0) return;

      const lambda = Math.max(6, Math.min(20, 1400 / Math.max(40, this.damping)));
      const t = 1 - Math.exp(-lambda * dt);
      this.scroll += (this.scrollTarget - this.scroll) * t;

      if (Math.abs(this.scroll - this.scrollTarget) < 0.001) {
        this.scroll = this.scrollTarget;
      }

      const span = this.slides.length;
      if (span > 0 && Math.abs(this.scroll) > span * 8) {
        const wrap = ((this.scroll % span) + span) % span;
        const delta = this.scroll - wrap;
        this.scroll = wrap;
        this.scrollTarget -= delta;
      }

      this.layout();
      this.reportActiveSlideIfSettled();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private reportActiveSlideIfSettled(): void {
    if (Math.abs(this.scroll - this.scrollTarget) > 0.05) return;
    const active = Math.round(this.scroll);
    if (active === this.lastActiveSlide) return;
    this.lastActiveSlide = active;
    this.onActiveSlideChange?.();
  }

  private layout(): void {
    const total = this.slides.length;
    if (total === 0) return;

    const vh = window.innerHeight || this.itemHeightFallback;
    // Taller center card so live embeds (e.g. undrmnd at 1310 design width) stay readable.
    const activeH = vh > 0 ? (vh * 70) / 100 : this.itemHeightFallback;
    const activeW = Math.min(1310, activeH * this.centerScale);
    const sideRatio = this.sideItemWidth / this.itemWidth;
    const sideW = activeW * sideRatio;
    const sideH = activeH * sideRatio;

    this.activeWidth = activeW;
    this.activeHeight = activeH;

    // Keep card + caption optically centered as a unit.
    const captionH = this.caption?.offsetHeight ?? 0;
    const captionGap = this.caption ? 16 : 0;
    const stackOffset = this.caption ? (captionH + captionGap) / 2 : 0;
    this.stage.style.transform = `translateY(${-stackOffset}px)`;

    for (let index = 0; index < this.cards.length; index++) {
      let d = ((index - this.scroll) % total + total) % total;
      if (d > total / 2) d -= total;
      const abs = Math.abs(d);
      const sign = Math.sign(d) || 0;

      const width = interpolate(clamp01(abs), [0, 1], [activeW, sideW]);
      const height = interpolate(clamp01(abs), [0, 1], [activeH, sideH]);
      const marginLeft = -width / 2;
      const marginTop = -height / 2;

      const r = activeW / 2 + this.gap + sideW / 2;
      const a = sideW + this.gap;
      let x = 0;
      if (abs === 0) x = 0;
      else if (abs <= 1) x = sign * r * abs;
      else x = sign * (r + (abs - 1) * a * 0.85);

      const z = -abs * 200;
      const rotateY = sign * Math.min(abs * 35, this.maxRotation);
      const zIndex = 1000 - Math.round(abs * 10);
      const opacity = interpolate(abs, [0, 5, 7], [1, 1, 0]);

      const { outer, inner, iframe, video, slide } = this.cards[index];
      outer.style.marginLeft = `${marginLeft}px`;
      outer.style.marginTop = `${marginTop}px`;
      outer.style.width = `${width}px`;
      outer.style.height = `${height}px`;
      outer.style.zIndex = String(zIndex);
      outer.style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${rotateY}deg)`;
      inner.style.opacity = String(opacity);

      // Load embeds only when near the center card to keep the overlay light.
      if (iframe && slide.kind === "embed") {
        const scale = width / EMBED_DESIGN_WIDTH;
        iframe.style.width = `${EMBED_DESIGN_WIDTH}px`;
        iframe.style.height = `${height / scale}px`;
        iframe.style.transform = `scale(${scale})`;
        iframe.style.transformOrigin = "top left";
        if (abs < 1.25 && !iframe.src) {
          iframe.src = slide.src;
        }
      }

      if (video) {
        if (abs < 0.55) {
          const play = video.play();
          if (play && typeof play.catch === "function") play.catch(() => {});
        } else if (!video.paused) {
          video.pause();
        }
      }
    }

    if (this.caption) {
      this.caption.style.width = `${activeW}px`;
      this.caption.style.top = `calc(50% + ${activeH / 2 - stackOffset + captionGap}px)`;
    }
  }
}
