import {
  type BaseRenderable,
  CodeRenderable,
  type MarkdownOptions,
  StyledText,
  SyntaxStyle,
  type TextChunk,
  TextRenderable,
  TextTableRenderable,
} from "@opentui/core";
import { Component, type ReactNode, useEffect, useMemo } from "react";
import { noColorEnabled, TUI_COLORS, tuiTextColor } from "./theme.tsx";

function passiveChunks(chunks: TextChunk[]): TextChunk[] {
  return chunks.map(({ link: _link, ...chunk }) => chunk);
}

/** Native parsing/layout only. No clickable links or language-selected code grammars. */
const passiveNode: MarkdownOptions["renderNode"] = (token, context) => {
  const block = context.defaultRender();
  if (!block) {
    return null;
  }
  const makePassive = (node: BaseRenderable): void => {
    if (node instanceof CodeRenderable) {
      node.initialStyledText = undefined;
      node.onHighlight = undefined;
      node.onChunks = passiveChunks;
      node.conceal = true;
      node.wrapMode = "char";
      if (token.type === "code") {
        node.filetype = undefined;
      }
    }
    if (node instanceof TextTableRenderable) {
      node.content = node.content.map((row) =>
        row.map((cell) => (cell ? passiveChunks(cell) : cell)),
      );
    }
    for (const child of node.getChildren()) {
      makePassive(child);
    }
  };
  makePassive(block);
  if (token.type === "list") {
    const restoreTasks = (
      listToken: typeof token,
      listNode: BaseRenderable,
    ): void => {
      for (const [index, item] of listToken.items.entries()) {
        const row = listNode.getChildren()[index];
        if (!row) {
          throw new Error("Native list row is unavailable.");
        }
        const marker = row.getChildren()[0];
        if (item.task) {
          if (!(marker instanceof TextRenderable)) {
            throw new Error("Native task marker is unavailable.");
          }
          marker.content = new StyledText([
            ...marker.chunks,
            {
              __isChunk: true,
              text: item.checked ? "[x] " : "[ ] ",
            },
          ]);
          marker.width = Number(marker.width) + 4;
        }
        const contentNode = row.getChildren()[1];
        const childTokens = item.tokens.filter(
          (child: Parameters<NonNullable<MarkdownOptions["renderNode"]>>[0]) =>
            child.type !== "checkbox" && child.type !== "space",
        );
        for (const [childIndex, childToken] of childTokens.entries()) {
          if (childToken.type === "list") {
            const childNode = contentNode?.getChildren()[childIndex];
            if (!childNode) {
              throw new Error("Native nested list is unavailable.");
            }
            restoreTasks(childToken, childNode);
          }
        }
      }
    };
    restoreTasks(token, block);
  }
  return block;
};

class DocumentBoundary extends Component<
  { children: ReactNode },
  { limited: boolean }
> {
  state = { limited: false };
  static getDerivedStateFromError() {
    return { limited: true };
  }
  render() {
    if (this.state.limited) {
      return (
        <text wrapMode="word">
          Document rendering unavailable. Press m for safe Source.
        </text>
      );
    }
    return this.props.children;
  }
}

export function DocumentPreview({
  content,
  noColor,
}: {
  content: string;
  noColor?: boolean;
}) {
  return (
    <DocumentBoundary key={content}>
      <NativeDocument content={content} noColor={noColor} />
    </DocumentBoundary>
  );
}

export function NativeDocument({
  content,
  noColor,
}: {
  content: string;
  noColor?: boolean;
}) {
  const colorDisabled = noColorEnabled(noColor);
  const syntaxStyle = useMemo(
    () =>
      SyntaxStyle.fromStyles({
        default: { fg: colorDisabled ? undefined : TUI_COLORS.accent },
        ...Object.fromEntries(
          Array.from({ length: 6 }, (_, index) => [
            "markup.heading." + (index + 1),
            { fg: colorDisabled ? undefined : TUI_COLORS.accent, bold: true },
          ]),
        ),
        "markup.strong": { bold: true },
        "markup.italic": { italic: true },
        "markup.raw": { fg: colorDisabled ? undefined : TUI_COLORS.pending },
        "markup.link": { underline: true },
        "markup.list.checked": {
          fg: colorDisabled ? undefined : TUI_COLORS.success,
        },
        "markup.list.unchecked": {
          fg: colorDisabled ? undefined : TUI_COLORS.muted,
        },
      }),
    [colorDisabled],
  );
  useEffect(() => () => syntaxStyle.destroy(), [syntaxStyle]);
  return (
    <markdown
      key={content}
      content={content}
      syntaxStyle={syntaxStyle}
      fg={tuiTextColor("accent", colorDisabled)}
      conceal={false}
      streaming={false}
      internalBlockMode="top-level"
      renderNode={passiveNode}
      tableOptions={{
        wrapMode: "char",
        columnFitter: "balanced",
        cellPadding: 0,
        borderColor: tuiTextColor("border", colorDisabled),
      }}
    />
  );
}
