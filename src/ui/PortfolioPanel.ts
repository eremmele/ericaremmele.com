import type { PortfolioItem } from "../types";
import { ProgressiveSmearCarousel } from "./ProgressiveSmearCarousel";

const HINT_INITIAL_IDLE_MS = 4000;
const HINT_REPEAT_IDLE_MS = 10000;
const FRUSTRATION_CLICKS = 3;
const FRUSTRATION_WINDOW_MS = 1200;

export class PortfolioPanel {
  private readonly panel: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly escButton: HTMLButtonElement;
  private readonly dragHint: HTMLElement;
  private readonly scrollHint: HTMLElement;
  private carousel: ProgressiveSmearCarousel | null = null;
  private onClose?: () => void;
  private onOpenChange?: (open: boolean) => void;
  private idleHintTimer: number | null = null;
  private hintPhase: "initial" | "repeat" = "initial";
  private frustrationClickTimes: number[] = [];
  private scrollHintVisible = false;
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.scrollHintVisible) return;
    const overChrome = event.target instanceof Element && Boolean(event.target.closest(".portfolio-close, .portfolio-esc"));
    this.scrollHint.classList.toggle("is-hidden", overChrome);
    if (!overChrome) this.updateScrollHintPosition(event.clientX, event.clientY);
  };

  constructor() {
    this.panel = document.getElementById("portfolio-panel")!;
    this.mount = document.getElementById("portfolio-carousel")!;
    this.closeButton = document.getElementById("portfolio-close") as HTMLButtonElement;
    this.escButton = document.getElementById("portfolio-esc") as HTMLButtonElement;
    this.dragHint = document.getElementById("portfolio-drag-hint")!;
    this.scrollHint = document.getElementById("portfolio-scroll-hint")!;

    this.closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.hide();
    });
    this.escButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.hide();
    });
    this.panel.addEventListener("click", (event) => {
      if (event.target === this.panel) this.hide();
    });
    this.dragHint.addEventListener("animationend", (event) => {
      if (event.animationName !== "portfolio-hint-flash") return;
      this.dragHint.classList.remove("is-flashing");
    });
    this.panel.addEventListener("pointermove", this.onPointerMove);
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  setOnOpenChange(callback: (open: boolean) => void): void {
    this.onOpenChange = callback;
  }

  show(item: PortfolioItem): void {
    this.carousel?.destroy();
    this.mount.replaceChildren();
    this.hintPhase = "initial";
    this.frustrationClickTimes = [];
    this.clearIdleHintTimer();

    this.carousel = new ProgressiveSmearCarousel(this.mount, {
      slides: item.carouselSlides,
      caption: {
        title: item.title,
        description: item.description,
        category: item.category,
      },
      onUserInteract: () => this.onCarouselInteract(),
      onFrustrationTap: () => this.registerFrustrationClick(),
    });
    this.panel.hidden = false;
    this.setScrollHintVisible(true);
    this.scheduleIdleHintFlash();
    this.onOpenChange?.(true);
  }

  hide(): void {
    this.panel.hidden = true;
    this.clearIdleHintTimer();
    this.dragHint.classList.remove("is-flashing");
    this.setScrollHintVisible(false);
    this.carousel?.destroy();
    this.carousel = null;
    this.mount.replaceChildren();
    this.onOpenChange?.(false);
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  private scheduleIdleHintFlash(): void {
    this.clearIdleHintTimer();
    const delay = this.hintPhase === "initial" ? HINT_INITIAL_IDLE_MS : HINT_REPEAT_IDLE_MS;
    this.idleHintTimer = window.setTimeout(() => {
      this.idleHintTimer = null;
      this.flashDragHint();
      this.hintPhase = "repeat";
      this.scheduleIdleHintFlash();
    }, delay);
  }

  private clearIdleHintTimer(): void {
    if (this.idleHintTimer !== null) {
      window.clearTimeout(this.idleHintTimer);
      this.idleHintTimer = null;
    }
  }

  private onCarouselInteract(): void {
    this.frustrationClickTimes = [];
    this.setScrollHintVisible(false);
    this.resetIdleHintTimer();
  }

  private resetIdleHintTimer(): void {
    this.scheduleIdleHintFlash();
  }

  private registerFrustrationClick(): void {
    const now = performance.now();
    this.frustrationClickTimes = this.frustrationClickTimes.filter(
      (t) => now - t < FRUSTRATION_WINDOW_MS,
    );
    this.frustrationClickTimes.push(now);
    if (this.frustrationClickTimes.length >= FRUSTRATION_CLICKS) {
      this.frustrationClickTimes = [];
      this.hintPhase = "repeat";
      this.flashDragHint();
      this.resetIdleHintTimer();
    }
  }

  private flashDragHint(): void {
    this.dragHint.classList.remove("is-flashing");
    // Retrigger CSS animation if the class was already present.
    void this.dragHint.offsetWidth;
    this.dragHint.classList.add("is-flashing");
  }

  private setScrollHintVisible(visible: boolean): void {
    this.scrollHintVisible = visible;
    this.scrollHint.classList.toggle("is-hidden", !visible);
    this.panel.classList.toggle("is-scroll-cursor", visible);
    if (!visible) {
      this.scrollHint.style.left = "";
      this.scrollHint.style.top = "";
      return;
    }
    const rect = this.mount.getBoundingClientRect();
    this.updateScrollHintPosition(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  }

  private updateScrollHintPosition(clientX: number, clientY: number): void {
    this.scrollHint.style.left = `${clientX}px`;
    this.scrollHint.style.top = `${clientY}px`;
  }
}
