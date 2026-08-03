/**
 * Per-browser render budgets. Firefox's WebGL path is especially costly for
 * full-frame post (EdgeLens); Chromium forks can keep richer defaults.
 */

export type BrowserKind =
  | "firefox"
  | "safari"
  | "chrome"
  | "edge"
  | "opera"
  | "brave"
  | "comet"
  | "samsung"
  | "other";

export type PerfTier = "high" | "medium" | "low";

export type BrowserProfile = {
  kind: BrowserKind;
  tier: PerfTier;
  /** Cap on devicePixelRatio for the WebGL canvas. */
  maxPixelRatio: number;
  /** Desktop peripheral edge blur. */
  edgeBlur: boolean;
  /** Blur cascade render-target scale (of full buffer). */
  edgeBlurScale: number;
  /** How many increasing-blur levels (1 = cheapest). */
  blurLevels: 1 | 2 | 3;
  /** Drop blur while the camera is turning/looking (big Firefox win). */
  blurWhileMoving: boolean;
  particleCount: number;
  toneMapping: boolean;
  /** full = ambient+hemi+key+foliage pair; simple = ambient+one key. */
  foliageLights: "full" | "simple";
  powerPreference: WebGLPowerPreference;
  /** Update noise materials / floaters every N frames. */
  fxFrameStride: number;
};

function detectKind(ua: string): BrowserKind {
  const u = ua.toLowerCase();
  // Order matters — many Chromium forks include "Chrome/" in UA.
  if (u.includes("firefox/") || u.includes("fxios/")) return "firefox";
  if (u.includes("edg/") || u.includes("edgios/") || u.includes("edga/")) return "edge";
  if (u.includes("opr/") || u.includes("opera")) return "opera";
  if (u.includes("brave")) return "brave";
  if (u.includes("comet")) return "comet";
  if (u.includes("samsungbrowser")) return "samsung";
  // Safari must precede Chrome — desktop Safari has Version/… Safari/ and no Chrome/
  if (u.includes("safari/") && !u.includes("chrome/") && !u.includes("chromium/")) {
    return "safari";
  }
  if (u.includes("chrome/") || u.includes("crios/") || u.includes("chromium/")) {
    return "chrome";
  }
  return "other";
}

function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function isNarrow(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= 900;
}

/** Build a static profile for this page load (call once). */
export function createBrowserProfile(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
): BrowserProfile {
  const kind = detectKind(ua);
  const touch = isCoarsePointer();
  const narrow = isNarrow();
  const saveData =
    typeof navigator !== "undefined" &&
    Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

  // Touch / small screens already skip blur — keep that.
  const mobileLike = touch || narrow;

  if (kind === "firefox" || saveData) {
    return {
      kind,
      tier: "low",
      maxPixelRatio: 1,
      edgeBlur: false,
      edgeBlurScale: 0.25,
      blurLevels: 1,
      blurWhileMoving: false,
      particleCount: 28,
      toneMapping: false,
      foliageLights: "simple",
      powerPreference: "high-performance",
      fxFrameStride: 2,
    };
  }

  if (kind === "safari" || kind === "samsung") {
    return {
      kind,
      tier: "medium",
      maxPixelRatio: mobileLike ? 1 : 1.1,
      edgeBlur: !mobileLike,
      edgeBlurScale: 0.28,
      blurLevels: 2,
      blurWhileMoving: false,
      particleCount: 36,
      toneMapping: true,
      foliageLights: "simple",
      powerPreference: "high-performance",
      fxFrameStride: 2,
    };
  }

  // Chromium family: Chrome, Edge, Opera, Brave, Comet, other
  const chromium: BrowserKind =
    kind === "edge" || kind === "opera" || kind === "brave" || kind === "comet" || kind === "chrome"
      ? kind
      : "chrome";

  return {
    kind: chromium,
    tier: mobileLike ? "medium" : "high",
    maxPixelRatio: mobileLike ? 1.1 : 1.25,
    edgeBlur: !mobileLike,
    edgeBlurScale: mobileLike ? 0.28 : 0.33,
    blurLevels: mobileLike ? 2 : 3,
    blurWhileMoving: false,
    particleCount: mobileLike ? 36 : 50,
    toneMapping: true,
    foliageLights: mobileLike ? "simple" : "full",
    powerPreference: "high-performance",
    fxFrameStride: mobileLike ? 2 : 1,
  };
}
