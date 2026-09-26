#!/usr/bin/env node
import { access, readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"

const usage = `Usage: node scripts/run-project-check.mjs [project-dir] --check test|typecheck|build [--json]

Run an existing named package script. Uses Bun when bun.lock exists and bun is available; otherwise npm.
This command may create project-defined build or test artifacts. It never installs dependencies.`
const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage)
  process.exit(0)
}
const json = args.includes("--json")
const checkIndex = args.indexOf("--check")
const check = checkIndex === -1 ? null : args[checkIndex + 1]
const positional = args.filter((value, index) => !value.startsWith("-") && index !== checkIndex + 1)
if (!check || !["test", "typecheck", "build"].includes(check) || positional.length > 1 || args.some((value, index) => value.startsWith("-") && !["--json", "--check"].includes(value) && index !== checkIndex + 1)) {
  console.error(usage)
  process.exit(2)
}
const projectDir = resolve(positional[0] ?? process.cwd())
const packagePath = join(projectDir, "package.json")
let pkg
try {
  pkg = JSON.parse(await readFile(packagePath, "utf8"))
} catch (error) {
  console.error(`Error: cannot read ${packagePath}: ${error.message}`)
  process.exit(1)
}
if (!pkg.scripts?.[check]) {
  console.error(`Error: package.json has no ${JSON.stringify(check)} script`)
  process.exit(1)
}
let useBun = false
try {
  await access(join(projectDir, "bun.lock"))
  useBun = await new Promise((resolve) => {
    const probe = spawn("bun", ["--version"], { stdio: "ignore" })
    probe.once("error", () => resolve(false))
    probe.once("exit", (code) => resolve(code === 0))
  })
} catch {}
const command = useBun ? "bun" : "npm"
const commandArgs = useBun ? ["run", check] : ["run", check]
const startedAt = Date.now()
const child = spawn(command, commandArgs, { cwd: projectDir, stdio: json ? ["ignore", "pipe", "pipe"] : "inherit" })
let stdout = ""
let stderr = ""
if (json) {
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
}
child.on("error", (error) => {
  const output = { ok: false, projectDir, check, command: [command, ...commandArgs], error: error.message }
  if (json) console.log(JSON.stringify(output, null, 2))
  else console.error(`Error: ${error.message}`)
  process.exit(1)
})
child.on("exit", (code, signal) => {
  const output = { ok: code === 0, projectDir, check, command: [command, ...commandArgs], exitCode: code, signal, durationMs: Date.now() - startedAt, ...(json ? { stdout, stderr } : {}) }
  if (json) console.log(JSON.stringify(output, null, 2))
  process.exit(code === 0 ? 0 : 1)
})
