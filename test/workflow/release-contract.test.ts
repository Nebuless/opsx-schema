import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
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
  const reportIndex = steps.findIndex(
    (step) => step.name === "Report published version for manual investigation",
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
    "failure() && (steps.publish.outcome == 'success' || steps.publish.outcome == 'failure')",
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
  expect(commands).toContain("Do not retry or tag automatically");
  expect(commands).not.toMatch(
    /gh release create|softprops\/action-gh-release|npm publish.*\bretry\b/i,
  );
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

test("release guide links existing CI checks and names external setup", async () => {
  const [workflow, ciGuide, releaseGuide] = await Promise.all([
    readReleaseWorkflow(),
    readFile(path.join(repositoryRoot, "docs/ci.md"), "utf8"),
    readFile(path.join(repositoryRoot, "docs/npm-release.md"), "utf8"),
  ]);
  expect(ciGuide).toContain("[the npm release guide](npm-release.md)");
  expect(releaseGuide).toContain("[CI and local checks](ci.md)");
  expect(releaseGuide).toContain("root `package.json`");
  expect(releaseGuide).toContain("root `CHANGELOG.md`");
  expect(releaseGuide).toContain("Leave `dry_run` at its default `true`");
  expect(releaseGuide).toContain(
    "administrator must configure the GitHub environment named `npm-release`",
  );
  expect(releaseGuide).toContain(
    "configure trusted publishing for package `opsx-schema`",
  );
  expect(releaseGuide).toContain("NPM_TRUSTED_PUBLISHER_READY=true");
  expect(releaseGuide).toContain(
    "Do not rerun the workflow or tag it automatically",
  );
  expect(workflow.jobs.publish.environment).toBe("npm-release");
  expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
  const requiredChecks = ciGuide
    .split("Required CI check names:")[1]!
    .split("\n\n")[0]!
    .split("\n")
    .filter((line) => line.startsWith("- "));
  expect(requiredChecks).toHaveLength(5);
});
