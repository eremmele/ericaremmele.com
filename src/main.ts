import { getPortfolioById } from "./data/portfolio";
import { GardenScene } from "./garden/GardenScene";
import type { InspectionPoint } from "./garden/InspectionPoint";
import { LightRays } from "./ui/LightRays";
import { PortfolioPanel } from "./ui/PortfolioPanel";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

function bindHoldKeyButton(button: HTMLButtonElement, code: string, onChange: (code: string, pressed: boolean) => void): void {
  const release = (): void => onChange(code, false);

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onChange(code, true);
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

async function main(): Promise<void> {
  const canvas = document.getElementById("garden-canvas") as HTMLCanvasElement;
  const raysCanvas = document.getElementById("light-rays") as HTMLCanvasElement;
  const cssRoot = document.getElementById("css3d-root") as HTMLElement;
  const app = document.getElementById("app")!;
  const loadStatus = document.getElementById("load-status") as HTMLElement;
  const controlsBar = document.getElementById("controls-bar") as HTMLElement;
  const controlsHide = document.getElementById("controls-hide") as HTMLButtonElement;
  const touchControls = document.getElementById("touch-controls") as HTMLElement;
  const movePad = document.getElementById("move-pad") as HTMLElement;

  let turnRight: ((steps: number) => void) | null = null;

  // Bind before garden load so nav clicks never fall through to hash navigation.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>(".hero-view-link[data-turn-right]");
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    if (!turnRight) return;
    const steps = Number(link.dataset.turnRight);
    turnRight(Number.isFinite(steps) ? steps : 16);
  });

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

  turnRight = (steps) => garden.navigation.animateTurnRightSteps(steps);

  const openPoint = (point: InspectionPoint, closeOnLeave: boolean): void => {
    const item = getPortfolioById(point.data.portfolioId) ?? point.item;
    openProximityId = point.data.id;
    closeOverlayOnLeave = closeOnLeave;
    garden.setOverlayProjectId(point.data.id);
    panel.show(item);
  };

  garden.setOnInspect((point) => openPoint(point, false));
  garden.bindControls(app, canvas, movePad);
  loadStatus.hidden = true;

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) {
    touchControls.hidden = false;
  }

  const openActivePortfolio = (): void => {
    const point = garden.getActivePoint();
    if (!point) return;
    openPoint(point, true);
  };

  const openProjectByNumber = (n: number): void => {
    const point = garden.getPointByNumber(n);
    if (!point) return;
    openPoint(point, false);
  };

  const setControlsCollapsed = (collapsed: boolean): void => {
    controlsBar.classList.toggle("is-collapsed", collapsed);
    controlsHide.setAttribute("aria-expanded", String(!collapsed));
    controlsHide.setAttribute("aria-label", collapsed ? "Show controls (H)" : "Hide controls (H)");
  };

  let lastProximityId: string | null = null;
  let openProximityId: string | null = null;
  let closeOverlayOnLeave = false;

  panel.setOnOpenChange((open) => {
    if (!open) {
      garden.setOverlayProjectId(null);
      openProximityId = null;
      closeOverlayOnLeave = false;
    }
  });

  const tick = (): void => {
    garden.update();
    const active = garden.getActivePoint();
    const id = active?.data.id ?? null;

    if (
      panel.isOpen &&
      closeOverlayOnLeave &&
      openProximityId &&
      !garden.isPointWithinInteractRadius(openProximityId, 1.05)
    ) {
      panel.hide();
    }

    if (active && id !== lastProximityId && !panel.isOpen) {
      openPoint(active, true);
    }

    lastProximityId = id;
    requestAnimationFrame(tick);
  };

  garden.start();
  requestAnimationFrame(tick);

  controlsHide.addEventListener("click", () => {
    setControlsCollapsed(!controlsBar.classList.contains("is-collapsed"));
  });

  document.querySelectorAll<HTMLButtonElement>(".controls-left .arrow-key[data-key]").forEach((button) => {
    const code = button.dataset.key;
    if (!code) return;
    bindHoldKeyButton(button, code, (key, pressed) => {
      garden.navigation.setKeyPressed(key, pressed);
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".project-key[data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const n = Number(button.dataset.project);
      if (Number.isFinite(n)) openProjectByNumber(n);
      button.blur();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === "KeyH") {
      setControlsCollapsed(!controlsBar.classList.contains("is-collapsed"));
    }
    if (event.code === "KeyE") {
      openActivePortfolio();
    }
    if (event.code === "Escape" && panel.isOpen) {
      panel.hide();
    }
    if (event.code === "KeyX" && panel.isOpen) {
      event.preventDefault();
      panel.hide();
    }

    const digit = /^Digit([1-5])$/.exec(event.code)?.[1] ?? /^Numpad([1-5])$/.exec(event.code)?.[1];
    if (digit) {
      event.preventDefault();
      openProjectByNumber(Number(digit));
    }
  });

  window.addEventListener("blur", () => {
    for (const code of ARROW_KEYS) {
      garden.navigation.setKeyPressed(code, false);
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
