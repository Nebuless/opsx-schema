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
import {
  assertCurrentProtectedMain,
  assertPackedFiles,
  assertProtectedReleaseEnvironment,
  assertPublishedVersion,
  assertReleaseClaims,
  assertRegistryVersionUnused,
  assertReleaseMetadata,
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
