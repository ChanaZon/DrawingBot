import { parsePrompt, DrawingApiError } from "../api/drawingApi";
import { runPipeline, describePipelineError } from "../pipeline";
import { useAppDispatch, useAppSelector } from "../store";
import {
  replaceScene,
  setError,
  setLoading,
  setPrompt,
} from "../store/drawingSlice";

// Phase 4: the end-to-end entry point. Prompt → backend (/api/draw/parse) →
// Zod pipeline → Redux scene → canvas. The component owns no scene state of its
// own; it only dispatches, so undo/redo and the renderer stay the single source
// of truth.
export function PromptBar() {
  const dispatch = useAppDispatch();
  const prompt = useAppSelector((s) => s.drawing.prompt);
  const isLoading = useAppSelector((s) => s.drawing.isLoading);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = prompt.trim();
    // The isLoading guard plus the disabled input/button serialize submits, so
    // only one request is ever in flight — no cancellation/supersession needed.
    if (trimmed.length === 0 || isLoading) return;

    dispatch(setError(null));
    dispatch(setLoading(true));
    try {
      const commands = await parsePrompt(trimmed);

      // Validate + normalize the backend's commands before they touch the canvas.
      const result = runPipeline(commands);
      if (!result.ok) {
        dispatch(setError(describePipelineError(result.error)));
        return;
      }

      dispatch(replaceScene({ scene: result.value, label: `prompt: ${trimmed}` }));
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

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        value={prompt}
        onChange={(e) => dispatch(setPrompt(e.target.value))}
        disabled={isLoading}
        placeholder='Describe a drawing, e.g. "a sunset over the sea"'
        aria-label="Drawing prompt"
        className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={isLoading || prompt.trim().length === 0}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isLoading ? "Drawing..." : "Draw"}
      </button>
    </form>
  );
}
