import { expect, setDefaultTimeout, test } from "bun:test";
import { decode } from "@toon-format/toon";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import { recordCreation } from "../../src/provenance/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";
import {
  validateChange,
  validateChangeAgainst,
} from "../../src/validation/index.ts";

const proposal = `## Why

This change proves the validation gate.

## What Changes

- Add a validated behavior.

## Capabilities

### New Capabilities

- demo

## Impact

- Validation fixture only.
`;

const validSpec = `## Purpose

This capability demonstrates a sufficiently described behavior for validation fixtures.

## ADDED Requirements

### Requirement: Demo behavior is observable
The system SHALL expose a stable demo behavior.

#### Scenario: Demo behavior is available
- **WHEN** the fixture is evaluated
- **THEN** the demo behavior is observable
`;

const invalidSpec = `## Purpose

This capability demonstrates a sufficiently described behavior for validation fixtures.

## ADDED Requirements

### Requirement: Demo behavior is observable
The system SHALL expose a stable demo behavior.
`;

const cli = fileURLToPath(new URL("../../src/domain/cli.ts", import.meta.url));

setDefaultTimeout(30_000);

async function fixture(
  options: { oldSchemaExtraArtifact?: boolean; oldSchemaSkill?: boolean } = {},
) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "opsx-validation-fixture-"),
  );
  const change = "external-edit";
  const changeDirectory = path.join(root, "openspec", "changes", change);
  const schemasDirectory = path.join(root, "openspec", "schemas");
  await mkdir(changeDirectory, { recursive: true });
  await mkdir(schemasDirectory, { recursive: true });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: design-v2\n",
  );

  const client = new OpenSpecClient(root);
  await client.ensureSupported();
  const builtin = await client.json<{ path: string }>(
    "schema",
    "which",
    "spec-driven",
  );
  const oldDirectory = path.join(schemasDirectory, "general-v1");
  const newDirectory = path.join(schemasDirectory, "design-v2");
  await Promise.all([
    cp(builtin.path, oldDirectory, { recursive: true }),
    cp(builtin.path, newDirectory, { recursive: true }),
  ]);

  const oldSchemaPath = path.join(oldDirectory, "schema.yaml");
  const newSchemaPath = path.join(newDirectory, "schema.yaml");
  const oldSchema = YAML.parse(await readFile(oldSchemaPath, "utf8")) as Record<
    string,
    unknown
  >;
  const newSchema = YAML.parse(await readFile(newSchemaPath, "utf8")) as Record<
    string,
    unknown
  >;
  oldSchema.name = "general-v1";
  newSchema.name = "design-v2";
  if (options.oldSchemaExtraArtifact) {
    const artifacts = oldSchema.artifacts as Array<Record<string, unknown>>;
    artifacts.push({
      id: "legacy-note",
      generates: "legacy-note.md",
      description: "Legacy-only workflow artifact",
      template: "legacy-note.md",
      instruction: "Write the legacy-only note.",
      requires: ["tasks"],
    });
    await writeFile(
      path.join(oldDirectory, "templates", "legacy-note.md"),
      "# Legacy note\n",
    );
  }
  if (options.oldSchemaSkill)
    await writeFile(
      path.join(oldDirectory, "skills.txt"),
      "example/agent-skills\tshared/new-skill\n",
    );
  await writeFile(oldSchemaPath, YAML.stringify(oldSchema));
  await writeFile(newSchemaPath, YAML.stringify(newSchema));
  await writeFile(
    path.join(newDirectory, "skills.txt"),
    "example/agent-skills shared/new-skill\n",
  );
  await mkdir(path.join(root, ".agents", "skills", "new-skill"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, ".agents", "skills", "new-skill", "SKILL.md"),
    "# Installed skill\n",
  );

  await writeFile(
    path.join(changeDirectory, ".openspec.yaml"),
    "schema: general-v1\n",
  );
  await writeFile(path.join(changeDirectory, "proposal.md"), proposal);
  await mkdir(path.join(changeDirectory, "specs", "demo"), {
    recursive: true,
  });
  await writeFile(
    path.join(changeDirectory, "specs", "demo", "spec.md"),
    validSpec,
  );
  await writeFile(
    path.join(changeDirectory, "design.md"),
    "# Design\n\nValidation fixture design.\n",
  );
  await writeFile(
    path.join(changeDirectory, "tasks.md"),
    "# Tasks\n\n- [ ] 1. Validate the fixture\n",
  );

  const oldRevision = await resolveRevision(client, "general-v1");
  const newRevision = await resolveRevision(client, "design-v2");
  await retainRevision(root, oldRevision);
  await retainRevision(root, newRevision);
  await recordCreation(root, change, oldRevision);
  return {
    root,
    change,
    changeDirectory,
    oldRevision,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function invokeVerify(
  root: string,
  json: boolean,
): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      cli,
      "--project",
      root,
      "verify",
      ...(json ? ["--json"] : []),
    ],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

test("aggregate verify identifies warning-only legacy provenance in text and JSON", async () => {
  const project = await fixture();
  try {
    await rm(path.join(project.changeDirectory, ".opsx-provenance.json"));

    for (const json of [false, true]) {
      const result = invokeVerify(project.root, json);
      const envelope = (
        json ? JSON.parse(result.stdout) : decode(result.stdout)
      ) as {
        ok: boolean;
        error?: { code: string; message: string };
        data: {
          ok: boolean;
          checks: Array<{ name: string; ok: boolean }>;
          separateChecks: string[];
          failures: Array<{
            name: string;
            findings?: Array<{ code: string; severity: string }>;
          }>;
        };
      };

      expect(result.code).toBe(1);
      expect(envelope.ok).toBe(false);
      expect(envelope.data.ok).toBe(false);
      expect(envelope.data.separateChecks).toContain(
        "adapters inspect <host> --scope project",
      );
      expect(envelope.data.checks).toContainEqual(
        expect.objectContaining({ name: "schema:design-v2", ok: true }),
      );
      expect(envelope.data.checks).toContainEqual(
        expect.objectContaining({ name: "skills", ok: true }),
      );
      expect(envelope.data.failures).toContainEqual(
        expect.objectContaining({
          name: "change:external-edit",
          findings: expect.arrayContaining([
            expect.objectContaining({
              code: "PROVENANCE_UNKNOWN",
              severity: "warning",
            }),
          ]),
        }),
      );
      expect(envelope.error?.code).toBe("VERIFY_FAILED");
      expect(envelope.error?.message).toContain("change:external-edit");
      expect(envelope.error?.message).toContain("PROVENANCE_UNKNOWN");
      expect(envelope.error?.message).toContain(
        "cannot prove its historical creation revision",
      );
      expect(envelope.error?.message).toContain(
        "adapters inspect <host> --scope project",
      );
    }
  } finally {
    await project.cleanup();
  }
});

test("aggregate verify keeps missing and drifted pinned revisions blocking", async () => {
  for (const state of ["missing", "drifted"] as const) {
    const project = await fixture();
    try {
      if (state === "missing") {
        await rm(
          path.join(
            project.root,
            "openspec",
            ".opsx",
            "revisions",
            project.oldRevision.name,
            project.oldRevision.digest,
          ),
          { recursive: true, force: true },
        );
      } else {
        await writeFile(
          path.join(
            project.root,
            "openspec",
            "schemas",
            project.oldRevision.name,
            "external-drift.txt",
          ),
          "External edit changes schema revision digest.\n",
        );
      }

      const result = invokeVerify(project.root, true);
      const envelope = JSON.parse(result.stdout) as {
        ok: boolean;
        data: {
          failures: Array<{
            name: string;
            findings?: Array<{ code: string }>;
          }>;
        };
      };
      expect(result.code).toBe(1);
      expect(envelope.ok).toBe(false);
      expect(envelope.data.failures).toContainEqual(
        expect.objectContaining({
          name: "change:external-edit",
          findings: expect.arrayContaining([
            expect.objectContaining({
              code:
                state === "missing"
                  ? "SCHEMA_REVISION_MISSING"
                  : "SCHEMA_REVISION_DRIFT",
            }),
          ]),
        }),
      );
    } finally {
      await project.cleanup();
    }
  }
});

test("aggregate verify identifies unproven legacy skill selection", async () => {
  const project = await fixture({ oldSchemaSkill: true });
  try {
    await rm(path.join(project.changeDirectory, ".opsx-provenance.json"));

    const result = invokeVerify(project.root, true);
    const envelope = JSON.parse(result.stdout) as {
      ok: boolean;
      error?: { message: string };
      data: {
        failures: Array<{
          name: string;
          diagnostics?: Array<{ code: string; message: string }>;
        }>;
      };
    };
    expect(result.code).toBe(1);
    expect(envelope.ok).toBe(false);
    expect(envelope.data.failures).toContainEqual(
      expect.objectContaining({
        name: "skills",
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "RESOURCE_PIN_SCAN_FAILED",
            message: expect.stringContaining("no verified skill selection"),
          }),
        ]),
      }),
    );
    expect(envelope.error?.message).toContain("skills");
  } finally {
    await project.cleanup();
  }
});

test("strict validation reports an externally edited invalid artifact without rewriting it", async () => {
  const project = await fixture();
  const originalPwd = process.env.PWD;
  let decoyDirectory: string | undefined;
  try {
    decoyDirectory = await mkdtemp(
      path.join(os.tmpdir(), "opsx-validation-decoy-"),
    );
    const decoyRoot = path.join(decoyDirectory, "valid-project");
    await cp(project.root, decoyRoot, { recursive: true });
    process.env.PWD = decoyRoot;
    const file = path.join(project.changeDirectory, "specs", "demo", "spec.md");
    await writeFile(file, invalidSpec);
    const originalArtifact = await readFile(file, "utf8");
    const originalPin = await readFile(
      path.join(project.changeDirectory, ".openspec.yaml"),
      "utf8",
    );
    const originalDefault = await readFile(
      path.join(project.root, "openspec", "config.yaml"),
      "utf8",
    );

    const result = await validateChange(project.root, project.change);

    expect(result.ok).toBe(false);
    expect(result.schema).toBe("general-v1");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "OPENSPEC_INVALID",
        severity: "error",
        path: "openspec/changes/external-edit/specs/demo/spec.md",
      }),
    );
    expect(
      result.findings.some((finding) => finding.message.includes("scenario")),
    ).toBe(true);
    expect(await readFile(file, "utf8")).toBe(originalArtifact);
    expect(
      await readFile(
        path.join(project.changeDirectory, ".openspec.yaml"),
        "utf8",
      ),
    ).toBe(originalPin);
    expect(
      await readFile(
        path.join(project.root, "openspec", "config.yaml"),
        "utf8",
      ),
    ).toBe(originalDefault);
  } finally {
    if (originalPwd === undefined) delete process.env.PWD;
    else process.env.PWD = originalPwd;
    await project.cleanup();
    if (decoyDirectory)
      await rm(decoyDirectory, { recursive: true, force: true });
  }
});

test("a missing pinned revision is reported instead of validating a same-name replacement", async () => {
  const project = await fixture();
  try {
    const snapshot = path.join(
      project.root,
      "openspec",
      ".opsx",
      "revisions",
      project.oldRevision.name,
      project.oldRevision.digest,
    );
    await rm(snapshot, { recursive: true, force: true });
    const artifact = path.join(
      project.changeDirectory,
      "specs",
      "demo",
      "spec.md",
    );
    const originalArtifact = await readFile(artifact, "utf8");

    const result = await validateChange(project.root, project.change);

    expect(result.ok).toBe(false);
    expect(
      result.findings.some(
        (finding) =>
          finding.code === "SCHEMA_REVISION_MISSING" &&
          finding.severity === "error",
      ),
    ).toBe(true);
    expect(await readFile(artifact, "utf8")).toBe(originalArtifact);
  } finally {
    await project.cleanup();
  }
});

test("an old change pin uses its own workflow while preflight uses the project default", async () => {
  const project = await fixture({ oldSchemaExtraArtifact: true });
  try {
    const originalPin = await readFile(
      path.join(project.changeDirectory, ".openspec.yaml"),
      "utf8",
    );
    const originalDefault = await readFile(
      path.join(project.root, "openspec", "config.yaml"),
      "utf8",
    );

    const pinned = await validateChange(project.root, project.change);
    expect(pinned.schema).toBe("general-v1");
    expect(pinned.ok).toBe(false);
    expect(pinned.findings).toContainEqual(
      expect.objectContaining({
        code: "WORKFLOW_INCOMPLETE",
        severity: "error",
      }),
    );
    expect(pinned.findings).toContainEqual(
      expect.objectContaining({
        code: "WORKFLOW_INCOMPLETE",
        severity: "error",
        path: "openspec/changes/external-edit/legacy-note.md",
      }),
    );
    expect(
      pinned.findings.some((finding) =>
        finding.message.includes("legacy-note"),
      ),
    ).toBe(true);

    const target = await validateChangeAgainst(
      project.root,
      project.change,
      "design-v2",
    );
    expect(target.schema).toBe("design-v2");
    expect(target.ok).toBe(true);
    expect(
      await readFile(
        path.join(project.changeDirectory, ".openspec.yaml"),
        "utf8",
      ),
    ).toBe(originalPin);
    expect(
      await readFile(
        path.join(project.root, "openspec", "config.yaml"),
        "utf8",
      ),
    ).toBe(originalDefault);
  } finally {
    await project.cleanup();
  }
});

test("a missing bundled target schema can be preflighted from a read-only source directory", async () => {
  const project = await fixture();
  const originalPwd = process.env.PWD;
  try {
    const installed = path.join(
      project.root,
      "openspec",
      "schemas",
      "design-v2",
    );
    const bundle = path.join(project.root, "bundle-source", "design-v2");
    await mkdir(path.dirname(bundle), { recursive: true });
    await cp(installed, bundle, { recursive: true });
    const originalBundleSchema = await readFile(
      path.join(bundle, "schema.yaml"),
      "utf8",
    );
    await rm(installed, { recursive: true, force: true });
    process.env.PWD = project.root;

    const unavailable = await validateChangeAgainst(
      project.root,
      project.change,
      "design-v2",
    );
    expect(unavailable.ok).toBe(false);
    expect(
      unavailable.findings.some((finding) => finding.code === "SCHEMA_UNKNOWN"),
    ).toBe(true);

    const preflight = await validateChangeAgainst(
      project.root,
      project.change,
      "design-v2",
      { targetSchemaRoot: bundle },
    );
    expect(preflight.ok).toBe(true);
    expect(preflight.schema).toBe("design-v2");
    expect(await readFile(path.join(bundle, "schema.yaml"), "utf8")).toBe(
      originalBundleSchema,
    );
    await expect(
      readFile(path.join(installed, "schema.yaml"), "utf8"),
    ).rejects.toThrow();
  } finally {
    if (originalPwd === undefined) delete process.env.PWD;
    else process.env.PWD = originalPwd;
    await project.cleanup();
  }
});
