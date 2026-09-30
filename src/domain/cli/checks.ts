import { access, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenSpecClient } from "../../openspec/client.ts";
import { schema as resolveSchema } from "../../catalog/schemas.ts";
import { inspectBundledSchema } from "../../bundled/index.ts";
import { listMcpCatalog } from "../../mcp/index.ts";
import { validationPassed } from "./shared.ts";

export async function validateBundledSchema(name: string): Promise<{
  schema: string;
  source: "bundled";
  ok: boolean;
  result: unknown;
}> {
  const inspection = await inspectBundledSchema(name);
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "opsx-schema-validation-"),
  );
  try {
    const target = path.join(temporary, "openspec", "schemas", name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(inspection.sourceDirectory, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await writeFile(
      path.join(temporary, "openspec", "config.yaml"),
      `schema: ${name}\n`,
      { flag: "wx" },
    );
    const result = await new OpenSpecClient(temporary).json(
      "schema",
      "validate",
      name,
    );
    return {
      schema: name,
      source: "bundled",
      ok: validationPassed(result),
      result,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function validateProjectSchema(
  root: string,
  name: string,
): Promise<{
  schema: string;
  source: "project";
  ok: boolean;
  result: unknown;
}> {
  const client = new OpenSpecClient(root);
  const resolved = await resolveSchema(client, name);
  const result = await client.json("schema", "validate", resolved.name);
  return {
    schema: resolved.name,
    source: "project",
    ok: validationPassed(result),
    result,
  };
}

export async function mcpCatalogCheck(
  schemaDir: string,
  targetDir?: string,
): Promise<{ ok: true; skipped?: true; catalog?: unknown }> {
  try {
    await access(path.join(schemaDir, "mcp.yaml"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { ok: true, skipped: true };
    throw error;
  }
  return {
    ok: true,
    catalog: await listMcpCatalog({
      schemaDir,
      ...(targetDir ? { targetDir } : {}),
    }),
  };
}
