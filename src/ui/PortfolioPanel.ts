import type { PortfolioItem } from "../types";
import { ProgressiveSmearCarousel } from "./ProgressiveSmearCarousel";

export class PortfolioPanel {
  private readonly panel: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private carousel: ProgressiveSmearCarousel | null = null;
  private onClose?: () => void;

  constructor() {
    this.panel = document.getElementById("portfolio-panel")!;
    this.mount = document.getElementById("portfolio-carousel")!;
    this.closeButton = document.getElementById("portfolio-close") as HTMLButtonElement;

    this.closeButton.addEventListener("click", () => this.hide());
    this.panel.addEventListener("click", (event) => {
      if (event.target === this.panel) this.hide();
    });
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  show(item: PortfolioItem): void {
    this.carousel?.destroy();
    this.mount.replaceChildren();
    this.carousel = new ProgressiveSmearCarousel(this.mount, {
      images: item.carouselImages,
      caption: {
        title: item.title,
        description: item.description,
        category: item.category,
      },
    });
    this.panel.hidden = false;
  }

  hide(): void {
    this.panel.hidden = true;
    this.carousel?.destroy();
    this.carousel = null;
    this.mount.replaceChildren();
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }
}
