import { link, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { boundedFile, changeDirectory } from "../archive/index.ts";
import { defaultSchema, OpsxError } from "../domain/project.ts";
import { isSkillInstallHostId } from "../resources/index.ts";
import type {
  SkillBundle,
  SkillInstallHostId,
  SkillInstallPlan,
} from "../resources/index.ts";
import type { OpenSpecClient } from "../openspec/client.ts";
import {
  checkRevision,
  inspectRetainedRevision,
  revisionRefIdentity,
  type Revision,
  type RevisionRef,
  type RevisionCheck,
} from "../revisions/index.ts";
import { originMatchesSource } from "../revisions/origin.ts";

export interface MigrationReceipt {
  from: RevisionRef;
  to: RevisionRef;
  at: string;
  associationBefore?: ChangeSelectionAssociation;
  associationAfter?: ChangeSelectionAssociation;
}
export interface RePinEvent {
  operationId: string;
  at: string;
  afterMigrationCount: number;
  from: RevisionRef;
  to: RevisionRef;
  associationBefore: ChangeSelectionAssociation | null;
  associationAfter: ChangeSelectionAssociation | null;
}
export interface ChangeSelectionAssociation {
  version: 1;
  effectiveRevision: RevisionRef;
  profiles: string[];
  skillHosts: SkillInstallHostId[];
  skillBundle: SkillBundle;
  manifestDigests: SkillInstallPlan["manifestDigests"];
}
export interface AssociationEstablishment {
  afterMigrationCount: number;
  afterRePinCount: number;
  association: ChangeSelectionAssociation;
}
export interface Provenance {
  version: 1 | 2;
  created: RevisionRef | null;
  migrations: MigrationReceipt[];
  retained?: RevisionRef;
  association?: ChangeSelectionAssociation;
  rePins?: RePinEvent[];
  establishments?: AssociationEstablishment[];
}
export interface ChangeHistory {
  name: string;
  created: RevisionRef | "Unknown";
  currentSchema: string | "Unknown";
  inherited: boolean;
  migrations: MigrationReceipt[];
  rePins?: RePinEvent[];
  establishments?: AssociationEstablishment[];
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
  const bundleValid =
    bundleSource === undefined ||
    (!!bundleSource &&
      typeof bundleSource === "object" &&
      !Array.isArray(bundleSource) &&
      typeof (bundleSource as Record<string, unknown>).name === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(
        (bundleSource as Record<string, unknown>).name as string,
      ) &&
      typeof (bundleSource as Record<string, unknown>).version === "string" &&
      !!(bundleSource as Record<string, unknown>).version &&
      typeof (bundleSource as Record<string, unknown>).revision === "string" &&
      !!(bundleSource as Record<string, unknown>).revision &&
      typeof (bundleSource as Record<string, unknown>).digest === "string" &&
      /^[0-9a-f]{64}$/.test(
        (bundleSource as Record<string, unknown>).digest as string,
      ));
  return (
    typeof ref.name === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(ref.name) &&
    typeof ref.source === "string" &&
    path.isAbsolute(ref.source) &&
    typeof ref.digest === "string" &&
    /^[0-9a-f]{64}$/.test(ref.digest) &&
    bundleValid &&
    (ref.origin === undefined ||
      originMatchesSource(ref.source, ref.origin, ref.name))
  );
}

function asRef(value: RevisionRef): RevisionRef {
  return {
    name: value.name,
    source: value.source,
    digest: value.digest,
    ...(value.bundleSource ? { bundleSource: { ...value.bundleSource } } : {}),
    ...(value.origin ? { origin: { ...value.origin } } : {}),
  };
}

export function revisionRef(revision: Revision): RevisionRef {
  return asRef(revision);
}

export function sameRevisionRef(a: RevisionRef, b: RevisionRef): boolean {
  return revisionRefIdentity(a) === revisionRefIdentity(b);
}

function sameBundleSource(a: RevisionRef, b: RevisionRef): boolean {
  const left = a.bundleSource;
  const right = b.bundleSource;
  return left === undefined
    ? right === undefined
    : right !== undefined &&
        left.name === right.name &&
        left.version === right.version &&
        left.revision === right.revision &&
        left.digest === right.digest;
}

export function sameRevisionPathAndContent(
  a: RevisionRef,
  b: RevisionRef,
): boolean {
  return (
    a.name === b.name &&
    a.source === b.source &&
    a.digest === b.digest &&
    sameBundleSource(a, b)
  );
}

export async function checkRecordedRevision(
  root: string,
  recorded: RevisionRef,
  live: Revision,
  client: OpenSpecClient,
): Promise<{
  check: RevisionCheck;
  liveMatches: boolean;
  retentionMissing: boolean;
}> {
  const check = await checkRevision(root, recorded, client);
  let retentionMissing = false;
  if (!check.retained && check.revision && check.state === "drift") {
    try {
      await inspectRetainedRevision(root, recorded);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        retentionMissing = true;
      else throw error;
    }
  }
  return {
    check,
    liveMatches: check.revision
      ? sameRevisionPathAndContent(check.revision, live)
      : false,
    retentionMissing,
  };
}

function isSelectionAssociation(
  value: unknown,
): value is ChangeSelectionAssociation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const association = value as Record<string, unknown>;
  const keys = [
    "version",
    "effectiveRevision",
    "profiles",
    "skillHosts",
    "skillBundle",
    "manifestDigests",
  ];
  if (
    Object.keys(association).length !== keys.length ||
    Object.keys(association).some((key) => !keys.includes(key)) ||
    association.version !== 1 ||
    !isRef(association.effectiveRevision)
  )
    return false;
  if (
    !Array.isArray(association.profiles) ||
    association.profiles.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id),
    ) ||
    new Set(association.profiles).size !== association.profiles.length
  )
    return false;
  if (
    !Array.isArray(association.skillHosts) ||
    association.skillHosts.some((host) => !isSkillInstallHostId(host)) ||
    new Set(association.skillHosts).size !== association.skillHosts.length
  )
    return false;
  if (
    !(
      association.skillBundle === "default" ||
      association.skillBundle === "recommended" ||
      association.skillBundle === "all"
    )
  )
    return false;
  const digests = association.manifestDigests;
  if (!digests || typeof digests !== "object" || Array.isArray(digests))
    return false;
  const manifestDigests = digests as Record<string, unknown>;
  return (
    Object.keys(manifestDigests).length === 3 &&
    ["agentProfiles", "schemaSkills", "skillBundles"].every((key) =>
      Object.hasOwn(manifestDigests, key),
    ) &&
    typeof manifestDigests.agentProfiles === "string" &&
    /^[0-9a-f]{64}$/.test(manifestDigests.agentProfiles) &&
    typeof manifestDigests.schemaSkills === "string" &&
    /^[0-9a-f]{64}$/.test(manifestDigests.schemaSkills) &&
    (manifestDigests.skillBundles === null ||
      (typeof manifestDigests.skillBundles === "string" &&
        /^[0-9a-f]{64}$/.test(manifestDigests.skillBundles)))
  );
}

function copySelectionAssociation(
  value: ChangeSelectionAssociation,
): ChangeSelectionAssociation {
  return {
    version: 1,
    effectiveRevision: asRef(value.effectiveRevision),
    profiles: [...value.profiles].sort(),
    skillHosts: [...value.skillHosts].sort(),
    skillBundle: value.skillBundle,
    manifestDigests: { ...value.manifestDigests },
  };
}

export function sameSelectionIdentity(
  a: ChangeSelectionAssociation,
  b: ChangeSelectionAssociation,
): boolean {
  const left = copySelectionAssociation(a);
  const right = copySelectionAssociation(b);
  return (
    left.profiles.join("\0") === right.profiles.join("\0") &&
    left.skillHosts.join("\0") === right.skillHosts.join("\0") &&
    left.skillBundle === right.skillBundle &&
    left.manifestDigests.agentProfiles ===
      right.manifestDigests.agentProfiles &&
    left.manifestDigests.schemaSkills === right.manifestDigests.schemaSkills &&
    left.manifestDigests.skillBundles === right.manifestDigests.skillBundles
  );
}

function sameSelectionAssociation(
  a: ChangeSelectionAssociation,
  b: ChangeSelectionAssociation,
): boolean {
  return (
    sameRevisionRef(a.effectiveRevision, b.effectiveRevision) &&
    sameSelectionIdentity(a, b)
  );
}

function sameAssociationOrNull(
  a: ChangeSelectionAssociation | null,
  b: ChangeSelectionAssociation | null,
): boolean {
  return a === null ? b === null : b !== null && sameSelectionAssociation(a, b);
}

function validMigration(entry: MigrationReceipt): boolean {
  const hasBefore = Object.hasOwn(entry, "associationBefore");
  const hasAfter = Object.hasOwn(entry, "associationAfter");
  if (hasBefore !== hasAfter) return false;
  if (!hasBefore) return true;
  return (
    Object.keys(entry).length === 5 &&
    isSelectionAssociation(entry.associationBefore) &&
    isSelectionAssociation(entry.associationAfter) &&
    sameRevisionRef(entry.associationBefore.effectiveRevision, entry.from) &&
    sameRevisionRef(entry.associationAfter.effectiveRevision, entry.to)
  );
}

function isRePinEvent(value: unknown): value is RePinEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = [
    "operationId",
    "at",
    "afterMigrationCount",
    "from",
    "to",
    "associationBefore",
    "associationAfter",
  ];
  return (
    Object.keys(event).length === keys.length &&
    Object.keys(event).every((key) => keys.includes(key)) &&
    typeof event.operationId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(event.operationId) &&
    typeof event.at === "string" &&
    Number.isFinite(Date.parse(event.at)) &&
    Number.isSafeInteger(event.afterMigrationCount) &&
    (event.afterMigrationCount as number) >= 0 &&
    isRef(event.from) &&
    isRef(event.to) &&
    event.from.name === event.to.name &&
    event.from.digest === event.to.digest &&
    sameBundleSource(event.from, event.to) &&
    (event.associationBefore === null ||
      (isSelectionAssociation(event.associationBefore) &&
        sameRevisionRef(
          event.associationBefore.effectiveRevision,
          event.from,
        ))) &&
    (event.associationAfter === null ||
      (isSelectionAssociation(event.associationAfter) &&
        sameRevisionRef(event.associationAfter.effectiveRevision, event.to)))
  );
}

function isEstablishment(value: unknown): value is AssociationEstablishment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).length === 3 &&
    ["afterMigrationCount", "afterRePinCount", "association"].every((key) =>
      Object.hasOwn(item, key),
    ) &&
    Number.isSafeInteger(item.afterMigrationCount) &&
    (item.afterMigrationCount as number) >= 0 &&
    Number.isSafeInteger(item.afterRePinCount) &&
    (item.afterRePinCount as number) >= 0 &&
    isSelectionAssociation(item.association)
  );
}

function copyMigration(entry: MigrationReceipt): MigrationReceipt {
  return {
    from: asRef(entry.from),
    to: asRef(entry.to),
    at: entry.at,
    ...(entry.associationBefore && entry.associationAfter
      ? {
          associationBefore: copySelectionAssociation(entry.associationBefore),
          associationAfter: copySelectionAssociation(entry.associationAfter),
        }
      : {}),
  };
}

function copyRePinEvent(event: RePinEvent): RePinEvent {
  return {
    operationId: event.operationId,
    at: event.at,
    afterMigrationCount: event.afterMigrationCount,
    from: asRef(event.from),
    to: asRef(event.to),
    associationBefore: event.associationBefore
      ? copySelectionAssociation(event.associationBefore)
      : null,
    associationAfter: event.associationAfter
      ? copySelectionAssociation(event.associationAfter)
      : null,
  };
}

function copyEstablishment(
  item: AssociationEstablishment,
): AssociationEstablishment {
  return {
    afterMigrationCount: item.afterMigrationCount,
    afterRePinCount: item.afterRePinCount,
    association: copySelectionAssociation(item.association),
  };
}

function historyBase(
  value: Pick<Provenance, "created" | "retained" | "migrations" | "rePins">,
): RevisionRef | null {
  if (
    value.created &&
    value.retained &&
    !sameRevisionRef(value.created, value.retained)
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Created and retained revisions disagree at the history base.",
    );
  }
  const firstEvent = value.rePins?.[0];
  return (
    value.retained ??
    value.created ??
    (firstEvent?.afterMigrationCount === 0
      ? firstEvent.from
      : value.migrations[0]?.from) ??
    null
  );
}

function foldHistory(
  value: Pick<
    Provenance,
    | "version"
    | "created"
    | "retained"
    | "migrations"
    | "rePins"
    | "association"
    | "establishments"
  >,
): {
  revision: RevisionRef | null;
  association: ChangeSelectionAssociation | null;
} {
  if (value.version === 2 && !Array.isArray(value.establishments)) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Version-two provenance requires association establishments.",
    );
  }
  let revision = historyBase(value);
  let association: ChangeSelectionAssociation | null = null;
  let associationKnown = false;
  let rePinIndex = 0;
  let establishmentIndex = 0;
  const events = value.rePins ?? [];
  const establishments = value.establishments ?? [];

  const establish = (migrationCount: number): void => {
    const item = establishments[establishmentIndex];
    if (
      value.version !== 2 ||
      !item ||
      item.afterMigrationCount !== migrationCount ||
      item.afterRePinCount !== rePinIndex
    ) {
      return;
    }
    if (
      association !== null ||
      !revision ||
      !sameRevisionRef(item.association.effectiveRevision, revision)
    ) {
      throw new OpsxError(
        "PROVENANCE_INVALID",
        "Association establishment conflicts with its predecessor.",
      );
    }
    association = copySelectionAssociation(item.association);
    associationKnown = true;
    establishmentIndex++;
  };

  const applyRePins = (migrationCount: number): void => {
    establish(migrationCount);
    while (events[rePinIndex]?.afterMigrationCount === migrationCount) {
      const event = events[rePinIndex];
      if (!event || !revision || !sameRevisionRef(revision, event.from)) {
        throw new OpsxError(
          "PROVENANCE_INVALID",
          "Re-pin history conflicts with its effective revision.",
        );
      }
      if (value.version === 1 && (!associationKnown || association === null)) {
        association = event.associationBefore
          ? copySelectionAssociation(event.associationBefore)
          : null;
        associationKnown = true;
      }
      if (!sameAssociationOrNull(association, event.associationBefore)) {
        throw new OpsxError(
          "PROVENANCE_INVALID",
          "Re-pin history conflicts with its association disposition.",
        );
      }
      if (
        (association === null) !== (event.associationAfter === null) ||
        (association !== null &&
          event.associationAfter !== null &&
          !sameSelectionIdentity(association, event.associationAfter))
      ) {
        throw new OpsxError(
          "PROVENANCE_INVALID",
          "A re-pin cannot establish, drop, or change a skill selection.",
        );
      }
      if (value.version === 2 && association && !event.associationBefore) {
        throw new OpsxError(
          "PROVENANCE_INVALID",
          "Associated re-pin is missing its reviewed predecessor.",
        );
      }
      revision = asRef(event.to);
      association = event.associationAfter
        ? copySelectionAssociation(event.associationAfter)
        : null;
      associationKnown = true;
      rePinIndex++;
      establish(migrationCount);
    }
  };

  for (let index = 0; index < value.migrations.length; index++) {
    applyRePins(index);
    const migration = value.migrations[index];
    if (
      !migration ||
      !revision ||
      !sameRevisionRef(revision, migration.from) ||
      !validMigration(migration)
    ) {
      throw new OpsxError(
        "PROVENANCE_INVALID",
        "Migration history conflicts with its effective revision or association.",
      );
    }
    const hasPair = migration.associationBefore !== undefined;
    if (
      value.version === 1 &&
      hasPair &&
      (!associationKnown || association === null)
    ) {
      association = copySelectionAssociation(migration.associationBefore!);
      associationKnown = true;
    }
    if (association && !hasPair) {
      throw new OpsxError(
        "PROVENANCE_INVALID",
        "Associated migration requires a reviewed transition.",
      );
    }
    if (hasPair) {
      if (
        !sameAssociationOrNull(association, migration.associationBefore!) ||
        !migration.associationAfter
      ) {
        throw new OpsxError(
          "PROVENANCE_INVALID",
          "Migration association differs from its recorded predecessor.",
        );
      }
      association = copySelectionAssociation(migration.associationAfter);
      associationKnown = true;
    }
    revision = asRef(migration.to);
  }
  applyRePins(value.migrations.length);
  if (
    rePinIndex !== events.length ||
    establishmentIndex !== establishments.length
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "History event has an invalid migration or re-pin position.",
    );
  }
  if (
    value.association &&
    (!revision ||
      !sameRevisionRef(value.association.effectiveRevision, revision))
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Top-level association does not match the effective revision.",
    );
  }
  if (
    associationKnown &&
    (value.version === 2 || value.association !== undefined) &&
    !sameAssociationOrNull(association, value.association ?? null)
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Top-level association conflicts with the effective association.",
    );
  }
  if (value.version === 2 && !associationKnown && value.association) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Version-two association has no establishment evidence.",
    );
  }
  return { revision, association: value.association ?? association };
}

export function effectiveRevision(provenance: Provenance): RevisionRef | null {
  return foldHistory(provenance).revision;
}

export function effectiveAssociation(
  provenance: Provenance,
): ChangeSelectionAssociation | null {
  return foldHistory(provenance).association;
}

export function hasPairedAssociationHistory(
  value: Pick<Provenance, "migrations" | "rePins">,
): boolean {
  return (
    value.migrations.some(
      (entry) =>
        entry.associationBefore !== undefined ||
        entry.associationAfter !== undefined,
    ) ||
    Boolean(
      value.rePins?.some(
        (entry) =>
          entry.associationBefore !== null || entry.associationAfter !== null,
      ),
    )
  );
}

export async function readProvenance(
  directory: string,
): Promise<Provenance | null> {
  let bytes: string;
  try {
    bytes = (await boundedFile(directory, ".opsx-provenance.json")).content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseProvenance(bytes, directory);
}

export function parseProvenance(bytes: string, directory: string): Provenance {
  let data: unknown;
  try {
    data = JSON.parse(bytes);
  } catch {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Invalid provenance at ${directory}.`,
    );
  }
  const value = data as Provenance;
  if (
    !value ||
    (value.version !== 1 && value.version !== 2) ||
    (value.version === 2 && !Array.isArray(value.establishments)) ||
    (value.version === 1 && value.establishments !== undefined) ||
    (value.created !== null && !isRef(value.created)) ||
    !Array.isArray(value.migrations) ||
    value.migrations.some(
      (entry) =>
        !entry ||
        !isRef(entry.from) ||
        !isRef(entry.to) ||
        typeof entry.at !== "string" ||
        !Number.isFinite(Date.parse(entry.at)) ||
        !validMigration(entry),
    ) ||
    (value.retained !== undefined && !isRef(value.retained)) ||
    (value.association !== undefined &&
      !isSelectionAssociation(value.association)) ||
    (value.rePins !== undefined &&
      (!Array.isArray(value.rePins) ||
        value.rePins.some((event) => !isRePinEvent(event)))) ||
    (value.establishments !== undefined &&
      (!Array.isArray(value.establishments) ||
        value.establishments.some((item) => !isEstablishment(item))))
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Malformed provenance at ${directory}.`,
    );
  }
  const decoded: Provenance = {
    ...value,
    ...(value.created ? { created: asRef(value.created) } : {}),
    migrations: value.migrations.map(copyMigration),
    ...(value.retained ? { retained: asRef(value.retained) } : {}),
    ...(value.association
      ? { association: copySelectionAssociation(value.association) }
      : {}),
    ...(value.rePins ? { rePins: value.rePins.map(copyRePinEvent) } : {}),
    ...(value.establishments
      ? { establishments: value.establishments.map(copyEstablishment) }
      : {}),
  };
  const operationIds = decoded.rePins?.map((event) => event.operationId) ?? [];
  if (
    new Set(operationIds).size !== operationIds.length ||
    decoded.rePins?.some(
      (event, index, events) =>
        event.afterMigrationCount > decoded.migrations.length ||
        (index > 0 &&
          event.afterMigrationCount <
            (events[index - 1]?.afterMigrationCount ?? 0)),
    )
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Re-pin operation IDs or migration ordering are invalid.",
    );
  }
  try {
    foldHistory(decoded);
  } catch (error) {
    if (error instanceof OpsxError) throw error;
    throw new OpsxError("PROVENANCE_INVALID", "Malformed provenance history.");
  }
  return decoded;
}

async function replace(
  directory: string,
  expected: Provenance | null,
  next: Provenance,
  beforeCommit?: () => Promise<void>,
): Promise<void> {
  const file = provenancePath(directory);
  const current = await readProvenance(directory);
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new OpsxError(
      "PROVENANCE_STALE",
      `Provenance changed before write: ${file}`,
    );
  foldHistory(next);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    if (
      JSON.stringify(await readProvenance(directory)) !==
      JSON.stringify(expected)
    )
      throw new OpsxError(
        "PROVENANCE_STALE",
        `Provenance changed during write: ${file}`,
      );
    await beforeCommit?.();
    if (expected === null) {
      try {
        await link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new OpsxError(
            "PROVENANCE_STALE",
            `Provenance appeared during creation: ${file}`,
          );
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

async function selectionPinSnapshot(
  root: string,
  name: string,
  directory: string,
): Promise<SelectionPinSnapshot> {
  let content: string;
  try {
    content = (await boundedFile(directory, ".openspec.yaml")).content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new OpsxError(
        "PROVENANCE_PIN_MISSING",
        `Change ${name} has no schema pin metadata.`,
      );
    throw error;
  }
  let metadata: unknown;
  try {
    metadata = YAML.parse(content);
  } catch {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Change ${name} has invalid schema pin metadata.`,
    );
  }
  const pin =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).schema
      : undefined;
  if (
    pin != null &&
    (typeof pin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pin))
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Change ${name} has an invalid schema pin.`,
    );
  }
  const inherited = pin == null;
  const projectDefault = inherited ? await defaultSchema(root) : null;
  const schema = inherited ? projectDefault! : (pin as string);
  return {
    metadata: content,
    schema,
    inherited,
    defaultSchema: projectDefault,
  };
}

function sameSelectionPinSnapshot(
  a: SelectionPinSnapshot,
  b: SelectionPinSnapshot,
): boolean {
  return (
    a.metadata === b.metadata &&
    a.schema === b.schema &&
    a.inherited === b.inherited &&
    a.defaultSchema === b.defaultSchema
  );
}

export async function recordCreation(
  root: string,
  name: string,
  revision: RevisionRef,
  association?: ChangeSelectionAssociation,
): Promise<void> {
  if (!isRef(revision))
    throw new OpsxError("PROVENANCE_INVALID", "Invalid creation revision.");
  const directory = await changeDirectory(root, name);
  if (await readProvenance(directory))
    throw new OpsxError(
      "PROVENANCE_EXISTS",
      "Change " + name + " already has provenance.",
    );
  if (association !== undefined) {
    if (
      !isSelectionAssociation(association) ||
      !sameRevisionRef(revision, association.effectiveRevision)
    ) {
      throw new OpsxError(
        "PROVENANCE_INVALID",
        "Invalid change selection association or schema revision mismatch.",
      );
    }
    let metadata: unknown;
    try {
      metadata = YAML.parse(
        (await boundedFile(directory, ".openspec.yaml")).content,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new OpsxError(
          "PROVENANCE_PIN_MISSING",
          "Change " + name + " has no schema pin metadata.",
        );
      throw error;
    }
    const pin =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).schema
        : undefined;
    const effectiveSchema = pin == null ? await defaultSchema(root) : pin;
    if (
      typeof effectiveSchema !== "string" ||
      effectiveSchema !== association.effectiveRevision.name
    ) {
      throw new OpsxError(
        "PROVENANCE_PIN_MISMATCH",
        "Change " +
          name +
          " does not resolve to the associated schema revision.",
      );
    }
  }
  await replace(directory, null, {
    version: 2,
    created: asRef(revision),
    migrations: [],
    establishments: association
      ? [
          {
            afterMigrationCount: 0,
            afterRePinCount: 0,
            association: copySelectionAssociation(association),
          },
        ]
      : [],
    ...(association
      ? { association: copySelectionAssociation(association) }
      : {}),
  });
}

export async function recordSelectionAssociation(
  root: string,
  name: string,
  revision: RevisionRef,
  association: ChangeSelectionAssociation,
): Promise<void> {
  if (
    !isRef(revision) ||
    !isSelectionAssociation(association) ||
    !sameRevisionRef(revision, association.effectiveRevision)
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      "Invalid change selection association or schema revision mismatch.",
    );
  }
  const directory = await changeDirectory(root, name);
  const pinBefore = await selectionPinSnapshot(root, name, directory);
  if (pinBefore.schema !== revision.name) {
    throw new OpsxError(
      "PROVENANCE_PIN_MISMATCH",
      `Change ${name} does not resolve to the associated schema revision.`,
    );
  }
  const previous = await readProvenance(directory);
  const latest = previous ? effectiveRevision(previous) : null;
  if (latest && !sameRevisionRef(latest, revision)) {
    throw new OpsxError(
      "PROVENANCE_STALE",
      `Recorded revision for ${name} differs from the reviewed pinned revision.`,
    );
  }
  const nextAssociation = copySelectionAssociation(association);
  if (previous?.association) {
    if (!sameSelectionAssociation(previous.association, nextAssociation)) {
      throw new OpsxError(
        "PROVENANCE_ASSOCIATION_MISMATCH",
        `Change ${name} already has a different selection association.`,
      );
    }
    if (previous.version === 2) return;
  }
  if (previous?.version === 1 && hasPairedAssociationHistory(previous)) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Legacy paired association history is readable but cannot be extended.",
    );
  }
  const priorV2: Provenance = previous
    ? {
        ...previous,
        version: 2,
        establishments: [],
        association: undefined,
      }
    : { version: 2, created: null, migrations: [], establishments: [] };
  if (previous?.version === 1) foldHistory(priorV2);
  const next: Provenance = {
    ...priorV2,
    version: 2,
    created: previous?.created ?? null,
    migrations: [...(previous?.migrations ?? [])],
    establishments: [
      ...(previous?.establishments ?? []),
      {
        afterMigrationCount: previous?.migrations.length ?? 0,
        afterRePinCount: previous?.rePins?.length ?? 0,
        association: nextAssociation,
      },
    ],
    ...(previous?.retained
      ? { retained: previous.retained }
      : !latest
        ? { retained: asRef(revision) }
        : {}),
    ...(previous?.rePins ? { rePins: previous.rePins } : {}),
    association: nextAssociation,
  };
  await replace(directory, previous, next, async () => {
    const pinAfter = await selectionPinSnapshot(root, name, directory);
    if (!sameSelectionPinSnapshot(pinBefore, pinAfter)) {
      throw new OpsxError(
        "PROVENANCE_STALE",
        `Schema pin changed while selection association was being recorded for ${name}.`,
      );
    }
  });
}

export async function retainLegacy(
  root: string,
  name: string,
  revision: RevisionRef,
): Promise<void> {
  if (!isRef(revision))
    throw new OpsxError("PROVENANCE_INVALID", "Invalid retained revision.");
  const directory = await changeDirectory(root, name);
  const previous = await readProvenance(directory);
  if (previous?.retained && !sameRevisionRef(previous.retained, revision)) {
    throw new OpsxError(
      "PROVENANCE_STALE",
      `Change ${name} already retained another revision.`,
    );
  }
  if (previous?.retained) return;
  if (
    previous?.version === 1 &&
    (previous.association || hasPairedAssociationHistory(previous))
  ) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Legacy associated history requires explicit selection review before extension.",
    );
  }
  const base = previous ? historyBase(previous) : null;
  if (base && !sameRevisionRef(base, revision)) {
    throw new OpsxError(
      "PROVENANCE_STALE",
      `Retained revision would change the history base for ${name}.`,
    );
  }
  await replace(directory, previous, {
    ...previous,
    version: previous?.version ?? 2,
    created: previous?.created ?? null,
    migrations: previous?.migrations ?? [],
    retained: asRef(revision),
    ...(previous?.version === 2
      ? { establishments: previous.establishments ?? [] }
      : previous?.version === undefined
        ? { establishments: [] }
        : {}),
    ...(previous?.rePins ? { rePins: previous.rePins } : {}),
    ...(previous?.association ? { association: previous.association } : {}),
  });
}

export async function recordMigration(
  root: string,
  name: string,
  from: RevisionRef,
  to: RevisionRef,
  reviewedAssociation?: ChangeSelectionAssociation,
): Promise<void> {
  if (!isRef(from) || !isRef(to))
    throw new OpsxError("PROVENANCE_INVALID", "Invalid migration revision.");
  const directory = await changeDirectory(root, name);
  const previous = await readProvenance(directory);
  const priorAssociation = previous ? foldHistory(previous).association : null;
  if (
    previous?.version === 1 &&
    (priorAssociation || hasPairedAssociationHistory(previous))
  ) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Legacy associated history requires explicit selection review before extension.",
    );
  }
  if (
    priorAssociation &&
    (!reviewedAssociation ||
      !isSelectionAssociation(reviewedAssociation) ||
      !sameRevisionRef(reviewedAssociation.effectiveRevision, to))
  ) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Migration of an associated change requires a reviewed target selection.",
    );
  }
  if (!priorAssociation && reviewedAssociation !== undefined) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_MISMATCH",
      "A migration cannot invent an association.",
    );
  }
  const prior = previous ? effectiveRevision(previous) : null;
  if (prior && !sameRevisionRef(prior, from))
    throw new OpsxError(
      "PROVENANCE_STALE",
      "Migration source diverges for " + name + ".",
    );
  const upgraded: Provenance =
    previous?.version === 1
      ? {
          ...previous,
          version: 2,
          establishments: [],
          association: undefined,
        }
      : (previous ?? {
          version: 2,
          created: null,
          migrations: [],
          establishments: [],
        });
  if (previous?.version === 1) foldHistory(upgraded);
  await replace(directory, previous, {
    ...upgraded,
    version: 2,
    created: previous?.created ?? null,
    migrations: [
      ...(previous?.migrations ?? []),
      {
        from: asRef(from),
        to: asRef(to),
        at: new Date().toISOString(),
        ...(priorAssociation && reviewedAssociation
          ? {
              associationBefore: copySelectionAssociation(priorAssociation),
              associationAfter: copySelectionAssociation(reviewedAssociation),
            }
          : {}),
      },
    ],
    establishments: upgraded.establishments ?? [],
    ...(previous?.rePins ? { rePins: previous.rePins } : {}),
    ...(previous?.retained ? { retained: previous.retained } : {}),
    ...(priorAssociation && reviewedAssociation
      ? { association: copySelectionAssociation(reviewedAssociation) }
      : {}),
  });
}

export async function changeHistory(
  root: string,
  name: string,
  archived = false,
): Promise<ChangeHistory> {
  return (await readChangeHistory(root, name, archived)).history;
}

export async function readChangeHistory(
  root: string,
  name: string,
  archived = false,
): Promise<{ history: ChangeHistory; effectiveRevision: RevisionRef | null }> {
  const directory = await changeDirectory(root, name, archived);
  const record = await readProvenance(directory);
  let metadata: unknown;
  try {
    metadata = YAML.parse(
      (await boundedFile(directory, ".openspec.yaml")).content,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pin =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).schema
      : undefined;
  if (
    pin != null &&
    (typeof pin !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pin))
  ) {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Invalid schema pin for ${name}.`,
    );
  }
  const inherited = pin == null;
  const currentSchema =
    (pin as string | undefined) ??
    (archived ? "Unknown" : await defaultSchema(root));
  const latest = record ? effectiveRevision(record) : null;
  const divergence =
    latest && currentSchema !== "Unknown" && latest.name !== currentSchema
      ? `Recorded revision ${latest.name} differs from live schema ${currentSchema}.`
      : null;
  return {
    history: {
      name,
      created: record?.created ?? "Unknown",
      currentSchema,
      inherited,
      migrations: record?.migrations ?? [],
      ...(record?.rePins ? { rePins: record.rePins } : {}),
      ...(record?.establishments
        ? { establishments: record.establishments }
        : {}),
      ...(record?.retained ? { retained: record.retained } : {}),
      divergence,
    },
    effectiveRevision: latest,
  };
}
