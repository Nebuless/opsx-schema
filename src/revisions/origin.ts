import { execFile } from "node:child_process";
import { devNull } from "node:os";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { OpsxError } from "../domain/project.ts";

export interface GitOriginWitness {
  version: 1;
  commonDirectory: string;
  dev: string;
  ino: string;
  relativeSchemaPath: string;
}

const exec = promisify(execFile);

function originError(message: string): OpsxError {
  return new OpsxError(
    "REVISION_ORIGIN",
    message +
      " Re-pin the schema from a valid project checkout after correcting the origin.",
  );
}

export function validOrigin(
  value: unknown,
  name: string,
): value is GitOriginWitness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const witness = value as Record<string, unknown>;
  return (
    Object.keys(witness).length === 5 &&
    Object.keys(witness).every((key) =>
      [
        "version",
        "commonDirectory",
        "dev",
        "ino",
        "relativeSchemaPath",
      ].includes(key),
    ) &&
    witness.version === 1 &&
    typeof witness.commonDirectory === "string" &&
    !witness.commonDirectory.includes("\0") &&
    !/[\r\n]/.test(witness.commonDirectory) &&
    path.isAbsolute(witness.commonDirectory) &&
    path.normalize(witness.commonDirectory) === witness.commonDirectory &&
    typeof witness.dev === "string" &&
    /^(0|[1-9][0-9]*)$/.test(witness.dev) &&
    typeof witness.ino === "string" &&
    /^(0|[1-9][0-9]*)$/.test(witness.ino) &&
    witness.relativeSchemaPath === "openspec/schemas/" + name
  );
}

export function projectSchemaSourceRoot(
  source: string,
  name: string,
): string | undefined {
  if (!path.isAbsolute(source) || path.normalize(source) !== source)
    return undefined;
  const root = path.resolve(source, "../../..");
  return path.join(root, "openspec", "schemas", name) === source
    ? root
    : undefined;
}

export function originMatchesSource(
  source: string,
  value: unknown,
  name: string,
): boolean {
  return (
    validOrigin(value, name) &&
    projectSchemaSourceRoot(source, name) !== undefined
  );
}

async function git(root: string, args: string[]): Promise<string> {
  const redirectingGitVariables = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_CONFIG",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_SYSTEM",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_CEILING_DIRECTORIES",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_INDEX_FILE",
    "GIT_EXEC_PATH",
  ];
  if (redirectingGitVariables.some((key) => process.env[key] !== undefined))
    throw originError(
      "Git environment variables can redirect repository discovery.",
    );
  try {
    const result = await exec("git", args, {
      cwd: root,
      env: {
        ...process.env,
        PWD: root,
        GIT_CONFIG_COUNT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: devNull,
        GIT_TERMINAL_PROMPT: "0",
      },
      encoding: "utf8",
      timeout: 3_000,
      maxBuffer: 64 * 1024,
    });
    return result.stdout;
  } catch {
    throw originError("Git origin could not be verified.");
  }
}

async function existingGitEntry(root: string): Promise<boolean> {
  try {
    await lstat(path.join(root, ".git"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function verifyGitOrigin(
  rootPath: string,
  sourcePath: string,
  name: string,
): Promise<GitOriginWitness | undefined> {
  const root = path.resolve(rootPath);
  if (!(await existingGitEntry(root))) return undefined;
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    throw originError("Project root could not be resolved.");
  }
  if (canonicalRoot !== root) throw originError("Project root is redirected.");

  const expected = "openspec/schemas/" + name;
  const expectedRoot = path.join(root, "openspec", "schemas", name);
  if (path.resolve(sourcePath) !== expectedRoot)
    throw originError(
      "Project schema selection does not use its exact expected path.",
    );

  const gitEntry = path.join(root, ".git");
  const openspec = path.join(root, "openspec");
  const schemas = path.join(openspec, "schemas");
  const schemaDirectory = expectedRoot;
  const schemaFile = path.join(schemaDirectory, "schema.yaml");
  for (const target of [
    gitEntry,
    openspec,
    schemas,
    schemaDirectory,
    schemaFile,
  ]) {
    let info;
    try {
      info = await lstat(target);
    } catch {
      throw originError("Project Git schema path is missing: " + target + ".");
    }
    if (info.isSymbolicLink())
      throw originError(
        "Project Git schema path is redirected: " + target + ".",
      );
  }
  if (
    !(await lstat(openspec)).isDirectory() ||
    !(await lstat(schemas)).isDirectory() ||
    !(await lstat(schemaDirectory)).isDirectory() ||
    !(await lstat(schemaFile)).isFile()
  )
    throw originError(
      "Project Git schema path contains an unexpected file type.",
    );

  for (const directory of [openspec, schemas, schemaDirectory]) {
    if (await existingGitEntry(directory))
      throw originError(
        "A nested Git repository cannot witness the project schema origin.",
      );
  }

  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  const gitDirOutput = await git(root, ["rev-parse", "--absolute-git-dir"]);
  const commonOutput = await git(root, ["rev-parse", "--git-common-dir"]);
  const gitDirValue = gitDirOutput.endsWith("\n")
    ? gitDirOutput.slice(0, -1)
    : "";
  const commonValue = commonOutput.endsWith("\n")
    ? commonOutput.slice(0, -1)
    : "";
  if (
    !gitDirValue ||
    /[\r\n]/.test(gitDirValue) ||
    !path.isAbsolute(gitDirValue) ||
    !commonValue ||
    /[\r\n]/.test(commonValue)
  )
    throw originError("Git returned malformed repository metadata.");
  const gitDir = path.resolve(gitDirValue);
  const commonDir = path.resolve(root, commonValue);
  if (top !== root + "\n")
    throw originError("Git root differs from the project root.");
  if (
    (await realpath(gitDir)) !== gitDir ||
    (await realpath(commonDir)) !== commonDir
  )
    throw originError("Git metadata path is redirected.");

  const entry = await lstat(gitEntry);
  if (entry.isDirectory()) {
    if (gitDir !== commonDir || gitDir !== (await realpath(gitEntry)))
      throw originError("Main Git directory linkage is inconsistent.");
  } else if (entry.isFile()) {
    const pointer = await readFile(gitEntry, "utf8");
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(pointer);
    if (
      !match ||
      path.resolve(root, match[1]) !== gitDir ||
      (await realpath(path.resolve(root, match[1]))) !== gitDir
    )
      throw originError("Linked Git directory pointer is invalid.");
    const worktrees = path.join(commonDir, "worktrees");
    if (
      path.dirname(gitDir) !== worktrees ||
      (await lstat(worktrees)).isSymbolicLink()
    )
      throw originError(
        "Linked Git directory is outside the common worktrees.",
      );
    const commondirPath = path.join(gitDir, "commondir");
    const linkedBackrefPath = path.join(gitDir, "gitdir");
    if (
      (await lstat(commondirPath)).isSymbolicLink() ||
      (await lstat(linkedBackrefPath)).isSymbolicLink()
    )
      throw originError("Linked Git metadata back-reference is redirected.");
    const commonBackref = await readFile(commondirPath, "utf8");
    if (
      !/^[^\r\n]+\r?\n?$/.test(commonBackref) ||
      (await realpath(path.resolve(gitDir, commonBackref.trim()))) !== commonDir
    )
      throw originError(
        "Linked Git common-directory back-reference is invalid.",
      );
    const worktreeBackref = await readFile(linkedBackrefPath, "utf8");
    if (
      !/^[^\r\n]+\r?\n?$/.test(worktreeBackref) ||
      path.resolve(worktreeBackref.trim()) !== gitEntry ||
      (await realpath(worktreeBackref.trim())) !== gitEntry
    )
      throw originError("Linked checkout back-reference is invalid.");
  } else {
    throw originError(
      "Git directory pointer is not a regular directory or file.",
    );
  }

  const worktreeList = await git(root, [
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ]);
  if (!worktreeList.split("\0").includes("worktree " + root))
    throw originError("Git worktree back-reference is missing.");
  const tracked = await git(root, [
    "ls-files",
    "-z",
    "--error-unmatch",
    "--",
    expected + "/schema.yaml",
  ]);
  if (tracked !== expected + "/schema.yaml\0")
    throw originError(
      "Project schema.yaml is not tracked by this Git project.",
    );

  const identity = await stat(commonDir, { bigint: true });
  if (!identity.isDirectory())
    throw originError("Git common directory is not a real directory.");
  return {
    version: 1,
    commonDirectory: commonDir,
    dev: identity.dev.toString(),
    ino: identity.ino.toString(),
    relativeSchemaPath: expected,
  };
}

export async function gitOrigin(
  rootPath: string,
  sourcePath: string,
  name: string,
): Promise<GitOriginWitness | undefined> {
  try {
    return await verifyGitOrigin(rootPath, sourcePath, name);
  } catch (error) {
    if (error instanceof OpsxError && error.code === "REVISION_ORIGIN")
      throw error;
    throw originError(
      "Git repository metadata is missing, redirected or malformed.",
    );
  }
}

export async function legacyCommonDirectory(
  sourcePath: string,
  rootPath: string,
  name: string,
): Promise<GitOriginWitness | undefined> {
  try {
    return await gitOrigin(rootPath, sourcePath, name);
  } catch {
    return undefined;
  }
}

export async function sameCommonDirectory(
  witness: GitOriginWitness,
  live: GitOriginWitness,
): Promise<boolean> {
  let recordedPath: string;
  try {
    recordedPath = await realpath(witness.commonDirectory);
  } catch {
    return false;
  }
  const identity = await stat(recordedPath, { bigint: true }).catch(() => null);
  return (
    recordedPath === witness.commonDirectory &&
    identity?.isDirectory() === true &&
    identity.dev.toString() === witness.dev &&
    identity.ino.toString() === witness.ino &&
    live.commonDirectory === witness.commonDirectory &&
    live.dev === witness.dev &&
    live.ino === witness.ino &&
    live.relativeSchemaPath === witness.relativeSchemaPath
  );
}
