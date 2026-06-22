import { describe, it, expect } from "vitest";
import { normalizeCommands } from "./normalizeCommands";
import type { DrawCommand } from "../types/DrawCommand";
import type { SceneObject } from "../types/SceneObject";

// Narrow a scene object to a specific kind for typed assertions.
function pick<K extends SceneObject["kind"]>(
  scene: SceneObject[],
  kind: K,
): Extract<SceneObject, { kind: K }> {
  const found = scene.find((o) => o.kind === kind);
  if (!found) throw new Error(`no ${kind} in scene`);
  return found as Extract<SceneObject, { kind: K }>;
}

describe("normalizeCommands", () => {
  it("assigns a unique id, sequential zIndex, and opacity 1", () => {
    const scene = normalizeCommands([
      { type: "circle", cx: 1, cy: 1, r: 1 },
      { type: "circle", cx: 2, cy: 2, r: 2 },
    ]);
    expect(scene.map((o) => o.zIndex)).toEqual([0, 1]);
    expect(scene[0].opacity).toBe(1);
    expect(scene[0].id).not.toBe(scene[1].id);
    expect(scene[0].id).toBeTruthy();
  });

  it("defaults fill to black when neither fill nor stroke is given", () => {
    const scene = normalizeCommands([{ type: "circle", cx: 1, cy: 1, r: 1 }]);
    const circle = pick(scene, "circle");
    expect(circle.fill).toBe("#000000");
    expect(circle.stroke).toBe("transparent");
    expect(circle.strokeWidth).toBe(0);
  });

  it("makes fill transparent when only stroke is given (outline shape)", () => {
    const scene = normalizeCommands([
      { type: "circle", cx: 1, cy: 1, r: 1, stroke: "#f00" },
    ]);
    const circle = pick(scene, "circle");
    expect(circle.fill).toBe("transparent");
    expect(circle.stroke).toBe("#f00");
    expect(circle.strokeWidth).toBe(1);
  });

  it("keeps an explicit fill and strokeWidth", () => {
    const scene = normalizeCommands([
      { type: "rect", x: 0, y: 0, w: 10, h: 10, fill: "#0f0", stroke: "#000", strokeWidth: 4 },
    ]);
    const rect = pick(scene, "rect");
    expect(rect.fill).toBe("#0f0");
    expect(rect.strokeWidth).toBe(4);
    expect(rect.rx).toBe(0);
  });

  it("builds a font string from size when font is omitted", () => {
    const scene = normalizeCommands([
      { type: "text", x: 0, y: 0, content: "hi", size: 24 },
    ]);
    expect(pick(scene, "text").font).toBe("24px sans-serif");
  });

  it("prefers an explicit font over size", () => {
    const scene = normalizeCommands([
      { type: "text", x: 0, y: 0, content: "hi", size: 24, font: "bold 12px serif" },
    ]);
    expect(pick(scene, "text").font).toBe("bold 12px serif");
  });

  it("converts triangle x/y fields into a 3-point tuple", () => {
    const scene = normalizeCommands([
      { type: "triangle", x1: 0, y1: 0, x2: 10, y2: 0, x3: 5, y3: 8 },
    ]);
    const tri = pick(scene, "triangle");
    expect(tri.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ]);
  });

  it("resets the scene at a clear command, keeping only what follows", () => {
    const commands: DrawCommand[] = [
      { type: "circle", cx: 1, cy: 1, r: 1 },
      { type: "circle", cx: 2, cy: 2, r: 2 },
      { type: "clear" },
      { type: "rect", x: 0, y: 0, w: 5, h: 5 },
    ];
    const scene = normalizeCommands(commands);
    expect(scene).toHaveLength(1);
    expect(scene[0].kind).toBe("rect");
    expect(scene[0].zIndex).toBe(0);
  });

  it("defaults line color/width and arc width", () => {
    const scene = normalizeCommands([
      { type: "line", x1: 0, y1: 0, x2: 1, y2: 1 },
      { type: "arc", cx: 0, cy: 0, r: 5, startAngle: 0, endAngle: 90 },
    ]);
    const line = pick(scene, "line");
    expect(line.color).toBe("#000000");
    expect(line.width).toBe(1);
    expect(pick(scene, "arc").width).toBe(2);
  });

  it("returns an empty scene for an array of only clears", () => {
    expect(normalizeCommands([{ type: "clear" }, { type: "clear" }])).toEqual([]);
  });
});
