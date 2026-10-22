import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const PORT = 8793;
const PASSWORD = "test-only-password";
const URL_PATH = "/portfolio/probe/thumb.webp";

function encrypt(key, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([iv, body]);
}

function writeSeal(dir) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(PASSWORD, salt, 1, 32, "sha256");
  const id = "abc123";
  fs.mkdirSync(path.join(dir, "f"), { recursive: true });
  fs.writeFileSync(path.join(dir, "f", id), encrypt(key, Buffer.from("probe-bytes")));
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      salt: salt.toString("base64"),
      iter: 1,
      verify: encrypt(key, Buffer.from("ok")).toString("base64"),
      files: { [URL_PATH]: id },
    }),
  );
}

test("authenticated requests serve sealed thumbnails and pages", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-seal-"));
  writeSeal(dir);
  const child = spawn(process.execPath, ["server/production.mjs"], {
    env: { ...process.env, GATE_PASSWORD: PASSWORD, SEAL_DIR: dir, PORT: String(PORT) },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
        if (res.status === 200) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const hidden = await fetch(`http://127.0.0.1:${PORT}${URL_PATH}`);
    assert.equal(hidden.status, 404);

    const login = await fetch(`http://127.0.0.1:${PORT}/__gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const media = await fetch(`http://127.0.0.1:${PORT}${URL_PATH}`, { headers: { cookie } });
    assert.equal(media.status, 200);
    assert.equal(await media.text(), "probe-bytes");
    assert.match(media.headers.get("cache-control") ?? "", /private, no-store/);

    const ranged = await fetch(`http://127.0.0.1:${PORT}${URL_PATH}`, {
      headers: { cookie, Range: "bytes=0-4" },
    });
    assert.equal(ranged.status, 206);
    assert.equal(await ranged.text(), "probe");

    const anon = await fetch(`http://127.0.0.1:${PORT}${URL_PATH}`);
    assert.equal(anon.status, 404);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
