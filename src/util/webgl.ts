/**
 * Cheap preflight before constructing THREE.WebGLRenderer.
 * Distinguishes "no WebGL" from later garden/model failures in analytics.
 */

export type WebGLProbe =
  | { ok: true; api: "webgl2" | "webgl" }
  | {
      ok: false;
      reason: "no_get_context" | "context_creation_failed" | "context_lost";
    };

export function probeWebGL(): WebGLProbe {
  try {
    const canvas = document.createElement("canvas");
    if (typeof canvas.getContext !== "function") {
      return { ok: false, reason: "no_get_context" };
    }

    // Allow software GL if that's all the machine offers — better than a hard fail.
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false };
    const gl =
      canvas.getContext("webgl2", attrs) ||
      canvas.getContext("webgl", attrs) ||
      (canvas.getContext("experimental-webgl", attrs) as WebGLRenderingContext | null);

    if (!gl) {
      return { ok: false, reason: "context_creation_failed" };
    }

    const isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const isWebGL1 = gl instanceof WebGLRenderingContext;
    if (!isWebGL2 && !isWebGL1) {
      return { ok: false, reason: "context_creation_failed" };
    }

    if ("isContextLost" in gl && typeof gl.isContextLost === "function" && gl.isContextLost()) {
      return { ok: false, reason: "context_lost" };
    }

    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();

    return { ok: true, api: isWebGL2 ? "webgl2" : "webgl" };
  } catch {
    return { ok: false, reason: "context_creation_failed" };
  }
}
