import { describe, it, expect } from "vitest";
import { denormalizeScene } from "./denormalizeCommands";
import { normalizeCommands } from "./normalizeCommands";
import type { DrawCommand } from "../types/DrawCommand";
import type { SceneObject } from "../types/SceneObject";

describe("denormalizeScene", () => {
  it("maps each scene object to one command, preserving order (index parity)", () => {
    const scene = normalizeCommands([
      { type: "background", color: "skyblue" },
      { type: "circle", cx: 700, cy: 100, r: 60, fill: "yellow" },
      { type: "rect", x: 0, y: 520, w: 800, h: 80, fill: "green" },
    ]);

    const commands = denormalizeScene(scene);
    expect(commands.map((c) => c.type)).toEqual(["background", "circle", "rect"]);
  });

  it("drops internal fields (id, zIndex, opacity)", () => {
    const scene = normalizeCommands([{ type: "circle", cx: 1, cy: 2, r: 3, fill: "red" }]);
    const [cmd] = denormalizeScene(scene);
    expect(cmd).not.toHaveProperty("id");
    expect(cmd).not.toHaveProperty("zIndex");
    expect(cmd).not.toHaveProperty("opacity");
  });

  it("omits a transparent stroke (normalize's 'no stroke' default)", () => {
    const scene = normalizeCommands([{ type: "circle", cx: 1, cy: 2, r: 3, fill: "red" }]);
    const cmd = denormalizeScene(scene)[0] as Extract<DrawCommand, { type: "circle" }>;
    expect(cmd.stroke).toBeUndefined();
  });

  it("keeps a real stroke color", () => {
    const scene = normalizeCommands([
      { type: "circle", cx: 1, cy: 2, r: 3, stroke: "#f00" },
    ]);
    const cmd = denormalizeScene(scene)[0] as Extract<DrawCommand, { type: "circle" }>;
    expect(cmd.stroke).toBe("#f00");
  });

  it("recovers a text command's size from the combined CSS font string", () => {
    const scene = normalizeCommands([
      { type: "text", x: 10, y: 20, content: "hi", size: 24 },
    ]);
    const cmd = denormalizeScene(scene)[0] as Extract<DrawCommand, { type: "text" }>;
    expect(cmd.size).toBe(24);
    // The default sans-serif family is omitted as noise (size carries the intent).
    expect(cmd.font).toBeUndefined();
  });

  it("keeps a custom font family while still recovering its size", () => {
    const scene = normalizeCommands([
      { type: "text", x: 0, y: 0, content: "x", font: "16px Georgia" },
    ]);
    const cmd = denormalizeScene(scene)[0] as Extract<DrawCommand, { type: "text" }>;
    expect(cmd.size).toBe(16);
    expect(cmd.font).toBe("Georgia");
  });

  it("flattens a triangle's point tuple back to x1..y3", () => {
    const scene = normalizeCommands([
      { type: "triangle", x1: 0, y1: 0, x2: 10, y2: 0, x3: 5, y3: 8, fill: "blue" },
    ]);
    const cmd = denormalizeScene(scene)[0] as Extract<DrawCommand, { type: "triangle" }>;
    expect([cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x3, cmd.y3]).toEqual([0, 0, 10, 0, 5, 8]);
  });

  it("produces commands that re-normalize back to the same geometry (round-trip)", () => {
    const original: SceneObject[] = normalizeCommands([
      { type: "background", color: "white" },
      { type: "ellipse", cx: 100, cy: 100, rx: 40, ry: 20, fill: "purple" },
      { type: "text", x: 10, y: 20, content: "hi", size: 24 },
    ]);

    const reNormalized = normalizeCommands(denormalizeScene(original));

    // ids differ (fresh nanoids) but kind + geometry are stable.
    expect(reNormalized.map((o) => o.kind)).toEqual(original.map((o) => o.kind));
    const e0 = reNormalized[1] as Extract<SceneObject, { kind: "ellipse" }>;
    const o0 = original[1] as Extract<SceneObject, { kind: "ellipse" }>;
    expect({ cx: e0.cx, cy: e0.cy, rx: e0.rx, ry: e0.ry, fill: e0.fill }).toEqual({
      cx: o0.cx,
      cy: o0.cy,
      rx: o0.rx,
      ry: o0.ry,
      fill: o0.fill,
    });
  });
});
