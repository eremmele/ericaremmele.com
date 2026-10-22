const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

let aesKey = null;
let manifest = null;
const plainCache = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "key" || !event.data.raw) return;
  event.waitUntil(
    crypto.subtle.importKey("raw", event.data.raw, "AES-GCM", false, ["decrypt"]).then((key) => {
      aesKey = key;
    }),
  );
});

function protectedPath(url) {
  const path = url.pathname;
  if (!path.startsWith("/portfolio/")) return false;
  if (path === "/portfolio/robots.txt" || path.startsWith("/portfolio/thumbs/")) return false;
  return true;
}

async function loadManifest() {
  if (manifest) return manifest;
  const res = await fetch("/sealed/manifest.json", { cache: "no-store" });
  manifest = await res.json();
  return manifest;
}

async function plaintext(id) {
  const cached = plainCache.get(id);
  if (cached) return cached;
  const res = await fetch(`/sealed/f/${id}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, aesKey, bytes.slice(12)),
  );
  plainCache.set(id, plain);
  return plain;
}

function headers(type, extra) {
  return {
    "Content-Type": type,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    ...extra,
  };
}

self.addEventListener("fetch", (event) => {
  if (!aesKey) return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !protectedPath(url)) return;
  event.respondWith(openProtected(url.pathname, event.request));
});

async function openProtected(pathname, request) {
  if (!aesKey) return new Response("Not found", { status: 404 });
  try {
    const list = await loadManifest();
    const id = list.files[pathname];
    if (!id) return new Response("Not found", { status: 404 });
    const bytes = await plaintext(id);
    const type = MIME[pathname.slice(pathname.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : bytes.length - 1;
      if (start <= end && end < bytes.length) {
        return new Response(bytes.slice(start, end + 1), {
          status: 206,
          headers: headers(type, {
            "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
            "Accept-Ranges": "bytes",
          }),
        });
      }
    }
    return new Response(bytes, { headers: headers(type, { "Accept-Ranges": "bytes" }) });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
