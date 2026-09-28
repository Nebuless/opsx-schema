#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
let files = 0;
for (const skill of readdirSync(root, { withFileTypes: true }).filter(
  (entry) =>
    entry.isDirectory() && existsSync(resolve(root, entry.name, "SKILL.md")),
)) {
  const dir = resolve(root, skill.name);
  const entry = readFileSync(resolve(dir, "SKILL.md"), "utf8");
  const frontmatter = entry.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!frontmatter) errors.push(`${skill.name}: missing YAML frontmatter`);
  else {
    const name = frontmatter[1].match(/^name:\s*(\S+)\s*$/m)?.[1];
    const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1];
    if (
      name !== skill.name ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? "") ||
      name.length > 64
    )
      errors.push(`${skill.name}: invalid name`);
    if (!description || description.length > 1024)
      errors.push(`${skill.name}: invalid description`);
  }
  if (entry.split("\n").length > 500)
    errors.push(`${skill.name}: entry exceeds 500 lines`);
  function visit(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const target = resolve(path, item.name);
      if (item.isDirectory()) visit(target);
      else if (item.isFile() && item.name.endsWith(".md")) {
        files++;
        const body = readFileSync(target, "utf8");
        for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
          const link = match[1].split("#")[0];
          if (!link || /^[a-z]+:\/\//i.test(link) || link.startsWith("mailto:"))
            continue;
          const destination = resolve(
            dirname(target),
            decodeURIComponent(link),
          );
          if (!destination.startsWith(`${dir}/`) && destination !== dir)
            errors.push(
              `${relative(root, target)}: link escapes skill: ${link}`,
            );
          else if (!existsSync(destination))
            errors.push(`${relative(root, target)}: missing ${link}`);
        }
      }
    }
  }
  visit(dir);
}
const coverage = spawnSync(
  process.execPath,
  [resolve(root, "scripts/coverage.mjs")],
  { encoding: "utf8" },
);
if (coverage.status !== 0)
  errors.push(`coverage: ${coverage.stderr || coverage.stdout}`);
console.log(
  `${files} Markdown files; ${coverage.stdout.trim()}; ${errors.length} errors`,
);
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
