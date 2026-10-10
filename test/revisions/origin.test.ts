import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  checkRevision,
  resolveRevision,
  retainRevision,
} from "../../src/revisions/index.ts";
import { gitOrigin } from "../../src/revisions/origin.ts";
import {
  readProvenance,
  recordCreation,
  recordMigration,
  retainLegacy,
  revisionRef,
} from "../../src/provenance/index.ts";

const fixtures: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<void> {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

async function fixture() {
  const base = await mkdtemp(
    path.join(fileURLToPath(new URL(".", import.meta.url)), ".opsx-origin-"),
  );
  fixtures.push(base);
  const main = path.join(base, "main");
  const schemaDirectory = (root: string) =>
    path.join(root, "openspec", "schemas", "sample");
  await mkdir(schemaDirectory(main), { recursive: true });
  await writeFile(
    path.join(schemaDirectory(main), "schema.yaml"),
    "name: sample\n",
  );
  await git(main, "init", "-b", "main");
  await git(
    main,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "add",
    "openspec/schemas/sample/schema.yaml",
  );
  await git(
    main,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-m",
    "fixture",
  );
  const linked = path.join(base, "linked");
  await git(main, "worktree", "add", "-b", "linked", linked);
  const client = (
    root: string,
    selected = schemaDirectory(root),
    source = "project",
  ) =>
    ({
      projectRoot: root,
      json: async () => ({
        name: "sample",
        source,
        path: selected,
        shadows: [],
      }),
    }) as unknown as OpenSpecClient;
  return { base, main, linked, schemaDirectory, client };
}

test("linked-worktree witnesses survive source removal and reject independent clones without changing receipts", async () => {
  const f = await fixture();
  try {
    const original = await resolveRevision(f.client(f.linked), "sample");
    expect(original.origin).toBeDefined();
    const relocated = await resolveRevision(f.client(f.linked), "sample");
    expect(relocated.origin).toEqual(original.origin);
    await retainRevision(f.linked, original);
    await retainRevision(f.main, original);

    const change = path.join(f.main, "openspec", "changes", "case");
    await mkdir(change, { recursive: true });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: sample\n");
    await recordCreation(f.main, "case", revisionRef(original));
    const receipt = path.join(change, ".opsx-provenance.json");
    const before = await readFile(receipt);
    expect((await readProvenance(change))?.created).toEqual(
      revisionRef(original),
    );
    await expect(
      recordMigration(
        f.main,
        "case",
        {
          name: original.name,
          source: original.source,
          digest: original.digest,
        },
        original,
      ),
    ).rejects.toMatchObject({ code: "PROVENANCE_STALE" });
    await expect(
      recordMigration(
        f.main,
        "case",
        {
          ...revisionRef(original),
          origin: {
            ...original.origin!,
            ino: (BigInt(original.origin!.ino) + 1n).toString(),
          },
        },
        original,
      ),
    ).rejects.toMatchObject({ code: "PROVENANCE_STALE" });
    await expect(
      recordMigration(
        f.main,
        "case",
        {
          ...revisionRef(original),
          bundleSource: {
            name: "sample",
            version: "1",
            revision: "fixture",
            digest: "b".repeat(64),
          },
        },
        original,
      ),
    ).rejects.toMatchObject({ code: "PROVENANCE_STALE" });
    expect(await readFile(receipt)).toEqual(before);

    expect(
      await checkRevision(f.linked, original, f.client(f.linked)),
    ).toMatchObject({ state: "intact", retained: true });
    const legacy = {
      name: original.name,
      source: original.source,
      digest: original.digest,
    };
    expect(await checkRevision(f.main, legacy, f.client(f.main))).toMatchObject(
      { state: "intact", retained: true },
    );
    await git(f.main, "worktree", "remove", f.linked, "--force");
    expect(
      await checkRevision(f.main, original, f.client(f.main)),
    ).toMatchObject({ state: "intact", retained: true });
    expect(await checkRevision(f.main, legacy, f.client(f.main))).toMatchObject(
      {
        state: "shadow",
        guidance: expect.stringContaining("re-pin"),
      },
    );
    expect(await readFile(receipt)).toEqual(before);

    const clone = path.join(f.base, "clone");
    await git(f.base, "clone", f.main, clone);
    const cloneRevision = await resolveRevision(f.client(clone), "sample");
    await retainRevision(clone, cloneRevision);
    expect(await checkRevision(clone, original, f.client(clone))).toMatchObject(
      {
        state: "shadow",
        guidance: expect.stringContaining("re-pin"),
      },
    );
    expect(await readFile(receipt)).toEqual(before);
    const malformed = JSON.parse(before.toString()) as {
      created: { origin: { version: number } };
    };
    malformed.created.origin.version = 2;
    await writeFile(receipt, JSON.stringify(malformed) + "\n");
    await expect(readProvenance(change)).rejects.toMatchObject({
      code: "PROVENANCE_INVALID",
    });
    await writeFile(receipt, before);
    expect(await readFile(receipt)).toEqual(before);
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("moved and replaced common directories cannot authenticate a recorded witness", async () => {
  const f = await fixture();
  try {
    const revision = await resolveRevision(f.client(f.main), "sample");
    await retainRevision(f.linked, revision);
    const common = revision.origin!.commonDirectory;
    const moved = path.join(f.base, "moved-common");
    await rename(common, moved);
    await expect(
      checkRevision(f.linked, revision, f.client(f.linked)),
    ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rename(moved, common);

    await rename(common, moved);
    await mkdir(common);
    await expect(
      checkRevision(f.linked, revision, f.client(f.linked)),
    ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(common, { recursive: true });
    await rename(moved, common);
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("Git origin refuses untracked schemas, redirects, nested repositories and poisoned Git environments", async () => {
  const f = await fixture();
  try {
    const schemaPath = f.schemaDirectory(f.linked);
    const prove = () => gitOrigin(f.linked, schemaPath, "sample");

    await git(
      f.linked,
      "rm",
      "--cached",
      "--",
      "openspec/schemas/sample/schema.yaml",
    );
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await git(f.linked, "add", "--", "openspec/schemas/sample/schema.yaml");

    const nested = path.join(f.linked, "openspec", "schemas", "sample");
    await git(nested, "init");
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(nested, { recursive: true });
    await mkdir(nested);
    await writeFile(path.join(nested, "schema.yaml"), "name: sample\n");
    await git(f.linked, "add", "--", "openspec/schemas/sample/schema.yaml");

    const outside = path.join(f.base, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "schema.yaml"), "name: sample\n");
    const saved = path.join(f.base, "saved-schema");
    await rename(schemaPath, saved);
    await symlink(saved, schemaPath);
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(schemaPath);
    await rename(saved, schemaPath);

    const schemaFile = path.join(schemaPath, "schema.yaml");
    const savedSchemaFile = path.join(f.base, "saved-schema-file");
    await rename(schemaFile, savedSchemaFile);
    await symlink(path.join(outside, "schema.yaml"), schemaFile);
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(schemaFile);
    await rename(savedSchemaFile, schemaFile);

    const gitEntry = path.join(f.linked, ".git");
    const savedGitEntry = path.join(f.base, "saved-git-entry");
    await rename(gitEntry, savedGitEntry);
    await symlink(savedGitEntry, gitEntry);
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(gitEntry);
    await rename(savedGitEntry, gitEntry);

    const gitFile = path.join(f.linked, ".git");
    const gitPointer = await readFile(gitFile, "utf8");
    const gitDirectory = path.resolve(
      f.linked,
      gitPointer.slice("gitdir: ".length).trim(),
    );
    await writeFile(gitFile, "gitdir: /tmp/elsewhere\n");
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await writeFile(gitFile, gitPointer);

    const commonBackref = path.join(gitDirectory, "commondir");
    const commonBackrefBytes = await readFile(commonBackref);
    await writeFile(commonBackref, "/tmp/elsewhere\n");
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await writeFile(commonBackref, commonBackrefBytes);

    const checkoutBackref = path.join(gitDirectory, "gitdir");
    const checkoutBackrefBytes = await readFile(checkoutBackref);
    await writeFile(checkoutBackref, path.join(f.main, ".git") + "\n");
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await writeFile(checkoutBackref, checkoutBackrefBytes);

    const worktrees = path.dirname(gitDirectory);
    const savedWorktrees = path.join(f.base, "saved-worktrees");
    await rename(worktrees, savedWorktrees);
    await symlink(savedWorktrees, worktrees);
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(worktrees);
    await rename(savedWorktrees, worktrees);

    const openspec = path.join(f.linked, "openspec");
    const movedOpenSpec = path.join(f.base, "saved-openspec");
    await rename(openspec, movedOpenSpec);
    await symlink(movedOpenSpec, openspec);
    await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await rm(openspec);
    await rename(movedOpenSpec, openspec);

    const rootAlias = path.join(f.base, "root-alias");
    await symlink(f.linked, rootAlias);
    await expect(
      gitOrigin(
        rootAlias,
        path.join(rootAlias, "openspec", "schemas", "sample"),
        "sample",
      ),
    ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    await expect(
      resolveRevision(f.client(f.linked, outside, "project"), "sample"),
    ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });

    const previous = process.env.GIT_CONFIG_PARAMETERS;
    process.env.GIT_CONFIG_PARAMETERS = "'core.worktree=/elsewhere'";
    try {
      await expect(prove()).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
    } finally {
      if (previous === undefined) delete process.env.GIT_CONFIG_PARAMETERS;
      else process.env.GIT_CONFIG_PARAMETERS = previous;
    }
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("legacy exact paths and non-project sources preserve absolute semantics without read backfill", async () => {
  const f = await fixture();
  try {
    const current = await resolveRevision(f.client(f.linked), "sample");
    await retainRevision(f.linked, current);
    const legacy = {
      name: current.name,
      source: current.source,
      digest: current.digest,
    };
    const previousConfig = process.env.GIT_CONFIG_PARAMETERS;
    process.env.GIT_CONFIG_PARAMETERS = "'core.worktree=/elsewhere'";
    try {
      await expect(
        checkRevision(f.linked, legacy, f.client(f.linked)),
      ).resolves.toMatchObject({ state: "intact", retained: true });
    } finally {
      if (previousConfig === undefined)
        delete process.env.GIT_CONFIG_PARAMETERS;
      else process.env.GIT_CONFIG_PARAMETERS = previousConfig;
    }

    const change = path.join(f.linked, "openspec", "changes", "legacy");
    await mkdir(change, { recursive: true });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: sample\n");
    await retainLegacy(f.linked, "legacy", legacy);
    const receipt = path.join(change, ".opsx-provenance.json");
    const before = await readFile(receipt);

    const external = path.join(f.base, "external-schema");
    await mkdir(external);
    await writeFile(path.join(external, "schema.yaml"), "name: sample\n");
    const nonProject = await resolveRevision(
      f.client(f.linked, external, "global"),
      "sample",
    );
    expect(nonProject.origin).toBeUndefined();
    await retainRevision(f.linked, nonProject);
    expect(
      await checkRevision(
        f.linked,
        nonProject,
        f.client(f.linked, external, "global"),
      ),
    ).toMatchObject({ state: "intact", retained: true });
    expect(await readFile(receipt)).toEqual(before);
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("origin witnesses reject partial, future-version and unsafe metadata", async () => {
  const f = await fixture();
  try {
    const revision = await resolveRevision(f.client(f.main), "sample");
    await retainRevision(f.main, revision);
    const ref = revisionRef(revision);
    for (const origin of [
      { ...revision.origin, version: 2 },
      { version: 1, commonDirectory: revision.origin?.commonDirectory },
      { ...revision.origin, dev: "01" },
      { ...revision.origin, ino: "1.5" },
      { ...revision.origin, relativeSchemaPath: "openspec/schemas/../sample" },
      { ...revision.origin, extra: true },
    ]) {
      await expect(
        checkRevision(
          f.main,
          { ...ref, origin } as typeof ref,
          f.client(f.main),
        ),
      ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    }
    const before = await readFile(
      path.join(
        f.main,
        "openspec",
        ".opsx",
        "revisions",
        "sample",
        revision.digest,
        "schema.yaml",
      ),
    );
    expect(before.toString()).toBe("name: sample\n");
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("witnessed refs require a source for the named project schema before live resolution", async () => {
  const f = await fixture();
  try {
    const revision = await resolveRevision(f.client(f.main), "sample");
    await retainRevision(f.main, revision);
    const change = path.join(f.main, "openspec", "changes", "case");
    await mkdir(change, { recursive: true });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: sample\n");
    await recordCreation(f.main, "case", revisionRef(revision));
    const receipt = path.join(change, ".opsx-provenance.json");
    const before = await readFile(receipt);
    const unrelated = {
      ...revisionRef(revision),
      source: path.join(f.base, "global", "unrelated"),
    };
    const invalidReceipt = JSON.parse(before.toString()) as {
      created: { source: string };
    };
    invalidReceipt.created.source = unrelated.source;
    await writeFile(receipt, JSON.stringify(invalidReceipt) + "\n");
    const invalidBytes = await readFile(receipt);
    const missingClient = f.client(f.main, path.join(f.base, "missing-schema"));

    await expect(readProvenance(change)).rejects.toMatchObject({
      code: "PROVENANCE_INVALID",
    });
    expect(await readFile(receipt)).toEqual(invalidBytes);
    await writeFile(receipt, before);
    await expect(
      checkRevision(f.main, unrelated, missingClient),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    await expect(
      checkRevision(
        f.main,
        {
          ...unrelated,
          origin: { ...unrelated.origin!, version: 2 },
        } as unknown as typeof unrelated,
        missingClient,
      ),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    await expect(
      checkRevision(
        f.main,
        {
          ...revisionRef(revision),
          origin: { ...revision.origin!, version: 2 },
        } as unknown as typeof revision,
        missingClient,
      ),
    ).rejects.toMatchObject({ code: "REVISION_INVALID" });
    expect(await readFile(receipt)).toEqual(before);
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("schema content, retained bytes, genuine shadows and bundles remain independent of origin", async () => {
  const f = await fixture();
  try {
    const revision = await resolveRevision(f.client(f.main), "sample");
    await retainRevision(f.main, revision);
    await writeFile(
      path.join(f.schemaDirectory(f.main), "schema.yaml"),
      "name: drift\n",
    );
    expect(
      (await checkRevision(f.main, revision, f.client(f.main))).state,
    ).toBe("drift");
    await writeFile(
      path.join(f.schemaDirectory(f.main), "schema.yaml"),
      "name: sample\n",
    );

    const retained = path.join(
      f.main,
      "openspec",
      ".opsx",
      "revisions",
      "sample",
      revision.digest,
      "schema.yaml",
    );
    const original = await readFile(retained);
    await writeFile(retained, "corrupt\n");
    expect(
      (await checkRevision(f.main, revision, f.client(f.main))).state,
    ).toBe("drift");
    await writeFile(retained, original);
    await rm(path.dirname(retained), { recursive: true });
    expect(
      await checkRevision(f.main, revision, f.client(f.main)),
    ).toMatchObject({ state: "drift", retained: false });

    await retainRevision(f.main, revision);
    const outside = path.join(f.base, "shadow");
    await mkdir(outside);
    await writeFile(path.join(outside, "schema.yaml"), "name: sample\n");
    expect(
      (
        await checkRevision(
          f.main,
          revision,
          f.client(f.main, outside, "global"),
        )
      ).state,
    ).toBe("shadow");
    expect(
      (
        await checkRevision(
          f.main,
          {
            ...revisionRef(revision),
            bundleSource: {
              name: "sample",
              version: "1",
              revision: "fixture",
              digest: "c".repeat(64),
            },
          },
          f.client(f.main),
        )
      ).state,
    ).toBe("shadow");
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});

test("malformed and stalled Git subprocesses fail closed within the command timeout", async () => {
  const f = await fixture();
  try {
    const bin = path.join(f.base, "bin");
    await mkdir(bin);
    const executable = path.join(bin, "git");
    const previousPath = process.env.PATH;
    process.env.PATH = bin + path.delimiter + (previousPath ?? "");
    try {
      await writeFile(executable, "#!/bin/sh\nprintf 'malformed\\n'\n");
      await chmod(executable, 0o755);
      await expect(
        gitOrigin(f.main, f.schemaDirectory(f.main), "sample"),
      ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });

      await writeFile(executable, "#!/bin/sh\nsleep 5\n");
      const started = performance.now();
      await expect(
        gitOrigin(f.main, f.schemaDirectory(f.main), "sample"),
      ).rejects.toMatchObject({ code: "REVISION_ORIGIN" });
      expect(performance.now() - started).toBeLessThan(4_500);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  } finally {
    await rm(f.base, { recursive: true, force: true });
    fixtures.splice(fixtures.indexOf(f.base), 1);
  }
});
