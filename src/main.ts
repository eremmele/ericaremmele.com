import {
  trackCarouselInteracted,
  trackControlsToggled,
  trackGardenFoliageReady,
  trackGardenNavigated,
  trackGardenReady,
  trackHeroViewTurn,
  trackInspectionApproached,
  trackProjectClosed,
  trackProjectOpened,
  type ProjectOpenSource,
} from "./analytics/fullstory";
import { getPortfolioById } from "./data/portfolio";
import { GardenScene } from "./garden/GardenScene";
import type { InspectionPoint } from "./garden/InspectionPoint";
import { LightRays } from "./ui/LightRays";
import { PortfolioPanel } from "./ui/PortfolioPanel";
import type { PortfolioItem } from "./types";

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
  const controlsRight = document.querySelector(".controls-right") as HTMLElement;
  const controlsHide = document.getElementById("controls-hide") as HTMLButtonElement;
  const touchControls = document.getElementById("touch-controls") as HTMLElement;
  const movePad = document.getElementById("move-pad") as HTMLElement;

  let turnRight: ((steps: number) => void) | null = null;
  let openItem: PortfolioItem | null = null;
  let carouselInteracted = false;
  let hasNavigated = false;
  let lastApproachedPointId: string | null = null;

  const markNavigated = (input: string): void => {
    if (hasNavigated) return;
    hasNavigated = true;
    trackGardenNavigated({ input });
  };

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
    const resolved = Number.isFinite(steps) ? steps : 16;
    turnRight(resolved);
    markNavigated("hero_link");
    trackHeroViewTurn({
      steps: resolved,
      label: (link.textContent ?? "").trim(),
    });
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

  const openPoint = (
    point: InspectionPoint,
    closeOnLeave: boolean,
    source: ProjectOpenSource,
  ): void => {
    const item = getPortfolioById(point.data.portfolioId) ?? point.item;
    openProximityId = point.data.id;
    closeOverlayOnLeave = closeOnLeave;
    openItem = item;
    carouselInteracted = false;
    garden.setOverlayProjectId(point.data.id);
    trackProjectOpened({
      projectId: item.id,
      title: item.title,
      category: item.category,
      label: point.data.label,
      pointId: point.data.id,
      source,
    });
    panel.show(item);
  };

  garden.bindControls(app, canvas, movePad);
  garden.navigation.setOnFirstMoveIntent(() => markNavigated("locomotion"));
  loadStatus.hidden = true;

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  trackGardenReady({
    inputMode: isTouch ? "touch" : "desktop",
    foliagePending: true,
  });

  void garden.whenFoliageReady.finally(() => {
    loadStatus.hidden = true;
    loadStatus.textContent = "";
    trackGardenFoliageReady();
  });

  if (isTouch) {
    document.documentElement.classList.add("is-touch");
    document.body.classList.add("is-touch");
    touchControls.hidden = false;
  }

  const openActivePortfolio = (source: ProjectOpenSource): void => {
    const point = garden.getActivePoint();
    if (!point) return;
    openPoint(point, true, source);
  };

  const openProjectByNumber = (n: number, source: ProjectOpenSource): void => {
    const point = garden.getPointByNumber(n);
    if (!point) return;
    openPoint(point, false, source);
  };

  const setControlsCollapsed = (collapsed: boolean): void => {
    controlsBar.classList.toggle("is-collapsed", collapsed);
    document.body.classList.toggle("controls-collapsed", collapsed);
    controlsRight.hidden = collapsed;
    controlsRight.setAttribute("aria-hidden", collapsed ? "true" : "false");
    controlsHide.setAttribute("aria-expanded", String(!collapsed));
    controlsHide.setAttribute("aria-label", collapsed ? "Show controls (H)" : "Hide controls (H)");
    trackControlsToggled({ collapsed });
  };

  let openProximityId: string | null = null;
  let closeOverlayOnLeave = false;

  panel.setOnOpenChange((open, reason) => {
    document.documentElement.classList.toggle("portfolio-open", open);
    document.body.classList.toggle("portfolio-open", open);
    garden.setRenderSuspended(open);
    if (!open) {
      garden.setOverlayProjectId(null);
      openProximityId = null;
      closeOverlayOnLeave = false;
      if (openItem) {
        trackProjectClosed({
          projectId: openItem.id,
          title: openItem.title,
          reason: reason ?? "unknown",
        });
        openItem = null;
      }
    }
  });

  panel.setOnCarouselInteract(() => {
    if (carouselInteracted || !openItem) return;
    carouselInteracted = true;
    trackCarouselInteracted({ projectId: openItem.id, title: openItem.title });
  });

  let raf = 0;
  const tick = (): void => {
    raf = 0;
    if (document.hidden) return;

    garden.update();

    const active = garden.getActivePoint();
    const activeId = active?.data.id ?? null;
    if (activeId && activeId !== lastApproachedPointId && active) {
      lastApproachedPointId = activeId;
      const item = getPortfolioById(active.data.portfolioId) ?? active.item;
      trackInspectionApproached({
        pointId: active.data.id,
        portfolioId: active.data.portfolioId,
        label: active.data.label,
        title: item.title,
      });
    } else if (!activeId) {
      lastApproachedPointId = null;
    }

    if (
      panel.isOpen &&
      closeOverlayOnLeave &&
      openProximityId &&
      !garden.isPointWithinInteractRadius(openProximityId, 1.05)
    ) {
      panel.hide("walk_away");
    }

    raf = requestAnimationFrame(tick);
  };

  const resumeTick = (): void => {
    if (document.hidden || raf) return;
    raf = requestAnimationFrame(tick);
  };

  garden.start();
  resumeTick();
  document.addEventListener("visibilitychange", resumeTick);

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
      if (Number.isFinite(n)) openProjectByNumber(n, "project_button");
      button.blur();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === "KeyH") {
      setControlsCollapsed(!controlsBar.classList.contains("is-collapsed"));
    }
    if (event.code === "KeyE") {
      openActivePortfolio("inspect_key");
    }
    if (event.code === "Escape" && panel.isOpen) {
      panel.hide("escape_key");
    }
    if (event.code === "KeyX" && panel.isOpen) {
      event.preventDefault();
      panel.hide("x_key");
    }

    const digit = /^Digit([1-5])$/.exec(event.code)?.[1] ?? /^Numpad([1-5])$/.exec(event.code)?.[1];
    if (digit) {
      event.preventDefault();
      openProjectByNumber(Number(digit), "hotkey");
    }
  });

  window.addEventListener("blur", () => {
    for (const code of ARROW_KEYS) {
      garden.navigation.setKeyPressed(code, false);
    }
  });

  canvas.addEventListener("click", (event) => {
    if (panel.isOpen) return;
    const hit = garden.pickInspectionPoint(event.clientX, event.clientY);
    if (hit) {
      openPoint(hit, false, "canvas_click");
      event.preventDefault();
      return;
    }
    if (isTouch && garden.getActivePoint()) {
      openActivePortfolio("touch_tap");
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panel.isOpen || event.buttons !== 0) return;
    const hit = garden.pickInspectionPoint(event.clientX, event.clientY);
    canvas.style.cursor = hit ? "pointer" : "crosshair";
  });

  window.addEventListener("resize", () => garden.resize());
}

main();
