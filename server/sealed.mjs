import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function decrypt(key, packed) {
  if (!Buffer.isBuffer(packed) || packed.length < 28) return null;
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(packed.length - 16);
  const body = packed.subarray(12, packed.length - 16);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    return null;
  }
}

export function openPortfolioSeal(dir, password) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  if (!password || !manifest || typeof manifest.salt !== "string" || typeof manifest.files !== "object") return null;
  const key = crypto.pbkdf2Sync(password, Buffer.from(manifest.salt, "base64"), Number(manifest.iter) || 600000, 32, "sha256");
  const verified = decrypt(key, Buffer.from(String(manifest.verify ?? ""), "base64"));
  if (!verified || verified.toString("utf8") !== "ok") return null;
  const cache = new Map();
  const fileDir = path.join(dir, "f");
  return {
    read(urlPath) {
      const id = manifest.files[urlPath];
      if (typeof id !== "string" || !/^[a-f0-9]+$/.test(id)) return null;
      if (cache.has(id)) return cache.get(id);
      const file = path.join(fileDir, id);
      const base = fileDir.endsWith(path.sep) ? fileDir : fileDir + path.sep;
      if (!file.startsWith(base) || !fs.existsSync(file)) return null;
      const plain = decrypt(key, fs.readFileSync(file));
      if (!plain) return null;
      cache.set(id, plain);
      return plain;
    },
  };
}
