import { expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  checkRevision,
  inspectRetainedRevision,
  resolveRevision,
  retainRevision,
  type RevisionRef,
} from "../../src/revisions/index.ts";
import {
  installBundledSchema,
  prepareBundledSchema,
} from "../../src/bundled/index.ts";
import {
  changeHistory,
  recordCreation,
  recordMigration,
  retainLegacy,
  revisionRef,
} from "../../src/provenance/index.ts";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-revision-"));
  await mkdir(path.join(root, "openspec", "changes", "archive"), {
    recursive: true,
  });
  await mkdir(path.join(root, "openspec", "schemas", "v1", "templates"), {
    recursive: true,
  });
  await mkdir(path.join(root, "openspec", "schemas", "v2", "templates"), {
    recursive: true,
  });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: v1\n");
  for (const name of ["v1", "v2"]) {
    const directory = path.join(root, "openspec", "schemas", name);
    await writeFile(
      path.join(directory, "schema.yaml"),
      "artifacts:\n  - id: proposal\n",
    );
    await writeFile(
      path.join(directory, "templates", "proposal.md"),
      `# ${name}\n`,
    );
  }
  const selection = {
    v1: path.join(root, "openspec", "schemas", "v1"),
    v2: path.join(root, "openspec", "schemas", "v2"),
  };
  const client = {
    json: (...args: string[]) => {
      const name = args[2] as "v1" | "v2";
      return { name, source: "project", path: selection[name], shadows: [] };
    },
  } as unknown as OpenSpecClient;
  return { root, client, selection };
}

test("template-only edits and same-name shadows never reinterpret a retained pin", async () => {
  const { root, client, selection } = await fixture();
  try {
    const original = await resolveRevision(client, "v1");
    await retainRevision(root, original);
    expect((await checkRevision(root, original, client)).state).toBe("intact");
    await writeFile(
      path.join(selection.v1, "templates", "proposal.md"),
      "# changed text\n",
    );
    const changed = await checkRevision(root, original, client);
    expect(changed.state).toBe("drift");
    expect(changed.retained).toBe(true);
    expect(
      (await inspectRetainedRevision(root, original, "templates/proposal.md"))
        .content,
    ).toBe("# v1\n");
    selection.v1 = selection.v2;
    expect((await checkRevision(root, original, client)).state).toBe("shadow");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creation and explicit migration history survive archiving without inventing legacy origin", async () => {
  const { root, client } = await fixture();
  try {
    const v1 = await resolveRevision(client, "v1");
    const v2 = await resolveRevision(client, "v2");
    await retainRevision(root, v1);
    await retainRevision(root, v2);
    const change = path.join(root, "openspec", "changes", "known");
    await mkdir(change);
    await writeFile(path.join(change, ".openspec.yaml"), "schema: v1\n");
    await recordCreation(root, "known", v1);
    await writeFile(path.join(change, ".openspec.yaml"), "schema: v2\n");
    await recordMigration(root, "known", v1, v2);
    const current = await changeHistory(root, "known");
    expect(current.created).toEqual({
      name: "v1",
      source: v1.source,
      digest: v1.digest,
    });
    expect(current.currentSchema).toBe("v2");
    expect(current.migrations).toHaveLength(1);
    expect(current.divergence).toBeNull();
    const archived = path.join(
      root,
      "openspec",
      "changes",
      "archive",
      "2026-09-23-known",
    );
    await rename(change, archived);
    expect(await changeHistory(root, "2026-09-23-known", true)).toMatchObject({
      created: current.created,
      currentSchema: "v2",
      migrations: current.migrations,
    });
    const legacy = path.join(root, "openspec", "changes", "legacy");
    await mkdir(legacy);
    await writeFile(path.join(legacy, ".openspec.yaml"), "name: legacy\n");
    expect((await changeHistory(root, "legacy")).created).toBe("Unknown");
    await retainLegacy(root, "legacy", v1);
    await writeFile(path.join(legacy, ".openspec.yaml"), "schema: v1\n");
    await writeFile(path.join(root, "openspec", "config.yaml"), "schema: v2\n");
    expect(await changeHistory(root, "legacy")).toMatchObject({
      created: "Unknown",
      currentSchema: "v1",
      retained: { name: v1.name, source: v1.source, digest: v1.digest },
      divergence: null,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recordMigration refuses an associated change without changing pin or provenance", async () => {
  const { root, client } = await fixture();
  try {
    const v1 = await resolveRevision(client, "v1");
    const v2 = await resolveRevision(client, "v2");
    const directory = path.join(root, "openspec", "changes", "associated");
    await mkdir(directory);
    await writeFile(path.join(directory, ".openspec.yaml"), "schema: v1\n");
    const association = {
      version: 1 as const,
      effectiveRevision: revisionRef(v1),
      profiles: [],
      skillHosts: [],
      skillBundle: "default" as const,
      manifestDigests: {
        agentProfiles: "a".repeat(64),
        schemaSkills: "b".repeat(64),
        skillBundles: null,
      },
    };
    await recordCreation(root, "associated", v1, association);
    const pinPath = path.join(directory, ".openspec.yaml");
    const provenancePath = path.join(directory, ".opsx-provenance.json");
    const pinBefore = await readFile(pinPath);
    const provenanceBefore = await readFile(provenancePath);

    await expect(
      recordMigration(root, "associated", v1, v2),
    ).rejects.toMatchObject({ code: "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED" });
    expect(await readFile(pinPath)).toEqual(pinBefore);
    expect(await readFile(provenancePath)).toEqual(provenanceBefore);
    expect(await changeHistory(root, "associated")).toMatchObject({
      currentSchema: "v1",
      migrations: [],
      divergence: null,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "active and archived pins keep resolving their original bundle revision beside an alias",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "opsx-revision-alias-"));
    try {
      const schemaName = "intent-driven-design";
      const aliasName = "intent-driven-design-next";
      await mkdir(path.join(root, "openspec", "changes", "archive"), {
        recursive: true,
      });
      await writeFile(
        path.join(root, "openspec", "config.yaml"),
        "schema: " + schemaName + "\n",
      );

      const sourcePlan = await prepareBundledSchema(root, schemaName);
      await installBundledSchema(root, schemaName, sourcePlan);
      const client = new OpenSpecClient(root);
      const original = await resolveRevision(client, schemaName);
      expect(original.bundleSource).toEqual({
        name: schemaName,
        version: sourcePlan.sourceVersion,
        revision: sourcePlan.sourceRevision,
        digest: sourcePlan.sourceDigest,
      });
      await retainRevision(root, original);

      const activeName = "active-old-pin";
      const archivedName = "2026-09-25-archived-old-pin";
      for (const name of [activeName, archivedName]) {
        const directory = path.join(root, "openspec", "changes", name);
        await mkdir(directory);
        await writeFile(
          path.join(directory, ".openspec.yaml"),
          "schema: " + schemaName + "\n",
        );
        await recordCreation(root, name, original);
      }
      await rename(
        path.join(root, "openspec", "changes", archivedName),
        path.join(root, "openspec", "changes", "archive", archivedName),
      );
      const sourceSchema = await readFile(
        path.join(root, "openspec", "schemas", schemaName, "schema.yaml"),
        "utf8",
      );
      const config = await readFile(
        path.join(root, "openspec", "config.yaml"),
        "utf8",
      );

      const aliasPlan = await prepareBundledSchema(root, schemaName, aliasName);
      expect(aliasPlan.status).toBe("missing");
      expect(aliasPlan.sourceDigest).toBe(sourcePlan.sourceDigest);
      await installBundledSchema(root, schemaName, aliasPlan);

      const current = await resolveRevision(client, schemaName);
      expect(current.digest).toBe(original.digest);
      expect(current.source).toBe(original.source);
      expect(current.bundleSource).toEqual(original.bundleSource);
      expect(
        await readFile(
          path.join(root, "openspec", "schemas", schemaName, "schema.yaml"),
          "utf8",
        ),
      ).toBe(sourceSchema);
      expect(
        await readFile(path.join(root, "openspec", "config.yaml"), "utf8"),
      ).toBe(config);
      expect(
        await readFile(
          path.join(root, "openspec", "schemas", aliasName, "schema.yaml"),
          "utf8",
        ),
      ).toContain("name: " + aliasName);

      for (const [name, archived] of [
        [activeName, false],
        [archivedName, true],
      ] as const) {
        const history = await changeHistory(root, name, archived);
        expect(history.currentSchema).toBe(schemaName);
        expect(history.created).toMatchObject({
          name: schemaName,
          digest: original.digest,
        });
        expect(
          await checkRevision(root, history.created as RevisionRef, client),
        ).toMatchObject({ state: "intact", retained: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  { timeout: 60_000 },
);
