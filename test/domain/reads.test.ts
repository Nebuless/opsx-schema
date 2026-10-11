import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import { resolveProject } from "../../src/domain/project.ts";
import {
  archivedNames,
  changes,
  detailedChanges,
  specificationCounts,
} from "../../src/domain/snapshot.ts";
import { recordCreation } from "../../src/provenance/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";

const created: string[] = [];
afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("an explicit project never silently selects an ancestor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-project-"));
  created.push(root);
  await mkdir(path.join(root, "openspec"));
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  const nested = path.join(root, "nested");
  await mkdir(nested);
  expect(await resolveProject(nested)).toBe(root);
  await expect(resolveProject(nested, true)).rejects.toMatchObject({
    code: "PROJECT_NOT_FOUND",
  });
  await mkdir(path.join(nested, "openspec"));
  await writeFile(
    path.join(nested, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  const child = path.join(nested, "child");
  await mkdir(child);
  expect(await resolveProject(child)).toBe(nested);
  expect(await resolveProject(root, true)).toBe(root);
});

test("missing tasks stay Unknown rather than borrowing OpenSpec list counts", async () => {
  const client = {
    json: (...args: string[]) => {
      if (args[0] === "list")
        return Promise.resolve({
          changes: [
            {
              name: "legacy",
              status: "in-progress",
              completedTasks: 0,
              totalTasks: 0,
            },
          ],
        });
      if (args[0] === "status")
        return Promise.resolve({
          schemaName: "spec-driven",
          artifacts: [{ id: "tasks", status: "blocked" }],
        });
      return Promise.resolve({
        state: "blocked",
        progress: { complete: 0, total: 0, remaining: 0 },
      });
    },
  } as unknown as OpenSpecClient;
  expect((await changes(client))[0]?.tasks).toBeNull();
});

test("change reads stay at four concurrent commands and preserve list order", async () => {
  const names = Array.from({ length: 8 }, (_, index) => `change-${index}`);
  let active = 0;
  let peak = 0;
  const client = {
    json: async (...args: string[]) => {
      if (args[0] === "list")
        return {
          changes: names.map((name, index) => ({
            name,
            status: `state-${index}`,
          })),
        };
      active++;
      peak = Math.max(peak, active);
      try {
        const name = args[args.indexOf("--change") + 1]!;
        const index = Number(name.slice("change-".length));
        await Promise.resolve();
        if (args[0] === "status")
          return { schemaName: `schema-${index}`, artifacts: [] };
        return {
          state: "ready",
          progress: {
            total: 3,
            complete: index % 3,
            remaining: 3 - (index % 3),
          },
        };
      } finally {
        active--;
      }
    },
  } as unknown as OpenSpecClient;
  const result = await changes(client);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(4);
  expect(result.map((change) => change.name)).toEqual(names);
  expect(result.map((change) => change.status)).toEqual(
    names.map((_, index) => `state-${index}`),
  );
  expect(result.map((change) => change.schema)).toEqual(
    names.map((_, index) => `schema-${index}`),
  );
  expect(result.map((change) => change.tasks?.complete)).toEqual(
    names.map((_, index) => index % 3),
  );
});

test("change-read errors use request order rather than whichever child fails first", async () => {
  const statusFailure = new Error("status failed first by request order");
  const instructionsFailure = new Error("instructions failed earlier in time");
  const client = {
    json: async (...args: string[]) => {
      if (args[0] === "list")
        return { changes: [{ name: "one", status: "in-progress" }] };
      if (args[0] === "status") {
        await Bun.sleep(5);
        throw statusFailure;
      }
      throw instructionsFailure;
    },
  } as unknown as OpenSpecClient;
  await expect(changes(client)).rejects.toBe(statusFailure);
});

test("overview reads canonical spec counts and archive names without reading archived details", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-domain-read-"));
  created.push(root);
  const specs = path.join(root, "openspec", "specs");
  await mkdir(path.join(specs, "identity"), { recursive: true });
  await mkdir(path.join(specs, "payments"), { recursive: true });
  await writeFile(
    path.join(specs, "identity", "spec.md"),
    "### Requirement: Login\n\n### Requirement: Logout\n",
  );
  await writeFile(
    path.join(specs, "payments", "spec.md"),
    "### Requirement: Refund\r\n",
  );
  await writeFile(
    path.join(specs, "README.md"),
    "### Requirement: Not a spec\n",
  );
  await mkdir(
    path.join(root, "openspec", "changes", "delta", "specs", "identity"),
    { recursive: true },
  );
  await writeFile(
    path.join(
      root,
      "openspec",
      "changes",
      "delta",
      "specs",
      "identity",
      "spec.md",
    ),
    "### Requirement: Change-local\n",
  );
  await mkdir(path.join(root, "openspec", "schemas", "schema", "specs"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "openspec", "schemas", "schema", "specs", "spec.md"),
    "### Requirement: Schema-local\n",
  );
  const archived = path.join(
    root,
    "openspec",
    "changes",
    "archive",
    "2026-09-23-old",
  );
  await mkdir(archived, { recursive: true });
  await symlink(
    "/path/that/must/not/be/read",
    path.join(archived, "proposal.md"),
  );
  expect(await specificationCounts(root)).toEqual({
    specifications: 2,
    requirements: 3,
  });
  expect(await archivedNames(root)).toEqual([{ name: "2026-09-23-old" }]);
});

test("canonical spec inventory rejects symlink entries instead of following them", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-spec-link-"));
  created.push(root);
  const specs = path.join(root, "openspec", "specs");
  const outside = path.join(root, "outside");
  await mkdir(specs, { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(outside, "spec.md"), "### Requirement: Outside\n");
  await symlink(outside, path.join(specs, "linked"));
  await expect(specificationCounts(root)).rejects.toMatchObject({
    code: "SPEC_CATALOG_UNSAFE",
  });
});

test("revision checks share exact identities within one read but not between reads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-shared-revision-"));
  created.push(root);
  const schemaRoot = path.join(root, "openspec", "schemas", "v1");
  await mkdir(path.join(root, "openspec", "changes", "archive"), {
    recursive: true,
  });
  await mkdir(schemaRoot, { recursive: true });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: v1\n");
  await writeFile(
    path.join(schemaRoot, "schema.yaml"),
    "artifacts:\n  - id: proposal\n",
  );
  const names = ["first", "second"];
  const untrackedNames = ["legacy-first", "legacy-second"];
  const allNames = [...names, ...untrackedNames];
  for (const name of allNames) {
    const directory = path.join(root, "openspec", "changes", name);
    await mkdir(directory);
    await writeFile(path.join(directory, ".openspec.yaml"), "schema: v1\n");
  }
  let schemaReads = 0;
  const client = {
    projectRoot: root,
    json: async (...args: string[]) => {
      if (args[0] === "list")
        return {
          changes: allNames.map((name) => ({ name, status: "in-progress" })),
        };
      if (args[0] === "status") return { schemaName: "v1", artifacts: [] };
      if (args[0] === "instructions")
        return {
          state: "ready",
          progress: { total: 1, complete: 1, remaining: 0 },
        };
      if (args[0] === "schema" && args[1] === "which") {
        schemaReads++;
        return { name: "v1", source: "project", path: schemaRoot, shadows: [] };
      }
      throw new Error(`Unexpected OpenSpec command: ${args.join(" ")}`);
    },
  } as unknown as OpenSpecClient;
  const revision = await resolveRevision(client, "v1");
  await retainRevision(root, revision);
  for (const name of names) await recordCreation(root, name, revision);
  schemaReads = 0;
  const first = await detailedChanges(root, client);
  expect(schemaReads).toBe(2);
  expect(first.map((change) => change.revision?.state)).toEqual([
    "intact",
    "intact",
    "untracked",
    "untracked",
  ]);
  await detailedChanges(root, client);
  expect(schemaReads).toBe(4);
});

test("detailed reads use one provenance receipt for history and revision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-snapshot-receipt-"));
  created.push(root);
  const directory = path.join(root, "openspec", "changes", "sample");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: v1\n");
  await writeFile(path.join(directory, ".openspec.yaml"), "schema: v1\n");
  const before = {
    version: 2,
    created: { name: "v1", source: "/schemas/before", digest: "a".repeat(64) },
    migrations: [],
    establishments: [],
  };
  const after = {
    ...before,
    created: { name: "v1", source: "/schemas/after", digest: "b".repeat(64) },
  };
  const file = path.join(directory, ".opsx-provenance.json");
  await writeFile(file, JSON.stringify(before));

  const script = `
    const { mock } = await import("bun:test");
    const { writeFile } = await import("node:fs/promises");
    const archiveUrl = ${JSON.stringify(new URL("../../src/archive/index.ts", import.meta.url).href)};
    const snapshotUrl = ${JSON.stringify(new URL("../../src/domain/snapshot.ts", import.meta.url).href)};
    const projectUrl = ${JSON.stringify(new URL("../../src/domain/project.ts", import.meta.url).href)};
    const archive = await import(archiveUrl);
    const originalBoundedFile = archive.boundedFile;
    const { OpsxError } = await import(projectUrl);
    const root = ${JSON.stringify(root)};
    const file = ${JSON.stringify(file)};
    const before = ${JSON.stringify(before)};
    const after = ${JSON.stringify(after)};
    let reads = 0;
    mock.module(archiveUrl, () => ({
      ...archive,
      boundedFile: async (directory, relative) => {
        const result = await originalBoundedFile(directory, relative);
        if (relative === ".opsx-provenance.json") {
          reads++;
          if (reads === 1) await writeFile(file, JSON.stringify(after));
        }
        return result;
      },
    }));
    const { detailedChange, detailedChanges } = await import(snapshotUrl);
    const client = {
      projectRoot: root,
      json: async (...args) => {
        if (args[0] === "list") return { changes: [{ name: "sample", status: "active" }] };
        if (args[0] === "status") return { schemaName: "v1", artifacts: [] };
        if (args[0] === "instructions") return { state: "ready" };
        throw new OpsxError("OPENSPEC_FAILED", "schema unavailable");
      },
    };
    const single = await detailedChange(root, client, "sample");
    const singleReads = reads;
    await writeFile(file, JSON.stringify(before));
    reads = 0;
    const [listed] = await detailedChanges(root, client);
    process.stdout.write(JSON.stringify({ single, singleReads, listed, listedReads: reads }));
  `;
  const result = Bun.spawnSync({
    cmd: [process.execPath, "-e", script],
    cwd: path.resolve(import.meta.dir, "../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(new TextDecoder().decode(result.stderr)).toBe("");
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(new TextDecoder().decode(result.stdout));
  for (const [detail, reads] of [
    [output.single, output.singleReads],
    [output.listed, output.listedReads],
  ] as const) {
    expect(reads).toBe(1);
    expect(detail.history.created).toEqual(before.created);
    expect(detail.revision).toMatchObject({
      state: "missing",
      source: before.created.source,
      digest: before.created.digest,
    });
  }
});

test("snapshot revision caching distinguishes witnesses and bundles in either read order", async () => {
  for (const order of [
    ["good", "origin", "bundle"],
    ["bundle", "origin", "good"],
  ]) {
    const root = await mkdtemp(
      path.join(
        fileURLToPath(new URL(".", import.meta.url)),
        ".opsx-snapshot-origin-",
      ),
    );
    created.push(root);
    const schemaRoot = path.join(root, "openspec", "schemas", "v1");
    await mkdir(schemaRoot, { recursive: true });
    await writeFile(path.join(schemaRoot, "schema.yaml"), "name: v1\n");
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "add",
        "openspec/schemas/v1/schema.yaml",
      ],
      { cwd: root, stdio: "ignore" },
    );
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: root, stdio: "ignore" },
    );
    const names = order.map((item) => `case-${item}`);
    for (const name of names) {
      const directory = path.join(root, "openspec", "changes", name);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, ".openspec.yaml"), "schema: v1\n");
    }
    const client = {
      projectRoot: root,
      json: async (...args: string[]) => {
        if (args[0] === "list")
          return {
            changes: names.map((name) => ({ name, status: "in-progress" })),
          };
        if (args[0] === "status") return { schemaName: "v1", artifacts: [] };
        if (args[0] === "instructions")
          return {
            state: "ready",
            progress: { total: 1, complete: 1, remaining: 0 },
          };
        if (args[0] === "schema" && args[1] === "which")
          return {
            name: "v1",
            source: "project",
            path: schemaRoot,
            shadows: [],
          };
        throw new Error(`Unexpected OpenSpec command: ${args.join(" ")}`);
      },
    } as unknown as OpenSpecClient;
    const revision = await resolveRevision(client, "v1");
    await retainRevision(root, revision);
    for (const item of order) {
      const ref =
        item === "origin"
          ? {
              ...revision,
              origin: {
                ...revision.origin!,
                ino: (BigInt(revision.origin!.ino) + 1n).toString(),
              },
            }
          : item === "bundle"
            ? {
                ...revision,
                bundleSource: {
                  name: "v1",
                  version: "1",
                  revision: "fixture",
                  digest: "a".repeat(64),
                },
              }
            : revision;
      await recordCreation(root, `case-${item}`, ref);
    }
    const receiptsBefore = await Promise.all(
      names.map((name) =>
        readFile(
          path.join(root, "openspec", "changes", name, ".opsx-provenance.json"),
        ),
      ),
    );

    const result = await detailedChanges(root, client);
    expect(result.map((change) => change.name)).toEqual(names);
    expect(result.map((change) => change.revision?.state)).toEqual(
      order.map((item) => (item === "good" ? "intact" : "shadow")),
    );
    await Promise.all(
      names.map(async (name, index) => {
        const receipt = await readFile(
          path.join(root, "openspec", "changes", name, ".opsx-provenance.json"),
        );
        expect(receipt).toEqual(receiptsBefore[index]);
      }),
    );
  }
});
