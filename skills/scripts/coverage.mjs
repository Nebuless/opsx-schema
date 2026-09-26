#!/usr/bin/env node
// Offline-by-default inventory checker. Supply a GitHub tree JSON to refresh or compare.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "coverage/official-opentui.json");
const indexPath = resolve(root, "opentui/references/official-doc-index.md");
const prefix = "packages/web/src/content/";
const args = process.argv.slice(2);
const value = (key) => args[args.indexOf(key) + 1];
const treePath = args.includes("--tree") ? value("--tree") : null;
const refresh = args.includes("--refresh");
const renderIndex = (manifest) => {
  const sections = new Map();
  for (const page of manifest.pages) {
    const area = page.path.split("/")[1];
    if (!sections.has(area)) sections.set(area, []);
    sections.get(area).push(`- [${page.path.split("/").at(-1).replace(/\.mdx$/, "")}](${manifest.source}/blob/${manifest.revision}/${prefix}${page.path}) — ${page.skill}; ${page.status}`);
  }
  return `# Official OpenTUI documentation index\n\nGenerated from commit \`${manifest.revision}\`. Every canonical page is linked; \`review-needed\` is not an API endorsement. Consult the current official docs when behavior may have changed.\n\n${[...sections].map(([area, lines]) => `## ${area}\n\n${lines.join("\n")}`).join("\n\n")}\n`;
};
if (refresh && (!treePath || !args.includes("--revision"))) {
  throw new Error("Refresh requires --tree <GitHub tree JSON> --revision <40-character commit SHA>");
}

function pagesFromTree(file) {
  const tree = JSON.parse(readFileSync(file, "utf8"));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("GitHub tree missing or truncated");
  return tree.tree.filter((item) => item.path.startsWith(`${prefix}docs/`) && item.path.endsWith(".mdx"))
    .map((item) => ({ path: item.path.slice(prefix.length), sha: item.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
function owner(path) {
  if (path.startsWith("docs/bindings/react")) return "opentui-react";
  if (path.startsWith("docs/bindings/solid")) return "opentui-solid";
  if (path.startsWith("docs/components/")) return "opentui-components";
  if (path.startsWith("docs/core-concepts/testing") || path.startsWith("docs/test-and-debug/") || path.startsWith("docs/ship/") || path.includes("standalone-executables")) return "opentui-test-and-ship";
  if (path.startsWith("docs/core-concepts/layout") || path.startsWith("docs/core-concepts/colors") || path.startsWith("docs/core-concepts/text-and-cells")) return "opentui-design";
  return "opentui-core";
}
const incomingPages = treePath ? pagesFromTree(treePath) : null;
if (refresh) {
  const revision = value("--revision");
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Expected a full Git commit SHA");
  const previous = (() => { try { return JSON.parse(readFileSync(manifestPath, "utf8")); } catch { return { pages: [] }; } })();
  const byPath = new Map(previous.pages.map((page) => [page.path, page]));
  const pages = incomingPages.map(({ path, sha }) => {
    const prior = byPath.get(path);
    return { path, sha, skill: prior?.skill ?? owner(path), status: prior?.sha === sha ? prior.status : "review-needed" };
  });
  const manifest = { source: "https://github.com/anomalyco/opentui", revision, pages };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(indexPath, renderIndex(manifest));
  console.log(`Recorded ${pages.length} official pages at ${revision}`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const known = new Set();
  for (const page of manifest.pages) {
    if (known.has(page.path) || !page.path.startsWith("docs/") || !page.path.endsWith(".mdx")) throw new Error(`Invalid or duplicate path: ${page.path}`);
    if (!["linked", "review-needed", "verified"].includes(page.status)) throw new Error(`Invalid status for ${page.path}`);
    if (!/^[a-f0-9]{40}$/.test(page.sha)) throw new Error(`Invalid blob SHA for ${page.path}`);
    known.add(page.path);
    readFileSync(resolve(root, page.skill, "SKILL.md"), "utf8");
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.revision)) throw new Error("Invalid source revision");
  if (readFileSync(indexPath, "utf8") !== renderIndex(manifest)) throw new Error("Official index is stale; refresh from the pinned tree");
  if (incomingPages) {
    const incoming = new Set(incomingPages.map((p) => p.path));
    const missing = [...incoming].filter((p) => !known.has(p));
    const removed = [...known].filter((p) => !incoming.has(p));
    const blobs = new Map(manifest.pages.map((p) => [p.path, p.sha]));
    const changed = incomingPages.filter((p) => blobs.has(p.path) && blobs.get(p.path) !== p.sha).map((p) => p.path);
    if (missing.length || removed.length || changed.length) {
      console.error(JSON.stringify({ missing, removed, changed }, null, 2));
      process.exitCode = 1;
    }
  }
  console.log(`${manifest.pages.length} pages; ${manifest.pages.filter((p) => p.status === "review-needed").length} require API review; source ${manifest.revision}`);
}
