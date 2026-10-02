import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  CodeRenderable,
  MarkdownRenderable,
  Renderable,
  type ScrollBoxRenderable,
  TextRenderable,
} from "@opentui/core";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  archivedFile,
  archivedRecord,
  boundedFile,
  changeDirectory,
  listFiles,
} from "../archive/index.ts";
import type { ChangeSummary, DetailedChange } from "../domain/snapshot.ts";
import type { ChangeHistory } from "../provenance/index.ts";
import { changeHistory } from "../provenance/index.ts";
import { DocumentPreview } from "./document.tsx";
import type { TaskProgress } from "./model.ts";
import {
  boundedPreview,
  displayFileName,
  migrationLabel,
  projectOverview,
  revisionLabel,
  safeReadError,
  selectedIndex,
  untrackedAdditionDiff,
  visibleFiles,
} from "./model.ts";
import {
  ActionHint,
  registerNumber,
  SectionPanel,
  SelectableRow,
  ViewHeading,
} from "./presentation.tsx";
import { TaskProgressView } from "./progress.tsx";
import {
  noColorEnabled,
  PendingRead,
  reducedMotionEnabled,
  tuiTextColor,
} from "./theme.tsx";

const runFile = promisify(execFile);
const MAX_GIT_DIFF_BYTES = 256 * 1024;

type BrowserMode = "list" | "detail" | "file";
type ContentMode = "document" | "source";
type ReaderMode = ContentMode | "diff";
type ReadEntry = {
  name: string;
  status?: string;
  schema?: string;
};
type Detail = {
  files: string[];
  history: ChangeHistory | null;
  historyError: string | null;
  error: string | null;
  historicalTasks: HistoricalTasks;
};
type HistoricalTasks =
  | { status: "not-found" }
  | { status: "loaded"; progress: TaskProgress }
  | { status: "error"; message: string };
type ActiveDetail =
  | { status: "pending" }
  | { status: "loaded"; value: DetailedChange }
  | { status: "error"; message: string };
type FileView = {
  loading: boolean;
  error: string | null;
  label: string | null;
  content: string | null;
  patch: string | null;
  truncated: boolean;
};

function historicalTaskProgress(content: string): TaskProgress {
  let checked = 0;
  let total = 0;
  for (const match of content.matchAll(/^\s*[-*+]\s+\[([ xX])\]/gm)) {
    total++;
    if (match[1] !== " ") {
      checked++;
    }
  }
  return { checked, total, remaining: total - checked };
}

function wrapIdentity(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }
  const lines: string[] = [];
  for (let offset = 0; offset < value.length; offset += maxWidth) {
    lines.push(value.slice(offset, offset + maxWidth));
  }
  return lines.join("\n");
}

function scrollSelection(
  scrollbox: ScrollBoxRenderable | null,
  rowId: string,
): void {
  if (!scrollbox || scrollbox.viewport.height <= 0) {
    return;
  }
  const child = scrollbox.content.findDescendantById(rowId);
  if (!child) {
    return;
  }
  const previousScrollTop = scrollbox.scrollTop;
  scrollbox.scrollChildIntoView(rowId);
  if (
    scrollbox.scrollTop !== previousScrollTop ||
    child.height > scrollbox.viewport.height
  ) {
    return;
  }
  const viewportTop = scrollbox.viewport.y;
  const viewportBottom = viewportTop + scrollbox.viewport.height;
  const childBottom = child.y + child.height;
  if (child.y < viewportTop) {
    scrollbox.scrollBy({ x: 0, y: child.y - viewportTop });
  } else if (childBottom > viewportBottom) {
    scrollbox.scrollBy({ x: 0, y: childBottom - viewportBottom });
  }
}

function scrollContent(
  scrollbox: ScrollBoxRenderable | null,
  key: string,
): void {
  if (!scrollbox) {
    return;
  }
  const page = Math.max(1, scrollbox.viewport.height - 1);
  if (key === "up" || key === "arrowup" || key === "k") {
    scrollbox.scrollBy({ x: 0, y: -1 });
  } else if (key === "down" || key === "arrowdown" || key === "j") {
    scrollbox.scrollBy({ x: 0, y: 1 });
  } else if (key === "pageup" || key === "pgup") {
    scrollbox.scrollBy({ x: 0, y: -page });
  } else if (key === "pagedown" || key === "pgdn") {
    scrollbox.scrollBy({ x: 0, y: page });
  } else if (key === "home") {
    scrollbox.scrollTo({ x: 0, y: 0 });
  } else if (key === "end") {
    scrollbox.scrollTo({ x: 0, y: scrollbox.scrollHeight });
  }
}

async function readDiff(
  root: string,
  name: string,
  relative: string,
  archived: boolean,
): Promise<{
  label: string;
  patch: string | null;
  message: string | null;
  truncated: boolean;
}> {
  const directory = await changeDirectory(root, name, archived);
  const currentFile = archived
    ? await archivedFile(root, name, relative)
    : await boundedFile(directory, relative);
  const projectRoot = await realpath(root);
  const changeRoot = path
    .relative(projectRoot, directory)
    .split(path.sep)
    .join("/");
  const repositoryPath = path.posix.join(changeRoot, relative);
  const literalPathspec = `:(literal)${repositoryPath}`;

  try {
    await runFile("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
      cwd: projectRoot,
      maxBuffer: 64 * 1024,
    });
  } catch {
    return {
      label: "No Git HEAD baseline",
      patch: null,
      message:
        "No Git HEAD baseline is available; no diff can be shown for this file.",
      truncated: false,
    };
  }

  let tracked = true;
  try {
    await runFile(
      "git",
      ["ls-files", "--error-unmatch", "--", literalPathspec],
      { cwd: projectRoot, maxBuffer: 64 * 1024 },
    );
  } catch (error) {
    const status =
      error && typeof error === "object"
        ? "status" in error
          ? Number(error.status)
          : "code" in error && typeof error.code === "number"
            ? error.code
            : NaN
        : NaN;
    if (status !== 1) {
      return {
        label: "Git diff unavailable",
        patch: null,
        message: "Git could not inspect this file safely.",
        truncated: false,
      };
    }
    tracked = false;
  }

  if (!tracked) {
    const addition = untrackedAdditionDiff(relative, currentFile.content);
    return {
      label: "Untracked addition against Git HEAD",
      patch: addition.patch,
      message: null,
      truncated: addition.truncated,
    };
  }

  try {
    const { stdout } = await runFile(
      "git",
      [
        "--no-pager",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--no-renames",
        "--unified=3",
        "HEAD",
        "--",
        literalPathspec,
      ],
      { cwd: projectRoot, maxBuffer: MAX_GIT_DIFF_BYTES, encoding: "utf8" },
    );
    if (stdout.length === 0) {
      return {
        label: "Git HEAD comparison",
        patch: null,
        message: "No changes from Git HEAD for this file.",
        truncated: false,
      };
    }
    const preview = boundedPreview(stdout, 12_000, 120);
    return {
      label: "Git HEAD comparison",
      patch: preview.text,
      message: null,
      truncated: preview.truncated,
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return {
        label: "Git HEAD comparison",
        patch: null,
        message: "The Git diff exceeds the 256 KiB read limit.",
        truncated: false,
      };
    }
    return {
      label: "Git HEAD comparison",
      patch: null,
      message: "Git could not produce a bounded diff for this file.",
      truncated: false,
    };
  }
}

function isEnter(key: string): boolean {
  return key === "enter" || key === "return";
}

function isEscape(key: string): boolean {
  return key === "escape" || key === "esc";
}

function isPlanningArtifact(file: string): boolean {
  const normalized = file.toLowerCase();
  return (
    normalized === "proposal.md" ||
    normalized === "design.md" ||
    normalized.startsWith("specs/")
  );
}

function ProgressContext({
  archived,
  detail,
  activeDetail,
  transitionKey,
}: {
  archived: boolean;
  detail: Detail | null;
  activeDetail: ActiveDetail;
  transitionKey: string;
}) {
  const loaded =
    activeDetail.status === "loaded"
      ? projectOverview([activeDetail.value]).activeChanges[0]!
      : null;
  const historical = detail?.historicalTasks;
  const pending = archived
    ? detail === null
    : activeDetail.status === "pending";
  const failure = archived
    ? (detail?.error ??
      (historical?.status === "error" ? historical.message : null))
    : activeDetail.status === "error"
      ? activeDetail.message
      : null;
  return (
    <box flexDirection="column" flexShrink={0} width="100%">
      {pending ? (
        <PendingRead
          label={
            archived ? "Historical tasks: Loading..." : "Tasks: Loading..."
          }
        />
      ) : failure ? (
        <text wrapMode="char" fg={tuiTextColor("error", noColorEnabled())}>
          {archived ? "Historical tasks" : "Tasks"}: Unavailable · {failure}
        </text>
      ) : (
        <TaskProgressView
          progress={
            archived
              ? historical?.status === "loaded"
                ? historical.progress
                : null
              : (loaded?.tasks ?? null)
          }
          historical={archived}
          compact
          cells={6}
          transitionKey={transitionKey}
        />
      )}
      <text wrapMode="char" fg={tuiTextColor("muted", noColorEnabled())}>
        {archived
          ? "Historical planning: Unknown"
          : pending
            ? "Planning: Loading..."
            : failure
              ? "Planning: Unavailable"
              : loaded?.planning.complete === null
                ? "Planning: Unknown"
                : `Planning: ${loaded?.planning.ready}/${loaded?.planning.total} artifacts ready`}
      </text>
    </box>
  );
}

// Native percentage text widths can retain the pre-scrollbar width while Yoga
// measures height against the narrower viewport. Bind only reader text leaves
// to their settled clipping edge; native resize callbacks still own the range.
function fitReaderPreview(scroll: ScrollBoxRenderable | null) {
  if (!scroll || scroll.viewport.width < 1) return;
  const fit = (node: Renderable, right: number) => {
    if (
      node instanceof CodeRenderable ||
      (node instanceof TextRenderable && node.id === "reader-source-preview")
    ) {
      const available = Math.max(1, right - node.x);
      if (node.width !== available) node.width = available;
    }
    const childRight = Math.min(right, node.x + node.width);
    for (const child of node.getChildren()) {
      if (child instanceof Renderable) fit(child, childRight);
    }
  };
  const right = scroll.viewport.x + scroll.viewport.width;
  for (const child of scroll.getChildren()) {
    if (
      child instanceof MarkdownRenderable ||
      (child instanceof TextRenderable && child.id === "reader-source-preview")
    ) {
      fit(child, right);
    }
  }
}

type IdentifiedRead<T> = { identity: string; value: T };
const PENDING_ACTIVE_DETAIL: ActiveDetail = { status: "pending" };
const PENDING_FILE_VIEW: FileView = {
  loading: true,
  error: null,
  label: null,
  content: null,
  patch: null,
  truncated: false,
};

function ReadOnlyBrowser({
  title,
  root,
  entries,
  archived,
  loadChangeDetail,
  refreshVersion = 0,
  onFilterEditingChange,
  viewportHeight,
}: {
  title: "Changes" | "Archive";
  root: string;
  entries: readonly ReadEntry[];
  archived: boolean;
  loadChangeDetail?: (name: string) => Promise<DetailedChange>;
  refreshVersion?: number;
  onFilterEditingChange?: (editing: boolean) => void;
  viewportHeight?: number;
}) {
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const wideLayout = width >= 75;
  // Dashboard supplies the exact content height; direct renders reserve the same shell rows.
  const browserHeight = Math.max(
    1,
    viewportHeight ?? height - (wideLayout ? 8 : 7),
  );
  const colorDisabled = noColorEnabled();
  const motionReduced = reducedMotionEnabled();
  const [mode, setMode] = useState<BrowserMode>("list");
  const [query, setQuery] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [listSelectionName, setListSelectionName] = useState<string | null>(
    null,
  );
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [fileSelectionName, setFileSelectionName] = useState<string | null>(
    null,
  );
  const [detailFocus, setDetailFocus] = useState<"summary" | "files">("files");
  const [contentMode, setContentMode] = useState<ContentMode>("source");
  const [readerMode, setReaderMode] = useState<ReaderMode>("source");
  const showDiff = readerMode === "diff";
  const contextOpen = mode !== "list";
  const contextIdentity = JSON.stringify([root, selectedName, refreshVersion]);
  const [detailRead, setDetailRead] = useState<IdentifiedRead<Detail> | null>(
    null,
  );
  const detail =
    detailRead?.identity === contextIdentity ? detailRead.value : null;
  const [activeRead, setActiveRead] =
    useState<IdentifiedRead<ActiveDetail> | null>(null);
  const activeDetail =
    activeRead?.identity === contextIdentity
      ? activeRead.value
      : PENDING_ACTIVE_DETAIL;
  const [fileRead, setFileRead] = useState<IdentifiedRead<FileView> | null>(
    null,
  );
  const listScroll = useRef<ScrollBoxRenderable>(null);
  const summaryScroll = useRef<ScrollBoxRenderable>(null);
  const filesScroll = useRef<ScrollBoxRenderable>(null);
  const fileContentScroll = useRef<ScrollBoxRenderable>(null);
  const filterCallback = useRef(onFilterEditingChange);
  filterCallback.current = onFilterEditingChange;

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? entries.filter((entry) =>
          entry.name.toLocaleLowerCase().includes(needle),
        )
      : [...entries];
  }, [entries, query]);
  const listActionHint = filtering
    ? "Filter: type · Enter apply · Esc clear"
    : "j/k select · Enter open · / filter · Esc clear";
  const detailActionHint =
    detailFocus === "files"
      ? "j/k files · Enter read · m summary · Esc list"
      : "j/k scroll · f files · Esc list";

  const selectedListIndex = visibleEntries.findIndex(
    (entry) => entry.name === listSelectionName,
  );
  const visibleCursor = selectedListIndex < 0 ? 0 : selectedListIndex;
  const selectedListEntry = visibleEntries[visibleCursor] ?? null;
  const selectedEntry =
    mode === "list"
      ? selectedListEntry
      : (entries.find((entry) => entry.name === selectedName) ?? null);
  const selectedFileIndex =
    detail?.files.indexOf(fileSelectionName ?? "") ?? -1;
  const fileCursor = selectedFileIndex < 0 ? 0 : selectedFileIndex;
  // Only settled detail inventory is actionable; a pending refresh or open
  // reader retains its requested identity even if that file disappears.
  const selectedFile =
    mode === "detail" && detail !== null
      ? (detail.files[fileCursor] ?? null)
      : (fileSelectionName ?? detail?.files[fileCursor] ?? null);
  const fileIdentityKey = JSON.stringify([
    contextIdentity,
    selectedFile,
    showDiff,
  ]);
  const fileView =
    fileRead?.identity === fileIdentityKey ? fileRead.value : PENDING_FILE_VIEW;
  const markdownFile = /\.(md|markdown)$/i.test(selectedFile ?? "");
  const fileActionHint = markdownFile
    ? "j/k scroll · m source/document · d diff · Esc detail"
    : "j/k scroll · d diff/source · Esc detail";
  const readerModes = (
    markdownFile ? ["document", "source", "diff"] : ["source", "diff"]
  )
    .map((name) => {
      const label = name[0]!.toUpperCase() + name.slice(1);
      return readerMode === name ? "[" + label + "]" : label;
    })
    .join(" / ");
  const fileIdentity = displayFileName(
    (selectedName ?? "Unknown") + "/" + (selectedFile ?? "Unknown file"),
  );
  const readerIdentityLimit = Math.max(12, width - 6);
  const readerIdentity =
    fileIdentity.length > readerIdentityLimit
      ? fileIdentity.slice(0, Math.floor(readerIdentityLimit / 2) - 1) +
        "…" +
        fileIdentity.slice(-Math.ceil(readerIdentityLimit / 2))
      : fileIdentity;
  const selectedChange =
    activeDetail.status === "loaded" ? activeDetail.value : null;
  const history = archived
    ? (detail?.history ?? null)
    : (selectedChange?.history ?? null);
  const planningFiles = detail?.files.filter(isPlanningArtifact).length ?? 0;
  const listPanelAreaHeight = Math.max(
    1,
    browserHeight - Number(wideLayout) - 1,
  );
  const showListContext = wideLayout || listPanelAreaHeight >= 10;
  const listPanelHeight =
    wideLayout || !showListContext
      ? listPanelAreaHeight
      : Math.max(5, listPanelAreaHeight - 5);
  const contextPanelHeight = wideLayout
    ? Math.min(8, listPanelAreaHeight)
    : showListContext
      ? listPanelAreaHeight - listPanelHeight
      : 0;
  const detailPanelAreaHeight = Math.max(
    1,
    browserHeight - Number(wideLayout) - 1,
  );
  const detailFilesPanelHeight = wideLayout
    ? detailPanelAreaHeight
    : Math.min(5, Math.ceil(detailPanelAreaHeight / 2));
  const detailSummaryPanelHeight = wideLayout
    ? detailPanelAreaHeight
    : Math.max(1, detailPanelAreaHeight - detailFilesPanelHeight);
  const filterLimit = Math.max(
    8,
    Math.floor((wideLayout ? width * 0.6 : width) - 12),
  );
  const identityWidth = Math.max(
    1,
    Math.floor((wideLayout ? width * 0.7 : width) - 7),
  );
  const filterDisplay =
    query.length > filterLimit ? query.slice(0, filterLimit - 1) + "…" : query;

  useEffect(() => {
    filterCallback.current?.(filtering);
    return () => {
      filterCallback.current?.(false);
    };
  }, [filtering]);

  useEffect(() => {
    if (mode === "list") {
      scrollSelection(listScroll.current, "browser-list-row-" + visibleCursor);
    }
  }, [browserHeight, mode, visibleCursor, visibleEntries, width]);

  useEffect(() => {
    if (mode === "list" || (mode === "file" && readerMode === "diff")) {
      return;
    }
    const settleViewport = () => {
      if (mode === "detail") {
        scrollSelection(filesScroll.current, "browser-file-row-" + fileCursor);
      } else {
        fitReaderPreview(fileContentScroll.current);
      }
    };
    settleViewport();
    // Native frame follows complete layout/paint. Never shadow onSizeChange:
    // native callbacks keep scroll ranges correct on remount, wrap and resize.
    renderer.on("frame", settleViewport);
    return () => {
      renderer.off("frame", settleViewport);
    };
  }, [
    browserHeight,
    detail?.files,
    detailFocus,
    fileCursor,
    mode,
    readerMode,
    renderer,
    width,
  ]);

  useKeyboard((event) => {
    const key = event.name.toLowerCase();
    if (mode === "file") {
      if (isEscape(key)) {
        setMode("detail");
        setDetailFocus("files");
      } else if (key === "d") {
        setReaderMode((current) => (current === "diff" ? contentMode : "diff"));
      } else if (key === "m" && markdownFile) {
        const nextContentMode =
          contentMode === "document" ? "source" : "document";
        setContentMode(nextContentMode);
        setReaderMode(nextContentMode);
      } else {
        scrollContent(fileContentScroll.current, key);
      }
      return;
    }
    if (mode === "detail") {
      if (isEscape(key)) {
        setMode("list");
        return;
      }
      if (key === "m") {
        setDetailFocus("summary");
        return;
      }
      if (key === "f") {
        setDetailFocus("files");
        return;
      }
      if (detailFocus === "summary") {
        scrollContent(summaryScroll.current, key);
        return;
      }
      if (key === "up" || key === "arrowup" || key === "k") {
        if (detail?.files.length) {
          setFileSelectionName(
            detail.files[selectedIndex(fileCursor - 1, detail.files.length)]!,
          );
        }
      } else if (key === "down" || key === "arrowdown" || key === "j") {
        if (detail?.files.length) {
          setFileSelectionName(
            detail.files[selectedIndex(fileCursor + 1, detail.files.length)]!,
          );
        }
      } else if (isEnter(key) && selectedFile) {
        setFileSelectionName(selectedFile);
        const initialMode = markdownFile ? "document" : "source";
        setContentMode(initialMode);
        setReaderMode(initialMode);
        setMode("file");
      }
      return;
    }
    if (filtering) {
      if (isEscape(key)) {
        setQuery("");
        setFiltering(false);
      } else if (isEnter(key)) {
        setFiltering(false);
      }
      return;
    }
    if (isEscape(key)) {
      if (query) {
        setQuery("");
      }
    } else if (key === "/" || key === "slash") {
      setFiltering(true);
    } else if (key === "up" || key === "arrowup" || key === "k") {
      const entry =
        visibleEntries[selectedIndex(visibleCursor - 1, visibleEntries.length)];
      if (entry) {
        setListSelectionName(entry.name);
      }
    } else if (key === "down" || key === "arrowdown" || key === "j") {
      const entry =
        visibleEntries[selectedIndex(visibleCursor + 1, visibleEntries.length)];
      if (entry) {
        setListSelectionName(entry.name);
      }
    } else if (isEnter(key) && selectedListEntry) {
      setListSelectionName(selectedListEntry.name);
      setSelectedName(selectedListEntry.name);
      setFileSelectionName(null);
      setMode("detail");
      setDetailFocus("files");
      setDetailRead(null);
      setActiveRead(null);
    }
  });

  useEffect(() => {
    if (!contextOpen || !selectedEntry) {
      return;
    }
    let current = true;
    const setDetail = (value: Detail) =>
      setDetailRead({ identity: contextIdentity, value });
    const load = async () => {
      try {
        if (archived) {
          const record = await archivedRecord(root, selectedEntry.name);
          const files = visibleFiles(record.files);
          let changeHistoryValue: ChangeHistory | null = null;
          let historyError: string | null = null;
          try {
            changeHistoryValue = await changeHistory(
              root,
              selectedEntry.name,
              true,
            );
          } catch (error) {
            historyError = safeReadError(error);
          }
          let historicalTasks: HistoricalTasks = { status: "not-found" };
          const taskFile = files.find(
            (file) => file.toLowerCase() === "tasks.md",
          );
          if (taskFile) {
            try {
              const taskDocument = await archivedFile(
                root,
                selectedEntry.name,
                taskFile,
              );
              historicalTasks = {
                status: "loaded",
                progress: historicalTaskProgress(taskDocument.content),
              };
            } catch (error) {
              historicalTasks = {
                status: "error",
                message: safeReadError(error),
              };
            }
          }
          if (current) {
            setDetail({
              files,
              history: changeHistoryValue,
              historyError,
              error: null,
              historicalTasks,
            });
          }
        } else {
          const directory = await changeDirectory(
            root,
            selectedEntry.name,
            false,
          );
          const files = visibleFiles(await listFiles(directory));
          if (current) {
            setDetail({
              files,
              history: null,
              historyError: null,
              error: null,
              historicalTasks: { status: "not-found" },
            });
          }
        }
      } catch (error) {
        if (current) {
          setDetail({
            files: [],
            history: null,
            historyError: null,
            error: safeReadError(error),
            historicalTasks: { status: "not-found" },
          });
        }
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [archived, contextOpen, contextIdentity, root, selectedEntry?.name]);

  useEffect(() => {
    if (archived || !contextOpen || !selectedEntry) {
      return;
    }
    let current = true;
    const setActiveDetail = (value: ActiveDetail) =>
      setActiveRead({ identity: contextIdentity, value });
    setActiveDetail(PENDING_ACTIVE_DETAIL);
    if (!loadChangeDetail) {
      setActiveDetail({
        status: "error",
        message: "Active change detail reader is unavailable.",
      });
      return () => {
        current = false;
      };
    }
    void loadChangeDetail(selectedEntry.name)
      .then((value) => {
        if (value.name !== selectedEntry.name) {
          throw new Error("Selected detail identity mismatch.");
        }
        if (current) {
          setActiveDetail({ status: "loaded", value });
        }
      })
      .catch((error) => {
        if (current) {
          setActiveDetail({ status: "error", message: safeReadError(error) });
        }
      });
    return () => {
      current = false;
    };
  }, [
    archived,
    loadChangeDetail,
    contextOpen,
    contextIdentity,
    selectedEntry?.name,
  ]);

  useEffect(() => {
    if (mode !== "file" || !selectedEntry || !selectedFile) {
      return;
    }
    let current = true;
    const setFileView = (value: FileView) =>
      setFileRead({ identity: fileIdentityKey, value });
    setFileView({
      loading: true,
      error: null,
      label: null,
      content: null,
      patch: null,
      truncated: false,
    });
    const load = async () => {
      try {
        if (showDiff) {
          const diffResult = await readDiff(
            root,
            selectedEntry.name,
            selectedFile,
            archived,
          );
          if (current) {
            setFileView({
              loading: false,
              error: null,
              label: diffResult.label,
              content: diffResult.message,
              patch: diffResult.patch,
              truncated: diffResult.truncated,
            });
          }
        } else {
          const fileRead = archived
            ? await archivedFile(root, selectedEntry.name, selectedFile)
            : await boundedFile(
                await changeDirectory(root, selectedEntry.name, false),
                selectedFile,
              );
          const preview = boundedPreview(fileRead.content);
          if (current) {
            setFileView({
              loading: false,
              error: null,
              label: "File content",
              content: preview.text,
              patch: null,
              truncated: preview.truncated,
            });
          }
        }
      } catch (error) {
        if (current) {
          setFileView({
            loading: false,
            error: safeReadError(error),
            label: null,
            content: null,
            patch: null,
            truncated: false,
          });
        }
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [
    archived,
    mode,
    root,
    selectedEntry?.name,
    selectedFile,
    showDiff,
    fileIdentityKey,
  ]);

  useEffect(() => {
    if (mode === "file") {
      fileContentScroll.current?.scrollTo({ x: 0, y: 0 });
    }
  }, [mode, selectedFile, readerMode]);

  return (
    <box
      flexDirection="column"
      width="100%"
      height={browserHeight}
      flexShrink={0}
      flexBasis={browserHeight}
      minHeight={0}
    >
      {mode === "list" && (
        <>
          {wideLayout && (
            <ViewHeading title={title + " | List"} state="READ ONLY" />
          )}
          <box
            flexDirection={wideLayout ? "row" : "column"}
            alignItems={wideLayout ? "flex-start" : "stretch"}
            gap={wideLayout ? 1 : 0}
            width="100%"
            height={listPanelAreaHeight}
            flexShrink={0}
            flexBasis={listPanelAreaHeight}
            minHeight={0}
          >
            <box
              flexDirection="column"
              width="100%"
              height={wideLayout ? listPanelAreaHeight : listPanelHeight}
              flexGrow={wideLayout ? 6 : 0}
              flexShrink={wideLayout ? 1 : 0}
              flexBasis={wideLayout ? 0 : listPanelHeight}
              minWidth={0}
              minHeight={0}
            >
              <SectionPanel
                title={
                  wideLayout
                    ? archived
                      ? "HISTORY / ARCHIVED RECORDS"
                      : "ACTIVE / WORK IN PROGRESS"
                    : title + " / List"
                }
                state={
                  wideLayout
                    ? visibleEntries.length + " matching"
                    : archived
                      ? "HISTORICAL · RO"
                      : "READ ONLY"
                }
                height={wideLayout ? listPanelAreaHeight : listPanelHeight}
              >
                <box
                  flexDirection="row"
                  width="100%"
                  minWidth={0}
                  flexShrink={0}
                >
                  <text
                    flexShrink={0}
                    fg={tuiTextColor(
                      filtering ? "pending" : "muted",
                      colorDisabled,
                    )}
                  >
                    Filter:{" "}
                  </text>
                  {filtering ? (
                    <input
                      flexGrow={1}
                      minWidth={1}
                      placeholder="type to filter"
                      value={query}
                      focused
                      onInput={setQuery}
                      onSubmit={() => setFiltering(false)}
                    />
                  ) : (
                    <text wrapMode="char">
                      {query ? filterDisplay : "(none)"}
                      {!wideLayout
                        ? " · " + visibleEntries.length + " matches"
                        : ""}
                    </text>
                  )}
                </box>
                <scrollbox
                  ref={listScroll}
                  width="100%"
                  flexBasis={0}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={1}
                  focused={!filtering}
                >
                  {visibleEntries.length === 0 ? (
                    <text>
                      {entries.length === 0
                        ? archived
                          ? "No archived records."
                          : "No active changes."
                        : "No matching records."}
                    </text>
                  ) : (
                    visibleEntries.map((entry, index) => (
                      <SelectableRow
                        key={entry.name}
                        id={"browser-list-row-" + index}
                        label={
                          registerNumber(index) +
                          "  " +
                          entry.name +
                          (entry.status ? " - " + entry.status : "") +
                          (entry.schema ? " - schema " + entry.schema : "")
                        }
                        focused={index === visibleCursor}
                      />
                    ))
                  )}
                </scrollbox>
              </SectionPanel>
            </box>
            {showListContext && (
              <box
                flexDirection="column"
                width="100%"
                height={contextPanelHeight}
                flexGrow={wideLayout ? 4 : 0}
                flexShrink={wideLayout ? 1 : 0}
                flexBasis={wideLayout ? 0 : contextPanelHeight}
                minWidth={0}
                minHeight={0}
              >
                <SectionPanel
                  title={wideLayout ? "Selected item" : "Selected"}
                  state={archived ? "HISTORICAL" : "READ ONLY"}
                  height={contextPanelHeight}
                >
                  {selectedListEntry ? (
                    wideLayout ? (
                      <>
                        <text
                          width="100%"
                          wrapMode="char"
                          fg={tuiTextColor("accent", colorDisabled)}
                        >
                          {selectedListEntry.name}
                        </text>
                        <text
                          wrapMode="word"
                          content={
                            "Status: " +
                            (archived
                              ? "Archived"
                              : (selectedListEntry.status ?? "Unknown"))
                          }
                        />
                        {archived ? (
                          <text wrapMode="word">
                            Schema provenance: inspect detail for retained
                            history.
                          </text>
                        ) : (
                          <text wrapMode="word">
                            Effective schema:{" "}
                            {selectedListEntry.schema ?? "Unknown"}
                          </text>
                        )}
                      </>
                    ) : (
                      <text width="100%" wrapMode="char">
                        {selectedListEntry.name}
                      </text>
                    )
                  ) : (
                    <text wrapMode="word">
                      {entries.length === 0
                        ? "No records available."
                        : "No matching record selected."}
                    </text>
                  )}
                </SectionPanel>
              </box>
            )}
          </box>
          <ActionHint>{listActionHint}</ActionHint>
        </>
      )}
      {mode === "detail" && (
        <>
          {wideLayout && (
            <ViewHeading
              title={title + " | Detail"}
              context="List"
              state={archived ? "HISTORICAL · READ ONLY" : "READ ONLY"}
            />
          )}
          <box
            flexDirection={wideLayout ? "row" : "column"}
            width="100%"
            height={detailPanelAreaHeight}
            flexShrink={0}
            flexBasis={detailPanelAreaHeight}
            minHeight={0}
          >
            <box
              flexDirection="column"
              width="100%"
              height={
                wideLayout ? detailPanelAreaHeight : detailSummaryPanelHeight
              }
              flexGrow={wideLayout ? 7 : 0}
              flexShrink={wideLayout ? 1 : 0}
              flexBasis={wideLayout ? 0 : detailSummaryPanelHeight}
              minWidth={0}
              minHeight={0}
            >
              <SectionPanel
                title={
                  wideLayout
                    ? archived
                      ? "Historical record"
                      : "Active change"
                    : title + " / Detail"
                }
                state={
                  archived
                    ? detail?.historyError
                      ? "PROVENANCE UNAVAILABLE · READ ONLY"
                      : "HISTORICAL · READ ONLY"
                    : "READ ONLY · " +
                      (activeDetail.status === "pending"
                        ? "loading"
                        : activeDetail.status === "error"
                          ? "unavailable"
                          : "active")
                }
                height={
                  wideLayout ? detailPanelAreaHeight : detailSummaryPanelHeight
                }
              >
                <scrollbox
                  ref={summaryScroll}
                  width="100%"
                  flexBasis={0}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={1}
                  focused={detailFocus === "summary"}
                >
                  <box flexDirection="column" width="100%" paddingRight={2}>
                    {selectedName && (
                      <text
                        width="100%"
                        wrapMode="char"
                        fg={tuiTextColor(
                          archived ? "pending" : "accent",
                          colorDisabled,
                        )}
                      >
                        {wrapIdentity(
                          selectedName + (archived ? " (not active)" : ""),
                          identityWidth,
                        )}
                      </text>
                    )}
                    <ProgressContext
                      archived={archived}
                      detail={detail}
                      activeDetail={activeDetail}
                      transitionKey={selectedName ?? ""}
                    />
                    {archived ? (
                      <>
                        <text fg={tuiTextColor("pending", colorDisabled)}>
                          Status: Archived (historical; not active)
                        </text>
                        <text wrapMode="word">
                          Effective schema:{" "}
                          {history?.currentSchema ?? "Unknown"}
                        </text>
                      </>
                    ) : (
                      <>
                        <text>
                          Status:{" "}
                          {selectedChange?.status ??
                            selectedEntry?.status ??
                            "Unknown"}
                        </text>
                        <text wrapMode="word">
                          Effective schema:{" "}
                          {selectedChange?.schema ??
                            selectedEntry?.schema ??
                            "Unknown"}
                        </text>
                        {activeDetail.status === "pending" && (
                          <PendingRead
                            label="Loading active change details..."
                            noColor={colorDisabled}
                            reducedMotion={motionReduced}
                          />
                        )}
                        {activeDetail.status === "error" && (
                          <text>
                            Change detail read failed: {activeDetail.message}
                          </text>
                        )}
                      </>
                    )}
                    {history && (
                      <>
                        <text wrapMode="word">
                          Schema provenance: current {history.currentSchema};
                          inherited default {history.inherited ? "yes" : "no"}
                        </text>
                        <text wrapMode="word">
                          Created revision: {revisionLabel(history.created)}
                        </text>
                        {history.retained && (
                          <text wrapMode="word">
                            Retained revision: {revisionLabel(history.retained)}
                          </text>
                        )}
                        {history.divergence && (
                          <text wrapMode="word">
                            Provenance warning: {history.divergence}
                          </text>
                        )}
                        {history.migrations.length === 0 ? (
                          <text>Migrations: none recorded</text>
                        ) : (
                          history.migrations.map((_, index) => (
                            <text key={index + ":migration"} wrapMode="word">
                              Migration {index + 1}:{" "}
                              {migrationLabel(history)[index]}
                            </text>
                          ))
                        )}
                      </>
                    )}
                    {archived && detail?.historyError && (
                      <text wrapMode="word">
                        Provenance read failed: {detail.historyError}
                      </text>
                    )}
                    {archived && !history && detail === null && (
                      <text>Loading historical provenance...</text>
                    )}
                    {archived && !history && detail && !detail.historyError && (
                      <text>
                        Schema provenance: Unknown (no history record retained).
                      </text>
                    )}
                    {!archived && selectedChange && (
                      <>
                        <text>
                          Revision integrity:{" "}
                          {selectedChange.revision?.state ?? "Unknown"}
                        </text>
                      </>
                    )}
                    {archived && (
                      <>
                        <text wrapMode="word">
                          Historical planning progress:{" "}
                          {detail === null
                            ? "Loading archived files..."
                            : detail.error
                              ? "Unknown (file list failed)"
                              : "artifact status unavailable; " +
                                planningFiles +
                                " planning files retained"}
                        </text>
                      </>
                    )}
                    {detail?.error && (
                      <text wrapMode="word">
                        File list read failed: {detail.error}
                      </text>
                    )}
                    {detail && !detail.error && detail.files.length === 0 && (
                      <text>No retained files to display.</text>
                    )}
                  </box>
                </scrollbox>
              </SectionPanel>
            </box>
            <box
              flexDirection="column"
              width="100%"
              height={
                wideLayout ? detailPanelAreaHeight : detailFilesPanelHeight
              }
              flexGrow={wideLayout ? 3 : 0}
              flexShrink={wideLayout ? 1 : 0}
              flexBasis={wideLayout ? 0 : detailFilesPanelHeight}
              minWidth={0}
              minHeight={0}
            >
              <SectionPanel
                title="Files"
                state={
                  detail === null
                    ? "loading"
                    : detail.error
                      ? "unavailable"
                      : detail.files.length === 0
                        ? "empty"
                        : detail.files.length + " retained"
                }
                height={
                  wideLayout ? detailPanelAreaHeight : detailFilesPanelHeight
                }
              >
                <scrollbox
                  ref={filesScroll}
                  width="100%"
                  flexBasis={0}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={1}
                  focused={detailFocus === "files"}
                >
                  {detail === null ? (
                    <PendingRead
                      label="Loading file list..."
                      noColor={colorDisabled}
                      reducedMotion={motionReduced}
                    />
                  ) : detail.error ? (
                    <text fg={tuiTextColor("error", colorDisabled)}>
                      File list unavailable.
                    </text>
                  ) : detail.files.length === 0 ? (
                    <text>No retained files.</text>
                  ) : (
                    detail.files.map((file, index) => (
                      <SelectableRow
                        key={file}
                        id={"browser-file-row-" + index}
                        label={displayFileName(file).split("/").join(" / ")}
                        focused={index === fileCursor}
                      />
                    ))
                  )}
                </scrollbox>
              </SectionPanel>
            </box>
          </box>
          <ActionHint>{detailActionHint}</ActionHint>
        </>
      )}
      {mode === "file" && (
        <>
          <ViewHeading
            title={title + " | File"}
            state={archived ? "HISTORICAL · READ ONLY" : "READ ONLY"}
          />
          <box
            flexDirection="column"
            width="100%"
            flexGrow={1}
            minHeight={0}
            paddingLeft={1}
            paddingRight={1}
          >
            <text flexShrink={0} wrapMode="char">
              {readerModes}
            </text>
            <text flexShrink={0} wrapMode="char">
              {readerIdentity}
            </text>
            <ProgressContext
              archived={archived}
              detail={detail}
              activeDetail={activeDetail}
              transitionKey={selectedName ?? ""}
            />
            {fileView.truncated && (
              <text flexShrink={0} fg={tuiTextColor("pending", colorDisabled)}>
                Preview truncated at the safe display limit.
              </text>
            )}
            <scrollbox
              key={readerMode}
              ref={fileContentScroll}
              width="100%"
              flexBasis={0}
              flexGrow={1}
              flexShrink={0}
              minHeight={0}
              focused
            >
              {showDiff && fileView.label && <text>{fileView.label}</text>}
              {fileView.loading ? (
                <PendingRead
                  label="Reading bounded file content..."
                  noColor={colorDisabled}
                  reducedMotion={motionReduced}
                />
              ) : fileView.error ? (
                <text wrapMode="word" fg={tuiTextColor("error", colorDisabled)}>
                  File read failed: {fileView.error}
                </text>
              ) : fileView.patch ? (
                <diff
                  diff={fileView.patch}
                  view="unified"
                  showLineNumbers
                  wrapMode="char"
                />
              ) : fileView.content === "" ? (
                <text>File is empty.</text>
              ) : fileView.content !== null ? (
                readerMode === "document" ? (
                  <DocumentPreview
                    key={selectedFile}
                    content={fileView.content}
                    noColor={colorDisabled}
                  />
                ) : (
                  <text
                    id={
                      readerMode === "source"
                        ? "reader-source-preview"
                        : undefined
                    }
                    wrapMode="char"
                  >
                    {fileView.content}
                  </text>
                )
              ) : (
                <text>Waiting for file content...</text>
              )}
            </scrollbox>
          </box>
          <ActionHint>{fileActionHint}</ActionHint>
        </>
      )}
    </box>
  );
}

export interface ChangesProps {
  root: string;
  changes: readonly ChangeSummary[];
  loadDetail: (name: string) => Promise<DetailedChange>;
  refreshVersion?: number;
  onFilterEditingChange?: (editing: boolean) => void;
  viewportHeight?: number;
}

export function Changes({
  root,
  changes,
  loadDetail,
  refreshVersion,
  onFilterEditingChange,
  viewportHeight,
}: ChangesProps) {
  return (
    <ReadOnlyBrowser
      title="Changes"
      root={root}
      entries={changes.map((change) => ({
        name: change.name,
        status: change.status,
        schema: change.schema,
      }))}
      archived={false}
      loadChangeDetail={loadDetail}
      refreshVersion={refreshVersion}
      onFilterEditingChange={onFilterEditingChange}
      viewportHeight={viewportHeight}
    />
  );
}

export interface ArchiveProps {
  root: string;
  refreshVersion?: number;
  records: readonly { name: string }[];
  onFilterEditingChange?: (editing: boolean) => void;
  viewportHeight?: number;
}

export function Archive({
  root,
  records,
  refreshVersion,
  onFilterEditingChange,
  viewportHeight,
}: ArchiveProps) {
  return (
    <ReadOnlyBrowser
      title="Archive"
      root={root}
      entries={records.map((record) => ({ name: record.name }))}
      refreshVersion={refreshVersion}
      archived
      onFilterEditingChange={onFilterEditingChange}
      viewportHeight={viewportHeight}
    />
  );
}
