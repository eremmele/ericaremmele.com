import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const PORT = 8791;
const PASSWORD = "test-only-password";

function snippets() {
  const found = [];
  const root = path.resolve("private/portfolio");
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else if (/\.(html|json)$/.test(name)) {
        const text = fs.readFileSync(abs, "utf8").replace(/<[^>]+>/g, " ");
        for (const word of text.split(/\s+/)) {
          if (word.length > 24) found.push(word);
        }
      }
    }
  };
  walk(root);
  return found.slice(0, 40);
}

function discover() {
  const root = path.resolve("private/portfolio");
  let thumb = "";
  let page = "";
  let video = "";
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else if (!thumb && abs.includes(`${path.sep}thumbs${path.sep}`)) thumb = abs;
      else if (!page && name === "index.html") page = abs;
      else if (!video && name.endsWith(".webm")) video = abs;
    }
  };
  walk(root);
  const pub = (abs) => `/portfolio/${path.relative(root, abs).split(path.sep).join("/")}`;
  return { thumb: pub(thumb), page: pub(page), video: pub(video) };
}

function start(env) {
  const child = spawn(process.execPath, ["server/production.mjs"], {
    env: { ...process.env, ...env, PORT: String(PORT) },
    stdio: "ignore",
  });
  return child;
}

async function ready() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      await res.text();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("server did not start");
}

test("production gate hides private content until login", async () => {
  const child = start({ GATE_PASSWORD: PASSWORD, GATE_SESSION_MS: "4000" });
  try {
    await ready();
    const words = snippets();
    assert.ok(words.length > 0);

    const home = await fetch(`http://127.0.0.1:${PORT}/`);
    const homeText = await home.text();
    assert.equal(home.status, 200);
    assert.match(home.headers.get("cache-control") ?? "", /no-store/);
    assert.match(home.headers.get("x-robots-tag") ?? "", /noindex/);
    for (const word of words) assert.equal(homeText.includes(word), false);

    const files = discover();
    const thumb = await fetch(`http://127.0.0.1:${PORT}${files.thumb}`);
    assert.equal(thumb.status, 404);
    assert.equal((await thumb.text()).includes("RIFF"), false);

    const page = await fetch(`http://127.0.0.1:${PORT}${files.page}`);
    assert.equal(page.status, 404);
    const pageText = await page.text();
    for (const word of words) assert.equal(pageText.includes(word), false);

    const video = await fetch(`http://127.0.0.1:${PORT}${files.video}`, {
      headers: { Range: "bytes=0-16" },
    });
    assert.equal(video.status, 404);

    const asset = await fetch(`http://127.0.0.1:${PORT}/assets/`);
    assert.equal(asset.status, 404);

    const bad = await fetch(`http://127.0.0.1:${PORT}/__gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "nope" }),
    });
    assert.equal(bad.status, 401);

    const login = await fetch(`http://127.0.0.1:${PORT}/__gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    assert.equal(login.status, 204);
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(login.headers.get("set-cookie") ?? "", /SameSite=Lax/i);

    const authed = await fetch(`http://127.0.0.1:${PORT}/`, { headers: { cookie } });
    const authedHtml = await authed.text();
    assert.equal(authed.status, 200);
    assert.match(authedHtml, /garden-canvas/);
    assert.match(authed.headers.get("cache-control") ?? "", /private, no-store/);

    const media = await fetch(`http://127.0.0.1:${PORT}${files.thumb}`, { headers: { cookie } });
    assert.equal(media.status, 200);
    assert.match(media.headers.get("cache-control") ?? "", /private, no-store/);

    const anon = await fetch(`http://127.0.0.1:${PORT}${files.thumb}`);
    assert.equal(anon.status, 404);

    const expiredCookie = "pg_session=deadbeef";
    const expired = await fetch(`http://127.0.0.1:${PORT}/`, { headers: { cookie: expiredCookie } });
    assert.equal(expired.status, 200);
    assert.doesNotMatch(await expired.text(), /garden-canvas/);

    const bye = await fetch(`http://127.0.0.1:${PORT}/__logout`, { method: "POST", headers: { cookie } });
    assert.equal(bye.status, 204);
    const revoked = await fetch(`http://127.0.0.1:${PORT}${files.thumb}`, { headers: { cookie } });
    assert.equal(revoked.status, 404);
  } finally {
    child.kill();
  }
});

test("missing password fails closed", async () => {
  const child = spawn(process.execPath, ["server/production.mjs"], {
    env: { ...process.env, GATE_PASSWORD: "", PORT: "8792" },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        const res = await fetch("http://127.0.0.1:8792/");
        if (res.status === 200) {
          await res.text();
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const login = await fetch("http://127.0.0.1:8792/__gate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });
    assert.equal(login.status, 404);
    const hidden = await fetch(`http://127.0.0.1:8792${discover().page}`);
    assert.equal(hidden.status, 404);
  } finally {
    child.kill();
  }
});
