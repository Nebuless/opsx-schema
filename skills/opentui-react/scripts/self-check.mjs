#!/usr/bin/env node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const skillDir = dirname(scriptDir)
const tempDir = await mkdtemp(join(tmpdir(), "opentui-react-skill-"))

function run(script, args) {
  const result = spawnSync(process.execPath, [join(scriptDir, script), ...args], { encoding: "utf8" })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const validSkill = run("validate-skill.mjs", [skillDir, "--json"])
  assert(validSkill.status === 0, `valid skill rejected: ${validSkill.stderr || validSkill.stdout}`)
  assert(JSON.parse(validSkill.stdout).ok === true, "valid skill JSON did not report ok")

  const invalidSkillDir = join(tempDir, "bad-skill")
  await mkdir(join(invalidSkillDir, "references"), { recursive: true })
  await writeFile(join(invalidSkillDir, "SKILL.md"), "---\nname: wrong-name\ndescription: bad fixture\n---\n")
  const invalidSkill = run("validate-skill.mjs", [invalidSkillDir, "--json"])
  assert(invalidSkill.status === 1, "invalid skill was accepted")

  const projectDir = join(tempDir, "project")
  await mkdir(projectDir)
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify({ type: "module", dependencies: { "@opentui/react": "1", "@opentui/core": "1", react: "19.2.0" }, scripts: { typecheck: "node -e \"process.stdout.write('checked')\"" } }),
  )
  await writeFile(join(projectDir, "tsconfig.json"), '{\n  // TS config accepts comments and trailing commas\n  "compilerOptions": {\n    "jsx": "react-jsx",\n    "jsxImportSource": "@opentui/react",\n    "moduleResolution": "bundler",\n    "strict": true,\n  },\n}\n')
  const preflight = run("preflight.mjs", [projectDir, "--json", "--strict"])
  assert(preflight.status === 0, `JSONC preflight failed: ${preflight.stderr || preflight.stdout}`)
  assert(JSON.parse(preflight.stdout).ok === true, "preflight JSON did not report ok")

  const check = run("run-project-check.mjs", [projectDir, "--check", "typecheck", "--json"])
  assert(check.status === 0, `project check failed: ${check.stderr || check.stdout}`)
  const checkOutput = JSON.parse(check.stdout)
  assert(checkOutput.ok === true && checkOutput.stdout.includes("checked"), "project check did not run fixture script")

  console.log("Skill scripts passed self-check")
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
