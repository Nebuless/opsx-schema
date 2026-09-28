import type { ReactNode } from "react";
import { noColorEnabled, tuiTextColor } from "./theme.tsx";
import type { TuiTone } from "./theme.tsx";

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
}: {
  title: string;
  state?: string;
  children: ReactNode;
  tone?: TuiTone;
  grow?: boolean;
  height?: number;
}) {
  const noColor = noColorEnabled();
  return (
    <box
      flexDirection="column"
      width="100%"
      minHeight={0}
      height={height}
      flexGrow={grow ? 1 : 0}
      flexShrink={grow ? 1 : 0}
      borderStyle="single"
      borderColor={tuiTextColor(tone, noColor)}
      paddingLeft={1}
      paddingRight={1}
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
      backgroundColor={focused && !noColor ? "#233540" : undefined}
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
