import {
  trackCarouselInteracted,
  trackControlsToggled,
  trackGardenFoliageReady,
  trackGardenLoadFailed,
  trackGardenNavigated,
  trackGardenReady,
  trackHeroViewTurn,
  trackInspectionApproached,
  trackProjectClosed,
} from "./analytics/fullstory";
import { getPortfolioById } from "./data/portfolio";
import { GardenScene } from "./garden/GardenScene";
import { LightRays } from "./ui/LightRays";
import { PortfolioPanel } from "./ui/PortfolioPanel";
import type { PortfolioItem } from "./types";
import { probeWebGL } from "./util/webgl";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

const WEBGL_STATUS = "Garden needs WebGL — try enabling hardware acceleration";
const WEBGL_FALLBACK_NOTE =
  "This browser can’t run the 3D garden. Open a project below, or enable hardware acceleration and reload.";
const INIT_STATUS = "Could not load garden";
const INIT_FALLBACK_NOTE =
  "The garden couldn’t start. Open a project below — the rest of the site still works.";

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

function enterStaticPortfolioFallback(options: {
  loadStatus: HTMLElement;
  panel: PortfolioPanel;
  reason: "webgl_unavailable" | "init_failed";
  detail?: string;
}): void {
  const { loadStatus, panel, reason, detail } = options;
  trackGardenLoadFailed({ reason, detail });

  document.body.classList.add("garden-fallback-active");
  loadStatus.hidden = false;
  loadStatus.textContent = reason === "webgl_unavailable" ? WEBGL_STATUS : INIT_STATUS;

  const fallback = document.getElementById("garden-fallback");
  const note = document.getElementById("garden-fallback-note");
  const list = document.getElementById("garden-fallback-projects");
  if (!(fallback instanceof HTMLElement) || !(note instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    return;
  }

  note.textContent =
    reason === "webgl_unavailable"
      ? `${WEBGL_FALLBACK_NOTE} Case studies coming soon.`
      : `${INIT_FALLBACK_NOTE} Case studies coming soon.`;
  list.replaceChildren();

  const soon = document.createElement("p");
  soon.className = "garden-fallback__soon";
  soon.textContent = "Case studies coming soon";
  list.appendChild(soon);

  fallback.hidden = false;

  panel.setOnOpenChange((open) => {
    document.documentElement.classList.toggle("portfolio-open", open);
    document.body.classList.toggle("portfolio-open", open);
  });
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

  const webgl = probeWebGL();
  if (!webgl.ok) {
    console.error("WebGL unavailable:", webgl.reason);
    enterStaticPortfolioFallback({
      loadStatus,
      panel,
      reason: "webgl_unavailable",
      detail: webgl.reason,
    });
    return;
  }

  let garden: GardenScene;
  try {
    garden = await GardenScene.create(canvas, cssRoot, (message) => {
      loadStatus.hidden = false;
      loadStatus.textContent = message;
    });
  } catch (error) {
    console.error(error);
    enterStaticPortfolioFallback({
      loadStatus,
      panel,
      reason: "init_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  turnRight = (steps) => garden.navigation.animateTurnRightSteps(steps);

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

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.code === "KeyH") {
      setControlsCollapsed(!controlsBar.classList.contains("is-collapsed"));
    }
    if (event.code === "Escape" && panel.isOpen) {
      panel.hide("escape_key");
    }
    if (event.code === "KeyX" && panel.isOpen) {
      event.preventDefault();
      panel.hide("x_key");
    }
  });

  window.addEventListener("blur", () => {
    for (const code of ARROW_KEYS) {
      garden.navigation.setKeyPressed(code, false);
    }
  });

  canvas.addEventListener("pointermove", () => {
    if (panel.isOpen) return;
    canvas.style.cursor = "crosshair";
  });

  window.addEventListener("resize", () => garden.resize());
}

main();
