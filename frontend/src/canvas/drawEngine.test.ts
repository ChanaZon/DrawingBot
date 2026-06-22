import { describe, it, expect } from "vitest";
import { render, CANVAS_WIDTH, CANVAS_HEIGHT } from "./drawEngine";
import type { SceneObject } from "../types/SceneObject";

// Minimal recording stub for CanvasRenderingContext2D. jsdom has no real canvas,
// and a stub also lets us assert exactly which drawing calls the guards allow.
type Call = { name: string; args: unknown[] };

function makeCtx() {
  const calls: Call[] = [];
  const alphas: number[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      calls.push({ name, args });

  const ctx = {
    calls,
    alphas,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    set globalAlpha(v: number) {
      alphas.push(v);
    },
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arc: record("arc"),
    ellipse: record("ellipse"),
    rect: record("rect"),
    roundRect: record("roundRect"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillText: record("fillText"),
  };
  return ctx;
}

const names = (ctx: ReturnType<typeof makeCtx>) => ctx.calls.map((c) => c.name);

const baseOf = (over: Partial<SceneObject> = {}) => ({
  id: "x",
  zIndex: 0,
  opacity: 1,
  ...over,
});

describe("drawEngine.render", () => {
  it("clears the full logical canvas once before drawing", () => {
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, []);
    const clears = ctx.calls.filter((c) => c.name === "clearRect");
    expect(clears).toHaveLength(1);
    expect(clears[0].args).toEqual([0, 0, CANVAS_WIDTH, CANVAS_HEIGHT]);
  });

  it("draws objects in ascending zIndex order regardless of array order", () => {
    const front: SceneObject = {
      ...baseOf({ zIndex: 5 }),
      kind: "circle",
      cx: 1,
      cy: 1,
      r: 1,
      fill: "#000",
      stroke: "transparent",
      strokeWidth: 0,
    } as SceneObject;
    const back: SceneObject = {
      ...baseOf({ zIndex: 1 }),
      kind: "background",
      color: "#fff",
    } as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [front, back]);
    // background paints via fillRect; circle via arc — background must come first.
    const order = names(ctx).filter((n) => n === "fillRect" || n === "arc");
    expect(order).toEqual(["fillRect", "arc"]);
  });

  it("skips a circle with non-finite geometry (no arc drawn)", () => {
    const bad: SceneObject = {
      ...baseOf(),
      kind: "circle",
      cx: NaN,
      cy: 1,
      r: 5,
      fill: "#000",
      stroke: "transparent",
      strokeWidth: 0,
    } as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [bad]);
    expect(names(ctx)).not.toContain("arc");
  });

  it("skips a circle with non-positive radius", () => {
    const bad: SceneObject = {
      ...baseOf(),
      kind: "circle",
      cx: 1,
      cy: 1,
      r: 0,
      fill: "#000",
      stroke: "transparent",
      strokeWidth: 0,
    } as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [bad]);
    expect(names(ctx)).not.toContain("arc");
  });

  it("fills only when fill is opaque, strokes only when stroke is opaque", () => {
    const outline: SceneObject = {
      ...baseOf(),
      kind: "circle",
      cx: 1,
      cy: 1,
      r: 5,
      fill: "transparent",
      stroke: "#000",
      strokeWidth: 2,
    } as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [outline]);
    expect(names(ctx)).toContain("stroke");
    expect(names(ctx)).not.toContain("fill");
  });

  it("clamps opacity into [0,1] and falls back to 1 for non-finite", () => {
    const mk = (opacity: number): SceneObject =>
      ({ ...baseOf({ opacity }), kind: "background", color: "#fff" }) as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [mk(5), mk(-3), mk(NaN)]);
    expect(ctx.alphas).toEqual([1, 0, 1]);
  });

  it("clamps an oversized rect corner radius instead of dropping the rect", () => {
    const rect: SceneObject = {
      ...baseOf(),
      kind: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      fill: "#000",
      stroke: "transparent",
      strokeWidth: 0,
      rx: 999, // larger than half the width/height
    } as SceneObject;
    const ctx = makeCtx();
    render(ctx as unknown as CanvasRenderingContext2D, [rect]);
    const round = ctx.calls.find((c) => c.name === "roundRect");
    expect(round).toBeDefined();
    expect(round?.args[4]).toBe(5); // clamped to min(w/2, h/2)
  });

  it("does not throw and still clears when handed an empty scene", () => {
    const ctx = makeCtx();
    expect(() =>
      render(ctx as unknown as CanvasRenderingContext2D, []),
    ).not.toThrow();
  });
});
