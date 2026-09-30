import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { OpsxError, resolveProject } from "../domain/project.ts";

const JOURNAL_NAME = "switch-journal.json";
const JOURNAL_VERSION = 1;
const ACTION_STATUSES: Record<string, true> = {
  pending: true,
  running: true,
  complete: true,
  failed: true,
};
const ACTION_KINDS: Record<string, true> = {
  "schema.install": true,
  "schema.validate": true,
  "skills.install": true,
  "revision.retain": true,
  "legacy.provenance": true,
  "legacy.pin": true,
  "migration.pin": true,
  "migration.provenance": true,
  "config.activate": true,
  "selection.receipt": true,
  postflight: true,
};

interface JournalAction {
  targets: string[];
}

interface SwitchJournal {
  version: 1;
  root: string;
  state: "applying" | "partial" | "complete";
  actions: JournalAction[];
}

function invalidJournal(file: string): OpsxError {
  return new OpsxError(
    "SWITCH_JOURNAL_INVALID",
    `Switch recovery journal is invalid: ${file}`,
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function validJournal(value: unknown, root: string): value is SwitchJournal {
  if (
    !record(value) ||
    value.version !== JOURNAL_VERSION ||
    value.root !== root ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !record(value.request) ||
    typeof value.request.schema !== "string" ||
    !value.request.schema ||
    !stringArray(value.request.profiles) ||
    !stringArray(value.request.migrations) ||
    (value.request.skillHosts !== undefined &&
      !stringArray(value.request.skillHosts)) ||
    (value.request.skillBundle !== undefined &&
      !["default", "recommended", "all"].includes(
        String(value.request.skillBundle),
      )) ||
    typeof value.previewToken !== "string" ||
    !value.previewToken ||
    typeof value.oldDefault !== "string" ||
    !value.oldDefault ||
    typeof value.targetDefault !== "string" ||
    !value.targetDefault ||
    !["applying", "partial", "complete"].includes(String(value.state)) ||
    !Array.isArray(value.actions) ||
    value.actions.length === 0 ||
    (value.error !== undefined &&
      (!record(value.error) ||
        typeof value.error.code !== "string" ||
        typeof value.error.message !== "string"))
  )
    return false;

  const actionIds = new Set<string>();
  for (const action of value.actions) {
    if (
      !record(action) ||
      typeof action.id !== "string" ||
      !action.id ||
      actionIds.has(action.id) ||
      typeof action.kind !== "string" ||
      !ACTION_KINDS[action.kind] ||
      typeof action.status !== "string" ||
      !ACTION_STATUSES[action.status] ||
      !Array.isArray(action.targets) ||
      action.targets.length === 0 ||
      action.targets.some((target) => {
        if (
          typeof target !== "string" ||
          !path.isAbsolute(target) ||
          path.resolve(target) !== target
        )
          return true;
        const relative = path.relative(root, target);
        return (
          relative === "" ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        );
      }) ||
      new Set(action.targets).size !== action.targets.length ||
      typeof action.intent !== "string" ||
      !action.intent ||
      (action.desiredDigest !== undefined &&
        (typeof action.desiredDigest !== "string" ||
          !/^[a-f0-9]{64}$/.test(action.desiredDigest))) ||
      (action.desiredBytes !== undefined &&
        typeof action.desiredBytes !== "string") ||
      (action.error !== undefined &&
        (!record(action.error) ||
          typeof action.error.code !== "string" ||
          typeof action.error.message !== "string")) ||
      (action.observed !== undefined && !record(action.observed))
    )
      return false;
    actionIds.add(action.id);
  }
  return (
    value.state !== "complete" ||
    value.actions.every(
      (action) => record(action) && action.status === "complete",
    )
  );
}

function overlaps(left: string, right: string): boolean {
  const relative = path.relative(left, right);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function readJournal(root: string): Promise<SwitchJournal | null> {
  const openspec = path.join(root, "openspec");
  const directory = path.join(openspec, ".opsx");
  const file = path.join(directory, JOURNAL_NAME);

  for (const [target, label] of [
    [openspec, "OpenSpec"],
    [directory, "Switch journal directory"],
  ] as const) {
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new OpsxError(
          "SWITCH_JOURNAL_UNSAFE",
          `${label} path is unsafe: ${target}`,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new OpsxError(
      "SWITCH_JOURNAL_UNSAFE",
      `Switch journal cannot be inspected safely: ${file}`,
    );
  }
  if (info.isSymbolicLink() || !info.isFile())
    throw new OpsxError(
      "SWITCH_JOURNAL_UNSAFE",
      `Switch journal path is unsafe: ${file}`,
    );

  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw invalidJournal(file);
  }
  if (!validJournal(value, root)) throw invalidJournal(file);
  return value;
}

/** Reject resource mutations that overlap targets in an unfinished switch transaction. */
export async function assertNoIncompleteSwitchRecovery(
  rootInput: string,
  targets: readonly string[],
): Promise<void> {
  const root = await resolveProject(rootInput, true);
  const requested = targets.map((target) => {
    if (typeof target !== "string" || !path.isAbsolute(target))
      throw new OpsxError(
        "SWITCH_RECOVERY_TARGET_INVALID",
        "Switch recovery guard requires absolute resource targets.",
      );
    return path.resolve(target);
  });
  if (requested.length === 0) return;

  const journal = await readJournal(root);
  if (!journal || journal.state === "complete") return;
  for (const action of journal.actions) {
    const affected = action.targets.find((target) =>
      requested.some((candidate) => {
        const normalized = path.resolve(target);
        return (
          overlaps(candidate, normalized) || overlaps(normalized, candidate)
        );
      }),
    );
    if (affected)
      throw new OpsxError(
        "SWITCH_RECOVERY_REQUIRED",
        `An incomplete schema switch journal affects resource target: ${affected}`,
      );
  }
}
