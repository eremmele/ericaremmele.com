import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Connect, Plugin } from "vite";

const COOKIE = "pg_auth";
const MAX_AGE = 60 * 60 * 24 * 400;
const BODY_LIMIT = 2048;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 8;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

const GATE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
  <title>Private project</title>
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

type Attempt = { n: number; reset: number };

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function tokenFor(password: string): string {
  return crypto.createHmac("sha256", password).update("portfolio-gate-v2").digest("hex");
}

function cookieValue(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function authorized(req: IncomingMessage, password: string): boolean {
  if (!password) return false;
  return safeEqual(cookieValue(req.headers.cookie, COOKIE), tokenFor(password));
}

function secureSuffix(req: IncomingMessage): string {
  const proto = req.headers["x-forwarded-proto"];
  const https = proto === "https" || (Array.isArray(proto) && proto.includes("https"));
  return https ? "; Secure" : "";
}

function pathnameOf(raw: string): string {
  const pathOnly = (raw.split("?")[0] ?? "/").replace(/\/{2,}/g, "/");
  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
}

function isDocument(req: IncomingMessage, urlPath: string): boolean {
  if (urlPath.endsWith(".html") || urlPath.endsWith("/")) return true;
  const ext = path.extname(urlPath);
  if (ext && ext !== ".html") return false;
  const accept = req.headers.accept ?? "";
  return accept.includes("text/html");
}

function privateFile(root: string, urlPath: string): string | null {
  const rel = urlPath.replace(/^\/portfolio\/?/, "");
  if (!rel || rel.split("/").includes("..")) return null;
  const file = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (file !== root && !file.startsWith(rootWithSep)) return null;
  return file;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
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

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(body);
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  const stat = fs.statSync(file);
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  if (range && stat.size > 0) {
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
  fs.createReadStream(file).pipe(res);
}

function resolveExisting(root: string, urlPath: string): string | null {
  const file = privateFile(root, urlPath);
  if (!file) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const index = path.join(file, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (!path.extname(file)) {
    const index = path.join(file, "index.html");
    if (fs.existsSync(index)) return index;
  }
  return null;
}

export function projectGatePlugin(): Plugin {
  const root = path.resolve(process.cwd(), "private/portfolio");
  const secretFile = path.resolve(process.cwd(), ".gate-secret");
  const attempts = new Map<string, Attempt>();

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const urlPath = pathnameOf(req.url ?? "/");
    if (urlPath.split("/").includes("..")) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    if (urlPath !== "/__gate" && urlPath !== "/portfolio" && !urlPath.startsWith("/portfolio/")) {
      next();
      return;
    }

    const password = loadPassword(secretFile);

    if (urlPath === "/__gate") {
      void handleGate(req, res, password, attempts);
      return;
    }

    if (urlPath === "/portfolio/robots.txt" || urlPath.startsWith("/portfolio/thumbs/")) {
      next();
      return;
    }

    if (!password || !authorized(req, password)) {
      if (isDocument(req, urlPath)) send(res, 200, GATE_HTML, "text/html; charset=utf-8");
      else send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    const file = resolveExisting(root, urlPath);
    if (!file) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    sendFile(req, res, file);
  };

  return {
    name: "project-gate",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function loadPassword(file: string): string {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function blocked(attempts: Map<string, Attempt>, key: string): boolean {
  const row = attempts.get(key);
  return Boolean(row && Date.now() <= row.reset && row.n >= MAX_TRIES);
}

function recordFailure(attempts: Map<string, Attempt>, key: string): void {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now > row.reset) {
    attempts.set(key, { n: 1, reset: now + WINDOW_MS });
    return;
  }
  row.n += 1;
}

async function handleGate(
  req: IncomingMessage,
  res: ServerResponse,
  password: string,
  attempts: Map<string, Attempt>,
): Promise<void> {
  if (!password) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  if (req.method === "GET") {
    send(res, authorized(req, password) ? 204 : 401, "", "text/plain; charset=utf-8");
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const key = clientKey(req);
  if (blocked(attempts, key)) {
    send(res, 429, "Not found", "text/plain; charset=utf-8");
    return;
  }
  let input = "";
  try {
    const parsed = JSON.parse(await readBody(req)) as { password?: unknown };
    input = typeof parsed.password === "string" ? parsed.password : "";
  } catch {
    recordFailure(attempts, key);
    send(res, 401, "Not found", "text/plain; charset=utf-8");
    return;
  }
  if (!safeEqual(input, password)) {
    recordFailure(attempts, key);
    send(res, 401, "Not found", "text/plain; charset=utf-8");
    return;
  }
  attempts.delete(key);
  const token = tokenFor(password);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secureSuffix(req)}`,
  );
  send(res, 204, "", "text/plain; charset=utf-8");
}
