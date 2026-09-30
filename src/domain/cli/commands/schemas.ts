import { OpenSpecClient } from "../../../openspec/client.ts";
import { schemas } from "../../../catalog/schemas.ts";
import { defaultSchema, OpsxError, resolveProject } from "../../project.ts";
import {
  inspectBundledSchema,
  installBundledSchema,
  listBundledSchemas,
  prepareBundledSchema,
} from "../../../bundled/index.ts";
import { resolveRevision } from "../../../revisions/index.ts";
import { validateBundledSchema, validateProjectSchema } from "../checks.ts";
import {
  applyToken,
  flags,
  one,
  optionalProject,
  requireCount,
} from "../shared.ts";
import type { GlobalOptions } from "../shared.ts";

export async function commandSchemas(
  options: GlobalOptions,
  args: string[],
): Promise<unknown> {
  const [subcommand, ...rest] = args;
  if (subcommand === "bundled") {
    requireCount(rest, 0, 1, "schemas bundled [name]");
    return rest[0]
      ? inspectBundledSchema(rest[0])
      : Promise.all(
          listBundledSchemas().map((name) => inspectBundledSchema(name)),
        );
  }
  if (subcommand === "install") {
    const parsed = flags(rest, { "--as": "one", "--apply-token": "one" });
    requireCount(
      parsed.positionals,
      1,
      1,
      "schemas install <bundled-schema-name> --project <root> [--as <distinct-name>] [--apply-token <token>]",
    );
    const name = parsed.positionals[0]!;
    if (options.project === undefined)
      throw new OpsxError(
        "USAGE",
        "schemas install requires --project <root>; it never guesses an installation target.",
      );
    const root = await resolveProject(options.project, true);
    await new OpenSpecClient(root).ensureSupported();
    const destination = one(parsed, "--as");
    const plan = await prepareBundledSchema(root, name, destination);
    const binding = { root, name, destination: destination ?? name, plan };
    const token = applyToken("schemas.install", binding);
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The apply token does not match this exact, current schema installation preview.",
        );
      return {
        phase: "applied",
        target: plan.destination,
        result: await installBundledSchema(root, name, plan),
      };
    }
    return {
      phase: "preview",
      target: plan.destination,
      plan,
      confirmation: { exactTarget: plan.destination, token },
    };
  }
  if (subcommand === "validate") {
    requireCount(rest, 0, 1, "schemas validate [name]");
    const root = await optionalProject(options);
    if (root) {
      const name = rest[0] ?? (await defaultSchema(root));
      return await validateProjectSchema(root, name);
    }
    if (rest[0]) return await validateBundledSchema(rest[0]);
    const checks = await Promise.all(
      listBundledSchemas().map(validateBundledSchema),
    );
    return { ok: checks.every((check) => check.ok), checks };
  }

  const root = await optionalProject(options);
  if (subcommand && root) {
    requireCount(args, 1, 1, "schemas [name]");
    return resolveRevision(new OpenSpecClient(root), subcommand);
  }
  if (subcommand && !root) {
    requireCount(args, 1, 1, "schemas [name]");
    return inspectBundledSchema(subcommand);
  }
  if (root) return schemas(new OpenSpecClient(root));
  return listBundledSchemas().map((name) => ({ name, source: "bundled" }));
}
