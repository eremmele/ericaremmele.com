/**
 * Lightweight FullStory helpers. No-ops when the snippet isn't loaded (e.g. local
 * or blocked). Never captures canvas pixels — events + page context only.
 */

type FsCallable = {
  (method: string, payload?: Record<string, unknown>): unknown;
  event?: (name: string, properties?: Record<string, unknown>) => void;
  setVars?: (properties: Record<string, unknown>) => void;
};

function getFS(): FsCallable | null {
  const fs = (window as Window & { FS?: FsCallable }).FS;
  return typeof fs === "function" ? fs : null;
}

/** Fire a searchable custom event. Swallows all errors. */
export function trackEvent(name: string, properties: Record<string, unknown> = {}): void {
  try {
    const fs = getFS();
    if (!fs) return;
    fs("trackEvent", { name, properties });
  } catch {
    try {
      getFS()?.event?.(name, properties);
    } catch {
      /* analytics must never affect the garden */
    }
  }
}

/** Attach page-level context (searchable across subsequent events). */
export function setPageProperties(properties: Record<string, unknown>): void {
  try {
    const fs = getFS();
    if (!fs) return;
    fs("setProperties", { type: "page", properties });
  } catch {
    try {
      getFS()?.setVars?.(properties);
    } catch {
      /* ignore */
    }
  }
}

export type ProjectOpenSource =
  | "canvas_click"
  | "touch_tap"
  | "hotkey"
  | "project_button"
  | "inspect_key";

export type ProjectCloseReason =
  | "close_button"
  | "esc_button"
  | "escape_key"
  | "x_key"
  | "backdrop"
  | "walk_away"
  | "unknown";

export function trackGardenReady(props: { inputMode: string; foliagePending: boolean }): void {
  setPageProperties({
    pageName: "Garden",
    inputMode: props.inputMode,
  });
  trackEvent("Garden Ready", {
    inputMode: props.inputMode,
    foliagePending: props.foliagePending,
  });
}

export function trackGardenFoliageReady(): void {
  trackEvent("Garden Foliage Ready", {});
}

export function trackGardenNavigated(props: { input: string }): void {
  trackEvent("Garden Navigated", props);
}

export function trackHeroViewTurn(props: { steps: number; label: string }): void {
  trackEvent("Hero View Turn", props);
}

export function trackInspectionApproached(props: {
  pointId: string;
  portfolioId: string;
  label: string;
  title: string;
}): void {
  trackEvent("Inspection Point Approached", props);
}

export function trackProjectOpened(props: {
  projectId: string;
  title: string;
  category: string;
  label: string;
  pointId: string;
  source: ProjectOpenSource;
}): void {
  setPageProperties({
    pageName: `Project: ${props.title}`,
    projectId: props.projectId,
    projectTitle: props.title,
    projectCategory: props.category,
    inspectionLabel: props.label,
  });
  trackEvent("Project Opened", props);
}

export function trackProjectClosed(props: {
  projectId: string;
  title: string;
  reason: ProjectCloseReason;
}): void {
  trackEvent("Project Closed", props);
  setPageProperties({
    pageName: "Garden",
  });
}

export function trackControlsToggled(props: { collapsed: boolean }): void {
  trackEvent("Controls Toggled", props);
}

export function trackCarouselInteracted(props: { projectId: string; title: string }): void {
  trackEvent("Carousel Interacted", props);
}
