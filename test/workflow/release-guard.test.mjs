import { expect, test } from "bun:test";
import { Lexer } from "marked";
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
import {
  assertCurrentProtectedMain,
  assertPackedFiles,
  assertProtectedReleaseEnvironment,
  assertPublishedVersion,
  assertReleaseClaims,
  assertRegistryVersionUnused,
  assertReleaseMetadata,
  releaseNotes,
  assertRequiredChecks,
  assertTagAuthorized,
  assertTagUnused,
  assertVerifiedProvenance,
  createVerifiedMarker,
  REQUIRED_CHECKS,
} from "../../.github/scripts/release-guard.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const releaseSha = "a".repeat(40);
const trustedSuite = 91;
const startedAt = "2026-09-28T12:00:00Z";

function checkRun(name, id, overrides = {}) {
  return {
    name,
    id,
    head_sha: releaseSha,
    app: { slug: "github-actions" },
    check_suite: { id: trustedSuite },
    status: "completed",
    conclusion: "success",
    started_at: startedAt,
    ...overrides,
  };
}

function workflowRun(overrides = {}) {
  return {
    id: 100,
    path: ".github/workflows/ci.yml@refs/heads/main",
    head_sha: releaseSha,
    head_branch: "main",
    event: "push",
    check_suite_id: trustedSuite,
    run_started_at: startedAt,
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

test("required names match the five documented protected CI checks", async () => {
  const documentation = await readFile(
    path.join(repositoryRoot, "docs/ci.md"),
    "utf8",
  );
  const names = documentation
    .split("Required CI check names:")[1]
    .split("\n\n")[0]
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  expect(REQUIRED_CHECKS).toEqual(names);
});

test("only the current protected main SHA can be released", () => {
  const branch = { name: "main", protected: true, commit: { sha: releaseSha } };
  expect(() => assertCurrentProtectedMain(branch, releaseSha)).not.toThrow();
  expect(() =>
    assertCurrentProtectedMain({ ...branch, protected: false }, releaseSha),
  ).toThrow("current protected main tip");
  expect(() => assertCurrentProtectedMain(branch, "b".repeat(40))).toThrow(
    "current protected main tip",
  );
  expect(() => assertCurrentProtectedMain(branch, "invalid")).toThrow(
    "40-character commit ID",
  );
});

test("paginated out-of-order duplicate attempts accept the latest trusted success", () => {
  const historicalFailure = checkRun(REQUIRED_CHECKS[0], 10, {
    started_at: "2026-09-28T11:00:00Z",
    conclusion: "failure",
  });
  const latestSuccess = checkRun(REQUIRED_CHECKS[0], 11);
  const checkPages = [
    {
      check_runs: [
        latestSuccess,
        ...REQUIRED_CHECKS.slice(1, 3).map((name, id) =>
          checkRun(name, id + 20),
        ),
      ],
    },
    {
      check_runs: [
        historicalFailure,
        ...REQUIRED_CHECKS.slice(3).map((name, id) => checkRun(name, id + 30)),
      ],
    },
  ];
  const workflowPages = [
    { workflow_runs: [] },
    { workflow_runs: [workflowRun()] },
  ];
  expect(() =>
    assertRequiredChecks(checkPages, workflowPages, releaseSha),
  ).not.toThrow();
});

test("newer failed or unfinished authoritative attempt blocks an older success", () => {
  const passed = REQUIRED_CHECKS.map((name, id) => checkRun(name, id + 10));
  const older = { ...passed[0], started_at: "2026-09-28T11:00:00Z" };
  const workflowPages = [{ workflow_runs: [workflowRun()] }];
  for (const latest of [
    checkRun(REQUIRED_CHECKS[0], 50, { conclusion: "failure" }),
    checkRun(REQUIRED_CHECKS[0], 51, {
      status: "in_progress",
      conclusion: null,
    }),
  ]) {
    expect(() =>
      assertRequiredChecks(
        [{ check_runs: [older, ...passed.slice(1), latest] }],
        workflowPages,
        releaseSha,
      ),
    ).toThrow("Latest required CI check did not succeed");
  }
});

test("a newer CI workflow attempt without jobs blocks old successful check runs", () => {
  const checkPages = [
    { check_runs: REQUIRED_CHECKS.map((name, id) => checkRun(name, id + 10)) },
  ];
  for (const newest of [
    workflowRun({
      id: 200,
      check_suite_id: 92,
      run_started_at: "2026-09-28T13:00:00Z",
      status: "queued",
      conclusion: null,
    }),
    workflowRun({
      id: 201,
      check_suite_id: 93,
      run_started_at: "2026-09-28T13:00:00Z",
      conclusion: "failure",
    }),
  ]) {
    expect(() =>
      assertRequiredChecks(
        checkPages,
        [{ workflow_runs: [newest, workflowRun()] }],
        releaseSha,
      ),
    ).toThrow("Latest trusted CI workflow attempt did not succeed");
  }
});

test("release environment must have reviewers and protected-main deployment", () => {
  const environment = {
    name: "npm-release",
    protection_rules: [
      { type: "required_reviewers", reviewers: [{ type: "Team" }] },
    ],
    deployment_branch_policy: {
      protected_branches: true,
      custom_branch_policies: false,
    },
  };
  expect(() => assertProtectedReleaseEnvironment(environment)).not.toThrow();
  expect(() =>
    assertProtectedReleaseEnvironment({ ...environment, protection_rules: [] }),
  ).toThrow("required reviewers and protected-branch deployment");
  expect(() =>
    assertProtectedReleaseEnvironment({
      ...environment,
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
    }),
  ).toThrow("required reviewers and protected-branch deployment");
});

test("untrusted same-name runs never fill a missing check or override trusted results", () => {
  const trusted = REQUIRED_CHECKS.slice(1).map((name, id) =>
    checkRun(name, id + 10),
  );
  const impersonators = [
    checkRun(REQUIRED_CHECKS[0], 100, { app: { slug: "other-app" } }),
    checkRun(REQUIRED_CHECKS[0], 101, { check_suite: { id: 999 } }),
    checkRun(REQUIRED_CHECKS[0], 102, { head_sha: "b".repeat(40) }),
  ];
  const workflowPages = [
    {
      workflow_runs: [
        workflowRun({
          check_suite_id: 999,
          path: ".github/workflows/other.yml",
        }),
        workflowRun(),
      ],
    },
  ];
  expect(() =>
    assertRequiredChecks(
      [{ check_runs: [...trusted, ...impersonators] }],
      workflowPages,
      releaseSha,
    ),
  ).toThrow(`Missing trusted required CI check: ${REQUIRED_CHECKS[0]}`);
  expect(() =>
    assertRequiredChecks(
      [
        {
          check_runs: [
            ...trusted,
            ...impersonators,
            checkRun(REQUIRED_CHECKS[0], 1),
          ],
        },
      ],
      workflowPages,
      releaseSha,
    ),
  ).not.toThrow();
});

test("a missing required check or trusted workflow run fails closed", () => {
  const checkPages = [
    {
      check_runs: REQUIRED_CHECKS.slice(1).map((name, id) =>
        checkRun(name, id),
      ),
    },
  ];
  expect(() =>
    assertRequiredChecks(
      checkPages,
      [{ workflow_runs: [workflowRun()] }],
      releaseSha,
    ),
  ).toThrow("Missing trusted required CI check");
  expect(() =>
    assertRequiredChecks(checkPages, [{ workflow_runs: [] }], releaseSha),
  ).toThrow("No trusted CI workflow run");
});

test("version, tag, package and dated substantive root notes must agree", () => {
  const environment = {
    EXPECTED_VERSION: "1.2.3",
    REQUESTED_TAG: "v1.2.3",
    RELEASE_BRANCH: "main",
  };
  const manifest = { name: "opsx-schema", version: "1.2.3" };
  const notes =
    "## [Unreleased]\n\n## [1.2.3] - 2026-09-28\n\n### Fixed\n\n- Explain the actual change.\n\n## [1.2.2] - 2026-09-01\n";
  expect(() =>
    assertReleaseMetadata(environment, manifest, notes),
  ).not.toThrow();
  expect(() =>
    assertReleaseMetadata(
      environment,
      manifest,
      notes.replace("- Explain", "- [x] Explain"),
    ),
  ).not.toThrow();
  expect(() =>
    assertReleaseMetadata(
      environment,
      manifest,
      notes.replace("- Explain the actual change.", "- 修复发布检查。"),
    ),
  ).not.toThrow();
  expect(() =>
    assertReleaseMetadata(
      { ...environment, REQUESTED_TAG: "v1.2.4" },
      manifest,
      notes,
    ),
  ).toThrow("Requested tag");
  expect(() =>
    assertReleaseMetadata(
      environment,
      { ...manifest, version: "1.2.4" },
      notes,
    ),
  ).toThrow("Package name and version");
  expect(() =>
    assertReleaseMetadata(
      environment,
      manifest,
      notes.replace("2026-09-28", "2026-02-30"),
    ),
  ).toThrow("invalid ISO date");
  expect(() =>
    assertReleaseMetadata(
      environment,
      manifest,
      notes.replace("[1.2.3]", "[1x2y3]"),
    ),
  ).toThrow("dated matching version entry");
});

test("empty, heading-only, and placeholder release entries fail before the next section", () => {
  const environment = {
    EXPECTED_VERSION: "1.2.3",
    REQUESTED_TAG: "v1.2.3",
    RELEASE_BRANCH: "main",
  };
  const manifest = { name: "opsx-schema", version: "1.2.3" };
  for (const body of [
    "",
    "### Added\n",
    "-\n",
    "- \n",
    "- TODO: notes\n",
    "- [ ] TODO: notes\n",
    "- [ ] Explain the actual change.\n",
    "- [x] TODO: notes\n",
    "- [x]\n",
    "placeholder\n",
    "<!-- TODO -->\n",
    "- <!-- TODO -->\n",
    "1. <!-- TODO -->\n",
    "- [x] <!-- TODO -->\n",
    "- <!--\nTODO: notes\n-->\n",
    "- ### Fixed\n",
    "---\n",
    "***\n",
    "___\n",
    "- - -\n",
    "```js\n```\n",
    "~~~text\n~~~\n",
    "> TODO: notes\n",
    "> - TODO: notes\n",
    "- <br>\n",
    "- [x] <br>\n",
    "- [](https://example.com)\n",
  ]) {
    const changelog = `## [1.2.3] - 2026-09-28\n${body}\n## [1.2.2] - 2026-09-01\n- Existing notes`;
    expect(() =>
      assertReleaseMetadata(environment, manifest, changelog),
    ).toThrow("substantive release notes");
  }
  expect(() =>
    assertReleaseMetadata(
      environment,
      manifest,
      "```md\n## [1.2.3] - 2026-09-28\n- Example change\n```\n## [1.2.2] - 2026-09-01\n- Existing notes",
    ),
  ).toThrow("dated matching version entry");
});

test("tag and registry lookups distinguish existing versions from outages", () => {
  expect(() => assertTagUnused("", "v1.2.3")).not.toThrow();
  expect(() =>
    assertTagUnused(`${"a".repeat(40)}\trefs/tags/v1.2.3\n`, "v1.2.3"),
  ).toThrow("already exists");
  expect(() =>
    assertRegistryVersionUnused(
      { status: 1, stderr: "npm error code E404\n" },
      "1.2.3",
    ),
  ).not.toThrow();
  expect(() =>
    assertRegistryVersionUnused(
      { status: 0, stderr: "", stdout: '"1.2.3"' },
      "1.2.3",
    ),
  ).toThrow("already exists");
  expect(() =>
    assertRegistryVersionUnused(
      { status: 1, stderr: "npm error code ECONNRESET\n" },
      "1.2.3",
    ),
  ).toThrow("availability is unverified");
});

test("packed inventory includes runtime resources and excludes project history", () => {
  const files = [
    "package.json",
    "LICENSE",
    "src/domain/cli.ts",
    "assets/schemas/manifest.json",
    "assets/adapters/manifest.json",
    "resources/openspec/schemas/intent-driven-design/schema.yaml",
  ].map((file) => ({ path: file }));
  const packageEntry = { name: "opsx-schema", version: "1.2.3", files };
  expect(() => assertPackedFiles([packageEntry], "1.2.3")).not.toThrow();
  expect(() =>
    assertPackedFiles({ "opsx-schema": packageEntry }, "1.2.3"),
  ).not.toThrow();
  expect(() =>
    assertPackedFiles([{ ...packageEntry, files: files.slice(1) }], "1.2.3"),
  ).toThrow("Missing packed file");
  expect(() =>
    assertPackedFiles(
      [
        {
          ...packageEntry,
          files: [...files, { path: "resources/openspec/changes/private.md" }],
        },
      ],
      "1.2.3",
    ),
  ).toThrow("Unexpected packed file");
  expect(() => assertPackedFiles([packageEntry], "1.2.4")).toThrow(
    "inventory is invalid",
  );
});

function attestation(predicateType, statement) {
  return {
    predicateType,
    bundle: {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      },
    },
  };
}

function registryAttestations(version, sha) {
  const provenanceType = "https://slsa.dev/provenance/v1";
  const publishType =
    "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
  return {
    attestations: [
      attestation(provenanceType, {
        predicateType: provenanceType,
        subject: [{ name: `pkg:npm/opsx-schema@${version}` }],
        predicate: {
          buildDefinition: {
            externalParameters: {
              workflow: {
                repository: "https://github.com/Nebuless/opsx-schema",
                path: ".github/workflows/release.yml",
                ref: "refs/heads/main",
              },
            },
            resolvedDependencies: [
              {
                uri: "git+https://github.com/Nebuless/opsx-schema@refs/heads/main",
                digest: { gitCommit: sha },
              },
            ],
          },
          runDetails: {
            builder: {
              id: "https://github.com/actions/runner/github-hosted",
            },
          },
        },
      }),
      attestation(publishType, {
        predicateType: publishType,
        predicate: { name: "opsx-schema", version },
      }),
    ],
  };
}

test("registry version and signed statement claims identify the exact release", () => {
  expect(() => assertPublishedVersion(["1.2.3"], "1.2.3")).not.toThrow();
  expect(() => assertPublishedVersion(["1.2.4"], "1.2.3")).toThrow(
    "did not match",
  );
  expect(() =>
    assertReleaseClaims(
      registryAttestations("1.2.3", releaseSha),
      "1.2.3",
      releaseSha,
    ),
  ).not.toThrow();
  expect(() =>
    assertReleaseClaims(
      registryAttestations("1.2.3", releaseSha),
      "1.2.3",
      "b".repeat(40),
    ),
  ).toThrow("workflow and commit");
  const missingPublish = registryAttestations("1.2.3", releaseSha);
  missingPublish.attestations.pop();
  expect(() =>
    assertReleaseClaims(missingPublish, "1.2.3", releaseSha),
  ).toThrow("lacks verified provenance or publish attestation");
  const wrongWorkflow = registryAttestations("1.2.3", releaseSha);
  const payload = wrongWorkflow.attestations[0].bundle.dsseEnvelope;
  const statement = JSON.parse(
    Buffer.from(payload.payload, "base64").toString("utf8"),
  );
  statement.predicate.buildDefinition.externalParameters.workflow.path =
    ".github/workflows/other.yml";
  payload.payload = Buffer.from(JSON.stringify(statement)).toString("base64");
  expect(() => assertReleaseClaims(wrongWorkflow, "1.2.3", releaseSha)).toThrow(
    "workflow and commit",
  );
});

test("unsigned registry claims cannot pass with clean audit arrays", async () => {
  const claims = registryAttestations("1.2.3", releaseSha);
  for (const audit of [
    { invalid: [{ name: "opsx-schema" }], missing: [] },
    { invalid: [], missing: [{ name: "opsx-schema" }] },
    {},
  ]) {
    await expect(
      assertVerifiedProvenance(
        audit,
        claims,
        { keys: [] },
        "1.2.3",
        releaseSha,
      ),
    ).rejects.toThrow("Signature audit did not verify");
  }
  await expect(
    assertVerifiedProvenance(
      { invalid: [], missing: [] },
      claims,
      { keys: [] },
      "1.2.3",
      releaseSha,
    ),
  ).rejects.toThrow();
});

test("dry run and missing provenance marker block tagging", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-tag-guard-"));
  try {
    const marker = path.join(directory, "verified");
    const environment = {
      EXPECTED_VERSION: "1.2.3",
      REQUESTED_TAG: "v1.2.3",
      RELEASE_SHA: releaseSha,
      PROVENANCE_MARKER: marker,
      DRY_RUN: "false",
    };
    await expect(
      assertTagAuthorized({ ...environment, DRY_RUN: "true" }),
    ).rejects.toThrow("disabled during dry runs");
    await expect(assertTagAuthorized(environment)).rejects.toThrow(
      "Provenance verification did not complete",
    );
    await createVerifiedMarker(marker, releaseSha);
    await expect(assertTagAuthorized(environment)).resolves.toBeUndefined();
    await expect(
      assertTagAuthorized({ ...environment, RELEASE_SHA: "b".repeat(40) }),
    ).rejects.toThrow("not verified for the release SHA");
    await expect(createVerifiedMarker(marker, releaseSha)).rejects.toThrow();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tag CLI invokes Git only after a verified marker and dry-run guard", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-tag-cli-"));
  try {
    const binDirectory = path.join(directory, "bin");
    mkdirSync(binDirectory);
    const gitLog = path.join(directory, "git.log");
    const gitPath = path.join(binDirectory, "git");
    writeFileSync(gitPath, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$GIT_LOG"\n');
    chmodSync(gitPath, 0o755);
    const marker = path.join(directory, "verified");
    const environment = {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      GIT_LOG: gitLog,
      PROVENANCE_MARKER: marker,
      EXPECTED_VERSION: "1.2.3",
      REQUESTED_TAG: "v1.2.3",
      RELEASE_SHA: releaseSha,
      DRY_RUN: "false",
    };
    const helper = path.join(
      repositoryRoot,
      ".github/scripts/release-guard.mjs",
    );
    const runTag = (env) =>
      spawnSync("node", [helper, "tag"], { encoding: "utf8", env });
    expect(runTag({ ...environment, DRY_RUN: "true" }).status).not.toBe(0);
    expect(runTag(environment).status).not.toBe(0);
    expect(existsSync(gitLog)).toBe(false);
    writeFileSync(marker, `${releaseSha}\n`);
    expect(runTag(environment).status).toBe(0);
    expect(readFileSync(gitLog, "utf8").trim().split("\n")).toEqual([
      `tag v1.2.3 ${releaseSha}`,
      "push origin refs/tags/v1.2.3",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("post-publication verification failure leaves no marker for tagging", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "release-verify-failure-"),
  );
  try {
    const versionFile = path.join(directory, "version.json");
    const auditFile = path.join(directory, "audit.json");
    const attestationsFile = path.join(directory, "attestations.json");
    const keysFile = path.join(directory, "keys.json");
    const marker = path.join(directory, "verified");
    const helper = path.join(
      repositoryRoot,
      ".github/scripts/release-guard.mjs",
    );
    const environment = {
      ...process.env,
      VERSION_JSON: versionFile,
      AUDIT_JSON: auditFile,
      ATTESTATIONS_JSON: attestationsFile,
      KEYS_JSON: keysFile,
      PROVENANCE_MARKER: marker,
      EXPECTED_VERSION: "1.2.3",
      RELEASE_SHA: releaseSha,
    };
    writeFileSync(versionFile, JSON.stringify(["1.2.3"]));
    writeFileSync(auditFile, JSON.stringify({ invalid: [], missing: [] }));
    writeFileSync(attestationsFile, JSON.stringify({ attestations: [] }));
    writeFileSync(keysFile, JSON.stringify({ keys: [] }));
    const noAttestation = spawnSync("node", [helper, "verify"], {
      encoding: "utf8",
      env: environment,
    });
    expect(noAttestation.status).not.toBe(0);
    expect(noAttestation.stderr).toContain(
      "lacks verified provenance or publish attestation",
    );
    expect(existsSync(marker)).toBe(false);
    writeFileSync(auditFile, JSON.stringify({ invalid: [], missing: [] }));
    writeFileSync(
      attestationsFile,
      JSON.stringify(registryAttestations("1.2.3", releaseSha)),
    );
    writeFileSync(versionFile, JSON.stringify(["1.2.4"]));
    const wrongVersion = spawnSync("node", [helper, "verify"], {
      encoding: "utf8",
      env: environment,
    });
    expect(wrongVersion.status).not.toBe(0);
    expect(wrongVersion.stderr).toContain("did not match");
    expect(existsSync(marker)).toBe(false);
    writeFileSync(versionFile, JSON.stringify(["1.2.3"]));
    const unsigned = spawnSync("node", [helper, "verify"], {
      encoding: "utf8",
      env: environment,
    });
    expect(unsigned.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release notes stay within the exact curated section and include the prior real version section", () => {
  const changelog =
    "# Changelog\n\n## [Unreleased]\n\n## [1.2.0] - 2026-10-13\n\n### Added\n\n- Curated latest feature.\n\n## [1.1.0] - 2026-10-01\n\n### Fixed\n\n- Prior relevant fix.\n\n## [1.0.0] - 2026-09-01\n\n- Older real version.\n";
  expect(releaseNotes(changelog, "1.2.0")).toContain("Curated latest feature.");
  expect(releaseNotes(changelog, "1.2.0", "1.1.0")).toContain(
    "compare/v1.1.0...v1.2.0",
  );
  expect(releaseNotes(changelog, "1.2.0")).not.toContain("Prior relevant fix.");
  expect(releaseNotes(changelog, "1.1.0")).not.toContain("Older real version.");
  expect(() => releaseNotes(changelog, "0.9.0")).toThrow(
    "exactly one dated matching version entry",
  );
});

test("notes preserve original code/comments and CRLF, ending at any visible level-2 heading", () => {
  for (const boundary of [
    "## [Unreleased]",
    "## Maintenance",
    "  ## Maintenance",
    "##\tMaintenance",
    "##",
    "## [1.1.0] - 2026-10-01",
  ]) {
    const section = [
      "## [1.2.0] - 2026-10-13",
      "",
      "- Curated change.",
      "prefix <!-- inline comment --> suffix",
      "<!-- hidden",
      "## [9.0.0] - 2026-10-01",
      "-->",
      "~~~md",
      "## [1.2.0] - 2026-10-13",
      "<!-- code comment -->",
      "<!--",
      "~~~",
      "    ## Indented example",
      "    example()  ",
    ].join("\r\n");
    const changelog =
      "<!-- prefix\r\ncomment -->\r\n" +
      section +
      "\r\n\r\n" +
      boundary +
      "\r\n- Not this release.\r\n";
    expect(releaseNotes(changelog, "1.2.0")).toBe(section);
    expect(() =>
      assertReleaseMetadata(
        {
          EXPECTED_VERSION: "1.2.0",
          REQUESTED_TAG: "v1.2.0",
          RELEASE_BRANCH: "main",
        },
        { name: "opsx-schema", version: "1.2.0" },
        changelog,
      ),
    ).not.toThrow();
  }
});

test("notes use the metadata validator, not code or later sections as substantive notes", () => {
  for (const body of [
    "TODO",
    "~~~md\nexample()\n~~~",
    "    example()",
    "<!-- hidden -->",
  ]) {
    expect(() =>
      releaseNotes(
        "## [1.2.0] - 2026-10-13\n" +
          body +
          "\n## Maintenance\n- Real later note.",
        "1.2.0",
      ),
    ).toThrow("substantive release notes");
  }
});

test("notes CLI selects the greatest lower authorized ancestor SemVer, including prereleases", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-notes-cli-"));
  const bin = path.join(directory, "bin");
  mkdirSync(bin);
  const git = path.join(bin, "git");
  writeFileSync(
    git,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.join(" ") !== "tag --merged " + process.env.RELEASE_SHA + " --list v* --sort=-version:refname") process.exit(2);
fs.appendFileSync(process.env.GIT_LOG, args.join(" ") + "\\n");
if (process.env.TAG_LOOKUP_FAIL === "true") process.exit(1);
console.log(process.env.ANCESTOR_TAGS);
`,
  );
  chmodSync(git, 0o755);
  const helper = path.join(repositoryRoot, ".github/scripts/release-guard.mjs");
  const notesFile = path.join(directory, "notes.md");
  for (const [version, tags, previous] of [
    [
      "1.2.0-rc.2",
      "v1.1.0\nv1.2.0\nv1.2.0-rc.2\nv1.2.0-rc.1\nv1.2.0-rc.01\nv01.2.0\nvgarbage",
      "1.2.0-rc.1",
    ],
    ["1.10.0", "v1.2.0\nv1.11.0\nv1.9.0", "1.9.0"],
    ["1.2.0-rc.10", "v1.2.0-rc.2\nv1.2.0-rc.9\nv1.2.0-rc.11", "1.2.0-rc.9"],
    ["1.2.0", "v1.2.0-beta.11\nv1.2.0-rc.2\nv1.2.0-alpha.z", "1.2.0-rc.2"],
    ["1.2.0-beta.1", "v1.2.0-alpha.10\nv1.2.0-alpha.z", "1.2.0-alpha.z"],
    ["0.1.0", "v0.1.0\nv9.0.0\nvgarbage", undefined],
    ["0.1.0", "", undefined],
  ]) {
    const section = "## [" + version + "] - 2026-10-13\n\n- Curated change.";
    writeFileSync(path.join(directory, "CHANGELOG.md"), section + "\n");
    const env = {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      RELEASE_SHA: releaseSha,
      EXPECTED_VERSION: version,
      NOTES_FILE: notesFile,
      ANCESTOR_TAGS: tags,
      GIT_LOG: path.join(directory, "git-log"),
    };
    const result = spawnSync("node", [helper, "notes"], {
      cwd: directory,
      encoding: "utf8",
      env,
    });
    expect(result.status).toBe(0);
    const notes = readFileSync(notesFile, "utf8");
    expect(notes).toBe(
      section +
        (previous
          ? "\n\n[Compare changes since v" +
            previous +
            "](https://github.com/Nebuless/opsx-schema/compare/v" +
            previous +
            "...v" +
            version +
            ")"
          : "") +
        "\n",
    );
    const failedLookup = spawnSync("node", [helper, "notes"], {
      cwd: directory,
      encoding: "utf8",
      env: { ...env, TAG_LOOKUP_FAIL: "true" },
    });
    expect(failedLookup.status).not.toBe(0);
    expect(failedLookup.stderr).toContain(
      "Could not inspect ancestor release tags",
    );
  }
  // A nonancestor v1.2.0-rc.9 is never supplied by the mocked --merged lookup.
  expect(readFileSync(path.join(directory, "git-log"), "utf8")).toContain(
    "--merged " + releaseSha,
  );
});

function expectNotesCliSection(
  section,
  prefix = "",
  boundary = "## Maintenance",
) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "release-fence-cli-"));
  const gitDirectory = spawnSync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  expect(gitDirectory.status).toBe(0);
  const tags = spawnSync("git", ["tag", "--merged", "HEAD", "--list", "v*"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  expect(tags.status).toBe(0);
  // Full local history selects v0.3.0; shallow CI checkouts may have no tags.
  const previous = ["0.3.0", "0.2.0"].find((version) =>
    tags.stdout.split(/\r?\n/).includes("v" + version),
  );
  const comparison = previous
    ? "\n\n[Compare changes since v" +
      previous +
      "](https://github.com/Nebuless/opsx-schema/compare/v" +
      previous +
      "...v0.4.0)"
    : "";
  const notesFile = path.join(directory, "notes.md");
  writeFileSync(
    path.join(directory, "CHANGELOG.md"),
    prefix + section + "\n\n" + boundary + "\n- Later section.\n",
  );
  const result = spawnSync(
    "node",
    [path.join(repositoryRoot, ".github/scripts/release-guard.mjs"), "notes"],
    {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_DIR: gitDirectory.stdout.trim(),
        RELEASE_SHA: "HEAD",
        EXPECTED_VERSION: "0.4.0",
        NOTES_FILE: notesFile,
      },
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(readFileSync(notesFile, "utf8")).toBe(section + comparison + "\n");
}

test("F8 actual notes CLI preserves the retained four-space close repro", () => {
  expectNotesCliSection(
    "## [0.4.0] - 2026-10-13\n\n- Curated change.\n\n```md\n    ```\n## Example heading in fenced code\nexample\n```",
  );
});

test("F9 actual notes CLI ends after the retained opener-info comment repro", () => {
  expectNotesCliSection(
    "## [0.4.0] - 2026-10-13\n\n- Curated change.\n\n```md <!--\nexample\n```",
  );
});

for (const fence of ["```", "~~~"]) {
  for (const indent of ["", " ", "  ", "   "]) {
    test(
      "notes CLI accepts " +
        fence +
        " closing fence with " +
        indent.length +
        " spaces and CRLF",
      () => {
        expectNotesCliSection(
          [
            "## [0.4.0] - 2026-10-13",
            "",
            "- Curated change.  ",
            "",
            fence + "md <!--", // Unindented opener ends the preceding list.
            "## Hidden heading",
            indent + fence + fence[0] + "\t ",
            "- Note after close.  ",
          ].join("\r\n"),
        );
      },
    );
  }
  for (const invalidClose of [
    "    " + fence,
    "\t" + fence,
    fence,
    fence.slice(1),
    fence === "```" ? "~~~" : "```",
    fence + " text",
    fence + "\u00a0",
  ]) {
    test(
      "notes CLI keeps " +
        JSON.stringify(invalidClose) +
        " inside " +
        fence +
        " code",
      () => {
        expectNotesCliSection(
          [
            "## [0.4.0] - 2026-10-13",
            "",
            "- Curated change.",
            fence + fence[0] + "md",
            invalidClose,
            "## Example heading in fenced code",
            "example  ",
            fence + fence[0],
          ].join("\r\n"),
        );
      },
    );
  }
}

for (const fence of ["```", "~~~"]) {
  test(
    "tab compatibility preserves invalid " + fence + " closers as code",
    () => {
      for (const invalidClose of [
        "    " + fence + fence[0] + "\t ",
        "\t" + fence + fence[0] + "\t ",
        fence + "\t ",
        fence.slice(1) + "\t ",
        (fence === "```" ? "~~~~" : "````") + "\t ",
        fence + fence[0] + " text\t ",
        fence + fence[0] + "\u00a0\t ",
        fence + fence[0] + (fence === "~~~" ? "`" : "~") + "\t ",
      ]) {
        expectNotesCliSection(
          [
            "## [0.4.0] - 2026-10-13",
            "",
            "- Curated change.  ",
            "",
            fence + fence[0] + "md",
            invalidClose,
            "## Hidden heading",
            "example  ",
            fence + fence[0] + "\t ",
            "- Note after close.  ",
          ].join("\r\n"),
        );
      }
    },
  );
  test(
    "tab compatibility exposes prose only after a valid " + fence + " close",
    () => {
      const environment = {
        EXPECTED_VERSION: "1.2.3",
        REQUESTED_TAG: "v1.2.3",
        RELEASE_BRANCH: "main",
      };
      const manifest = { name: "opsx-schema", version: "1.2.3" };
      const codeOnly =
        "## [1.2.3] - 2026-09-28\n\n" +
        fence +
        "md\nHidden prose.\n" +
        fence +
        "\t ";
      expect(() =>
        assertReleaseMetadata(environment, manifest, codeOnly),
      ).toThrow("substantive release notes");
      expect(() =>
        assertReleaseMetadata(
          environment,
          manifest,
          codeOnly + "\nVisible prose.",
        ),
      ).not.toThrow();
    },
  );
}

test("tab compatibility leaves the shared marked lexer unchanged", () => {
  const source =
    "## [1.2.3] - 2026-09-28\n\nVisible prose.\n\n```md\nHidden prose.\n```\t \n## Maintenance\nLater prose.";
  const before = Lexer.lex(source);
  expect(releaseNotes(source, "1.2.3")).toBe(
    source.split("\n## Maintenance")[0],
  );
  expect(Lexer.lex(source)).toEqual(before);
  expect(
    before.some(
      (block) => block.type === "heading" && block.text === "Maintenance",
    ),
  ).toBe(false);
});

test("tab compatibility preserves nested list and blockquote boundaries", () => {
  for (const prefix of ["  ", "> "]) {
    const section = [
      "## [0.4.0] - 2026-10-13",
      "",
      "- Curated change.",
      "",
      ...(prefix === "  " ? ["- Example:"] : []),
      prefix + "```md",
      prefix + "## Hidden code heading",
      prefix + "```\t ",
      prefix + "## Nested heading",
      "",
      "Final prose with a\ttab.  ",
    ].join("\r\n");
    expectNotesCliSection(section);
  }
});

test("notes CLI ignores fence openers inside comments and comment markers inside fence info", () => {
  expectNotesCliSection(
    [
      "## [0.4.0] - 2026-10-13",
      "",
      "- Curated change.",
      "<!-- hidden",
      "```md",
      "## Hidden comment heading",
      "-->",
      "<!-- inline -->",
      "~~~md ` <!--",
      "## Hidden tilde heading",
      "~~~",
      "<!-- after fence -->",
      "- Final note.  ",
    ].join("\r\n"),
    "<!-- before release\r\n~~~md <!--\r\n## Hidden preface\r\n-->\r\n",
  );
});

test("notes CLI rejects backticks in backtick fence info and four-space/tab openers", () => {
  for (const opener of ["```md `", "    ```md", "\t~~~md"]) {
    expectNotesCliSection(
      "## [0.4.0] - 2026-10-13\n\n- Curated change.\n" + opener,
    );
  }
});

test("F10 actual notes CLI ends after the retained inline-code comment repro", () => {
  expectNotesCliSection(
    "## [0.4.0] - 2026-10-13\n\n- Curated change.\n- Document the `<!--` delimiter.",
  );
});

test("F11 actual notes CLI ends at the retained Setext H2 boundary repro", () => {
  expectNotesCliSection(
    "## [0.4.0] - 2026-10-13\n\n- Curated change.",
    "",
    "Maintenance\n-----------",
  );
});

test("F12 metadata accepts substantive Markdown table cells", () => {
  for (const table of [
    "| Area | Change |\n| --- | --- |\n| Recovery | Restores sessions after reconnect. |",
    "| TBD | TBD |\n| --- | --- |\n| TBD | Restores sessions after reconnect. |",
    "| Restores sessions after reconnect. | TBD |\n| --- | --- |\n| `example()` | <!-- hidden --> |",
  ]) {
    expect(() =>
      assertReleaseMetadata(
        {
          EXPECTED_VERSION: "1.2.3",
          REQUESTED_TAG: "v1.2.3",
          RELEASE_BRANCH: "main",
        },
        { name: "opsx-schema", version: "1.2.3" },
        "## [1.2.3] - 2026-10-13\n\n" + table,
      ),
    ).not.toThrow();
  }
});

test("F12 notes preserve exact Markdown tables", () => {
  const table =
    "| Area | Change |\n| --- | --- |\n| Recovery | Restores sessions after reconnect. |";
  const section = "## [1.2.3] - 2026-10-13\n\n" + table;
  expect(
    releaseNotes(section + "\n\n## Maintenance\n- Later note.", "1.2.3"),
  ).toBe(section);
});

test("F12 actual notes CLI preserves table bytes and section boundaries", () => {
  for (const newline of ["\n", "\r\n"]) {
    expectNotesCliSection(
      [
        "## [0.4.0] - 2026-10-13",
        "",
        "| TBD | TBD |",
        "| --- | --- |",
        "| TBD | Restores\t会话 🚀 after reconnect.  |",
      ].join(newline),
      "<!-- Unicode preface: 会话 🚀 -->" + newline,
      "Maintenance" + newline + "-----------",
    );
  }
});

test("F12 tables containing only code, comments or placeholders remain non-substantive", () => {
  for (const [header, row] of [
    ["`Area` | `Change`", "`Recovery` | `Restores sessions.`"],
    [
      "<!-- Area --> | <!-- Change -->",
      "<!-- Recovery --> | <!-- Restores sessions. -->",
    ],
    ["TODO | TBD", "placeholder | coming soon"],
    ["**TODO** | `Change`", "<!-- Recovery --> | **TBD**"],
  ]) {
    const changelog =
      "## [1.2.3] - 2026-10-13\n\n| " +
      header +
      " |\n| --- | --- |\n| " +
      row +
      " |\n\n## Maintenance\n- Later substantive note.";
    expect(() =>
      assertReleaseMetadata(
        {
          EXPECTED_VERSION: "1.2.3",
          REQUESTED_TAG: "v1.2.3",
          RELEASE_BRANCH: "main",
        },
        { name: "opsx-schema", version: "1.2.3" },
        changelog,
      ),
    ).toThrow("substantive release notes");
    expect(() => releaseNotes(changelog, "1.2.3")).toThrow(
      "substantive release notes",
    );
  }
});
