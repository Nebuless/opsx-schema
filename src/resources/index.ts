import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  copyFile,
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
} from "node:fs/promises";
import YAML from "yaml";
import { OpsxError } from "../domain/project.ts";

const DEFAULT_AGENT_MANIFEST = fileURLToPath(
  new URL("../../opsx-schema.json", import.meta.url),
);
const OWNERSHIP_FILE = ".openspec/opsx-schema/managed-resources.json";
const LOCK_FILE = ".openspec/opsx-schema/resources.lock";
const DEFAULT_SKILL_REPOSITORY = "intent-driven-dev/skills";
const DIGEST_RE = /^[a-f0-9]{64}$/;
export const SKILL_INSTALL_HOST_IDS = [
  "opencode",
  "omp",
  "pi",
  "atomic",
  "senpi",
] as const;
export type SkillInstallHostId = (typeof SKILL_INSTALL_HOST_IDS)[number];

type SkillHostContract = {
  readonly label: string;
  readonly relativeDestination: string;
  readonly trust: "external" | "not-required";
};

const SKILL_HOST_CONTRACTS = {
  opencode: {
    label: "OpenCode",
    relativeDestination: ".opencode/skills",
    trust: "not-required",
  },
  omp: {
    label: "OMP",
    relativeDestination: ".omp/skills",
    trust: "not-required",
  },
  pi: { label: "Pi", relativeDestination: ".pi/skills", trust: "external" },
  atomic: {
    label: "Atomic",
    relativeDestination: ".atomic/skills",
    trust: "external",
  },
  senpi: {
    label: "Senpi",
    relativeDestination: ".senpi/skills",
    trust: "external",
  },
} as const satisfies Record<SkillInstallHostId, SkillHostContract>;
const SKILL_INSTALL_HOST_ID_SET: ReadonlySet<string> = new Set(
  SKILL_INSTALL_HOST_IDS,
);

export function isSkillInstallHostId(
  value: unknown,
): value is SkillInstallHostId {
  return typeof value === "string" && SKILL_INSTALL_HOST_ID_SET.has(value);
}

export function skillInstallHostLabel(host: SkillInstallHostId): string {
  return SKILL_HOST_CONTRACTS[host].label;
}

export class ResourceError extends OpsxError {
  constructor(
    code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(code, message);
    this.name = "ResourceError";
  }
}

export interface AgentProfile {
  readonly id: string;
  readonly label: string;
  /** Project-relative skill directory. User-home/personal installation paths are not accepted. */
  readonly target: string;
}

export interface SkillDeclaration {
  readonly repository: string;
  /** Complete skill directory, relative to the source repository root. */
  readonly path: string;
  readonly skill: string;
}

/** Schema-declared source skill bundle; deliberately separate from named agent profiles. */
export type SkillBundle = "default" | "recommended" | "all";

/** Native project-level skill providers. These are separate from agent-profile ids. */
export type SkillInstallHostState =
  | "ready"
  | "missing"
  | "shared"
  | "unsupported"
  | "symlink"
  | "file"
  | "parent-conflict"
  | "undiscoverable";

export interface SkillBundleCatalog {
  readonly bundles: readonly SkillBundle[];
  readonly declarations: Readonly<
    Partial<Record<SkillBundle, readonly SkillDeclaration[]>>
  >;
  readonly manifestDigests: {
    readonly skills: string;
    readonly profiles: string | null;
  };
}

export interface ResourceDiagnostic {
  readonly severity: "error";
  readonly code: string;
  readonly message: string;
  readonly target?: string;
}

export interface ActiveSkillPin {
  readonly change?: string;
  readonly schema: string;
  readonly revisionDigest?: string;
  /** Present only when runtime state records the exact selection used for this pin. */
  readonly schemaRoot?: string;
  readonly profiles?: readonly string[];
  readonly skillHosts?: readonly SkillInstallHostId[];
  readonly skillBundle?: SkillBundle;
}

export interface RequiredSkillTargets {
  /** False means a pin exists but its exact profile/bundle targets cannot be proven. */
  readonly complete: boolean;
  readonly targets: readonly string[];
  readonly activePins: readonly Pick<
    ActiveSkillPin,
    "change" | "schema" | "revisionDigest"
  >[];
  readonly digest: string;
  readonly diagnostics: readonly ResourceDiagnostic[];
}

export interface InstalledSkillTarget {
  readonly target: string;
  readonly absoluteTarget: string;
  readonly skill: string;
  readonly repository: string;
  readonly sourcePath: string;
  readonly profiles: readonly string[];
  readonly sharedProfiles: readonly string[];
  readonly expectedDigest: string;
  readonly actualDigest: string | null;
  readonly state: SkillTargetState;
  readonly requiredByPinnedChange: boolean;
}

export interface InstalledSkillsReport {
  readonly schemaVersion: 1;
  readonly projectRoot: string;
  readonly complete: boolean;
  readonly required: RequiredSkillTargets;
  readonly targets: readonly InstalledSkillTarget[];
  readonly diagnostics: readonly ResourceDiagnostic[];
}

export interface ResourceRuntimeOptions {
  /** Test/local source checkout roots keyed by owner/repository. A root contains repo-relative skill folders. */
  readonly sourceRoots?: Readonly<Record<string, string>>;
  /** Override the checked-in agent-target manifest, primarily for isolated project fixtures. */
  readonly profileManifestPath?: string;
  /** Inject exact active schema-to-profile selections when a host/runtime persists them. */
  readonly resolveActivePins?: (
    projectRoot: string,
  ) => Promise<readonly ActiveSkillPin[]>;
}

export interface SkillInstallRequest {
  readonly projectRoot: string;
  readonly schemaRoot: string;
  /** Named agent ids from opsx-schema.json; these do not select source skill bundles. */
  readonly profiles: readonly string[];
  /** Native project skill hosts; omitted means no host install is staged. */
  readonly skillHosts?: readonly SkillInstallHostId[];
  /** Optional source bundle selector. Omission preserves the switch workflow's default bundle. */
  readonly skillBundle?: SkillBundle;
  /** Exact project-relative skill targets required by active pinned schemas/changes. */
  readonly requiredTargets?: readonly string[];
}

export type SkillTargetState =
  | "missing"
  | "owned"
  | "unmanaged"
  | "modified"
  | "symlink"
  | "file"
  | "parent-conflict";
export type SkillTargetAction = "install" | "noop" | "refuse";

export interface SkillInstallTarget {
  readonly skill: string;
  readonly repository: string;
  readonly sourcePath: string;
  readonly profiles: readonly string[];
  readonly sharedProfiles: readonly string[];
  readonly relativeTarget: string;
  readonly absoluteTarget: string;
  readonly sourceDigest: string;
  readonly installedDigest: string | null;
  readonly state: SkillTargetState;
  readonly action: SkillTargetAction;
  readonly requiredByPinnedChange: boolean;
  readonly reason?: string;
}

export interface SkillHostInstallTarget {
  readonly host: SkillInstallHostId;
  readonly skill: string;
  readonly repository: string;
  /** Complete source skill directory relative to its source repository root. */
  readonly sourcePath: string;
  readonly sourceDigest: string;
  readonly installedDigest: string | null;
  readonly relativeTarget: string;
  readonly absoluteTarget: string;
  readonly state: SkillTargetState | "shared" | "undiscoverable";
  readonly action: SkillTargetAction;
  readonly reason?: string;
}

export interface SkillInstallHostDescriptor {
  readonly host: SkillInstallHostId;
  readonly label: string;
  /** Absolute project-local skill root; null only for an unsupported host. */
  readonly destination: string | null;
  /** Whether this host applies an external project-trust gate Opsx cannot inspect or grant. */
  readonly trust: "external" | "not-required";
  readonly trustNote?: string;
  readonly discoverability: "verified" | "unsupported";
  readonly state: SkillInstallHostState;
  readonly action: SkillTargetAction;
  readonly reason?: string;
  readonly targets: readonly SkillHostInstallTarget[];
}

export interface SkillInstallRequestSnapshot {
  readonly projectRoot: string;
  readonly schemaRoot: string;
  readonly profiles: readonly string[];
  readonly skillHosts: readonly SkillInstallHostId[];
  readonly skillBundle: SkillBundle;
  readonly requiredTargets: readonly string[];
  readonly profileManifestPath: string;
}

export interface SkillInstallPlan {
  readonly kind: "skill-install";
  readonly version: 1;
  readonly inputDigest: string;
  readonly freshness: { readonly status: "current"; readonly digest: string };
  readonly manifestDigests: {
    readonly agentProfiles: string;
    readonly schemaSkills: string;
    readonly skillBundles: string | null;
  };
  readonly canApply: boolean;
  readonly request: SkillInstallRequestSnapshot;
  readonly targets: readonly SkillInstallTarget[];
  readonly skillHosts: readonly SkillInstallHostDescriptor[];
  readonly diagnostics: readonly ResourceDiagnostic[];
}

export interface SkillInstallResult {
  readonly applied: boolean;
  readonly installedTargets: readonly string[];
  readonly unchangedTargets: readonly string[];
  readonly inputDigest: string;
}

export interface SkillDisableRequest {
  readonly projectRoot: string;
  /** Exact project-relative installed skill directory. */
  readonly target: string;
  /** Optional caller assertion; the resource API independently derives and verifies the guard. */
  readonly requiredTargets?: readonly string[];
}

export interface SkillDisableRequestSnapshot {
  readonly projectRoot: string;
  readonly target: string;
  readonly requiredTargets: readonly string[];
  readonly pinGuard: RequiredSkillTargets;
  readonly profileManifestPath: string;
}

export interface SkillDisablePlan {
  readonly kind: "skill-disable";
  readonly version: 1;
  readonly inputDigest: string;
  readonly freshness: { readonly status: "current"; readonly digest: string };
  readonly canApply: boolean;
  readonly request: SkillDisableRequestSnapshot;
  readonly targetState: SkillTargetState;
  readonly absoluteTarget: string;
  readonly sharedProfiles: readonly string[];
  readonly requiredByPinnedChange: boolean;
  readonly pinGuardComplete: boolean;
  readonly diagnostics: readonly ResourceDiagnostic[];
}

export interface SkillDisableResult {
  readonly applied: true;
  readonly removedTarget: string;
  readonly inputDigest: string;
}

interface OwnershipEntry {
  readonly digest: string;
  readonly skill: string;
  readonly repository: string;
  readonly sourcePath: string;
  readonly profiles: readonly string[];
  readonly hosts?: readonly SkillInstallHostId[];
}

interface OwnershipData {
  schemaVersion: 1;
  resources: Record<string, OwnershipEntry>;
}

interface OwnershipSnapshot {
  data: OwnershipData;
  raw: string | null;
  digest: string | null;
}

interface SourceBundle {
  readonly roots: Map<string, string>;
  readonly temporaryRoot: string | null;
}

interface SchemaSkillManifest {
  readonly text: string;
  readonly digest: string;
  readonly bundleText: string | null;
  readonly bundleDigest: string | null;
}

interface InstallState {
  readonly plan: SkillInstallPlan;
  readonly request: SkillInstallRequestSnapshot;
  readonly root: string;
  readonly profiles: readonly AgentProfile[];
  readonly declarations: readonly SkillDeclaration[];
  readonly sources: ReadonlyMap<string, string>;
  readonly ownership: OwnershipSnapshot;
}

interface PreparedInstall extends InstallState {
  readonly cleanup: () => Promise<void>;
}

interface PathState {
  readonly kind:
    | "missing"
    | "symlink"
    | "parent-conflict"
    | "directory"
    | "file"
    | "other";
  readonly absolute: string;
}

interface CreatedEntry {
  readonly path: string;
  readonly directory: boolean;
  readonly dev: number;
  readonly ino: number;
  readonly digest?: string;
}

function fail(code: string, message: string, details?: unknown): never {
  throw new ResourceError(code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function safeName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function safeRepository(value: string): boolean {
  const parts = value.split("/");
  return (
    parts.length === 2 &&
    parts.every(
      (part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..",
    )
  );
}

function safeRelative(value: string): boolean {
  if (
    !value ||
    /[\0-\x1f\x7f\s]/.test(value) ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  )
    return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function safeTargetDirectory(value: string): boolean {
  return (
    safeRelative(value) &&
    value.split("/").every((part) => /^[A-Za-z0-9_.-]+$/.test(part))
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freeze(child);
  }
  return value;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function inputDigest(value: unknown): string {
  return sha256(JSON.stringify(value));
}

async function lstatOrNull(
  file: string,
): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(file);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function profileManifestPath(override?: string): string {
  return path.resolve(override ?? DEFAULT_AGENT_MANIFEST);
}

async function readProfiles(
  manifestPath: string,
): Promise<{ profiles: AgentProfile[]; digest: string }> {
  let raw: string;
  try {
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink())
      fail(
        "PROFILE_MANIFEST_UNSAFE",
        `Agent profile manifest is not a regular file: ${manifestPath}`,
      );
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error instanceof ResourceError) throw error;
    if (isMissing(error))
      fail(
        "PROFILE_MANIFEST_MISSING",
        `Agent profile manifest is unavailable: ${manifestPath}`,
      );
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail(
      "PROFILE_MANIFEST_INVALID",
      "Agent profile manifest must be valid JSON.",
    );
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.agents) ||
    Object.keys(value).some(
      (key) => key !== "schemaVersion" && key !== "agents",
    )
  ) {
    fail(
      "PROFILE_MANIFEST_INVALID",
      "Agent profile manifest must contain schemaVersion: 1 and an agents mapping.",
    );
  }
  const profiles: AgentProfile[] = [];
  for (const [id, rawProfile] of Object.entries(value.agents)) {
    if (
      !safeName(id) ||
      !isRecord(rawProfile) ||
      Object.keys(rawProfile).some((key) => key !== "label" && key !== "target")
    ) {
      fail("PROFILE_MANIFEST_INVALID", `Invalid named agent profile: ${id}`);
    }
    const { label, target } = rawProfile;
    if (
      typeof label !== "string" ||
      !label.trim() ||
      typeof target !== "string" ||
      !safeTargetDirectory(target)
    ) {
      fail(
        "PROFILE_MANIFEST_INVALID",
        `Invalid label or project-relative target for agent profile '${id}'.`,
      );
    }
    profiles.push({ id, label: label.trim(), target });
  }
  if (profiles.length === 0)
    fail(
      "PROFILE_MANIFEST_INVALID",
      "Agent profile manifest must declare at least one named agent.",
    );
  profiles.sort((left, right) => left.id.localeCompare(right.id));
  return { profiles, digest: sha256(raw) };
}

export async function loadAgentProfiles(
  manifestPath = DEFAULT_AGENT_MANIFEST,
): Promise<AgentProfile[]> {
  return (await readProfiles(path.resolve(manifestPath))).profiles;
}

export async function loadAgentProfileDigest(
  manifestPath = DEFAULT_AGENT_MANIFEST,
): Promise<string> {
  return (await readProfiles(path.resolve(manifestPath))).digest;
}

export function parseSkillsManifest(text: string): SkillDeclaration[] {
  const declarations: SkillDeclaration[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let repository: string;
    let sourcePath: string;
    if (line.includes("\t")) {
      const fields = line.split("\t");
      if (fields.length !== 2)
        fail(
          "RESOURCE_MANIFEST_INVALID",
          `Malformed skills.txt declaration: ${line}`,
        );
      repository = fields[0]!.trim();
      sourcePath = fields[1]!.trim();
    } else {
      if (!safeName(line))
        fail(
          "RESOURCE_MANIFEST_INVALID",
          `Malformed bare skill name in skills.txt: ${line}`,
        );
      repository = DEFAULT_SKILL_REPOSITORY;
      sourcePath = `.agents/skills/${line}`;
    }
    if (!safeRepository(repository) || !safeRelative(sourcePath)) {
      fail(
        "RESOURCE_MANIFEST_INVALID",
        `Malformed skills.txt declaration: ${line}`,
      );
    }
    const skill = path.posix.basename(sourcePath);
    if (!safeName(skill))
      fail(
        "RESOURCE_MANIFEST_INVALID",
        `Unsafe skill destination name: ${skill}`,
      );
    if (seen.has(skill))
      fail(
        "RESOURCE_MANIFEST_DUPLICATE",
        `Duplicate skill destination: ${skill}`,
      );
    seen.add(skill);
    declarations.push({ repository, path: sourcePath, skill });
  }
  return declarations;
}

const SKILL_BUNDLE_ORDER: readonly SkillBundle[] = [
  "default",
  "recommended",
  "all",
];

function skillTarget(skill: SkillDeclaration): string {
  return path.posix.join(".agents", "skills", skill.skill);
}

function parseBundleResource(value: unknown, bundle: string): SkillDeclaration {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "source" && key !== "path")
  ) {
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "Invalid resource in skill bundle " + bundle + ".",
    );
  }
  const repository = value.source;
  const sourcePath = value.path;
  if (
    typeof repository !== "string" ||
    !safeRepository(repository) ||
    typeof sourcePath !== "string" ||
    !safeRelative(sourcePath)
  ) {
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "Invalid source or path in skill bundle " + bundle + ".",
    );
  }
  const skill = path.posix.basename(sourcePath);
  if (!safeName(skill))
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "Unsafe skill destination in bundle " + bundle + ": " + skill,
    );
  return { repository, path: sourcePath, skill };
}

function resolveSkillBundles(
  skillsText: string,
  profilesText: string | null,
): Map<SkillBundle, SkillDeclaration[]> {
  const resolved = new Map<SkillBundle, SkillDeclaration[]>([
    ["default", parseSkillsManifest(skillsText)],
  ]);
  if (profilesText === null) return resolved;

  let value: unknown;
  try {
    value = JSON.parse(profilesText);
  } catch {
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "skill-profiles.yaml must contain strict JSON.",
    );
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.profiles) ||
    Object.keys(value).some(
      (key) => key !== "schemaVersion" && key !== "profiles",
    )
  ) {
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "skill-profiles.yaml must contain schemaVersion: 1 and a profiles mapping.",
    );
  }
  const profileDefinitions = value.profiles;
  if (!isRecord(profileDefinitions))
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "skill-profiles.yaml profiles must be a mapping.",
    );
  const profileNames = Object.keys(profileDefinitions);
  if (profileNames.some((name) => name !== "recommended" && name !== "all")) {
    fail(
      "RESOURCE_BUNDLE_MANIFEST_INVALID",
      "Only recommended and all skill bundles may be declared.",
    );
  }

  const visiting = new Set<SkillBundle>();
  const visit = (name: SkillBundle): SkillDeclaration[] => {
    const known = resolved.get(name);
    if (known) return known;
    const declaration = profileDefinitions[name];
    if (
      !isRecord(declaration) ||
      Object.keys(declaration).some(
        (key) => key !== "extends" && key !== "resources",
      ) ||
      !Array.isArray(declaration.extends) ||
      !Array.isArray(declaration.resources)
    ) {
      fail(
        "RESOURCE_BUNDLE_MANIFEST_INVALID",
        "Invalid skill bundle declaration: " + name,
      );
    }
    if (visiting.has(name))
      fail(
        "RESOURCE_BUNDLE_MANIFEST_INVALID",
        "Skill bundle inheritance cycle.",
      );
    visiting.add(name);
    const entries: SkillDeclaration[] = [];
    for (const parent of declaration.extends) {
      if (
        (parent !== "default" &&
          parent !== "recommended" &&
          parent !== "all") ||
        parent === name ||
        (parent !== "default" && !profileDefinitions[parent])
      ) {
        fail(
          "RESOURCE_BUNDLE_MANIFEST_INVALID",
          "Invalid skill bundle parent: " + String(parent),
        );
      }
      entries.push(...visit(parent));
    }
    for (const resource of declaration.resources)
      entries.push(parseBundleResource(resource, name));
    visiting.delete(name);

    const byTarget = new Map<string, SkillDeclaration>();
    for (const entry of entries) {
      const target = skillTarget(entry);
      const prior = byTarget.get(target);
      if (
        prior &&
        (prior.repository !== entry.repository || prior.path !== entry.path)
      ) {
        fail(
          "RESOURCE_TARGET_AMBIGUOUS",
          "Multiple skill sources declare destination " + target + ".",
        );
      }
      byTarget.set(target, entry);
    }
    const result = [...byTarget.values()].sort((left, right) =>
      skillTarget(left).localeCompare(skillTarget(right)),
    );
    resolved.set(name, result);
    return result;
  };

  for (const name of profileNames) visit(name as SkillBundle);
  return resolved;
}

export async function loadSkillBundles(
  schemaRoot: string,
): Promise<SkillBundleCatalog> {
  const root = await resolveDirectory(
    schemaRoot,
    "RESOURCE_SCHEMA_UNAVAILABLE",
  );
  const manifest = await readSchemaManifest(root);
  const resolved = resolveSkillBundles(manifest.text, manifest.bundleText);
  const declarations: Partial<
    Record<SkillBundle, readonly SkillDeclaration[]>
  > = {};
  for (const bundle of SKILL_BUNDLE_ORDER) {
    const entries = resolved.get(bundle);
    if (entries) declarations[bundle] = entries;
  }
  return freeze({
    bundles: SKILL_BUNDLE_ORDER.filter((bundle) => resolved.has(bundle)),
    declarations,
    manifestDigests: {
      skills: manifest.digest,
      profiles: manifest.bundleDigest,
    },
  });
}

function declarationsForBundle(
  manifest: SchemaSkillManifest,
  bundle: SkillBundle,
): SkillDeclaration[] {
  const declarations = resolveSkillBundles(
    manifest.text,
    manifest.bundleText,
  ).get(bundle);
  if (!declarations)
    fail(
      "PROFILE_UNDECLARED",
      "Skill bundle '" + bundle + "' is not declared for this schema.",
    );
  return declarations;
}

interface LocalPinScan {
  readonly pins: ActiveSkillPin[];
  readonly inputs: unknown[];
  readonly diagnostics: ResourceDiagnostic[];
}

async function scanLocalActivePins(root: string): Promise<LocalPinScan> {
  const pins: ActiveSkillPin[] = [];
  const inputs: unknown[] = [];
  const diagnostics: ResourceDiagnostic[] = [];
  const changesPath = "openspec/changes";
  const changesState = await stateAt(root, changesPath);
  if (changesState.kind === "missing")
    return { pins, inputs: [[changesPath, "missing"]], diagnostics };
  if (changesState.kind !== "directory") {
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_PIN_SCAN_FAILED",
      message:
        "Cannot safely inspect active schema pins at " +
        changesPath +
        ": " +
        changesState.kind +
        ".",
    });
    return { pins, inputs: [[changesPath, changesState.kind]], diagnostics };
  }

  let entries;
  try {
    entries = await readdir(changesState.absolute, { withFileTypes: true });
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_PIN_SCAN_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Could not read active change directories.",
    });
    return { pins, inputs: [[changesPath, "unreadable"]], diagnostics };
  }
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name === "archive") continue;
    if (!safeName(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message:
          "Cannot determine whether symlinked change " +
          entry.name +
          " pins a schema.",
      });
      inputs.push([entry.name, "symlink"]);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const metadataRelative =
      "openspec/changes/" + entry.name + "/.openspec.yaml";
    const metadataState = await stateAt(root, metadataRelative);
    if (metadataState.kind === "missing") {
      inputs.push([entry.name, "no-metadata"]);
      continue;
    }
    if (metadataState.kind !== "file") {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message:
          "Cannot safely inspect " +
          metadataRelative +
          ": " +
          metadataState.kind +
          ".",
      });
      inputs.push([entry.name, metadataState.kind]);
      continue;
    }
    let raw: string;
    let parsed: unknown;
    try {
      raw = await readFile(metadataState.absolute, "utf8");
      parsed = YAML.parse(raw);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message:
          "Cannot parse " +
          metadataRelative +
          ": " +
          (error instanceof Error ? error.message : "invalid YAML") +
          ".",
      });
      inputs.push([entry.name, "invalid-metadata"]);
      continue;
    }
    inputs.push([entry.name, sha256(raw)]);
    if (parsed == null) continue;
    if (!isRecord(parsed)) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message: metadataRelative + " must contain a YAML mapping.",
      });
      continue;
    }
    const schema = parsed.schema;
    if (schema == null) continue;
    if (typeof schema !== "string" || !safeName(schema)) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message: metadataRelative + " has an invalid schema pin.",
      });
      continue;
    }
    pins.push({ change: entry.name, schema });
  }
  return { pins, inputs, diagnostics };
}

/** Derive the current active change pins. Unknown profile/bundle associations fail closed. */
export async function requiredSkillTargets(
  projectRoot: string,
  options: ResourceRuntimeOptions = {},
): Promise<RequiredSkillTargets> {
  const root = await projectRootPath(projectRoot);
  const profilePath = profileManifestPathFn(options.profileManifestPath);
  const diagnostics: ResourceDiagnostic[] = [];
  const targets = new Set<string>();
  const activePins: ActiveSkillPin[] = [];
  const inputs: unknown[] = [];
  let profileDigest: string | null = null;
  try {
    profileDigest = (await readProfiles(profilePath)).digest;
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code:
        error instanceof ResourceError
          ? error.code
          : "PROFILE_MANIFEST_INVALID",
      message:
        error instanceof Error
          ? error.message
          : "Agent profile manifest is unavailable.",
    });
  }

  if (options.resolveActivePins) {
    try {
      activePins.push(...(await options.resolveActivePins(root)));
      inputs.push(["resolver", activePins]);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_SCAN_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Active schema pin resolver failed.",
      });
    }
  } else {
    const scan = await scanLocalActivePins(root);
    activePins.push(...scan.pins);
    inputs.push(["local-pins", scan.inputs]);
    diagnostics.push(...scan.diagnostics);
    if (scan.pins.length > 0) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
        message:
          "Active changes pin schemas, but the project does not record the selected agent profiles or skill bundle for those pins; skill disable is blocked.",
      });
    }
  }

  if (options.resolveActivePins) {
    let profileFile: { profiles: AgentProfile[]; digest: string } | null = null;
    try {
      profileFile = await readProfiles(profilePath);
      profileDigest = profileFile.digest;
    } catch {
      // The profile manifest diagnostic was recorded above; no target mapping can be trusted.
    }
    const profileMap = new Map(
      (profileFile?.profiles ?? []).map((profile) => [profile.id, profile]),
    );
    for (const pin of activePins) {
      if (
        !pin ||
        typeof pin.schema !== "string" ||
        !safeName(pin.schema) ||
        (pin.change !== undefined &&
          (typeof pin.change !== "string" || !safeName(pin.change))) ||
        (pin.revisionDigest !== undefined &&
          (typeof pin.revisionDigest !== "string" ||
            !DIGEST_RE.test(pin.revisionDigest)))
      ) {
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_PIN_SCAN_FAILED",
          message:
            "The active pin resolver returned malformed schema identity.",
        });
        continue;
      }
      if (!pin.schemaRoot) {
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
          message:
            "Active schema pin '" +
            pin.schema +
            "' has no exact schema manifest root.",
        });
        continue;
      }
      let manifest: SchemaSkillManifest;
      let declarations: SkillDeclaration[];
      try {
        const schemaRoot = await resolveDirectory(
          pin.schemaRoot,
          "RESOURCE_SCHEMA_UNAVAILABLE",
        );
        manifest = await readSchemaManifest(schemaRoot);
        const bundle = pin.skillBundle ?? "default";
        declarations = declarationsForBundle(manifest, bundle);
        inputs.push([
          pin.change ?? null,
          pin.schema,
          pin.revisionDigest ?? null,
          manifest.digest,
          manifest.bundleDigest,
          bundle,
        ]);
      } catch (error) {
        diagnostics.push({
          severity: "error",
          code:
            error instanceof ResourceError
              ? error.code
              : "RESOURCE_SCHEMA_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "Could not read active schema '" + pin.schema + "'.",
        });
        continue;
      }
      if (
        !Array.isArray(pin.profiles) ||
        !Array.isArray(pin.skillHosts) ||
        new Set(pin.profiles).size !== pin.profiles.length ||
        new Set(pin.skillHosts).size !== pin.skillHosts.length ||
        pin.skillHosts.some((host) => !isSkillInstallHostId(host)) ||
        (declarations.length > 0 &&
          pin.profiles.length === 0 &&
          pin.skillHosts.length === 0)
      ) {
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
          message:
            "Active schema pin '" +
            pin.schema +
            "' does not have a verified agent-profile and native skill-host selection.",
        });
        continue;
      }
      if (declarations.length === 0) continue;
      if (!profileFile && pin.profiles.length > 0) continue;
      for (const profileId of pin.profiles) {
        const profile = profileMap.get(profileId);
        if (!profile) {
          diagnostics.push({
            severity: "error",
            code: "PROFILE_UNDECLARED",
            message:
              "Active schema pin '" +
              pin.schema +
              "' references undeclared agent profile '" +
              profileId +
              "'.",
          });
          continue;
        }
        for (const declaration of declarations) {
          try {
            targets.add(
              normalizeTarget(
                root,
                path.posix.join(profile.target, declaration.skill),
              ),
            );
          } catch (error) {
            diagnostics.push({
              severity: "error",
              code:
                error instanceof ResourceError
                  ? error.code
                  : "RESOURCE_TARGET_UNSAFE",
              message:
                error instanceof Error
                  ? error.message
                  : "An active skill target is unsafe.",
            });
          }
        }
      }
      for (const host of pin.skillHosts as readonly SkillInstallHostId[]) {
        for (const declaration of declarations) {
          try {
            targets.add(
              normalizeTarget(
                root,
                path.posix.join(
                  SKILL_HOST_CONTRACTS[host].relativeDestination,
                  declaration.skill,
                ),
              ),
            );
          } catch (error) {
            diagnostics.push({
              severity: "error",
              code:
                error instanceof ResourceError
                  ? error.code
                  : "RESOURCE_TARGET_UNSAFE",
              message:
                error instanceof Error
                  ? error.message
                  : "An active skill target is unsafe.",
            });
          }
        }
      }
    }
  }

  const sortedTargets = [...targets].sort();
  const pinSummary = activePins.map(({ change, schema, revisionDigest }) => ({
    ...(change ? { change } : {}),
    schema,
    ...(revisionDigest ? { revisionDigest } : {}),
  }));
  const complete = diagnostics.length === 0;
  const digest = inputDigest({
    projectRoot: root,
    profileDigest,
    inputs,
    activePins: pinSummary,
    targets: sortedTargets,
    complete,
    diagnostics,
  });
  return freeze({
    complete,
    targets: sortedTargets,
    activePins: pinSummary,
    digest,
    diagnostics,
  });
}

/** Read-only audit of managed skill ownership, on-disk integrity, sharing, and active-pin guards. */
export async function doctorSkills(
  projectRoot: string,
  options: ResourceRuntimeOptions = {},
): Promise<InstalledSkillsReport> {
  const root = await projectRootPath(projectRoot);
  const pinGuard = await requiredSkillTargets(root, options);
  const profilePath = profileManifestPathFn(options.profileManifestPath);
  const [profileFile, ownership] = await Promise.all([
    readProfiles(profilePath),
    readOwnership(root),
  ]);
  const diagnostics: ResourceDiagnostic[] = [...pinGuard.diagnostics];
  const sharedTargets = new Map(
    profileFile.profiles.map((profile) => [
      profile.target,
      profileFile.profiles
        .filter((item) => item.target === profile.target)
        .map((item) => item.id)
        .sort(),
    ]),
  );
  const targets: InstalledSkillTarget[] = [];
  for (const [target, owner] of Object.entries(ownership.data.resources).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const absoluteTarget = path.join(root, ...target.split("/"));
    const pathState = await stateAt(root, target);
    let state: SkillTargetState;
    let actualDigest: string | null = null;
    if (pathState.kind === "missing") {
      state = "missing";
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_OWNED_MISSING",
        message: "Managed skill target is missing from disk.",
        target,
      });
    } else if (pathState.kind === "symlink") {
      state = "symlink";
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_SYMLINK",
        message: "Managed skill target is a symlink.",
        target,
      });
    } else if (pathState.kind === "parent-conflict") {
      state = "parent-conflict";
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_TARGET_CONFLICT",
        message: "A managed skill target parent is not a directory.",
        target,
      });
    } else if (pathState.kind !== "directory") {
      state = "file";
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_TARGET_CONFLICT",
        message: "Managed skill target is not a directory.",
        target,
      });
    } else {
      try {
        actualDigest = await digestTree(pathState.absolute);
        state = actualDigest === owner.digest ? "owned" : "modified";
        if (state === "modified")
          diagnostics.push({
            severity: "error",
            code: "RESOURCE_OWNED_DRIFT",
            message: "Managed skill bytes differ from the ownership record.",
            target,
          });
      } catch (error) {
        state =
          error instanceof ResourceError && error.code === "RESOURCE_SYMLINK"
            ? "symlink"
            : "modified";
        diagnostics.push({
          severity: "error",
          code:
            error instanceof ResourceError
              ? error.code
              : "RESOURCE_TARGET_UNSAFE",
          message:
            error instanceof Error
              ? error.message
              : "Managed skill target is unsafe.",
          target,
        });
      }
    }
    const sharedProfiles = sharedTargets.get(path.posix.dirname(target)) ?? [];
    const requiredByPinnedChange =
      pinGuard.complete && pinGuard.targets.includes(target);
    targets.push({
      target,
      absoluteTarget,
      skill: owner.skill,
      repository: owner.repository,
      sourcePath: owner.sourcePath,
      profiles: owner.profiles,
      sharedProfiles,
      expectedDigest: owner.digest,
      actualDigest,
      state,
      requiredByPinnedChange,
    });
  }
  const ownedTargets = new Set(Object.keys(ownership.data.resources));
  for (const target of pinGuard.targets) {
    if (ownedTargets.has(target)) continue;
    const state = await stateAt(root, target);
    diagnostics.push({
      severity: "error",
      code:
        state.kind === "missing"
          ? "RESOURCE_REQUIRED_SKILL_MISSING"
          : "RESOURCE_REQUIRED_SKILL_UNMANAGED",
      message:
        state.kind === "missing"
          ? "An active pinned schema requires a skill target that is not installed."
          : "An active pinned schema target is not present in the managed ownership record.",
      target,
    });
  }
  return freeze({
    schemaVersion: 1,
    projectRoot: root,
    complete: pinGuard.complete && diagnostics.length === 0,
    required: pinGuard,
    targets,
    diagnostics,
  });
}

async function resolveDirectory(input: string, code: string): Promise<string> {
  const absolute = path.resolve(input);
  const info = await lstatOrNull(absolute);
  if (!info || info.isSymbolicLink() || !info.isDirectory())
    fail(code, `Expected a real directory: ${absolute}`);
  return realpath(absolute);
}

async function readSchemaManifest(
  schemaRoot: string,
): Promise<SchemaSkillManifest> {
  const manifest = path.join(schemaRoot, "skills.txt");
  const info = await lstatOrNull(manifest);
  if (info && (info.isSymbolicLink() || !info.isFile()))
    fail(
      "RESOURCE_MANIFEST_UNSAFE",
      "Schema skills.txt is not a regular file: " + manifest,
    );
  const text = info ? await readFile(manifest, "utf8") : "";
  const bundleManifest = path.join(schemaRoot, "skill-profiles.yaml");
  const bundleInfo = await lstatOrNull(bundleManifest);
  if (bundleInfo && (bundleInfo.isSymbolicLink() || !bundleInfo.isFile())) {
    fail(
      "RESOURCE_MANIFEST_UNSAFE",
      "Schema skill-profiles.yaml is not a regular file: " + bundleManifest,
    );
  }
  const bundleText = bundleInfo ? await readFile(bundleManifest, "utf8") : null;
  return {
    text,
    digest: sha256(text),
    bundleText,
    bundleDigest: bundleText === null ? null : sha256(bundleText),
  };
}

function normalizeTarget(root: string, target: string): string {
  if (path.isAbsolute(target) || path.win32.isAbsolute(target)) {
    const relative = path.relative(root, path.resolve(target));
    if (
      !relative ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      fail(
        "RESOURCE_TARGET_UNSAFE",
        `Target is outside the project: ${target}`,
      );
    target = relative.split(path.sep).join("/");
  }
  if (!safeTargetDirectory(target))
    fail(
      "RESOURCE_TARGET_UNSAFE",
      `Unsafe project-relative skill target: ${target}`,
    );
  return target;
}

async function stateAt(root: string, relative: string): Promise<PathState> {
  const parts = relative.split("/");
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]!);
    const info = await lstatOrNull(current);
    if (!info) return { kind: "missing", absolute: current };
    if (info.isSymbolicLink()) return { kind: "symlink", absolute: current };
    const final = index === parts.length - 1;
    if (!final && !info.isDirectory())
      return { kind: "parent-conflict", absolute: current };
    if (final) {
      if (info.isDirectory()) return { kind: "directory", absolute: current };
      if (info.isFile()) return { kind: "file", absolute: current };
      return { kind: "other", absolute: current };
    }
  }
  return { kind: "missing", absolute: path.join(root, relative) };
}

function hostStateFromPath(state: PathState): SkillInstallHostState {
  if (state.kind === "directory") return "ready";
  if (state.kind === "missing") return "missing";
  if (state.kind === "symlink") return "symlink";
  if (state.kind === "parent-conflict") return "parent-conflict";
  return "file";
}

function hostStateRefuses(state: SkillInstallHostState): boolean {
  return (
    state === "shared" ||
    state === "unsupported" ||
    state === "symlink" ||
    state === "file" ||
    state === "parent-conflict" ||
    state === "undiscoverable"
  );
}

async function sameDirectory(
  left: PathState,
  right: PathState,
): Promise<boolean> {
  if (left.kind !== "directory" || right.kind !== "directory") return false;
  const [leftInfo, rightInfo] = await Promise.all([
    lstat(left.absolute),
    lstat(right.absolute),
  ]);
  return leftInfo.dev === rightInfo.dev && leftInfo.ino === rightInfo.ino;
}

async function buildSkillHostCatalog(
  root: string,
  profiles: readonly AgentProfile[],
): Promise<SkillInstallHostDescriptor[]> {
  const hosts = Object.entries(SKILL_HOST_CONTRACTS).map(
    ([host, contract]) => ({
      host: host as SkillInstallHostId,
      contract,
      destination: path.join(root, ...contract.relativeDestination.split("/")),
    }),
  );
  const rootStates = await Promise.all(
    hosts.map(({ contract }) => stateAt(root, contract.relativeDestination)),
  );
  const profileStates = await Promise.all(
    profiles.map((profile) => stateAt(root, profile.target)),
  );
  const sharedHosts = new Set<SkillInstallHostId>();
  for (let left = 0; left < hosts.length; left += 1) {
    for (let right = left + 1; right < hosts.length; right += 1) {
      if (
        hosts[left]!.contract.relativeDestination ===
          hosts[right]!.contract.relativeDestination ||
        (await sameDirectory(rootStates[left]!, rootStates[right]!))
      ) {
        sharedHosts.add(hosts[left]!.host);
        sharedHosts.add(hosts[right]!.host);
      }
    }
    for (
      let profileIndex = 0;
      profileIndex < profiles.length;
      profileIndex += 1
    ) {
      if (
        hosts[left]!.contract.relativeDestination ===
          profiles[profileIndex]!.target ||
        (await sameDirectory(rootStates[left]!, profileStates[profileIndex]!))
      ) {
        sharedHosts.add(hosts[left]!.host);
      }
    }
  }
  return hosts.map<SkillInstallHostDescriptor>(
    ({ host, contract, destination }, index) => {
      const pathState = rootStates[index]!;
      const nativeState = hostStateFromPath(pathState);
      const state: SkillInstallHostState =
        nativeState === "symlink" ||
        nativeState === "file" ||
        nativeState === "parent-conflict"
          ? nativeState
          : sharedHosts.has(host)
            ? "shared"
            : nativeState;
      const reason =
        state === "shared"
          ? "This host skill root aliases another host or an agent-profile target."
          : state === "symlink"
            ? "The host skill root contains a symlink."
            : state === "file"
              ? "A non-directory resource exists at the host skill root."
              : state === "parent-conflict"
                ? "A non-directory resource exists in a host skill-root parent."
                : undefined;
      const trustNote =
        contract.trust === "external"
          ? `Project trust is controlled by ${contract.label}; Opsx cannot verify or grant it.`
          : undefined;
      return {
        host,
        label: contract.label,
        destination,
        trust: contract.trust,
        ...(trustNote ? { trustNote } : {}),
        discoverability: "verified",
        state,
        action: hostStateRefuses(state) ? "refuse" : "noop",
        ...(reason ? { reason } : {}),
        targets: [],
      };
    },
  );
}

/** Discover the project-local skill hosts and verify their exact roots without writing files. */
export async function discoverSkillInstallHosts(
  projectRoot: string,
  options: ResourceRuntimeOptions = {},
): Promise<readonly SkillInstallHostDescriptor[]> {
  const root = await projectRootPath(projectRoot);
  const profileFile = await readProfiles(
    profileManifestPathFn(options.profileManifestPath),
  );
  return freeze(await buildSkillHostCatalog(root, profileFile.profiles));
}

async function digestTree(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (current: string, relative: string): Promise<void> => {
    const names = (await readdir(current)).sort((left, right) =>
      left.localeCompare(right),
    );
    for (const name of names) {
      const child = path.join(current, name);
      const childRelative = relative ? `${relative}/${name}` : name;
      const info = await lstat(child);
      if (info.isSymbolicLink())
        fail(
          "RESOURCE_SYMLINK",
          `Skill directory contains a symlink: ${childRelative}`,
        );
      if (info.isDirectory()) {
        hash.update(`dir\0${childRelative}\0${info.mode & 0o777}\0`);
        await walk(child, childRelative);
      } else if (info.isFile()) {
        const bytes = await readFile(child);
        hash.update(
          `file\0${childRelative}\0${info.mode & 0o777}\0${bytes.byteLength}\0`,
        );
        hash.update(bytes);
      } else {
        fail(
          "RESOURCE_UNSUPPORTED_ENTRY",
          `Skill directory contains a non-file resource: ${childRelative}`,
        );
      }
    }
  };
  const rootInfo = await lstat(directory);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    fail(
      "RESOURCE_SYMLINK",
      `Skill source is not a real directory: ${directory}`,
    );
  hash.update(`root\0${rootInfo.mode & 0o777}\0`);
  await walk(directory, "");
  return hash.digest("hex");
}

async function safeSourceDirectory(
  repositoryRoot: string,
  sourcePath: string,
): Promise<string> {
  const root = await resolveDirectory(repositoryRoot, "RESOURCE_SOURCE_UNSAFE");
  let current = root;
  for (const part of sourcePath.split("/")) {
    current = path.join(current, part);
    const info = await lstatOrNull(current);
    if (!info || info.isSymbolicLink())
      fail(
        "RESOURCE_SOURCE_UNAVAILABLE",
        `Declared source directory is unavailable or symlinked: ${sourcePath}`,
      );
    if (
      current !== path.join(root, ...sourcePath.split("/")) &&
      !info.isDirectory()
    ) {
      fail(
        "RESOURCE_SOURCE_INVALID",
        `Declared source path is not a directory: ${sourcePath}`,
      );
    }
  }
  const final = await lstat(current);
  if (!final.isDirectory() || final.isSymbolicLink())
    fail(
      "RESOURCE_SOURCE_INVALID",
      `Declared source path is not a directory: ${sourcePath}`,
    );
  return current;
}

async function acquireSources(
  declarations: readonly SkillDeclaration[],
  options: ResourceRuntimeOptions,
): Promise<SourceBundle> {
  const repositories = [
    ...new Set(declarations.map((declaration) => declaration.repository)),
  ].sort();
  const roots = new Map<string, string>();
  const needsClone = repositories.filter(
    (repository) => !options.sourceRoots?.[repository],
  );
  let temporaryRoot: string | null = null;
  if (needsClone.length > 0) {
    temporaryRoot = await mkdtemp(
      path.join(tmpdir(), "opsx-schema-resources-"),
    );
    await mkdir(path.join(temporaryRoot, "home"), {
      recursive: true,
      mode: 0o700,
    });
  }
  try {
    for (const repository of repositories) {
      const fixture = options.sourceRoots?.[repository];
      if (fixture) {
        roots.set(
          repository,
          await resolveDirectory(fixture, "RESOURCE_SOURCE_UNSAFE"),
        );
        continue;
      }
      const destination = path.join(temporaryRoot!, `repo-${roots.size}`);
      const result = spawnSync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--no-tags",
          "--quiet",
          `https://github.com/${repository}.git`,
          destination,
        ],
        {
          encoding: "utf8",
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: path.join(temporaryRoot!, "home"),
            GIT_TERMINAL_PROMPT: "0",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL:
              process.platform === "win32" ? "NUL" : "/dev/null",
            GIT_CONFIG_COUNT: "0",
          },
        },
      );
      if (result.error || result.status !== 0)
        fail(
          "RESOURCE_SOURCE_UNAVAILABLE",
          `Could not acquire skill source ${repository}.`,
        );
      roots.set(
        repository,
        await resolveDirectory(destination, "RESOURCE_SOURCE_UNSAFE"),
      );
    }
    return { roots, temporaryRoot };
  } catch (error) {
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function readOwnership(root: string): Promise<OwnershipSnapshot> {
  const pathState = await stateAt(root, OWNERSHIP_FILE);
  if (pathState.kind === "missing")
    return {
      data: { schemaVersion: 1, resources: {} },
      raw: null,
      digest: null,
    };
  if (
    pathState.kind === "symlink" ||
    pathState.kind === "parent-conflict" ||
    pathState.kind !== "file"
  ) {
    fail(
      "RESOURCE_OWNERSHIP_UNSAFE",
      `Ownership file path is unsafe: ${OWNERSHIP_FILE}`,
    );
  }
  const raw = await readFile(pathState.absolute, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail(
      "RESOURCE_OWNERSHIP_CORRUPT",
      "Managed resource ownership file is not valid JSON.",
    );
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.resources) ||
    Object.keys(value).some(
      (key) => key !== "schemaVersion" && key !== "resources",
    )
  ) {
    fail(
      "RESOURCE_OWNERSHIP_CORRUPT",
      "Managed resource ownership file has an unsupported shape.",
    );
  }
  const resources: Record<string, OwnershipEntry> = {};
  for (const [target, item] of Object.entries(value.resources)) {
    if (
      !safeTargetDirectory(target) ||
      !isRecord(item) ||
      Object.keys(item).some(
        (key) =>
          ![
            "digest",
            "skill",
            "repository",
            "sourcePath",
            "profiles",
            "hosts",
          ].includes(key),
      )
    ) {
      fail(
        "RESOURCE_OWNERSHIP_CORRUPT",
        `Invalid resource ownership entry: ${target}`,
      );
    }
    if (
      typeof item.digest !== "string" ||
      !DIGEST_RE.test(item.digest) ||
      typeof item.skill !== "string" ||
      !safeName(item.skill) ||
      typeof item.repository !== "string" ||
      !safeRepository(item.repository) ||
      typeof item.sourcePath !== "string" ||
      !safeRelative(item.sourcePath) ||
      !Array.isArray(item.profiles) ||
      item.profiles.some(
        (profile) => typeof profile !== "string" || !safeName(profile),
      ) ||
      (item.hosts !== undefined &&
        (!Array.isArray(item.hosts) ||
          item.hosts.some(
            (host) =>
              typeof host !== "string" ||
              !Object.hasOwn(SKILL_HOST_CONTRACTS, host),
          ) ||
          new Set(item.hosts).size !== item.hosts.length))
    ) {
      fail(
        "RESOURCE_OWNERSHIP_CORRUPT",
        `Invalid resource ownership metadata: ${target}`,
      );
    }
    const hosts = item.hosts as SkillInstallHostId[] | undefined;
    resources[target] = {
      digest: item.digest,
      skill: item.skill,
      repository: item.repository,
      sourcePath: item.sourcePath,
      profiles: [...item.profiles].sort(),
      ...(hosts ? { hosts: [...hosts].sort() } : {}),
    };
  }
  return { data: { schemaVersion: 1, resources }, raw, digest: sha256(raw) };
}

async function projectRootPath(input: string): Promise<string> {
  return resolveDirectory(input, "PROJECT_NOT_FOUND");
}

async function normalizeInstallRequest(
  input: SkillInstallRequest,
  options: ResourceRuntimeOptions,
): Promise<SkillInstallRequestSnapshot> {
  const root = await projectRootPath(input.projectRoot);
  const schemaRoot = await resolveDirectory(
    input.schemaRoot,
    "RESOURCE_SCHEMA_UNAVAILABLE",
  );
  if (!Array.isArray(input.profiles))
    fail(
      "PROFILE_SELECTION_INVALID",
      "Agent profile selection must be an array.",
    );
  if (input.skillHosts !== undefined && !Array.isArray(input.skillHosts))
    fail(
      "SKILL_HOST_SELECTION_INVALID",
      "Skill-host selection must be an array.",
    );
  const rawHosts = input.skillHosts ?? [];
  if (
    rawHosts.some(
      (host) =>
        typeof host !== "string" || !Object.hasOwn(SKILL_HOST_CONTRACTS, host),
    )
  ) {
    fail(
      "SKILL_HOST_SELECTION_INVALID",
      "Skill-host selection contains an unsupported host.",
    );
  }
  const skillHosts = [...rawHosts].sort();
  if (new Set(skillHosts).size !== skillHosts.length)
    fail(
      "SKILL_HOST_SELECTION_INVALID",
      "Skill-host selection must contain unique hosts.",
    );
  if (input.profiles.length === 0 && skillHosts.length === 0)
    fail(
      "PROFILE_SELECTION_INVALID",
      "Select at least one agent profile or skill host.",
    );
  const profileManifestPath = profileManifestPathFn(
    options.profileManifestPath,
  );
  const profiles = [...new Set(input.profiles)].sort();
  if (
    profiles.length !== input.profiles.length ||
    profiles.some(
      (profile) => typeof profile !== "string" || !safeName(profile),
    )
  ) {
    fail(
      "PROFILE_SELECTION_INVALID",
      "Profile selection must contain unique named agent ids.",
    );
  }
  const skillBundle = input.skillBundle ?? "default";
  if (
    skillBundle !== "default" &&
    skillBundle !== "recommended" &&
    skillBundle !== "all"
  ) {
    fail(
      "SKILL_BUNDLE_INVALID",
      "Skill bundle must be default, recommended, or all.",
    );
  }
  const requirements = (input.requiredTargets ?? []).map((target) =>
    normalizeTarget(root, target),
  );
  if (new Set(requirements).size !== requirements.length)
    fail(
      "PROFILE_SELECTION_INVALID",
      "Pinned required targets must be unique.",
    );
  return freeze({
    projectRoot: root,
    schemaRoot,
    profiles,
    skillHosts,
    skillBundle,
    requiredTargets: requirements.sort(),
    profileManifestPath,
  });
}

function profileManifestPathFn(override?: string): string {
  return path.resolve(override ?? DEFAULT_AGENT_MANIFEST);
}

async function hostArtifactIssue(
  host: SkillInstallHostId,
  skill: string,
  directory: string,
): Promise<string | undefined> {
  let contents: string;
  try {
    contents = await readFile(path.join(directory, "SKILL.md"), "utf8");
  } catch (error) {
    if (isMissing(error))
      return "The source artifact has no SKILL.md and is not discoverable by this host.";
    throw error;
  }
  const frontmatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
    contents,
  );
  if (!frontmatter) return "The source SKILL.md has no valid YAML frontmatter.";
  let metadata: unknown;
  try {
    metadata = YAML.parse(frontmatter[1]!);
  } catch {
    return "The source SKILL.md frontmatter is not valid YAML.";
  }
  if (
    !isRecord(metadata) ||
    typeof metadata.description !== "string" ||
    metadata.description.trim().length === 0
  ) {
    return "The host requires SKILL.md frontmatter with a non-empty description.";
  }
  if (
    host === "atomic" &&
    (typeof metadata.name !== "string" || metadata.name !== skill)
  ) {
    return "Atomic requires the SKILL.md name to match the installed skill directory.";
  }
  if (
    metadata.name !== undefined &&
    (typeof metadata.name !== "string" || metadata.name !== skill)
  ) {
    return "The SKILL.md name does not match the installed skill directory.";
  }
  return undefined;
}

async function buildInstallState(
  request: SkillInstallRequestSnapshot,
  sourceRoots: ReadonlyMap<string, string>,
): Promise<InstallState> {
  const [profileFile, manifest, ownership] = await Promise.all([
    readProfiles(request.profileManifestPath),
    readSchemaManifest(request.schemaRoot),
    readOwnership(request.projectRoot),
  ]);
  const hostCatalog = await buildSkillHostCatalog(
    request.projectRoot,
    profileFile.profiles,
  );
  const profileMap = new Map(
    profileFile.profiles.map((profile) => [profile.id, profile]),
  );
  const selectedProfiles = request.profiles.map((id) => {
    const profile = profileMap.get(id);
    if (!profile)
      fail(
        "PROFILE_UNDECLARED",
        "Agent profile '" + id + "' is not declared in opsx-schema.json.",
      );
    return profile;
  });
  const declarations = declarationsForBundle(manifest, request.skillBundle);
  const declarationDigests = new Map<string, string>();
  const declarationDirectories = new Map<string, string>();
  for (const declaration of declarations) {
    const repositoryRoot = sourceRoots.get(declaration.repository);
    if (!repositoryRoot)
      fail(
        "RESOURCE_SOURCE_STALE",
        `No acquired source directory for ${declaration.repository}.`,
      );
    const directory = await safeSourceDirectory(
      repositoryRoot,
      declaration.path,
    );
    declarationDirectories.set(
      `${declaration.repository}\0${declaration.path}`,
      directory,
    );
    declarationDigests.set(
      `${declaration.repository}\0${declaration.path}`,
      await digestTree(directory),
    );
  }

  const grouped = new Map<
    string,
    {
      declaration: SkillDeclaration;
      profiles: Set<string>;
      sharedProfiles: Set<string>;
    }
  >();
  for (const profile of selectedProfiles) {
    for (const declaration of declarations) {
      const relativeTarget = path.posix.join(profile.target, declaration.skill);
      const prior = grouped.get(relativeTarget);
      if (prior) {
        if (
          prior.declaration.repository !== declaration.repository ||
          prior.declaration.path !== declaration.path
        ) {
          fail(
            "RESOURCE_TARGET_AMBIGUOUS",
            `Profiles select different skill sources for ${relativeTarget}.`,
          );
        }
        prior.profiles.add(profile.id);
      } else {
        const aliases = profileFile.profiles
          .filter((candidate) => candidate.target === profile.target)
          .map((candidate) => candidate.id);
        grouped.set(relativeTarget, {
          declaration,
          profiles: new Set([profile.id]),
          sharedProfiles: new Set(aliases),
        });
      }
    }
  }

  const targets: SkillInstallTarget[] = [];
  const diagnostics: ResourceDiagnostic[] = [];
  for (const [relativeTarget, group] of [...grouped.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const absoluteTarget = path.join(
      request.projectRoot,
      ...relativeTarget.split("/"),
    );
    const pathState = await stateAt(request.projectRoot, relativeTarget);
    const owner = ownership.data.resources[relativeTarget];
    const sourceDigest = declarationDigests.get(
      `${group.declaration.repository}\0${group.declaration.path}`,
    )!;
    let state: SkillTargetState;
    let installedDigest: string | null = null;
    let action: SkillTargetAction;
    let reason: string | undefined;
    if (pathState.kind === "missing") {
      state = "missing";
      action = "install";
    } else if (pathState.kind === "symlink") {
      state = "symlink";
      action = "refuse";
      reason = "A symlink exists in the exact target path.";
    } else if (pathState.kind === "parent-conflict") {
      state = "parent-conflict";
      action = "refuse";
      reason = "A non-directory exists in a target parent path.";
    } else if (pathState.kind === "file" || pathState.kind === "other") {
      state = "file";
      action = "refuse";
      reason = "A non-directory resource already exists at the skill target.";
    } else {
      try {
        installedDigest = await digestTree(pathState.absolute);
        if (!owner) {
          state = "unmanaged";
          action = "refuse";
          reason = "An unmanaged skill directory already exists at the target.";
        } else if (owner.digest !== installedDigest) {
          state = "modified";
          action = "refuse";
          reason = "The managed skill differs from its ownership record.";
        } else if (installedDigest !== sourceDigest) {
          state = "owned";
          action = "refuse";
          reason =
            "The existing owned skill has different bytes; switching will not replace an installed skill.";
        } else {
          state = "owned";
          action = "noop";
        }
      } catch (error) {
        state =
          error instanceof ResourceError && error.code === "RESOURCE_SYMLINK"
            ? "symlink"
            : "modified";
        action = "refuse";
        reason =
          error instanceof Error ? error.message : "The target tree is unsafe.";
      }
    }
    const profiles = [...group.profiles].sort();
    const sharedProfiles = [...group.sharedProfiles].sort();
    const requiredByPinnedChange =
      request.requiredTargets.includes(relativeTarget);
    const target: SkillInstallTarget = {
      skill: group.declaration.skill,
      repository: group.declaration.repository,
      sourcePath: group.declaration.path,
      profiles,
      sharedProfiles,
      relativeTarget,
      absoluteTarget,
      sourceDigest,
      installedDigest,
      state,
      action,
      requiredByPinnedChange,
      ...(reason ? { reason } : {}),
    };
    targets.push(target);
    if (action === "refuse") {
      const code =
        state === "unmanaged"
          ? "RESOURCE_UNMANAGED_COLLISION"
          : state === "symlink"
            ? "RESOURCE_SYMLINK"
            : state === "modified"
              ? "RESOURCE_OWNED_DRIFT"
              : "RESOURCE_TARGET_CONFLICT";
      diagnostics.push({
        severity: "error",
        code,
        message: reason!,
        target: relativeTarget,
      });
    }
  }

  const skillHosts: SkillInstallHostDescriptor[] = [];
  for (const host of hostCatalog) {
    const hostTargets: SkillHostInstallTarget[] = [];
    if (request.skillHosts.includes(host.host)) {
      for (const declaration of declarations) {
        const relativeTarget = path.posix.join(
          SKILL_HOST_CONTRACTS[host.host].relativeDestination,
          declaration.skill,
        );
        const absoluteTarget = path.join(
          request.projectRoot,
          ...relativeTarget.split("/"),
        );
        const sourceKey = `${declaration.repository}\0${declaration.path}`;
        const sourceDigest = declarationDigests.get(sourceKey)!;
        const sourceDirectory = declarationDirectories.get(sourceKey)!;
        const pathState = await stateAt(request.projectRoot, relativeTarget);
        const owner = ownership.data.resources[relativeTarget];
        let installedDigest: string | null = null;
        let state: SkillHostInstallTarget["state"];
        let action: SkillTargetAction;
        let reason: string | undefined;

        if (hostStateRefuses(host.state)) {
          state =
            host.state === "shared"
              ? "shared"
              : host.state === "symlink"
                ? "symlink"
                : host.state === "parent-conflict"
                  ? "parent-conflict"
                  : host.state === "file"
                    ? "file"
                    : "undiscoverable";
          action = "refuse";
          reason = host.reason ?? "The host destination is not safe to write.";
        } else if (grouped.has(relativeTarget)) {
          state = "shared";
          action = "refuse";
          reason =
            "This exact skill target is also selected through an agent profile.";
        } else {
          const artifactIssue = await hostArtifactIssue(
            host.host,
            declaration.skill,
            sourceDirectory,
          );
          if (artifactIssue) {
            state = "undiscoverable";
            action = "refuse";
            reason = artifactIssue;
          } else if (pathState.kind === "missing") {
            state = "missing";
            action = "install";
          } else if (pathState.kind === "symlink") {
            state = "symlink";
            action = "refuse";
            reason = "A symlink exists in the exact host target path.";
          } else if (pathState.kind === "parent-conflict") {
            state = "parent-conflict";
            action = "refuse";
            reason = "A non-directory exists in a host target parent path.";
          } else if (pathState.kind === "file" || pathState.kind === "other") {
            state = "file";
            action = "refuse";
            reason =
              "A non-directory resource already exists at the host skill target.";
          } else {
            try {
              installedDigest = await digestTree(pathState.absolute);
              if (!owner) {
                state = "unmanaged";
                action = "refuse";
                reason =
                  "An unmanaged skill directory already exists at the host target.";
              } else if (
                owner.profiles.length > 0 ||
                !owner.hosts ||
                owner.hosts.length !== 1 ||
                owner.hosts[0] !== host.host
              ) {
                state = "shared";
                action = "refuse";
                reason =
                  "The target is owned by a different host or an agent profile.";
              } else if (owner.digest !== installedDigest) {
                state = "modified";
                action = "refuse";
                reason =
                  "The managed host skill differs from its ownership record.";
              } else if (installedDigest !== sourceDigest) {
                state = "owned";
                action = "refuse";
                reason =
                  "The owned host skill has different bytes; installation will not replace it.";
              } else {
                state = "owned";
                action = "noop";
              }
            } catch (error) {
              state =
                error instanceof ResourceError &&
                error.code === "RESOURCE_SYMLINK"
                  ? "symlink"
                  : "modified";
              action = "refuse";
              reason =
                error instanceof Error
                  ? error.message
                  : "The host target tree is unsafe.";
            }
          }
        }
        const target: SkillHostInstallTarget = {
          host: host.host,
          skill: declaration.skill,
          repository: declaration.repository,
          sourcePath: declaration.path,
          sourceDigest,
          installedDigest,
          relativeTarget,
          absoluteTarget,
          state,
          action,
          ...(reason ? { reason } : {}),
        };
        hostTargets.push(target);
        if (action === "refuse") {
          const code =
            state === "shared"
              ? "RESOURCE_HOST_SHARED"
              : state === "undiscoverable"
                ? "RESOURCE_HOST_UNDISCOVERABLE"
                : state === "unmanaged"
                  ? "RESOURCE_UNMANAGED_COLLISION"
                  : state === "symlink"
                    ? "RESOURCE_SYMLINK"
                    : state === "modified"
                      ? "RESOURCE_OWNED_DRIFT"
                      : "RESOURCE_TARGET_CONFLICT";
          diagnostics.push({
            severity: "error",
            code,
            message: reason!,
            target: relativeTarget,
          });
        }
      }
    }
    const targetRefusal = hostTargets.find(
      (target) => target.action === "refuse",
    );
    const blockedArtifact = hostTargets.some(
      (target) => target.state === "undiscoverable",
    );
    const blockedShared = hostTargets.some(
      (target) => target.state === "shared",
    );
    const state: SkillInstallHostState = blockedArtifact
      ? "undiscoverable"
      : blockedShared
        ? "shared"
        : host.state;
    const action: SkillTargetAction = targetRefusal
      ? "refuse"
      : hostTargets.some((target) => target.action === "install")
        ? "install"
        : host.action;
    skillHosts.push({
      ...host,
      state,
      action,
      ...(targetRefusal?.reason ? { reason: targetRefusal.reason } : {}),
      targets: hostTargets,
    });
  }
  const canonicalRequest = request;
  const digest = inputDigest({
    kind: "skill-install",
    request: canonicalRequest,
    profileManifestDigest: profileFile.digest,
    skillsManifestDigest: manifest.digest,
    skillProfilesManifestDigest: manifest.bundleDigest,
    ownershipDigest: ownership.digest,
    skillHosts: skillHosts.map((host) => ({
      host: host.host,
      destination: host.destination,
      trust: host.trust,
      trustNote: host.trustNote,
      discoverability: host.discoverability,
      state: host.state,
      action: host.action,
      reason: host.reason,
      targets: host.targets.map((target) => ({
        skill: target.skill,
        relativeTarget: target.relativeTarget,
        absoluteTarget: target.absoluteTarget,
        sourcePath: target.sourcePath,
        sourceDigest: target.sourceDigest,
        installedDigest: target.installedDigest,
        state: target.state,
        action: target.action,
        reason: target.reason,
      })),
    })),
    targets: targets.map((target) => ({
      relativeTarget: target.relativeTarget,
      profiles: target.profiles,
      sharedProfiles: target.sharedProfiles,
      repository: target.repository,
      sourcePath: target.sourcePath,
      sourceDigest: target.sourceDigest,
      installedDigest: target.installedDigest,
      state: target.state,
      action: target.action,
    })),
  });
  const plan: SkillInstallPlan = freeze({
    kind: "skill-install",
    version: 1,
    inputDigest: digest,
    freshness: { status: "current", digest },
    manifestDigests: {
      agentProfiles: profileFile.digest,
      schemaSkills: manifest.digest,
      skillBundles: manifest.bundleDigest,
    },
    canApply: diagnostics.length === 0,
    request: canonicalRequest,
    targets,
    skillHosts,
    diagnostics,
  });
  return {
    plan,
    request,
    root: request.projectRoot,
    profiles: profileFile.profiles,
    declarations,
    sources: sourceRoots,
    ownership,
  };
}

async function prepareInstall(
  input: SkillInstallRequest,
  options: ResourceRuntimeOptions,
): Promise<PreparedInstall> {
  const request = await normalizeInstallRequest(input, options);
  const manifest = await readSchemaManifest(request.schemaRoot);
  const declarations = declarationsForBundle(manifest, request.skillBundle);
  const bundle = await acquireSources(declarations, options);
  try {
    const state = await buildInstallState(request, bundle.roots);
    return {
      ...state,
      cleanup: async () => {
        if (bundle.temporaryRoot)
          await rm(bundle.temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (bundle.temporaryRoot)
      await rm(bundle.temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function previewSkillInstall(
  input: SkillInstallRequest,
  options: ResourceRuntimeOptions = {},
): Promise<SkillInstallPlan> {
  const prepared = await prepareInstall(input, options);
  try {
    return prepared.plan;
  } finally {
    await prepared.cleanup();
  }
}

async function ensureDirectories(
  root: string,
  relativeDirectory: string,
): Promise<void> {
  let current = root;
  for (const part of relativeDirectory.split("/")) {
    current = path.join(current, part);
    const info = await lstatOrNull(current);
    if (!info) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const after = await lstat(current);
    if (after.isSymbolicLink() || !after.isDirectory())
      fail("RESOURCE_PATH_UNSAFE", `Expected a real directory: ${current}`);
  }
}

async function acquireLock(root: string): Promise<() => Promise<void>> {
  await ensureDirectories(root, ".openspec/opsx-schema");
  const lockPath = path.join(root, LOCK_FILE);
  const token = `${randomUUID()}\n`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      fail("RESOURCE_LOCKED", "Another resource mutation owns resources.lock.");
    throw error;
  }
  await handle.writeFile(token, "utf8");
  await handle.sync();
  await handle.close();
  return async () => {
    try {
      const info = await lstat(lockPath);
      if (info.isSymbolicLink() || !info.isFile()) return;
      if ((await readFile(lockPath, "utf8")) === token) await unlink(lockPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  };
}

async function writeOwnership(
  root: string,
  ownership: OwnershipData,
  expectedRaw: string | null,
): Promise<string> {
  await ensureDirectories(root, ".openspec/opsx-schema");
  const file = path.join(root, OWNERSHIP_FILE);
  const current = await stateAt(root, OWNERSHIP_FILE);
  if (
    current.kind === "symlink" ||
    current.kind === "parent-conflict" ||
    (current.kind !== "missing" && current.kind !== "file")
  ) {
    fail(
      "RESOURCE_OWNERSHIP_UNSAFE",
      "Managed resource ownership file is unsafe.",
    );
  }
  const currentRaw =
    current.kind === "file" ? await readFile(file, "utf8") : null;
  if (currentRaw !== expectedRaw)
    fail("RESOURCE_STALE", "Managed resource ownership changed after preview.");
  const nextRaw = `${JSON.stringify(ownership, null, 2)}\n`;
  const temp = path.join(
    path.dirname(file),
    `.managed-resources-${randomUUID()}.tmp`,
  );
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(nextRaw, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const latest = await stateAt(root, OWNERSHIP_FILE);
    const latestRaw =
      latest.kind === "file" ? await readFile(file, "utf8") : null;
    if (
      latest.kind === "symlink" ||
      latest.kind === "parent-conflict" ||
      latestRaw !== expectedRaw
    ) {
      fail(
        "RESOURCE_STALE",
        "Managed resource ownership changed during mutation.",
      );
    }
    if (expectedRaw === null) {
      await link(temp, file);
      await unlink(temp);
    } else {
      await rename(temp, file);
    }
  } catch (error) {
    await unlink(temp).catch((cleanupError) => {
      if (!isMissing(cleanupError)) throw cleanupError;
    });
    throw error;
  }
  return nextRaw;
}

async function copyDirectoryContents(
  source: string,
  destination: string,
  created: CreatedEntry[],
): Promise<void> {
  const names = (await readdir(source)).sort((left, right) =>
    left.localeCompare(right),
  );
  for (const name of names) {
    const sourcePath = path.join(source, name);
    const destinationPath = path.join(destination, name);
    const sourceInfo = await lstat(sourcePath);
    if (sourceInfo.isSymbolicLink())
      fail(
        "RESOURCE_SYMLINK",
        `Skill source contains a symlink: ${sourcePath}`,
      );
    if (sourceInfo.isDirectory()) {
      await mkdir(destinationPath, { mode: sourceInfo.mode & 0o777 });
      const createdInfo = await lstat(destinationPath);
      created.push({
        path: destinationPath,
        directory: true,
        dev: createdInfo.dev,
        ino: createdInfo.ino,
      });
      await copyDirectoryContents(sourcePath, destinationPath, created);
      await chmod(destinationPath, sourceInfo.mode & 0o777);
    } else if (sourceInfo.isFile()) {
      await copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL);
      await chmod(destinationPath, sourceInfo.mode & 0o777);
      const createdInfo = await lstat(destinationPath);
      created.push({
        path: destinationPath,
        directory: false,
        dev: createdInfo.dev,
        ino: createdInfo.ino,
        digest: sha256(await readFile(destinationPath)),
      });
    } else {
      fail(
        "RESOURCE_UNSUPPORTED_ENTRY",
        `Skill source contains an unsupported filesystem entry: ${sourcePath}`,
      );
    }
  }
}

async function rollbackCreated(
  created: readonly CreatedEntry[],
): Promise<string[]> {
  const remaining: string[] = [];
  for (const entry of [...created].reverse()) {
    try {
      const info = await lstatOrNull(entry.path);
      if (!info) continue;
      if (
        info.isSymbolicLink() ||
        info.dev !== entry.dev ||
        info.ino !== entry.ino ||
        info.isDirectory() !== entry.directory
      ) {
        remaining.push(entry.path);
        continue;
      }
      if (entry.directory) {
        await rmdir(entry.path);
      } else {
        if (sha256(await readFile(entry.path)) !== entry.digest) {
          remaining.push(entry.path);
          continue;
        }
        await unlink(entry.path);
      }
    } catch {
      remaining.push(entry.path);
    }
  }
  return remaining;
}

async function installTarget(
  target: Pick<
    SkillInstallTarget,
    "relativeTarget" | "absoluteTarget" | "sourceDigest"
  >,
  sourceDirectory: string,
  root: string,
): Promise<CreatedEntry[]> {
  const parentRelative = path.posix.dirname(target.relativeTarget);
  await ensureDirectories(root, parentRelative);
  const before = await lstatOrNull(target.absoluteTarget);
  if (before)
    fail(
      "RESOURCE_STALE",
      "Skill target appeared after preview: " + target.relativeTarget,
    );
  const sourceInfo = await lstat(sourceDirectory);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
    fail(
      "RESOURCE_SOURCE_UNSAFE",
      "Skill source is not a real directory: " + sourceDirectory,
    );
  await mkdir(target.absoluteTarget, { mode: sourceInfo.mode & 0o777 });
  const rootInfo = await lstat(target.absoluteTarget);
  const created: CreatedEntry[] = [
    {
      path: target.absoluteTarget,
      directory: true,
      dev: rootInfo.dev,
      ino: rootInfo.ino,
    },
  ];
  try {
    await copyDirectoryContents(
      sourceDirectory,
      target.absoluteTarget,
      created,
    );
    await chmod(target.absoluteTarget, sourceInfo.mode & 0o777);
    if ((await digestTree(target.absoluteTarget)) !== target.sourceDigest)
      fail(
        "RESOURCE_SOURCE_STALE",
        "Source bytes changed while installing " + target.relativeTarget,
      );
  } catch (error) {
    const leftovers = await rollbackCreated(created);
    if (leftovers.length)
      fail(
        "RESOURCE_PARTIAL",
        "Failed to install " +
          target.relativeTarget +
          "; partial target remains.",
        { target: target.relativeTarget, partialPaths: leftovers },
      );
    throw error;
  }
  return created;
}

export async function applySkillInstall(
  plan: SkillInstallPlan,
  options: ResourceRuntimeOptions = {},
): Promise<SkillInstallResult> {
  if (plan.kind !== "skill-install" || plan.version !== 1)
    fail("RESOURCE_PLAN_INVALID", "Unsupported skill installation plan.");
  let currentProfiles: { profiles: AgentProfile[]; digest: string };
  let currentManifest: SchemaSkillManifest;
  try {
    [currentProfiles, currentManifest] = await Promise.all([
      readProfiles(plan.request.profileManifestPath),
      readSchemaManifest(plan.request.schemaRoot),
    ]);
  } catch {
    fail(
      "RESOURCE_STALE",
      "An agent or schema skill manifest changed or became unavailable after preview.",
    );
  }
  if (
    currentProfiles.digest !== plan.manifestDigests.agentProfiles ||
    currentManifest.digest !== plan.manifestDigests.schemaSkills ||
    currentManifest.bundleDigest !== plan.manifestDigests.skillBundles
  ) {
    fail(
      "RESOURCE_STALE",
      "Agent or schema skill manifest changed after preview.",
    );
  }
  const prepared = await prepareInstall(plan.request, options);
  let release: (() => Promise<void>) | null = null;
  const installedTargets: string[] = [];
  try {
    if (prepared.plan.inputDigest !== plan.inputDigest)
      fail(
        "RESOURCE_STALE",
        "Skill installation inputs changed after preview.",
      );
    if (!prepared.plan.canApply)
      fail(
        "RESOURCE_BLOCKED",
        "Skill installation has target collisions and was not applied.",
        prepared.plan.diagnostics,
      );
    const installTargets = [
      ...prepared.plan.targets.map((target) => ({
        target,
        profiles: target.profiles,
        hosts: [] as SkillInstallHostId[],
      })),
      ...prepared.plan.skillHosts.flatMap((host) =>
        host.targets.map((target) => ({
          target,
          profiles: [] as string[],
          hosts: [host.host],
        })),
      ),
    ];
    const unchangedTargets = installTargets
      .filter(({ target }) => target.action === "noop")
      .map(({ target }) => target.relativeTarget);
    if (installTargets.every(({ target }) => target.action === "noop")) {
      return {
        applied: false,
        installedTargets: [],
        unchangedTargets,
        inputDigest: plan.inputDigest,
      };
    }
    release = await acquireLock(prepared.root);
    const locked = await buildInstallState(prepared.request, prepared.sources);
    if (locked.plan.inputDigest !== plan.inputDigest)
      fail(
        "RESOURCE_STALE",
        "Skill installation inputs changed while acquiring the mutation lock.",
      );
    if (!locked.plan.canApply)
      fail(
        "RESOURCE_BLOCKED",
        "Skill installation has target collisions and was not applied.",
        locked.plan.diagnostics,
      );
    let ownershipData: OwnershipData = {
      schemaVersion: 1,
      resources: { ...locked.ownership.data.resources },
    };
    let ownershipRaw = locked.ownership.raw;
    const lockedTargets = [
      ...locked.plan.targets.map((target) => ({
        target,
        profiles: target.profiles,
        hosts: [] as SkillInstallHostId[],
      })),
      ...locked.plan.skillHosts.flatMap((host) =>
        host.targets.map((target) => ({
          target,
          profiles: [] as string[],
          hosts: [host.host],
        })),
      ),
    ];
    for (const { target, profiles, hosts } of lockedTargets) {
      if (target.action === "noop") continue;
      if (target.action !== "install")
        fail("RESOURCE_BLOCKED", `Refusing target ${target.relativeTarget}.`);
      const sourceDirectory = await safeSourceDirectory(
        prepared.sources.get(target.repository)!,
        target.sourcePath,
      );
      let created: CreatedEntry[] | null = null;
      try {
        created = await installTarget(target, sourceDirectory, prepared.root);
        const entry: OwnershipEntry = {
          digest: target.sourceDigest,
          skill: target.skill,
          repository: target.repository,
          sourcePath: target.sourcePath,
          profiles,
          ...(hosts.length ? { hosts } : {}),
        };
        ownershipData = {
          schemaVersion: 1,
          resources: {
            ...ownershipData.resources,
            [target.relativeTarget]: entry,
          },
        };
        ownershipRaw = await writeOwnership(
          prepared.root,
          ownershipData,
          ownershipRaw,
        );
        installedTargets.push(target.relativeTarget);
      } catch (error) {
        const leftovers = created ? await rollbackCreated(created) : [];
        if (installedTargets.length) {
          fail(
            "RESOURCE_PARTIAL",
            `Installed ${installedTargets.join(", ")} but could not finish ${target.relativeTarget}.`,
            {
              installedTargets: [...installedTargets],
              failedTarget: target.relativeTarget,
              partialPaths: leftovers,
              cause: error instanceof Error ? error.message : String(error),
            },
          );
        }
        if (leftovers.length)
          fail(
            "RESOURCE_PARTIAL",
            "Could not finish " +
              target.relativeTarget +
              "; partial target remains.",
            { target: target.relativeTarget, partialPaths: leftovers },
          );
        throw error;
      }
    }
    return {
      applied: installedTargets.length > 0,
      installedTargets,
      unchangedTargets,
      inputDigest: plan.inputDigest,
    };
  } finally {
    if (release) await release();
    await prepared.cleanup();
  }
}

async function normalizeDisableRequest(
  input: SkillDisableRequest,
  options: ResourceRuntimeOptions,
): Promise<SkillDisableRequestSnapshot> {
  const root = await projectRootPath(input.projectRoot);
  const target = normalizeTarget(root, input.target);
  const pinGuard = await requiredSkillTargets(root, options);
  if (input.requiredTargets !== undefined) {
    if (!Array.isArray(input.requiredTargets))
      fail(
        "PROFILE_SELECTION_INVALID",
        "Pinned required targets must be an array.",
      );
    const assertedTargets = input.requiredTargets
      .map((required) => normalizeTarget(root, required))
      .sort();
    if (new Set(assertedTargets).size !== assertedTargets.length)
      fail(
        "PROFILE_SELECTION_INVALID",
        "Pinned required targets must be unique.",
      );
    if (JSON.stringify(assertedTargets) !== JSON.stringify(pinGuard.targets)) {
      fail(
        "RESOURCE_PIN_GUARD_MISMATCH",
        "Caller-provided skill pin targets do not match the independently derived project guard.",
      );
    }
  }
  return freeze({
    projectRoot: root,
    target,
    requiredTargets: pinGuard.targets,
    pinGuard,
    profileManifestPath: profileManifestPathFn(options.profileManifestPath),
  });
}

interface DisableState {
  readonly plan: SkillDisablePlan;
  readonly ownership: OwnershipSnapshot;
  readonly absoluteTarget: string;
  readonly targetDigest: string | null;
}

async function buildDisableState(
  request: SkillDisableRequestSnapshot,
  options: ResourceRuntimeOptions,
): Promise<DisableState> {
  const [profileFile, ownership, currentPinGuard] = await Promise.all([
    readProfiles(request.profileManifestPath),
    readOwnership(request.projectRoot),
    requiredSkillTargets(request.projectRoot, {
      ...options,
      profileManifestPath: request.profileManifestPath,
    }),
  ]);
  if (currentPinGuard.digest !== request.pinGuard.digest)
    fail("RESOURCE_STALE", "Active skill pin inputs changed after preview.");
  const parent = path.posix.dirname(request.target);
  const sharedProfiles = profileFile.profiles
    .filter((profile) => profile.target === parent)
    .map((profile) => profile.id)
    .sort();
  const absoluteTarget = path.join(
    request.projectRoot,
    ...request.target.split("/"),
  );
  const targetPathState = await stateAt(request.projectRoot, request.target);
  const owner = ownership.data.resources[request.target];
  let targetState: SkillTargetState;
  let targetDigest: string | null = null;
  const diagnostics: ResourceDiagnostic[] = [];
  if (targetPathState.kind === "missing") {
    targetState = "missing";
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_NOT_INSTALLED",
      message: "The skill target does not exist.",
      target: request.target,
    });
  } else if (targetPathState.kind === "symlink") {
    targetState = "symlink";
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_SYMLINK",
      message: "Refusing to disable a symlinked skill target.",
      target: request.target,
    });
  } else if (targetPathState.kind === "parent-conflict") {
    targetState = "parent-conflict";
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_TARGET_CONFLICT",
      message: "A non-directory exists in a target parent path.",
      target: request.target,
    });
  } else if (targetPathState.kind !== "directory") {
    targetState = "file";
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_TARGET_CONFLICT",
      message: "The skill target is not a directory.",
      target: request.target,
    });
  } else {
    try {
      targetDigest = await digestTree(targetPathState.absolute);
      if (!owner) {
        targetState = "unmanaged";
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_UNMANAGED_COLLISION",
          message: "Refusing to disable an unmanaged resource.",
          target: request.target,
        });
      } else if (owner.digest !== targetDigest) {
        targetState = "modified";
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_OWNED_DRIFT",
          message:
            "Refusing to disable a managed resource that differs from its ownership record.",
          target: request.target,
        });
      } else {
        targetState = "owned";
      }
    } catch (error) {
      targetState =
        error instanceof ResourceError && error.code === "RESOURCE_SYMLINK"
          ? "symlink"
          : "modified";
      diagnostics.push({
        severity: "error",
        code:
          error instanceof ResourceError
            ? error.code
            : "RESOURCE_TARGET_UNSAFE",
        message:
          error instanceof Error ? error.message : "Skill target is unsafe.",
        target: request.target,
      });
    }
  }
  const requiredByPinnedChange =
    currentPinGuard.complete &&
    currentPinGuard.targets.includes(request.target);
  if (requiredByPinnedChange)
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_REQUIRED_BY_ACTIVE_PIN",
      message: "An active pinned schema/change still requires this skill.",
      target: request.target,
    });
  if (!currentPinGuard.complete) {
    diagnostics.push(...currentPinGuard.diagnostics);
    if (currentPinGuard.diagnostics.length === 0)
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
        message:
          "Active skill pin targets could not be proven; disable is blocked.",
        target: request.target,
      });
  }
  if (sharedProfiles.length > 1)
    diagnostics.push({
      severity: "error",
      code: "RESOURCE_SHARED_TARGET",
      message:
        "This skill directory is shared by named agents: " +
        sharedProfiles.join(", ") +
        ".",
      target: request.target,
    });
  const digest = inputDigest({
    kind: "skill-disable",
    request,
    profileManifestDigest: profileFile.digest,
    ownershipDigest: ownership.digest,
    pinGuard: currentPinGuard.digest,
    pinGuardComplete: currentPinGuard.complete,
    targetState,
    targetDigest,
    sharedProfiles,
    requiredByPinnedChange,
  });
  const plan: SkillDisablePlan = freeze({
    kind: "skill-disable",
    version: 1,
    inputDigest: digest,
    freshness: { status: "current", digest },
    canApply: diagnostics.length === 0,
    request,
    targetState,
    absoluteTarget,
    sharedProfiles,
    requiredByPinnedChange,
    pinGuardComplete: currentPinGuard.complete,
    diagnostics,
  });
  return { plan, ownership, absoluteTarget, targetDigest };
}

export async function previewSkillDisable(
  input: SkillDisableRequest,
  options: ResourceRuntimeOptions = {},
): Promise<SkillDisablePlan> {
  const request = await normalizeDisableRequest(input, options);
  return (await buildDisableState(request, options)).plan;
}

async function removeOwnedTree(target: string): Promise<void> {
  const visit = async (current: string): Promise<void> => {
    const info = await lstat(current);
    if (info.isSymbolicLink())
      fail("RESOURCE_SYMLINK", `Refusing to remove symlink: ${current}`);
    if (info.isDirectory()) {
      const names = await readdir(current);
      for (const name of names) await visit(path.join(current, name));
      await rmdir(current);
    } else if (info.isFile()) {
      await unlink(current);
    } else {
      fail(
        "RESOURCE_UNSUPPORTED_ENTRY",
        `Refusing to remove unsupported filesystem entry: ${current}`,
      );
    }
  };
  await visit(target);
}

export async function applySkillDisable(
  plan: SkillDisablePlan,
  options: ResourceRuntimeOptions = {},
): Promise<SkillDisableResult> {
  if (plan.kind !== "skill-disable" || plan.version !== 1)
    fail("RESOURCE_PLAN_INVALID", "Unsupported skill disable plan.");
  let release: (() => Promise<void>) | null = null;
  try {
    const current = await buildDisableState(plan.request, options);
    if (current.plan.inputDigest !== plan.inputDigest)
      fail("RESOURCE_STALE", "Skill disable inputs changed after preview.");
    if (!current.plan.canApply)
      fail(
        "RESOURCE_BLOCKED",
        "Skill disable is blocked by ownership, sharing, or active pinned requirements.",
        current.plan.diagnostics,
      );
    release = await acquireLock(plan.request.projectRoot);
    const locked = await buildDisableState(plan.request, options);
    if (locked.plan.inputDigest !== plan.inputDigest)
      fail(
        "RESOURCE_STALE",
        "Skill disable inputs changed while acquiring the mutation lock.",
      );
    if (!locked.plan.canApply)
      fail(
        "RESOURCE_BLOCKED",
        "Skill disable is blocked by ownership, sharing, or active pinned requirements.",
        locked.plan.diagnostics,
      );
    if (!locked.targetDigest)
      fail(
        "RESOURCE_STALE",
        "The owned skill target disappeared after preview.",
      );
    if ((await digestTree(locked.absoluteTarget)) !== locked.targetDigest)
      fail("RESOURCE_STALE", "The owned skill target changed after preview.");
    await removeOwnedTree(locked.absoluteTarget);
    const resources = { ...locked.ownership.data.resources };
    delete resources[plan.request.target];
    try {
      await writeOwnership(
        plan.request.projectRoot,
        { schemaVersion: 1, resources },
        locked.ownership.raw,
      );
    } catch (error) {
      fail(
        "RESOURCE_PARTIAL",
        `Removed ${plan.request.target}, but could not update its ownership record.`,
        {
          removedTarget: plan.request.target,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
    return {
      applied: true,
      removedTarget: plan.request.target,
      inputDigest: plan.inputDigest,
    };
  } finally {
    if (release) await release();
  }
}
