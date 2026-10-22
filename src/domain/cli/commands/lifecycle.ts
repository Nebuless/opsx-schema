import { archiveChange } from "../../../cli/archive.ts";
import { createChange } from "../../../cli/create.ts";
import { handoffChangeSchema } from "../../../cli/handoff.ts";
import {
  getArtifactInstructions,
  getChangeStatus,
  validateChangeAction,
} from "../../../cli/read.ts";
import {
  applyChangeRePin,
  previewChangeRePin,
  previewChangeRePinRecovery,
  recoverChangeRePin,
} from "../../../cli/repin.ts";
import type { SkillInstallHostId } from "../../../resources/index.ts";
import { isSkillInstallHostId } from "../../../resources/index.ts";
import type { SwitchRequest } from "../../../switch/index.ts";
import {
  apply as applySchemaSwitch,
  preview as previewSchemaSwitch,
} from "../../../switch/index.ts";
import { OpsxError } from "../../project.ts";
import { flags, many, one, requireCount, skillBundle } from "../shared.ts";

export async function commandChange(
  root: string,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  if (!operation)
    throw new OpsxError(
      "USAGE",
      "Usage: change <create|status|instructions|validate|archive|schema|re-pin> ...",
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
        "--skill-host must select a supported host at most once: opencode, omp, pi, atomic, senpi, omo.",
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
  if (operation === "re-pin") {
    const parsed = flags(rest, {
      "--bundle": "one",
      "--profile": "repeat",
      "--skill-host": "repeat",
      "--no-profiles": "boolean",
      "--apply-token": "one",
      "--recovery-token": "one",
      "--confirm": "one",
      "--recover": "boolean",
    });
    requireCount(
      parsed.positionals,
      2,
      2,
      "change re-pin <change> <schema> [selection flags] [--apply-token <token> --confirm <text>] | [--recover [--recovery-token <token> --confirm <text>] ]",
    );
    const hosts = many(parsed, "--skill-host");
    if (hosts.some((host) => !isSkillInstallHostId(host)))
      throw new OpsxError(
        "USAGE",
        "--skill-host must be opencode, omp, pi, atomic, senpi, or omo.",
      );
    const noProfiles = one(parsed, "--no-profiles") !== undefined;
    const applyToken = one(parsed, "--apply-token");
    const recoveryToken = one(parsed, "--recovery-token");
    const recover = one(parsed, "--recover") !== undefined;
    const hasSelection =
      one(parsed, "--bundle") !== undefined ||
      many(parsed, "--profile").length > 0 ||
      hosts.length > 0 ||
      noProfiles;
    if (applyToken && (recover || recoveryToken))
      throw new OpsxError(
        "USAGE",
        "--apply-token cannot authorize recovery; use --recover --recovery-token with its exact confirmation.",
      );
    if (recoveryToken && !recover)
      throw new OpsxError(
        "USAGE",
        "--recovery-token is only valid with --recover.",
      );
    if ((recover || recoveryToken) && hasSelection)
      throw new OpsxError(
        "USAGE",
        "Recovery uses the exact selection stored in its journal; selection flags cannot be supplied.",
      );
    const selection = {
      profiles: many(parsed, "--profile"),
      noProfiles,
      skillHosts: hosts as SkillInstallHostId[],
      ...(one(parsed, "--bundle")
        ? { bundle: skillBundle(one(parsed, "--bundle")) }
        : {}),
    };
    if (applyToken)
      return applyChangeRePin({
        rootInput: root,
        changeInput: parsed.positionals[0]!,
        schemaInput: parsed.positionals[1]!,
        applyToken,
        confirmationText: one(parsed, "--confirm"),
        selection,
      });
    if (one(parsed, "--confirm"))
      if (!recoveryToken)
        throw new OpsxError(
          "USAGE",
          "--confirm is only valid with --apply-token or --recovery-token.",
        );
    if (recover || recoveryToken) {
      if (recoveryToken)
        return recoverChangeRePin({
          rootInput: root,
          changeInput: parsed.positionals[0]!,
          schemaInput: parsed.positionals[1]!,
          recoveryToken,
          confirmationText: one(parsed, "--confirm"),
        });
      return previewChangeRePinRecovery(
        root,
        parsed.positionals[0]!,
        parsed.positionals[1]!,
      );
    }
    return previewChangeRePin(
      root,
      parsed.positionals[0]!,
      parsed.positionals[1]!,
      selection,
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
    "schema switch <name> [--profile <agent-id> ...] [--migrate <change> ...] [--skill-host opencode|omp|pi|atomic|senpi|omo ...] [--bundle default|recommended|all] [--apply-token <token>]";
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
        "--skill-host must be opencode, omp, pi, atomic, senpi, or omo.",
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
