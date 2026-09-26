import type { ChangeSummary } from "../domain/snapshot.ts";
import type { ChangeHistory } from "../provenance/index.ts";

export type ReadState<T> =
  | { status: "pending" }
  | { status: "loaded"; value: T }
  | { status: "error"; message: string };

export interface PlanningProgress {
  ready: number;
  total: number;
  complete: boolean | null;
}

export interface TaskProgress {
  checked: number;
  total: number;
  remaining: number;
}

export interface ChangeReadModel {
  name: string;
  status: string;
  schema: string;
  planning: PlanningProgress;
  tasks: TaskProgress | null;
}

export interface OverviewReadModel {
  activeChanges: ChangeReadModel[];
  planningComplete: number;
  planningTotal: number;
  taskProgress: TaskProgress | null;
}

function validTasks(change: ChangeSummary): TaskProgress | null {
  const tasks = change.tasks;
  if (!tasks || !Number.isInteger(tasks.complete) || !Number.isInteger(tasks.total)
    || tasks.total < 0 || tasks.complete < 0 || tasks.complete > tasks.total) return null;
  return { checked: tasks.complete, total: tasks.total, remaining: tasks.total - tasks.complete };
}

function planningProgress(change: ChangeSummary): PlanningProgress {
  const total = change.artifacts.length;
  const ready = change.artifacts.reduce((count, artifact) => count + (artifact.status === "done" ? 1 : 0), 0);
  return { ready, total, complete: total === 0 ? null : ready === total };
}

export function projectOverview(changes: readonly ChangeSummary[]): OverviewReadModel {
  const activeChanges = changes.map((change) => ({
    name: change.name,
    status: change.status,
    schema: change.schema,
    planning: planningProgress(change),
    tasks: validTasks(change),
  }));
  const allTasksKnown = activeChanges.every(change => change.tasks !== null);
  const taskProgress = allTasksKnown
    ? activeChanges.reduce((total, change) => ({
      checked: total.checked + change.tasks!.checked,
      total: total.total + change.tasks!.total,
      remaining: total.remaining + change.tasks!.remaining,
    }), { checked: 0, total: 0, remaining: 0 })
    : null;
  return {
    activeChanges,
    planningComplete: activeChanges.reduce((count, change) => count + (change.planning.complete === true ? 1 : 0), 0),
    planningTotal: activeChanges.filter((change) => change.planning.complete !== null).length,
    taskProgress,
  };
}

export function planningLabel(progress: PlanningProgress): string {
  if (progress.complete === null) return "Unknown planning readiness";
  return progress.complete
    ? `Complete planning (${progress.ready}/${progress.total} artifacts ready)`
    : `Planning in progress (${progress.ready}/${progress.total} artifacts ready)`;
}

export function taskLabel(progress: TaskProgress | null): string {
  return progress ? `${progress.checked}/${progress.total} implementation tasks checked` : "Unknown";
}

export function revisionLabel(revision: ChangeHistory["created"]): string {
  if (revision === "Unknown") return "Unknown";
  return `${revision.name} · ${revision.digest.slice(0, 12)}`;
}

export function migrationLabel(history: ChangeHistory): string[] {
  return history.migrations.map(({ from, to, at }) => `${from.name} → ${to.name} · ${at}`);
}

export function boundedPreview(content: string, maxChars = 12_000, maxLines = 120): { text: string; truncated: boolean } {
  const clipped = content.slice(0, maxChars);
  const lines = clipped.split("\n");
  const shown = lines.slice(0, maxLines);
  const truncated = content.length > clipped.length || lines.length > shown.length;
  const safe = shown.join("\n").replace(/\r/g, "").replace(/\x1b/g, "␛")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�");
  return { text: safe, truncated };
}

export function untrackedAdditionDiff(relative: string, content: string, maxLines = 120): { patch: string; truncated: boolean } {
  const preview = boundedPreview(content, 12_000, maxLines);
  const safePath = relative.replace(/[\r\n\x00-\x1f\x7f]/g, "_");
  const lines = preview.text.split("\n");
  const header = [`--- /dev/null`, `+++ b/${safePath}`, `@@ -0,0 +1,${lines.length} @@`];
  const body = lines.map((line) => `+${line}`);
  if (preview.truncated) body.push("\\ ... preview truncated; remaining file lines are not shown");
  return { patch: [...header, ...body].join("\n"), truncated: preview.truncated };
}

export function safeReadError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  switch (code) {
    case "UNSAFE_PATH": return "Read refused: the requested path is outside the selected change.";
    case "CHANGE_NOT_FOUND": return "This change is no longer available.";
    case "FILE_TOO_LARGE": return "This file exceeds the 1 MiB read limit.";
    case "FILE_NOT_TEXT": return "This file is binary or is not valid UTF-8 text.";
    case "ARCHIVE_TOO_LARGE": return "This change contains too many files to browse safely.";
    case "PROVENANCE_INVALID": return "Historical provenance is malformed and cannot be displayed.";
    case "ENOENT": return "This file or change is no longer available.";
    default: return "Unable to read this change safely.";
  }
}

export function readErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return boundedPreview(message, 240, 1).text || "Unknown read error.";
}

export function displayFileName(name: string): string {
  return name.replace(/[\r\n\x00-\x1f\x7f]/g, "_");
}

export function visibleFiles(files: readonly string[]): string[] {
  return files.filter((file) => file !== ".opsx-provenance.json");
}

export function selectedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}
