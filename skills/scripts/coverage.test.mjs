import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(root, "scripts/coverage.mjs");
const manifest = JSON.parse(
  readFileSync(resolve(root, "coverage/official-opentui.json"), "utf8"),
);
const prefix = "packages/web/src/content/";
const dir = mkdtempSync(resolve(tmpdir(), "opentui-coverage-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
function check(pages) {
  const path = resolve(dir, "tree.json");
  writeFileSync(
    path,
    JSON.stringify({
      truncated: false,
      tree: pages.map((p) => ({ path: prefix + p.path, sha: p.sha })),
    }),
  );
  return spawnSync(process.execPath, [script, "--tree", path], {
    encoding: "utf8",
  });
}
test("same upstream tree is clean", () => {
  assert.equal(check(manifest.pages).status, 0);
});
test("new documentation page is detected", () => {
  const result = check([
    ...manifest.pages,
    { path: "docs/new-topic.mdx", sha: "a".repeat(40) },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docs\/new-topic\.mdx/);
});
test("modified page blob is detected", () => {
  const pages = manifest.pages.map((page, i) =>
    i === 0 ? { ...page, sha: "b".repeat(40) } : page,
  );
  const result = check(pages);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"changed"/);
});
