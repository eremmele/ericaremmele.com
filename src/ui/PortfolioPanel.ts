import type { PortfolioItem } from "../types";

export class PortfolioPanel {
  private readonly panel: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly closeButton: HTMLButtonElement;
  private onClose?: () => void;

  constructor() {
    this.panel = document.getElementById("portfolio-panel")!;
    this.image = document.getElementById("portfolio-image") as HTMLImageElement;
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
    this.image.src = item.image;
    this.image.alt = "";
    this.panel.hidden = false;
  }

  hide(): void {
    this.panel.hidden = true;
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }
}
