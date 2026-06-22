import { nanoid } from "nanoid";
import type { DrawCommand } from "../types/DrawCommand";
import type { Point, SceneObject } from "../types/SceneObject";

// Pipeline step 3: DrawCommand[] (validated LLM output) → SceneObject[] (scene graph).
// Each object gets a stable id, an explicit zIndex (painter order = command order),
// opacity, and every optional field resolved to a concrete default.

const DEFAULT_FILL = "#000000";
const TRANSPARENT = "transparent";
const DEFAULT_STROKE = TRANSPARENT;
const DEFAULT_LINE_COLOR = "#000000";
const DEFAULT_LINE_WIDTH = 1;
const DEFAULT_ARC_WIDTH = 2;
const DEFAULT_TEXT_COLOR = "#000000";
const DEFAULT_TEXT_SIZE = 16;
const DEFAULT_FONT_FAMILY = "sans-serif";

// Resolve a fill so a shape is never invisible by accident:
//  - fill given      → use it
//  - only stroke given → fill transparent (outline-only shape)
//  - neither given   → solid black, so the shape is at least visible
function resolveFill(fill?: string, stroke?: string): string {
  if (fill !== undefined) return fill;
  if (stroke !== undefined) return TRANSPARENT;
  return DEFAULT_FILL;
}

function resolveFont(font?: string, size?: number): string {
  if (font !== undefined) return font;
  return `${size ?? DEFAULT_TEXT_SIZE}px ${DEFAULT_FONT_FAMILY}`;
}

/**
 * Normalize validated commands into renderable scene objects.
 *
 * A `clear` command resets the scene being built: everything accumulated before
 * it is discarded, matching the canvas semantics of "wipe, then keep drawing".
 */
export function normalizeCommands(commands: DrawCommand[]): SceneObject[] {
  const out: SceneObject[] = [];
  let zIndex = 0;

  for (const cmd of commands) {
    if (cmd.type === "clear") {
      out.length = 0;
      zIndex = 0;
      continue;
    }
    out.push(normalizeOne(cmd, zIndex));
    zIndex += 1;
  }

  return out;
}

function base(zIndex: number) {
  return { id: nanoid(), zIndex, opacity: 1 };
}

function normalizeOne(
  cmd: Exclude<DrawCommand, { type: "clear" }>,
  zIndex: number,
): SceneObject {
  switch (cmd.type) {
    case "background":
      return { ...base(zIndex), kind: "background", color: cmd.color };

    case "circle":
      return {
        ...base(zIndex),
        kind: "circle",
        cx: cmd.cx,
        cy: cmd.cy,
        r: cmd.r,
        fill: resolveFill(cmd.fill, cmd.stroke),
        stroke: cmd.stroke ?? DEFAULT_STROKE,
        strokeWidth: cmd.strokeWidth ?? (cmd.stroke !== undefined ? 1 : 0),
      };

    case "rect":
      return {
        ...base(zIndex),
        kind: "rect",
        x: cmd.x,
        y: cmd.y,
        w: cmd.w,
        h: cmd.h,
        fill: resolveFill(cmd.fill, cmd.stroke),
        stroke: cmd.stroke ?? DEFAULT_STROKE,
        strokeWidth: cmd.strokeWidth ?? (cmd.stroke !== undefined ? 1 : 0),
        rx: cmd.rx ?? 0,
      };

    case "line":
      return {
        ...base(zIndex),
        kind: "line",
        x1: cmd.x1,
        y1: cmd.y1,
        x2: cmd.x2,
        y2: cmd.y2,
        color: cmd.color ?? DEFAULT_LINE_COLOR,
        width: cmd.width ?? DEFAULT_LINE_WIDTH,
      };

    case "triangle":
      return {
        ...base(zIndex),
        kind: "triangle",
        points: [
          { x: cmd.x1, y: cmd.y1 },
          { x: cmd.x2, y: cmd.y2 },
          { x: cmd.x3, y: cmd.y3 },
        ],
        fill: resolveFill(cmd.fill, cmd.stroke),
        stroke: cmd.stroke ?? DEFAULT_STROKE,
      };

    case "ellipse":
      return {
        ...base(zIndex),
        kind: "ellipse",
        cx: cmd.cx,
        cy: cmd.cy,
        rx: cmd.rx,
        ry: cmd.ry,
        fill: resolveFill(cmd.fill, cmd.stroke),
        stroke: cmd.stroke ?? DEFAULT_STROKE,
      };

    case "polygon":
      return {
        ...base(zIndex),
        kind: "polygon",
        points: cmd.points.map((p): Point => ({ x: p.x, y: p.y })),
        fill: resolveFill(cmd.fill, cmd.stroke),
        stroke: cmd.stroke ?? DEFAULT_STROKE,
      };

    case "text":
      return {
        ...base(zIndex),
        kind: "text",
        x: cmd.x,
        y: cmd.y,
        content: cmd.content,
        font: resolveFont(cmd.font, cmd.size),
        color: cmd.color ?? DEFAULT_TEXT_COLOR,
      };

    case "arc":
      return {
        ...base(zIndex),
        kind: "arc",
        cx: cmd.cx,
        cy: cmd.cy,
        r: cmd.r,
        startAngle: cmd.startAngle,
        endAngle: cmd.endAngle,
        color: cmd.color ?? DEFAULT_LINE_COLOR,
        width: cmd.width ?? DEFAULT_ARC_WIDTH,
      };
  }
}
