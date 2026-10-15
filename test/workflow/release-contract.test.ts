import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

type Step = {
  name: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  name: string;
  if?: string;
  needs?: string;
  environment?: string;
  permissions?: Record<string, string>;
  steps: Step[];
};
type ReleaseWorkflow = {
  on: {
    workflow_dispatch: {
      inputs: Record<
        string,
        { required: boolean; type: string; default?: boolean }
      >;
    };
    push?: unknown;
    pull_request?: unknown;
  };
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: { preflight: Job; publish: Job };
};

async function readReleaseWorkflow(): Promise<ReleaseWorkflow> {
  return parse(
    await readFile(
      path.join(repositoryRoot, ".github/workflows/release.yml"),
      "utf8",
    ),
  ) as ReleaseWorkflow;
}

test("release only starts manually with an exact version, tag and dry-run default", async () => {
  const workflow = await readReleaseWorkflow();
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch.inputs).toEqual({
    expected_version: expect.objectContaining({
      required: true,
      type: "string",
    }),
    tag: expect.objectContaining({ required: true, type: "string" }),
    dry_run: expect.objectContaining({
      required: true,
      type: "boolean",
      default: true,
    }),
  });
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  expect(workflow.concurrency.group).toContain("inputs.expected_version");
});

test("dry-run preflight has read-only permissions and cannot execute publish or tag steps", async () => {
  const workflow = await readReleaseWorkflow();
  expect(workflow.permissions).toEqual({
    contents: "read",
    checks: "read",
    actions: "read",
  });
  expect(workflow.jobs.preflight.permissions).toBeUndefined();
  expect(workflow.jobs.publish.if).toBe("inputs.dry_run == false");
  expect(workflow.jobs.publish.needs).toBe("preflight");
  expect(workflow.jobs.publish.environment).toBe("npm-release");
  expect(workflow.jobs.publish.permissions).toEqual({
    contents: "write",
    checks: "read",
    actions: "read",
    "id-token": "write",
  });
  expect(
    workflow.jobs.preflight.steps.map((step) => step.run ?? "").join("\n"),
  ).not.toMatch(/npm publish|release-guard\.mjs tag|git push/);
  expect(
    workflow.jobs.preflight.steps.find(
      (step) => step.name === "Report dry-run result",
    )?.if,
  ).toBe("inputs.dry_run");
});

test("preflight validates exact SHA checks, release inputs, packed files, and distribution", async () => {
  const workflow = await readReleaseWorkflow();
  const steps = workflow.jobs.preflight.steps;
  const commands = steps.map((step) => step.run ?? "").join("\n");
  expect(commands).toContain(
    "actions/workflows/ci.yml/runs?head_sha=$RELEASE_SHA&per_page=100",
  );
  expect(commands).toContain("commits/$RELEASE_SHA/check-runs?per_page=100");
  expect(commands).toContain("--paginate --slurp");
  expect(commands).toContain("release-guard.mjs checks");
  expect(commands).toContain("release-guard.mjs metadata");
  expect(commands).toContain("npm pack --dry-run --json");
  expect(commands).toContain("release-guard.mjs packed");
  expect(commands).toContain("bun run test:distribution");
  expect(commands).toContain('test "$(openspec --version)" = "1.12.0"');
  expect(
    steps.find((step) => step.run?.includes("release-guard.mjs metadata"))?.env
      ?.RELEASE_BRANCH,
  ).toBe("${{ github.ref_name }}");
});

test("pinned actions and npm tooling match the existing CI toolchain", async () => {
  const workflow = await readReleaseWorkflow();
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
  const references = steps.flatMap((step) => (step.uses ? [step.uses] : []));
  expect(references).toContain(
    "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
  );
  expect(references).toContain(
    "oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76",
  );
  expect(references).toContain(
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  );
  for (const reference of references) {
    expect(reference).toMatch(/@[0-9a-f]{40}$/);
  }
  expect(steps.some((step) => step.with?.["bun-version"] === "1.4.2")).toBe(
    true,
  );
  expect(steps.some((step) => step.with?.["node-version"] === 24)).toBe(true);
  expect(steps.some((step) => step.run?.includes("npm@11.5.1"))).toBe(true);
});

test("PR CI stays read-only and has no publication credentials", async () => {
  const ci = await readFile(
    path.join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  );
  const workflow = parse(ci) as {
    permissions: Record<string, string>;
    jobs: Record<string, unknown>;
  };
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(Object.keys(workflow.jobs)).toHaveLength(5);
  expect(ci).not.toMatch(
    /npm publish|NPM_TOKEN|id-token:\s*write|release-guard\.mjs tag/,
  );
});

test("publication happens once, verification precedes tagging, and failure reports the published version", async () => {
  const workflow = await readReleaseWorkflow();
  const steps = workflow.jobs.publish.steps;
  const commands = steps.map((step) => step.run ?? "").join("\n");
  const publishIndex = steps.findIndex(
    (step) => step.name === "Publish once with provenance",
  );
  const verifyIndex = steps.findIndex(
    (step) => step.name === "Verify registered package and provenance",
  );
  const tagIndex = steps.findIndex(
    (step) => step.name === "Create and push verified tag",
  );
  const reportIndex = steps.findIndex((step) =>
    step.name.startsWith("Report published version for manual investigation"),
  );
  expect(publishIndex).toBeGreaterThanOrEqual(0);
  expect(verifyIndex).toBeGreaterThan(publishIndex);
  expect(tagIndex).toBeGreaterThan(verifyIndex);
  expect(reportIndex).toBeGreaterThan(tagIndex);
  expect(steps[publishIndex]!.run).toBe(
    "npm publish --provenance --access public",
  );
  expect(steps[publishIndex - 1]!.name).toBe(
    "Recheck protected main and exact-SHA CI",
  );
  expect(steps[publishIndex]!.id).toBe("publish");
  expect(steps[tagIndex]!.if).toBe("success()");
  expect(steps[reportIndex]!.if).toBe(
    "failure() && (steps.publish.outcome == 'success' || steps.publish.outcome == 'failure') && steps.release_page.outcome != 'success'",
  );
  expect(
    commands.match(/npm publish --provenance --access public/g),
  ).toHaveLength(1);
  expect(commands).toContain("npm audit signatures --json");

  expect(commands).toContain(
    "npm install --ignore-scripts --no-audit --no-fund --save-exact",
  );
  expect(commands).toContain('release-guard.mjs" verify');
  expect(commands).toContain("release-guard.mjs tag");
  expect(commands).toContain("Do not retry npm publication or tag creation");
  const releasePageIndex = steps.findIndex(
    (step) => step.name === "Create GitHub Release",
  );
  expect(releasePageIndex).toBeGreaterThan(tagIndex);
  expect(steps[releasePageIndex]!.if).toBe("success()");
  expect(steps[releasePageIndex]!.env?.GH_TOKEN).toBe("${{ github.token }}");
  expect(steps[releasePageIndex]!.run).toContain("gh release create");
  expect(steps[releasePageIndex]!.run).toContain("release-guard.mjs notes");
  expect(reportIndex).toBeGreaterThan(releasePageIndex);
  expect(commands).not.toMatch(/npm publish.*\bretry\b/i);
  expect(commands).toContain("repair the GitHub Release page manually");
});

test("protected publish job rechecks current main, CI, version vacancy and external readiness", async () => {
  const workflow = await readReleaseWorkflow();
  const steps = workflow.jobs.publish.steps;
  const commands = steps.map((step) => step.run ?? "").join("\n");
  expect(commands).toContain(
    "actions/workflows/ci.yml/runs?head_sha=$RELEASE_SHA&per_page=100",
  );
  expect(commands).toContain("release-guard.mjs checks");
  expect(commands).toContain("environments/npm-release");
  expect(commands).toContain("release-guard.mjs environment");
  expect(commands).toContain('test "$TRUSTED_PUBLISHER_READY" = "true"');
  expect(commands).toContain("release-guard.mjs metadata");
  expect(
    steps.find((step) => step.run?.includes("TRUSTED_PUBLISHER_READY"))?.env
      ?.TRUSTED_PUBLISHER_READY,
  ).toBe("${{ vars.NPM_TRUSTED_PUBLISHER_READY }}");
  const workflowSource = await readFile(
    path.join(repositoryRoot, ".github/workflows/release.yml"),
    "utf8",
  );
  expect(workflowSource).not.toMatch(
    /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/,
  );
});

async function runRegistryVisibility(mode: string) {
  const workflow = await readReleaseWorkflow();
  const script = workflow.jobs.publish.steps.find(
    (step) => step.name === "Verify registered package and provenance",
  )!.run!;
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-visibility-"));
  try {
    const bin = path.join(directory, "bin");
    mkdirSync(bin);
    const executable = (name: string, source: string) => {
      const target = path.join(bin, name);
      writeFileSync(target, source);
      chmodSync(target, 0o755);
    };
    executable(
      "npm",
      `#!/usr/bin/env node
const fs = require("node:fs");
const root = process.env.VISIBILITY_FIXTURE;
const action = process.argv[2];
fs.appendFileSync(root + "/commands", action + "\\n");
if (action === "view") {
  const count = fs.existsSync(root + "/reads") ? Number(fs.readFileSync(root + "/reads", "utf8")) : 0;
  fs.writeFileSync(root + "/reads", String(count + 1));
  const mode = process.env.VISIBILITY_MODE;
  if (mode === "hung") { setInterval(() => {}, 1000); }
  else if (mode === "pending" || (mode === "delayed" && count === 0)) {
    console.error("npm error code E404"); process.exit(1);
  } else if (mode === "network" || mode === "auth") {
    console.error("npm error code " + (mode === "auth" ? "E401" : "ECONNRESET")); process.exit(1);
  } else if (mode === "malformed") { console.log("not JSON"); }
  else { console.log(JSON.stringify(mode === "wrong" ? "1.2.4" : "1.2.3")); }
} else if (action === "install") { fs.writeFileSync(root + "/installed", "yes"); }
else if (action === "audit") { console.log(JSON.stringify({ invalid: [], missing: [] })); }
else if (action !== "init") { throw new Error("Unexpected npm command: " + action); }
`,
    );
    executable(
      "curl",
      "#!/bin/sh\nprintf '%s\\n' '{\"attestations\":[],\"keys\":[]}'\n",
    );
    executable("sleep", "#!/bin/sh\nexit 0\n");
    // Native timeout must terminate subprocesses; JS fake timers cannot drive its clock.
    executable(
      "timeout",
      '#!/bin/sh\nshift 2\nexec /usr/bin/timeout --kill-after=0.05s 1s "$@"\n',
    );
    const result = spawnSync("bash", ["-c", script], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_WORKSPACE: repositoryRoot,
        VISIBILITY_FIXTURE: directory,
        VISIBILITY_MODE: mode,
        EXPECTED_VERSION: "1.2.3",
        RELEASE_SHA: "a".repeat(40),
        VERSION_JSON: path.join(directory, "version.json"),
        AUDIT_JSON: path.join(directory, "audit.json"),
        ATTESTATIONS_JSON: path.join(directory, "attestations.json"),
        KEYS_JSON: path.join(directory, "keys.json"),
        PROVENANCE_MARKER: path.join(directory, "verified"),
      },
    });
    expect(result.error).toBeUndefined();
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      reads: Number(readFileSync(path.join(directory, "reads"), "utf8")),
      installed: existsSync(path.join(directory, "installed")),
      verified: existsSync(path.join(directory, "verified")),
      commands: readFileSync(path.join(directory, "commands"), "utf8")
        .trim()
        .split("\n"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("delayed registry visibility reaches strict provenance verification without republishing", async () => {
  const result = await runRegistryVisibility("delayed");
  expect(result.reads).toBe(2);
  expect(result.installed).toBe(true);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(
    "lacks verified provenance or publish attestation",
  );
  expect(result.verified).toBe(false);
  expect(result.commands).not.toContain("publish");
});

test("missing or hung registry visibility stops at deadline without installation or a marker", async () => {
  for (const mode of ["pending", "hung"]) {
    const result = await runRegistryVisibility(mode);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Registry visibility failed");
    expect(result.reads).toBeGreaterThanOrEqual(1);
    expect(result.installed).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.commands).not.toContain("publish");
  }
});

test("terminal registry errors and incorrect versions fail without retry or installation", async () => {
  for (const mode of ["network", "auth", "wrong", "malformed"]) {
    const result = await runRegistryVisibility(mode);
    expect(result.status).not.toBe(0);
    expect(result.reads).toBe(1);
    expect(result.installed).toBe(false);
    expect(result.verified).toBe(false);
    if (mode === "wrong") expect(result.output).toContain("did not match");
    if (mode === "network") expect(result.output).toContain("ECONNRESET");
    if (mode === "auth") expect(result.output).toContain("E401");
    expect(result.commands).not.toContain("publish");
  }
});

// Execute workflow shell bodies with external writes replaced by local command fakes.
test.each([
  { version: "1.2.3", prerelease: false },
  { version: "0.4.0", prerelease: false },
  { version: "10.20.30", prerelease: false },
  { version: "1.2.0-rc.2", prerelease: true },
  { version: "1.2.0-0", prerelease: true },
  { version: "1.2.0-123", prerelease: true },
  { version: "1.2.0-rc-candidate.2", prerelease: true },
  { version: "1.2.0-rc.2-x", prerelease: true },
])("publication outcomes gate page attempts and manual repair reports for $version", async ({
  version,
  prerelease,
}) => {
  const workflow = await readReleaseWorkflow();
  const steps = workflow.jobs.publish.steps;
  const publishIndex = steps.findIndex((step) => step.id === "publish");
  const report = steps.find((step) =>
    step.name.startsWith("Report published version"),
  )!;
  const page = steps.find((step) => step.id === "release_page")!;
  for (const failAt of [
    "checkout",
    "readiness",
    "publish",
    "verify",
    "tag",
    "page",
    "none",
    "auth",
  ]) {
    const directory = mkdtempSync(path.join(os.tmpdir(), "release-outcomes-"));
    const bin = path.join(directory, "bin");
    mkdirSync(bin);
    for (const name of ["npm", "node", "git", "gh"]) {
      const executable = path.join(bin, name);
      writeFileSync(
        executable,
        `#!/bin/bash
set -euo pipefail
name="$(basename "$0")"
action="$name $*"
printf '%s\\n' "$action" >> "$COMMAND_LOG"
case "$action" in
  "npm publish "*) test "$FAIL_AT" != publish ;;
  "node "*" tag")
    test "$#" = 2; test "$1" = .github/scripts/release-guard.mjs
    test -f "$PROVENANCE_MARKER"; test "$FAIL_AT" != tag ;;
  "node "*" notes")
    test "$#" = 2; test "$1" = .github/scripts/release-guard.mjs
    printf '%s\n' '- Curated change.' > "$NOTES_FILE" ;;
  "gh release create "*)
    printf '%s\\0' "$@" > "$PAGE_ARGS"
    expected=(release create "v$EXPECTED_VERSION" --title "v$EXPECTED_VERSION" --notes-file "$NOTES_FILE" --verify-tag)
    test "$#" = 8 || test "$#" = 9
    for argument in "\${expected[@]}"; do test "$1" = "$argument"; shift; done
    if test "$#" = 1; then test "$1" = --prerelease; fi
    test -n "\${GH_TOKEN:-}"
    test -s "$NOTES_FILE"
    test "$FAIL_AT" != page ;;
  "git config "*) ;;
  *) echo "Unexpected command: $action" >&2; exit 2 ;;
esac
`,
      );
      chmodSync(executable, 0o755);
    }
    const log = path.join(directory, "commands");
    writeFileSync(log, "");
    const marker = path.join(directory, "verified");
    const env = {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      FAIL_AT: failAt,
      COMMAND_LOG: log,
      PROVENANCE_MARKER: marker,
      EXPECTED_VERSION: version,
      REQUESTED_TAG: `v${version}`,
      PAGE_ARGS: path.join(directory, "page-args"),
      RELEASE_SHA: "a".repeat(40),
      DRY_RUN: "false",
      NOTES_FILE: path.join(directory, "notes.md"),
    };
    let failure = ["checkout", "readiness"].includes(failAt);
    let publishOutcome = "skipped";
    let pageOutcome = "skipped";
    for (const step of steps.slice(publishIndex, steps.indexOf(report))) {
      if (failure) continue;
      expect(step.if ?? "success()").toBe("success()");
      let result;
      if (step.name === "Verify registered package and provenance") {
        // Cryptographic failure/no-marker is exercised separately with the real helper.
        result = { status: failAt === "verify" ? 1 : 0 };
        if (result.status === 0) writeFileSync(marker, env.RELEASE_SHA + "\n");
      } else {
        result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", step.run!], {
          cwd: directory,
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...env,
            GH_TOKEN:
              step.env?.GH_TOKEN === "${{ github.token }}" && failAt !== "auth"
                ? "fixture-token"
                : "",
          },
        });
        expect(result.error).toBeUndefined();
      }
      const outcome = result.status === 0 ? "success" : "failure";
      if (step.id === "publish") publishOutcome = outcome;
      if (step.id === "release_page") pageOutcome = outcome;
      failure = outcome === "failure";
    }
    // Evaluate the parsed GitHub condition against the observed outcome context.
    const condition = report
      .if!.replace("failure()", String(failure))
      .replaceAll("steps.publish.outcome", JSON.stringify(publishOutcome))
      .replaceAll("steps.release_page.outcome", JSON.stringify(pageOutcome));
    const shouldReport = new Function(
      "return (" + condition + ")",
    )() as boolean;
    expect(shouldReport).toBe(
      !["checkout", "readiness", "none"].includes(failAt),
    );
    if (shouldReport) {
      const result = spawnSync(
        "bash",
        ["-e", "-o", "pipefail", "-c", report.run!],
        { cwd: directory, encoding: "utf8", env },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "Do not retry npm publication or tag creation",
      );
      expect(result.stdout).toContain(
        "repair the GitHub Release page manually",
      );
    }
    const commands = readFileSync(log, "utf8");
    if (["page", "none", "auth"].includes(failAt)) {
      const argumentsReceived = readFileSync(env.PAGE_ARGS, "utf8")
        .split("\0")
        .slice(0, -1);
      expect(argumentsReceived).toEqual([
        "release",
        "create",
        `v${version}`,
        "--title",
        `v${version}`,
        "--notes-file",
        env.NOTES_FILE,
        "--verify-tag",
        ...(prerelease ? ["--prerelease"] : []),
      ]);
      expect(
        argumentsReceived.filter((argument) => argument === "--prerelease"),
      ).toHaveLength(prerelease ? 1 : 0);
      expect(commands.indexOf("release-guard.mjs notes")).toBeGreaterThan(
        commands.indexOf("release-guard.mjs tag"),
      );
      expect(commands.indexOf("gh release create")).toBeGreaterThan(
        commands.indexOf("release-guard.mjs notes"),
      );
    } else {
      expect(existsSync(env.PAGE_ARGS)).toBe(false);
    }
    expect(commands.includes("gh release create")).toBe(
      ["page", "none", "auth"].includes(failAt),
    );
    expect(commands.includes("release-guard.mjs tag")).toBe(
      ["tag", "page", "none", "auth"].includes(failAt),
    );
    expect(pageOutcome).toBe(
      failAt === "none"
        ? "success"
        : ["page", "auth"].includes(failAt)
          ? "failure"
          : "skipped",
    );
    expect(commands.match(/npm publish/g)?.length ?? 0).toBe(
      ["checkout", "readiness"].includes(failAt) ? 0 : 1,
    );
  }
  expect(page.env?.GH_TOKEN).toBe("${{ github.token }}");
});
