import { getPortfolioById } from "./data/portfolio";
import { GardenScene } from "./garden/GardenScene";
import type { InspectionPoint } from "./garden/InspectionPoint";
import { LightRays } from "./ui/LightRays";
import { PortfolioPanel } from "./ui/PortfolioPanel";

async function main(): Promise<void> {
  const canvas = document.getElementById("garden-canvas") as HTMLCanvasElement;
  const raysCanvas = document.getElementById("light-rays") as HTMLCanvasElement;
  const cssRoot = document.getElementById("css3d-root") as HTMLElement;
  const app = document.getElementById("app")!;
  const loadStatus = document.getElementById("load-status") as HTMLElement;
  const controlsBar = document.getElementById("controls-bar") as HTMLElement;
  const helpToggle = document.getElementById("help-toggle") as HTMLButtonElement;
  const touchControls = document.getElementById("touch-controls") as HTMLElement;
  const movePad = document.getElementById("move-pad") as HTMLElement;

  new LightRays(raysCanvas);
  const panel = new PortfolioPanel();

  let garden: GardenScene;
  try {
    garden = await GardenScene.create(canvas, cssRoot, (message) => {
      loadStatus.hidden = false;
      loadStatus.textContent = message;
    });
  } catch (error) {
    loadStatus.hidden = false;
    loadStatus.textContent = "Could not load garden";
    console.error(error);
    return;
  }

  const openPoint = (point: InspectionPoint): void => {
    const item = getPortfolioById(point.data.portfolioId) ?? point.item;
    garden.navigation.exitPointerLock();
    panel.show(item);
  };

  garden.setOnInspect(openPoint);
  garden.bindControls(app, canvas, movePad);
  loadStatus.hidden = true;

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) {
    touchControls.hidden = false;
  }

  const openActivePortfolio = (): void => {
    const point = garden.getActivePoint();
    if (!point) return;
    openPoint(point);
  };

  panel.setOnClose(() => {
    if (!isTouch) {
      garden.navigation.requestPointerLock(canvas);
    }
  });

  const tick = (): void => {
    garden.update();
    requestAnimationFrame(tick);
  };

  garden.start();
  requestAnimationFrame(tick);

  helpToggle.addEventListener("click", () => {
    const collapsed = controlsBar.classList.toggle("is-collapsed");
    helpToggle.textContent = collapsed ? "Show controls" : "Hide controls";
    helpToggle.setAttribute("aria-expanded", String(!collapsed));
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE") {
      openActivePortfolio();
    }
    if (event.code === "Escape" && panel.isOpen) {
      panel.hide();
    }
  });

  canvas.addEventListener("click", (event) => {
    if (panel.isOpen) return;
    if (isTouch && garden.getActivePoint()) {
      openActivePortfolio();
      event.preventDefault();
    }
  });

  window.addEventListener("resize", () => garden.resize());
}

main();
