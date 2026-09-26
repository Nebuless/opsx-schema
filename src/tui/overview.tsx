import { useEffect, useRef, useState } from "react";
import { useTerminalDimensions, useTimeline } from "@opentui/react";
import type { ChangeSummary, SpecificationCounts } from "../domain/snapshot.ts";
import { planningLabel, projectOverview, taskLabel } from "./model.ts";
import type { ReadState } from "./model.ts";
import { SectionPanel, ViewHeading } from "./presentation.tsx";
import { noColorEnabled, PendingRead, reducedMotionEnabled, tuiTextColor } from "./theme.tsx";

export interface OverviewProps {
  specifications: ReadState<SpecificationCounts>;
  activeChanges: ReadState<ChangeSummary[]>;
  completedChanges: ReadState<Array<{ name: string }>>;
  reducedMotion?: boolean;
  noColor?: boolean;
  viewportHeight?: number;
}

function progressBar(ratio: number, cells: number): string {
  const filled = Math.max(0, Math.min(cells, Math.round(ratio * cells)));
  return `[${"=".repeat(filled)}${"-".repeat(cells - filled)}]`;
}

function AnimatedProgress({ label, value: labelValue, from, to, cells, noColor }: { label: string; value: string; from: number; to: number; cells: number; noColor: boolean }) {
  const [value, setValue] = useState(from);
  const initial = useRef(from);
  const timeline = useTimeline({ duration: 260, autoplay: false });

  useEffect(() => {
    const start = initial.current;
    if (start === to || progressBar(start, cells) === progressBar(to, cells)) {
      setValue(to);
      return;
    }
    const target = { value: start };
    timeline.add(target, {
      value: to,
      duration: 260,
      ease: "outQuad",
      onUpdate: ({ targets }) => setValue(targets[0].value),
    });
    timeline.play();
    return () => { timeline.pause(); };
  }, [cells, timeline, to]);

  return <text selectable={false} wrapMode="char" fg={tuiTextColor(to === 1 ? "success" : "accent", noColor)}>{label}: {labelValue} {progressBar(value, cells)}</text>;
}

function ProgressLine({
  label,
  value,
  ratio,
  transitionKey,
  animate,
  cells,
  noColor,
}: {
  label: string;
  value: string;
  ratio: number | null;
  transitionKey: string;
  animate: boolean;
  cells: number;
  noColor: boolean;
}) {
  const previous = useRef({ transitionKey, ratio });
  const start = previous.current.transitionKey === transitionKey
    ? ratio ?? 0
    : previous.current.ratio ?? ratio ?? 0;

  useEffect(() => {
    previous.current = { transitionKey, ratio };
  }, [ratio, transitionKey]);

  if (ratio !== null && animate) {
    return <AnimatedProgress key={transitionKey} label={label} value={value} from={start} to={ratio} cells={cells} noColor={noColor} />;
  }
  return <text selectable={false} wrapMode="char" fg={tuiTextColor(ratio === 1 ? "success" : ratio === null ? "muted" : "accent", noColor)}>{label}: {value}{ratio === null ? "" : " " + progressBar(ratio, cells)}</text>;
}

export function Overview({ specifications, activeChanges, completedChanges, reducedMotion, noColor: noColorOverride, viewportHeight }: OverviewProps) {
  const model = activeChanges.status === "loaded" ? projectOverview(activeChanges.value) : null;
  const { width, height } = useTerminalDimensions();

  const sections = [specifications, activeChanges, completedChanges];
  const pendingSections = sections.filter(section => section.status === "pending").length;
  const failedSections = sections.filter(section => section.status === "error").length;
  const overviewReadiness = failedSections > 0
    ? "Partial (" + failedSections + " unavailable" + (pendingSections > 0 ? ", " + pendingSections + " still loading" : "") + ")"
    : pendingSections > 0
      ? "Loading (" + pendingSections + " sections pending)"
      : "Ready";
  const motionReduced = reducedMotionEnabled(reducedMotion);
  const colorDisabled = noColorEnabled(noColorOverride);
  const animate = !motionReduced && !colorDisabled;
  const progressCells = Math.max(4, Math.min(16, Math.floor((width - 36) / 4)));
  const compactProgress = width < 75;
  const activeSectionState = activeChanges.status === "pending"
    ? "Loading"
    : activeChanges.status === "error"
      ? "Unavailable"
      : activeChanges.value.length === 0
        ? "Empty"
        : activeChanges.value.length + (activeChanges.value.length === 1 ? " change" : " changes");
  const completedSectionState = completedChanges.status === "pending"
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
  const aggregateTasks = model?.taskProgress && model.taskProgress.total > 0 ? model.taskProgress : null;
  const visibleRows = Math.max(1, (viewportHeight ?? height) - 1);

  return (
    <box flexDirection="column" width="100%" flexGrow={1} minHeight={0} gap={0}>
      <ViewHeading title="Overview" state={overviewReadiness} />
      <scrollbox width="100%" style={{ height: visibleRows, flexGrow: 0, flexBasis: visibleRows, minHeight: 0 }} focused>
        <SectionPanel title="Summary" tone="accent">
          {specifications.status === "pending"
            ? <PendingRead label="Loading specification metrics…" noColor={colorDisabled} reducedMotion={motionReduced} />
            : specifications.status === "error"
              ? <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>Specifications / requirements unavailable: {specifications.message}</text>
              : <text wrapMode="char" fg={tuiTextColor("success", colorDisabled)}>Specifications: {specifications.value.specifications}  ·  Requirements: {specifications.value.requirements}</text>}
          <ProgressLine
            label={compactProgress ? "Planning" : "Planning readiness"}
            value={planningKnown
              ? compactProgress
                ? planningComplete + "/" + planningTotal + " changes"
                : planningComplete + "/" + planningTotal + " of changes with planning artifacts"
              : "Unknown"}
            ratio={planningKnown ? planningComplete / planningTotal : null}
            transitionKey={planningKnown ? "planning:" + planningComplete + "/" + planningTotal : "planning:unknown"}
            animate={animate && planningKnown}
            cells={progressCells}
            noColor={colorDisabled}
          />
          <ProgressLine
            label={compactProgress ? "Tasks" : "Task progress"}
            value={aggregateTasks
              ? compactProgress
                ? aggregateTasks.checked + "/" + aggregateTasks.total
                : taskLabel(aggregateTasks)
              : "Unknown"}
            ratio={aggregateTasks ? aggregateTasks.checked / aggregateTasks.total : null}
            transitionKey={aggregateTasks ? "tasks:" + aggregateTasks.checked + "/" + aggregateTasks.total : "tasks:unknown"}
            animate={animate && aggregateTasks !== null}
            cells={progressCells}
            noColor={colorDisabled}
          />
        </SectionPanel>
        <box width="100%" height={1} flexShrink={0} />
        <SectionPanel title="Active changes" state={activeSectionState} tone="accent">
          {activeChanges.status === "pending"
            ? <PendingRead label="Loading active changes…" noColor={colorDisabled} reducedMotion={motionReduced} />
            : activeChanges.status === "error"
              ? <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>Active changes unavailable: {activeChanges.message}</text>
              : !model || model.activeChanges.length === 0
                ? <text wrapMode="word">No active changes.</text>
                : <box flexDirection="column" width="100%" gap={1}>
                  {model.activeChanges.map(change => {
                    const taskProgress = change.tasks && change.tasks.total > 0 ? change.tasks : null;
                    return <box key={change.name} flexDirection="column" width="100%" flexShrink={0}>
                      <text wrapMode="char" fg={tuiTextColor("accent", colorDisabled)}>Change: {change.name}</text>
                      <text wrapMode="char" fg={tuiTextColor("muted", colorDisabled)}>Status: {change.status}  ·  Schema: {change.schema}</text>
                      <ProgressLine
                        label={compactProgress ? "Planning" : "Planning readiness"}
                        value={change.planning.total === 0
                          ? "Unknown"
                          : compactProgress
                            ? change.planning.ready + "/" + change.planning.total + " artifacts ready"
                            : planningLabel(change.planning)}
                        ratio={change.planning.total === 0 ? null : change.planning.ready / change.planning.total}
                        transitionKey={"artifacts:" + change.planning.ready + "/" + change.planning.total}
                        animate={animate && change.planning.total > 0}
                        cells={progressCells}
                        noColor={colorDisabled}
                      />
                      <ProgressLine
                        label={compactProgress ? "Tasks" : "Task progress"}
                        value={taskProgress
                          ? compactProgress
                            ? taskProgress.checked + "/" + taskProgress.total
                            : taskLabel(taskProgress)
                          : "Unknown"}
                        ratio={taskProgress ? taskProgress.checked / taskProgress.total : null}
                        transitionKey={taskProgress ? "tasks:" + taskProgress.checked + "/" + taskProgress.total : "tasks:unknown"}
                        animate={animate && taskProgress !== null}
                        cells={progressCells}
                        noColor={colorDisabled}
                      />
                    </box>;
                  })}
                </box>}
        </SectionPanel>
        <box width="100%" height={1} flexShrink={0} />
        {/* Keep history last in the sole focused scrollbox so End reaches archived records. */}
        <SectionPanel title="Completed history" state={completedSectionState} tone="muted">
          {completedChanges.status === "pending"
            ? <PendingRead label="Loading completed changes…" noColor={colorDisabled} reducedMotion={motionReduced} />
            : completedChanges.status === "error"
              ? <text wrapMode="char" fg={tuiTextColor("error", colorDisabled)}>Completed history unavailable: {completedChanges.message}</text>
              : completedChanges.value.length === 0
                ? <text wrapMode="word">No archived records.</text>
                : completedChanges.value.map(record => <text key={record.name} wrapMode="char" fg={tuiTextColor("muted", colorDisabled)}>Historical · {record.name}</text>)}
        </SectionPanel>
      </scrollbox>
    </box>
  );
}
