import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openPortfolioSeal } from "./sealed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.resolve(ROOT, "dist");
const PRIVATE = path.resolve(ROOT, "private/portfolio");
const SEAL_DIR = process.env.SEAL_DIR ? path.resolve(process.env.SEAL_DIR) : path.join(DIST, "sealed");
const PASSWORD = process.env.GATE_PASSWORD ?? "";
const seal = openPortfolioSeal(SEAL_DIR, PASSWORD);
if (!seal && !fs.existsSync(path.join(PRIVATE, "captions.json"))) {
  console.error("Portfolio thumbnails and pages are unavailable. Copy private/portfolio onto this instance and run npm run build with GATE_PASSWORD set.");
} else if (!seal && fs.existsSync(path.join(SEAL_DIR, "manifest.json"))) {
  console.error("Sealed portfolio could not be opened. Rebuild with the same GATE_PASSWORD the server uses.");
}
const SESSION_MS = Number(process.env.GATE_SESSION_MS ?? 12 * 60 * 60 * 1000);
const PORT = Number(process.env.PORT ?? 8787);
const COOKIE = "pg_session";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
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
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
};

const sessions = new Map();
const attempts = new Map();

const LOGIN = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
  <title>Private</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #090909; color: #fff; font: 16px/1.4 system-ui, sans-serif; }
    form { width: min(360px, calc(100% - 32px)); }
    label { display: block; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #888; }
    input { width: 100%; margin: 12px 0; padding: 12px; box-sizing: border-box; border: 1px solid #333; background: #111; color: #fff; font: inherit; }
    button { padding: 10px 16px; border: 0; background: #fff; color: #000; font: inherit; cursor: pointer; }
    p { color: #c44; min-height: 1.2em; }
  </style>
</head>
<body>
  <form id="g">
    <label for="p">Password</label>
    <input id="p" type="password" name="password" autocomplete="current-password" required autofocus />
    <button type="submit">Enter</button>
    <p id="e" hidden>That password isn’t right.</p>
  </form>
  <script>
    document.getElementById("g").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = new FormData(event.currentTarget).get("password");
      const res = await fetch("/__gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      if (res.ok) location.reload();
      else document.getElementById("e").hidden = false;
    });
  </script>
</body>
</html>`;

const ROBOTS = "User-agent: *\nDisallow: /\n";

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function same(a, b) {
  const left = digest(a);
  const right = digest(b);
  return crypto.timingSafeEqual(left, right);
}

function cookie(req) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === COOKIE) return rest.join("=");
  }
  return "";
}

function sessionOk(req) {
  if (!PASSWORD) return false;
  const id = cookie(req);
  const row = sessions.get(id);
  if (!row || row.exp <= Date.now()) {
    if (row) sessions.delete(id);
    return false;
  }
  return true;
}

function clientKey(req) {
  return req.socket.remoteAddress ?? "unknown";
}

function blocked(key) {
  const row = attempts.get(key);
  return Boolean(row && Date.now() <= row.reset && row.n >= MAX_TRIES);
}

function fail(key) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now > row.reset) attempts.set(key, { n: 1, reset: now + WINDOW_MS });
  else row.n += 1;
}

function secure(req) {
  const proto = req.headers["x-forwarded-proto"];
  return proto === "https" || process.env.GATE_SECURE === "1";
}

function pathname(raw) {
  const pathOnly = (raw.split("?")[0] ?? "/").replace(/\/{2,}/g, "/");
  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
}

function guarded(res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Cookie");
}

function send(res, status, body, type) {
  guarded(res);
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

function inside(root, file) {
  const base = root.endsWith(path.sep) ? root : root + path.sep;
  return file === root || file.startsWith(base);
}

function resolveFile(root, urlPath) {
  const rel = urlPath.replace(/^\/portfolio\/?/, urlPath.startsWith("/portfolio") ? "" : urlPath);
  const relative = urlPath.startsWith("/portfolio")
    ? urlPath.replace(/^\/portfolio\/?/, "")
    : urlPath.replace(/^\//, "");
  if (!relative || relative.split("/").includes("..")) return null;
  const file = path.resolve(root, relative);
  if (!inside(root, file)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const index = path.join(file, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  return null;
}

function sendFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  guarded(res);
  res.setHeader("Content-Type", type);
  res.setHeader("Accept-Ranges", "bytes");
  const range = req.headers.range;
  if (range && stat.size > 0 && req.method !== "HEAD") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.statusCode = 416;
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (start > end || end >= stat.size) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Length", String(stat.size));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

function sendBytes(req, res, bytes, type) {
  guarded(res);
  res.setHeader("Content-Type", type);
  res.setHeader("Accept-Ranges", "bytes");
  const range = req.headers.range;
  if (range && bytes.length > 0 && req.method !== "HEAD") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.statusCode = 416;
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : bytes.length - 1;
    if (start > end || end >= bytes.length) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${bytes.length}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    res.setHeader("Content-Length", String(end - start + 1));
    res.end(bytes.subarray(start, end + 1));
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Length", String(bytes.length));
  res.end(req.method === "HEAD" ? undefined : bytes);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2048) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function login(req, res) {
  if (!PASSWORD || req.method !== "POST") {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const key = clientKey(req);
  if (blocked(key)) {
    send(res, 429, "Not found", "text/plain; charset=utf-8");
    return;
  }
  let input = "";
  try {
    const parsed = JSON.parse(await readBody(req));
    input = typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    fail(key);
    send(res, 401, "Not found", "text/plain; charset=utf-8");
    return;
  }
  if (!same(input, PASSWORD)) {
    fail(key);
    send(res, 401, "Not found", "text/plain; charset=utf-8");
    return;
  }
  attempts.delete(key);
  const id = crypto.randomBytes(32).toString("hex");
  sessions.set(id, { exp: Date.now() + SESSION_MS });
  const maxAge = Math.floor(SESSION_MS / 1000);
  const suffix = secure(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${suffix}`);
  send(res, 204, "", "text/plain; charset=utf-8");
}

function logout(req, res) {
  const id = cookie(req);
  if (id) sessions.delete(id);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  send(res, 204, "", "text/plain; charset=utf-8");
}

function serveAuthed(req, res, urlPath) {
  if (urlPath.split("/").includes("..") || urlPath.includes("\0")) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const root = urlPath === "/portfolio" || urlPath.startsWith("/portfolio/") ? PRIVATE : DIST;
  const lookup = urlPath === "/" ? "/index.html" : urlPath;
  const file = resolveFile(root, lookup);
  if (file && !file.endsWith(".map")) {
    sendFile(req, res, file);
    return;
  }
  if ((urlPath === "/portfolio" || urlPath.startsWith("/portfolio/")) && seal) {
    const bytes = seal.read(urlPath);
    if (bytes) {
      const type = MIME[path.extname(urlPath).toLowerCase()] ?? "application/octet-stream";
      sendBytes(req, res, bytes, type);
      return;
    }
  }
  send(res, 404, "Not found", "text/plain; charset=utf-8");
}

const server = http.createServer((req, res) => {
  const urlPath = pathname(req.url ?? "/");
  const method = req.method ?? "GET";

  if (urlPath === "/__gate" && method === "POST") {
    void login(req, res);
    return;
  }
  if (urlPath === "/__gate" && method === "GET") {
    send(res, sessionOk(req) ? 204 : 401, "", "text/plain; charset=utf-8");
    return;
  }
  if (urlPath === "/__logout" && method === "POST") {
    logout(req, res);
    return;
  }
  if (urlPath === "/healthz" && (method === "GET" || method === "HEAD")) {
    send(res, 200, method === "HEAD" ? "" : "ok", "text/plain; charset=utf-8");
    return;
  }
  if (urlPath === "/robots.txt" && (method === "GET" || method === "HEAD")) {
    guarded(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(method === "HEAD" ? undefined : ROBOTS);
    return;
  }
if (!PASSWORD || !sessionOk(req)) {
  if (method !== "GET" && method !== "HEAD") {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }

  const publicPrivate =
    urlPath === "/portfolio/captions.json" ||
    urlPath.startsWith("/portfolio/thumbs/");

  if (publicPrivate) {
    const file = resolveFile(PRIVATE, urlPath.replace(/^\/portfolio/, "") || "/");
    if (!file || file.endsWith(".map")) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    sendFile(req, res, file);
    return;
  }

  if (!urlPath.startsWith("/portfolio/") && urlPath !== "/portfolio") {
    const lookup = urlPath === "/" ? "/index.html" : urlPath;
    const file = resolveFile(DIST, lookup);
    if (!file || file.endsWith(".map")) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    sendFile(req, res, file);
    return;
  }

  send(res, 404, "Not found", "text/plain; charset=utf-8");
  return;
}

  serveAuthed(req, res, urlPath);
});

if (process.env.GATE_NO_LISTEN !== "1") {
  server.listen(PORT, "0.0.0.0");
}

export { server, sessions };
