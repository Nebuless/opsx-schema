import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";

export interface SchemaEntry {
  name: string;
  description?: string;
  artifacts?: string[];
  source: string;
}

export interface SchemaResolution {
  name: string;
  source: string;
  path: string;
  shadows: unknown[];
}

export interface ResourceManifest {
  schema: SchemaResolution;
  skills: Array<{ repository: string; path: string }>;
}

export async function schemas(client: OpenSpecClient): Promise<SchemaEntry[]> {
  const result = await client.json<SchemaEntry[]>("schemas");
  if (!Array.isArray(result)) throw new OpsxError("OPENSPEC_RESPONSE", "OpenSpec schema catalog is malformed.");
  return result;
}

export async function schema(client: OpenSpecClient, name: string): Promise<SchemaResolution> {
  const result = await client.json<SchemaResolution>("schema", "which", name);
  if (result.name !== name || typeof result.path !== "string" || !Array.isArray(result.shadows)) {
    throw new OpsxError("OPENSPEC_RESPONSE", `OpenSpec schema resolution is malformed for ${name}.`);
  }
  return result;
}

export async function resources(client: OpenSpecClient, name: string): Promise<ResourceManifest> {
  const resolved = await schema(client, name);
  const root = await realpath(resolved.path);
  const manifest = path.join(root, "skills.txt");
  let source: string;
  try {
    const actual = await realpath(manifest);
    if (path.dirname(actual) !== root) throw new OpsxError("RESOURCE_UNSAFE", `Skill manifest escapes schema ${name}.`);
    source = await readFile(actual, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    source = "";
  }
  const skills = source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).map(line => {
    if (/^[\w.-]+$/.test(line) && line !== "." && line !== "..") {
      return { repository: "intent-driven-dev/skills", path: ".agents/skills/" + line };
    }
    const [repository, resource, ...extra] = line.split(/\s+/);
    if (extra.length || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !resource || resource.startsWith("/") || resource.split("/").some(part => part === ".." || part === "." || !part)) {
      throw new OpsxError("RESOURCE_INVALID", `Invalid skill manifest entry for ${name}: ${line}`);
    }
    return { repository, path: resource };
  });
  return { schema: resolved, skills };
}
