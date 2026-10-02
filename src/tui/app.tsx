import { useCallback, useEffect, useRef, useState } from "react";
import { CliRenderEvents, createCliRenderer, engine } from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { OpenSpecClient } from "../openspec/client.ts";
import {
  archivedNames,
  changes,
  detailedChange,
  specificationCounts,
} from "../domain/snapshot.ts";
import type {
  ChangeSummary,
  ProjectSnapshot,
  SpecificationCounts,
} from "../domain/snapshot.ts";
import { defaultSchema } from "../domain/project.ts";
import { schemas } from "../catalog/schemas.ts";
import { watchProject } from "../domain/watch.ts";
import { Overview } from "./overview.tsx";
import { Archive, Changes } from "./browser.tsx";
import { Settings } from "./settings.tsx";
import { readErrorMessage } from "./model.ts";
import type { ReadState } from "./model.ts";
import {
  noColorEnabled,
  PendingRead,
  reducedMotionEnabled,
  TUI_SURFACES,
  tuiTextColor,
} from "./theme.tsx";
import { ActionHint } from "./presentation.tsx";

const TABS = ["Overview", "Changes", "Archive", "Settings"] as const;
const MODE_ACTIONS = [
  "↑/↓ j/k scroll · PgUp/PgDn page · Home/End",
  "↑/↓ j/k navigate or scroll · View-specific actions above",
  "↑/↓ j/k navigate or scroll · View-specific actions above",
  "↑/↓ j/k select or scroll · See Settings actions above",
] as const;
const NARROW_ACTIONS = [
  "j/k scroll · PgUp/PgDn · Home/End",
  "j/k navigate/scroll · View actions above",
  "j/k navigate/scroll · View actions above",
  "j/k select/scroll · Settings actions above",
] as const;
type SettingsSnapshot = Pick<ProjectSnapshot, "defaultSchema" | "schemas"> & {
  changes: ChangeSummary[];
};

function Dashboard({ root, onQuit }: { root: string; onQuit: () => void }) {
  const renderer = useRenderer();
  const { width: terminalWidth, height: terminalHeight } =
    useTerminalDimensions();
  const [tab, setTab] = useState(0);
  const [help, setHelp] = useState(false);
  const [filterEditing, setFilterEditing] = useState(false);
  const [error, setError] = useState("");
  const [coreStatus, setCoreStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [specifications, setSpecifications] = useState<
    ReadState<SpecificationCounts>
  >({ status: "pending" });
  const [activeChanges, setActiveChanges] = useState<
    ReadState<ChangeSummary[]>
  >({ status: "pending" });
  const [completedChanges, setCompletedChanges] = useState<
    ReadState<Array<{ name: string }>>
  >({ status: "pending" });
  const [settingsSnapshot, setSettingsSnapshot] = useState<
    ReadState<SettingsSnapshot>
  >({ status: "pending" });
  const noColor = noColorEnabled();
  const reducedMotion = reducedMotionEnabled();
  const tabRef = useRef(tab);
  const clientRef = useRef<OpenSpecClient | null>(null);
  const reload = useRef<(index?: number) => void>(() => {});

  useEffect(() => {
    let active = true;
    let running = false;
    let pending = false;
    let watchReady = false;
    let readinessError: string | null = null;
    let requestedTab = 0;
    const client = new OpenSpecClient(root);
    clientRef.current = client;
    setCoreStatus("loading");
    async function readSection<T>(
      promise: Promise<T>,
      setState: (state: ReadState<T>) => void,
    ): Promise<void> {
      try {
        const value = await promise;
        if (active) {
          setState({ status: "loaded", value });
        }
      } catch (failure) {
        if (active) {
          setState({ status: "error", message: readErrorMessage(failure) });
        }
      }
    }
    function failTab(index: number, message: string) {
      const failed = { status: "error" as const, message };
      if (index === 0) {
        setSpecifications(failed);
        setActiveChanges(failed);
        setCompletedChanges(failed);
      } else if (index === 1) {
        setActiveChanges(failed);
      } else if (index === 2) {
        setCompletedChanges(failed);
      } else {
        setSettingsSnapshot(failed);
      }
    }
    async function loadTab(index: number): Promise<void> {
      if (index === 0) {
        setSpecifications((current) =>
          current.status === "loaded" ? current : { status: "pending" },
        );
        setActiveChanges((current) =>
          current.status === "loaded" ? current : { status: "pending" },
        );
        setCompletedChanges((current) =>
          current.status === "loaded" ? current : { status: "pending" },
        );
        await Promise.all([
          readSection(specificationCounts(root), setSpecifications),
          readSection(changes(client), setActiveChanges),
          readSection(archivedNames(root), setCompletedChanges),
        ]);
        return;
      }
      if (index === 1) {
        setActiveChanges((current) =>
          current.status === "loaded" ? current : { status: "pending" },
        );
        await readSection(changes(client), setActiveChanges);
        return;
      }
      if (index === 2) {
        setCompletedChanges((current) =>
          current.status === "loaded" ? current : { status: "pending" },
        );
        await readSection(archivedNames(root), setCompletedChanges);
        return;
      }
      setSettingsSnapshot((current) =>
        current.status === "loaded" ? current : { status: "pending" },
      );
      try {
        const [selectedSchema, schemaCatalog, loadedChanges] =
          await Promise.all([
            defaultSchema(root),
            schemas(client),
            changes(client),
          ]);
        if (active) {
          setSettingsSnapshot({
            status: "loaded",
            value: {
              defaultSchema: selectedSchema,
              schemas: schemaCatalog,
              changes: loadedChanges,
            },
          });
        }
      } catch (failure) {
        if (active) {
          setSettingsSnapshot({
            status: "error",
            message: readErrorMessage(failure),
          });
        }
      }
    }
    async function refresh(index = tabRef.current): Promise<void> {
      requestedTab = index;
      pending = true;
      if (!active || running) {
        return;
      }
      if (readinessError) {
        pending = false;
        failTab(index, readinessError);
        return;
      }
      if (!watchReady) {
        return;
      }
      running = true;
      do {
        pending = false;
        try {
          await loadTab(requestedTab);
        } catch (failure) {
          if (active) {
            failTab(requestedTab, readErrorMessage(failure));
          }
        }
      } while (active && pending);
      running = false;
    }
    reload.current = (index = tabRef.current) => {
      void refresh(index);
    };
    const subscription = watchProject(
      root,
      () => {
        setRefreshVersion((version) => version + 1);
        void refresh(tabRef.current);
      },
      (failure) => {
        if (active) {
          setError(readErrorMessage(failure));
        }
      },
    );
    void subscription.ready
      .then(() => {
        if (!active) {
          return;
        }
        watchReady = true;
        setError("");
        setCoreStatus("ready");
        void refresh(tabRef.current);
      })
      .catch((failure) => {
        if (!active) {
          return;
        }
        readinessError = readErrorMessage(failure);
        setCoreStatus("error");
        setError("Project watch failed: " + readinessError);
        failTab(tabRef.current, readinessError);
      });
    return () => {
      active = false;
      subscription.close();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      reload.current = () => {};
    };
  }, [root]);

  const onRefresh = useCallback(() => reload.current(tabRef.current), []);
  const selectTab = (index: number) => {
    setFilterEditing(false);
    tabRef.current = index;
    setTab(index);
    reload.current(index);
  };
  const loadChangeDetail = useCallback(
    (name: string) => {
      const client = clientRef.current;
      return client
        ? detailedChange(root, client, name)
        : Promise.reject(new Error("OpenSpec project reader is not ready."));
    },
    [root],
  );
  useKeyboard((event) => {
    if (event.name === "tab") {
      selectTab((tab + (event.shift ? TABS.length - 1 : 1)) % TABS.length);
      return;
    }
    // Browser filters and focused editors own ordinary text, including digits and '?'.
    if (filterEditing || renderer.currentFocusedEditor !== null) {
      return;
    }
    if (event.name === "q" && tab !== 3) {
      onQuit();
      return;
    }
    if (event.name === "?") {
      setHelp((value) => !value);
      return;
    }
    const number = Number(event.name);
    if (Number.isInteger(number) && number >= 1 && number <= TABS.length) {
      selectTab(number - 1);
    }
  });
  const focusLabel = filterEditing
    ? `${TABS[tab]} filter input`
    : renderer.currentFocusedEditor !== null
      ? `${TABS[tab]} text input`
      : tab === 0
        ? "Overview content"
        : `${TABS[tab]} tab`;
  const editing = filterEditing || renderer.currentFocusedEditor !== null;
  const globalActions =
    terminalWidth < 75
      ? editing
        ? "Tab views · typing in filter"
        : "Tab views · 1-4 · ? help"
      : editing
        ? "Tab/Shift+Tab views · 1-4/?/q stay in input"
        : `Tab/Shift+Tab views · 1-4 select · ? help · ${tab === 3 ? "Ctrl+C quit" : "q quit"}`;

  const narrow = terminalWidth < 75;
  const projectName = root.split(/[\\/]/).filter(Boolean).at(-1) ?? root;
  const projectLabel = narrow ? projectName : root;
  const actionLabel =
    terminalWidth < 75 ? NARROW_ACTIONS[tab] : MODE_ACTIONS[tab];
  const contentHeight = Math.max(
    1,
    terminalHeight - (narrow ? 7 : 8) - Number(help) - Number(Boolean(error)),
  );
  const fitLine = (value: string, limit = terminalWidth - 8) =>
    value.length > limit ? value.slice(0, Math.max(0, limit - 1)) + "…" : value;
  const coreLabel =
    coreStatus === "loading"
      ? "LOADING"
      : coreStatus === "ready"
        ? "READY"
        : "ERROR";

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={noColor ? undefined : TUI_SURFACES.ground}
    >
      <box
        flexDirection="column"
        width="100%"
        flexShrink={0}
        borderStyle="single"
        borderColor={tuiTextColor("border", noColor)}
        backgroundColor={noColor ? undefined : TUI_SURFACES.header}
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text
            fg={tuiTextColor("accent", noColor)}
            content={fitLine(
              `OPSX  /  ${projectLabel}`,
              terminalWidth - (narrow ? 15 : 20),
            )}
          />
          <text
            fg={tuiTextColor(
              coreStatus === "ready"
                ? "success"
                : coreStatus === "loading"
                  ? "pending"
                  : "error",
              noColor,
            )}
            content={` ${coreLabel} `}
          />
        </box>
        <box flexDirection="row" flexShrink={0} gap={1}>
          {TABS.map((name, index) => (
            <box
              key={name}
              backgroundColor={
                !noColor && index === tab ? TUI_SURFACES.selected : undefined
              }
              paddingLeft={1}
              paddingRight={1}
            >
              <text
                content={
                  index === tab
                    ? `[${index + 1} ${name}]`
                    : `${index + 1} ${name}`
                }
                fg={tuiTextColor(index === tab ? "accent" : "muted", noColor)}
              />
            </box>
          ))}
        </box>
      </box>
      {help && (
        <ActionHint>
          {fitLine(
            "Help: Tab cycles · 1-4 select · ? closes · Esc backs out of the active view",
          )}
        </ActionHint>
      )}
      {error && (
        <text
          content={fitLine("Project watcher: " + error)}
          fg={tuiTextColor("error", noColor)}
        />
      )}
      <box
        flexDirection="column"
        height={contentHeight}
        flexGrow={1}
        minHeight={0}
      >
        {tab === 0 && (
          <Overview
            specifications={specifications}
            activeChanges={activeChanges}
            completedChanges={completedChanges}
            viewportHeight={contentHeight}
          />
        )}
        {tab === 1 &&
          (activeChanges.status === "pending" ? (
            <PendingRead
              label="Loading active changes..."
              noColor={noColor}
              reducedMotion={reducedMotion}
            />
          ) : activeChanges.status === "error" ? (
            <text content={`Active changes failed: ${activeChanges.message}`} />
          ) : (
            <Changes
              root={root}
              changes={activeChanges.value}
              loadDetail={loadChangeDetail}
              refreshVersion={refreshVersion}
              onFilterEditingChange={setFilterEditing}
              viewportHeight={contentHeight}
            />
          ))}
        {tab === 2 &&
          (completedChanges.status === "pending" ? (
            <PendingRead
              label="Loading archived names..."
              noColor={noColor}
              reducedMotion={reducedMotion}
            />
          ) : completedChanges.status === "error" ? (
            <text
              content={`Archive index failed: ${completedChanges.message}`}
            />
          ) : (
            <Archive
              root={root}
              records={completedChanges.value}
              refreshVersion={refreshVersion}
              onFilterEditingChange={setFilterEditing}
              viewportHeight={contentHeight}
            />
          ))}
        {tab === 3 &&
          (settingsSnapshot.status === "pending" ? (
            <PendingRead
              label="Loading Settings data..."
              noColor={noColor}
              reducedMotion={reducedMotion}
            />
          ) : settingsSnapshot.status === "error" ? (
            <text
              content={`Settings read failed: ${settingsSnapshot.message}`}
            />
          ) : (
            <Settings
              root={root}
              snapshot={settingsSnapshot.value}
              onRefresh={onRefresh}
              active={tab === 3}
            />
          ))}
      </box>
      <box
        flexDirection="column"
        width="100%"
        flexShrink={0}
        borderStyle="single"
        borderColor={tuiTextColor("border", noColor)}
        backgroundColor={noColor ? undefined : TUI_SURFACES.header}
        paddingLeft={1}
        paddingRight={1}
      >
        <ActionHint>
          {fitLine(
            narrow
              ? `${globalActions} · ${focusLabel}`
              : `FOCUS  ${focusLabel}   /   ${globalActions}`,
          )}
        </ActionHint>
        {!narrow && (
          <ActionHint>{fitLine(`ACTIONS  ${actionLabel}`)}</ActionHint>
        )}
      </box>
    </box>
  );
}

/** One renderer owns the entire session; views never create a competing root. */
export async function startDashboard(root: string): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  try {
    engine.attach(renderer);
    const reactRoot = createRoot(renderer);
    await new Promise<void>((resolve) => {
      renderer.once(CliRenderEvents.DESTROY, resolve);
      reactRoot.render(
        <Dashboard root={root} onQuit={() => renderer.destroy()} />,
      );
    });
  } finally {
    engine.detach();
    renderer.destroy();
  }
}
