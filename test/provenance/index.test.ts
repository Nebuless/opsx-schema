import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  changeHistory,
  effectiveRevision,
  parseProvenance,
  readProvenance,
  recordCreation,
  recordMigration,
  recordSelectionAssociation,
  retainLegacy,
} from "../../src/provenance/index.ts";
import type {
  ChangeSelectionAssociation,
  Provenance,
  RePinEvent,
} from "../../src/provenance/index.ts";
import type { RevisionRef } from "../../src/revisions/index.ts";

const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-provenance-"));
  const change = path.join(root, "openspec", "changes", "sample");
  await mkdir(change, { recursive: true });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: a\n");
  await writeFile(path.join(change, ".openspec.yaml"), "schema: a\n");
  return { root, change, file: path.join(change, ".opsx-provenance.json") };
};

const worktreeFixture = async () => {
  const root = await mkdtemp(path.join(import.meta.dir, ".opsx-provenance-"));
  const change = path.join(root, "openspec", "changes", "sample");
  await mkdir(change, { recursive: true });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: a\n");
  await writeFile(path.join(change, ".openspec.yaml"), "schema: a\n");
  return { root, change, file: path.join(change, ".opsx-provenance.json") };
};

const ref = (name: string, source = name): RevisionRef => ({
  name,
  source: `/schemas/${source}`,
  digest: name.repeat(64).slice(0, 64),
});

const association = (revision: RevisionRef): ChangeSelectionAssociation => ({
  version: 1,
  effectiveRevision: revision,
  profiles: [],
  skillHosts: [],
  skillBundle: "default",
  manifestDigests: {
    agentProfiles: "a".repeat(64),
    schemaSkills: "b".repeat(64),
    skillBundles: null,
  },
});

const selection = (
  revision: RevisionRef,
  profiles: string[] = [],
  skillHosts: ChangeSelectionAssociation["skillHosts"] = [],
): ChangeSelectionAssociation => ({
  ...association(revision),
  profiles,
  skillHosts,
});

const event = (
  operationId: string,
  afterMigrationCount: number,
  from: RevisionRef,
  to: RevisionRef,
  associationBefore: ChangeSelectionAssociation | null = null,
  associationAfter: ChangeSelectionAssociation | null = null,
): RePinEvent => ({
  operationId,
  at: "2026-10-07T00:00:00.000Z",
  afterMigrationCount,
  from,
  to,
  associationBefore,
  associationAfter,
});

const put = async (file: string, value: unknown) =>
  writeFile(file, JSON.stringify(value));

test("folds re-pin, migration, and re-pin in recorded chronological order", async () => {
  const { change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked"),
      c = ref("c"),
      d = ref("c", "c-linked"),
      e = ref("c", "c-repinned");
    await put(file, {
      version: 1,
      created: a,
      migrations: [{ from: b, to: c, at: "2026-10-07T00:01:00.000Z" }],
      rePins: [
        event("first", 0, a, b),
        event("second", 1, c, d),
        event("third", 1, d, e),
      ],
    });

    const provenance = await readProvenance(change);
    expect(provenance?.rePins).toHaveLength(3);
    expect(provenance?.rePins).toEqual([
      event("first", 0, a, b),
      event("second", 1, c, d),
      event("third", 1, d, e),
    ]);
    expect(provenance && effectiveRevision(provenance)).toEqual(e);
  } finally {
    await rm(path.dirname(path.dirname(path.dirname(change))), {
      recursive: true,
      force: true,
    });
  }
});

test("version-two creation and reviewed selection establish exact association positions", async () => {
  const { root, change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("b"),
      c = ref("b", "b-linked");
    await recordCreation(root, "sample", a);
    let provenance = await readProvenance(change);
    expect(provenance).toMatchObject({
      version: 2,
      establishments: [],
    });

    await recordMigration(root, "sample", a, b);
    await writeFile(path.join(change, ".openspec.yaml"), "schema: b\n");
    await put(file, {
      ...(await readProvenance(change)),
      rePins: [event("same-position", 1, b, c)],
      association: undefined,
    });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: b\n");
    await recordSelectionAssociation(root, "sample", c, association(c));

    provenance = await readProvenance(change);
    expect(provenance?.version).toBe(2);
    expect(provenance?.establishments?.at(-1)).toMatchObject({
      afterMigrationCount: 1,
      afterRePinCount: 1,
      association: association(c),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("version-two associated creation records establishment before reviewed migration", async () => {
  const { root, change } = await fixture();
  try {
    const a = ref("a"),
      b = ref("b");
    await recordCreation(root, "sample", a, association(a));
    await recordMigration(root, "sample", a, b, association(b));
    const provenance = await readProvenance(change);
    expect(provenance?.version).toBe(2);
    expect(provenance?.establishments).toEqual([
      {
        afterMigrationCount: 0,
        afterRePinCount: 0,
        association: association(a),
      },
    ]);
    expect(provenance?.migrations[0]).toMatchObject({
      from: a,
      to: b,
      associationBefore: association(a),
      associationAfter: association(b),
    });
    expect(provenance?.association).toEqual(association(b));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects forged or out-of-position association establishments without rewriting bytes", async () => {
  const { change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("b");
    const reviewed = association(a);
    const establishments = [
      {
        afterMigrationCount: 0,
        afterRePinCount: 0,
        association: reviewed,
      },
    ];
    const valid: Provenance = {
      version: 2,
      created: a,
      migrations: [
        {
          from: a,
          to: b,
          at: "2026-10-07T00:00:00.000Z",
          associationBefore: reviewed,
          associationAfter: association(b),
        },
      ],
      establishments,
      association: association(b),
    };
    await put(file, valid);
    expect(await readProvenance(change)).not.toBeNull();

    const invalid = [
      { ...valid, establishments: [] },
      {
        ...valid,
        establishments: [{ ...establishments[0]!, afterMigrationCount: 1 }],
      },
      {
        ...valid,
        establishments: [
          { ...establishments[0]!, association: association(b) },
        ],
      },
      { ...valid, establishments: [...establishments, establishments[0]!] },
    ];
    for (const value of invalid) {
      const bytes = JSON.stringify(value);
      await writeFile(file, bytes);
      await expect(readProvenance(change)).rejects.toMatchObject({
        code: "PROVENANCE_INVALID",
      });
      expect(await readFile(file, "utf8")).toBe(bytes);
    }
  } finally {
    await rm(path.dirname(path.dirname(path.dirname(change))), {
      recursive: true,
      force: true,
    });
  }
});

test("paired legacy association history stays readable but read-only without top-level association", async () => {
  const { root, change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked"),
      c = ref("c");
    const before = association(a);
    const legacy = {
      version: 1,
      created: a,
      migrations: [
        {
          from: a,
          to: b,
          at: "2026-10-07T00:00:00.000Z",
          associationBefore: before,
          associationAfter: association(b),
        },
      ],
    };
    const bytes = JSON.stringify(legacy);
    await writeFile(file, bytes);
    expect(await readProvenance(change)).not.toBeNull();
    await expect(recordMigration(root, "sample", b, c)).rejects.toMatchObject({
      code: "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
    });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: a\n");
    await expect(
      recordSelectionAssociation(root, "sample", b, association(b)),
    ).rejects.toMatchObject({
      code: "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
    });
    expect(await readFile(file, "utf8")).toBe(bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only explicit review upgrades an eligible version-one prefix and initializes establishments", async () => {
  const { root, change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked");
    const legacy = { version: 1, created: a, migrations: [] };
    const bytes = JSON.stringify(legacy);
    await writeFile(file, bytes);
    expect((await readProvenance(change))?.version).toBe(1);
    expect(await readFile(file, "utf8")).toBe(bytes);

    await recordSelectionAssociation(root, "sample", a, association(a));
    const upgraded = await readProvenance(change);
    expect(upgraded).toMatchObject({
      version: 2,
      created: a,
      establishments: [
        {
          afterMigrationCount: 0,
          afterRePinCount: 0,
          association: association(a),
        },
      ],
    });
    await recordMigration(root, "sample", a, b, association(b));
    expect(effectiveRevision((await readProvenance(change))!)).toEqual(b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy association-only reads preserve bytes and later migration uses the effective re-pin", async () => {
  const { root, change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked"),
      c = ref("c");
    const legacy = {
      version: 1,
      created: a,
      migrations: [],
      association: association(a),
    };
    const bytes = JSON.stringify(legacy);
    await writeFile(file, bytes);
    expect((await readProvenance(change))?.association).toEqual(association(a));
    expect(await readFile(file, "utf8")).toBe(bytes);

    await put(file, {
      version: 1,
      created: a,
      migrations: [],
      rePins: [event("repin", 0, a, b)],
    });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: a\n");
    await recordMigration(root, "sample", b, c);
    const migrated = await readProvenance(change);
    expect(migrated?.version).toBe(2);
    expect(migrated?.establishments).toEqual([]);
    expect(migrated?.rePins).toHaveLength(1);
    expect(migrated?.migrations.at(-1)?.from).toEqual(b);
    expect(effectiveRevision(migrated!)).toEqual(c);
    expect((await changeHistory(root, "sample")).rePins).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retention preserves re-pin history and exact association establishments", async () => {
  const { root, change } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked");
    await recordCreation(root, "sample", a);
    const before = await readProvenance(change);
    const eventA = event("retained-repin", 0, a, b);
    await put(path.join(change, ".opsx-provenance.json"), {
      ...before,
      rePins: [eventA],
    });
    const bytes = await readFile(
      path.join(change, ".opsx-provenance.json"),
      "utf8",
    );
    await expect(retainLegacy(root, "sample", b)).rejects.toMatchObject({
      code: "PROVENANCE_STALE",
    });
    expect(
      await readFile(path.join(change, ".opsx-provenance.json"), "utf8"),
    ).toBe(bytes);
    await retainLegacy(root, "sample", a);
    const retained = await readProvenance(change);
    expect(retained?.rePins).toEqual([eventA]);
    expect(effectiveRevision(retained!)).toEqual(b);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("created and retained history bases must have the same exact revision identity", async () => {
  const { root, change, file } = await fixture();
  try {
    const created = ref("a", "first");
    const retainedBase = ref("a", "second");
    const conflicting: Provenance = {
      version: 2,
      created,
      retained: retainedBase,
      migrations: [],
      establishments: [],
    };
    const bytes = JSON.stringify(conflicting);

    expect(() => parseProvenance(bytes, change)).toThrow(
      expect.objectContaining({ code: "PROVENANCE_INVALID" }),
    );
    expect(() => effectiveRevision(conflicting)).toThrow(
      expect.objectContaining({ code: "PROVENANCE_INVALID" }),
    );

    const witnessed: RevisionRef = {
      ...ref("a"),
      source: "/project/openspec/schemas/a",
      origin: {
        version: 1,
        commonDirectory: "/project/.git",
        dev: "1",
        ino: "2",
        relativeSchemaPath: "openspec/schemas/a",
      },
    };
    const bundled: RevisionRef = {
      ...ref("a"),
      bundleSource: {
        name: "source-bundle",
        version: "1.0",
        revision: "source-revision",
        digest: "c".repeat(64),
      },
    };
    const identityPairs: [RevisionRef, RevisionRef][] = [
      [witnessed, { ...witnessed, origin: { ...witnessed.origin!, ino: "3" } }],
      [witnessed, { ...witnessed, origin: undefined }],
      [bundled, ref("a")],
      [
        bundled,
        {
          ...bundled,
          bundleSource: {
            ...bundled.bundleSource!,
            revision: "other-revision",
          },
        },
      ],
    ];
    for (const [base, variant] of identityPairs) {
      const value: Provenance = {
        version: 2,
        created: base,
        retained: variant,
        migrations: [],
        establishments: [],
      };
      expect(() => effectiveRevision(value)).toThrow(
        expect.objectContaining({ code: "PROVENANCE_INVALID" }),
      );
    }

    await writeFile(file, bytes);
    await expect(
      recordMigration(root, "sample", retainedBase, ref("b")),
    ).rejects.toMatchObject({ code: "PROVENANCE_INVALID" });
    expect(await readFile(file, "utf8")).toBe(bytes);

    const sameBase = {
      ...conflicting,
      retained: created,
    } satisfies Provenance;
    expect(effectiveRevision(sameBase)).toEqual(created);
    expect(parseProvenance(JSON.stringify(sameBase), change)).toEqual(sameBase);

    const legacyBases: Provenance[] = [
      { version: 1, created, migrations: [] },
      { version: 1, created: null, retained: retainedBase, migrations: [] },
    ];
    for (const legacy of legacyBases) {
      expect(() =>
        parseProvenance(JSON.stringify(legacy), change),
      ).not.toThrow();
      expect(effectiveRevision(legacy)).toEqual(
        legacy.retained ?? legacy.created,
      );
    }

    const legacyCreatedOnly = {
      version: 1 as const,
      created,
      migrations: [],
    } satisfies Provenance;
    await writeFile(file, JSON.stringify(legacyCreatedOnly));
    await retainLegacy(root, "sample", created);
    const retainedProvenance = await readProvenance(change);
    expect(retainedProvenance?.created).toEqual(created);
    expect(retainedProvenance?.retained).toEqual(created);
    expect(effectiveRevision(retainedProvenance!)).toEqual(created);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archived reads retain re-pin events and association establishment history", async () => {
  const { root, change, file } = await fixture();
  try {
    const a = ref("a"),
      b = ref("a", "a-linked");
    await recordCreation(root, "sample", a, association(a));
    const initial = await readProvenance(change);
    const eventB = event(
      "archived-repin",
      0,
      a,
      b,
      association(a),
      association(b),
    );
    await put(file, {
      ...initial,
      rePins: [eventB],
      association: association(b),
    });
    await writeFile(path.join(change, ".openspec.yaml"), "schema: a\n");
    const archived = path.join(
      root,
      "openspec",
      "changes",
      "archive",
      "2026-10-10-sample",
    );
    await mkdir(path.dirname(archived), { recursive: true });
    await rename(change, archived);

    const history = await changeHistory(root, "2026-10-10-sample", true);
    expect(history.rePins).toEqual([eventB]);
    expect(history.establishments).toEqual(initial?.establishments);
    expect(history.currentSchema).toBe("a");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("re-pin endpoints preserve bundle identity while allowing origin changes", async () => {
  const { root, change, file } = await worktreeFixture();
  try {
    const from: RevisionRef = {
      ...ref("a"),
      source: "/project-one/openspec/schemas/a",
      origin: {
        version: 1,
        commonDirectory: "/project-one/.git",
        dev: "1",
        ino: "2",
        relativeSchemaPath: "openspec/schemas/a",
      },
    };
    const to: RevisionRef = {
      ...ref("a"),
      source: "/project-two/openspec/schemas/a",
      origin: {
        version: 1,
        commonDirectory: "/project-two/.git",
        dev: "3",
        ino: "4",
        relativeSchemaPath: "openspec/schemas/a",
      },
    };
    const bundle = {
      name: "source-bundle",
      version: "1.0",
      revision: "source-revision",
      digest: "c".repeat(64),
    };
    const validFrom = { ...from, bundleSource: bundle };
    const validTo = {
      ...to,
      bundleSource: {
        digest: bundle.digest,
        revision: bundle.revision,
        version: bundle.version,
        name: bundle.name,
      },
    };
    await put(file, {
      version: 1,
      created: validFrom,
      migrations: [],
      rePins: [event("same-bundle", 0, validFrom, validTo)],
    });
    expect(await readProvenance(change)).not.toBeNull();

    const changedBundles = [
      { from, to: { ...to, bundleSource: bundle } },
      { from: validFrom, to },
      ...(["name", "version", "revision", "digest"] as const).map((field) => ({
        from: validFrom,
        to: {
          ...validTo,
          bundleSource: {
            ...bundle,
            [field]:
              field === "digest" ? "d".repeat(64) : `${bundle[field]}-changed`,
          },
        },
      })),
    ];
    for (const [index, endpoints] of changedBundles.entries()) {
      const bytes = JSON.stringify({
        version: 1,
        created: endpoints.from,
        migrations: [],
        rePins: [
          event(`changed-bundle-${index}`, 0, endpoints.from, endpoints.to),
        ],
      });
      await writeFile(file, bytes);
      await expect(readProvenance(change)).rejects.toMatchObject({
        code: "PROVENANCE_INVALID",
      });
      expect(await readFile(file, "utf8")).toBe(bytes);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("version-two re-pin preserves established association identity and rejects transitions", async () => {
  const { root, change, file } = await worktreeFixture();
  try {
    const from = ref("a", "before");
    const to = ref("a", "after");
    const before = selection(from, ["alpha", "beta"], ["atomic", "omp"]);
    const sortedAfter = selection(to, ["beta", "alpha"], ["omp", "atomic"]);
    await recordCreation(root, "sample", from, before);
    const created = (await readProvenance(change))!;
    const validEvent = event(
      "associated-repin",
      0,
      from,
      to,
      before,
      sortedAfter,
    );
    await put(file, {
      ...created,
      rePins: [validEvent],
      association: sortedAfter,
    });
    expect(effectiveRevision((await readProvenance(change))!)).toEqual(to);

    const changedSelections = [
      selection(to, ["other"], ["atomic", "omp"]),
      selection(to, ["alpha", "beta"], ["atomic"]),
      { ...sortedAfter, skillBundle: "recommended" as const },
      {
        ...sortedAfter,
        manifestDigests: {
          ...sortedAfter.manifestDigests,
          agentProfiles: "d".repeat(64),
        },
      },
      {
        ...sortedAfter,
        manifestDigests: {
          ...sortedAfter.manifestDigests,
          schemaSkills: "e".repeat(64),
        },
      },
      {
        ...sortedAfter,
        manifestDigests: {
          ...sortedAfter.manifestDigests,
          skillBundles: "f".repeat(64),
        },
      },
    ];
    const invalid = [
      {
        ...created,
        rePins: [
          event("invent-association", 0, from, to, null, association(to)),
        ],
        association: association(to),
      },
      {
        ...created,
        rePins: [event("drop-association", 0, from, to, before, null)],
        association: undefined,
      },
      ...changedSelections.map((after, index) => ({
        ...created,
        rePins: [
          event(`change-selection-${index}`, 0, from, to, before, after),
        ],
        association: after,
      })),
      {
        ...created,
        rePins: [event("out-of-position", 1, from, to, before, sortedAfter)],
        association: sortedAfter,
      },
      {
        version: 1,
        created: from,
        migrations: [{ from, to: ref("c"), at: "2026-10-07T00:00:00.000Z" }],
        rePins: [
          event("later-position-first", 1, ref("c"), ref("c", "linked-c")),
          event("earlier-position-second", 0, from, to),
        ],
      },
    ];
    for (const [index, value] of invalid.entries()) {
      const bytes = JSON.stringify(value);
      await writeFile(file, bytes);
      await expect(readProvenance(change)).rejects.toMatchObject({
        code: "PROVENANCE_INVALID",
      });
      expect(await readFile(file, "utf8")).toBe(bytes);
    }

    const legacyBytes = JSON.stringify({
      version: 1,
      created: from,
      migrations: [],
      rePins: [event("legacy-pair", 0, from, to, before, sortedAfter)],
      association: sortedAfter,
    });
    await writeFile(file, legacyBytes);
    expect(await readProvenance(change)).not.toBeNull();
    expect(await readFile(file, "utf8")).toBe(legacyBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
