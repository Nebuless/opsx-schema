#!/usr/bin/env bun
import { encode } from "@toon-format/toon";
import { startDashboard } from "../tui/app.tsx";
import { OpsxError } from "./project.ts";
import {
  errorMessage,
  globalOptions,
  optionalProject,
  projectRoot,
  requireCount,
  statusOf,
} from "./cli/shared.ts";
import type { GlobalOptions } from "./cli/shared.ts";
import { commandReads } from "./cli/commands/reads.ts";
import { commandSchemas } from "./cli/commands/schemas.ts";
import { commandChange, commandSchema } from "./cli/commands/lifecycle.ts";
import { commandSkills } from "./cli/commands/skills.ts";
import { commandMcp } from "./cli/commands/mcp.ts";
import { commandAdapters } from "./cli/commands/adapters.ts";
import { commandVerify, doctorProject } from "./cli/commands/diagnostics.ts";

const HELP = `opsx-schema — project and OpenSpec workflow CLI

Usage: opsx-schema [--project <root>] [--json] <command> [arguments]
       opsx-schema [--project <root>]                 Open the dashboard on a TTY
       opsx-schema --help

Existing reads (nearest OpenSpec project by default; --project selects an exact root):
  status
  changes [name] [file]
  archive [name] [file]
  schemas [name]                    OpenSpec schema catalog or one resolved revision
  resources [schema]
  doctor
    OpenSpec, managed-skill, and declared MCP catalog diagnostics

Change lifecycle (mutations preview by default):
  change create <name> --description <text> [--goal <text>] [--schema <name>] [--profile <agent-id> ...] [--skill-host <host> ...] [--bundle default|recommended|all] [--apply-token <token>]
  change status <change>
  change instructions <change> <artifact>
  change validate <change>
  change archive <change> [--apply-token <token>]
  change schema <change> <schema> [--apply-token <token>]

Schemas and profiles:
  schema switch <name> [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--migrate <change> ...] [--apply-token <token>]
  schemas bundled [name]             List or inspect bundled schema assets (works outside projects)
  schemas install <bundled-schema-name> --project <root> [--as <distinct-name>] [--apply-token <token>]
    Install packaged schema files only; does not activate the project default or install skills/adapters.
  schemas validate [name]            Validate a schema available to OpenSpec

Skills (profile selects named agent; bundle selects declared skill tier):
  skills inspect [schema] [--bundle default|recommended|all]
  skills doctor
  skills install [schema] [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]
    Install the selected declared skill tier; use schema switch to activate project default and skills together.
  skills reconcile <change> --revision-digest <sha256> --bundle default|recommended|all [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--apply-token <token>]
  skills replace <project-relative-target> --schema <installed-name> --bundle default|recommended|all --backup-id <unique-id> [--apply-token <token>]
  skills replace inspect <backup-id>
  skills restore <backup-id> [--apply-token <token>]
  skills disable <project-relative-target> [--apply-token <token>]

MCP providers:
  mcp list [--schema <name>] [--target-dir <dir>]
  mcp inspect <provider> [--schema <name>] [--target-dir <dir>]
  mcp install <provider> --host atomic|omp|opencode|pi|senpi [--schema <name>] [--target-dir <dir>] [--apply-token <token>]

Compound adapters:
  adapters inspect <host> --scope project [--schema <name>]
  adapters install <host> --scope project [--schema <name>] [--apply-token <token>]
    Install host command adapters separately from schema assets and skill tiers.

Verification:
  verify                              Aggregate OpenSpec schema, active-change, skill, and MCP checks

Mutations never apply from --yes. Run once to preview, then repeat the exact command with its fresh
--apply-token. MCP apply additionally requires an interactive TTY and explicit typed approval of the
provider safety metadata, selected host, target path, and exact config diff.

All commands support --json for one schemaVersion=1 envelope. Errors are actionable and nonzero.
`;

async function execute(
  options: GlobalOptions,
): Promise<{ command: string; data: unknown }> {
  const [command, ...args] = options.words;
  if (!command) {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new OpsxError(
        "TTY_REQUIRED",
        "The dashboard needs an interactive terminal. Use opsx-schema --help for noninteractive commands.",
      );
    const root = await projectRoot(options);
    await startDashboard(root);
    return { command: "dashboard", data: { project: root, started: true } };
  }
  if (command === "schemas")
    return {
      command:
        args[0] === "validate"
          ? "schemas validate"
          : args[0] === "install"
            ? "schemas install"
            : "schemas",
      data: await commandSchemas(options, args),
    };
  if (command === "verify") {
    requireCount(args, 0, 0, "verify");
    return { command, data: await commandVerify(options) };
  }
  if (command === "help") return { command: "help", data: { help: HELP } };
  const packageOnly = command === "mcp";
  const root = packageOnly
    ? await optionalProject(options)
    : await projectRoot(options);
  switch (command) {
    case "status":
    case "changes":
    case "archive":
    case "resources":
      return { command, data: await commandReads(root!, command, args) };
    case "schemas":
      return { command, data: await commandSchemas(options, args) };
    case "doctor":
      requireCount(args, 0, 0, "doctor");
      return { command, data: await doctorProject(root!) };
    case "change":
      return {
        command: `change ${args[0] ?? ""}`.trim(),
        data: await commandChange(root!, args),
      };
    case "schema":
      return {
        command: `schema ${args[0] ?? ""}`.trim(),
        data: await commandSchema(root!, args),
      };
    case "skills":
      return {
        command: `skills ${args[0] ?? ""}`.trim(),
        data: await commandSkills(root!, args),
      };
    case "mcp":
      return {
        command: `mcp ${args[0] ?? ""}`.trim(),
        data: await commandMcp(root, args),
      };
    case "adapters":
      return {
        command: `adapters ${args[0] ?? ""}`.trim(),
        data: await commandAdapters(root!, args),
      };
    default:
      throw new OpsxError(
        "USAGE",
        `Unknown command ${command}. Run opsx-schema --help for commands.`,
      );
  }
}

async function main(): Promise<void> {
  let json = process.argv.includes("--json");
  let command = "";
  try {
    const parsed = globalOptions(process.argv.slice(2));
    json = parsed.json;
    if (parsed.help) {
      process.stdout.write(
        json
          ? JSON.stringify({
              schemaVersion: 1,
              command: "help",
              ok: true,
              data: { help: HELP },
            }) + "\n"
          : HELP,
      );
      return;
    }
    if (parsed.words[0] === "help") {
      requireCount(parsed.words.slice(1), 0, 0, "help");
      process.stdout.write(
        json
          ? JSON.stringify({
              schemaVersion: 1,
              command: "help",
              ok: true,
              data: { help: HELP },
            }) + "\n"
          : HELP,
      );
      return;
    }
    const [requested, subcommand] = parsed.words;
    if (requested) {
      command = ["skills", "change", "schema", "adapters", "mcp"].includes(
        requested,
      )
        ? `${requested} ${subcommand ?? ""}`.trim()
        : requested === "schemas" &&
            ["install", "validate"].includes(subcommand ?? "")
          ? `schemas ${subcommand}`
          : requested;
    }
    const { command: routedCommand, data } = await execute(parsed);
    command = routedCommand;
    if (command === "dashboard") return;
    const status = statusOf(command, data);
    const envelope = {
      schemaVersion: 1,
      command,
      ok: status.ok,
      data,
      ...(status.error ? { error: status.error } : {}),
    };
    process.stdout.write(
      (json ? JSON.stringify(envelope) : encode(envelope)) + "\n",
    );
    if (!status.ok) process.exitCode = 1;
  } catch (error) {
    const failure =
      error instanceof OpsxError
        ? error
        : new OpsxError(
            (error as { code?: string })?.code ?? "UNEXPECTED",
            errorMessage(error),
          );
    const envelope = {
      schemaVersion: 1,
      ...(command ? { command } : {}),
      ok: false,
      error: { code: failure.code, message: failure.message },
    };
    process.stdout.write(
      (json ? JSON.stringify(envelope) : encode(envelope)) + "\n",
    );
    process.exitCode = 1;
  }
}

await main();
