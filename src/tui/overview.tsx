import { useTerminalDimensions } from "@opentui/react";
import type { ChangeSummary, SpecificationCounts } from "../domain/snapshot.ts";
import { planningLabel, projectOverview } from "./model.ts";
import type { ReadState } from "./model.ts";
import { registerNumber, SectionPanel, ViewHeading } from "./presentation.tsx";
import { TaskProgressView } from "./progress.tsx";
import {
  noColorEnabled,
  PendingRead,
  reducedMotionEnabled,
  tuiTextColor,
} from "./theme.tsx";

export interface OverviewProps {
  specifications: ReadState<SpecificationCounts>;
  activeChanges: ReadState<ChangeSummary[]>;
  completedChanges: ReadState<Array<{ name: string }>>;
  reducedMotion?: boolean;
  noColor?: boolean;
  viewportHeight?: number;
}

export function Overview({
  specifications,
  activeChanges,
  completedChanges,
  reducedMotion,
  noColor: noColorOverride,
  viewportHeight,
}: OverviewProps) {
  const model =
    activeChanges.status === "loaded"
      ? projectOverview(activeChanges.value)
      : null;
  const { width, height } = useTerminalDimensions();

  const sections = [specifications, activeChanges, completedChanges];
  const pendingSections = sections.filter(
    (section) => section.status === "pending",
  ).length;
  const failedSections = sections.filter(
    (section) => section.status === "error",
  ).length;
  const overviewReadiness =
    failedSections > 0
      ? "Partial (" +
        failedSections +
        " unavailable" +
        (pendingSections > 0 ? ", " + pendingSections + " still loading" : "") +
        ")"
      : pendingSections > 0
        ? "Loading (" + pendingSections + " sections pending)"
        : "Ready";
  const motionReduced = reducedMotionEnabled(reducedMotion);
  const colorDisabled = noColorEnabled(noColorOverride);
  const progressCells = Math.max(4, Math.min(16, Math.floor((width - 36) / 4)));
  const compactProgress = width < 75;
  const activeSectionState =
    activeChanges.status === "pending"
      ? "Loading"
      : activeChanges.status === "error"
        ? "Unavailable"
        : activeChanges.value.length === 0
          ? "Empty"
          : activeChanges.value.length +
            (activeChanges.value.length === 1 ? " change" : " changes");
  const completedSectionState =
    completedChanges.status === "pending"
      ? "Loading"
      : completedChanges.status === "error"
        ? "Unavailable"
        : completedChanges.value.length === 0
          ? "Empty"
          : completedChanges.value.length === 1
            ? "1 record"
            : completedChanges.value.length + " records";

  const planningComplete = model?.planningComplete ?? 0;
  const planningTotal = model?.planningTotal ?? 0;
  const planningKnown = planningTotal > 0;
  const aggregateTasks = model?.taskProgress ?? null;
  const visibleRows = Math.max(1, (viewportHeight ?? height) - 1);

  return (
    <box flexDirection="column" width="100%" flexGrow={1} minHeight={0} gap={0}>
      <ViewHeading
        title="CHANGE REGISTER / OVERVIEW"
        state={overviewReadiness}
      />
      <scrollbox
        width="100%"
        style={{
          height: visibleRows,
          flexGrow: 0,
          flexBasis: visibleRows,
          minHeight: 0,
        }}
        focused
      >
        <SectionPanel title="REGISTER TOTALS" tone="accent" clipSafe>
          {specifications.status === "pending" ? (
            <PendingRead
              label="Loading specification metrics…"
              noColor={colorDisabled}
              reducedMotion={motionReduced}
            />
          ) : specifications.status === "error" ? (
            <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>
              Specifications / requirements unavailable:{" "}
              {specifications.message}
            </text>
          ) : (
            <text wrapMode="char" fg={tuiTextColor("success", colorDisabled)}>
              Specifications: {specifications.value.specifications} ·
              Requirements: {specifications.value.requirements}
            </text>
          )}
          {activeChanges.status === "pending" ? (
            <PendingRead
              label={
                compactProgress ? "Tasks: Loading…" : "Task progress: Loading…"
              }
              noColor={colorDisabled}
              reducedMotion={motionReduced}
            />
          ) : activeChanges.status === "error" ? (
            <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>
              Task progress unavailable: {activeChanges.message}
            </text>
          ) : (
            <TaskProgressView
              progress={aggregateTasks}
              compact={compactProgress}
              cells={progressCells}
              noColor={colorDisabled}
              reducedMotion={motionReduced}
              transitionKey="overview-total"
            />
          )}
          <text wrapMode="char" fg={tuiTextColor("muted", colorDisabled)}>
            {compactProgress ? "Planning" : "Planning readiness"}:{" "}
            {activeChanges.status === "pending"
              ? "Loading…"
              : activeChanges.status === "error"
                ? "Unavailable"
                : planningKnown
                  ? compactProgress
                    ? planningComplete + "/" + planningTotal + " changes"
                    : planningComplete +
                      "/" +
                      planningTotal +
                      " of changes with planning artifacts"
                  : "Unknown"}
          </text>
        </SectionPanel>
        <box width="100%" height={1} flexShrink={0} />
        <SectionPanel
          title="ACTIVE / WORK IN PROGRESS"
          clipSafe
          state={activeSectionState}
          tone="accent"
        >
          {activeChanges.status === "pending" ? (
            <PendingRead
              label="Loading active changes…"
              noColor={colorDisabled}
              reducedMotion={motionReduced}
            />
          ) : activeChanges.status === "error" ? (
            <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>
              Active changes unavailable: {activeChanges.message}
            </text>
          ) : !model || model.activeChanges.length === 0 ? (
            <text wrapMode="word">No active changes.</text>
          ) : (
            <box flexDirection="column" width="100%" gap={1}>
              {model.activeChanges.map((change, index) => {
                return (
                  <box
                    key={change.name}
                    flexDirection="column"
                    width="100%"
                    flexShrink={0}
                  >
                    <text
                      wrapMode="char"
                      fg={tuiTextColor("accent", colorDisabled)}
                    >
                      {registerNumber(index)} Change: {change.name}
                    </text>
                    <text
                      wrapMode="char"
                      fg={tuiTextColor("muted", colorDisabled)}
                    >
                      Status: {change.status} · Schema: {change.schema}
                    </text>
                    <TaskProgressView
                      progress={change.tasks}
                      compact={compactProgress}
                      cells={progressCells}
                      noColor={colorDisabled}
                      reducedMotion={motionReduced}
                      transitionKey={change.name}
                    />
                    <text
                      wrapMode="char"
                      fg={tuiTextColor("muted", colorDisabled)}
                    >
                      {compactProgress ? "Planning" : "Planning readiness"}:{" "}
                      {change.planning.total === 0
                        ? "Unknown"
                        : compactProgress
                          ? change.planning.ready +
                            "/" +
                            change.planning.total +
                            " artifacts ready"
                          : planningLabel(change.planning)}
                    </text>
                  </box>
                );
              })}
            </box>
          )}
        </SectionPanel>
        <box width="100%" height={1} flexShrink={0} />
        {/* Keep history last in the sole focused scrollbox so End reaches archived records. */}
        <SectionPanel
          title="HISTORY / ARCHIVED RECORDS"
          clipSafe
          state={completedSectionState}
          tone="muted"
        >
          {completedChanges.status === "pending" ? (
            <PendingRead
              label="Loading completed changes…"
              noColor={colorDisabled}
              reducedMotion={motionReduced}
            />
          ) : completedChanges.status === "error" ? (
            <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>
              Completed history unavailable: {completedChanges.message}
            </text>
          ) : completedChanges.value.length === 0 ? (
            <text wrapMode="word">No archived records.</text>
          ) : (
            completedChanges.value.map((record, index) => (
              <text
                key={record.name}
                wrapMode="char"
                fg={tuiTextColor("muted", colorDisabled)}
              >
                {registerNumber(index)} Historical · {record.name}
              </text>
            ))
          )}
        </SectionPanel>
      </scrollbox>
    </box>
  );
}
