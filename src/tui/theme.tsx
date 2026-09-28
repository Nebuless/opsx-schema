import { useEffect, useState } from "react";
import { useTimeline } from "@opentui/react";

export const TUI_COLORS = {
  accent: "#67d7e8",
  pending: "#eab676",
  success: "#84cca2",
  error: "#f08080",
  muted: "#8090a0",
  border: "#435664",
} as const;

export type TuiTone = keyof typeof TUI_COLORS;

export function noColorEnabled(override?: boolean): boolean {
  return override ?? process.env.NO_COLOR !== undefined;
}

export function reducedMotionEnabled(override?: boolean): boolean {
  if (override !== undefined) return override;
  return ["1", "true", "yes"].includes(
    (process.env.REDUCED_MOTION ?? "").toLowerCase(),
  );
}

export function tuiTextColor(
  tone: TuiTone,
  noColor = noColorEnabled(),
): string | undefined {
  return noColor ? undefined : TUI_COLORS[tone];
}

const ACTIVITY_FRAMES = ["|", "/", "-", "\\"] as const;

/** A pending read indicator that pauses its timeline when the read settles or its view unmounts. */
export function PendingRead({
  label,
  noColor,
  reducedMotion,
  tone = "pending",
}: {
  label: string;
  noColor?: boolean;
  reducedMotion?: boolean;
  tone?: TuiTone;
}) {
  const colorDisabled = noColorEnabled(noColor);
  const animate = !colorDisabled && !reducedMotionEnabled(reducedMotion);
  const [frame, setFrame] = useState(0);
  const timeline = useTimeline({ autoplay: false });

  useEffect(() => {
    if (!animate) return;
    let lastFrame = -1;
    const phase = { value: 0 };
    timeline.add(phase, {
      value: ACTIVITY_FRAMES.length,
      duration: 800,
      ease: "linear",
      loop: true,
      onUpdate: ({ targets }) => {
        const nextFrame =
          Math.floor(targets[0]!.value) % ACTIVITY_FRAMES.length;
        if (nextFrame !== lastFrame) {
          lastFrame = nextFrame;
          setFrame(nextFrame);
        }
      },
    });
    timeline.play();
    return () => {
      timeline.pause();
    };
  }, [animate, timeline]);

  return (
    <text selectable={false} fg={tuiTextColor(tone, colorDisabled)}>
      {animate ? `[${ACTIVITY_FRAMES[frame]}]` : "[loading]"} {label}
    </text>
  );
}
