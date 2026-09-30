import { OpenSpecClient } from "../../../openspec/client.ts";
import { schema as resolveSchema } from "../../../catalog/schemas.ts";
import { detailedChanges } from "../../snapshot.ts";
import { defaultSchema } from "../../project.ts";
import {
  listBundledSchemas,
  inspectBundledSchema,
} from "../../../bundled/index.ts";
import { validateChange } from "../../../validation/index.ts";
import { doctorSkills } from "../../../resources/index.ts";
import {
  validateBundledSchema,
  validateProjectSchema,
  mcpCatalogCheck,
} from "../checks.ts";
import { validationPassed, errorMessage, optionalProject } from "../shared.ts";
import type { GlobalOptions } from "../shared.ts";
import { verifiedPinOptions } from "../skill-pins.ts";

export async function doctorProject(root: string): Promise<{
  ok: boolean;
  project: string;
  openSpec: unknown;
  skills: unknown;
  mcp: unknown;
  checks: Array<Record<string, unknown>>;
}> {
  const checks: Array<Record<string, unknown>> = [];
  let openSpec: unknown = null;
  try {
    openSpec = await new OpenSpecClient(root).json("doctor");
    checks.push({
      name: "openspec",
      ok: validationPassed(openSpec),
      result: openSpec,
    });
  } catch (error) {
    checks.push({ name: "openspec", ok: false, error: errorMessage(error) });
  }
  let skills: unknown = null;
  try {
    skills = await doctorSkills(root, verifiedPinOptions);
    const report = skills as { complete?: boolean };
    checks.push({
      name: "skills",
      ok: report.complete === true,
      result: skills,
    });
  } catch (error) {
    checks.push({ name: "skills", ok: false, error: errorMessage(error) });
  }
  let mcp: unknown = null;
  try {
    const name = await defaultSchema(root);
    const resolved = await resolveSchema(new OpenSpecClient(root), name);
    mcp = await mcpCatalogCheck(resolved.path, root);
    checks.push({ name: `mcp:${name}`, ok: true, result: mcp });
  } catch (error) {
    checks.push({ name: "mcp", ok: false, error: errorMessage(error) });
  }
  return {
    ok: checks.every((check) => check.ok === true),
    project: root,
    openSpec,
    skills,
    mcp,
    checks,
  };
}

async function verify(root?: string): Promise<{
  ok: boolean;
  project?: string;
  checks: Array<Record<string, unknown>>;
  failures: Array<Record<string, unknown>>;
  separateChecks?: string[];
}> {
  const checks: Array<Record<string, unknown>> = [];
  if (root) {
    const client = new OpenSpecClient(root);
    try {
      const doctor = await client.json("doctor");
      checks.push({
        name: "doctor",
        ok: validationPassed(doctor),
        result: doctor,
      });
    } catch (error) {
      checks.push({ name: "doctor", ok: false, error: errorMessage(error) });
    }
    try {
      const selected = await defaultSchema(root);
      const result = await validateProjectSchema(root, selected);
      checks.push({ name: `schema:${selected}`, ...result });
    } catch (error) {
      checks.push({ name: "schema", ok: false, error: errorMessage(error) });
    }
    let active: Array<{ name: string }> = [];
    try {
      active = await detailedChanges(root, client);
    } catch (error) {
      checks.push({ name: "changes", ok: false, error: errorMessage(error) });
    }
    for (const change of active) {
      try {
        const result = await validateChange(root, change.name);
        checks.push({ name: `change:${change.name}`, ...result });
      } catch (error) {
        checks.push({
          name: `change:${change.name}`,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
    try {
      const report = await doctorSkills(root, verifiedPinOptions);
      checks.push({ name: "skills", ok: report.complete, result: report });
    } catch (error) {
      checks.push({ name: "skills", ok: false, error: errorMessage(error) });
    }
    try {
      const name = await defaultSchema(root);
      const resolved = await resolveSchema(client, name);
      const mcp = await mcpCatalogCheck(resolved.path, root);
      checks.push({ name: `mcp:${name}`, ok: true, result: mcp });
    } catch (error) {
      checks.push({ name: "mcp", ok: false, error: errorMessage(error) });
    }
  } else {
    for (const name of listBundledSchemas()) {
      try {
        checks.push({
          name: `schema:${name}`,
          ...(await validateBundledSchema(name)),
        });
        const inspection = await inspectBundledSchema(name);
        if (inspection.hasMcp)
          checks.push({
            name: `mcp:${name}`,
            ...(await mcpCatalogCheck(inspection.sourceDirectory)),
          });
      } catch (error) {
        checks.push({
          name: `schema:${name}`,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
  }
  const failures = checks.flatMap((check) => {
    if (check.ok === true) return [];
    const result =
      check.result && typeof check.result === "object"
        ? (check.result as Record<string, unknown>)
        : undefined;
    const findings = Array.isArray(check.findings)
      ? check.findings
      : Array.isArray(result?.findings)
        ? result.findings
        : undefined;
    const diagnostics = Array.isArray(result?.diagnostics)
      ? result.diagnostics
      : undefined;
    return [
      {
        name: check.name,
        ...(typeof check.error === "string" ? { error: check.error } : {}),
        ...(findings ? { findings } : {}),
        ...(diagnostics ? { diagnostics } : {}),
      },
    ];
  });
  return {
    ok: checks.every((check) => check.ok === true),
    ...(root ? { project: root } : {}),
    checks,
    failures,
    ...(root
      ? { separateChecks: ["adapters inspect <host> --scope project"] }
      : {}),
  };
}

export async function commandVerify(options: GlobalOptions): Promise<unknown> {
  const root = await optionalProject(options);
  return verify(root ?? undefined);
}
