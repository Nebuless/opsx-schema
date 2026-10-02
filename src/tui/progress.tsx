import { useEffect, useRef, useState } from "react";
import { useTimeline } from "@opentui/react";
import type { TaskProgress } from "./model.ts";
import {
  noColorEnabled,
  reducedMotionEnabled,
  tuiTextColor,
} from "./theme.tsx";

export interface TaskProgressViewProps {
  progress: TaskProgress | null;
  historical?: boolean;
  cells?: number;
  compact?: boolean;
  noColor?: boolean;
  reducedMotion?: boolean;
  /** Record identity, not a refresh counter. Changing it prevents cross-record interpolation. */
  transitionKey?: string;
}

function progressBar(ratio: number, cells: number, complete: boolean): string {
  const filled = Math.max(
    0,
    Math.min(complete ? cells : cells - 1, Math.floor(ratio * cells)),
  );
  return `[${"=".repeat(filled)}${"-".repeat(cells - filled)}]`;
}

function AnimatedTaskTrack({
  from,
  to,
  cells,
  complete,
}: {
  from: number;
  to: number;
  cells: number;
  complete: boolean;
}) {
  const [ratio, setRatio] = useState(from);
  const initial = useRef(from);
  const timeline = useTimeline({ duration: 260, autoplay: false });

  useEffect(() => {
    const start = initial.current;
    if (start === to) {
      setRatio(to);
      return;
    }
    const target = { value: start };
    timeline.add(target, {
      value: to,
      duration: 260,
      ease: "outQuad",
      onUpdate: ({ targets }) => setRatio(targets[0]!.value),
    });
    timeline.play();
    return () => {
      timeline.pause();
    };
  }, [timeline, to]);

  // Clamp every frame to current completion, including the first render after a regression.
  return <span>{progressBar(ratio, cells, complete)}</span>;
}

export function TaskProgressView({
  progress,
  historical = false,
  cells = 16,
  compact = false,
  noColor,
  reducedMotion,
  transitionKey = "",
}: TaskProgressViewProps) {
  const colorDisabled = noColorEnabled(noColor);
  const animate =
    !historical && !colorDisabled && !reducedMotionEnabled(reducedMotion);
  const ratio =
    progress && progress.total > 0 ? progress.checked / progress.total : null;
  const previous = useRef({ transitionKey, ratio });
  const from =
    previous.current.transitionKey === transitionKey
      ? (previous.current.ratio ?? ratio)
      : ratio;
  useEffect(() => {
    previous.current = { transitionKey, ratio };
  }, [ratio, transitionKey]);

  const label = historical
    ? "Historical tasks"
    : compact
      ? "Tasks"
      : "Task progress";
  const complete =
    progress !== null &&
    progress.total > 0 &&
    progress.checked === progress.total;
  const trackCells = Math.max(1, Math.min(16, Math.floor(cells)));
  const description = !progress
    ? "Unknown"
    : progress.total === 0
      ? "0/0 · No checklist tasks"
      : `${progress.checked}/${progress.total}${compact || historical ? "" : " implementation tasks checked"} · ${progress.remaining} remaining`;

  return (
    <text
      selectable={false}
      wrapMode="char"
      fg={tuiTextColor(
        historical || ratio === null
          ? "muted"
          : complete
            ? "success"
            : "accent",
        colorDisabled,
      )}
    >
      {label}: {description}
      {ratio === null ? null : (
        <>
          {" "}
          {animate && from !== null ? (
            <AnimatedTaskTrack
              key={
                transitionKey + ":" + progress!.checked + "/" + progress!.total
              }
              from={from}
              to={ratio}
              cells={trackCells}
              complete={complete}
            />
          ) : (
            <span>{progressBar(ratio, trackCells, complete)}</span>
          )}
        </>
      )}
    </text>
  );
}
