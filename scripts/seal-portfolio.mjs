import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const password = fs.readFileSync(".gate-secret", "utf8").trim();
if (!password) throw new Error("Missing .gate-secret");

const source = path.resolve("private/portfolio");
const outDir = path.resolve("dist/sealed/f");
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
const key = crypto.pbkdf2Sync(password, salt, iter, 32, "sha256");

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

fs.mkdirSync(outDir, { recursive: true });
const files = {};
for (const file of walk(source)) {
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
fs.writeFileSync(path.resolve("dist/sealed/manifest.json"), JSON.stringify(manifest));
console.log(`Sealed ${Object.keys(files).length} project files`);
