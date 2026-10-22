import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import { loadSkillBundles } from "../resources/index.ts";

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
  skills: Array<{ repository: string; path: string; revision?: string }>;
}

export async function schemas(client: OpenSpecClient): Promise<SchemaEntry[]> {
  const result = await client.json<SchemaEntry[]>("schemas");
  if (!Array.isArray(result))
    throw new OpsxError(
      "OPENSPEC_RESPONSE",
      "OpenSpec schema catalog is malformed.",
    );
  return result;
}

export async function schema(
  client: OpenSpecClient,
  name: string,
): Promise<SchemaResolution> {
  const result = await client.json<SchemaResolution>("schema", "which", name);
  if (
    result.name !== name ||
    typeof result.path !== "string" ||
    !Array.isArray(result.shadows)
  ) {
    throw new OpsxError(
      "OPENSPEC_RESPONSE",
      `OpenSpec schema resolution is malformed for ${name}.`,
    );
  }
  return result;
}

export async function resources(
  client: OpenSpecClient,
  name: string,
): Promise<ResourceManifest> {
  const resolved = await schema(client, name);
  const skills = [
    ...((await loadSkillBundles(resolved.path)).declarations.default ?? []),
  ];
  return { schema: resolved, skills };
}
