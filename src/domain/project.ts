import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export class OpsxError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "OpsxError";
  }
}

async function hasConfig(root: string): Promise<boolean> {
  try {
    return (await stat(path.join(root, "openspec", "config.yaml"))).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveProject(start: string, explicit = false): Promise<string> {
  let current: string;
  try {
    current = await realpath(start);
  } catch {
    throw new OpsxError("PROJECT_NOT_FOUND", `Project path does not exist: ${start}`);
  }
  if (!(await stat(current)).isDirectory()) {
    throw new OpsxError("PROJECT_NOT_FOUND", `Project path is not a directory: ${start}`);
  }
  for (;;) {
    if (await hasConfig(current)) return current;
    if (explicit) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new OpsxError("PROJECT_NOT_FOUND", `No OpenSpec project at ${start}${explicit ? "" : " or a parent"}; initialize OpenSpec or pass --project <root>.`);
}

export async function defaultSchema(root: string): Promise<string> {
  const file = await readFile(path.join(root, "openspec", "config.yaml"), "utf8");
  let config: unknown;
  try {
    config = YAML.parse(file);
  } catch {
    throw new OpsxError("PROJECT_CONFIG", "OpenSpec project config is invalid YAML.");
  }
  if (config == null) return "spec-driven";
  if (typeof config !== "object" || Array.isArray(config)) throw new OpsxError("PROJECT_CONFIG", "OpenSpec project config must be a mapping.");
  const name = (config as Record<string, unknown>).schema;
  if (name == null) return "spec-driven";
  if (typeof name !== "string" || !name.trim()) throw new OpsxError("PROJECT_CONFIG", "OpenSpec project schema must be a nonempty name.");
  return name;
}
