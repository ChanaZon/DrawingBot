import { describe, it, expect } from "vitest";
import reducer, {
  applyDelta,
  replaceScene,
  undo,
  redo,
  clear,
  loadScene,
  type DrawingState,
} from "./drawingSlice";
import type { SceneObject } from "../types/SceneObject";

const init = (): DrawingState => reducer(undefined, { type: "@@INIT" });

function circle(id: string, cx = 0): Extract<SceneObject, { kind: "circle" }> {
  return {
    id,
    zIndex: 0,
    opacity: 1,
    kind: "circle",
    cx,
    cy: 0,
    r: 5,
    fill: "#000",
    stroke: "transparent",
    strokeWidth: 0,
  };
}

const ids = (s: DrawingState) => s.scene.map((o) => o.id);

describe("drawingSlice — replaceScene", () => {
  it("loads a scene and records one undoable entry", () => {
    const s = reducer(
      init(),
      replaceScene({ scene: [circle("a"), circle("b")], label: "draw" }),
    );
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.history).toHaveLength(1);
    expect(s.historyIndex).toBe(0);
  });

  it("stores the scene by value — later mutation of input does not leak in", () => {
    const input = circle("a");
    const s = reducer(init(), replaceScene({ scene: [input], label: "draw" }));
    input.cx = 999;
    const stored = s.scene[0];
    expect(stored.kind === "circle" && stored.cx).toBe(0);
  });
});

describe("drawingSlice — undo/redo", () => {
  it("undo reverts to the previous scene; redo re-applies", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a")], label: "first" }));
    s = reducer(s, replaceScene({ scene: [circle("b")], label: "second" }));
    expect(ids(s)).toEqual(["b"]);

    s = reducer(s, undo());
    expect(ids(s)).toEqual(["a"]);
    expect(s.historyIndex).toBe(0);

    s = reducer(s, undo());
    expect(ids(s)).toEqual([]);
    expect(s.historyIndex).toBe(-1);

    s = reducer(s, redo());
    expect(ids(s)).toEqual(["a"]);
    s = reducer(s, redo());
    expect(ids(s)).toEqual(["b"]);
  });

  it("undo on clean history is a no-op", () => {
    const s = reducer(init(), undo());
    expect(s.historyIndex).toBe(-1);
    expect(s.scene).toEqual([]);
  });

  it("redo at the tip is a no-op", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a")], label: "d" }));
    s = reducer(s, redo());
    expect(ids(s)).toEqual(["a"]);
    expect(s.historyIndex).toBe(0);
  });
});

describe("drawingSlice — applyDelta", () => {
  it("removes an object and undo restores it intact", () => {
    let s = reducer(
      init(),
      replaceScene({ scene: [circle("a", 1), circle("b", 2)], label: "draw" }),
    );
    s = reducer(s, applyDelta({ delta: { added: [], removed: ["a"], changed: [] }, label: "del" }));
    expect(ids(s)).toEqual(["b"]);

    s = reducer(s, undo());
    // Restored objects are re-appended; array position is not preserved, but
    // render order is governed by zIndex, not array order, so this is correct.
    expect(ids(s).sort()).toEqual(["a", "b"]);
    const restored = s.scene.find((o) => o.id === "a")!;
    expect(restored.kind === "circle" && restored.cx).toBe(1);
  });

  it("applies a changed delta and undo swaps the values back", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a", 1)], label: "draw" }));
    s = reducer(
      s,
      applyDelta({
        delta: {
          added: [],
          removed: [],
          changed: [{ id: "a", from: { cx: 1 } as Partial<SceneObject>, to: { cx: 50 } as Partial<SceneObject> }],
        },
        label: "move",
      }),
    );
    expect((s.scene[0] as Extract<SceneObject, { kind: "circle" }>).cx).toBe(50);

    s = reducer(s, undo());
    expect((s.scene[0] as Extract<SceneObject, { kind: "circle" }>).cx).toBe(1);
  });

  it("a new action after undo truncates the redo branch", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a")], label: "a" }));
    s = reducer(s, replaceScene({ scene: [circle("b")], label: "b" }));
    s = reducer(s, undo()); // back at "a"
    s = reducer(s, replaceScene({ scene: [circle("c")], label: "c" }));
    expect(ids(s)).toEqual(["c"]);
    expect(s.history).toHaveLength(2); // "b" branch dropped
    expect(s.historyIndex).toBe(1);
    // redo now does nothing (branch was truncated)
    s = reducer(s, redo());
    expect(ids(s)).toEqual(["c"]);
  });
});

describe("drawingSlice — clear & loadScene", () => {
  it("clear wipes the scene as an undoable step", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a"), circle("b")], label: "draw" }));
    s = reducer(s, clear());
    expect(ids(s)).toEqual([]);
    s = reducer(s, undo());
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("clear on an empty scene records no history", () => {
    const s = reducer(init(), clear());
    expect(s.history).toHaveLength(0);
    expect(s.historyIndex).toBe(-1);
  });

  it("loadScene replaces the scene and resets history", () => {
    let s = reducer(init(), replaceScene({ scene: [circle("a")], label: "draw" }));
    s = reducer(s, loadScene([circle("x"), circle("y")]));
    expect(ids(s)).toEqual(["x", "y"]);
    expect(s.history).toHaveLength(0);
    expect(s.historyIndex).toBe(-1);
    // cannot undo past a load
    s = reducer(s, undo());
    expect(ids(s)).toEqual(["x", "y"]);
  });
});
