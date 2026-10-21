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
  trackProjectOpened,
} from "./analytics/fullstory";
import { getPortfolioById, inspectionPoints, portfolioItems } from "./data/portfolio";
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

  const gate = document.getElementById("project-gate") as HTMLElement;
  const gateForm = document.getElementById("project-gate-form") as HTMLFormElement;
  const gatePassword = document.getElementById("project-gate-password") as HTMLInputElement;
  const gateError = document.getElementById("project-gate-error") as HTMLElement;
  const gateCancel = document.getElementById("project-gate-cancel") as HTMLButtonElement;
  let gatePromise: Promise<boolean> | null = null;
  let captions: Record<string, { description?: string }> | null = null;

  const gateIsOpen = async (): Promise<boolean> => {
    try {
      const res = await fetch("/__gate", { credentials: "same-origin" });
      return res.ok;
    } catch {
      return false;
    }
  };

  const askForPassword = (): Promise<boolean> => {
    gate.hidden = false;
    gateError.hidden = true;
    gatePassword.value = "";
    gatePassword.focus();
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        gateForm.removeEventListener("submit", onSubmit);
        gateCancel.removeEventListener("click", onCancel);
        gate.hidden = true;
        gatePassword.value = "";
        resolve(ok);
      };
      const onCancel = () => finish(false);
      const onSubmit = (event: Event) => {
        event.preventDefault();
        void (async () => {
          gateError.hidden = true;
          const res = await fetch("/__gate", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: gatePassword.value }),
          });
          if (!res.ok) {
            gateError.hidden = false;
            gatePassword.select();
            return;
          }
          finish(true);
        })();
      };
      gateForm.addEventListener("submit", onSubmit);
      gateCancel.addEventListener("click", onCancel);
    });
  };

  const ensureUnlocked = (): Promise<boolean> => {
    if (!gatePromise) {
      gatePromise = (async () => {
        if (await gateIsOpen()) return true;
        const ok = await askForPassword();
        if (!ok) gatePromise = null;
        return ok;
      })();
    }
    return gatePromise;
  };

  const loadCaptions = async (): Promise<void> => {
    if (captions) return;
    const res = await fetch("/portfolio/captions.json", { credentials: "same-origin" });
    captions = res.ok ? ((await res.json()) as Record<string, { description?: string }>) : {};
  };

  const showProject = (
    item: PortfolioItem,
    source: "canvas_click" | "touch_tap" | "project_button" | "hotkey",
    pointId?: string,
    label?: string,
  ): void => {
    void (async () => {
      if (!(await ensureUnlocked())) return;
      await loadCaptions();
      const description = captions?.[item.id]?.description || item.description;
      const full = description === item.description ? item : { ...item, description };
      const point = inspectionPoints.find((entry) => entry.portfolioId === item.id);
      openItem = full;
      carouselInteracted = false;
      garden.setHoveredPoint(null);
      garden.setOverlayProjectId(pointId ?? point?.id ?? null);
      panel.show(full);
      trackProjectOpened({
        projectId: item.id,
        title: item.title,
        category: item.category,
        label: label ?? point?.label ?? item.title,
        pointId: pointId ?? point?.id ?? item.id,
        source,
      });
    })();
  };

  const openProjectByNumber = (n: number, source: "project_button" | "hotkey"): void => {
    const point = garden.getPointByNumber(n);
    if (!point) return;
    const item = getPortfolioById(point.data.portfolioId) ?? point.item;
    showProject(item, source, point.data.id, point.data.label);
  };

  let thumbnailPress: { id: number; x: number; y: number; pointId: string } | null = null;

  canvas.addEventListener("pointerdown", (event) => {
    if (panel.isOpen) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const hit = garden.pickInspectionPoint(event.clientX, event.clientY);
    if (!hit) {
      thumbnailPress = null;
      return;
    }
    thumbnailPress = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pointId: hit.data.id,
    };
  });

  canvas.addEventListener("pointerup", (event) => {
    const press = thumbnailPress;
    if (!press || press.id !== event.pointerId || panel.isOpen) {
      if (press?.id === event.pointerId) thumbnailPress = null;
      return;
    }
    thumbnailPress = null;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) return;
    const hit = garden.pickInspectionPoint(event.clientX, event.clientY);
    if (!hit || hit.data.id !== press.pointId) return;
    showProject(
      hit.item,
      event.pointerType === "mouse" ? "canvas_click" : "touch_tap",
      hit.data.id,
      hit.data.label,
    );
  });

  canvas.addEventListener("pointercancel", () => {
    thumbnailPress = null;
  });

  panel.setOnNext(() => {
    if (!openItem) return;
    const index = portfolioItems.findIndex((item) => item.id === openItem?.id);
    const next = portfolioItems[(index + 1) % portfolioItems.length];
    if (!next || next.id === openItem.id) return;
    showProject(next, "project_button");
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

  canvas.addEventListener("pointermove", (event) => {
    if (panel.isOpen) return;
    const hit = garden.pickInspectionPoint(event.clientX, event.clientY);
    garden.setHoveredPoint(hit);
    canvas.style.cursor = hit ? "pointer" : "crosshair";
  });

  window.addEventListener("resize", () => garden.resize());
}

main();
