import { defineConfig, type Plugin, type Connect } from "vite";

const NOINDEX =
  "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, max-snippet:0, max-image-preview:none, max-video-preview:0";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|webm|mp4|avif)(\?|$)/i;

/** Editor/internal files that must never be HTTP-reachable. */
const BLOCKED_SITE_FILES = new Set([
  "/site-copy.md",
  "/readme.md",
  "/package.json",
  "/package-lock.json",
  "/tsconfig.json",
  "/vite.config.ts",
  "/vite.config.js",
]);

function isBlockedAssetPath(urlPath: string): boolean {
  return (
    urlPath.startsWith("/portfolio/") ||
    urlPath.startsWith("/models/") ||
    urlPath.startsWith("/draco/") ||
    urlPath === "/portfolio" ||
    urlPath === "/models" ||
    urlPath === "/draco" ||
    urlPath === "/pixel-sprite.png"
  );
}

function isBlockedSiteFile(urlPath: string): boolean {
  return BLOCKED_SITE_FILES.has(urlPath.toLowerCase());
}

function portfolioNoIndexPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const raw = req.url ?? "/";
    const path = raw.split("?")[0] ?? "/";

    if (isBlockedSiteFile(path)) {
      res.statusCode = 404;
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }

    if (isBlockedAssetPath(path)) {
      res.setHeader(
        "X-Robots-Tag",
        IMAGE_EXT.test(path) ? "noindex, noimageindex, nofollow" : NOINDEX,
      );
    }
    next();
  };

  return {
    name: "portfolio-noindex-headers",
    configureServer(server) {
      // Run before Vite static / transform middleware.
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [portfolioNoIndexPlugin()],
});
