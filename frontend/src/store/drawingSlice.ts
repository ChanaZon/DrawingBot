import { createSlice, current, type PayloadAction } from "@reduxjs/toolkit";
import type {
  HistoryEntry,
  SceneDelta,
  SceneObject,
} from "../types/SceneObject";

// Redux Toolkit slice for the drawing scene graph.
//
// Undo/redo is delta-based (CLAUDE.md): `scene` is the materialized current
// canvas, and `history` holds one HistoryEntry per recorded action. Each entry
// carries both an `apply` delta (redo) and a `revert` delta (undo), so the cost
// of a step is O(changed objects), not O(whole scene).

export type DrawingState = {
  scene: SceneObject[];
  history: HistoryEntry[];
  historyIndex: number; // index of the last applied entry; -1 = clean
  prompt: string;
  // The prompt that produced the current scene. Kept separate from `prompt`
  // (the live input, which is cleared after a successful draw) so Save can record
  // the originating prompt. Set on create/edit and when loading a saved drawing.
  lastPrompt: string;
  // Optional user-supplied title for the current drawing (used on save/update).
  // Populated when a saved drawing is loaded; reset when the canvas is cleared.
  title: string;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  // The saved-drawing id the canvas is linked to: null = unsaved/new (Save creates),
  // a number = loaded/saved (Save updates that row). Cleared on `clear`.
  currentDrawingId: number | null;
};

const initialState: DrawingState = {
  scene: [],
  history: [],
  historyIndex: -1,
  prompt: "",
  lastPrompt: "",
  title: "",
  isLoading: false,
  error: null,
  isAuthenticated: false,
  currentDrawingId: null,
};

// SceneObjects are fully JSON-serializable (every field is resolved to a number,
// string, or array of points after normalization — no undefined/functions/Dates).
// A JSON round-trip is used instead of structuredClone because it also works on
// Immer draft proxies read out of the history tree, which structuredClone rejects.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Mutate `scene` (an Immer draft) in place by a delta: remove, then change,
// then add. Order matters so a delta can replace an object by id within one step.
function applyToScene(scene: SceneObject[], delta: SceneDelta): void {
  if (delta.removed.length > 0) {
    const toRemove = new Set(delta.removed);
    for (let i = scene.length - 1; i >= 0; i--) {
      if (toRemove.has(scene[i].id)) scene.splice(i, 1);
    }
  }

  for (const change of delta.changed) {
    const target = scene.find((o) => o.id === change.id);
    // `to` is a Partial<SceneObject>; the discriminant `kind` never changes,
    // so assigning resolved fields onto the existing object is sound.
    if (target) Object.assign(target, change.to);
  }

  for (const obj of delta.added) {
    scene.push(clone(obj));
  }
}

// Build the delta that undoes `delta`, using a plain snapshot of the scene taken
// BEFORE the delta is applied (needed to capture objects about to be removed).
function invertDelta(
  snapshot: readonly SceneObject[],
  delta: SceneDelta,
): SceneDelta {
  const restored = delta.removed
    .map((id) => snapshot.find((o) => o.id === id))
    .filter((o): o is SceneObject => o !== undefined)
    .map(clone);

  return {
    added: restored,
    removed: delta.added.map((o) => o.id),
    changed: delta.changed.map((change) => ({
      id: change.id,
      from: change.to,
      to: change.from,
    })),
  };
}

// Record a new entry, discarding any redo branch ahead of the cursor.
function pushHistory(
  state: DrawingState,
  label: string,
  apply: SceneDelta,
  revert: SceneDelta,
): void {
  if (state.historyIndex < state.history.length - 1) {
    state.history.splice(state.historyIndex + 1);
  }
  state.history.push({ label, apply, revert });
  state.historyIndex = state.history.length - 1;
}

const drawingSlice = createSlice({
  name: "drawing",
  initialState,
  reducers: {
    // Apply an arbitrary delta and record it as an undoable step. The revert
    // delta is computed here from the pre-mutation scene snapshot.
    applyDelta(
      state,
      action: PayloadAction<{ delta: SceneDelta; label: string }>,
    ) {
      const { delta, label } = action.payload;
      const snapshot = current(state.scene);
      const revert = invertDelta(snapshot, delta);
      pushHistory(state, label, clone(delta), revert);
      applyToScene(state.scene, delta);
    },

    // Replace the entire scene (e.g. a fresh LLM draw) as one undoable step.
    // The delta removes every current object and adds every new one.
    replaceScene(
      state,
      action: PayloadAction<{ scene: SceneObject[]; label: string }>,
    ) {
      const snapshot = current(state.scene);
      const delta: SceneDelta = {
        added: action.payload.scene.map(clone),
        removed: snapshot.map((o) => o.id),
        changed: [],
      };
      const revert: SceneDelta = {
        added: snapshot.map(clone),
        removed: delta.added.map((o) => o.id),
        changed: [],
      };
      pushHistory(state, action.payload.label, delta, revert);
      applyToScene(state.scene, delta);
    },

    undo(state) {
      if (state.historyIndex < 0) return;
      const entry = state.history[state.historyIndex];
      applyToScene(state.scene, entry.revert);
      state.historyIndex -= 1;
    },

    redo(state) {
      if (state.historyIndex >= state.history.length - 1) return;
      const entry = state.history[state.historyIndex + 1];
      applyToScene(state.scene, entry.apply);
      state.historyIndex += 1;
    },

    // Wipe the canvas as one undoable step. No-op (and no history entry) when
    // the scene is already empty.
    clear(state) {
      const snapshot = current(state.scene);
      if (snapshot.length === 0) return;
      const delta: SceneDelta = {
        added: [],
        removed: snapshot.map((o) => o.id),
        changed: [],
      };
      const revert: SceneDelta = {
        added: snapshot.map(clone),
        removed: [],
        changed: [],
      };
      pushHistory(state, "clear", delta, revert);
      applyToScene(state.scene, delta);
      // Clearing the canvas starts fresh: detach from any loaded/saved drawing so
      // the next Save creates a new row rather than overwriting the previous one.
      state.currentDrawingId = null;
      state.lastPrompt = "";
      state.title = "";
    },

    // Load a saved drawing: replace the scene and reset history to a fresh
    // baseline — you cannot undo past a load. The saved-drawing linkage
    // (currentDrawingId / lastPrompt / title) is set by the caller alongside this
    // (see DrawingList.handleLoad), keeping this reducer scene-only.
    loadScene(state, action: PayloadAction<SceneObject[]>) {
      state.scene = action.payload.map(clone);
      state.history = [];
      state.historyIndex = -1;
    },

    setPrompt(state, action: PayloadAction<string>) {
      state.prompt = action.payload;
    },

    setLastPrompt(state, action: PayloadAction<string>) {
      state.lastPrompt = action.payload;
    },

    setTitle(state, action: PayloadAction<string>) {
      state.title = action.payload;
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    setAuthenticated(state, action: PayloadAction<boolean>) {
      state.isAuthenticated = action.payload;
    },

    setCurrentDrawingId(state, action: PayloadAction<number | null>) {
      state.currentDrawingId = action.payload;
    },
  },
});

export const {
  applyDelta,
  replaceScene,
  undo,
  redo,
  clear,
  loadScene,
  setPrompt,
  setLastPrompt,
  setTitle,
  setLoading,
  setError,
  setAuthenticated,
  setCurrentDrawingId,
} = drawingSlice.actions;

export default drawingSlice.reducer;
