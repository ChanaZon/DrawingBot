export type Point = { x: number; y: number };

// Layer 2 — internal scene graph. Renderable, with stable id, zIndex, resolved defaults.
export type SceneObjectBase = {
  id: string; // nanoid
  zIndex: number;
  opacity: number; // 0–1, default 1
};

export type SceneObject =
  | (SceneObjectBase & { kind: "background"; color: string })
  | (SceneObjectBase & {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
    })
  | (SceneObjectBase & {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      rx: number;
    })
  | (SceneObjectBase & {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    })
  | (SceneObjectBase & {
      kind: "triangle";
      points: [Point, Point, Point];
      fill: string;
      stroke: string;
    })
  | (SceneObjectBase & {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      stroke: string;
    })
  | (SceneObjectBase & {
      kind: "polygon";
      points: Point[];
      fill: string;
      stroke: string;
    })
  | (SceneObjectBase & {
      kind: "text";
      x: number;
      y: number;
      content: string;
      font: string;
      color: string;
    })
  | (SceneObjectBase & {
      kind: "arc";
      cx: number;
      cy: number;
      r: number;
      startAngle: number;
      endAngle: number;
      color: string;
      width: number;
    });

export type SceneObjectKind = SceneObject["kind"];

// Delta-based undo/redo (not snapshots). Memory cost per step is O(changed objects).
export type SceneDelta = {
  added: SceneObject[]; // objects to add
  removed: string[]; // object ids to remove
  changed: { id: string; from: Partial<SceneObject>; to: Partial<SceneObject> }[];
};

export type HistoryEntry = {
  label: string; // e.g. "draw circle", "clear"
  apply: SceneDelta; // what was added/removed/changed
  revert: SceneDelta; // how to undo it
};
