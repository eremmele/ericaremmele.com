import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function password() {
  const value = (process.env.GATE_PASSWORD ?? "").trim();
  if (!value) {
    fail(
      "Production build failed: GATE_PASSWORD is not set. Set it in the Lightsail environment, then run npm run build.",
    );
  }
  return value;
}

function main() {
  const secret = password();
  const root = projectRoot();
  const source = path.join(root, "private/portfolio");
  const outDir = path.join(root, "dist/sealed/f");
  const manifestPath = path.join(root, "dist/sealed/manifest.json");
  if (!fs.existsSync(source)) {
    fail(
      `Production build failed: private portfolio not found at ${source}. Copy private/portfolio onto the instance before building.`,
    );
  }

  const skip = new Set([
    "bridgeway",
    "carousel",
    "cyber-print",
    "undrmnd",
    "motion-study.jpg",
    "placeholder-1.svg",
    "placeholder-2.svg",
    "placeholder-3.svg",
  ]);

  const salt = crypto.randomBytes(16);
  const iter = 600000;
  const key = crypto.pbkdf2Sync(secret, salt, iter, 32, "sha256");

  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    return Buffer.concat([iv, body]);
  }

  function walk(dir, prefix = "") {
    const files = [];
    for (const name of fs.readdirSync(dir)) {
      if (prefix === "" && skip.has(name)) continue;
      if (name === ".DS_Store" || name === "robots.txt") continue;
      const abs = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(abs).isDirectory()) files.push(...walk(abs, rel));
      else files.push({ abs, rel });
    }
    return files;
  }

  const found = walk(source);
  if (found.length === 0) {
    fail(`Production build failed: private portfolio at ${source} has no files to seal.`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const files = {};
  for (const file of found) {
    const id = crypto.randomBytes(8).toString("hex");
    fs.writeFileSync(path.join(outDir, id), encrypt(fs.readFileSync(file.abs)));
    files[`/portfolio/${file.rel}`] = id;
  }

  const manifest = {
    salt: salt.toString("base64"),
    iter,
    verify: encrypt(Buffer.from("ok")).toString("base64"),
    files,
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`Sealed ${Object.keys(files).length} project files`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
