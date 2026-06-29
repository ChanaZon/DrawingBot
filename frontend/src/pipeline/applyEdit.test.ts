import { describe, it, expect } from "vitest";
import { runEditPipeline } from "./applyEdit";
import { normalizeCommands } from "./normalizeCommands";
import type { SceneObject } from "../types/SceneObject";

// A small current scene: background (z0), circle (z1).
function currentScene(): SceneObject[] {
  return normalizeCommands([
    { type: "background", color: "skyblue" },
    { type: "circle", cx: 700, cy: 100, r: 60, fill: "yellow" },
  ]);
}

describe("runEditPipeline", () => {
  it("normalizes added shapes and maps removal indices to ids", () => {
    const scene = currentScene();
    const sunId = scene[1].id;

    const result = runEditPipeline(
      { add: [{ type: "rect", x: 0, y: 520, w: 800, h: 80, fill: "green" }], remove: [1] },
      scene,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.added).toHaveLength(1);
    expect(result.value.added[0].kind).toBe("rect");
    expect(result.value.removed).toEqual([sunId]);
    expect(result.value.changed).toEqual([]);
  });

  it("paints added shapes on top of the existing scene (zIndex above max)", () => {
    const scene = currentScene(); // max zIndex = 1
    const result = runEditPipeline(
      { add: [{ type: "circle", cx: 10, cy: 10, r: 5, fill: "red" }], remove: [] },
      scene,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.added[0].zIndex).toBe(2);
  });

  it("allows a pure-add edit (empty remove)", () => {
    const result = runEditPipeline(
      { add: [{ type: "circle", cx: 1, cy: 1, r: 1 }], remove: [] },
      currentScene(),
    );
    expect(result.ok).toBe(true);
  });

  it("allows a pure-remove edit (empty/absent add)", () => {
    const scene = currentScene();
    const result = runEditPipeline({ remove: [0] }, scene);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.added).toEqual([]);
    expect(result.value.removed).toEqual([scene[0].id]);
  });

  it("dedupes a repeated removal index", () => {
    const scene = currentScene();
    const result = runEditPipeline({ remove: [1, 1] }, scene);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.removed).toEqual([scene[1].id]);
  });

  it("rejects a removal index out of range", () => {
    const result = runEditPipeline({ add: [], remove: [5] }, currentScene());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("schema");
    expect(result.error.message).toMatch(/out of range/i);
  });

  it("rejects an added command that fails the Zod schema", () => {
    const result = runEditPipeline(
      { add: [{ type: "circle", cx: 1, cy: 1, r: -5 }], remove: [] },
      currentScene(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed response shape", () => {
    const result = runEditPipeline({ add: "nope", remove: 3 }, currentScene());
    expect(result.ok).toBe(false);
  });

  it("rejects adding a background (would hide the existing drawing)", () => {
    const result = runEditPipeline(
      { add: [{ type: "background", color: "red" }], remove: [] },
      currentScene(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/background or clear/i);
  });

  it("rejects adding a clear", () => {
    const result = runEditPipeline(
      { add: [{ type: "clear" }], remove: [] },
      currentScene(),
    );
    expect(result.ok).toBe(false);
  });
});
