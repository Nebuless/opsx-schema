#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const usage = `Usage: node scripts/validate-skill.mjs [skill-dir] [--json] [--check-links]

Validate Agent Skills structure, frontmatter, local Markdown links, and reference metadata.
--check-links fetches each reference Canonical URL; it requires network access.`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage)
  process.exit(0)
}
const json = args.includes("--json")
const checkLinks = args.includes("--check-links")
const positional = args.filter((value) => !value.startsWith("-"))
if (positional.length > 1 || args.some((value) => value.startsWith("-") && !["--json", "--check-links"].includes(value))) {
  console.error(usage)
  process.exit(2)
}
const skillDir = resolve(positional[0] ?? dirname(dirname(fileURLToPath(import.meta.url))))
const result = { skillDir, errors: [], warnings: [], checked: { references: 0, localLinks: 0, canonicalLinks: 0 } }

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
function addError(message) {
  result.errors.push(message)
}
function localLinks(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\((?![a-z][a-z0-9+.-]*:|#)([^)\s]+)(?:\s+"[^"]*")?\)/gi)].map((match) => match[1])
}
function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/)
    if (field) fields[field[1]] = field[2].replace(/^['"]|['"]$/g, "")
  }
  return fields
}

const skillFile = join(skillDir, "SKILL.md")
if (!(await exists(skillFile))) addError("SKILL.md is missing")
let skillMarkdown = ""
if (result.errors.length === 0) {
  skillMarkdown = await readFile(skillFile, "utf8")
  const frontmatter = parseFrontmatter(skillMarkdown)
  if (!frontmatter) {
    addError("SKILL.md has no YAML frontmatter")
  } else {
    const directoryName = skillDir.split("/").filter(Boolean).at(-1)
    if (!frontmatter.name) addError("frontmatter name is missing")
    else if (frontmatter.name !== directoryName) addError(`frontmatter name ${frontmatter.name} does not match directory ${directoryName}`)
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name) || frontmatter.name.length > 64) addError("frontmatter name violates Agent Skills naming rules")
    if (!frontmatter.description || frontmatter.description.length > 1024) addError("frontmatter description is missing or exceeds 1024 characters")
  }
  if (skillMarkdown.split(/\r?\n/).length > 500) addError("SKILL.md exceeds 500 lines")
  for (const link of localLinks(skillMarkdown)) {
    result.checked.localLinks += 1
    if (!(await exists(resolve(skillDir, link)))) addError(`broken SKILL.md local link: ${link}`)
  }
}

const referencesDir = join(skillDir, "references")
if (!(await exists(referencesDir))) {
  addError("references directory is missing")
} else {
  for (const entry of await readdir(referencesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const path = join(referencesDir, entry.name)
    const markdown = await readFile(path, "utf8")
    result.checked.references += 1
    if (!markdown.startsWith("# ")) addError(`reference lacks H1: references/${entry.name}`)
    const canonical = markdown.match(/^\*\*Canonical:\*\*\s*(https:\/\/[^\s]+)/m)?.[1]
    if (!canonical) addError(`reference lacks HTTPS Canonical URL: references/${entry.name}`)
    for (const link of localLinks(markdown)) {
      result.checked.localLinks += 1
      if (!(await exists(resolve(referencesDir, link)))) addError(`broken reference local link: references/${entry.name} -> ${link}`)
    }
    if (checkLinks && canonical) {
      result.checked.canonicalLinks += 1
      try {
        let response = await fetch(canonical, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000) })
        if (response.status === 405 || response.status === 501) response = await fetch(canonical, { redirect: "follow", signal: AbortSignal.timeout(15_000) })
        if (!response.ok) addError(`canonical URL returned HTTP ${response.status}: ${canonical}`)
      } catch (error) {
        addError(`canonical URL request failed: ${canonical} (${error.message})`)
      }
    }
  }
}

if (json) console.log(JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2))
else {
  console.log(`Skill: ${skillDir}`)
  console.log(`References: ${result.checked.references}; local links: ${result.checked.localLinks}; canonical links: ${result.checked.canonicalLinks}`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  for (const error of result.errors) console.error(`Error: ${error}`)
  console.log(result.errors.length === 0 ? "Valid" : "Invalid")
}
process.exit(result.errors.length === 0 ? 0 : 1)
