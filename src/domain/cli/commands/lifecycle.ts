import { OpsxError } from "../../project.ts";
import { createChange } from "../../../cli/create.ts";
import {
  getArtifactInstructions,
  getChangeStatus,
  validateChangeAction,
} from "../../../cli/read.ts";
import { archiveChange } from "../../../cli/archive.ts";
import { handoffChangeSchema } from "../../../cli/handoff.ts";
import { flags, many, one, requireCount, skillBundle } from "../shared.ts";
import { isSkillInstallHostId } from "../../../resources/index.ts";
import type { SkillInstallHostId } from "../../../resources/index.ts";
import {
  preview as previewSchemaSwitch,
  apply as applySchemaSwitch,
} from "../../../switch/index.ts";
import type { SwitchRequest } from "../../../switch/index.ts";

export async function commandChange(
  root: string,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  if (!operation)
    throw new OpsxError(
      "USAGE",
      "Usage: change <create|status|instructions|validate|archive|schema> ...",
    );
  if (operation === "create") {
    const parsed = flags(rest, {
      "--description": "one",
      "--goal": "one",
      "--schema": "one",
      "--profile": "repeat",
      "--skill-host": "repeat",
      "--bundle": "one",
      "--apply-token": "one",
    });
    requireCount(
      parsed.positionals,
      1,
      1,
      "change create <name> --description <text> [--goal <text>] [--schema <name>] [--profile <agent-id> ...] [--skill-host <host> ...] [--bundle default|recommended|all] [--apply-token <token>]",
    );
    const description = one(parsed, "--description");
    if (!description)
      throw new OpsxError(
        "USAGE",
        "change create requires --description <text>.",
      );
    const apply = one(parsed, "--apply-token");
    const selectedHosts = many(parsed, "--skill-host");
    if (
      selectedHosts.some((host) => !isSkillInstallHostId(host)) ||
      new Set(selectedHosts).size !== selectedHosts.length
    )
      throw new OpsxError(
        "USAGE",
        "--skill-host must select a supported host at most once: opencode, omp, pi, atomic, senpi.",
      );
    if (
      (many(parsed, "--profile").length > 0 || selectedHosts.length > 0) &&
      !one(parsed, "--bundle")
    )
      throw new OpsxError(
        "USAGE",
        "Explicit change selection requires --bundle default|recommended|all.",
      );
    return createChange(
      root,
      {
        change: parsed.positionals[0]!,
        description,
        goal: one(parsed, "--goal"),
        schema: one(parsed, "--schema"),
        ...(many(parsed, "--profile").length
          ? { profiles: many(parsed, "--profile") }
          : {}),
        ...(selectedHosts.length
          ? { skillHosts: selectedHosts as SkillInstallHostId[] }
          : {}),
        ...(one(parsed, "--bundle")
          ? { skillBundle: skillBundle(one(parsed, "--bundle")) }
          : {}),
      },
      apply ? { applyToken: apply } : {},
    );
  }
  if (
    operation === "status" ||
    operation === "validate" ||
    operation === "archive"
  ) {
    const parsed = flags(
      rest,
      operation === "archive" ? { "--apply-token": "one" } : {},
    );
    requireCount(
      parsed.positionals,
      1,
      1,
      `change ${operation} <change>${operation === "archive" ? " [--apply-token <token>]" : ""}`,
    );
    const name = parsed.positionals[0]!;
    if (operation === "status") return getChangeStatus(root, name);
    if (operation === "validate") return validateChangeAction(root, name);
    const token = one(parsed, "--apply-token");
    return archiveChange(root, name, token ? { applyToken: token } : {});
  }
  if (operation === "instructions") {
    const parsed = flags(rest, {});
    requireCount(
      parsed.positionals,
      2,
      2,
      "change instructions <change> <artifact>",
    );
    return getArtifactInstructions(
      root,
      parsed.positionals[0]!,
      parsed.positionals[1]!,
    );
  }
  if (operation === "schema") {
    const parsed = flags(rest, { "--apply-token": "one" });
    requireCount(
      parsed.positionals,
      2,
      2,
      "change schema <change> <schema> [--apply-token <token>]",
    );
    const token = one(parsed, "--apply-token");
    return handoffChangeSchema(
      root,
      parsed.positionals[0]!,
      parsed.positionals[1]!,
      token ? { applyToken: token } : {},
    );
  }
  throw new OpsxError(
    "USAGE",
    `Unknown change operation ${operation}. Run opsx-schema --help for commands.`,
  );
}

export async function commandSchema(
  root: string,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  const usage =
    "schema switch <name> [--profile <agent-id> ...] [--migrate <change> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]";
  if (operation !== "switch") throw new OpsxError("USAGE", "Usage: " + usage);
  const parsed = flags(rest, {
    "--profile": "repeat",
    "--migrate": "repeat",
    "--skill-host": "repeat",
    "--bundle": "one",
    "--apply-token": "one",
  });
  requireCount(parsed.positionals, 1, 1, usage);
  const skillHosts: NonNullable<SwitchRequest["skillHosts"]> = [];
  for (const host of many(parsed, "--skill-host")) {
    if (!isSkillInstallHostId(host))
      throw new OpsxError(
        "USAGE",
        "--skill-host must be opencode, omp, pi, atomic, or senpi.",
      );
    if (skillHosts.includes(host))
      throw new OpsxError(
        "USAGE",
        `--skill-host ${host} may be supplied only once.`,
      );
    skillHosts.push(host);
  }
  const request: SwitchRequest = {
    schema: parsed.positionals[0]!,
    profiles: many(parsed, "--profile"),
    migrations: many(parsed, "--migrate"),
    ...(one(parsed, "--bundle")
      ? { skillBundle: skillBundle(one(parsed, "--bundle")) }
      : {}),
    ...(skillHosts.length > 0 ? { skillHosts } : {}),
  };
  const plan = await previewSchemaSwitch(root, request);
  const token = one(parsed, "--apply-token");
  if (token !== undefined) {
    if (token !== plan.token)
      throw new OpsxError(
        "APPLY_TOKEN_STALE",
        "The schema switch token is stale or belongs to another request; preview again.",
      );
    return {
      phase: "applied",
      target: { root, schema: request.schema },
      result: await applySchemaSwitch(root, request, token),
    };
  }
  return {
    phase: "preview",
    target: { root, schema: request.schema },
    plan,
    confirmation: {
      exactTarget: `${root} -> ${request.schema}`,
      token: plan.token,
    },
  };
}
