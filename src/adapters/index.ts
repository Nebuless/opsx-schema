import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpsxError } from "../domain/project.ts";

export type CompoundAdapterHost = "opencode" | "omp" | "senpi" | "pi" | "atomic";
export type CompoundAdapterScope = "project";
export type CompoundAdapterStatus = "missing" | "intact" | "collision";
export type CompoundAdapterPreviewAction = "install" | "unchanged" | "refuse";

export interface CompoundAdapterBundleSource {
  name: string;
  version: string;
  revision: string;
  digest: string;
}

export interface CompoundAdapterInspection {
  schema: string;
  bundleSource: CompoundAdapterBundleSource;
  host: CompoundAdapterHost;
  scope: CompoundAdapterScope;
  root: string;
  destination: string;
  status: CompoundAdapterStatus;
  digest: string;
  files: string[];
  installedFiles: string[];
  missingFiles: string[];
  targetDigest: string;
  reason?: string;
}

export interface CompoundAdapterPreview extends CompoundAdapterInspection {
  action: CompoundAdapterPreviewAction;
}

export interface CompoundAdapterInstallResult {
  status: "installed" | "intact";
  destination: string;
  digest: string;
  installedFiles: string[];
}

interface AdapterFileRecord {
  path: string;
  sha256: string;
}

interface AdapterManifest {
  formatVersion: number;
  source: {
    package: string;
    version: string;
    repository: string;
    revision: string;
    schema: string;
    directory: string;
  };
  digest: string;
  files: AdapterFileRecord[];
}

interface VerifiedBundle {
  digest: string;
  files: AdapterFileRecord[];
  contents: Map<string, Buffer>;
}

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/adapters");
const schemaAssetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/schemas");
const resourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../resources");
const manifestName = "manifest.json";
const sourceIdentity = {
  package: "@nebulesstech/openspec-schemas",
  version: "1.8.1",
  repository: "https://github.com/Nebuless/openspec-schemas",
  revision: "2c1740206a4d1729b0285b07a5e79c181b12bf89",
  schema: "compound-intent-driven",
  directory: "openspec/schemas/compound-intent-driven/adapters/shared",
} as const;
const supportedBundleSource: CompoundAdapterBundleSource = {
  name: sourceIdentity.schema,
  version: sourceIdentity.version,
  revision: sourceIdentity.revision,
  digest: "d25477a5c302ebfbd9202458ecc5c8d0c4c379a9be3e0332e516dfb5071645a1",
};
const sourceDigest = "822d28f8640456b8d91fd46879834fb25e2e0de934e965fffebfb76ebd70b9ed";
const adapterNames = [
  "opsx-ce-bulk-continue.md",
  "opsx-ce-compound.md",
  "opsx-ce-continue.md",
  "opsx-ce-debug.md",
  "opsx-ce-define.md",
  "opsx-ce-plan.md",
  "opsx-ce-review.md",
  "opsx-ce-validate.md",
  "opsx-ce-work.md",
] as const;
const hostDirectories: Record<CompoundAdapterHost, string> = {
  opencode: ".opencode/commands",
  omp: ".omp/commands",
  senpi: ".senpi/prompts",
  pi: ".pi/prompts",
  atomic: ".atomic/prompts",
};

function fail(code: string, message: string): never {
  throw new OpsxError(code, message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hostValue(value: unknown): CompoundAdapterHost {
  if (typeof value !== "string" || !Object.hasOwn(hostDirectories, value)) {
    return fail("COMPOUND_ADAPTER_HOST", "Select one supported adapter host: atomic, omp, opencode, pi, or senpi.");
  }
  return value as CompoundAdapterHost;
}

function adapterSchemaValue(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value)) {
    return fail("COMPOUND_ADAPTER_SCHEMA_ID", "An installed OpenSpec schema ID is required for workflow-adapter discovery.");
  }
  return value;
}

function bundleSourceValue(value: unknown): CompoundAdapterBundleSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.name !== "string" || typeof source.version !== "string" || typeof source.revision !== "string" || typeof source.digest !== "string") return null;
  return { name: source.name, version: source.version, revision: source.revision, digest: source.digest };
}

function sameBundleSource(left: CompoundAdapterBundleSource, right: CompoundAdapterBundleSource): boolean {
  return left.name === right.name && left.version === right.version && left.revision === right.revision && left.digest === right.digest;
}

function scopeValue(value: unknown): CompoundAdapterScope {
  if (value !== "project") {
    return fail("COMPOUND_ADAPTER_SCOPE", "Compound command adapters support only the explicit project target scope.");
  }
  return value;
}

function sortedFiles(files: AdapterFileRecord[]): AdapterFileRecord[] {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

function matchesSourceIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return Object.keys(source).length === Object.keys(sourceIdentity).length &&
    Object.entries(sourceIdentity).every(([key, expected]) => source[key] === expected);
}

function validRelativeFile(value: string): boolean {
  return adapterNames.includes(value as typeof adapterNames[number]) && !path.isAbsolute(value) && !value.includes("/") && !value.includes("\\");
}

async function lstatOrMissing(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function adapterSourceDirectory(): Promise<string> {
  let current = resourceRoot;
  const rootMetadata = await lstatOrMissing(current);
  if (!rootMetadata || rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter resource path is missing or unsafe: " + current);
  }
  for (const segment of sourceIdentity.directory.split("/")) {
    current = path.join(current, segment);
    const metadata = await lstatOrMissing(current);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter resource path is missing or unsafe: " + current);
    }
  }
  return current;
}

async function verifiedBundle(): Promise<VerifiedBundle> {
  for (const directory of [path.dirname(assetRoot), assetRoot]) {
    const metadata = await lstatOrMissing(directory);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter asset path is not a real directory: " + directory);
    }
  }
  const manifestPath = path.join(assetRoot, manifestName);
  const manifestStat = await lstatOrMissing(manifestPath);
  if (!manifestStat || manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter manifest is not a regular file.");
  }

  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest is invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest must be a JSON object.");
  }
  const manifest = value as AdapterManifest;
  if (manifest.formatVersion !== 1 || !matchesSourceIdentity(manifest.source)) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest has an unsupported source or format.");
  }
  if (!Array.isArray(manifest.files)) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest has no file list.");
  }
  if (manifest.files.some(file => !file || typeof file !== "object" || typeof file.path !== "string" || typeof file.sha256 !== "string")) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest contains an invalid file record.");
  }
  const files = sortedFiles(manifest.files);
  if (files.some(file => !file || !validRelativeFile(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) ||
      new Set(files.map(file => file.path)).size !== files.length ||
      JSON.stringify(files.map(file => file.path)) !== JSON.stringify([...adapterNames].sort((a, b) => a.localeCompare(b)))) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest contains an unsafe, duplicate, or incomplete file list.");
  }
  const digest = sha256(JSON.stringify(files));
  if (manifest.digest !== digest || digest !== sourceDigest) {
    return fail("COMPOUND_ADAPTER_MANIFEST", "Bundled adapter manifest digest does not match the pinned source snapshot.");
  }

  const sourceDirectory = await adapterSourceDirectory();
  const expectedEntries = [...adapterNames].sort((a, b) => a.localeCompare(b));
  const entries = (await readdir(sourceDirectory)).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter directory contains missing or unverified files.");
  }

  const contents = new Map<string, Buffer>();
  for (const file of files) {
    const sourcePath = path.join(sourceDirectory, file.path);
    const metadata = await lstatOrMissing(sourcePath);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isFile()) {
      return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter is not a regular file: " + file.path);
    }
    const content = await readFile(sourcePath);
    if (sha256(content) !== file.sha256) {
      return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter differs from its pinned source bytes: " + file.path);
    }
    contents.set(file.path, content);
  }
  return { digest, files, contents };
}

async function verifySchemaBundleSource(): Promise<void> {
  for (const directory of [path.dirname(schemaAssetRoot), schemaAssetRoot]) {
    const metadata = await lstatOrMissing(directory);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled schema asset path is missing or unsafe: " + directory);
    }
  }
  const manifestPath = path.join(schemaAssetRoot, manifestName);
  const metadata = await lstatOrMissing(manifestPath);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isFile()) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled schema manifest is not a regular file.");
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled schema manifest is invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled schema manifest must be a JSON object.");
  }
  const manifest = value as Record<string, unknown>;
  const source = manifest.source as Record<string, unknown> | undefined;
  const schemas = manifest.schemas as Record<string, unknown> | undefined;
  const schema = schemas?.[supportedBundleSource.name] as Record<string, unknown> | undefined;
  if (manifest.formatVersion !== 1 || !source || !schema ||
      source.package !== sourceIdentity.package || source.version !== supportedBundleSource.version ||
      source.repository !== sourceIdentity.repository || source.revision !== supportedBundleSource.revision ||
      schema.digest !== supportedBundleSource.digest) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled schema manifest no longer matches the pinned workflow-adapter source.");
  }
}

async function requireBundleSource(value: unknown): Promise<CompoundAdapterBundleSource> {
  const candidate = bundleSourceValue(value);
  if (!candidate || !sameBundleSource(candidate, supportedBundleSource)) {
    return fail("COMPOUND_ADAPTER_BUNDLE_UNAVAILABLE", "The selected OpenSpec schema has no verified workflow-adapter bundle source.");
  }
  await verifySchemaBundleSource();
  return { ...supportedBundleSource };
}

export function listCompoundAdapterHosts(): CompoundAdapterHost[] {
  return ["atomic", "omp", "opencode", "pi", "senpi"];
}

export async function listCompoundAdapterBundleSources(): Promise<CompoundAdapterBundleSource[]> {
  await verifySchemaBundleSource();
  await verifiedBundle();
  return [{ ...supportedBundleSource }];
}

export async function isSupportedCompoundAdapterBundleSource(value: unknown): Promise<boolean> {
  const candidate = bundleSourceValue(value);
  if (!candidate || !sameBundleSource(candidate, supportedBundleSource)) return false;
  await verifySchemaBundleSource();
  await verifiedBundle();
  return true;
}

async function projectRoot(root: string): Promise<string> {
  if (typeof root !== "string" || !root.trim()) {
    return fail("COMPOUND_ADAPTER_PROJECT_ROOT", "Project root must be a nonempty existing directory.");
  }
  const absolute = path.resolve(root);
  const metadata = await lstatOrMissing(absolute);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
    return fail("COMPOUND_ADAPTER_PROJECT_ROOT", "Project root must be an existing real directory: " + root);
  }
  return realpath(absolute);
}

interface TargetFileState {
  path: string;
  state: "missing" | "intact" | "collision";
  sha256?: string;
  reason?: string;
}

async function inspectTarget(
  root: string,
  schema: string,
  bundleSource: CompoundAdapterBundleSource,
  host: CompoundAdapterHost,
  scope: CompoundAdapterScope,
  bundle: VerifiedBundle,
): Promise<CompoundAdapterInspection> {
  const destination = path.join(root, hostDirectories[host]);
  const ancestors: { path: string; state: string }[] = [];
  let current = root;
  for (const segment of hostDirectories[host].split("/")) {
    current = path.join(current, segment);
    const metadata = await lstatOrMissing(current);
    if (!metadata) {
      ancestors.push({ path: path.relative(root, current), state: "missing" });
      const missingFiles = [...adapterNames];
      return {
        schema, bundleSource, host, scope, root, destination, status: "missing", digest: bundle.digest,
        files: [...adapterNames], installedFiles: [], missingFiles,
        targetDigest: sha256(JSON.stringify({ ancestors, files: missingFiles.map(file => ({ path: file, state: "missing" })) })),
      };
    }
    if (metadata.isSymbolicLink()) {
      ancestors.push({ path: path.relative(root, current), state: "symlink" });
      return {
        schema, bundleSource, host, scope, root, destination, status: "collision", digest: bundle.digest,
        files: [...adapterNames], installedFiles: [], missingFiles: [...adapterNames],
        targetDigest: sha256(JSON.stringify({ ancestors })),
        reason: "Symlinked target directory is not allowed: " + current,
      };
    }
    if (!metadata.isDirectory()) {
      ancestors.push({ path: path.relative(root, current), state: "not-directory" });
      return {
        schema, bundleSource, host, scope, root, destination, status: "collision", digest: bundle.digest,
        files: [...adapterNames], installedFiles: [], missingFiles: [...adapterNames],
        targetDigest: sha256(JSON.stringify({ ancestors })),
        reason: "Target ancestor is not a directory: " + current,
      };
    }
    ancestors.push({ path: path.relative(root, current), state: "directory" });
  }

  const installedFiles: string[] = [];
  const missingFiles: string[] = [];
  const targetFiles: TargetFileState[] = [];
  let reason: string | undefined;
  for (const file of bundle.files) {
    const target = path.join(destination, file.path);
    const metadata = await lstatOrMissing(target);
    if (!metadata) {
      missingFiles.push(file.path);
      targetFiles.push({ path: file.path, state: "missing" });
      continue;
    }
    if (metadata.isSymbolicLink()) {
      reason ??= "Symlink target is not allowed: " + target;
      targetFiles.push({ path: file.path, state: "collision", reason: "symlink" });
      continue;
    }
    if (!metadata.isFile()) {
      reason ??= "Target is not a regular file: " + target;
      targetFiles.push({ path: file.path, state: "collision", reason: "not-regular" });
      continue;
    }
    const actualDigest = sha256(await readFile(target));
    if (actualDigest !== file.sha256) {
      reason ??= "Existing adapter differs from the bundled source: " + target;
      targetFiles.push({ path: file.path, state: "collision", sha256: actualDigest, reason: "different-bytes" });
      continue;
    }
    installedFiles.push(file.path);
    targetFiles.push({ path: file.path, state: "intact", sha256: actualDigest });
  }
  const status: CompoundAdapterStatus = reason ? "collision" : missingFiles.length ? "missing" : "intact";
  return {
    schema, bundleSource, host, scope, root, destination, status, digest: bundle.digest,
    files: [...adapterNames], installedFiles, missingFiles,
    targetDigest: sha256(JSON.stringify({ ancestors, files: targetFiles })),
    ...(reason ? { reason } : {}),
  };
}

export async function inspectCompoundAdapters(
  root: string,
  schema: string,
  bundleSource: CompoundAdapterBundleSource,
  host: CompoundAdapterHost,
  scope: CompoundAdapterScope,
): Promise<CompoundAdapterInspection> {
  const selectedSchema = adapterSchemaValue(schema);
  const selectedHost = hostValue(host);
  const selectedScope = scopeValue(scope);
  const selectedSource = await requireBundleSource(bundleSource);
  const bundle = await verifiedBundle();
  const canonicalRoot = await projectRoot(root);
  return inspectTarget(canonicalRoot, selectedSchema, selectedSource, selectedHost, selectedScope, bundle);
}

export async function previewCompoundAdapterInstall(
  root: string,
  schema: string,
  bundleSource: CompoundAdapterBundleSource,
  host: CompoundAdapterHost,
  scope: CompoundAdapterScope,
): Promise<CompoundAdapterPreview> {
  const inspection = await inspectCompoundAdapters(root, schema, bundleSource, host, scope);
  const action: CompoundAdapterPreviewAction = inspection.status === "collision"
    ? "refuse"
    : inspection.status === "intact" ? "unchanged" : "install";
  return { ...inspection, action };
}

function samePreview(left: CompoundAdapterPreview, right: CompoundAdapterPreview): boolean {
  return left.schema === right.schema && left.host === right.host && left.scope === right.scope && left.root === right.root &&
    sameBundleSource(left.bundleSource, right.bundleSource) &&
    left.destination === right.destination && left.status === right.status && left.digest === right.digest &&
    left.targetDigest === right.targetDigest && left.action === right.action && left.reason === right.reason &&
    JSON.stringify(left.files) === JSON.stringify(right.files) &&
    JSON.stringify(left.installedFiles) === JSON.stringify(right.installedFiles) &&
    JSON.stringify(left.missingFiles) === JSON.stringify(right.missingFiles);
}

async function ensureTargetDirectory(root: string, host: CompoundAdapterHost): Promise<void> {
  let current = root;
  for (const segment of hostDirectories[host].split("/")) {
    current = path.join(current, segment);
    let metadata = await lstatOrMissing(current);
    if (!metadata) {
      try {
        await mkdir(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      metadata = await lstatOrMissing(current);
    }
    if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      return fail("COMPOUND_ADAPTER_COLLISION", "Target directory changed or is unsafe: " + current);
    }
  }
}

export async function installCompoundAdapters(
  root: string,
  schema: string,
  bundleSource: CompoundAdapterBundleSource,
  host: CompoundAdapterHost,
  scope: CompoundAdapterScope,
  preview: CompoundAdapterPreview,
): Promise<CompoundAdapterInstallResult> {
  const selectedSchema = adapterSchemaValue(schema);
  const selectedHost = hostValue(host);
  const selectedScope = scopeValue(scope);
  const current = await previewCompoundAdapterInstall(root, selectedSchema, bundleSource, selectedHost, selectedScope);
  if (!preview || !samePreview(preview, current)) {
    return fail("COMPOUND_ADAPTER_STALE_PREVIEW", "Compound adapter preview is stale; preview again before Apply.");
  }
  if (current.status === "collision") {
    return fail("COMPOUND_ADAPTER_COLLISION", current.reason ?? "Existing target files would not be overwritten: " + current.destination);
  }
  if (current.status === "intact") {
    return { status: "intact", destination: current.destination, digest: current.digest, installedFiles: [] };
  }

  const bundle = await verifiedBundle();
  if (bundle.digest !== current.digest) {
    return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter source changed after preview; no files were written.");
  }
  const liveRoot = await projectRoot(root);
  if (liveRoot !== current.root) {
    return fail("COMPOUND_ADAPTER_STALE_PREVIEW", "Project root changed after preview; no files were written.");
  }
  await ensureTargetDirectory(liveRoot, selectedHost);
  const beforeWrite = await inspectCompoundAdapters(root, selectedSchema, current.bundleSource, selectedHost, selectedScope);
  if (beforeWrite.status === "collision") {
    return fail("COMPOUND_ADAPTER_COLLISION", beforeWrite.reason ?? "Target changed or is unsafe: " + beforeWrite.destination);
  }
  if (beforeWrite.digest !== current.digest || beforeWrite.root !== current.root ||
      JSON.stringify(beforeWrite.installedFiles) !== JSON.stringify(current.installedFiles) ||
      JSON.stringify(beforeWrite.missingFiles) !== JSON.stringify(current.missingFiles)) {
    return fail("COMPOUND_ADAPTER_STALE_PREVIEW", "Compound adapter target changed after preview; no files were written.");
  }

  const installedFiles: string[] = [];
  for (const name of beforeWrite.missingFiles) {
    const target = path.join(beforeWrite.destination, name);
    const content = bundle.contents.get(name);
    if (!content) return fail("COMPOUND_ADAPTER_SOURCE_DRIFT", "Bundled adapter bytes are missing: " + name);
    try {
      const handle = await open(target, "wx", 0o644);
      try {
        await handle.writeFile(content);
      } finally {
        await handle.close();
      }
      installedFiles.push(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return fail("COMPOUND_ADAPTER_STALE_PREVIEW", "Adapter target appeared after preview; no existing file was overwritten: " + target);
      }
      throw error;
    }
  }
  const afterInstall = await inspectCompoundAdapters(root, selectedSchema, current.bundleSource, selectedHost, selectedScope);
  if (afterInstall.status !== "intact") {
    return fail("COMPOUND_ADAPTER_INSTALL_FAILED", afterInstall.reason ?? "Adapter files were not fully installed: " + afterInstall.destination);
  }
  return { status: "installed", destination: afterInstall.destination, digest: afterInstall.digest, installedFiles };
}
