import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { OpsxError } from "../domain/project.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import { withProjectMutationLock } from "../project-lock.ts";
import type { Provenance } from "../provenance/index.ts";
import {
  effectiveAssociation,
  effectiveRevision,
  hasPairedAssociationHistory,
  parseProvenance,
  readProvenance,
  revisionRef,
} from "../provenance/index.ts";
import type {
  ResourceRuntimeOptions,
  SkillBundle,
  SkillInstallHostId,
} from "../resources/index.ts";
import {
  inspectSelectedSkillOwnership,
  loadAgentProfileDigest,
  loadSkillBundles,
  previewSkillInstall,
} from "../resources/index.ts";
import {
  checkRevision,
  inspectRetainedRevision,
  resolveRevision,
} from "../revisions/index.ts";
import { assertNoIncompleteSwitchRecovery } from "../switch/recovery.ts";
import { validateChangeAgainst } from "../validation/index.ts";
import type { ActionResult, ActionTarget, LifecycleAction } from "./shared.ts";
import {
  activeDirectory,
  confirmation,
  digest,
  fail,
  fingerprintTree,
  metadataFor,
  projectRoot,
  readToken,
  safeIdentifier,
  stable,
  success,
} from "./shared.ts";

const action: LifecycleAction = "change.re-pin";
const unknownOriginWarning =
  "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.";
const RE_PIN_JOURNAL = "openspec/.opsx/re-pin-journal.json";
const MAX_RE_PIN_BYTES = 4 * 1024 * 1024;

interface GuardedFile {
  exists: boolean;
  bytes: string | null;
  digest: string | null;
  dev: string | null;
  ino: string | null;
  mode: number | null;
  size: number;
  mtimeNs: string | null;
  ctimeNs: string | null;
}

interface RePinStageIdentity {
  dev: string;
  ino: string;
  mode: number;
  digest: string;
}

async function guardedFile(file: string): Promise<GuardedFile> {
  let before;
  try {
    before = await lstat(file, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return {
        exists: false,
        bytes: null,
        digest: null,
        dev: null,
        ino: null,
        mode: null,
        size: 0,
        mtimeNs: null,
        ctimeNs: null,
      };
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink())
    throw new OpsxError(
      "REPIN_UNSAFE_FILE",
      `Expected a regular file: ${file}`,
    );
  if (before.size > BigInt(MAX_RE_PIN_BYTES))
    throw new OpsxError(
      "REPIN_FILE_TOO_LARGE",
      `File exceeds the re-pin limit: ${file}`,
    );
  const handle = await open(
    file,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  let bytes: Buffer;
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      throw new OpsxError(
        "REPIN_STALE",
        `File identity changed while opening: ${file}`,
      );
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  const after = await lstat(file, { bigint: true });
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mode !== after.mode ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  )
    throw new OpsxError(
      "REPIN_STALE",
      `File changed while being read: ${file}`,
    );
  return {
    exists: true,
    bytes: bytes.toString("base64"),
    digest: digest(bytes),
    dev: before.dev.toString(),
    ino: before.ino.toString(),
    mode: Number(before.mode & 0o777n),
    size: bytes.length,
    mtimeNs: before.mtimeNs.toString(),
    ctimeNs: before.ctimeNs.toString(),
  };
}

function sameGuardedFile(left: GuardedFile, right: GuardedFile): boolean {
  return stable(left) === stable(right);
}

async function directoryRoutes(
  root: string,
  targets: string[],
): Promise<Record<string, { dev: string; ino: string; mode: number }>> {
  const routes: Record<string, { dev: string; ino: string; mode: number }> = {};
  const canonicalRoot = await path.resolve(root);
  for (const target of targets) {
    const absolute = path.resolve(target);
    const relative = path.relative(canonicalRoot, absolute);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new OpsxError(
        "REPIN_UNSAFE_PATH",
        `Guarded path escapes project: ${target}`,
      );
    let current = canonicalRoot;
    const parts = relative.split(path.sep).filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]!);
      const info = await lstat(current, { bigint: true });
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new OpsxError(
          "REPIN_UNSAFE_PATH",
          `Guarded route is not a real directory: ${current}`,
        );
      routes[current] = {
        dev: info.dev.toString(),
        ino: info.ino.toString(),
        mode: Number(info.mode & 0o777n),
      };
    }
  }
  const rootInfo = await lstat(canonicalRoot, { bigint: true });
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new OpsxError(
      "REPIN_UNSAFE_PATH",
      `Project root is not a real directory: ${root}`,
    );
  routes[canonicalRoot] = {
    dev: rootInfo.dev.toString(),
    ino: rootInfo.ino.toString(),
    mode: Number(rootInfo.mode & 0o777n),
  };
  return routes;
}

async function reviewGuard(input: {
  root: string;
  directory: string;
  schemaRoot: string;
  from: import("../revisions/index.ts").RevisionRef;
  to: import("../revisions/index.ts").RevisionRef;
  retainedFiles: string[];
  validation: import("../validation/index.ts").ValidationResult;
  resources: unknown;
}): Promise<Record<string, unknown>> {
  const {
    root,
    directory,
    schemaRoot,
    from,
    to,
    retainedFiles,
    validation,
    resources,
  } = input;
  const provenancePath = path.join(directory, ".opsx-provenance.json");
  const pinPath = path.join(directory, ".openspec.yaml");
  const configPath = path.join(root, "openspec", "config.yaml");
  const retentionRoot = path.join(
    root,
    "openspec/.opsx/revisions",
    from.name,
    from.digest,
  );
  const artifactTree = await fingerprintTree(directory, undefined, true);
  const schemaTree = await fingerprintTree(schemaRoot);
  const [provenance, pin, config, routes] = await Promise.all([
    guardedFile(provenancePath),
    guardedFile(pinPath),
    guardedFile(configPath),
    directoryRoutes(root, [directory, schemaRoot, retentionRoot]),
  ]);
  return {
    routes,
    provenance,
    pin,
    config,
    artifactTree,
    schemaTree,
    retention: { digest: from.digest, files: retainedFiles },
    target: to,
    validation,
    resources,
  };
}
export interface RePinSelection {
  profiles: string[];
  noProfiles: boolean;
  skillHosts: SkillInstallHostId[];
  bundle?: SkillBundle;
}
export interface RePinApplyRequest {
  rootInput: string;
  changeInput: string;
  schemaInput: string;
  applyToken?: string;
  confirmationText?: string;
  selection: RePinSelection;
  resourceOptions?: ResourceRuntimeOptions;
}
export interface RePinPreview {
  ready: boolean;
  change: string;
  from: import("../revisions/index.ts").RevisionRef;
  to: import("../revisions/index.ts").RevisionRef;
  noOp: boolean;
  validation: import("../validation/index.ts").ValidationResult;
  historicalOrigin?: {
    status: "unknown";
    oldLocation: string;
    currentLocation: string;
    warning: string;
  };
  targetAssociation?: import("../provenance/index.ts").ChangeSelectionAssociation;
  association?: import("../provenance/index.ts").ChangeSelectionAssociation;
  resources?: unknown;
}
interface PreviewRePinRequest {
  rootInput: string;
  changeInput: string;
  schemaInput: string;
  selection: RePinSelection;
  resourceOptions?: ResourceRuntimeOptions;
  ignoreJournalForRecheck?: boolean;
}
interface InternalRePinPreview extends RePinPreview {
  confirmationText: string;
  guardDigest: string;
  inputDigest: string;
  guardRoutes: Record<string, { dev: string; ino: string; mode: number }>;
  pinDigest: string;
  configDigest: string;
}

function publicPreview(data: InternalRePinPreview): RePinPreview {
  const {
    confirmationText: _confirmationText,
    guardDigest: _guardDigest,
    inputDigest: _inputDigest,
    guardRoutes: _guardRoutes,
    pinDigest: _pinDigest,
    configDigest: _configDigest,
    ...visible
  } = data;
  return visible;
}

export async function previewChangeRePin(
  rootInput: string,
  changeInput: string,
  schemaInput: string,
  selection: RePinSelection,
  resourceOptions: ResourceRuntimeOptions = {},
): Promise<ActionResult<RePinPreview>> {
  const result = await previewChangeRePinInternal({
    rootInput,
    changeInput,
    schemaInput,
    selection,
    resourceOptions,
  });
  if (!result.ok) return result;
  return success(
    action,
    result.phase,
    result.target,
    publicPreview(result.data),
    result.confirmation,
  );
}

async function previewChangeRePinInternal(
  request: PreviewRePinRequest,
): Promise<ActionResult<InternalRePinPreview>> {
  const {
    rootInput,
    changeInput,
    schemaInput,
    selection,
    resourceOptions = {},
    ignoreJournalForRecheck = false,
  } = request;
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput),
      change = safeIdentifier(changeInput, "change name"),
      schemaName = safeIdentifier(schemaInput, "schema name");
    target = { root, change, schema: schemaName };
    if (selection.noProfiles && selection.profiles.length)
      throw new OpsxError(
        "USAGE",
        "--profile and --no-profiles cannot be combined.",
      );
    if (
      new Set(selection.profiles).size !== selection.profiles.length ||
      new Set(selection.skillHosts).size !== selection.skillHosts.length
    )
      throw new OpsxError(
        "USAGE",
        "Duplicate profile or skill-host selections are not allowed.",
      );
    const directory = await activeDirectory(root, change),
      metadata = await metadataFor(directory);
    await assertNoIncompleteSwitchRecovery(root, [root]);
    const reviewedJournal = ignoreJournalForRecheck
      ? null
      : await existingJournal(root);
    if (
      reviewedJournal?.journal &&
      reviewedJournal.journal.state !== "complete"
    )
      throw new OpsxError(
        "REPIN_RECOVERY_REQUIRED",
        "An unresolved re-pin journal requires explicit recovery inspection.",
      );
    if (!metadata.exists || metadata.value.schema !== schemaName)
      throw new OpsxError(
        "REPIN_EXPLICIT_PIN_REQUIRED",
        "Change must have an explicit existing schema pin exactly matching the requested name.",
      );
    const provenance = await readProvenance(directory),
      from = provenance && effectiveRevision(provenance);
    if (provenance?.version === 1 && hasPairedAssociationHistory(provenance))
      throw new OpsxError(
        "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
        "Ambiguous paired version-one association history cannot be extended.",
      );
    if (!from || from.name !== schemaName)
      throw new OpsxError(
        "PROVENANCE_UNKNOWN",
        "Known effective same-name provenance is required; ambiguous history is not repairable here.",
      );
    const client = new OpenSpecClient(root),
      to = await resolveRevision(client, schemaName);
    if (!to.origin)
      throw new OpsxError(
        "REPIN_TARGET_UNWITNESSED",
        "Re-pin requires a witnessed Git-tracked project-local schema target.",
      );
    if (to.shadows.length)
      throw new OpsxError(
        "SCHEMA_AMBIGUOUS",
        "Target schema has a genuine same-name shadow.",
      );
    if (from.digest !== to.digest)
      throw new OpsxError(
        "REVISION_DRIFT",
        "Target schema digest differs from the effective pin.",
      );
    if (stable(from.bundleSource ?? null) !== stable(to.bundleSource ?? null))
      throw new OpsxError(
        "BUNDLE_MISMATCH",
        "Target bundle identity differs from the recorded revision.",
      );
    const retained = await inspectRetainedRevision(root, from),
      check = await checkRevision(root, from, client, {
        reviewedHistoricalOrigin: true,
      });
    if (!check.retained)
      throw new OpsxError("REVISION_DRIFT", "Retained revision is not intact.");
    if (check.state !== "intact" && !check.historicalOriginMismatchOnly)
      throw new OpsxError(
        "REVISION_" + check.state.toUpperCase(),
        "Pinned revision has an unresolved " + check.state + " finding.",
      );
    if (check.revision?.shadows.length)
      throw new OpsxError(
        "SCHEMA_AMBIGUOUS",
        "Resolved target has a genuine same-name shadow.",
      );
    const association = effectiveAssociation(provenance);
    let resources: unknown = null;
    if (association) {
      const profiles = selection.noProfiles ? [] : selection.profiles;
      if (!selection.bundle || (!selection.noProfiles && !profiles.length))
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
          "Associated changes require --bundle and an explicit profile selection or --no-profiles.",
        );
      if (
        association.skillBundle !== selection.bundle ||
        association.profiles.slice().sort().join("|") !==
          profiles.slice().sort().join("|") ||
        association.skillHosts.slice().sort().join("|") !==
          selection.skillHosts.slice().sort().join("|")
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "Selection must exactly match the existing compatible association.",
        );
      const catalog = await loadSkillBundles(to.source);
      const emptySelection =
        profiles.length === 0 && selection.skillHosts.length === 0;
      if (
        (catalog.declarations[selection.bundle]?.length ?? 0) > 0 &&
        emptySelection
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "A skill-bearing association requires selected installed targets.",
        );
      const plan = emptySelection
        ? null
        : await previewSkillInstall(
            {
              projectRoot: root,
              schemaRoot: to.source,
              schemaName,
              profiles,
              skillHosts: selection.skillHosts,
              skillBundle: selection.bundle,
            },
            resourceOptions,
          );
      if (
        plan &&
        (plan.diagnostics.length ||
          plan.targets.some((x) => x.action !== "noop") ||
          plan.skillHosts.some(
            (host) =>
              selection.skillHosts.includes(host.host) &&
              (host.action === "refuse" ||
                host.targets.some((item) => item.action !== "noop")),
          ) ||
          !(await inspectSelectedSkillOwnership(plan)))
      )
        throw new OpsxError(
          "RESOURCE_OWNERSHIP_INVALID",
          "Selected targets are not intact and owned.",
        );
      const manifestDigests = plan?.manifestDigests ?? {
        agentProfiles: await loadAgentProfileDigest(),
        schemaSkills: catalog.manifestDigests.skills,
        skillBundles: catalog.manifestDigests.profiles,
      };
      if (
        stable(association.manifestDigests) !== stable(manifestDigests) ||
        !catalog.bundles.includes(selection.bundle)
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "Selection must exactly match the existing compatible association and manifests.",
        );
      resources = plan
        ? {
            targets: plan.targets,
            skillHosts: plan.skillHosts,
            manifestDigests,
          }
        : { targets: [], skillHosts: [], manifestDigests };
    } else if (
      selection.bundle ||
      selection.profiles.length ||
      selection.skillHosts.length ||
      selection.noProfiles
    )
      throw new OpsxError(
        "USAGE",
        "Selection flags are only valid for associated changes.",
      );
    const validation = await validateChangeAgainst(root, change, schemaName, {
      targetSchemaRoot: to.source,
      reviewedHistoricalOrigin: { recorded: from, target: to },
    });
    if (!validation.ok || validation.strictWorkflowValidated !== true)
      throw new OpsxError(
        "VALIDATION_FAILED",
        "Strict workflow validation failed: " +
          validation.findings
            .filter((item) => item.severity === "error")
            .map((item) => item.code + ": " + item.message)
            .join("; "),
      );
    const historicalOrigin = check.historicalOriginUnverified
      ? {
          status: "unknown" as const,
          oldLocation: from.source,
          currentLocation: to.source,
          warning: unknownOriginWarning,
        }
      : undefined;
    const targetAssociation = association
      ? { ...association, effectiveRevision: revisionRef(to) }
      : undefined;
    const confirmationText = historicalOrigin
      ? `${historicalOrigin.warning}\nOld location: ${historicalOrigin.oldLocation}\nVerified current location: ${historicalOrigin.currentLocation}`
      : `Apply same-name re-pin ${change} to ${schemaName} at ${to.source}`;
    const guard = await reviewGuard({
      root,
      directory,
      schemaRoot: to.source,
      from,
      to: revisionRef(to),
      retainedFiles: retained.files,
      validation,
      resources,
    });
    const guardDigest = digest(stable(guard));
    const inputDigest = digest(
      stable(
        Object.fromEntries(
          Object.entries(guard).filter(
            ([key]) => key !== "provenance" && key !== "validation",
          ),
        ),
      ),
    );
    const [pinSnapshot, configSnapshot] = await Promise.all([
      guardedFile(path.join(directory, ".openspec.yaml")),
      guardedFile(path.join(root, "openspec/config.yaml")),
    ]);
    const priorJournal = reviewedJournal?.snapshot ?? null;
    if (
      priorJournal &&
      !sameGuardedFile(
        priorJournal,
        await guardedFile(path.join(root, RE_PIN_JOURNAL)),
      )
    )
      throw new OpsxError(
        "STALE_PREVIEW",
        "Re-pin journal changed during preview; inspect recovery and request a fresh preview.",
      );
    const noOp = check.state === "intact",
      data = {
        ready: true,
        change,
        from,
        to: revisionRef(to),
        noOp,
        validation,
        ...(association ? { association } : {}),
        ...(targetAssociation ? { targetAssociation } : {}),
        ...(historicalOrigin ? { historicalOrigin } : {}),
        retainedFiles: retained.files.length,
        resources,
        confirmationText,
        guardDigest,
        inputDigest,
        guardRoutes: guard.routes as Record<
          string,
          { dev: string; ino: string; mode: number }
        >,
        pinDigest: pinSnapshot.digest ?? "",
        configDigest: configSnapshot.digest ?? "",
      };
    return success(
      action,
      "preview",
      target,
      data,
      !noOp
        ? confirmation(
            action,
            target,
            digest(
              stable({
                provenance,
                pin: metadata.bytes?.toString("base64"),
                to,
                validation,
                resources,
                historicalOrigin: historicalOrigin ?? null,
                guard,
                priorJournal,
              }),
            ),
            confirmationText,
          )
        : undefined,
    );
  } catch (error) {
    return fail(action, error, target);
  }
}

interface RePinJournal {
  version: 2;
  state: "prepared" | "partial" | "complete";
  operationId: string;
  root: string;
  change: string;
  schema: string;
  target: string;
  reviewedFreshness: string;
  reviewedGuard: string;
  reviewedInputs: string;
  reviewedRoutes: Record<string, { dev: string; ino: string; mode: number }>;
  selection: RePinSelection;
  validation: RePinPreview["validation"];
  resources: unknown;
  pinDigest: string;
  configDigest: string;
  retentionDigest: string;
  priorJournalDigest: string | null;
  historicalOrigin: RePinPreview["historicalOrigin"] | null;
  from: RePinPreview["from"];
  to: RePinPreview["to"];
  associationBefore: RePinPreview["association"] | null;
  associationAfter: RePinPreview["targetAssociation"] | null;
  expected: GuardedFile;
  expectedDigest: string;
  receiptStageIdentity?: RePinStageIdentity;
  intended: string;
  intendedDigest: string;
  error?: string;
}

interface LegacyRePinJournal {
  version: 1;
  state: "prepared" | "partial" | "complete";
  operationId: string;
}

export interface RePinRecoveryPreview {
  ready: boolean;
  change: string;
  from: RePinPreview["from"] | null;
  to: RePinPreview["to"] | null;
  historicalOrigin?: RePinPreview["historicalOrigin"];
  recovery: {
    disposition: "absent" | "present" | "conflicted" | "complete";
    operationId: string;
    journalState: "prepared" | "partial" | "complete";
    target: string;
    expectedDigest: string;
    intendedDigest: string;
    detail: string;
  };
}

export interface RePinRecoveryApplyRequest {
  rootInput: string;
  changeInput: string;
  schemaInput: string;
  recoveryToken?: string;
  confirmationText?: string;
  resourceOptions?: ResourceRuntimeOptions;
}

interface InternalRePinRecoveryPreview extends RePinRecoveryPreview {
  receipt: GuardedFile;
  receiptStage: GuardedFile | null;
  journal: RePinJournal;
  journalSnapshot: GuardedFile;
  selection: RePinSelection;
  confirmationText: string;
  inputDigest: string;
  stageFingerprint: string;
}

function recoveryTarget(
  root: string,
  change: string,
  schema: string,
): ActionTarget {
  return { root, change, schema };
}

function recoveryConfirmationText(
  journal: RePinJournal,
  disposition: "absent" | "present",
): string {
  const warning = journal.historicalOrigin?.warning;
  const locations = journal.historicalOrigin
    ? `\nOld location: ${journal.historicalOrigin.oldLocation}\nVerified current location: ${journal.historicalOrigin.currentLocation}`
    : "";
  const disclosure = warning ? `${warning}${locations}\n` : "";
  return `${disclosure}Recover exact re-pin operation ${journal.operationId} for ${journal.change} to ${journal.schema}. Intent is ${disposition} at ${journal.target}; the recorded event and target will be preserved exactly.`;
}

async function recoveryStageDisposition(
  root: string,
  journal: RePinJournal,
): Promise<{
  disposition: "owned" | "conflicted";
  receiptStage: GuardedFile | null;
  fingerprint: string;
}> {
  const directory = path.join(root, "openspec/.opsx");
  const names = await readdir(directory);
  const receiptStage = `..opsx-provenance.json.${journal.operationId}.tmp`;
  const journalStage = `.re-pin-journal.json.${journal.operationId}.tmp`;
  const observed: Array<[string, GuardedFile | null]> = [];
  let ownedReceiptStage: GuardedFile | null = null;
  const journalStageCandidates: RePinStageIdentity[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".tmp")).sort()) {
    const file = path.join(directory, name);
    const snapshot = await guardedFile(file).catch(() => null);
    observed.push([name, snapshot]);
    if (!snapshot?.exists || snapshot.mode === null)
      return {
        disposition: "conflicted",
        receiptStage: null,
        fingerprint: digest(stable(observed)),
      };
    if (name === receiptStage) {
      if (
        snapshot.bytes !== journal.intended ||
        snapshot.digest !== journal.intendedDigest ||
        snapshot.mode !== journal.expected.mode ||
        journal.receiptStageIdentity === undefined ||
        snapshot.dev !== journal.receiptStageIdentity.dev ||
        snapshot.ino !== journal.receiptStageIdentity.ino ||
        snapshot.mode !== journal.receiptStageIdentity.mode ||
        snapshot.digest !== journal.receiptStageIdentity.digest
      )
        return {
          disposition: "conflicted",
          receiptStage: null,
          fingerprint: digest(stable(observed)),
        };
      ownedReceiptStage = snapshot;
      continue;
    }
    if (
      name === journalStage ||
      (name.startsWith(`.re-pin-journal.json.${journal.operationId}-`) &&
        name.endsWith(".tmp"))
    ) {
      let staged: unknown;
      try {
        staged = JSON.parse(
          Buffer.from(snapshot.bytes!, "base64").toString("utf8"),
        );
      } catch {
        return {
          disposition: "conflicted",
          receiptStage: null,
          fingerprint: digest(stable(observed)),
        };
      }
      const candidate = staged as RePinJournal;
      const {
        state: _candidateState,
        receiptStageIdentity: _candidateStageIdentity,
        ...candidateIntent
      } = candidate;
      const {
        state: _journalState,
        receiptStageIdentity: _journalStageIdentity,
        ...journalIntent
      } = journal;
      const stageChangesIntent =
        candidate.state !== journal.state ||
        stable(candidate.receiptStageIdentity ?? null) !==
          stable(journal.receiptStageIdentity ?? null);
      if (
        snapshot.mode !== 0o600 ||
        candidate.receiptStageIdentity === undefined ||
        !validJournalIntent(candidate, root) ||
        candidate.operationId !== journal.operationId ||
        stable(candidateIntent) !== stable(journalIntent) ||
        (!stageChangesIntent && journal.state !== "complete")
      )
        return {
          disposition: "conflicted",
          receiptStage: null,
          fingerprint: digest(stable(observed)),
        };
      // The stage's receipt identity describes a different inode. It can
      // validate intent, but cannot authorize removal of this journal file.
      journalStageCandidates.push(candidate.receiptStageIdentity);
      continue;
    }
    return {
      disposition: "conflicted",
      receiptStage: null,
      fingerprint: digest(stable(observed)),
    };
  }
  const intendedReceipt = await guardedFile(
    path.join(root, journal.target),
  ).catch(() => null);
  for (const identity of journalStageCandidates) {
    const ownedByReceiptStage =
      ownedReceiptStage !== null &&
      ownedReceiptStage.dev === identity.dev &&
      ownedReceiptStage.ino === identity.ino &&
      ownedReceiptStage.mode === identity.mode &&
      ownedReceiptStage.digest === identity.digest;
    const ownedByReceipt =
      intendedReceipt?.exists === true &&
      intendedReceipt.dev === identity.dev &&
      intendedReceipt.ino === identity.ino &&
      intendedReceipt.mode === identity.mode &&
      intendedReceipt.digest === identity.digest;
    if (!ownedByReceiptStage && !ownedByReceipt)
      return {
        disposition: "conflicted",
        receiptStage: null,
        fingerprint: digest(stable(observed)),
      };
  }
  return {
    disposition: "owned",
    receiptStage: ownedReceiptStage,
    fingerprint: digest(stable(observed)),
  };
}

async function recoveryStageFingerprint(
  root: string,
  ignoredNames: readonly string[] = [],
): Promise<string> {
  const directory = path.join(root, "openspec/.opsx");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".tmp") && !ignoredNames.includes(name))
    .sort();
  const observed: Array<[string, GuardedFile | null]> = [];
  for (const name of names)
    observed.push([
      name,
      await guardedFile(path.join(directory, name)).catch(() => null),
    ]);
  return digest(stable(observed));
}

async function previewChangeRePinRecoveryInternal(input: {
  rootInput: string;
  changeInput: string;
  schemaInput: string;
  resourceOptions?: ResourceRuntimeOptions;
}): Promise<ActionResult<InternalRePinRecoveryPreview>> {
  const { rootInput, changeInput, schemaInput, resourceOptions = {} } = input;
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const schema = safeIdentifier(schemaInput, "schema name");
    target = recoveryTarget(root, change, schema);
    await assertNoIncompleteSwitchRecovery(root, [root]);
    const { snapshot: journalSnapshot, journal: decoded } =
      await existingJournal(root);
    if (!decoded)
      throw new OpsxError(
        "REPIN_RECOVERY_NOT_FOUND",
        "No re-pin journal exists for recovery inspection.",
      );
    if (decoded.version === 1) {
      if (decoded.state !== "complete")
        throw new OpsxError(
          "REPIN_RECOVERY_LEGACY_UNSUPPORTED",
          "Pending version-one re-pin journals are readable but cannot be recovered safely.",
        );
      throw new OpsxError(
        "REPIN_RECOVERY_LEGACY_COMPLETE",
        "The completed version-one journal remains readable historical evidence; it has no pending version-two intent to recover.",
      );
    }
    const journal = decoded;
    if (
      journal.root !== root ||
      journal.change !== change ||
      journal.schema !== schema
    )
      throw new OpsxError(
        "REPIN_JOURNAL_TARGET_MISMATCH",
        "The pending re-pin journal belongs to a different project, change, or schema.",
      );
    const provenanceFile = path.join(
      root,
      "openspec/changes",
      change,
      ".opsx-provenance.json",
    );
    if (
      journal.target !==
      path.relative(root, provenanceFile).split(path.sep).join("/")
    )
      throw new OpsxError(
        "REPIN_JOURNAL_TARGET_MISMATCH",
        "The journal target does not match the exact change provenance receipt.",
      );
    const [receipt, stages] = await Promise.all([
      guardedFile(provenanceFile),
      recoveryStageDisposition(root, journal),
    ]);
    let disposition: RePinRecoveryPreview["recovery"]["disposition"] =
      "conflicted";
    if (
      sameGuardedFile(journal.expected, receipt) &&
      receipt.digest === journal.expectedDigest &&
      receipt.mode === journal.expected.mode
    )
      disposition = "absent";
    else if (
      receipt.exists &&
      receipt.bytes === journal.intended &&
      receipt.digest === journal.intendedDigest &&
      receipt.mode === journal.expected.mode &&
      (journal.receiptStageIdentity === undefined
        ? journal.state === "complete"
        : receipt.dev === journal.receiptStageIdentity.dev &&
          receipt.ino === journal.receiptStageIdentity.ino &&
          receipt.mode === journal.receiptStageIdentity.mode &&
          receipt.digest === journal.receiptStageIdentity.digest)
    )
      disposition = journal.state === "complete" ? "complete" : "present";
    if (stages.disposition === "conflicted") disposition = "conflicted";

    const selection: RePinSelection = {
      profiles: [...journal.selection.profiles],
      noProfiles: journal.selection.noProfiles,
      skillHosts: [...journal.selection.skillHosts],
      ...(journal.selection.bundle ? { bundle: journal.selection.bundle } : {}),
    };
    const live = await previewChangeRePinInternal({
      rootInput: root,
      changeInput: change,
      schemaInput: schema,
      selection,
      resourceOptions,
      ignoreJournalForRecheck: true,
    });
    if (!live.ok)
      throw new OpsxError(
        "REPIN_RECOVERY_INPUTS_STALE",
        `Current re-pin inputs no longer satisfy the reviewed intent: ${live.error.message}`,
      );
    const liveData = live.data;
    if (
      !liveData.ready ||
      liveData.inputDigest !== journal.reviewedInputs ||
      stable(liveData.to) !== stable(journal.to) ||
      stable(liveData.association ?? null) !==
        stable(
          disposition === "absent"
            ? journal.associationBefore
            : journal.associationAfter,
        ) ||
      stable(liveData.guardRoutes) !== stable(journal.reviewedRoutes) ||
      (disposition === "absent" &&
        (liveData.noOp ||
          stable(liveData.from) !== stable(journal.from) ||
          liveData.guardDigest !== journal.reviewedGuard)) ||
      ((disposition === "present" || disposition === "complete") &&
        (!liveData.noOp ||
          stable(liveData.from) !== stable(journal.to) ||
          stable(liveData.to) !== stable(journal.to)))
    )
      throw new OpsxError(
        "REPIN_RECOVERY_INPUTS_STALE",
        "Current project, schema, selection, resources, validation, or route differs from the original reviewed re-pin intent.",
      );
    if (journal.historicalOrigin) {
      if (
        journal.historicalOrigin.warning !== unknownOriginWarning ||
        journal.historicalOrigin.oldLocation !== journal.from.source ||
        journal.historicalOrigin.currentLocation !== journal.to.source
      )
        throw new OpsxError(
          "REPIN_JOURNAL_INVALID",
          "The journal's historical-origin warning does not match its exact intent.",
        );
      const oldOrigin = await checkRevision(
        root,
        journal.from,
        new OpenSpecClient(root),
        { reviewedHistoricalOrigin: true },
      );
      if (!oldOrigin.historicalOriginUnverified)
        throw new OpsxError(
          "REPIN_RECOVERY_INPUTS_STALE",
          "The old-location eligibility no longer matches the reviewed missing-source warning.",
        );
    }
    const directory = await activeDirectory(root, change);
    const currentProvenance = await readProvenance(directory);
    if (disposition === "absent") {
      if (
        !currentProvenance ||
        stable(effectiveRevision(currentProvenance)) !== stable(journal.from)
      )
        disposition = "conflicted";
    } else if (disposition === "present" || disposition === "complete") {
      const events = currentProvenance?.rePins ?? [];
      if (
        !currentProvenance ||
        stable(effectiveRevision(currentProvenance)) !== stable(journal.to) ||
        events.filter((event) => event.operationId === journal.operationId)
          .length !== 1
      )
        disposition = "conflicted";
    }
    const data: RePinRecoveryPreview = {
      ready: disposition === "absent" || disposition === "present",
      change,
      from: journal.from,
      to: journal.to,
      ...(journal.historicalOrigin
        ? { historicalOrigin: journal.historicalOrigin }
        : {}),
      recovery: {
        disposition,
        operationId: journal.operationId,
        journalState: journal.state,
        target: journal.target,
        expectedDigest: journal.expectedDigest,
        intendedDigest: journal.intendedDigest,
        detail:
          disposition === "absent"
            ? "The exact recorded intent is absent; recovery can replay its persisted bytes once."
            : disposition === "present"
              ? "The exact recorded intent is present once; recovery can validate and complete its durable receipt."
              : disposition === "complete"
                ? "The exact recorded intent is complete; this inspection is idempotent and read-only."
                : "The receipt or a recovery stage conflicts with the recorded intent; preserve the evidence and resolve it manually.",
      },
    };
    const confirmationText = recoveryConfirmationText(
      journal,
      disposition === "absent" ? "absent" : "present",
    );
    const freshness = digest(
      stable({
        recovery: "change.re-pin.v1",
        target,
        journalSnapshot,
        journal,
        receipt,
        disposition,
        stageFingerprint: stages.fingerprint,
        inputDigest: liveData.inputDigest,
        guardRoutes: liveData.guardRoutes,
        confirmationText,
      }),
    );
    const internal: InternalRePinRecoveryPreview = {
      ...data,
      receipt,
      receiptStage: stages.receiptStage,
      journal,
      journalSnapshot,
      selection,
      confirmationText,
      inputDigest: liveData.inputDigest,
      stageFingerprint: stages.fingerprint,
    };
    return success(
      action,
      "preview",
      target,
      internal,
      data.ready
        ? confirmation(action, target, freshness, confirmationText)
        : undefined,
    );
  } catch (error) {
    return fail(action, error, target);
  }
}

function publicRecoveryPreview(
  data: InternalRePinRecoveryPreview,
): RePinRecoveryPreview {
  const {
    receipt: _receipt,
    receiptStage: _receiptStage,
    journal: _journal,
    journalSnapshot: _journalSnapshot,
    selection: _selection,
    confirmationText: _confirmationText,
    inputDigest: _inputDigest,
    stageFingerprint: _stageFingerprint,
    ...visible
  } = data;
  return visible;
}

export async function previewChangeRePinRecovery(
  rootInput: string,
  changeInput: string,
  schemaInput: string,
  resourceOptions: ResourceRuntimeOptions = {},
): Promise<ActionResult<RePinRecoveryPreview>> {
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const schema = safeIdentifier(schemaInput, "schema name");
    const target = recoveryTarget(root, change, schema);
    const { journal } = await existingJournal(root);
    if (journal?.version === 1 && journal.state === "complete")
      return success(action, "read", target, {
        ready: false,
        change,
        from: null,
        to: null,
        recovery: {
          disposition: "complete",
          operationId: journal.operationId,
          journalState: "complete",
          target: `openspec/changes/${change}/.opsx-provenance.json`,
          expectedDigest: "",
          intendedDigest: "",
          detail:
            "This completed version-one journal remains readable historical evidence and has no pending version-two intent.",
        },
      });
  } catch (error) {
    return fail(action, error);
  }
  const result = await previewChangeRePinRecoveryInternal({
    rootInput,
    changeInput,
    schemaInput,
    resourceOptions,
  });
  if (!result.ok) return result;
  return success(
    action,
    result.phase,
    result.target,
    publicRecoveryPreview(result.data),
    result.confirmation,
  );
}

function exactJournalBytes(encoded: unknown): Buffer | null {
  if (typeof encoded !== "string" || encoded.length > MAX_RE_PIN_BYTES * 2)
    return null;
  const bytes = Buffer.from(encoded, "base64");
  return bytes.toString("base64") === encoded &&
    bytes.length <= MAX_RE_PIN_BYTES
    ? bytes
    : null;
}

function validJournalIntent(value: RePinJournal, root: string): boolean {
  const expected = value.expected;
  const expectedBytes = exactJournalBytes(expected?.bytes);
  const intendedBytes = exactJournalBytes(value.intended);
  const hexDigest = (input: unknown): input is string =>
    typeof input === "string" && /^[0-9a-f]{64}$/.test(input);
  const routes = value.reviewedRoutes;
  if (
    value.root !== root ||
    typeof value.change !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value.change) ||
    typeof value.schema !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value.schema) ||
    value.target !== `openspec/changes/${value.change}/.opsx-provenance.json` ||
    !expected?.exists ||
    !expectedBytes ||
    !intendedBytes ||
    expected.size !== expectedBytes.length ||
    typeof expected.dev !== "string" ||
    typeof expected.ino !== "string" ||
    typeof expected.mtimeNs !== "string" ||
    typeof expected.ctimeNs !== "string" ||
    typeof expected.mode !== "number" ||
    expected.mode < 0 ||
    expected.mode > 0o777 ||
    expected.digest !== digest(expectedBytes) ||
    value.expectedDigest !== expected.digest ||
    value.intendedDigest !== digest(intendedBytes) ||
    (value.receiptStageIdentity !== undefined &&
      (typeof value.receiptStageIdentity.dev !== "string" ||
        !/^\d+$/.test(value.receiptStageIdentity.dev) ||
        typeof value.receiptStageIdentity.ino !== "string" ||
        !/^\d+$/.test(value.receiptStageIdentity.ino) ||
        value.receiptStageIdentity.mode !== expected.mode ||
        value.receiptStageIdentity.digest !== value.intendedDigest)) ||
    !hexDigest(value.reviewedGuard) ||
    !hexDigest(value.reviewedInputs) ||
    !hexDigest(value.reviewedFreshness) ||
    !hexDigest(value.pinDigest) ||
    !hexDigest(value.configDigest) ||
    !hexDigest(value.retentionDigest) ||
    value.retentionDigest !== value.from?.digest ||
    (value.priorJournalDigest !== null &&
      !hexDigest(value.priorJournalDigest)) ||
    !routes ||
    typeof routes !== "object" ||
    !routes[root] ||
    !routes[path.join(root, "openspec/.opsx")] ||
    !routes[path.dirname(path.join(root, value.target))] ||
    !Object.values(routes).every(
      (route) =>
        route &&
        typeof route.dev === "string" &&
        /^\d+$/.test(route.dev) &&
        typeof route.ino === "string" &&
        /^\d+$/.test(route.ino) &&
        Number.isInteger(route.mode) &&
        route.mode >= 0 &&
        route.mode <= 0o777,
    ) ||
    !value.selection ||
    !Array.isArray(value.selection.profiles) ||
    !value.selection.profiles.every((item) => typeof item === "string") ||
    !Array.isArray(value.selection.skillHosts) ||
    !value.selection.skillHosts.every((item) => typeof item === "string") ||
    typeof value.selection.noProfiles !== "boolean" ||
    value.validation?.ok !== true ||
    value.validation.strictWorkflowValidated !== true ||
    (value.error !== undefined &&
      (typeof value.error !== "string" || value.error.length > 2048)) ||
    (value.historicalOrigin !== null &&
      (value.historicalOrigin?.status !== "unknown" ||
        value.historicalOrigin.oldLocation !== value.from?.source ||
        value.historicalOrigin.currentLocation !== value.to?.source ||
        value.historicalOrigin.warning !== unknownOriginWarning))
  )
    return false;
  try {
    const directory = path.dirname(path.join(root, value.target));
    const prior = parseProvenance(expectedBytes.toString("utf8"), directory);
    const next = parseProvenance(intendedBytes.toString("utf8"), directory);
    const events = next.rePins ?? [];
    const last = events.at(-1);
    return (
      next.version === 2 &&
      stable(prior.created) === stable(next.created) &&
      stable(prior.migrations) === stable(next.migrations) &&
      stable(prior.retained ?? null) === stable(next.retained ?? null) &&
      stable(prior.rePins ?? []) === stable(events.slice(0, -1)) &&
      stable(effectiveRevision(prior)) === stable(value.from) &&
      stable(effectiveRevision(next)) === stable(value.to) &&
      events.length === (prior.rePins?.length ?? 0) + 1 &&
      last?.operationId === value.operationId &&
      stable(last?.from) === stable(value.from) &&
      stable(last?.to) === stable(value.to) &&
      stable(last?.associationBefore ?? null) ===
        stable(value.associationBefore) &&
      stable(last?.associationAfter ?? null) === stable(value.associationAfter)
    );
  } catch {
    return false;
  }
}

async function existingJournal(root: string): Promise<{
  snapshot: GuardedFile;
  journal: RePinJournal | LegacyRePinJournal | null;
}> {
  const snapshot = await guardedFile(path.join(root, RE_PIN_JOURNAL));
  if (!snapshot.exists || !snapshot.bytes) return { snapshot, journal: null };
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(snapshot.bytes, "base64").toString("utf8"));
  } catch {
    throw new OpsxError(
      "REPIN_JOURNAL_INVALID",
      "Re-pin journal is malformed.",
    );
  }
  const journal = value as RePinJournal | LegacyRePinJournal;
  if (
    !value ||
    typeof value !== "object" ||
    !["prepared", "partial", "complete"].includes(journal.state) ||
    typeof journal.operationId !== "string" ||
    !journal.operationId ||
    (journal.version !== 1 && journal.version !== 2) ||
    (journal.version === 2 && !validJournalIntent(journal, root))
  )
    throw new OpsxError(
      "REPIN_JOURNAL_INVALID",
      "Re-pin journal has invalid intent.",
    );
  return { snapshot, journal };
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureJournalDirectory(root: string): Promise<string> {
  const openspec = path.join(root, "openspec");
  const openspecInfo = await lstat(openspec);
  if (!openspecInfo.isDirectory() || openspecInfo.isSymbolicLink())
    throw new OpsxError("REPIN_UNSAFE_PATH", "OpenSpec route was redirected.");
  const directory = path.join(openspec, ".opsx");
  try {
    await mkdir(directory, { mode: 0o700 });
    await syncDirectory(openspec);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new OpsxError(
      "REPIN_UNSAFE_PATH",
      "Re-pin journal directory is unsafe.",
    );
  return directory;
}

async function cleanupOwnedStage(
  file: string,
  identity: { dev: bigint; ino: bigint } | undefined,
  bytes: Buffer,
  mode: number,
): Promise<void> {
  if (!identity) return;
  try {
    const current = await lstat(file, { bigint: true });
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      current.dev !== identity.dev ||
      current.ino !== identity.ino ||
      Number(current.mode & 0o777n) !== mode ||
      current.size !== BigInt(bytes.length)
    )
      return;
    const snapshot = await guardedFile(file);
    if (
      snapshot.dev !== identity.dev.toString() ||
      snapshot.ino !== identity.ino.toString() ||
      snapshot.mode !== mode ||
      snapshot.bytes !== bytes.toString("base64")
    )
      return;
    if (!sameGuardedFile(snapshot, await guardedFile(file))) return;
    await unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function guardedReplace(input: {
  root: string;
  file: string;
  expected: GuardedFile;
  bytes: Buffer;
  mode: number;
  stageId: string;
  stageDirectory?: string;
  resumeStage?: boolean;
  onStageCreated?: (identity: RePinStageIdentity) => Promise<void>;
  onStagePrepared?: (identity: RePinStageIdentity) => Promise<void>;
  reviewedRoutes: Record<string, { dev: string; ino: string; mode: number }>;
  beforeActivation?: () => Promise<void>;
  beforeMutation?: () => Promise<void>;
}): Promise<GuardedFile> {
  const {
    root,
    file,
    expected,
    bytes,
    mode,
    stageId,
    stageDirectory,
    resumeStage = false,
    onStageCreated,
    onStagePrepared,
    reviewedRoutes,
    beforeActivation,
    beforeMutation,
  } = input;
  const directory = path.dirname(file);
  const verifyRoutes = async () => {
    const currentRoutes = await directoryRoutes(
      root,
      Object.keys(reviewedRoutes),
    );
    if (stable(currentRoutes) !== stable(reviewedRoutes))
      throw new OpsxError(
        "REPIN_ROUTE_CHANGED",
        "A reviewed project, change, schema, or journal directory was replaced.",
      );
  };
  await verifyRoutes();
  if (!sameGuardedFile(expected, await guardedFile(file)))
    throw new OpsxError(
      "REPIN_STALE",
      `Guarded file changed before replacement: ${file}`,
    );
  const stageParent = stageDirectory ?? directory;
  const stage = path.join(
    stageParent,
    `.${path.basename(file)}.${stageId}.tmp`,
  );
  let resumeSnapshot: GuardedFile | null = null;
  if (resumeStage) {
    resumeSnapshot = await guardedFile(stage);
    if (
      !resumeSnapshot.exists ||
      resumeSnapshot.bytes !== bytes.toString("base64") ||
      resumeSnapshot.mode !== mode
    )
      throw new OpsxError(
        "REPIN_STAGE_CHANGED",
        "The owned re-pin stage changed before recovery could resume it.",
      );
  }
  const handle = resumeStage
    ? await open(stage, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    : await open(
        stage,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        mode,
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST")
          throw new OpsxError(
            "REPIN_STAGE_CONFLICT",
            "A re-pin staging path already exists; no file was replaced.",
          );
        throw error;
      });
  let identity: { dev: bigint; ino: bigint } | undefined;
  try {
    const info = await handle.stat({ bigint: true });
    identity = { dev: info.dev, ino: info.ino };
    if (resumeStage) {
      if (
        info.dev.toString() !== resumeSnapshot?.dev ||
        info.ino.toString() !== resumeSnapshot.ino
      )
        throw new OpsxError(
          "REPIN_STAGE_CHANGED",
          "The owned re-pin stage identity changed before recovery.",
        );
    } else {
      await onStageCreated?.({
        dev: info.dev.toString(),
        ino: info.ino.toString(),
        mode,
        digest: digest(bytes),
      });
      const afterCallback = await lstat(stage, { bigint: true });
      if (
        !afterCallback.isFile() ||
        afterCallback.isSymbolicLink() ||
        afterCallback.dev !== info.dev ||
        afterCallback.ino !== info.ino ||
        afterCallback.mode !== info.mode ||
        afterCallback.size !== 0n
      )
        throw new OpsxError(
          "REPIN_STAGE_CHANGED",
          "Receipt stage changed while recording its ownership identity.",
        );
      await handle.writeFile(bytes);
      await handle.chmod(mode);
    }
    await handle.sync();
    await onStagePrepared?.({
      dev: info.dev.toString(),
      ino: info.ino.toString(),
      mode,
      digest: digest(bytes),
    });
  } catch (error) {
    if (!resumeStage && !onStageCreated)
      await cleanupOwnedStage(stage, identity, bytes, mode).catch(
        () => undefined,
      );
    throw error;
  } finally {
    await handle.close();
  }
  try {
    const verifyStage = async () => {
      const staged = await lstat(stage, { bigint: true });
      if (
        !staged.isFile() ||
        staged.isSymbolicLink() ||
        staged.dev !== identity?.dev ||
        staged.ino !== identity?.ino ||
        Number(staged.mode & 0o777n) !== mode
      )
        throw new OpsxError(
          "REPIN_STAGE_CHANGED",
          "Owned re-pin stage changed before activation.",
        );
      const snapshot = await guardedFile(stage);
      if (
        snapshot.dev !== identity?.dev.toString() ||
        snapshot.ino !== identity?.ino.toString() ||
        snapshot.mode !== mode ||
        snapshot.bytes !== bytes.toString("base64")
      )
        throw new OpsxError(
          "REPIN_STAGE_CHANGED",
          "Owned re-pin stage changed before activation.",
        );
    };
    await verifyStage();
    await verifyRoutes();
    if (!sameGuardedFile(expected, await guardedFile(file)))
      throw new OpsxError(
        "REPIN_STALE",
        `Guarded file changed before activation: ${file}`,
      );
    await beforeActivation?.();
    await verifyStage();
    await verifyRoutes();
    if (!sameGuardedFile(expected, await guardedFile(file)))
      throw new OpsxError(
        "REPIN_STALE",
        `Guarded file changed before activation: ${file}`,
      );
    await beforeMutation?.();
    if (expected.exists) {
      await rename(stage, file);
    } else {
      try {
        await link(stage, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new OpsxError(
            "REPIN_STALE",
            `Guarded file appeared before creation: ${file}`,
          );
        throw error;
      }
      await unlink(stage);
    }
    await syncDirectory(directory);
    if (stageParent !== directory) await syncDirectory(stageParent);
    const activated = await guardedFile(file);
    if (
      activated.digest !== digest(bytes) ||
      activated.dev !== identity?.dev.toString() ||
      activated.ino !== identity?.ino.toString() ||
      activated.mode !== mode
    )
      throw new OpsxError(
        "REPIN_DURABILITY_UNSUPPORTED",
        "Replacement did not remain durable and exact.",
      );
    return activated;
  } finally {
    if (!resumeStage && !onStageCreated)
      await cleanupOwnedStage(stage, identity, bytes, mode);
  }
}

export async function applyChangeRePin(
  request: RePinApplyRequest,
): Promise<ActionResult<RePinPreview>> {
  const {
    rootInput,
    changeInput,
    schemaInput,
    applyToken,
    confirmationText,
    selection,
    resourceOptions = {},
  } = request;
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const schemaName = safeIdentifier(schemaInput, "schema name");
    target = { root, change, schema: schemaName };
    return await withProjectMutationLock(root, async () => {
      await assertNoIncompleteSwitchRecovery(root, [root]);
      const { snapshot: priorJournal, journal: previousJournal } =
        await existingJournal(root);
      if (previousJournal && previousJournal.state !== "complete")
        throw new OpsxError(
          "REPIN_RECOVERY_REQUIRED",
          "An unresolved re-pin journal requires explicit recovery inspection.",
        );
      const current = await previewChangeRePinInternal({
        rootInput: root,
        changeInput: change,
        schemaInput: schemaName,
        selection,
        resourceOptions,
      });
      const latestJournal = await existingJournal(root);
      if (latestJournal.journal && latestJournal.journal.state !== "complete")
        throw new OpsxError(
          "REPIN_RECOVERY_REQUIRED",
          "An unresolved re-pin journal requires explicit recovery inspection.",
        );
      if (!sameGuardedFile(priorJournal, latestJournal.snapshot))
        throw new OpsxError(
          "STALE_PREVIEW",
          "Re-pin journal changed during Apply preview; request a fresh preview.",
        );
      if (!current.ok)
        throw new OpsxError(current.error.code, current.error.message);
      if (
        applyToken === undefined &&
        confirmationText === undefined &&
        current.data.noOp
      )
        return success(action, "applied", target!, publicPreview(current.data));
      const token = readToken(applyToken, action, {
        root,
        change,
        schema: schemaName,
      });
      if (confirmationText === undefined)
        throw new OpsxError(
          "REPIN_CONFIRMATION_REQUIRED",
          "Apply requires the exact confirmation text returned by the fresh preview.",
        );
      if (token.freshness !== current.confirmation?.freshness)
        throw new OpsxError(
          "STALE_PREVIEW",
          "Re-pin inputs changed; request a fresh preview.",
        );
      if (confirmationText !== current.confirmation?.exactTarget)
        throw new OpsxError(
          "REPIN_CONFIRMATION_MISMATCH",
          "Confirmation does not match the exact reviewed re-pin warning and target.",
        );
      if (!current.data.ready || current.data.noOp || !current.confirmation)
        throw new OpsxError(
          "REPIN_NOT_APPLICABLE",
          "Re-pin is not applicable; request a fresh preview.",
        );

      const directory = await activeDirectory(root, change);
      const provenanceFile = path.join(directory, ".opsx-provenance.json");
      const expected = await guardedFile(provenanceFile);
      if (!expected.exists || !expected.bytes || !expected.mode)
        throw new OpsxError(
          "REPIN_PROVENANCE_REQUIRED",
          "Re-pin requires an existing provenance receipt.",
        );
      const provenance = parseProvenance(
        Buffer.from(expected.bytes, "base64").toString("utf8"),
        directory,
      );
      if (stable(effectiveRevision(provenance)) !== stable(current.data.from))
        throw new OpsxError(
          "STALE_PREVIEW",
          "Effective provenance changed after review.",
        );
      const operationId = randomUUID();
      const beforeAssociation = current.data.association ?? null;
      const afterAssociation = current.data.targetAssociation ?? null;
      const priorRePins = provenance.rePins ?? [];
      const establishments =
        provenance.version === 2
          ? (provenance.establishments ?? [])
          : beforeAssociation
            ? [
                {
                  afterMigrationCount: provenance.migrations.length,
                  afterRePinCount: priorRePins.length,
                  association: beforeAssociation,
                },
              ]
            : [];
      const next: Provenance = {
        ...provenance,
        version: 2,
        establishments,
        rePins: [
          ...priorRePins,
          {
            operationId,
            at: new Date().toISOString(),
            afterMigrationCount: provenance.migrations.length,
            from: current.data.from,
            to: current.data.to,
            associationBefore: beforeAssociation,
            associationAfter: afterAssociation,
          },
        ],
        ...(afterAssociation ? { association: afterAssociation } : {}),
      };
      const intended = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
      if (intended.length > MAX_RE_PIN_BYTES)
        throw new OpsxError(
          "REPIN_JOURNAL_INVALID",
          "Intended provenance exceeds the re-pin size limit.",
        );
      parseProvenance(intended.toString("utf8"), directory);
      const journalDirectory = await ensureJournalDirectory(root);
      const journalFile = path.join(journalDirectory, "re-pin-journal.json");
      const journal: RePinJournal = {
        version: 2,
        state: "prepared",
        operationId,
        root,
        change,
        schema: schemaName,
        target: path.relative(root, provenanceFile).split(path.sep).join("/"),
        reviewedFreshness: token.freshness,
        priorJournalDigest: priorJournal.digest,
        historicalOrigin: current.data.historicalOrigin ?? null,
        reviewedGuard: current.data.guardDigest!,
        reviewedInputs: current.data.inputDigest!,
        reviewedRoutes: current.data.guardRoutes!,
        selection: {
          profiles: selection.noProfiles ? [] : [...selection.profiles],
          noProfiles: selection.noProfiles,
          skillHosts: [...selection.skillHosts],
          ...(selection.bundle ? { bundle: selection.bundle } : {}),
        },
        validation: current.data.validation,
        resources: current.data.resources,
        pinDigest: current.data.pinDigest,
        configDigest: current.data.configDigest,
        retentionDigest: current.data.from.digest,
        from: current.data.from,
        to: current.data.to,
        associationBefore: beforeAssociation,
        associationAfter: afterAssociation,
        expected,
        expectedDigest: expected.digest!,
        intended: intended.toString("base64"),
        intendedDigest: digest(intended),
      };
      const journalBytes = Buffer.from(`${JSON.stringify(journal)}\n`);
      if (journalBytes.length > MAX_RE_PIN_BYTES)
        throw new OpsxError(
          "REPIN_JOURNAL_INVALID",
          "Re-pin journal exceeds the bounded journal size.",
        );
      await guardedReplace({
        root,
        file: journalFile,
        expected: priorJournal,
        bytes: journalBytes,
        mode: 0o600,
        stageId: operationId,
        reviewedRoutes: current.data.guardRoutes,
      });
      let prepared = await guardedFile(journalFile);
      let written: GuardedFile | undefined;
      const assertLiveInputs = async (
        phase: "prepared" | "activated",
        journalSnapshot: GuardedFile,
      ): Promise<void> => {
        const refreshed = await previewChangeRePinInternal({
          rootInput: root,
          changeInput: change,
          schemaInput: schemaName,
          selection,
          resourceOptions,
          ignoreJournalForRecheck: true,
        });
        const receiptSnapshot = phase === "prepared" ? expected : written;
        if (
          !refreshed.ok ||
          !refreshed.data.ready ||
          refreshed.data.noOp !== (phase === "activated") ||
          (phase === "prepared"
            ? refreshed.data.guardDigest !== current.data.guardDigest
            : refreshed.data.inputDigest !== current.data.inputDigest ||
              stable(refreshed.data.to) !== stable(current.data.to) ||
              stable(refreshed.data.association ?? null) !==
                stable(afterAssociation)) ||
          (confirmationText !== refreshed.confirmation?.exactTarget &&
            phase === "prepared") ||
          !receiptSnapshot ||
          !sameGuardedFile(
            receiptSnapshot,
            await guardedFile(provenanceFile),
          ) ||
          !sameGuardedFile(journalSnapshot, await guardedFile(journalFile))
        )
          throw new OpsxError(
            phase === "prepared" ? "STALE_PREVIEW" : "REPIN_POSTFLIGHT",
            `Live re-pin inputs changed at the ${phase} write boundary.`,
          );
      };
      try {
        await assertLiveInputs("prepared", prepared);
        const latestJournal = await existingJournal(root);
        if (
          !latestJournal.journal ||
          latestJournal.journal.operationId !== operationId ||
          latestJournal.journal.state !== "prepared"
        )
          throw new OpsxError(
            "REPIN_JOURNAL_INVALID",
            "Prepared re-pin journal changed before activation.",
          );
        written = await guardedReplace({
          root,
          file: provenanceFile,
          expected,
          bytes: intended,
          mode: expected.mode,
          stageId: operationId,
          stageDirectory: journalDirectory,
          reviewedRoutes: current.data.guardRoutes,
          onStageCreated: async (identity) => {
            if (
              stable(journal.receiptStageIdentity ?? null) === stable(identity)
            )
              return;
            journal.receiptStageIdentity = identity;
            const stageReviewed = Buffer.from(`${JSON.stringify(journal)}\n`);
            prepared = await guardedReplace({
              root,
              file: journalFile,
              expected: prepared,
              bytes: stageReviewed,
              mode: 0o600,
              stageId: `${operationId}-receipt-stage`,
              reviewedRoutes: current.data.guardRoutes,
              beforeActivation: () => assertLiveInputs("prepared", prepared),
            });
          },
          beforeActivation: () => assertLiveInputs("prepared", prepared),
        });
        const live = await previewChangeRePinInternal({
          rootInput: root,
          changeInput: change,
          schemaInput: schemaName,
          selection,
          resourceOptions,
          ignoreJournalForRecheck: true,
        });
        const liveProvenance = await readProvenance(directory);
        const liveJournal = await existingJournal(root);
        const postflightFailures = [
          ...(!live.ok ? ["preview"] : []),
          ...(live.ok && !live.data.ready ? ["not-ready"] : []),
          ...(live.ok && !live.data.noOp ? ["not-healthy-noop"] : []),
          ...(live.ok && stable(live.data.to) !== stable(current.data.to)
            ? ["target"]
            : []),
          ...(live.ok &&
          stable(live.data.association ?? null) !== stable(afterAssociation)
            ? ["association"]
            : []),
          ...(live.ok && live.data.inputDigest !== current.data.inputDigest
            ? ["other-inputs"]
            : []),
          ...(written.digest !== digest(intended) ? ["receipt-bytes"] : []),
          ...(written.mode !== expected.mode ? ["receipt-mode"] : []),
          ...(liveProvenance?.rePins?.filter(
            (event) => event.operationId === operationId,
          ).length !== 1
            ? ["event-count"]
            : []),
          ...(!liveProvenance ||
          stable(effectiveRevision(liveProvenance)) !== stable(current.data.to)
            ? ["effective-ref"]
            : []),
          ...(!liveJournal.journal ||
          liveJournal.journal.operationId !== operationId
            ? ["journal-intent"]
            : []),
          ...(!sameGuardedFile(prepared, liveJournal.snapshot)
            ? ["journal-identity"]
            : []),
        ];
        if (postflightFailures.length)
          throw new OpsxError(
            "REPIN_POSTFLIGHT",
            `Live re-pin postflight differed: ${postflightFailures.join(", ")}.`,
          );
        journal.state = "complete";
        const completed = await guardedReplace({
          root,
          file: journalFile,
          expected: prepared,
          bytes: Buffer.from(`${JSON.stringify(journal)}\n`),
          mode: 0o600,
          stageId: operationId,
          reviewedRoutes: current.data.guardRoutes,
          beforeActivation: () => assertLiveInputs("activated", prepared),
        });
        await assertLiveInputs("activated", completed);
        return success(action, "applied", target!, publicPreview(current.data));
      } catch (error) {
        const latest = await existingJournal(root).catch(() => null);
        if (
          latest?.journal?.operationId === operationId &&
          latest.journal.state === "prepared"
        ) {
          journal.state = "partial";
          journal.error = (
            error instanceof Error ? error.message : String(error)
          ).slice(0, 2048);
          await guardedReplace({
            root,
            file: journalFile,
            expected: latest.snapshot,
            bytes: Buffer.from(`${JSON.stringify(journal)}\n`),
            mode: 0o600,
            stageId: operationId,
            reviewedRoutes: current.data.guardRoutes,
          }).catch(() => undefined);
        }
        throw error;
      }
    });
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function recoverChangeRePin(
  request: RePinRecoveryApplyRequest,
): Promise<ActionResult<RePinRecoveryPreview>> {
  const {
    rootInput,
    changeInput,
    schemaInput,
    recoveryToken,
    confirmationText,
    resourceOptions = {},
  } = request;
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const schema = safeIdentifier(schemaInput, "schema name");
    target = recoveryTarget(root, change, schema);
    return await withProjectMutationLock(root, async () => {
      const reviewed = await previewChangeRePinRecoveryInternal({
        rootInput: root,
        changeInput: change,
        schemaInput: schema,
        resourceOptions,
      });
      if (!reviewed.ok)
        throw new OpsxError(reviewed.error.code, reviewed.error.message);
      const confirmationResult = reviewed.confirmation;
      if (!recoveryToken)
        throw new OpsxError(
          "REPIN_RECOVERY_TOKEN_REQUIRED",
          "Recovery Apply requires its fresh --recovery-token from --recover inspection.",
        );
      const token = readToken(recoveryToken, action, target!);
      if (!confirmationResult || !reviewed.data.ready)
        throw new OpsxError(
          "REPIN_RECOVERY_CONFLICT",
          "The inspected re-pin intent is not safe to apply; resolve the conflict and inspect again.",
        );
      if (confirmationText === undefined)
        throw new OpsxError(
          "REPIN_RECOVERY_CONFIRMATION_REQUIRED",
          "Recovery Apply requires the exact confirmation text returned by its fresh inspection.",
        );
      if (
        token.freshness !== confirmationResult.freshness ||
        confirmationText !== confirmationResult.exactTarget
      )
        throw new OpsxError(
          "STALE_PREVIEW",
          "Recovery token or confirmation does not match the exact current journal intent; inspect recovery again.",
        );

      const { journal, journalSnapshot, receipt, receiptStage, recovery } =
        reviewed.data;
      let activeJournal = journal;
      let activeJournalSnapshot = journalSnapshot;
      const journalFile = path.join(root, RE_PIN_JOURNAL);
      const receiptStageName = `..opsx-provenance.json.${journal.operationId}.tmp`;
      const stageWithoutReceipt = await recoveryStageFingerprint(root, [
        receiptStageName,
      ]);
      if (
        (await recoveryStageFingerprint(root)) !==
        reviewed.data.stageFingerprint
      )
        throw new OpsxError(
          "REPIN_RECOVERY_INPUTS_STALE",
          "Recovery stage inventory changed after review.",
        );
      let ignoreReceiptStage = false;
      const assertStageInventory = async (
        journalStageName?: string,
      ): Promise<void> => {
        const ignored = [
          ...(ignoreReceiptStage ? [receiptStageName] : []),
          ...(journalStageName ? [journalStageName] : []),
        ];
        const expected = ignoreReceiptStage
          ? stageWithoutReceipt
          : reviewed.data.stageFingerprint;
        if ((await recoveryStageFingerprint(root, ignored)) !== expected)
          throw new OpsxError(
            "REPIN_RECOVERY_INPUTS_STALE",
            "Recovery stage inventory changed after review.",
          );
      };
      const provenanceFile = path.join(
        root,
        "openspec/changes",
        change,
        ".opsx-provenance.json",
      );
      const assertBeforeActivation = async (
        expected: "absent" | "present",
      ): Promise<void> => {
        await assertStageInventory();
        const current = await previewChangeRePinRecoveryInternal({
          rootInput: root,
          changeInput: change,
          schemaInput: schema,
          resourceOptions,
        });
        const stale = [
          ...(!current.ok ? ["inspection"] : []),
          ...(current.ok && current.data.recovery.disposition !== expected
            ? ["disposition"]
            : []),
          ...(current.ok &&
          current.data.inputDigest !== reviewed.data.inputDigest
            ? ["inputs"]
            : []),
          ...(current.ok &&
          current.data.recovery.operationId !== recovery.operationId
            ? ["operation"]
            : []),
          ...(current.ok &&
          !sameGuardedFile(activeJournalSnapshot, current.data.journalSnapshot)
            ? ["journal-identity"]
            : []),
          ...(current.ok &&
          !sameGuardedFile(
            current.data.journalSnapshot,
            await guardedFile(journalFile),
          )
            ? ["journal-current"]
            : []),
        ];
        if (stale.length)
          throw new OpsxError(
            "REPIN_RECOVERY_INPUTS_STALE",
            `Live recovery inputs, journal intent, or stage changed before activation (${stale.join(", ")}).`,
          );
      };
      const assertLiveIntent = async (
        journalStageName?: string,
      ): Promise<void> => {
        await assertStageInventory(journalStageName);
        const current = await previewChangeRePinInternal({
          rootInput: root,
          changeInput: change,
          schemaInput: schema,
          selection: reviewed.data.selection,
          resourceOptions,
          ignoreJournalForRecheck: true,
        });
        if (
          !current.ok ||
          current.data.noOp ||
          current.data.inputDigest !== reviewed.data.inputDigest ||
          stable(current.data.from) !== stable(journal.from) ||
          stable(current.data.to) !== stable(journal.to) ||
          stable(current.data.guardRoutes) !== stable(journal.reviewedRoutes) ||
          !sameGuardedFile(receipt, await guardedFile(provenanceFile)) ||
          !sameGuardedFile(
            activeJournalSnapshot,
            await guardedFile(journalFile),
          )
        )
          throw new OpsxError(
            "REPIN_RECOVERY_INPUTS_STALE",
            "Live reviewed inputs, receipt, or journal changed before recovery staging.",
          );
      };

      if (recovery.disposition === "absent") {
        const receiptMode = journal.expected.mode;
        if (receiptMode === null)
          throw new OpsxError(
            "REPIN_JOURNAL_INVALID",
            "The re-pin journal has no exact receipt mode for replay.",
          );
        await guardedReplace({
          root,
          file: provenanceFile,
          expected: receipt,
          bytes: Buffer.from(journal.intended, "base64"),
          mode: receiptMode,
          stageId: journal.operationId,
          stageDirectory: path.join(root, "openspec/.opsx"),
          resumeStage: receiptStage !== null,
          reviewedRoutes: journal.reviewedRoutes,
          onStageCreated: async (identity) => {
            ignoreReceiptStage = true;
            await assertLiveIntent();
            const nextJournal: RePinJournal = {
              ...activeJournal,
              receiptStageIdentity: identity,
            };
            const nextJournalFile = await guardedReplace({
              root,
              file: journalFile,
              expected: activeJournalSnapshot,
              bytes: Buffer.from(`${JSON.stringify(nextJournal)}\n`),
              mode: 0o600,
              stageId: `${journal.operationId}-recovery-stage`,
              reviewedRoutes: journal.reviewedRoutes,
              beforeActivation: () =>
                assertLiveIntent(
                  `.re-pin-journal.json.${journal.operationId}-recovery-stage.tmp`,
                ),
              beforeMutation: () =>
                assertStageInventory(
                  `.re-pin-journal.json.${journal.operationId}-recovery-stage.tmp`,
                ),
            });
            activeJournal = nextJournal;
            activeJournalSnapshot = nextJournalFile;
          },
          onStagePrepared: async (identity) => {
            if (
              stable(activeJournal.receiptStageIdentity ?? null) ===
              stable(identity)
            ) {
              await assertBeforeActivation("absent");
              return;
            }
            throw new OpsxError(
              "REPIN_STAGE_CHANGED",
              "The receipt stage lacks its recorded ownership identity.",
            );
          },
          beforeActivation: () => assertBeforeActivation("absent"),
          beforeMutation: () => assertStageInventory(),
        });
        ignoreReceiptStage = true;
      } else {
        const handle = await open(
          provenanceFile,
          fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
        );
        try {
          await handle.sync();
        } finally {
          await handle.close();
        }
        await syncDirectory(path.dirname(provenanceFile));
      }

      await assertStageInventory();

      const present = await previewChangeRePinRecoveryInternal({
        rootInput: root,
        changeInput: change,
        schemaInput: schema,
        resourceOptions,
      });
      if (
        !present.ok ||
        present.data.recovery.disposition !== "present" ||
        present.data.inputDigest !== reviewed.data.inputDigest ||
        !sameGuardedFile(activeJournalSnapshot, present.data.journalSnapshot)
      )
        throw new OpsxError(
          "REPIN_RECOVERY_POSTFLIGHT",
          "The exact re-pin intent did not remain present after receipt durability checks.",
        );
      const liveJournal = await existingJournal(root);
      if (
        !liveJournal.journal ||
        liveJournal.journal.version !== 2 ||
        liveJournal.journal.operationId !== journal.operationId ||
        liveJournal.journal.state === "complete"
      )
        throw new OpsxError(
          "REPIN_JOURNAL_INVALID",
          "The pending journal changed before durable completion.",
        );
      const completedJournal: RePinJournal = {
        ...liveJournal.journal,
        state: "complete",
      };
      const completedBytes = Buffer.from(
        `${JSON.stringify(completedJournal)}\n`,
      );
      const completionStageId = `${journal.operationId}-recovery-${randomUUID()}`;
      const completedFile = await guardedReplace({
        root,
        file: journalFile,
        expected: liveJournal.snapshot,
        bytes: completedBytes,
        mode: 0o600,
        stageId: completionStageId,
        reviewedRoutes: journal.reviewedRoutes,
        beforeActivation: async () => {
          await assertStageInventory(
            `.re-pin-journal.json.${completionStageId}.tmp`,
          );
          const latest = await previewChangeRePinRecoveryInternal({
            rootInput: root,
            changeInput: change,
            schemaInput: schema,
            resourceOptions,
          });
          if (
            !latest.ok ||
            latest.data.recovery.disposition !== "present" ||
            latest.data.inputDigest !== reviewed.data.inputDigest ||
            !sameGuardedFile(
              liveJournal.snapshot,
              await guardedFile(journalFile),
            )
          )
            throw new OpsxError(
              "REPIN_RECOVERY_INPUTS_STALE",
              "Live recovery inputs changed before journal completion.",
            );
        },
        beforeMutation: () =>
          assertStageInventory(`.re-pin-journal.json.${completionStageId}.tmp`),
      });
      await assertStageInventory();
      const complete = await previewChangeRePinRecoveryInternal({
        rootInput: root,
        changeInput: change,
        schemaInput: schema,
        resourceOptions,
      });
      if (
        !complete.ok ||
        complete.data.recovery.disposition !== "complete" ||
        complete.data.inputDigest !== reviewed.data.inputDigest ||
        !sameGuardedFile(completedFile, complete.data.journalSnapshot)
      )
        throw new OpsxError(
          "REPIN_RECOVERY_POSTFLIGHT",
          "Durable journal completion or its postflight checks failed.",
        );
      return success(
        action,
        "applied",
        target!,
        publicRecoveryPreview(complete.data),
      );
    });
  } catch (error) {
    return fail(action, error, target);
  }
}
