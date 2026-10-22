import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./seal-portfolio.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("seal root follows the script, not the shell directory", () => {
  assert.equal(projectRoot(), root);
});

test("seal fails clearly when GATE_PASSWORD is missing", async () => {
  const child = spawn(process.execPath, [path.join(root, "scripts/seal-portfolio.mjs")], {
    cwd: "/tmp",
    env: { ...process.env, GATE_PASSWORD: "" },
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.notEqual(code, 0);
  assert.match(stderr, /GATE_PASSWORD is not set/);
});
