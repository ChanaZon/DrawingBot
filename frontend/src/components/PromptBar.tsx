import { parsePrompt, requestEdit, DrawingApiError } from "../api/drawingApi";
import {
  runPipeline,
  runEditPipeline,
  denormalizeScene,
  describePipelineError,
} from "../pipeline";
import { useAppDispatch, useAppSelector, selectScene } from "../store";
import {
  applyDelta,
  replaceScene,
  setError,
  setLoading,
  setPrompt,
} from "../store/drawingSlice";

// Phase 4: the end-to-end entry point. Prompt → backend (/api/draw/parse) →
// Zod pipeline → Redux scene → canvas. The component owns no scene state of its
// own; it only dispatches, so undo/redo and the renderer stay the single source
// of truth.
//
// Conversational editing: when the canvas is empty a prompt CREATES a drawing
// (replaceScene). When it already has objects the same prompt EDITS it — the
// current scene is sent as context and only the LLM's additions/removals are
// applied (applyDelta), so existing shapes are preserved exactly.
export function PromptBar() {
  const dispatch = useAppDispatch();
  const prompt = useAppSelector((s) => s.drawing.prompt);
  const isLoading = useAppSelector((s) => s.drawing.isLoading);
  const scene = useAppSelector(selectScene);
  const isEditing = scene.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = prompt.trim();
    // The isLoading guard plus the disabled input/button serialize submits, so
    // only one request is ever in flight — no cancellation/supersession needed.
    if (trimmed.length === 0 || isLoading) return;

    dispatch(setError(null));
    dispatch(setLoading(true));
    try {
      if (isEditing) {
        await handleEdit(trimmed);
      } else {
        await handleCreate(trimmed);
      }
    } catch (err) {
      const message =
        err instanceof DrawingApiError
          ? err.message
          : "Something went wrong while drawing. Please try again.";
      dispatch(setError(message));
    } finally {
      dispatch(setLoading(false));
    }
  }

  // CREATE: empty canvas → the prompt produces a whole new drawing.
  async function handleCreate(trimmed: string) {
    const commands = await parsePrompt(trimmed);

    // Validate + normalize the backend's commands before they touch the canvas.
    const result = runPipeline(commands);
    if (!result.ok) {
      dispatch(setError(describePipelineError(result.error)));
      return;
    }

    dispatch(replaceScene({ scene: result.value, label: `prompt: ${trimmed}` }));
    dispatch(setPrompt(""));
  }

  // EDIT: existing canvas → send it as context, apply only add/remove so the
  // shapes the user keeps never change.
  async function handleEdit(trimmed: string) {
    const raw = await requestEdit(trimmed, denormalizeScene(scene));

    const result = runEditPipeline(raw, scene);
    if (!result.ok) {
      dispatch(setError(describePipelineError(result.error)));
      return;
    }

    dispatch(applyDelta({ delta: result.value, label: `edit: ${trimmed}` }));
    dispatch(setPrompt(""));
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={prompt}
        onChange={(e) => dispatch(setPrompt(e.target.value))}
        disabled={isLoading}
        placeholder={
          isEditing
            ? 'Change the drawing, e.g. "add a boat" or "remove the sun"'
            : 'Describe a drawing, e.g. "a sunset over the sea"'
        }
        aria-label={isEditing ? "Edit drawing prompt" : "Drawing prompt"}
        className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isLoading || prompt.trim().length === 0}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isLoading ? (isEditing ? "Updating..." : "Drawing...") : isEditing ? "Update" : "Draw"}
      </button>
    </form>
  );
}
