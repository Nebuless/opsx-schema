import { BorderChars, RGBA } from "@opentui/core";
import type { OptimizedBuffer } from "@opentui/core";

interface PanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

/** Transparent native drawBox borders bypass scissor clipping. These primitives honor it. */
export function paintPanel(
  buffer: OptimizedBuffer,
  { x, y, width, height }: PanelBounds,
  borderColor: RGBA,
  backgroundColor?: RGBA,
): void {
  if (width < 2 || height < 2) {
    return;
  }
  if (backgroundColor) {
    buffer.fillRect(x, y, width, height, backgroundColor);
  }
  const chars = BorderChars.single;
  const background = backgroundColor ?? TRANSPARENT;
  const horizontal = chars.horizontal.repeat(width - 2);
  buffer.drawText(
    chars.topLeft + horizontal + chars.topRight,
    x,
    y,
    borderColor,
    background,
  );
  buffer.drawText(
    chars.bottomLeft + horizontal + chars.bottomRight,
    x,
    y + height - 1,
    borderColor,
    background,
  );
  // Bound work to buffer rows; the active (possibly nested) scissor clips each write.
  for (
    let row = Math.max(1, -y);
    row < Math.min(height - 1, buffer.height - y);
    row++
  ) {
    buffer.drawText(chars.vertical, x, y + row, borderColor, background);
    buffer.drawText(
      chars.vertical,
      x + width - 1,
      y + row,
      borderColor,
      background,
    );
  }
}
