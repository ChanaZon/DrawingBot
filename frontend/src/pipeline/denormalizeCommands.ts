import type { DrawCommand } from "../types/DrawCommand";
import type { SceneObject } from "../types/SceneObject";

// Inverse of normalizeCommands: SceneObject[] (scene graph) → DrawCommand[] (the
// LLM's command shape). Used in EDIT mode to show the LLM the current drawing as
// context. The mapping is 1:1 and order-preserving, so the index of a command in
// the result equals the index of its SceneObject in `scene` — that is the index
// EDIT-mode removals reference (see applyEdit.ts).
//
// Internal-only fields (id, zIndex, opacity) are intentionally dropped: the LLM
// neither needs nor should see them. A "transparent" stroke is omitted so the
// command reads naturally (stroke transparent is normalize's "no stroke" default).

const TRANSPARENT = "transparent";
const DEFAULT_FONT_FAMILY = "sans-serif";

// normalizeCommands collapses a text command's `font` + `size` into a single CSS
// font string on the SceneObject (e.g. "24px sans-serif"). Split it back into the
// two-field { size, font } shape the Zod schema and the LLM prompt expect, so an
// edit round-trip preserves text sizing instead of feeding the model a combined
// shorthand it was never taught to emit.
//
// The common "size only" case ("<n>px <family>") recovers both: `size` is the
// number and `font` is the family (omitted when it is the default sans-serif, to
// keep the command clean). An explicit custom font string that isn't this shape
// (e.g. "Georgia") is passed through verbatim with no size — that size was already
// dropped at normalize time, so it cannot be reconstructed here.
function splitFont(font: string): { size?: number; font?: string } {
  const match = /^(\d+(?:\.\d+)?)px\s+(.+)$/.exec(font);
  if (match === null) {
    return { font };
  }
  const family = match[2];
  return {
    size: Number(match[1]),
    font: family === DEFAULT_FONT_FAMILY ? undefined : family,
  };
}

// Include a stroke only when it is a real, painted color.
function strokeOf(stroke: string): string | undefined {
  return stroke === TRANSPARENT ? undefined : stroke;
}

// strokeWidth is meaningless without a stroke; omit it (and avoid showing the LLM
// a width with no stroke) when the stroke is transparent.
function strokeWidthOf(stroke: string, width: number): number | undefined {
  return stroke === TRANSPARENT ? undefined : width;
}

export function denormalizeScene(scene: SceneObject[]): DrawCommand[] {
  return scene.map(denormalizeOne);
}

function denormalizeOne(obj: SceneObject): DrawCommand {
  switch (obj.kind) {
    case "background":
      return { type: "background", color: obj.color };

    case "circle":
      return {
        type: "circle",
        cx: obj.cx,
        cy: obj.cy,
        r: obj.r,
        fill: obj.fill,
        stroke: strokeOf(obj.stroke),
        strokeWidth: strokeWidthOf(obj.stroke, obj.strokeWidth),
      };

    case "rect":
      return {
        type: "rect",
        x: obj.x,
        y: obj.y,
        w: obj.w,
        h: obj.h,
        fill: obj.fill,
        stroke: strokeOf(obj.stroke),
        strokeWidth: strokeWidthOf(obj.stroke, obj.strokeWidth),
        // rx 0 is the "no rounding" default; omit it as noise.
        rx: obj.rx === 0 ? undefined : obj.rx,
      };

    case "line":
      return {
        type: "line",
        x1: obj.x1,
        y1: obj.y1,
        x2: obj.x2,
        y2: obj.y2,
        color: obj.color,
        width: obj.width,
      };

    case "triangle":
      return {
        type: "triangle",
        x1: obj.points[0].x,
        y1: obj.points[0].y,
        x2: obj.points[1].x,
        y2: obj.points[1].y,
        x3: obj.points[2].x,
        y3: obj.points[2].y,
        fill: obj.fill,
        stroke: strokeOf(obj.stroke),
      };

    case "ellipse":
      return {
        type: "ellipse",
        cx: obj.cx,
        cy: obj.cy,
        rx: obj.rx,
        ry: obj.ry,
        fill: obj.fill,
        stroke: strokeOf(obj.stroke),
      };

    case "polygon":
      return {
        type: "polygon",
        points: obj.points.map((p) => ({ x: p.x, y: p.y })),
        fill: obj.fill,
        stroke: strokeOf(obj.stroke),
      };

    case "text": {
      const { size, font } = splitFont(obj.font);
      return {
        type: "text",
        x: obj.x,
        y: obj.y,
        content: obj.content,
        font,
        color: obj.color,
        size,
      };
    }

    case "arc":
      return {
        type: "arc",
        cx: obj.cx,
        cy: obj.cy,
        r: obj.r,
        startAngle: obj.startAngle,
        endAngle: obj.endAngle,
        color: obj.color,
        width: obj.width,
      };
  }
}
