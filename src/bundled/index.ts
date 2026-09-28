import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { schema as resolveOpenSpecSchema } from "../catalog/schemas.ts";
import { OpsxError } from "../domain/project.ts";
import { OpenSpecClient } from "../openspec/client.ts";

interface SchemaFile {
  path: string;
  sha256: string;
}

interface SchemaRecord {
  digest: string;
  files: SchemaFile[];
}

interface SchemaManifest {
  formatVersion: number;
  source: {
    package: string;
    version: string;
    repository: string;
    revision: string;
    license: string;
    licenseFile: string;
    licenseSha256: string;
  };
  schemas: Record<string, SchemaRecord>;
}

export type BundledSchemaStatus = "missing" | "intact" | "collision";

export interface BundledSchemaInspection {
  name: string;
  version: string;
  repository: string;
  revision: string;
  license: string;
  sourceDirectory: string;
  digest: string;
  sourceDigest: string;
  fileCount: number;
  files: string[];
  skills: string[];
  hasMcp: boolean;
  adapters: string[];
}

export interface BundledSchemaPlan {
  /** The schema name in the bundled manifest. */
  name: string;
  sourceName: string;
  destinationName: string;
  root: string;
  sourceDirectory: string;
  destination: string;
  /** Backward-compatible alias for sourceDigest. */
  digest: string;
  sourceDigest: string;
  installedDigest: string;
  sourceVersion: string;
  sourceRevision: string;
  status: BundledSchemaStatus;
  targetDigest?: string;
  reason?: string;
}

export interface BundledSchemaInstallResult {
  status: "installed" | "intact";
  destination: string;
  sourceName: string;
  destinationName: string;
  sourceDigest: string;
  installedDigest: string;
  /** Backward-compatible alias for sourceDigest. */
  digest: string;
}

export interface BundledSchemaSourceIdentity {
  name: string;
  version: string;
  revision: string;
  digest: string;
}

export interface BundledSchemaInstallationIdentity
  extends BundledSchemaSourceIdentity {
  installedDigest: string;
}

interface TreeSnapshot {
  files: SchemaFile[];
  directories: string[];
  contents: Map<string, Buffer>;
}

const assetRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/schemas",
);
const resourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../resources",
);
for (const directory of [path.dirname(assetRoot), assetRoot]) {
  const metadata = lstatSync(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema asset path is not a real directory: " + directory,
    );
  }
}
const manifestPath = path.join(assetRoot, "manifest.json");
const manifestStat = lstatSync(manifestPath);
if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
  fail(
    "BUNDLED_SCHEMA_SOURCE_DRIFT",
    "Bundled schema manifest is not a regular file.",
  );
}
const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as SchemaManifest;
const schemaNames = Object.keys(manifest.schemas).sort();

function fail(code: string, message: string): never {
  throw new OpsxError(code, message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRoot(): string {
  for (const directory of [
    resourceRoot,
    path.join(resourceRoot, "openspec"),
    path.join(resourceRoot, "openspec", "schemas"),
  ]) {
    let metadata;
    try {
      metadata = lstatSync(directory);
    } catch {
      return fail(
        "BUNDLED_SCHEMA_SOURCE_DRIFT",
        "Bundled schema resource directory is missing or unsafe: " + directory,
      );
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      return fail(
        "BUNDLED_SCHEMA_SOURCE_DRIFT",
        "Bundled schema resource path is not a real directory: " + directory,
      );
    }
  }

  const licensePath = path.join(resourceRoot, manifest.source.licenseFile);
  let licenseStat;
  try {
    licenseStat = lstatSync(licensePath);
  } catch {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema license is missing or unsafe.",
    );
  }
  if (licenseStat.isSymbolicLink() || !licenseStat.isFile()) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema license is not a regular file.",
    );
  }
  if (sha256(readFileSync(licensePath)) !== manifest.source.licenseSha256) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema license is missing or differs from its recorded digest.",
    );
  }
  return resourceRoot;
}

if (manifest.formatVersion !== 1 || manifest.source.version !== "1.8.1") {
  fail(
    "BUNDLED_SCHEMA_MANIFEST",
    "Bundled schema manifest has an unsupported format or source version.",
  );
}
if (manifest.source.licenseFile !== "LICENSE") {
  fail(
    "BUNDLED_SCHEMA_MANIFEST",
    "Bundled schema manifest points to an unsupported license path.",
  );
}

function safeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function recordFor(name: string): SchemaRecord {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
    name === "." ||
    name === ".."
  ) {
    return fail(
      "BUNDLED_SCHEMA_NOT_FOUND",
      "Bundled schema not found: " + name,
    );
  }
  const record = manifest.schemas[name];
  if (!record)
    return fail(
      "BUNDLED_SCHEMA_NOT_FOUND",
      "Bundled schema not found: " + name,
    );
  return record;
}

function expectedFiles(record: SchemaRecord): SchemaFile[] {
  const files = [...record.files].sort((a, b) => a.path.localeCompare(b.path));
  if (
    files.some(
      (file) =>
        !safeRelativePath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256),
    ) ||
    new Set(files.map((file) => file.path)).size !== files.length
  ) {
    return fail(
      "BUNDLED_SCHEMA_MANIFEST",
      "Bundled schema manifest contains an unsafe or duplicate file path.",
    );
  }
  if (sha256(JSON.stringify(files)) !== record.digest) {
    return fail(
      "BUNDLED_SCHEMA_MANIFEST",
      "Bundled schema manifest digest is invalid.",
    );
  }
  return files;
}

function expectedDirectories(files: SchemaFile[]): string[] {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    parts.pop();
    for (let i = 1; i <= parts.length; i++)
      directories.add(parts.slice(0, i).join("/"));
  }
  return [...directories].sort((a, b) => a.localeCompare(b));
}

async function snapshotTree(directory: string): Promise<TreeSnapshot> {
  let rootStat;
  try {
    rootStat = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fail(
        "BUNDLED_SCHEMA_UNSAFE_TREE",
        "Schema directory is missing: " + directory,
      );
    }
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return fail(
      "BUNDLED_SCHEMA_UNSAFE_TREE",
      "Schema path is not a real directory: " + directory,
    );
  }

  const files: SchemaFile[] = [];
  const directories: string[] = [];
  const contents = new Map<string, Buffer>();
  async function visit(current: string, relative: string): Promise<void> {
    const entries = await readdir(current);
    entries.sort();
    for (const entry of entries) {
      const childPath = path.join(current, entry);
      const childRelative = relative ? relative + "/" + entry : entry;
      const metadata = await lstat(childPath);
      if (metadata.isSymbolicLink()) {
        return fail(
          "BUNDLED_SCHEMA_UNSAFE_TREE",
          "Schema tree contains a symlink: " + childRelative,
        );
      }
      if (metadata.isDirectory()) {
        directories.push(childRelative);
        await visit(childPath, childRelative);
      } else if (metadata.isFile()) {
        const content = await readFile(childPath);
        contents.set(childRelative, content);
        files.push({ path: childRelative, sha256: sha256(content) });
      } else {
        return fail(
          "BUNDLED_SCHEMA_UNSAFE_TREE",
          "Schema tree contains a non-regular file: " + childRelative,
        );
      }
    }
  }
  await visit(directory, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  directories.sort((a, b) => a.localeCompare(b));
  return { files, directories, contents };
}

function matchesRecord(snapshot: TreeSnapshot, record: SchemaRecord): boolean {
  const files = expectedFiles(record);
  return (
    JSON.stringify(snapshot.files) === JSON.stringify(files) &&
    JSON.stringify(snapshot.directories) ===
      JSON.stringify(expectedDirectories(files))
  );
}

async function verifiedSource(name: string): Promise<{
  record: SchemaRecord;
  sourceDirectory: string;
  snapshot: TreeSnapshot;
}> {
  const record = recordFor(name);
  const sourceDirectory = path.join(sourceRoot(), "openspec", "schemas", name);
  let snapshot: TreeSnapshot;
  try {
    snapshot = await snapshotTree(sourceDirectory);
  } catch (error) {
    if (
      error instanceof OpsxError &&
      error.code === "BUNDLED_SCHEMA_UNSAFE_TREE"
    ) {
      return fail(
        "BUNDLED_SCHEMA_SOURCE_DRIFT",
        "Bundled schema source is missing or unsafe: " + name,
      );
    }
    throw error;
  }
  if (!matchesRecord(snapshot, record)) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema assets changed or are incomplete: " + name,
    );
  }
  return { record, sourceDirectory, snapshot };
}

export function listBundledSchemas(): string[] {
  return [...schemaNames];
}

export async function inspectBundledSchema(
  name: string,
): Promise<BundledSchemaInspection> {
  const { record, sourceDirectory, snapshot } = await verifiedSource(name);
  const files = record.files
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b));
  const skillsText =
    snapshot.contents.get("skills.txt")?.toString("utf8") ?? "";
  return {
    name,
    version: manifest.source.version,
    repository: manifest.source.repository,
    revision: manifest.source.revision,
    license: manifest.source.license,
    sourceDirectory,
    digest: record.digest,
    sourceDigest: record.digest,
    fileCount: files.length,
    files,
    skills: skillsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
    hasMcp: files.includes("mcp.yaml"),
    adapters: files.filter((file) => file.startsWith("adapters/")),
  };
}

async function projectRoot(root: string): Promise<string> {
  if (typeof root !== "string" || !root.trim())
    return fail("PROJECT_NOT_FOUND", "Project root must be a nonempty path.");
  let metadata;
  try {
    metadata = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return fail("PROJECT_NOT_FOUND", "Project root does not exist: " + root);
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    return fail(
      "PROJECT_NOT_FOUND",
      "Project root is not a real directory: " + root,
    );
  }
  return realpath(root);
}

async function lstatOrMissing(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function targetDigest(snapshot: TreeSnapshot): string {
  return sha256(
    JSON.stringify({
      files: snapshot.files,
      directories: snapshot.directories,
    }),
  );
}

function validDestinationName(name: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name) && name !== "." && name !== ".."
  );
}

function transformedSnapshot(
  snapshot: TreeSnapshot,
  sourceName: string,
  destinationName: string,
): TreeSnapshot {
  const schemaContent = snapshot.contents.get("schema.yaml");
  if (!schemaContent)
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema has no schema.yaml: " + sourceName,
    );
  const text = schemaContent.toString("utf8");
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema.yaml is invalid YAML: " + sourceName,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as Record<string, unknown>).name !== sourceName
  ) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema.yaml name does not match source identity " +
        sourceName +
        ".",
    );
  }
  const nameLines = [
    ...text.matchAll(
      /^name:([ \t]*)(?:(['"])([A-Za-z0-9][A-Za-z0-9_-]*)['"]|([A-Za-z0-9][A-Za-z0-9_-]*))([ \t]*(?:#.*)?\r?)$/gm,
    ),
  ];
  if (nameLines.length !== 1) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema.yaml must contain one plain top-level name field: " +
        sourceName +
        ".",
    );
  }
  const line = nameLines[0]!;
  const currentName = line[3] ?? line[4];
  if (currentName !== sourceName || line.index === undefined) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema.yaml name does not match source identity " +
        sourceName +
        ".",
    );
  }
  if (sourceName === destinationName) return snapshot;
  const quote = line[2] ?? "";
  const oldScalar = quote ? quote + currentName + quote : currentName;
  const valueStart = line.index + ("name:" + line[1]).length;
  const valueEnd = valueStart + oldScalar.length;
  const newScalar = quote ? quote + destinationName + quote : destinationName;
  const transformedText =
    text.slice(0, valueStart) + newScalar + text.slice(valueEnd);
  let transformed: unknown;
  try {
    transformed = YAML.parse(transformedText);
  } catch {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Transformed schema.yaml is invalid for destination " +
        destinationName +
        ".",
    );
  }
  if (
    !transformed ||
    typeof transformed !== "object" ||
    Array.isArray(transformed) ||
    (transformed as Record<string, unknown>).name !== destinationName
  ) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Transformed schema.yaml name does not match destination identity " +
        destinationName +
        ".",
    );
  }
  const contents = new Map(snapshot.contents);
  const transformedBytes = Buffer.from(transformedText);
  contents.set("schema.yaml", transformedBytes);
  const files = snapshot.files.map((file) =>
    file.path === "schema.yaml"
      ? { path: file.path, sha256: sha256(transformedBytes) }
      : file,
  );
  return { files, directories: snapshot.directories, contents };
}

function sameSnapshot(left: TreeSnapshot, right: TreeSnapshot): boolean {
  return (
    JSON.stringify(left.files) === JSON.stringify(right.files) &&
    JSON.stringify(left.directories) === JSON.stringify(right.directories)
  );
}

async function aliasShadowReason(
  root: string,
  name: string,
  destination: string,
): Promise<string | undefined> {
  try {
    const resolved = await resolveOpenSpecSchema(
      new OpenSpecClient(root),
      name,
    );
    if (resolved.shadows.length) {
      return (
        "OpenSpec reports same-name schema shadows for " +
        name +
        ": " +
        JSON.stringify(resolved.shadows) +
        "."
      );
    }
    const selectedPath = await realpath(resolved.path);
    const destinationStat = await lstatOrMissing(destination);
    const expectedPath = destinationStat
      ? await realpath(destination)
      : path.resolve(destination);
    if (selectedPath !== expectedPath) {
      return (
        "OpenSpec resolves " +
        name +
        " to an external schema at " +
        selectedPath +
        ", not the requested destination " +
        destination +
        "."
      );
    }
    return undefined;
  } catch (error) {
    if (
      error instanceof OpsxError &&
      error.code === "OPENSPEC_FAILED" &&
      error.message.includes("Schema '" + name + "' not found")
    )
      return undefined;
    throw error;
  }
}

export async function prepareBundledSchema(
  root: string,
  name: string,
  destinationName?: string,
): Promise<BundledSchemaPlan> {
  const {
    record,
    sourceDirectory,
    snapshot: sourceSnapshot,
  } = await verifiedSource(name);
  if (
    destinationName !== undefined &&
    (!validDestinationName(destinationName) ||
      destinationName === name ||
      schemaNames.includes(destinationName))
  ) {
    return fail(
      "BUNDLED_SCHEMA_ALIAS_INVALID",
      "Destination schema name must be a distinct, valid bundled identity: " +
        destinationName,
    );
  }
  const installName = destinationName ?? name;
  const installSnapshot = transformedSnapshot(
    sourceSnapshot,
    name,
    installName,
  );
  const canonicalRoot = await projectRoot(root);
  const destination = path.join(
    canonicalRoot,
    "openspec",
    "schemas",
    installName,
  );
  const base = {
    name,
    sourceName: name,
    destinationName: installName,
    root: canonicalRoot,
    sourceDirectory,
    destination,
    digest: record.digest,
    sourceDigest: record.digest,
    installedDigest: targetDigest(installSnapshot),
    sourceVersion: manifest.source.version,
    sourceRevision: manifest.source.revision,
  };
  let plan: BundledSchemaPlan = { ...base, status: "missing" };
  let current = canonicalRoot;
  for (const [index, segment] of [
    "openspec",
    "schemas",
    installName,
  ].entries()) {
    current = path.join(current, segment);
    const metadata = await lstatOrMissing(current);
    if (!metadata) break;
    if (metadata.isSymbolicLink()) {
      plan = {
        ...base,
        status: "collision",
        reason: "Target path contains a symlink: " + current,
      };
      break;
    }
    if (index < 2 && !metadata.isDirectory()) {
      plan = {
        ...base,
        status: "collision",
        reason: "Target parent is not a directory: " + current,
      };
      break;
    }
    if (index === 2) {
      if (!metadata.isDirectory()) {
        plan = {
          ...base,
          status: "collision",
          reason: "Target is not a directory: " + destination,
        };
        break;
      }
      try {
        const snapshot = await snapshotTree(destination);
        const digest = targetDigest(snapshot);
        plan = sameSnapshot(snapshot, installSnapshot)
          ? { ...base, status: "intact", targetDigest: digest }
          : {
              ...base,
              status: "collision",
              targetDigest: digest,
              reason:
                "Existing schema differs from requested " +
                name +
                " as " +
                installName +
                ".",
            };
      } catch (error) {
        if (
          error instanceof OpsxError &&
          error.code === "BUNDLED_SCHEMA_UNSAFE_TREE"
        ) {
          plan = { ...base, status: "collision", reason: error.message };
          break;
        }
        throw error;
      }
    }
  }
  if (destinationName !== undefined && plan.status !== "collision") {
    const shadow = await aliasShadowReason(
      canonicalRoot,
      installName,
      destination,
    );
    if (shadow) return { ...plan, status: "collision", reason: shadow };
  }
  return plan;
}

function samePlan(left: BundledSchemaPlan, right: BundledSchemaPlan): boolean {
  return (
    left.name === right.name &&
    left.sourceName === right.sourceName &&
    left.destinationName === right.destinationName &&
    left.root === right.root &&
    left.sourceDirectory === right.sourceDirectory &&
    left.destination === right.destination &&
    left.digest === right.digest &&
    left.sourceDigest === right.sourceDigest &&
    left.installedDigest === right.installedDigest &&
    left.sourceVersion === right.sourceVersion &&
    left.sourceRevision === right.sourceRevision &&
    left.status === right.status &&
    left.targetDigest === right.targetDigest &&
    left.reason === right.reason
  );
}

async function ensureDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const metadata = await lstat(directory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    return fail(
      "BUNDLED_SCHEMA_COLLISION",
      "Target path is not a safe directory: " + directory,
    );
  }
}

export async function installBundledSchema(
  root: string,
  name: string,
  plan?: BundledSchemaPlan,
): Promise<BundledSchemaInstallResult> {
  const destinationName =
    plan?.destinationName === name ? undefined : plan?.destinationName;
  const current = await prepareBundledSchema(root, name, destinationName);
  if (plan && !samePlan(plan, current)) {
    return fail(
      "BUNDLED_SCHEMA_STALE_PLAN",
      "Bundled schema preview is stale for " +
        name +
        " as " +
        current.destinationName +
        "; preview again before Apply.",
    );
  }
  if (current.status === "collision") {
    return fail(
      "BUNDLED_SCHEMA_COLLISION",
      current.reason ??
        "Existing project schema would not be overwritten: " +
          current.destination,
    );
  }
  if (current.status === "intact")
    return {
      status: "intact",
      destination: current.destination,
      sourceName: current.sourceName,
      destinationName: current.destinationName,
      sourceDigest: current.sourceDigest,
      installedDigest: current.installedDigest,
      digest: current.digest,
    };

  const { record, snapshot: sourceSnapshot } = await verifiedSource(name);
  if (record.digest !== current.sourceDigest) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Bundled schema source changed after preview: " + name,
    );
  }
  const snapshot = transformedSnapshot(
    sourceSnapshot,
    name,
    current.destinationName,
  );
  if (targetDigest(snapshot) !== current.installedDigest) {
    return fail(
      "BUNDLED_SCHEMA_SOURCE_DRIFT",
      "Transformed bundled schema changed after preview: " +
        name +
        " as " +
        current.destinationName +
        ".",
    );
  }
  const liveRoot = await projectRoot(root);
  if (liveRoot !== current.root) {
    return fail(
      "BUNDLED_SCHEMA_STALE_PLAN",
      "Project root changed after preview for " + name + ".",
    );
  }
  await ensureDirectory(path.join(liveRoot, "openspec"));
  await ensureDirectory(path.join(liveRoot, "openspec", "schemas"));
  const beforeCreate = await prepareBundledSchema(root, name, destinationName);
  if (
    beforeCreate.status !== "missing" ||
    beforeCreate.sourceDigest !== current.sourceDigest ||
    beforeCreate.installedDigest !== current.installedDigest ||
    beforeCreate.destination !== current.destination
  ) {
    return fail(
      "BUNDLED_SCHEMA_STALE_PLAN",
      "Schema target changed after preview for " +
        name +
        " as " +
        current.destinationName +
        "; no files were written.",
    );
  }
  try {
    await mkdir(current.destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return fail(
        "BUNDLED_SCHEMA_COLLISION",
        "Schema target appeared during Apply and was not overwritten: " +
          current.destination,
      );
    }
    throw error;
  }
  for (const directory of snapshot.directories) {
    await mkdir(path.join(current.destination, ...directory.split("/")));
  }
  for (const file of snapshot.files) {
    const content = snapshot.contents.get(file.path);
    if (!content)
      return fail(
        "BUNDLED_SCHEMA_SOURCE_DRIFT",
        "Bundled schema file disappeared during Apply: " + file.path,
      );
    await writeFile(
      path.join(current.destination, ...file.path.split("/")),
      content,
      { flag: "wx" },
    );
  }
  const installed = await snapshotTree(current.destination);
  if (!sameSnapshot(installed, snapshot)) {
    return fail(
      "BUNDLED_SCHEMA_INSTALL_INCOMPLETE",
      "Installed schema does not match the transformed bundled snapshot: " +
        current.destination,
    );
  }
  return {
    status: "installed",
    destination: current.destination,
    sourceName: current.sourceName,
    destinationName: current.destinationName,
    sourceDigest: current.sourceDigest,
    installedDigest: current.installedDigest,
    digest: current.digest,
  };
}

/** Identifies an installed tree only when it exactly matches a verified bundled source after its name transform. */
export async function identifyBundledSchemaSource(
  name: string,
  directory: string,
): Promise<BundledSchemaInstallationIdentity | null> {
  if (!validDestinationName(name)) return null;
  const installed = await snapshotTree(directory);
  const candidates = schemaNames.includes(name) ? [name] : schemaNames;
  const installedFiles = JSON.stringify(
    installed.files.filter((file) => file.path !== "schema.yaml"),
  );
  const installedDirectories = JSON.stringify(installed.directories);
  for (const sourceName of candidates) {
    const bundleRecord = recordFor(sourceName);
    const expected = expectedFiles(bundleRecord);
    if (
      installedFiles !==
        JSON.stringify(
          expected.filter((file) => file.path !== "schema.yaml"),
        ) ||
      installedDirectories !== JSON.stringify(expectedDirectories(expected))
    )
      continue;
    const { record: verifiedRecord, snapshot } =
      await verifiedSource(sourceName);
    const transformed = transformedSnapshot(snapshot, sourceName, name);
    if (!sameSnapshot(installed, transformed)) continue;
    return {
      name: sourceName,
      version: manifest.source.version,
      revision: manifest.source.revision,
      digest: verifiedRecord.digest,
      installedDigest: targetDigest(transformed),
    };
  }
  return null;
}
