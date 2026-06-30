import { describe, it, expect } from "vitest";
import { sceneToSavedCommands, savedCommandsToScene } from "./savedDrawing";
import { normalizeCommands } from "./normalizeCommands";
import type { SceneObject } from "../types/SceneObject";
import type { SavedCommandDto } from "../api/drawingsApi";

describe("sceneToSavedCommands", () => {
  it("splits each object into { kind, params } with kind from the discriminator", () => {
    const scene = normalizeCommands([
      { type: "background", color: "skyblue" },
      { type: "circle", cx: 700, cy: 100, r: 60, fill: "yellow" },
    ]);

    const saved = sceneToSavedCommands(scene);

    expect(saved.map((c) => c.kind)).toEqual(["background", "circle"]);
    // `type` is lifted to `kind`, never duplicated inside params.
    expect(saved[1].params).not.toHaveProperty("type");
    expect(saved[1].params).toMatchObject({ cx: 700, cy: 100, r: 60, fill: "yellow" });
  });

  it("returns an empty list for an empty scene", () => {
    expect(sceneToSavedCommands([])).toEqual([]);
  });
});

describe("savedCommandsToScene", () => {
  it("re-validates and normalizes stored commands back into a scene", () => {
    const stored: SavedCommandDto[] = [
      { kind: "background", params: { color: "white" } },
      { kind: "rect", params: { x: 0, y: 520, w: 800, h: 80, fill: "green" } },
    ];

    const result = savedCommandsToScene(stored);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((o) => o.kind)).toEqual(["background", "rect"]);
  });

  it("rejects an empty command list (a drawing needs at least one command)", () => {
    const result = savedCommandsToScene([]);
    expect(result.ok).toBe(false);
  });

  it("returns an error (never throws) for a malformed stored command", () => {
    // r must be positive — a corrupt/stale row fails Zod, not the renderer.
    const result = savedCommandsToScene([
      { kind: "circle", params: { cx: 1, cy: 2, r: -5 } },
    ]);
    expect(result.ok).toBe(false);
  });

  it("returns an error for an unknown stored kind (stale persisted schema)", () => {
    const result = savedCommandsToScene([
      { kind: "hexagon", params: { x: 1, y: 2 } },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("scene → saved → scene round-trip", () => {
  it("preserves kind, geometry, and text sizing across a full round-trip", () => {
    const original: SceneObject[] = normalizeCommands([
      { type: "background", color: "white" },
      { type: "ellipse", cx: 100, cy: 100, rx: 40, ry: 20, fill: "purple" },
      { type: "triangle", x1: 0, y1: 0, x2: 10, y2: 0, x3: 5, y3: 8, fill: "blue" },
      { type: "text", x: 10, y: 20, content: "hi", size: 24 },
    ]);

    const result = savedCommandsToScene(sceneToSavedCommands(original));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const round = result.value;
    expect(round.map((o) => o.kind)).toEqual(original.map((o) => o.kind));

    const e = round[1] as Extract<SceneObject, { kind: "ellipse" }>;
    const oe = original[1] as Extract<SceneObject, { kind: "ellipse" }>;
    expect({ cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry }).toEqual({
      cx: oe.cx,
      cy: oe.cy,
      rx: oe.rx,
      ry: oe.ry,
    });

    const t = round[3] as Extract<SceneObject, { kind: "text" }>;
    const ot = original[3] as Extract<SceneObject, { kind: "text" }>;
    // The combined CSS font string (carrying size 24) survives the round-trip.
    expect(t.font).toBe(ot.font);
  });
});
