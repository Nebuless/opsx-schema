#!/usr/bin/env node
import { access, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const usage = `Usage: node scripts/preflight.mjs [project-dir] [--json] [--strict]

Read-only check for React OpenTUI dependencies and TypeScript JSX configuration.
--strict exits nonzero for recommendations as well as configuration errors.`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage)
  process.exit(0)
}
const json = args.includes("--json")
const strict = args.includes("--strict")
const positional = args.filter((value) => !value.startsWith("-"))
if (positional.length > 1 || args.some((value) => value.startsWith("-") && !["--json", "--strict"].includes(value))) {
  console.error(usage)
  process.exit(2)
}
const projectDir = resolve(positional[0] ?? process.cwd())
const result = { projectDir, errors: [], warnings: [], facts: {} }

function parseJsonc(source) {
  let output = ""
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (inString) {
      output += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      output += char
    } else if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1
      output += "\n"
    } else if (char === "/" && next === "*") {
      index += 2
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1
      index += 1
    } else {
      output += char
    }
  }

  let normalized = ""
  inString = false
  escaped = false
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index]
    if (inString) {
      normalized += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      normalized += char
    } else if (char === ",") {
      let next = index + 1
      while (/\s/.test(output[next] ?? "")) next += 1
      if (output[next] !== "}" && output[next] !== "]") normalized += char
    } else {
      normalized += char
    }
  }
  return JSON.parse(normalized)
}

async function readJson(path) {
  try {
    return parseJsonc(await readFile(path, "utf8"))
  } catch (error) {
    result.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
const packagePath = join(projectDir, "package.json")
if (!(await fileExists(packagePath))) {
  result.errors.push(`package.json not found in ${projectDir}`)
} else {
  const pkg = await readJson(packagePath)
  if (pkg) {
    const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
    result.facts.packageManager = (await fileExists(join(projectDir, "bun.lock"))) ? "bun" : "npm-compatible"
    result.facts.dependencies = Object.fromEntries(["@opentui/react", "@opentui/core", "react"].map((name) => [name, dependencies[name] ?? null]))
    for (const name of ["@opentui/react", "@opentui/core", "react"]) {
      if (!dependencies[name]) result.errors.push(`missing dependency: ${name}`)
    }
    if (!pkg.type || pkg.type !== "module") result.warnings.push('package.json should set "type": "module" for Node.js OpenTUI applications')
    result.facts.scripts = Object.keys(pkg.scripts ?? {}).sort()
  }
}
const tsconfigPath = join(projectDir, "tsconfig.json")
if (!(await fileExists(tsconfigPath))) {
  result.warnings.push("tsconfig.json not found; TSX compiler settings could not be checked")
} else {
  const tsconfig = await readJson(tsconfigPath)
  if (tsconfig) {
    const compiler = tsconfig.compilerOptions ?? {}
    result.facts.tsconfig = {
      jsx: compiler.jsx ?? null,
      jsxImportSource: compiler.jsxImportSource ?? null,
      moduleResolution: compiler.moduleResolution ?? null,
      strict: compiler.strict ?? null,
    }
    if (compiler.jsx !== "react-jsx") result.errors.push('tsconfig compilerOptions.jsx must be "react-jsx"')
    if (compiler.jsxImportSource !== "@opentui/react") result.errors.push('tsconfig compilerOptions.jsxImportSource must be "@opentui/react"')
    if (compiler.moduleResolution !== "bundler") result.warnings.push('tsconfig compilerOptions.moduleResolution should be "bundler"')
    if (compiler.strict !== true) result.warnings.push("tsconfig compilerOptions.strict should be true")
  }
}
const failed = result.errors.length > 0 || (strict && result.warnings.length > 0)
if (json) console.log(JSON.stringify({ ok: !failed, ...result }, null, 2))
else {
  console.log(`Project: ${projectDir}`)
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  for (const error of result.errors) console.error(`Error: ${error}`)
  console.log(failed ? "Preflight failed" : "Preflight passed")
}
process.exit(failed ? 1 : 0)
