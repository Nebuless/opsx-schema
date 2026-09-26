import { link, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { boundedFile, changeDirectory } from "../archive/index.ts";
import { defaultSchema, OpsxError } from "../domain/project.ts";
import { isSkillInstallHostId } from "../resources/index.ts";
import type { SkillBundle, SkillInstallHostId, SkillInstallPlan } from "../resources/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";

export interface MigrationReceipt { from: RevisionRef; to: RevisionRef; at: string }
export interface ChangeSelectionAssociation {
  version: 1;
  effectiveRevision: RevisionRef;
  profiles: string[];
  skillHosts: SkillInstallHostId[];
  skillBundle: SkillBundle;
  manifestDigests: SkillInstallPlan["manifestDigests"];
}
export interface Provenance {
  version: 1;
  created: RevisionRef | null;
  migrations: MigrationReceipt[];
  retained?: RevisionRef;
  association?: ChangeSelectionAssociation;
}
export interface ChangeHistory {
  name: string;
  created: RevisionRef | "Unknown";
  currentSchema: string | "Unknown";
  inherited: boolean;
  migrations: MigrationReceipt[];
  retained?: RevisionRef;
  divergence: string | null;
}

function provenancePath(directory: string): string {
  return path.join(directory, ".opsx-provenance.json");
}

function isRef(value: unknown): value is RevisionRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  const bundleSource = ref.bundleSource;
  const bundleValid = bundleSource === undefined || (!!bundleSource && typeof bundleSource === "object" && !Array.isArray(bundleSource)
    && typeof (bundleSource as Record<string, unknown>).name === "string"
    && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test((bundleSource as Record<string, unknown>).name as string)
    && typeof (bundleSource as Record<string, unknown>).version === "string" && !!(bundleSource as Record<string, unknown>).version
    && typeof (bundleSource as Record<string, unknown>).revision === "string" && !!(bundleSource as Record<string, unknown>).revision
    && typeof (bundleSource as Record<string, unknown>).digest === "string" && /^[0-9a-f]{64}$/.test((bundleSource as Record<string, unknown>).digest as string));
  return typeof ref.name === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(ref.name)
    && typeof ref.source === "string" && path.isAbsolute(ref.source)
    && typeof ref.digest === "string" && /^[0-9a-f]{64}$/.test(ref.digest) && bundleValid;
}

function asRef(value: RevisionRef): RevisionRef {
  return {
    name: value.name,
    source: value.source,
    digest: value.digest,
    ...(value.bundleSource ? { bundleSource: { ...value.bundleSource } } : {}),
  };
}

export function revisionRef(revision: Revision): RevisionRef {
  return asRef(revision);
}

function sameRevisionRef(a: RevisionRef, b: RevisionRef): boolean {
  return a.name === b.name && a.source === b.source && a.digest === b.digest
    && (a.bundleSource === undefined || b.bundleSource === undefined || JSON.stringify(a.bundleSource) === JSON.stringify(b.bundleSource));
}

function sameExactRevisionRef(a: RevisionRef, b: RevisionRef): boolean {
  return sameRevisionRef(a, b) && (a.bundleSource === undefined) === (b.bundleSource === undefined);
}

function isSelectionAssociation(value: unknown): value is ChangeSelectionAssociation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const association = value as Record<string, unknown>;
  const keys = ["version", "effectiveRevision", "profiles", "skillHosts", "skillBundle", "manifestDigests"];
  if (Object.keys(association).length !== keys.length || Object.keys(association).some(key => !keys.includes(key))
    || association.version !== 1 || !isRef(association.effectiveRevision)) return false;
  if (!Array.isArray(association.profiles) || association.profiles.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))
    || new Set(association.profiles).size !== association.profiles.length) return false;
  if (!Array.isArray(association.skillHosts) || association.skillHosts.some(host => !isSkillInstallHostId(host))
    || new Set(association.skillHosts).size !== association.skillHosts.length) return false;
  if (!(association.skillBundle === "default" || association.skillBundle === "recommended" || association.skillBundle === "all")) return false;
  const digests = association.manifestDigests;
  if (!digests || typeof digests !== "object" || Array.isArray(digests)) return false;
  const manifestDigests = digests as Record<string, unknown>;
  return Object.keys(manifestDigests).length === 3
    && ["agentProfiles", "schemaSkills", "skillBundles"].every(key => Object.hasOwn(manifestDigests, key))
    && typeof manifestDigests.agentProfiles === "string" && /^[0-9a-f]{64}$/.test(manifestDigests.agentProfiles)
    && typeof manifestDigests.schemaSkills === "string" && /^[0-9a-f]{64}$/.test(manifestDigests.schemaSkills)
    && (manifestDigests.skillBundles === null || (typeof manifestDigests.skillBundles === "string" && /^[0-9a-f]{64}$/.test(manifestDigests.skillBundles)));
}

function copySelectionAssociation(value: ChangeSelectionAssociation): ChangeSelectionAssociation {
  return {
    version: 1,
    effectiveRevision: asRef(value.effectiveRevision),
    profiles: [...value.profiles].sort(),
    skillHosts: [...value.skillHosts].sort(),
    skillBundle: value.skillBundle,
    manifestDigests: { ...value.manifestDigests },
  };
}

function sameSelectionAssociation(a: ChangeSelectionAssociation, b: ChangeSelectionAssociation): boolean {
  return JSON.stringify(copySelectionAssociation(a)) === JSON.stringify(copySelectionAssociation(b));
}

export async function readProvenance(directory: string): Promise<Provenance | null> {
  let bytes: string;
  try {
    bytes = (await boundedFile(directory, ".opsx-provenance.json")).content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(bytes);
  } catch {
    throw new OpsxError("PROVENANCE_INVALID", `Invalid provenance at ${directory}.`);
  }
  const value = data as Provenance;
  if (!value || value.version !== 1 || (value.created !== null && !isRef(value.created)) || !Array.isArray(value.migrations)
    || value.migrations.some(entry => !entry || !isRef(entry.from) || !isRef(entry.to) || typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at)))
    || (value.retained !== undefined && !isRef(value.retained))
    || (value.association !== undefined && !isSelectionAssociation(value.association))) {
    throw new OpsxError("PROVENANCE_INVALID", "Malformed provenance at " + directory + ".");
  }
  return {
    ...value,
    ...(value.created ? { created: asRef(value.created) } : {}),
    migrations: value.migrations.map(entry => ({ from: asRef(entry.from), to: asRef(entry.to), at: entry.at })),
    ...(value.retained ? { retained: asRef(value.retained) } : {}),
    ...(value.association ? { association: copySelectionAssociation(value.association) } : {}),
  };
}

async function replace(directory: string, expected: Provenance | null, next: Provenance, beforeCommit?: () => Promise<void>): Promise<void> {
  const file = provenancePath(directory);
  const current = await readProvenance(directory);
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new OpsxError("PROVENANCE_STALE", `Provenance changed before write: ${file}`);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    if (JSON.stringify(await readProvenance(directory)) !== JSON.stringify(expected)) throw new OpsxError("PROVENANCE_STALE", `Provenance changed during write: ${file}`);
    await beforeCommit?.();
    if (expected === null) {
      try {
        await link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new OpsxError("PROVENANCE_STALE", `Provenance appeared during creation: ${file}`);
        throw error;
      }
    } else await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

interface SelectionPinSnapshot {
  metadata: string;
  schema: string;
  inherited: boolean;
  defaultSchema: string | null;
}

async function selectionPinSnapshot(root: string, name: string, directory: string): Promise<SelectionPinSnapshot> {
  let content: string;
  try {
    content = (await boundedFile(directory, ".openspec.yaml")).content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new OpsxError("PROVENANCE_PIN_MISSING", `Change ${name} has no schema pin metadata.`);
    throw error;
  }
  let metadata: unknown;
  try {
    metadata = YAML.parse(content);
  } catch {
    throw new OpsxError("PROVENANCE_INVALID", `Change ${name} has invalid schema pin metadata.`);
  }
  const pin = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).schema : undefined;
  if (pin != null && (typeof pin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pin))) {
    throw new OpsxError("PROVENANCE_INVALID", `Change ${name} has an invalid schema pin.`);
  }
  const inherited = pin == null;
  const projectDefault = inherited ? await defaultSchema(root) : null;
  const schema = inherited ? projectDefault! : pin as string;
  return { metadata: content, schema, inherited, defaultSchema: projectDefault };
}

function sameSelectionPinSnapshot(a: SelectionPinSnapshot, b: SelectionPinSnapshot): boolean {
  return a.metadata === b.metadata && a.schema === b.schema && a.inherited === b.inherited && a.defaultSchema === b.defaultSchema;
}

export async function recordCreation(root: string, name: string, revision: RevisionRef, association?: ChangeSelectionAssociation): Promise<void> {
  if (!isRef(revision)) throw new OpsxError("PROVENANCE_INVALID", "Invalid creation revision.");
  const directory = await changeDirectory(root, name);
  if (await readProvenance(directory)) throw new OpsxError("PROVENANCE_EXISTS", "Change " + name + " already has provenance.");
  if (association !== undefined) {
    if (!isSelectionAssociation(association) || !sameExactRevisionRef(revision, association.effectiveRevision)) {
      throw new OpsxError("PROVENANCE_INVALID", "Invalid change selection association or schema revision mismatch.");
    }
    let metadata: unknown;
    try {
      metadata = YAML.parse((await boundedFile(directory, ".openspec.yaml")).content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new OpsxError("PROVENANCE_PIN_MISSING", "Change " + name + " has no schema pin metadata.");
      throw error;
    }
    const pin = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).schema : undefined;
    const effectiveSchema = pin == null ? await defaultSchema(root) : pin;
    if (typeof effectiveSchema !== "string" || effectiveSchema !== association.effectiveRevision.name) {
      throw new OpsxError("PROVENANCE_PIN_MISMATCH", "Change " + name + " does not resolve to the associated schema revision.");
    }
  }
  await replace(directory, null, {
    version: 1,
    created: asRef(revision),
    migrations: [],
    ...(association ? { association: copySelectionAssociation(association) } : {}),
  });
}

export async function recordSelectionAssociation(
  root: string,
  name: string,
  revision: RevisionRef,
  association: ChangeSelectionAssociation,
): Promise<void> {
  if (!isRef(revision) || !isSelectionAssociation(association) || !sameExactRevisionRef(revision, association.effectiveRevision)) {
    throw new OpsxError("PROVENANCE_INVALID", "Invalid change selection association or schema revision mismatch.");
  }
  const directory = await changeDirectory(root, name);
  const pinBefore = await selectionPinSnapshot(root, name, directory);
  if (pinBefore.schema !== revision.name) {
    throw new OpsxError("PROVENANCE_PIN_MISMATCH", `Change ${name} does not resolve to the associated schema revision.`);
  }
  const previous = await readProvenance(directory);
  const latest = previous?.migrations.at(-1)?.to ?? previous?.retained ?? previous?.created;
  if (latest && !sameExactRevisionRef(latest, revision)) {
    throw new OpsxError("PROVENANCE_STALE", `Recorded revision for ${name} differs from the reviewed pinned revision.`);
  }
  const nextAssociation = copySelectionAssociation(association);
  if (previous?.association) {
    if (sameSelectionAssociation(previous.association, nextAssociation)) return;
    throw new OpsxError("PROVENANCE_ASSOCIATION_MISMATCH", `Change ${name} already has a different selection association.`);
  }
  const next: Provenance = {
    version: 1,
    created: previous?.created ?? null,
    migrations: [...(previous?.migrations ?? [])],
    ...(previous?.retained ? { retained: previous.retained } : !latest ? { retained: asRef(revision) } : {}),
    association: nextAssociation,
  };
  await replace(directory, previous, next, async () => {
    const pinAfter = await selectionPinSnapshot(root, name, directory);
    if (!sameSelectionPinSnapshot(pinBefore, pinAfter)) {
      throw new OpsxError("PROVENANCE_STALE", `Schema pin changed while selection association was being recorded for ${name}.`);
    }
  });
}

export async function retainLegacy(root: string, name: string, revision: RevisionRef): Promise<void> {
  if (!isRef(revision)) throw new OpsxError("PROVENANCE_INVALID", "Invalid retained revision.");
  const directory = await changeDirectory(root, name);
  const previous = await readProvenance(directory);
  if (previous?.retained && !sameRevisionRef(previous.retained, revision)) {
    throw new OpsxError("PROVENANCE_STALE", `Change ${name} already retained another revision.`);
  }
  if (previous?.retained) return;
  await replace(directory, previous, {
    version: 1,
    created: previous?.created ?? null,
    migrations: previous?.migrations ?? [],
    retained: asRef(revision),
    ...(previous?.association ? { association: previous.association } : {}),
  });
}

export async function recordMigration(root: string, name: string, from: RevisionRef, to: RevisionRef): Promise<void> {
  if (!isRef(from) || !isRef(to)) throw new OpsxError("PROVENANCE_INVALID", "Invalid migration revision.");
  const directory = await changeDirectory(root, name);
  const previous = await readProvenance(directory);
  if (previous?.association) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Migration of an associated change requires a reviewed target selection; recordMigration cannot preserve the previous pin association.",
    );
  }
  const prior = previous?.migrations.at(-1)?.to ?? previous?.retained ?? previous?.created;
  if (prior && !sameRevisionRef(prior, from)) throw new OpsxError("PROVENANCE_STALE", "Migration source diverges for " + name + ".");
  await replace(directory, previous, {
    version: 1,
    created: previous?.created ?? null,
    migrations: [...(previous?.migrations ?? []), { from: asRef(from), to: asRef(to), at: new Date().toISOString() }],
    ...(previous?.retained ? { retained: previous.retained } : {}),
    ...(previous?.association ? { association: previous.association } : {}),
  });
}

export async function changeHistory(root: string, name: string, archived = false): Promise<ChangeHistory> {
  const directory = await changeDirectory(root, name, archived);
  const record = await readProvenance(directory);
  let metadata: unknown;
  try {
    metadata = YAML.parse((await boundedFile(directory, ".openspec.yaml")).content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pin = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).schema : undefined;
  if (pin != null && (typeof pin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pin))) {
    throw new OpsxError("PROVENANCE_INVALID", `Invalid schema pin for ${name}.`);
  }
  const inherited = pin == null;
  const currentSchema = (pin as string | undefined) ?? (archived ? "Unknown" : await defaultSchema(root));
  const latest = record?.migrations.at(-1)?.to ?? record?.retained ?? record?.created;
  const divergence = latest && currentSchema !== "Unknown" && latest.name !== currentSchema
    ? `Recorded revision ${latest.name} differs from live schema ${currentSchema}.` : null;
  return {
    name,
    created: record?.created ?? "Unknown",
    currentSchema,
    inherited,
    migrations: record?.migrations ?? [],
    ...(record?.retained ? { retained: record.retained } : {}),
    divergence,
  };
}
