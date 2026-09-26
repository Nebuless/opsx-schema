#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { access, cp, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { encode } from "@toon-format/toon";
import { startDashboard } from "../tui/app.tsx";
import { OpenSpecClient } from "../openspec/client.ts";
import { resources, schema as resolveSchema, schemas } from "../catalog/schemas.ts";
import type { ResourceManifest } from "../catalog/schemas.ts";
import { detailedChanges, projectSnapshot } from "./snapshot.ts";
import { defaultSchema, OpsxError, resolveProject } from "./project.ts";
import { archivedFile, archivedRecord, listArchived, boundedFile, changeDirectory } from "../archive/index.ts";
import { changeHistory, readProvenance, recordSelectionAssociation, revisionRef } from "../provenance/index.ts";
import { checkRevision, resolveRevision, retainRevision } from "../revisions/index.ts";
import type { RevisionRef } from "../revisions/index.ts";
import {
 archiveChange,
 createChange,
 getArtifactInstructions,
 getChangeStatus,
 handoffChangeSchema,
 validateChangeAction,
} from "../cli/index.ts";
import { validateChange } from "../validation/index.ts";
import {
 inspectBundledSchema,
 installBundledSchema,
 listBundledSchemas,
 prepareBundledSchema,
} from "../bundled/index.ts";
import { preview as previewSchemaSwitch, apply as applySchemaSwitch } from "../switch/index.ts";
import type { SwitchRequest } from "../switch/index.ts";
import {
 applySkillDisable,
 applySkillInstall,
 discoverSkillInstallHosts,
 doctorSkills,
 isSkillInstallHostId,
 loadAgentProfileDigest,
 loadAgentProfiles,
 loadSkillBundles,
 requiredSkillTargets,
 previewSkillDisable,
 previewSkillInstall,
} from "../resources/index.ts";
import type { ActiveSkillPin, ResourceRuntimeOptions, SkillBundle, SkillDisableRequest, SkillInstallHostId, SkillInstallRequest } from "../resources/index.ts";
import {
 inspectMcpProvider,
 installMcpProvider,
 listMcpCatalog,
 previewMcpInstall,
} from "../mcp/index.ts";
import type { McpHost, McpInstallPreview } from "../mcp/index.ts";
import {
 inspectCompoundAdapters,
 installCompoundAdapters,
 isSupportedCompoundAdapterBundleSource,
 listCompoundAdapterHosts,
 previewCompoundAdapterInstall,
} from "../adapters/index.ts";
import type { CompoundAdapterHost } from "../adapters/index.ts";

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
  schemas install <source> --project <root> [--as <distinct-name>] [--apply-token <token>]
  schemas validate [name]            Validate a schema available to OpenSpec

Skills (profile selects named agent; bundle selects declared skill tier):
  skills inspect [schema] [--bundle default|recommended|all]
  skills doctor
  skills install [schema] [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]
  skills reconcile <change> --revision-digest <sha256> --bundle default|recommended|all [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--apply-token <token>]
  skills disable <project-relative-target> [--apply-token <token>]

MCP providers:
  mcp list [--schema <name>] [--target-dir <dir>]
  mcp inspect <provider> [--schema <name>] [--target-dir <dir>]
  mcp install <provider> --host atomic|omp|opencode|pi|senpi [--schema <name>] [--target-dir <dir>] [--apply-token <token>]

Compound adapters:
  adapters inspect <host> --scope project [--schema <name>]
  adapters install <host> --scope project [--schema <name>] [--apply-token <token>]

Verification:
  verify                              Aggregate OpenSpec schema, active-change, skill, and MCP checks

Mutations never apply from --yes. Run once to preview, then repeat the exact command with its fresh
--apply-token. MCP apply additionally requires an interactive TTY and explicit typed approval of the
provider safety metadata, selected host, target path, and exact config diff.

All commands support --json for one schemaVersion=1 envelope. Errors are actionable and nonzero.
`;

type GlobalOptions = { json: boolean; help: boolean; project?: string; words: string[] };
type FlagDefinition = "one" | "repeat";
type ParsedFlags = { positionals: string[]; values: Record<string, string | string[]> };

function globalOptions(argv: string[]): GlobalOptions {
 const parsed: GlobalOptions = { json: false, help: false, words: [] };
 for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]!;
  if (arg === "--json") parsed.json = true;
  else if (arg === "--help" || arg === "-h") parsed.help = true;
  else if (arg === "--project") {
   if (parsed.project !== undefined || !argv[i + 1] || argv[i + 1]!.startsWith("-")) {
    throw new OpsxError("USAGE", "--project needs one directory and may be supplied only once.");
   }
   parsed.project = argv[++i]!;
  } else if (arg.startsWith("-") && !arg.startsWith("--")) throw new OpsxError("USAGE", `Unknown flag: ${arg}`);
  else parsed.words.push(arg);
 }
 return parsed;
}

function flags(args: string[], definitions: Record<string, FlagDefinition>): ParsedFlags {
 const parsed: ParsedFlags = { positionals: [], values: {} };
 for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (!arg.startsWith("--")) {
   parsed.positionals.push(arg);
   continue;
  }
  const definition = definitions[arg];
  if (!definition) throw new OpsxError("USAGE", `Unknown flag: ${arg}`);
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new OpsxError("USAGE", `${arg} needs a value.`);
  i++;
  if (definition === "repeat") {
   const current = parsed.values[arg];
   parsed.values[arg] = current === undefined ? [value] : [...(current as string[]), value];
  } else {
   if (parsed.values[arg] !== undefined) throw new OpsxError("USAGE", `${arg} may be supplied only once.`);
   parsed.values[arg] = value;
  }
 }
 return parsed;
}

function one(parsed: ParsedFlags, flag: string): string | undefined {
 const value = parsed.values[flag];
 return typeof value === "string" ? value : undefined;
}

function many(parsed: ParsedFlags, flag: string): string[] {
 const value = parsed.values[flag];
 return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function requireCount(values: string[], min: number, max: number, usage: string): void {
 if (values.length < min || values.length > max) throw new OpsxError("USAGE", `Usage: ${usage}`);
}

async function projectRoot(options: GlobalOptions): Promise<string> {
 return resolveProject(options.project ?? process.cwd(), options.project !== undefined);
}

async function optionalProject(options: GlobalOptions): Promise<string | null> {
 if (options.project !== undefined) return projectRoot(options);
 try {
  return await resolveProject(process.cwd());
 }
 catch (error) {
  if (error instanceof OpsxError && error.code === "PROJECT_NOT_FOUND") return null;
  throw error;
 }
}

function stable(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
 if (value && typeof value === "object") {
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
 }
 return JSON.stringify(value);
}

function applyToken(scope: string, binding: unknown): string {
 const encoded = Buffer.from(stable({ schemaVersion: 1, scope, binding })).toString("base64url");
 const digest = createHash("sha256").update(encoded).digest("hex");
 return `opsx-apply-v1.${encoded}.${digest}`;
}

function validationPassed(result: unknown): boolean {
 if (!result || typeof result !== "object") return true;
 const record = result as Record<string, unknown>;
 if (record.ok === false || record.valid === false || record.isValid === false) return false;
 if (Array.isArray(record.errors) && record.errors.length > 0) return false;
 if (Array.isArray(record.issues) && record.issues.length > 0) return false;
 return true;
}

function statusOf(command: string, data: unknown): { ok: boolean; error?: { code: string; message: string } } {
 if (!data || typeof data !== "object") return { ok: true };
 const record = data as Record<string, any>;
 if (record.ok === false && record.error && typeof record.error.message === "string") return { ok: false, error: record.error };
 if (command === "change validate" && record.ok && record.data && record.data.ok === false) {
  return { ok: false, error: { code: "VALIDATION_FAILED", message: `Change ${record.data.change} could not be confirmed valid; see findings.` } };
 }
 if (command === "schemas validate" && record.ok === false) return { ok: false, error: { code: "SCHEMA_INVALID", message: `Schema validation failed for ${String(record.schema ?? "selected schema")}.` } };
 if (command === "verify" && record.ok === false) return { ok: false, error: { code: "VERIFY_FAILED", message: "One or more aggregate validation checks failed." } };
 if (command === "doctor" && record.ok === false) return { ok: false, error: { code: "DOCTOR_FAILED", message: "Project diagnostics found one or more blocking problems." } };
 if (command === "skills doctor" && record.complete === false) return { ok: false, error: { code: "SKILLS_INCOMPLETE", message: "Managed skill health could not be proven complete; see diagnostics." } };
 if (record.phase === "preview" && (record.data?.ready === false || record.plan?.canApply === false || record.plan?.action === "refuse" || record.plan?.status === "collision" || record.plan?.status === "blocked")) return { ok: false, error: { code: "PREVIEW_BLOCKED", message: "The preview is blocked; see diagnostics for the reason." } };
 const result = record.result && typeof record.result === "object" ? record.result as Record<string, any> : undefined;
 if (result?.ok === false) return { ok: false, error: result.error && typeof result.error.message === "string" ? result.error : { code: "OPERATION_NOT_APPLIED", message: "The requested operation returned an unsuccessful result; see diagnostics." } };
 if ([record.phase, record.status, record.action, result?.phase, result?.status, result?.action].some(status => status === "partial" || status === "denied" || status === "guided-only" || status === "refuse" || status === "failed" || status === "error" || status === "blocked")) return { ok: false, error: { code: "OPERATION_NOT_APPLIED", message: "The requested operation could not be applied; see the returned status and diagnostics." } };
 return { ok: true };
}

async function validateBundledSchema(name: string): Promise<{ schema: string; source: "bundled"; ok: boolean; result: unknown }> {
 const inspection = await inspectBundledSchema(name);
 const temporary = await mkdtemp(path.join(os.tmpdir(), "opsx-schema-validation-"));
 try {
  const target = path.join(temporary, "openspec", "schemas", name);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(inspection.sourceDirectory, target, { recursive: true, errorOnExist: true, force: false });
  await writeFile(path.join(temporary, "openspec", "config.yaml"), `schema: ${name}\n`, { flag: "wx" });
  const result = await new OpenSpecClient(temporary).json("schema", "validate", name);
  return { schema: name, source: "bundled", ok: validationPassed(result), result };
 } finally {
  await rm(temporary, { recursive: true, force: true });
 }
}

async function validateProjectSchema(root: string, name: string): Promise<{ schema: string; source: "project"; ok: boolean; result: unknown }> {
 const client = new OpenSpecClient(root);
 const resolved = await resolveSchema(client, name);
 const result = await client.json("schema", "validate", resolved.name);
 return { schema: resolved.name, source: "project", ok: validationPassed(result), result };
}

async function mcpCatalogCheck(schemaDir: string, targetDir?: string): Promise<{ ok: true; skipped?: true; catalog?: unknown }> {
 try { await access(path.join(schemaDir, "mcp.yaml")); }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, skipped: true };
  throw error;
 }
 return { ok: true, catalog: await listMcpCatalog({ schemaDir, ...(targetDir ? { targetDir } : {}) }) };
}

function samePinnedRevision(left: RevisionRef, right: RevisionRef): boolean {
 const a = left.bundleSource;
 const b = right.bundleSource;
 return left.name === right.name && left.source === right.source && left.digest === right.digest
  && (!a && !b || Boolean(a && b && a.name === b.name && a.version === b.version && a.revision === b.revision && a.digest === b.digest));
}

async function verifiedActiveSkillPins(root: string): Promise<readonly ActiveSkillPin[]> {
 const directory = path.join(root, "openspec", "changes");
 let info;
 try { info = await lstat(directory); }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
  throw error;
 }
 if (!info.isDirectory() || info.isSymbolicLink()) throw new OpsxError("RESOURCE_PIN_SCAN_FAILED", "Active change directory is unsafe.");
 const client = new OpenSpecClient(root);
 const pins: ActiveSkillPin[] = [];
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (entry.name === "archive") continue;
  if (entry.isSymbolicLink()) throw new OpsxError("RESOURCE_PIN_SCAN_FAILED", "Cannot inspect symlinked active change " + entry.name + ".");
  if (!entry.isDirectory()) continue;
  const history = await changeHistory(root, entry.name);
  const provenance = await readProvenance(await changeDirectory(root, entry.name));
  const association = provenance?.association;
  const latest = provenance?.migrations.at(-1)?.to ?? provenance?.retained ?? provenance?.created;
  if (!association) {
   const revision = await resolveRevision(client, history.currentSchema);
   if (history.divergence || revision.shadows.length > 0
    || (latest && (history.currentSchema !== latest.name || !samePinnedRevision(latest, revisionRef(revision))
     || (await checkRevision(root, latest, client)).state !== "intact"))) {
    throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "Active change " + entry.name + " does not match its recorded schema revision.");
   }
   const bundles = await loadSkillBundles(revision.source);
   if (Object.values(bundles.declarations).some(declarations => declarations.length > 0)) {
    throw new OpsxError("RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN", "Active change " + entry.name + " has no verified skill selection; disabling skills is blocked.");
   }
   continue;
  }
  if (!latest || history.divergence || history.currentSchema !== association.effectiveRevision.name
   || !samePinnedRevision(latest, association.effectiveRevision)) {
   throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "Active change " + entry.name + " does not match its recorded skill-selection revision.");
  }
  const revision = association.effectiveRevision;
  if ((await checkRevision(root, revision, client)).state !== "intact") {
   throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "Active change " + entry.name + " no longer resolves to its retained schema revision.");
  }
  const bundles = await loadSkillBundles(revision.source);
  if (association.manifestDigests.agentProfiles !== await loadAgentProfileDigest()
   || association.manifestDigests.schemaSkills !== bundles.manifestDigests.skills
   || association.manifestDigests.skillBundles !== bundles.manifestDigests.profiles) {
   throw new OpsxError("RESOURCE_PIN_MANIFEST_CHANGED", "Active change " + entry.name + " skill-selection manifests changed; disabling skills is blocked.");
  }
  pins.push({
   change: entry.name, schema: revision.name, revisionDigest: revision.digest, schemaRoot: revision.source,
   profiles: association.profiles, skillHosts: association.skillHosts, skillBundle: association.skillBundle
  });
 }
 return pins;
}

const verifiedPinOptions: ResourceRuntimeOptions = { resolveActivePins: verifiedActiveSkillPins };

async function doctorProject(root: string): Promise<{ ok: boolean; project: string; openSpec: unknown; skills: unknown; mcp: unknown; checks: Array<Record<string, unknown>> }> {
 const checks: Array<Record<string, unknown>> = [];
 let openSpec: unknown = null;
 try {
  openSpec = await new OpenSpecClient(root).json("doctor");
  checks.push({ name: "openspec", ok: validationPassed(openSpec), result: openSpec });
 } catch (error) { checks.push({ name: "openspec", ok: false, error: errorMessage(error) }); }
 let skills: unknown = null;
 try {
  skills = await doctorSkills(root, verifiedPinOptions);
  const report = skills as { complete?: boolean };
  checks.push({ name: "skills", ok: report.complete === true, result: skills });
 } catch (error) { checks.push({ name: "skills", ok: false, error: errorMessage(error) }); }
 let mcp: unknown = null;
 try {
  const name = await defaultSchema(root);
  const resolved = await resolveSchema(new OpenSpecClient(root), name);
  mcp = await mcpCatalogCheck(resolved.path, root);
  checks.push({ name: `mcp:${name}`, ok: true, result: mcp });
 } catch (error) { checks.push({ name: "mcp", ok: false, error: errorMessage(error) }); }
 return { ok: checks.every(check => check.ok === true), project: root, openSpec, skills, mcp, checks };
}

async function verify(root?: string): Promise<{ ok: boolean; project?: string; checks: Array<Record<string, unknown>> }> {
 const checks: Array<Record<string, unknown>> = [];
 if (root) {
  const client = new OpenSpecClient(root);
  try {
   const doctor = await client.json("doctor");
   checks.push({ name: "doctor", ok: validationPassed(doctor), result: doctor });
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
  try { active = await detailedChanges(root, client); }
  catch (error) { checks.push({ name: "changes", ok: false, error: errorMessage(error) }); }
  for (const change of active) {
   try {
    const result = await validateChange(root, change.name);
    checks.push({ name: `change:${change.name}`, ...result });
   } catch (error) {
    checks.push({ name: `change:${change.name}`, ok: false, error: errorMessage(error) });
   }
  }
  try {
   const report = await doctorSkills(root, verifiedPinOptions);
   checks.push({ name: "skills", ok: report.complete, result: report });
  } catch (error) { checks.push({ name: "skills", ok: false, error: errorMessage(error) }); }
  try {
   const name = await defaultSchema(root);
   const resolved = await resolveSchema(client, name);
   const mcp = await mcpCatalogCheck(resolved.path, root);
   checks.push({ name: `mcp:${name}`, ok: true, result: mcp });
  } catch (error) { checks.push({ name: "mcp", ok: false, error: errorMessage(error) }); }
 } else {
  for (const name of listBundledSchemas()) {
   try {
    checks.push({ name: `schema:${name}`, ...await validateBundledSchema(name) });
    const inspection = await inspectBundledSchema(name);
    if (inspection.hasMcp) checks.push({ name: `mcp:${name}`, ...await mcpCatalogCheck(inspection.sourceDirectory) });
   }
   catch (error) { checks.push({ name: `schema:${name}`, ok: false, error: errorMessage(error) }); }
  }
 }
 return { ok: checks.every(check => check.ok === true), ...(root ? { project: root } : {}), checks };
}

function errorMessage(error: unknown): string {
 return error instanceof Error ? error.message : String(error);
}

async function commandSchemas(options: GlobalOptions, args: string[]): Promise<unknown> {
 const [subcommand, ...rest] = args;
 if (subcommand === "bundled") {
  requireCount(rest, 0, 1, "schemas bundled [name]");
  return rest[0] ? inspectBundledSchema(rest[0]) : Promise.all(listBundledSchemas().map(name => inspectBundledSchema(name)));
 }
 if (subcommand === "install") {
  const parsed = flags(rest, { "--as": "one", "--apply-token": "one" });
  requireCount(parsed.positionals, 1, 1, "schemas install <source> --project <root> [--as <distinct-name>] [--apply-token <token>]");
  const name = parsed.positionals[0]!;
  if (options.project === undefined) throw new OpsxError("USAGE", "schemas install requires --project <root>; it never guesses an installation target.");
  const root = await resolveProject(options.project, true);
  const destination = one(parsed, "--as");
  const plan = await prepareBundledSchema(root, name, destination);
  const binding = { root, name, destination: destination ?? name, plan };
  const token = applyToken("schemas.install", binding);
  const supplied = one(parsed, "--apply-token");
  if (supplied !== undefined) {
   if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The apply token does not match this exact, current schema installation preview.");
   return { phase: "applied", target: plan.destination, result: await installBundledSchema(root, name, plan) };
  }
  return { phase: "preview", target: plan.destination, plan, confirmation: { exactTarget: plan.destination, token } };
 }
 if (subcommand === "validate") {
  requireCount(rest, 0, 1, "schemas validate [name]");
  const root = await optionalProject(options);
  if (root) {
   const name = rest[0] ?? await defaultSchema(root);
   return await validateProjectSchema(root, name);
  }
  if (rest[0]) return await validateBundledSchema(rest[0]);
  const checks = await Promise.all(listBundledSchemas().map(validateBundledSchema));
  return { ok: checks.every(check => check.ok), checks };
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
 return listBundledSchemas().map(name => ({ name, source: "bundled" }));
}

async function commandChange(root: string, args: string[]): Promise<unknown> {
 const [operation, ...rest] = args;
 if (!operation) throw new OpsxError("USAGE", "Usage: change <create|status|instructions|validate|archive|schema> ...");
 if (operation === "create") {
  const parsed = flags(rest, { "--description": "one", "--goal": "one", "--schema": "one", "--profile": "repeat", "--skill-host": "repeat", "--bundle": "one", "--apply-token": "one" });
  requireCount(parsed.positionals, 1, 1, "change create <name> --description <text> [--goal <text>] [--schema <name>] [--profile <agent-id> ...] [--skill-host <host> ...] [--bundle default|recommended|all] [--apply-token <token>]");
  const description = one(parsed, "--description");
  if (!description) throw new OpsxError("USAGE", "change create requires --description <text>.");
  const apply = one(parsed, "--apply-token");
  const selectedHosts = many(parsed, "--skill-host");
  if (selectedHosts.some(host => !isSkillInstallHostId(host)) || new Set(selectedHosts).size !== selectedHosts.length) throw new OpsxError("USAGE", "--skill-host must select a supported host at most once: opencode, omp, pi, atomic, senpi.");
  if ((many(parsed, "--profile").length > 0 || selectedHosts.length > 0) && !one(parsed, "--bundle")) throw new OpsxError("USAGE", "Explicit change selection requires --bundle default|recommended|all.");
  return createChange(root, { change: parsed.positionals[0]!, description, goal: one(parsed, "--goal"), schema: one(parsed, "--schema"), ...(many(parsed, "--profile").length ? { profiles: many(parsed, "--profile") } : {}), ...(selectedHosts.length ? { skillHosts: selectedHosts as SkillInstallHostId[] } : {}), ...(one(parsed, "--bundle") ? { skillBundle: skillBundle(one(parsed, "--bundle")) } : {}) }, apply ? { applyToken: apply } : {});
 }
 if (operation === "status" || operation === "validate" || operation === "archive") {
  const parsed = flags(rest, operation === "archive" ? { "--apply-token": "one" } : {});
  requireCount(parsed.positionals, 1, 1, `change ${operation} <change>${operation === "archive" ? " [--apply-token <token>]" : ""}`);
  const name = parsed.positionals[0]!;
  if (operation === "status") return getChangeStatus(root, name);
  if (operation === "validate") return validateChangeAction(root, name);
  const token = one(parsed, "--apply-token");
  return archiveChange(root, name, token ? { applyToken: token } : {});
 }
 if (operation === "instructions") {
  const parsed = flags(rest, {});
  requireCount(parsed.positionals, 2, 2, "change instructions <change> <artifact>");
  return getArtifactInstructions(root, parsed.positionals[0]!, parsed.positionals[1]!);
 }
 if (operation === "schema") {
  const parsed = flags(rest, { "--apply-token": "one" });
  requireCount(parsed.positionals, 2, 2, "change schema <change> <schema> [--apply-token <token>]");
  const token = one(parsed, "--apply-token");
  return handoffChangeSchema(root, parsed.positionals[0]!, parsed.positionals[1]!, token ? { applyToken: token } : {});
 }
 throw new OpsxError("USAGE", `Unknown change operation ${operation}. Run opsx-schema --help for commands.`);
}

async function commandSchema(root: string, args: string[]): Promise<unknown> {
 const [operation, ...rest] = args;
 const usage = "schema switch <name> [--profile <agent-id> ...] [--migrate <change> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]";
 if (operation !== "switch") throw new OpsxError("USAGE", "Usage: " + usage);
 const parsed = flags(rest, { "--profile": "repeat", "--migrate": "repeat", "--skill-host": "repeat", "--bundle": "one", "--apply-token": "one" });
 requireCount(parsed.positionals, 1, 1, usage);
 const skillHosts: NonNullable<SwitchRequest["skillHosts"]> = [];
 for (const host of many(parsed, "--skill-host")) {
  if (!isSkillInstallHostId(host)) throw new OpsxError("USAGE", "--skill-host must be opencode, omp, pi, atomic, or senpi.");
  if (skillHosts.includes(host)) throw new OpsxError("USAGE", `--skill-host ${host} may be supplied only once.`);
  skillHosts.push(host);
 }
 const request: SwitchRequest = {
  schema: parsed.positionals[0]!,
  profiles: many(parsed, "--profile"),
  migrations: many(parsed, "--migrate"),
  ...(one(parsed, "--bundle") ? { skillBundle: skillBundle(one(parsed, "--bundle")) } : {}),
  ...(skillHosts.length > 0 ? { skillHosts } : {}),
 };
 const plan = await previewSchemaSwitch(root, request);
 const token = one(parsed, "--apply-token");
 if (token !== undefined) {
  if (token !== plan.token) throw new OpsxError("APPLY_TOKEN_STALE", "The schema switch token is stale or belongs to another request; preview again.");
  return { phase: "applied", target: { root, schema: request.schema }, result: await applySchemaSwitch(root, request, token) };
 }
 return { phase: "preview", target: { root, schema: request.schema }, plan, confirmation: { exactTarget: `${root} -> ${request.schema}`, token: plan.token } };
}

async function skillDetails(root: string, schemaName: string, requestedBundle: SkillBundle): Promise<unknown> {
 const client = new OpenSpecClient(root);
 const manifest: ResourceManifest = await resources(client, schemaName);
 const profiles = await loadAgentProfiles();
 const schemaRoot = manifest.schema.path;
 const catalog = await loadSkillBundles(schemaRoot);
 const bundles = (["default", "recommended", "all"] as const).map(name => ({
  name,
  available: catalog.bundles.includes(name),
  declarations: catalog.declarations[name] ?? [],
 }));
 return { schema: manifest.schema, bundles, agentProfiles: profiles, skillHosts: await discoverSkillInstallHosts(root), requestedBundle };
}

function skillBundle(value: string | undefined): SkillBundle {
 const selected = value ?? "default";
 if (selected !== "default" && selected !== "recommended" && selected !== "all") throw new OpsxError("USAGE", "--bundle must be default, recommended, or all.");
 return selected;
}

async function reconcileSkillPin(root: string, change: string, digest: string, profiles: string[], skillHosts: SkillInstallHostId[], bundle: SkillBundle, supplied?: string): Promise<unknown> {
 if (!/^[0-9a-f]{64}$/.test(digest)) throw new OpsxError("USAGE", "--revision-digest must be the exact 64-character schema SHA-256.");
 const directory = await changeDirectory(root, change);
 const history = await changeHistory(root, change);
 if (history.inherited || history.divergence || history.currentSchema === "Unknown") throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "Reconciliation requires an explicit, unchanged schema pin on an active change.");
 const client = new OpenSpecClient(root);
 const revision = await resolveRevision(client, history.currentSchema);
 if (revision.shadows.length || revision.digest !== digest) throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "The active schema revision differs from the reviewed --revision-digest.");
 const prior = await readProvenance(directory);
 const recorded = prior?.migrations.at(-1)?.to ?? prior?.retained ?? prior?.created;
 if (prior?.association || (recorded && !samePinnedRevision(recorded, revision))) throw new OpsxError("RESOURCE_PIN_REVISION_CHANGED", "The pin already has an association or its recorded revision differs; inspect provenance before reconciling.");
 const catalog = await loadSkillBundles(revision.source);
 const declarations = catalog.declarations[bundle];
 if (!declarations) throw new OpsxError("PROFILE_UNDECLARED", `Bundle ${bundle} is not declared by schema ${revision.name}.`);
 if (declarations.length > 0 && profiles.length === 0 && skillHosts.length === 0) throw new OpsxError("RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN", "Managed skills require an explicit agent profile or native host selection.");
 let manifestDigests: { agentProfiles: string; schemaSkills: string; skillBundles: string | null };
 if (profiles.length === 0 && skillHosts.length === 0) {
  manifestDigests = { agentProfiles: await loadAgentProfileDigest(), schemaSkills: catalog.manifestDigests.skills, skillBundles: catalog.manifestDigests.profiles };
 } else {
  const install = await previewSkillInstall({ projectRoot: root, schemaRoot: revision.source, profiles, skillHosts, skillBundle: bundle });
  if (!install.canApply) throw new OpsxError("RESOURCE_RECONCILE_BLOCKED", install.diagnostics.map(item => item.message).join("; "));
  manifestDigests = install.manifestDigests;
 }
 const association = { version: 1 as const, effectiveRevision: revisionRef(revision), profiles: [...profiles].sort(), skillHosts: [...skillHosts].sort(), skillBundle: bundle, manifestDigests };
 const binding = { root, change, revision: association.effectiveRevision, association, prior, pin: history.currentSchema };
 const token = applyToken("skills.reconcile", binding);
 const target = { change, schema: revision.name, revisionDigest: digest, provenance: path.join(directory, ".opsx-provenance.json") };
 if (supplied === undefined) return { phase: "preview", target, association, confirmation: { exactTarget: `${change} pinned to ${revision.name}@${digest}; profiles ${association.profiles.join(", ") || "none"}; hosts ${association.skillHosts.join(", ") || "none"}; bundle ${bundle}`, token } };
 if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The reconciliation token is stale or belongs to another change, revision, or selection; preview again.");
 await retainRevision(root, revision);
 await recordSelectionAssociation(root, change, revisionRef(revision), association);
 return { phase: "applied", target, association };
}

async function commandSkills(root: string, args: string[]): Promise<unknown> {
 const [operation, ...rest] = args;
 if (!operation) throw new OpsxError("USAGE", "Usage: skills <inspect|install|reconcile|disable|doctor> ...");
 if (operation === "doctor") {
  requireCount(rest, 0, 0, "skills doctor");
  return doctorSkills(root, verifiedPinOptions);
 }
 if (operation === "inspect") {
  const parsed = flags(rest, { "--bundle": "one" });
  requireCount(parsed.positionals, 0, 1, "skills inspect [schema] [--bundle default|recommended|all]");
  return skillDetails(root, parsed.positionals[0] ?? await defaultSchema(root), skillBundle(one(parsed, "--bundle")));
 }
 if (operation === "reconcile") {
  const parsed = flags(rest, { "--revision-digest": "one", "--profile": "repeat", "--skill-host": "repeat", "--bundle": "one", "--apply-token": "one" });
  requireCount(parsed.positionals, 1, 1, "skills reconcile <change> --revision-digest <sha256> --bundle default|recommended|all [--profile <agent-id> ...] [--skill-host <host> ...] [--apply-token <token>]");
  const digest = one(parsed, "--revision-digest");
  const bundle = one(parsed, "--bundle");
  if (!digest || !bundle) throw new OpsxError("USAGE", "Reconciliation requires a reviewed --revision-digest and explicit --bundle.");
  const hosts = many(parsed, "--skill-host");
  if (hosts.some(host => !isSkillInstallHostId(host)) || new Set(hosts).size !== hosts.length) throw new OpsxError("USAGE", "Select each supported native host at most once: opencode, omp, pi, atomic, senpi.");
  const profiles = many(parsed, "--profile");
  if (new Set(profiles).size !== profiles.length) throw new OpsxError("USAGE", "Select each named profile at most once.");
  return reconcileSkillPin(root, parsed.positionals[0]!, digest, profiles, hosts as SkillInstallHostId[], skillBundle(bundle), one(parsed, "--apply-token"));
 }
 if (operation === "install") {
  const parsed = flags(rest, { "--profile": "repeat", "--skill-host": "repeat", "--bundle": "one", "--apply-token": "one" });
  requireCount(parsed.positionals, 0, 1, "skills install [schema] [--profile <agent-id> ...] [--skill-host <host> ...] [--bundle default|recommended|all] [--apply-token <token>]");
  const selectedProfiles = many(parsed, "--profile");
  const selectedHosts = many(parsed, "--skill-host");
  if (selectedProfiles.length === 0 && selectedHosts.length === 0) throw new OpsxError("USAGE", "skills install requires a --profile or --skill-host; see skills inspect.");
  if (new Set(selectedHosts).size !== selectedHosts.length || selectedHosts.some(host => !isSkillInstallHostId(host))) throw new OpsxError("USAGE", "--skill-host must select each supported host at most once: opencode, omp, pi, atomic, senpi.");
  const name = parsed.positionals[0] ?? await defaultSchema(root);
  const manifest = await resources(new OpenSpecClient(root), name);
  const request: SkillInstallRequest = {
   projectRoot: root,
   schemaRoot: manifest.schema.path,
   profiles: selectedProfiles,
   skillHosts: selectedHosts as SkillInstallHostId[],
   skillBundle: skillBundle(one(parsed, "--bundle")),
  };
  const plan = await previewSkillInstall(request);
  const binding = { plan };
  const token = applyToken("skills.install", binding);
  const supplied = one(parsed, "--apply-token");
  if (supplied !== undefined) {
   if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The skill installation token is stale or belongs to another request; preview again.");
   return { phase: "applied", target: { root, schema: name, profiles: selectedProfiles, skillHosts: selectedHosts }, result: await applySkillInstall(plan) };
  }
  return { phase: "preview", target: { root, schema: name, profiles: selectedProfiles, skillHosts: selectedHosts }, plan, confirmation: { exactTarget: `${root} skills for profiles ${selectedProfiles.join(", ") || "none"}; hosts ${selectedHosts.join(", ") || "none"}`, token } };
 }
 if (operation === "disable") {
  const parsed = flags(rest, { "--apply-token": "one" });
  requireCount(parsed.positionals, 1, 1, "skills disable <project-relative-target> [--apply-token <token>]");
  const required = await requiredSkillTargets(root, verifiedPinOptions);
  if (!required.complete) throw new OpsxError("SKILL_REQUIREMENTS_INCOMPLETE", required.diagnostics.map(item => item.message).join("; ") || "Cannot prove no active schema requires this skill.");
  const request: SkillDisableRequest = { projectRoot: root, target: parsed.positionals[0]!, requiredTargets: required.targets };
  const plan = await previewSkillDisable(request, verifiedPinOptions);
  if (!plan.pinGuardComplete) throw new OpsxError("SKILL_REQUIREMENTS_INCOMPLETE", "The skill pin guard changed or is incomplete; rerun skills doctor before disabling this target.");
  const binding = { plan };
  const token = applyToken("skills.disable", binding);
  const supplied = one(parsed, "--apply-token");
  if (supplied !== undefined) {
   if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The skill disable token is stale or belongs to another target; preview again.");
   return { phase: "applied", target: { root, path: plan.absoluteTarget }, result: await applySkillDisable(plan, verifiedPinOptions) };
  }
  return { phase: "preview", target: { root, path: plan.absoluteTarget }, plan, confirmation: { exactTarget: plan.absoluteTarget, token } };
 }
 throw new OpsxError("USAGE", `Unknown skills operation ${operation}. Run opsx-schema --help for commands.`);
}

async function mcpSchemaDir(root: string | null, schemaName: string | undefined): Promise<{ name: string; directory: string }> {
 const name = schemaName ?? (root ? await defaultSchema(root) : "spec-driven");
 if (root) return { name, directory: (await resolveSchema(new OpenSpecClient(root), name)).path };
 const bundled = await inspectBundledSchema(name);
 return { name, directory: bundled.sourceDirectory };
}

function mcpHost(value: string | undefined): McpHost {
 if (value !== "atomic" && value !== "omp" && value !== "opencode" && value !== "pi" && value !== "senpi") throw new OpsxError("USAGE", "--host must be atomic, omp, opencode, pi, or senpi.");
 return value;
}

async function promptMcpApproval(preview: McpInstallPreview): Promise<boolean> {
 if (!process.stdin.isTTY || !process.stdout.isTTY) throw new OpsxError("MCP_TTY_REQUIRED", "MCP installation cannot be applied without both stdin and stdout attached to a TTY.");
 process.stderr.write([
  `Provider: ${preview.provider.name}`,
  `URL: ${preview.provider.url}`,
  `Permissions: ${JSON.stringify(preview.provider.permissions)}`,
  `Host: ${preview.host} (${preview.installMode})`,
  `Target: ${preview.hostPath}`,
  `Config: ${preview.configPath}`,
  `Exact diff: ${JSON.stringify(preview.diff, null, 2)}`,
 ].join("\n") + "\n");
 const terminal = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
 try { return (await terminal.question(`Type yes to install ${preview.provider.name} for ${preview.host}: `)) === "yes"; }
 finally { terminal.close(); }
}

async function commandMcp(root: string | null, args: string[]): Promise<unknown> {
 const [operation, ...rest] = args;
 if (!operation) throw new OpsxError("USAGE", "Usage: mcp <list|inspect|install> ...");
 if (operation === "list") {
  const parsed = flags(rest, { "--schema": "one", "--target-dir": "one" });
  requireCount(parsed.positionals, 0, 0, "mcp list [--schema <name>] [--target-dir <dir>]");
  const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
  const targetDir = one(parsed, "--target-dir") ?? root;
  return listMcpCatalog({ schemaDir: selected.directory, ...(targetDir ? { targetDir: path.resolve(targetDir) } : {}) });
 }
 if (operation === "inspect") {
  const parsed = flags(rest, { "--schema": "one", "--target-dir": "one" });
  requireCount(parsed.positionals, 1, 1, "mcp inspect <provider> [--schema <name>] [--target-dir <dir>]");
  const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
  const targetDir = one(parsed, "--target-dir") ?? root;
  return inspectMcpProvider({ schemaDir: selected.directory, providerName: parsed.positionals[0]!, ...(targetDir ? { targetDir: path.resolve(targetDir) } : {}) });
 }
 if (operation === "install") {
  const parsed = flags(rest, { "--schema": "one", "--host": "one", "--target-dir": "one", "--apply-token": "one" });
  requireCount(parsed.positionals, 1, 1, "mcp install <provider> --host <host> [--schema <name>] [--target-dir <dir>] [--apply-token <token>]");
  const host = mcpHost(one(parsed, "--host"));
  const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
  const targetDir = one(parsed, "--target-dir") ?? root;
  if (!targetDir) throw new OpsxError("USAGE", "mcp install requires --target-dir <dir> when no OpenSpec project is selected.");
  const input = { schemaDir: selected.directory, targetDir: path.resolve(targetDir), host, providerName: parsed.positionals[0]! };
  const plan = await previewMcpInstall(input);
  const binding = { input, preview: plan };
  const token = applyToken("mcp.install", binding);
  const supplied = one(parsed, "--apply-token");
  if (supplied !== undefined) {
   if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The MCP install token is stale or belongs to another provider, host, target, or diff; preview again.");
   if (!process.stdin.isTTY || !process.stdout.isTTY) throw new OpsxError("MCP_TTY_REQUIRED", "MCP installation cannot be applied without both stdin and stdout attached to a TTY.");
   const result = await installMcpProvider({ ...input, approve: promptMcpApproval });
   return { phase: "applied", target: { host, targetDir: input.targetDir, provider: input.providerName }, result };
  }
  return { phase: "preview", target: { host, targetDir: input.targetDir, provider: input.providerName }, plan, confirmation: { exactTarget: `${plan.provider.name} -> ${plan.hostPath}`, token } };
 }
 throw new OpsxError("USAGE", `Unknown MCP operation ${operation}. Run opsx-schema --help for commands.`);
}

function adapterHost(value: string | undefined): CompoundAdapterHost {
 if (!value || !listCompoundAdapterHosts().includes(value as CompoundAdapterHost)) throw new OpsxError("USAGE", `Adapter host must be one of: ${listCompoundAdapterHosts().join(", ")}.`);
 return value as CompoundAdapterHost;
}

function projectScope(value: string | undefined): "project" {
 if (value !== "project") throw new OpsxError("USAGE", "--scope project is required; user scope is not supported.");
 return "project";
}

async function commandAdapters(root: string, args: string[]): Promise<unknown> {
 const [operation, ...rest] = args;
 if (operation !== "inspect" && operation !== "install") throw new OpsxError("USAGE", "Usage: adapters <inspect|install> <host> --scope project ...");
 const parsed = flags(rest, operation === "install" ? { "--scope": "one", "--schema": "one", "--apply-token": "one" } : { "--scope": "one", "--schema": "one" });
 requireCount(parsed.positionals, 1, 1, `adapters ${operation} <host> --scope project [--schema <name>]${operation === "install" ? " [--apply-token <token>]" : ""}`);
 const host = adapterHost(parsed.positionals[0]);
 const scope = projectScope(one(parsed, "--scope"));
 const selectedName = one(parsed, "--schema") ?? await defaultSchema(root);
 const revision = await resolveRevision(new OpenSpecClient(root), selectedName);
 if (revision.shadows.length) throw new OpsxError("SCHEMA_AMBIGUOUS", `Selected adapter schema ${selectedName} has same-name shadows.`);
 const bundleSource = revision.bundleSource;
 if (!bundleSource || !await isSupportedCompoundAdapterBundleSource(bundleSource)) throw new OpsxError("COMPOUND_ADAPTER_BUNDLE_UNAVAILABLE", `Schema ${selectedName} does not provide a verified compound adapter bundle.`);
 if (operation === "inspect") return { selectedSchema: revision, inspection: await inspectCompoundAdapters(root, revision.name, bundleSource, host, scope) };
 const plan = await previewCompoundAdapterInstall(root, revision.name, bundleSource, host, scope);
 const binding = { root, selectedSchema: revision, host, scope, plan };
 const token = applyToken("adapters.install", binding);
 const supplied = one(parsed, "--apply-token");
 if (supplied !== undefined) {
  if (supplied !== token) throw new OpsxError("APPLY_TOKEN_STALE", "The adapter install token is stale or belongs to another host, scope, or target; preview again.");
  const currentRevision = await resolveRevision(new OpenSpecClient(root), selectedName);
  if (currentRevision.shadows.length || currentRevision.source !== revision.source || currentRevision.digest !== revision.digest || currentRevision.bundleSource?.digest !== bundleSource.digest) throw new OpsxError("APPLY_TOKEN_STALE", "The selected adapter schema changed after preview; inspect it again.");
  if (plan.action === "refuse") throw new OpsxError("ADAPTER_COLLISION", plan.reason ?? "The adapter install preview is blocked.");
  return { phase: "applied", selectedSchema: revision, target: plan.destination, result: await installCompoundAdapters(root, revision.name, bundleSource, host, scope, plan) };
 }
 return { phase: "preview", selectedSchema: revision, target: plan.destination, plan, confirmation: { exactTarget: `${host} project adapters from ${selectedName} at ${plan.destination}`, token } };
}

async function commandVerify(options: GlobalOptions): Promise<unknown> {
 const root = await optionalProject(options);
 return verify(root ?? undefined);
}

async function execute(options: GlobalOptions): Promise<{ command: string; data: unknown }> {
 const [command, ...args] = options.words;
 if (!command) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new OpsxError("TTY_REQUIRED", "The dashboard needs an interactive terminal. Use opsx-schema --help for noninteractive commands.");
  const root = await projectRoot(options);
  await startDashboard(root);
  return { command: "dashboard", data: { project: root, started: true } };
 }
 if (command === "schemas") return { command: args[0] === "validate" ? "schemas validate" : args[0] === "install" ? "schemas install" : "schemas", data: await commandSchemas(options, args) };
 if (command === "verify") {
  requireCount(args, 0, 0, "verify");
  return { command, data: await commandVerify(options) };
 }
 if (command === "help") return { command: "help", data: { help: HELP } };
 const packageOnly = command === "mcp";
 const root = packageOnly ? await optionalProject(options) : await projectRoot(options);
 switch (command) {
  case "status":
   requireCount(args, 0, 0, "status");
   return { command, data: await projectSnapshot(root!, new OpenSpecClient(root!)) };
  case "changes": {
   requireCount(args, 0, 2, "changes [name] [file]");
   const active = await detailedChanges(root!, new OpenSpecClient(root!));
   if (!args[0]) return { command, data: active };
   const selected = active.find(change => change.name === args[0]);
   if (!selected) throw new OpsxError("CHANGE_NOT_FOUND", `Active change ${args[0]} not found; use changes to list choices.`);
   const directory = await changeDirectory(root!, args[0]);
   return {
    command, data: args[1] ? { name: args[0], file: args[1], ...await boundedFile(directory, args[1]) }
     : { ...selected, selection: (await readProvenance(directory))?.association ?? null }
   };
  }
  case "archive": {
   requireCount(args, 0, 2, "archive [name] [file]");
   const entries = await listArchived(root!);
   if (!args[0]) return { command, data: entries };
   const selected = entries.find(entry => entry.name === args[0]);
   if (!selected) throw new OpsxError("ARCHIVE_NOT_FOUND", `Archived change ${args[0]} not found; use archive to list choices.`);
   return { command, data: args[1] ? { name: args[0], file: args[1], ...await archivedFile(root!, args[0], args[1]) } : { ...await archivedRecord(root!, args[0]), history: await changeHistory(root!, args[0], true) } };
  }
  case "schemas":
   return { command, data: await commandSchemas(options, args) };
  case "resources": {
   requireCount(args, 0, 1, "resources [schema]");
   return { command, data: await resources(new OpenSpecClient(root!), args[0] ?? await defaultSchema(root!)) };
  }
  case "doctor":
   requireCount(args, 0, 0, "doctor");
   return { command, data: await doctorProject(root!) };
  case "change":
   return { command: `change ${args[0] ?? ""}`.trim(), data: await commandChange(root!, args) };
  case "schema":
   return { command: `schema ${args[0] ?? ""}`.trim(), data: await commandSchema(root!, args) };
  case "skills":
   return { command: `skills ${args[0] ?? ""}`.trim(), data: await commandSkills(root!, args) };
  case "mcp":
   return { command: `mcp ${args[0] ?? ""}`.trim(), data: await commandMcp(root, args) };
  case "adapters":
   return { command: `adapters ${args[0] ?? ""}`.trim(), data: await commandAdapters(root!, args) };
  default:
   throw new OpsxError("USAGE", `Unknown command ${command}. Run opsx-schema --help for commands.`);
 }
}



async function main(): Promise<void> {
 let json = process.argv.includes("--json");
 let command = "";
 try {
  const parsed = globalOptions(process.argv.slice(2));
  json = parsed.json;
  if (parsed.help) {
   process.stdout.write(json ? JSON.stringify({ schemaVersion: 1, command: "help", ok: true, data: { help: HELP } }) + "\n" : HELP);
   return;
  }
  if (parsed.words[0] === "help") {
   requireCount(parsed.words.slice(1), 0, 0, "help");
   process.stdout.write(json ? JSON.stringify({ schemaVersion: 1, command: "help", ok: true, data: { help: HELP } }) + "\n" : HELP);
   return;
  }
  const { command: routedCommand, data } = await execute(parsed);
  command = routedCommand;
  if (command === "dashboard") return;
  const status = statusOf(command, data);
  const envelope = { schemaVersion: 1, command, ok: status.ok, data, ...(status.error ? { error: status.error } : {}) };
  process.stdout.write((json ? JSON.stringify(envelope) : encode(envelope)) + "\n");
  if (!status.ok) process.exitCode = 1;
 } catch (error) {
  const failure = error instanceof OpsxError ? error : new OpsxError((error as { code?: string })?.code ?? "UNEXPECTED", errorMessage(error));
  const envelope = { schemaVersion: 1, ...(command ? { command } : {}), ok: false, error: { code: failure.code, message: failure.message } };
  process.stdout.write((json ? JSON.stringify(envelope) : encode(envelope)) + "\n");
  process.exitCode = 1;
 }
}

await main();
