import type { ReactNode } from "react";
import { parseColor } from "@opentui/core";
import { paintPanel } from "./panel-paint.ts";
import { noColorEnabled, TUI_SURFACES, tuiTextColor } from "./theme.tsx";
import type { TuiTone } from "./theme.tsx";

// Match the installed BoxRenderable default when NO_COLOR removes the tone.
const NATIVE_DEFAULT_BORDER_COLOR = "#FFFFFF";

export function registerNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** Passive regions: navigation, scroll position and write authority stay in the owning view. */
export function ViewHeading({
  title,
  context,
  state,
}: {
  title: string;
  context?: string;
  state?: string;
}) {
  const noColor = noColorEnabled();
  return (
    <box
      flexDirection="row"
      width="100%"
      flexShrink={0}
      justifyContent="space-between"
      backgroundColor={noColor ? undefined : TUI_SURFACES.header}
      paddingLeft={1}
      paddingRight={1}
    >
      <text wrapMode="word" fg={tuiTextColor("accent", noColor)}>
        {title}
        {context ? `  /  ${context}` : ""}
      </text>
      {state && (
        <text wrapMode="word" fg={tuiTextColor("pending", noColor)}>
          {" "}
          {state}{" "}
        </text>
      )}
    </box>
  );
}

export function SectionHeading({
  title,
  state,
}: {
  title: string;
  state?: string;
}) {
  return (
    <text
      flexShrink={0}
      wrapMode="word"
      fg={tuiTextColor("accent", noColorEnabled())}
    >
      {" "}
      {title}
      {state ? ` · ${state}` : ""}
    </text>
  );
}

/** A bounded, passive region. The caller owns its scroll viewport and the data it displays. */
export function SectionPanel({
  title,
  state,
  children,
  tone = "border",
  grow = false,
  height,
  clipSafe = false,
}: {
  title: string;
  state?: string;
  children: ReactNode;
  tone?: TuiTone;
  grow?: boolean;
  height?: number;
  /** Opt in only for panels whose native borders can cross a scroll viewport. */
  clipSafe?: boolean;
}) {
  const noColor = noColorEnabled();
  const background = noColor
    ? undefined
    : tone === "muted"
      ? TUI_SURFACES.history
      : TUI_SURFACES.active;
  const border = tuiTextColor(tone, noColor);
  return (
    <box
      flexDirection="column"
      width="100%"
      minHeight={0}
      height={height}
      flexGrow={grow ? 1 : 0}
      flexShrink={grow ? 1 : 0}
      borderStyle={clipSafe ? undefined : "single"}
      borderColor={clipSafe ? undefined : border}
      backgroundColor={clipSafe ? undefined : background}
      paddingLeft={clipSafe ? 2 : 1}
      paddingRight={clipSafe ? 2 : 1}
      paddingTop={clipSafe ? 1 : undefined}
      paddingBottom={clipSafe ? 1 : undefined}
      renderAfter={
        clipSafe
          ? function (buffer) {
              paintPanel(
                buffer,
                {
                  x: this.screenX,
                  y: this.screenY,
                  width: this.width,
                  height: this.height,
                },
                parseColor(border ?? NATIVE_DEFAULT_BORDER_COLOR),
                background ? parseColor(background) : undefined,
              );
            }
          : undefined
      }
    >
      <text
        flexShrink={0}
        wrapMode="word"
        fg={tuiTextColor(tone === "border" ? "accent" : tone, noColor)}
      >
        {title}
        {state ? `  /  ${state}` : ""}
      </text>
      {children}
    </box>
  );
}

export function SelectableRow({
  id,
  label,
  focused,
  selected,
}: {
  id?: string;
  label: string;
  focused: boolean;
  selected?: boolean;
}) {
  const noColor = noColorEnabled();
  return (
    <box
      id={id}
      width="100%"
      flexShrink={0}
      paddingRight={2}
      backgroundColor={focused && !noColor ? TUI_SURFACES.selected : undefined}
    >
      <text
        width="100%"
        wrapMode="char"
        fg={tuiTextColor(
          focused ? "pending" : selected ? "success" : "muted",
          noColor,
        )}
        content={`${focused ? "▸" : " "} ${selected === undefined ? "" : selected ? "[x] " : "[ ] "}${label}`}
      />
    </box>
  );
}

export function ReviewPanel({
  title,
  state,
  tone = "accent",
  children,
}: {
  title: string;
  state: string;
  tone?: TuiTone;
  children: ReactNode;
}) {
  const noColor = noColorEnabled();
  return (
    <box
      flexDirection="column"
      width="100%"
      flexBasis={0}
      flexGrow={1}
      minHeight={0}
      borderStyle="single"
      borderColor={tuiTextColor(tone, noColor)}
      backgroundColor={noColor ? undefined : TUI_SURFACES.active}
      paddingLeft={1}
      paddingRight={1}
    >
      <text flexShrink={0} wrapMode="word" fg={tuiTextColor(tone, noColor)}>
        {title} / {state}
      </text>
      {children}
    </box>
  );
}

export function ActionHint({ children }: { children: string }) {
  return (
    <text
      flexShrink={0}
      wrapMode="word"
      fg={tuiTextColor("muted", noColorEnabled())}
    >
      › {children}
    </text>
  );
}
