import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  link,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML, { isAlias, isMap, isScalar, isSeq } from "yaml";
import { OpsxError } from "../domain/project.ts";
import { isMcpRecord, type McpRecord } from "./guards.ts";

export type McpHost = "atomic" | "omp" | "opencode" | "pi" | "senpi";

export type McpInstallMode = "config" | "guided-only" | "prerequisite-needed";

export interface McpHostDiagnostic {
  code: string;
  message: string;
}

export type McpHostStatusName =
  | "configured"
  | "missing"
  | "prerequisite-needed"
  | "unknown"
  | "unsupported";

export interface McpHostStatus {
  host: McpHost;
  installMode: McpInstallMode;
  status: McpHostStatusName;
  /** null means the config cannot be safely inspected; it is never treated as missing. */
  configured: boolean | null;
  hostPath: string;
  configPath: string | null;
  transport: "http";
  auth: "none";
  prerequisite?: string;
  diagnostic?: McpHostDiagnostic;
}

export interface McpProvider {
  name: string;
  url: string;
  permissions: { readOnly: true };
  auth: "none";
  supportedHosts: McpHost[];
  /** Present only when inspection receives a project target directory. */
  hostStatus?: McpHostStatus[];
}

export interface McpHostInfo {
  host: McpHost;
  installMode: McpInstallMode;
  prerequisite?: string;
  diagnostic?: McpHostDiagnostic;
}

export type McpConfigEntry =
  | { url: string }
  | { type: "http"; url: string; auth?: false }
  | { type: "remote"; url: string };
export type McpConfigEntries = Record<string, McpConfigEntry>;

export interface McpCatalog {
  version: 1;
  providers: McpProvider[];
  hosts: McpHostInfo[];
}

export interface McpInstallDiff {
  operation: "add";
  path: string;
  before: null;
  after: McpConfigEntry | McpConfigEntries;
  configCreated: boolean;
}

export interface McpInstallPreview {
  provider: McpProvider;
  host: McpHost;
  installMode: McpInstallMode;
  prerequisite?: string;
  diagnostic?: McpHostDiagnostic;
  hostPath: string;
  configPath: string | null;
  changed: boolean;
  diff: McpInstallDiff[];
  /** Exact resulting file text for a local review UI; null for guided-only or no-op. */
  resultingConfig: string | null;
  catalogPath: string;
}

export interface McpCatalogOptions {
  schemaDir: string;
  /** Project root for read-only per-host config and prerequisite inspection. */
  targetDir?: string;
}

export interface McpProviderOptions extends McpCatalogOptions {
  providerName: string;
}

export interface McpInstallOptions extends McpProviderOptions {
  targetDir: string;
  host: McpHost;
}

/** Fresh current-user confirmation; the UI must display provider safety metadata and the exact host/config diff. */
export type McpInstallApproval = (
  preview: McpInstallPreview,
) => boolean | Promise<boolean>;

export interface McpApplyOptions extends McpInstallOptions {
  /** Called inside Apply to obtain fresh user approval for the exact current preview. */
  approve: McpInstallApproval;
}

export interface McpInstallResult {
  status: "installed" | "unchanged" | "denied" | "guided-only";
  preview: McpInstallPreview;
}

const HOSTS: McpHost[] = ["atomic", "omp", "opencode", "pi", "senpi"];
const HOST_INFO: McpHostInfo[] = [
  { host: "atomic", installMode: "config" },
  { host: "omp", installMode: "config" },
  { host: "opencode", installMode: "config" },
  {
    host: "pi",
    installMode: "prerequisite-needed",
    prerequisite: "pi-mcp-adapter",
  },
  { host: "senpi", installMode: "config" },
];
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

type FileStat = Stats;

interface FileSnapshot {
  bytes: Buffer;
  stat: FileStat;
}

interface CatalogSnapshot {
  path: string;
  stamp: FileSnapshot;
  providers: McpProvider[];
}

interface JsonProperty {
  key: string;
  keyStart: number;
  value: JsonNode;
  commaAfter: boolean;
}

interface JsonNode {
  kind: "object" | "array" | "scalar";
  start: number;
  end: number;
  value: unknown;
  properties?: JsonProperty[];
}

interface ConfigSnapshot {
  path: string;
  stamp: FileSnapshot | null;
  afterText: string;
  pointer: string;
  expected: McpConfigEntry;
  diffAfter: McpConfigEntry | McpConfigEntries;
  changed: boolean;
  configCreated: boolean;
}

interface InstallPlan {
  preview: McpInstallPreview;
  catalog: CatalogSnapshot;
  config: ConfigSnapshot | null;
  piAdapterEvidence: PiAdapterEvidence | null;
}

interface PiAdapterEvidence {
  agentDir: string;
  settings: Array<{ path: string; snapshot: FileSnapshot | null }>;
  trustStorePath: string;
  trustStore: FileSnapshot | null;
  packageRoot: string;
  packageManifestPath: string;
  packageManifest: FileSnapshot | null;
  entrypointPath: string | null;
  entrypoint: FileSnapshot | null;
}

interface PiAdapterReadiness {
  ready: boolean;
  diagnostic?: McpHostDiagnostic;
  evidence: PiAdapterEvidence;
}

interface HostReadiness {
  info: McpHostInfo;
  piAdapterEvidence: PiAdapterEvidence | null;
}

function fail(code: string, message: string): never {
  throw new OpsxError(code, message);
}

function exactKeys(value: McpRecord, expected: string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function sameIdentity(left: FileStat, right: FileStat): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameSnapshot(
  left: FileSnapshot | null,
  right: FileSnapshot | null,
): boolean {
  return left === null
    ? right === null
    : right !== null &&
        sameIdentity(left.stat, right.stat) &&
        left.bytes.equals(right.bytes);
}

function samePiAdapterEvidence(
  left: PiAdapterEvidence | null,
  right: PiAdapterEvidence | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.agentDir === right.agentDir &&
    left.packageRoot === right.packageRoot &&
    left.packageManifestPath === right.packageManifestPath &&
    left.entrypointPath === right.entrypointPath &&
    left.trustStorePath === right.trustStorePath &&
    sameSnapshot(left.trustStore, right.trustStore) &&
    sameSnapshot(left.packageManifest, right.packageManifest) &&
    sameSnapshot(left.entrypoint, right.entrypoint) &&
    left.settings.length === right.settings.length &&
    left.settings.every((entry, index) => {
      const current = right.settings[index];
      return (
        current !== undefined &&
        entry.path === current.path &&
        sameSnapshot(entry.snapshot, current.snapshot)
      );
    })
  );
}

async function lstatOrNull(file: string): Promise<FileStat | null> {
  try {
    return await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function assertSafeDirectoryChain(
  directory: string,
  allowMissing: boolean,
): Promise<void> {
  let current = path.resolve(directory);
  const missing: string[] = [];
  for (;;) {
    const info = await lstatOrNull(current);
    if (!info) {
      if (!allowMissing)
        fail("MCP_HOST_UNSAFE", `Host directory does not exist: ${current}`);
      missing.push(current);
    } else if (info.isSymbolicLink() || !info.isDirectory()) {
      fail("MCP_HOST_UNSAFE", `Unsafe host directory: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Missing directories are created only after approval. This pass merely
  // verifies that their nearest existing ancestor is a real directory.
  if (!allowMissing && missing.length)
    fail("MCP_HOST_UNSAFE", `Host directory does not exist: ${missing[0]}`);
}

async function readRegularFile(
  file: string,
  label: string,
): Promise<FileSnapshot | null> {
  const info = await lstatOrNull(file);
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isFile())
    fail("MCP_HOST_UNSAFE", `Unsafe ${label}: ${file}`);

  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | O_NOFOLLOW);
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile() || !sameIdentity(info, openedInfo)) {
      fail("MCP_HOST_UNSAFE", `Unsafe ${label}: ${file}`);
    }
    const bytes = await handle.readFile();
    const after = await lstatOrNull(file);
    if (
      !after ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      !sameIdentity(openedInfo, after)
    ) {
      fail("MCP_HOST_CHANGED", `${label} changed while being read: ${file}`);
    }
    return { bytes, stat: after };
  } catch (error) {
    if (error instanceof OpsxError) throw error;
    throw new OpsxError(
      "MCP_HOST_UNSAFE",
      `Cannot safely read ${label}: ${file}`,
    );
  } finally {
    await handle?.close();
  }
}

function piPackageSource(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isMcpRecord(value) && typeof value.source === "string")
    return value.source;
  return null;
}

function piPackageEntryLoadsAdapter(
  value: unknown,
  extensionPath: string,
): boolean {
  const source = piPackageSource(value);
  if (!source || !/^npm:pi-mcp-adapter(?:@[^/]+)?$/.test(source)) return false;
  if (
    typeof value === "string" ||
    !isMcpRecord(value) ||
    value.extensions === undefined
  )
    return true;
  if (!Array.isArray(value.extensions) || value.extensions.length === 0)
    return false;

  const normalizedPath = extensionPath.startsWith("./")
    ? extensionPath.slice(2)
    : extensionPath;
  const matches = (selector: string): boolean => {
    let normalized = selector.startsWith("+") ? selector.slice(1) : selector;
    if (normalized.startsWith("./")) normalized = normalized.slice(2);
    return (
      normalized === normalizedPath || normalized === "*" || normalized === "**"
    );
  };
  const selectors = value.extensions.filter(
    (item): item is string => typeof item === "string",
  );
  if (selectors.length !== value.extensions.length) return false;
  const hasInclude = selectors.some(
    (item) => !item.startsWith("!") && !item.startsWith("-"),
  );
  let included = !hasInclude;
  for (const selector of selectors) {
    const excluded = selector.startsWith("!") || selector.startsWith("-");
    if (matches(excluded ? selector.slice(1) : selector)) included = !excluded;
  }
  return included;
}

function errorDiagnostic(error: unknown): McpHostDiagnostic {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return {
      code: error.code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    code: "MCP_HOST_INSPECTION_FAILED",
    message:
      error instanceof Error
        ? error.message
        : "Could not safely inspect MCP host configuration",
  };
}

function inspectPiProjectTrust(
  targetDir: string,
  trustStore: FileSnapshot | null,
  globalSettings: McpRecord | null,
): { trusted: boolean; diagnostic?: McpHostDiagnostic } {
  let entries: McpRecord = {};
  if (trustStore) {
    try {
      const parsed: unknown = JSON.parse(
        trustStore.bytes.toString("utf8").replace(/^\uFEFF/, ""),
      );
      if (!isMcpRecord(parsed))
        throw new Error("trust store must be an object");
      entries = parsed;
      if (
        Object.values(entries).some(
          (value) => value !== null && typeof value !== "boolean",
        )
      ) {
        throw new Error("trust store decisions must be booleans or null");
      }
    } catch {
      return {
        trusted: false,
        diagnostic: {
          code: "MCP_PI_ADAPTER_UNKNOWN",
          message: "Cannot safely inspect Pi project trust settings",
        },
      };
    }
  }

  let currentDir = path.resolve(targetDir);
  for (;;) {
    const decision = entries[currentDir];
    if (decision === true) return { trusted: true };
    if (decision === false)
      return {
        trusted: false,
        diagnostic: {
          code: "MCP_PI_PROJECT_UNTRUSTED",
          message:
            "Pi has not trusted this project for project-local MCP packages",
        },
      };
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const defaultTrust = globalSettings?.defaultProjectTrust;
  if (defaultTrust === "always") return { trusted: true };
  if (
    defaultTrust === undefined ||
    defaultTrust === "ask" ||
    defaultTrust === "never"
  ) {
    return {
      trusted: false,
      diagnostic: {
        code: "MCP_PI_PROJECT_UNTRUSTED",
        message:
          "Pi project-local MCP packages are not trusted; explicitly trust the project in Pi first",
      },
    };
  }
  return {
    trusted: false,
    diagnostic: {
      code: "MCP_PI_ADAPTER_UNKNOWN",
      message: "Cannot safely determine Pi project trust from global settings",
    },
  };
}

async function inspectPiMcpAdapter(
  targetDir: string,
): Promise<PiAdapterReadiness> {
  const agentDir = path.resolve(
    process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent"),
  );
  const packageRoot = path.join(
    agentDir,
    "npm",
    "node_modules",
    "pi-mcp-adapter",
  );
  const packageManifestPath = path.join(packageRoot, "package.json");
  const settingsFiles = [
    path.join(agentDir, "settings.json"),
    path.join(targetDir, ".pi", "settings.json"),
  ];
  const trustStorePath = path.join(agentDir, "trust.json");
  const evidence: PiAdapterEvidence = {
    agentDir,
    settings: [],
    trustStorePath,
    trustStore: null,
    packageRoot,
    packageManifestPath,
    packageManifest: null,
    entrypointPath: null,
    entrypoint: null,
  };
  const missing = (message: string): PiAdapterReadiness => ({
    ready: false,
    diagnostic: { code: "MCP_PI_ADAPTER_REQUIRED", message },
    evidence,
  });
  try {
    await assertSafeDirectoryChain(packageRoot, true);
    evidence.packageManifest = await readRegularFile(
      packageManifestPath,
      "Pi MCP adapter package manifest",
    );
    if (!evidence.packageManifest)
      return missing(
        "Pi MCP support requires the separately installed pi-mcp-adapter package (pi install npm:pi-mcp-adapter).",
      );

    let manifest: unknown;
    try {
      manifest = JSON.parse(
        evidence.packageManifest.bytes.toString("utf8"),
      ) as unknown;
    } catch {
      return {
        ready: false,
        diagnostic: {
          code: "MCP_PI_ADAPTER_UNKNOWN",
          message:
            "Cannot parse Pi MCP adapter package manifest: " +
            packageManifestPath,
        },
        evidence,
      };
    }
    const pi =
      isMcpRecord(manifest) && isMcpRecord(manifest.pi) ? manifest.pi : null;
    const extensionPaths =
      pi && Array.isArray(pi.extensions)
        ? pi.extensions.filter(
            (entry): entry is string =>
              typeof entry === "string" &&
              entry.length > 0 &&
              !/[?*]/.test(entry),
          )
        : [];
    if (
      !isMcpRecord(manifest) ||
      manifest.name !== "pi-mcp-adapter" ||
      extensionPaths.length === 0
    ) {
      return {
        ready: false,
        diagnostic: {
          code: "MCP_PI_ADAPTER_UNKNOWN",
          message:
            "Installed package is not a verifiable Pi MCP extension: " +
            packageManifestPath,
        },
        evidence,
      };
    }
    const extensionPath = extensionPaths[0]!;
    const resolvedEntrypoint = path.resolve(packageRoot, extensionPath);
    if (
      resolvedEntrypoint !== packageRoot &&
      !resolvedEntrypoint.startsWith(packageRoot + path.sep)
    ) {
      return {
        ready: false,
        diagnostic: {
          code: "MCP_PI_ADAPTER_UNKNOWN",
          message:
            "Pi MCP adapter entrypoint escapes its package: " + extensionPath,
        },
        evidence,
      };
    }
    evidence.entrypointPath = resolvedEntrypoint;
    await assertSafeDirectoryChain(path.dirname(resolvedEntrypoint), true);
    evidence.entrypoint = await readRegularFile(
      resolvedEntrypoint,
      "Pi MCP adapter extension entrypoint",
    );
    if (!evidence.entrypoint)
      return missing(
        "Pi MCP adapter extension entrypoint is missing: " + resolvedEntrypoint,
      );

    let globalSettings: McpRecord | null = null;
    let projectSettings: McpRecord | null = null;
    for (const [index, settingsPath] of settingsFiles.entries()) {
      await assertSafeDirectoryChain(path.dirname(settingsPath), true);
      const snapshot = await readRegularFile(
        settingsPath,
        "Pi package settings",
      );
      evidence.settings.push({ path: settingsPath, snapshot });
      if (!snapshot) continue;
      let settings: McpRecord;
      try {
        const parsed = parseJsonc(snapshot.bytes.toString("utf8")).value;
        if (!isMcpRecord(parsed))
          throw new Error("Pi settings must be an object");
        settings = parsed;
      } catch {
        return {
          ready: false,
          diagnostic: {
            code: "MCP_PI_ADAPTER_UNKNOWN",
            message:
              "Cannot safely inspect Pi package settings: " + settingsPath,
          },
          evidence,
        };
      }
      if (
        settings.packages !== undefined &&
        !Array.isArray(settings.packages)
      ) {
        return {
          ready: false,
          diagnostic: {
            code: "MCP_PI_ADAPTER_UNKNOWN",
            message:
              "Pi package settings must use a packages array: " + settingsPath,
          },
          evidence,
        };
      }
      if (index === 0) globalSettings = settings;
      else projectSettings = settings;
    }
    const projectPackages = projectSettings?.packages;
    const usesProjectPackages = projectPackages !== undefined;
    const effectivePackages = (
      usesProjectPackages ? projectPackages : globalSettings?.packages
    ) as unknown[] | undefined;
    if (
      !effectivePackages?.some((entry) =>
        piPackageEntryLoadsAdapter(entry, extensionPath),
      )
    ) {
      return missing(
        "Pi MCP support requires pi-mcp-adapter to be registered with Pi (pi install npm:pi-mcp-adapter).",
      );
    }
    if (usesProjectPackages) {
      await assertSafeDirectoryChain(path.dirname(trustStorePath), true);
      evidence.trustStore = await readRegularFile(
        trustStorePath,
        "Pi project trust store",
      );
      const trust = inspectPiProjectTrust(
        targetDir,
        evidence.trustStore,
        globalSettings,
      );
      if (!trust.trusted) {
        return {
          ready: false,
          diagnostic: trust.diagnostic ?? {
            code: "MCP_PI_PROJECT_UNTRUSTED",
            message: "Pi project-local MCP packages are not trusted",
          },
          evidence,
        };
      }
    }
    return { ready: true, evidence };
  } catch (error) {
    return { ready: false, diagnostic: errorDiagnostic(error), evidence };
  }
}

async function resolveHostReadiness(
  host: McpHost,
  targetDir?: string,
): Promise<HostReadiness> {
  const base = HOST_INFO.find((entry) => entry.host === host)!;
  if (host !== "pi") return { info: { ...base }, piAdapterEvidence: null };
  if (!targetDir) {
    return {
      info: {
        ...base,
        diagnostic: {
          code: "MCP_PI_ADAPTER_UNVERIFIED",
          message:
            "A project target is required to verify the separately installed Pi MCP adapter.",
        },
      },
      piAdapterEvidence: null,
    };
  }
  const adapter = await inspectPiMcpAdapter(targetDir);
  return {
    info: {
      host: "pi",
      installMode: adapter.ready ? "config" : "prerequisite-needed",
      ...(adapter.ready
        ? {}
        : { prerequisite: "pi-mcp-adapter", diagnostic: adapter.diagnostic }),
    },
    piAdapterEvidence: adapter.evidence,
  };
}

async function resolveAllHostReadiness(
  targetDir?: string,
): Promise<HostReadiness[]> {
  return Promise.all(
    HOSTS.map((host) => resolveHostReadiness(host, targetDir)),
  );
}

function fallbackConfigPath(targetDir: string, host: McpHost): string {
  if (host === "atomic" || host === "pi")
    return path.join(targetDir, ".mcp.json");
  if (host === "omp") return path.join(targetDir, ".omp", "mcp.json");
  if (host === "senpi") return path.join(targetDir, ".senpi", "mcp.json");
  return path.join(targetDir, "opencode.jsonc");
}

function hostPathFor(
  targetDir: string,
  host: McpHost,
  configPath: string,
): string {
  return host === "atomic" || host === "pi"
    ? targetDir
    : path.dirname(configPath);
}

async function inspectProviderHosts(
  catalog: CatalogSnapshot,
  provider: McpProvider,
  targetDir: string,
  readiness: HostReadiness[],
): Promise<McpHostStatus[]> {
  return Promise.all(
    HOSTS.map(async (host, index) => {
      const currentReadiness = readiness[index]!;
      const configPath = fallbackConfigPath(targetDir, host);
      const hostPath = hostPathFor(targetDir, host, configPath);
      const base = {
        host,
        installMode: currentReadiness.info.installMode,
        transport: "http" as const,
        auth: "none" as const,
        ...(currentReadiness.info.prerequisite
          ? { prerequisite: currentReadiness.info.prerequisite }
          : {}),
      };
      if (!provider.supportedHosts.includes(host)) {
        return {
          ...base,
          status: "unsupported",
          configured: null,
          hostPath,
          configPath,
        };
      }
      try {
        const plan = await makePlan(
          {
            schemaDir: path.dirname(catalog.path),
            providerName: provider.name,
            targetDir,
            host,
          },
          catalog,
          currentReadiness,
        );
        let status: McpHostStatusName;
        if (plan.preview.installMode === "guided-only") status = "unsupported";
        else if (plan.preview.installMode === "prerequisite-needed") {
          status =
            plan.preview.diagnostic?.code === "MCP_PI_ADAPTER_UNKNOWN"
              ? "unknown"
              : "prerequisite-needed";
        } else status = plan.preview.changed ? "missing" : "configured";
        return {
          ...base,
          status,
          configured: !plan.preview.changed,
          hostPath: plan.preview.hostPath,
          configPath: plan.preview.configPath,
          ...(plan.preview.diagnostic
            ? { diagnostic: plan.preview.diagnostic }
            : {}),
        };
      } catch (error) {
        return {
          ...base,
          status: "unknown",
          configured: null,
          hostPath,
          configPath,
          diagnostic: errorDiagnostic(error),
        };
      }
    }),
  );
}

async function catalogForInspection(
  catalog: CatalogSnapshot,
  targetDir?: string,
): Promise<McpCatalog> {
  if (!targetDir) {
    const readiness = await resolveAllHostReadiness();
    return {
      version: 1,
      providers: catalog.providers,
      hosts: readiness.map((entry) => entry.info),
    };
  }
  const root = path.resolve(targetDir);
  await assertSafeDirectoryChain(root, false);
  const readiness = await resolveAllHostReadiness(root);
  const providers = await Promise.all(
    catalog.providers.map(async (provider) => ({
      ...provider,
      hostStatus: await inspectProviderHosts(
        catalog,
        provider,
        root,
        readiness,
      ),
    })),
  );
  return {
    version: 1,
    providers,
    hosts: readiness.map((entry) => entry.info),
  };
}

function yamlValue(node: unknown): unknown {
  if (node === null || node === undefined) return null;
  if (isAlias(node))
    fail("MCP_CATALOG_UNSAFE", "MCP catalogs may not contain YAML aliases");
  if (isScalar(node)) return node.value;
  if (isSeq(node)) return node.items.map((item) => yamlValue(item));
  if (isMap(node)) {
    const result: McpRecord = Object.create(null) as McpRecord;
    for (const pair of node.items) {
      const key = yamlValue(pair.key);
      if (typeof key !== "string" || Object.hasOwn(result, key)) {
        fail(
          "MCP_CATALOG_UNSAFE",
          "MCP catalog mapping keys must be unique strings",
        );
      }
      result[key] = yamlValue(pair.value);
    }
    return result;
  }
  fail("MCP_CATALOG_UNSAFE", "MCP catalog contains an unsupported YAML value");
}

function validateProvider(raw: unknown, names: Set<string>): McpProvider {
  if (
    !isMcpRecord(raw) ||
    !exactKeys(raw, ["name", "url", "readOnly", "auth"])
  ) {
    fail(
      "MCP_CATALOG_UNSAFE",
      "Each MCP catalog server must contain only name, url, readOnly, and auth",
    );
  }
  if (
    typeof raw.name !== "string" ||
    !/^[a-z][a-z0-9-]*$/.test(raw.name) ||
    names.has(raw.name)
  ) {
    fail(
      "MCP_CATALOG_UNSAFE",
      "MCP catalog server names must be unique lowercase-hyphen names",
    );
  }
  if (
    typeof raw.url !== "string" ||
    raw.readOnly !== true ||
    raw.auth !== "none"
  ) {
    fail(
      "MCP_CATALOG_UNSAFE",
      `MCP provider ${raw.name} must be HTTPS, read-only, and unauthenticated`,
    );
  }
  let endpoint: URL;
  try {
    endpoint = new URL(raw.url);
  } catch {
    fail("MCP_CATALOG_UNSAFE", `MCP provider ${raw.name} has an invalid URL`);
  }
  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password
  ) {
    fail(
      "MCP_CATALOG_UNSAFE",
      `MCP provider ${raw.name} must use HTTPS without embedded credentials`,
    );
  }
  names.add(raw.name);
  return {
    name: raw.name,
    url: raw.url,
    permissions: { readOnly: true },
    auth: "none",
    supportedHosts: [...HOSTS],
  };
}

async function readCatalog(schemaDir: string): Promise<CatalogSnapshot> {
  const root = path.resolve(schemaDir);
  await assertSafeDirectoryChain(root, false);
  const file = path.join(root, "mcp.yaml");
  const stamp = await readRegularFile(file, "MCP catalog");
  if (!stamp) fail("MCP_CATALOG_NOT_FOUND", `No declared MCP catalog: ${file}`);

  const document = YAML.parseDocument(stamp.bytes.toString("utf8"), {
    uniqueKeys: true,
    prettyErrors: true,
  });
  if (document.errors.length || document.warnings.length) {
    fail("MCP_CATALOG_UNSAFE", `Invalid or ambiguous MCP catalog: ${file}`);
  }
  const parsed = yamlValue(document.contents);
  if (
    !isMcpRecord(parsed) ||
    !exactKeys(parsed, ["version", "servers"]) ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.servers) ||
    parsed.servers.length === 0
  ) {
    fail(
      "MCP_CATALOG_UNSAFE",
      `MCP catalog must be version 1 with a non-empty servers list: ${file}`,
    );
  }
  const names = new Set<string>();
  const providers = parsed.servers.map((entry) =>
    validateProvider(entry, names),
  );
  return { path: file, stamp, providers };
}

function findProvider(
  catalog: CatalogSnapshot,
  providerName: string,
): McpProvider {
  const provider = catalog.providers.find(
    (entry) => entry.name === providerName,
  );
  if (!provider)
    fail("MCP_PROVIDER_UNKNOWN", `Unknown MCP provider: ${providerName}`);
  return provider;
}

function leadingIndent(source: string, offset: number): string | null {
  const lineStart =
    Math.max(
      source.lastIndexOf("\n", offset - 1),
      source.lastIndexOf("\r", offset - 1),
    ) + 1;
  const prefix = source.slice(lineStart, offset);
  return /^[\t ]*$/.test(prefix) ? prefix : null;
}

interface ParsedMcpConfig {
  value: McpRecord;
  root: JsonNode;
}

function parseJsonc(source: string): ParsedMcpConfig {
  let index = 0;

  function skipTrivia(): void {
    for (;;) {
      while (index < source.length && /[\t\n\r ]/.test(source[index]!)) index++;
      if (source.startsWith("//", index)) {
        index += 2;
        while (
          index < source.length &&
          source[index] !== "\n" &&
          source[index] !== "\r"
        )
          index++;
        continue;
      }
      if (source.startsWith("/*", index)) {
        const end = source.indexOf("*/", index + 2);
        if (end < 0)
          fail(
            "MCP_CONFIG_UNSAFE",
            "MCP config contains an unterminated comment",
          );
        index = end + 2;
        continue;
      }
      return;
    }
  }

  function parseString(): { value: string; start: number; end: number } {
    const start = index;
    if (source[index] !== '"')
      fail("MCP_CONFIG_UNSAFE", "MCP config contains an invalid JSONC string");
    index++;
    while (index < source.length) {
      const character = source[index]!;
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === '"') {
        index++;
        try {
          const value = JSON.parse(source.slice(start, index)) as unknown;
          if (typeof value !== "string")
            fail("MCP_CONFIG_UNSAFE", "MCP config contains an invalid string");
          return { value, start, end: index };
        } catch {
          fail(
            "MCP_CONFIG_UNSAFE",
            "MCP config contains an invalid JSONC string",
          );
        }
      }
      if (character.charCodeAt(0) < 0x20)
        fail(
          "MCP_CONFIG_UNSAFE",
          "MCP config contains an invalid JSONC string",
        );
      index++;
    }
    fail(
      "MCP_CONFIG_UNSAFE",
      "MCP config contains an unterminated JSONC string",
    );
  }

  function parseValue(): JsonNode {
    skipTrivia();
    const start = index;
    const character = source[index];
    if (character === "{") {
      index++;
      const value: McpRecord = Object.create(null) as McpRecord;
      const properties: JsonProperty[] = [];
      const keys = new Set<string>();
      skipTrivia();
      if (source[index] === "}") {
        index++;
        return { kind: "object", start, end: index, value, properties };
      }
      for (;;) {
        skipTrivia();
        const key = parseString();
        if (
          keys.has(key.value) ||
          ["__proto__", "constructor", "prototype"].includes(key.value)
        ) {
          fail(
            "MCP_CONFIG_UNSAFE",
            "MCP config contains a duplicate or unsafe object key",
          );
        }
        keys.add(key.value);
        skipTrivia();
        if (source[index] !== ":")
          fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
        index++;
        const child = parseValue();
        Object.defineProperty(value, key.value, {
          value: child.value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        const property: JsonProperty = {
          key: key.value,
          keyStart: key.start,
          value: child,
          commaAfter: false,
        };
        properties.push(property);
        skipTrivia();
        if (source[index] === ",") {
          property.commaAfter = true;
          index++;
          skipTrivia();
          if (source[index] === "}") {
            index++;
            return { kind: "object", start, end: index, value, properties };
          }
          continue;
        }
        if (source[index] === "}") {
          index++;
          return { kind: "object", start, end: index, value, properties };
        }
        fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
      }
    }
    if (character === "[") {
      index++;
      const value: unknown[] = [];
      skipTrivia();
      if (source[index] === "]") {
        index++;
        return { kind: "array", start, end: index, value };
      }
      for (;;) {
        const child = parseValue();
        value.push(child.value);
        skipTrivia();
        if (source[index] === ",") {
          index++;
          skipTrivia();
          if (source[index] === "]") {
            index++;
            return { kind: "array", start, end: index, value };
          }
          continue;
        }
        if (source[index] === "]") {
          index++;
          return { kind: "array", start, end: index, value };
        }
        fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
      }
    }
    if (character === '"') {
      const parsed = parseString();
      return { kind: "scalar", start, end: parsed.end, value: parsed.value };
    }

    while (index < source.length && !/[\t\n\r ,}\]]/.test(source[index]!)) {
      if (source.startsWith("//", index) || source.startsWith("/*", index))
        break;
      index++;
    }
    if (index === start)
      fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
    const token = source.slice(start, index);
    let value: unknown;
    try {
      if (
        token !== "true" &&
        token !== "false" &&
        token !== "null" &&
        !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)
      ) {
        fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
      }
      value = JSON.parse(token) as unknown;
    } catch {
      fail("MCP_CONFIG_UNSAFE", "MCP config contains invalid JSONC syntax");
    }
    return { kind: "scalar", start, end: index, value };
  }

  skipTrivia();
  const parsed = parseValue();
  skipTrivia();
  if (
    index !== source.length ||
    parsed.kind !== "object" ||
    !isMcpRecord(parsed.value)
  ) {
    fail("MCP_CONFIG_UNSAFE", "MCP config must be one JSON or JSONC object");
  }
  return { value: parsed.value, root: parsed };
}

function property(node: JsonNode, key: string): JsonProperty | undefined {
  return node.properties?.find((entry) => entry.key === key);
}

function addJsoncProperty(
  source: string,
  node: JsonNode,
  key: string,
  value: unknown,
  propertyIndent: string,
  closeIndent: string,
): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let text = source;
  let closeIndex = node.end - 1;
  const lastProperty = node.properties?.at(-1);
  if (lastProperty && !lastProperty.commaAfter) {
    const commaIndex = lastProperty.value.end;
    text = `${text.slice(0, commaIndex)},${text.slice(commaIndex)}`;
    closeIndex++;
  }
  let insertionIndex = closeIndex;
  while (
    insertionIndex > node.start &&
    /[\t\n\r ]/.test(text[insertionIndex - 1]!)
  )
    insertionIndex--;
  const addition = `${newline}${propertyIndent}${JSON.stringify(key)}: ${JSON.stringify(value)}${newline}${closeIndent}`;
  return `${text.slice(0, insertionIndex)}${addition}${text.slice(closeIndex)}`;
}

function expectedEntry(provider: McpProvider, host: McpHost): McpConfigEntry {
  if (host === "omp") return { type: "http", url: provider.url };
  if (host === "opencode") return { type: "remote", url: provider.url };
  if (host === "senpi") return { type: "http", url: provider.url, auth: false };
  return { url: provider.url };
}

function exactEntry(value: unknown, expected: McpConfigEntry): boolean {
  return (
    isMcpRecord(value) &&
    Object.keys(value).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, item]) => value[key] === item)
  );
}

function configKey(host: McpHost): "mcp" | "mcpServers" {
  return host === "opencode" ? "mcp" : "mcpServers";
}

async function chooseConfigPath(
  targetDir: string,
  host: McpHost,
): Promise<string> {
  if (host === "atomic" || host === "pi")
    return path.join(targetDir, ".mcp.json");
  if (host === "omp") return path.join(targetDir, ".omp", "mcp.json");
  if (host === "senpi") return path.join(targetDir, ".senpi", "mcp.json");

  const candidates = [
    "opencode.json",
    "opencode.jsonc",
    path.join(".opencode", "opencode.json"),
    path.join(".opencode", "opencode.jsonc"),
  ].map((relative) => path.join(targetDir, relative));
  const found: string[] = [];
  for (const candidate of candidates) {
    await assertSafeDirectoryChain(path.dirname(candidate), true);
    const info = await lstatOrNull(candidate);
    if (info) {
      if (info.isSymbolicLink() || !info.isFile())
        fail("MCP_HOST_UNSAFE", `Unsafe OpenCode config: ${candidate}`);
      found.push(candidate);
    }
  }
  if (found.length > 1)
    fail("MCP_HOST_UNSAFE", "Ambiguous OpenCode config candidates");
  return found[0] ?? path.join(targetDir, "opencode.jsonc");
}

async function readConfig(
  targetDir: string,
  host: McpHost,
  provider: McpProvider,
): Promise<ConfigSnapshot | null> {
  const configPath = await chooseConfigPath(targetDir, host);
  const hostPath =
    host === "pi" || host === "atomic" ? targetDir : path.dirname(configPath);
  await assertSafeDirectoryChain(hostPath, true);
  const key = configKey(host);
  const expected = expectedEntry(provider, host);
  const pointer = `/${key}/${provider.name}`;
  const stamp = await readRegularFile(configPath, "MCP host config");
  const original = stamp ? stamp.bytes.toString("utf8") : null;
  let rootNode: JsonNode;
  let afterText = original?.trim() ? original : "{}\n";
  try {
    if (original?.trim()) {
      const parsed = parseJsonc(original);
      rootNode = parsed.root;
    } else {
      const parsed = parseJsonc(afterText);
      rootNode = parsed.root;
    }
  } catch (error) {
    if (error instanceof OpsxError) throw error;
    fail("MCP_CONFIG_UNSAFE", `Cannot parse MCP host config: ${configPath}`);
  }

  const mapProperty = property(rootNode, key);
  const mapValue = mapProperty?.value;
  let changed = false;
  let diffPath = pointer;
  let diffAfter: McpConfigEntry | McpConfigEntries = expected;
  const configCreated = stamp === null;

  if (
    mapValue &&
    (mapValue.kind !== "object" || !isMcpRecord(mapValue.value))
  ) {
    fail(
      "MCP_CONFIG_UNSAFE",
      `MCP config ${key} must be an object: ${configPath}`,
    );
  }

  const server = mapValue ? property(mapValue, provider.name) : undefined;
  if (server) {
    if (!exactEntry(server.value.value, expected)) {
      fail(
        "MCP_CONFIG_CONFLICT",
        `MCP server already exists with different settings: ${provider.name}`,
      );
    }
  } else {
    changed = true;
    if (!mapProperty) {
      const map = Object.create(null) as McpRecord;
      Object.defineProperty(map, provider.name, {
        value: expected,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      if (!stamp) {
        afterText = `${JSON.stringify({ [key]: { [provider.name]: expected } }, null, 2)}\n`;
      } else {
        const rootPropertyIndent = rootNode.properties?.length
          ? leadingIndent(original ?? "", rootNode.properties[0]!.keyStart)
          : null;
        const propertyIndent = rootPropertyIndent ?? "  ";
        const closeIndent =
          leadingIndent(original ?? "", rootNode.end - 1) ?? "";
        afterText = addJsoncProperty(
          afterText,
          rootNode,
          key,
          map,
          propertyIndent,
          closeIndent,
        );
      }
      diffPath = `/${key}`;
      diffAfter = { [provider.name]: expected };
    } else {
      const nested = mapValue!;
      const parentIndent =
        leadingIndent(original ?? "", mapProperty.keyStart) ?? "";
      const childPropertyIndent = nested.properties?.length
        ? (leadingIndent(original ?? "", nested.properties[0]!.keyStart) ??
          `${parentIndent}  `)
        : `${parentIndent}  `;
      afterText = addJsoncProperty(
        afterText,
        nested,
        provider.name,
        expected,
        childPropertyIndent,
        parentIndent,
      );
    }
  }

  if (!stamp && !changed) afterText = "{}\n";
  if (changed) {
    // Parse the generated text before exposing it or allowing it to reach disk.
    parseJsonc(afterText);
  }
  return {
    path: configPath,
    stamp,
    afterText,
    pointer: diffPath,
    expected,
    diffAfter,
    changed,
    configCreated,
  };
}

async function makePlan(
  options: McpInstallOptions,
  catalogSnapshot?: CatalogSnapshot,
  hostReadiness?: HostReadiness,
): Promise<InstallPlan> {
  if (!HOSTS.includes(options.host))
    fail(
      "MCP_HOST_UNSUPPORTED",
      `Unsupported MCP host: ${String(options.host)}`,
    );
  const schemaDir = path.resolve(options.schemaDir);
  const targetDir = path.resolve(options.targetDir);
  await assertSafeDirectoryChain(targetDir, false);
  const catalog = catalogSnapshot ?? (await readCatalog(schemaDir));
  const provider = findProvider(catalog, options.providerName);
  const readiness =
    hostReadiness ?? (await resolveHostReadiness(options.host, targetDir));
  const config = await readConfig(targetDir, options.host, provider);
  const hostPath =
    options.host === "pi" || options.host === "atomic"
      ? targetDir
      : path.dirname(config!.path);
  const configPath = config!.path;
  const changed = config!.changed;
  const diff: McpInstallDiff[] = !config!.changed
    ? []
    : [
        {
          operation: "add",
          path: config!.pointer,
          before: null,
          after: config!.diffAfter,
          configCreated: config!.configCreated,
        },
      ];
  const preview: McpInstallPreview = {
    provider,
    host: options.host,
    installMode: readiness.info.installMode,
    ...(readiness.info.prerequisite
      ? { prerequisite: readiness.info.prerequisite }
      : {}),
    ...(readiness.info.diagnostic
      ? { diagnostic: readiness.info.diagnostic }
      : {}),
    hostPath,
    configPath,
    changed,
    diff,
    resultingConfig: !config!.changed ? null : config!.afterText,
    catalogPath: catalog.path,
  };
  return {
    preview: freezeDeep(preview),
    catalog,
    config,
    piAdapterEvidence: readiness.piAdapterEvidence,
  };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      freezeDeep(child);
  }
  return value;
}

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function verifyPlanCurrent(
  options: McpInstallOptions,
  original: InstallPlan,
): Promise<InstallPlan> {
  const current = await makePlan(options);
  if (
    JSON.stringify(current.preview) !== JSON.stringify(original.preview) ||
    !sameSnapshot(original.catalog.stamp, current.catalog.stamp) ||
    !sameSnapshot(
      original.config?.stamp ?? null,
      current.config?.stamp ?? null,
    ) ||
    !samePiAdapterEvidence(
      original.piAdapterEvidence,
      current.piAdapterEvidence,
    )
  ) {
    fail(
      "MCP_CONFIG_CHANGED",
      "MCP catalog or host config changed during approval; preview and approve again",
    );
  }
  return current;
}

async function createSafeDirectories(directory: string): Promise<void> {
  const missing: string[] = [];
  let current = path.resolve(directory);
  for (;;) {
    const info = await lstatOrNull(current);
    if (!info) missing.push(current);
    else if (info.isSymbolicLink() || !info.isDirectory())
      fail("MCP_HOST_UNSAFE", `Unsafe host directory: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const directoryPath of missing.reverse()) {
    try {
      await mkdir(directoryPath, { mode: 0o755 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstatOrNull(directoryPath);
    if (!info || info.isSymbolicLink() || !info.isDirectory())
      fail("MCP_HOST_UNSAFE", `Unsafe host directory: ${directoryPath}`);
  }
}

async function verifyConfigUnchanged(config: ConfigSnapshot): Promise<void> {
  const current = await readRegularFile(config.path, "MCP host config");
  if (!sameSnapshot(config.stamp, current))
    fail(
      "MCP_CONFIG_CHANGED",
      `MCP host config changed before install: ${config.path}`,
    );
}

async function writeConfig(config: ConfigSnapshot): Promise<void> {
  if (!config.changed) return;
  const parent = path.dirname(config.path);
  await createSafeDirectories(parent);
  await assertSafeDirectoryChain(parent, false);
  await verifyConfigUnchanged(config);

  const mode = config.stamp ? config.stamp.stat.mode & 0o7777 : 0o644;
  const temporary = `${config.path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(config.afterText, "utf8");
    await handle.chmod(mode);
    await handle.close();
    handle = undefined;
    await assertSafeDirectoryChain(parent, false);
    await verifyConfigUnchanged(config);
    if (config.stamp) {
      await rename(temporary, config.path);
    } else {
      // Linking refuses to replace a config another process created after preview.
      await link(temporary, config.path);
      await unlink(temporary);
    }
  } catch (error) {
    if (error instanceof OpsxError) throw error;
    fail(
      "MCP_CONFIG_WRITE_FAILED",
      `Could not safely install MCP config: ${config.path}`,
    );
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}

/** Lists every entry after validating the complete declared schema-local catalog. */
export async function listMcpCatalog(
  options: McpCatalogOptions,
): Promise<McpCatalog> {
  const catalog = await readCatalog(options.schemaDir);
  return catalogForInspection(catalog, options.targetDir);
}

/** Inspects one declared provider without making network requests. */
export async function inspectMcpProvider(
  options: McpProviderOptions,
): Promise<McpProvider> {
  const catalog = await readCatalog(options.schemaDir);
  const provider = findProvider(catalog, options.providerName);
  if (!options.targetDir) return provider;
  const targetDir = path.resolve(options.targetDir);
  await assertSafeDirectoryChain(targetDir, false);
  const readiness = await resolveAllHostReadiness(targetDir);
  return {
    ...provider,
    hostStatus: await inspectProviderHosts(
      catalog,
      provider,
      targetDir,
      readiness,
    ),
  };
}

/** Previews the selected host config path and the exact single-entry config diff. */
export async function previewMcpInstall(
  options: McpInstallOptions,
): Promise<McpInstallPreview> {
  return (await makePlan(options)).preview;
}

/**
 * Applies only after a fresh interactive TTY check and an in-call approval of
 * the exact current preview. Approval booleans/tokens/TTY flags are not inputs.
 */
export async function installMcpProvider(
  options: McpApplyOptions,
): Promise<McpInstallResult> {
  const plan = await makePlan(options);
  if (plan.preview.installMode === "guided-only") {
    return { status: "guided-only", preview: plan.preview };
  }
  if (plan.preview.installMode === "prerequisite-needed") {
    fail(
      plan.preview.diagnostic?.code ?? "MCP_HOST_PREREQUISITE_REQUIRED",
      plan.preview.diagnostic?.message ??
        "The host MCP prerequisite is not verified; installation is unavailable",
    );
  }
  if (!isInteractiveTerminal()) {
    fail(
      "MCP_APPROVAL_TTY_REQUIRED",
      "MCP installation requires an interactive TTY; use Settings to approve this provider",
    );
  }
  if (!options.approve || typeof options.approve !== "function") {
    fail(
      "MCP_APPROVAL_REQUIRED",
      "MCP installation requires an interactive provider-safety approval callback",
    );
  }

  const approved = await options.approve(plan.preview);
  if (typeof approved !== "boolean")
    fail(
      "MCP_APPROVAL_INVALID",
      "Provider approval must return an explicit yes or no",
    );
  if (!approved) return { status: "denied", preview: plan.preview };

  const current = await verifyPlanCurrent(options, plan);
  if (!current.config || !current.preview.changed)
    return { status: "unchanged", preview: current.preview };
  await writeConfig(current.config);
  return { status: "installed", preview: current.preview };
}
