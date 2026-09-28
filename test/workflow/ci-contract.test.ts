import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const workflowPath = path.join(repositoryRoot, ".github/workflows/ci.yml");
const documentedCheckNames = [
  "Commit history",
  "Quality",
  "Application tests",
  "Resource checks",
  "Package distribution smoke",
];

type Workflow = {
  on: { pull_request?: unknown; push?: { branches?: string[] } };
  permissions: Record<string, string>;
  concurrency: { "cancel-in-progress": boolean };
  jobs: Record<
    string,
    {
      name: string;
      steps: Array<{
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
      }>;
    }
  >;
};

async function readWorkflow(): Promise<Workflow> {
  return parse(await readFile(workflowPath, "utf8")) as Workflow;
}

test("CI runs on pull requests and main pushes with least privilege and cancellation", async () => {
  const workflow = await readWorkflow();
  expect(workflow.on.pull_request).toBeDefined();
  expect(workflow.on.push?.branches).toEqual(["main"]);
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
});

test("CI action references are pinned to the verified commit SHAs", async () => {
  const workflow = await readWorkflow();
  const references = Object.values(workflow.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.uses ? [step.uses] : [])),
  );
  expect(references).toContain(
    "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
  );
  expect(references).toContain(
    "oven-sh/setup-bun@735343b667d3e6f658f44d0eca948eb6282f2b76",
  );
  for (const reference of references) {
    expect(reference).toMatch(/@[0-9a-f]{40}$/);
  }
});

test("all jobs use Bun 1.4.2 and a frozen dependency install", async () => {
  const workflow = await readWorkflow();
  for (const job of Object.values(workflow.jobs)) {
    expect(
      job.steps.find((step) => step.uses?.startsWith("oven-sh/setup-bun@"))
        ?.with?.["bun-version"],
    ).toBe("1.4.2");
    expect(
      job.steps.some((step) => step.run === "bun install --frozen-lockfile"),
    ).toBe(true);
  }
});

test("stable job names match the documented branch-protection requirements", async () => {
  const workflow = await readWorkflow();
  const jobNames = Object.values(workflow.jobs).map((job) => job.name);
  const documentation = await readFile(
    path.join(repositoryRoot, "docs/ci.md"),
    "utf8",
  );
  const checkNameSection = documentation
    .split("Required CI check names:")[1]
    ?.split("\n\n")[0];
  expect(checkNameSection).toBeDefined();
  expect(jobNames).toEqual(documentedCheckNames);
  expect(
    checkNameSection!
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2)),
  ).toEqual(jobNames);
});

test("jobs cover full commit history, quality, application, resources, and package smoke", async () => {
  const workflow = await readWorkflow();
  const jobByName = Object.fromEntries(
    Object.entries(workflow.jobs).map(([id, job]) => [id, job]),
  );
  const historyJob = jobByName["commit-history"]!;
  expect(
    historyJob.steps.find((step) => step.uses?.startsWith("actions/checkout@"))
      ?.with?.["fetch-depth"],
  ).toBe(0);
  const history = historyJob.steps.map((step) => step.run ?? "").join("\n");
  expect(history).toContain('if [[ "$EVENT_NAME" == "pull_request" ]]');
  expect(history).toContain('base="$PR_BASE_SHA"');
  expect(history).toContain('head="$PR_HEAD_SHA"');
  expect(history).toContain('git merge-base "$base" "$head"');
  expect(history).toContain(
    'bun run commitlint:range --from "$merge_base" --to "$head"',
  );
  expect(history).toContain('base="$PUSH_BEFORE_SHA"');
  expect(history).toContain("git rev-list --max-parents=0");
  expect(history).toContain(
    'git show -s --format=%B "$root" | bun run commitlint',
  );
  expect(history).toContain(
    'bun run commitlint:range --from "$root" --to "$head"',
  );
  expect(history).toContain(
    'bun run commitlint:range --from "$base" --to "$head"',
  );

  const commands = Object.fromEntries(
    Object.entries(workflow.jobs).map(([id, job]) => [
      id,
      job.steps.map((step) => step.run ?? "").join("\n"),
    ]),
  );
  expect(commands.quality).toContain(
    "bun run format:check && bun run lint && bun run qlty:check && bun run typecheck",
  );
  expect(commands["application-tests"]).toContain("bun run test:application");
  expect(commands["resource-checks"]).toContain("bun run test:schemas");
  expect(commands["distribution-smoke"]).toContain("bun run test:distribution");
  for (const job of [
    jobByName["application-tests"]!,
    jobByName["resource-checks"]!,
    jobByName["distribution-smoke"]!,
  ]) {
    expect(
      job.steps.some(
        (step) =>
          step.run === "bun install --global @fission-ai/openspec@1.12.0",
      ),
    ).toBe(true);
    expect(
      job.steps.some(
        (step) => step.run === 'echo "$(bun pm bin -g)" >> "$GITHUB_PATH"',
      ),
    ).toBe(true);
    expect(
      job.steps.some(
        (step) => step.run === 'test "$(openspec --version)" = "1.12.0"',
      ),
    ).toBe(true);
  }
});

test("ordinary CI has no publication credentials or publish steps", async () => {
  const source = await readFile(workflowPath, "utf8");
  expect(source).not.toMatch(
    /\b(npm publish|bun publish|npm token|NPM_TOKEN|id-token:\s*write)\b/i,
  );
});

test("initial push validates the root commit message and skips an empty range", async () => {
  const workflow = await readWorkflow();
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .find((candidate) =>
      candidate.run?.includes('git show -s --format=%B "$root"'),
    );
  expect(step?.run).toBeDefined();
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "ci-root-commit-"),
  );
  try {
    const repository = path.join(temporaryDirectory, "repository");
    const binDirectory = path.join(temporaryDirectory, "bin");
    mkdirSync(repository);
    mkdirSync(binDirectory);
    const runGit = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: repository,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        throw new Error(result.stderr);
      }
      return result.stdout.trim();
    };
    runGit(["init", "-q"]);
    runGit(["config", "user.name", "Workflow Contract"]);
    runGit(["config", "user.email", "workflow@example.test"]);
    writeFileSync(path.join(repository, "file.txt"), "root");
    runGit(["add", "file.txt"]);
    runGit(["commit", "-q", "-m", "fix(ci): validate initial root"]);
    const head = runGit(["rev-parse", "HEAD"]);
    const logPath = path.join(temporaryDirectory, "bun.log");
    const bunPath = path.join(binDirectory, "bun");
    writeFileSync(
      bunPath,
      `#!/bin/sh
printf 'args:%s\\n' "$*" >> "$BUN_LOG"
if [ "$*" = "run commitlint" ]; then
  message="$(cat)"
  printf 'message:%s\\n' "$message" >> "$BUN_LOG"
  printf '%s\\n' "$message" | grep -Eq '^(feat|fix|docs|test|build|ci|refactor|perf|style|chore)(\\([^)]*\\))?: .+' || exit 1
  exit 0
fi
if [ "$*" = "run commitlint:range --from $head --to $head" ]; then
  exit 99
fi
exit 1
`,
    );
    chmodSync(bunPath, 0o755);
    const command = spawnSync("bash", ["-euo", "pipefail", "-c", step!.run!], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        BUN_LOG: logPath,
        EVENT_NAME: "push",
        PR_BASE_SHA: "",
        PR_HEAD_SHA: "",
        PUSH_BEFORE_SHA: "0000000000000000000000000000000000000000",
        PUSH_HEAD_SHA: head,
      },
    });
    expect(command.status).toBe(0);
    expect(readFileSync(logPath, "utf8")).toContain(
      "message:fix(ci): validate initial root",
    );
    expect(readFileSync(logPath, "utf8")).not.toContain("commitlint:range");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("initial push rejects an invalid root commit message", async () => {
  const workflow = await readWorkflow();
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps)
    .find((candidate) =>
      candidate.run?.includes('git show -s --format=%B "$root"'),
    );
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "ci-bad-root-"),
  );
  try {
    const repository = path.join(temporaryDirectory, "repository");
    const binDirectory = path.join(temporaryDirectory, "bin");
    mkdirSync(repository);
    mkdirSync(binDirectory);
    const runGit = (args: string[]) => {
      const result = spawnSync("git", args, {
        cwd: repository,
        encoding: "utf8",
      });
      if (result.status !== 0) {
        throw new Error(result.stderr);
      }
      return result.stdout.trim();
    };
    runGit(["init", "-q"]);
    runGit(["config", "user.name", "Workflow Contract"]);
    runGit(["config", "user.email", "workflow@example.test"]);
    writeFileSync(path.join(repository, "file.txt"), "root");
    runGit(["add", "file.txt"]);
    runGit(["commit", "-q", "-m", "bad root message"]);
    const head = runGit(["rev-parse", "HEAD"]);
    const logPath = path.join(temporaryDirectory, "bun.log");
    const bunPath = path.join(binDirectory, "bun");
    writeFileSync(
      bunPath,
      `#!/bin/sh
printf 'args:%s\\n' "$*" >> "$BUN_LOG"
if [ "$*" = "run commitlint" ]; then
  message="$(cat)"
  printf 'message:%s\\n' "$message" >> "$BUN_LOG"
  printf '%s\\n' "$message" | grep -Eq '^(feat|fix|docs|test|build|ci|refactor|perf|style|chore)(\\([^)]*\\))?: .+' || exit 1
  exit 0
fi
exit 1
`,
    );
    chmodSync(bunPath, 0o755);
    const command = spawnSync("bash", ["-euo", "pipefail", "-c", step!.run!], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        BUN_LOG: logPath,
        EVENT_NAME: "push",
        PR_BASE_SHA: "",
        PR_HEAD_SHA: "",
        PUSH_BEFORE_SHA: "0000000000000000000000000000000000000000",
        PUSH_HEAD_SHA: head,
      },
    });
    expect(command.status).not.toBe(0);
    expect(readFileSync(logPath, "utf8")).toContain("message:bad root message");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
