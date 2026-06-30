import { useState } from "react";
import { saveDrawing, updateDrawing } from "../api/drawingsApi";
import { DrawingApiError } from "../api/drawingApi";
import { sceneToSavedCommands } from "../pipeline/savedDrawing";
import { renderThumbnail } from "../utils/thumbnail";
import { useAppDispatch, useAppSelector, selectScene } from "../store";
import { setCurrentDrawingId, setError, setTitle } from "../store/drawingSlice";

// Phase 6 save control: persist the current canvas to the backend. Linked to a
// saved row via currentDrawingId — Save creates a new drawing, then becomes
// Update for that row. The originating prompt (store.lastPrompt) is sent as the
// required Prompt; a small PNG thumbnail is generated off-screen for the gallery.
type SaveBarProps = {
  // Called after a successful save so the parent can refresh the gallery.
  onSaved: () => void;
};

export function SaveBar({ onSaved }: SaveBarProps) {
  const dispatch = useAppDispatch();
  const scene = useAppSelector(selectScene);
  const title = useAppSelector((s) => s.drawing.title);
  const lastPrompt = useAppSelector((s) => s.drawing.lastPrompt);
  const currentDrawingId = useAppSelector((s) => s.drawing.currentDrawingId);

  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const hasScene = scene.length > 0;
  const isUpdate = currentDrawingId !== null;

  async function handleSave() {
    if (!hasScene || isSaving) return;

    setStatus(null);
    dispatch(setError(null));
    setIsSaving(true);

    // Built before the request so a thumbnail/conversion hiccup can never be
    // reported as a network "save failed" (renderThumbnail is self-guarding and
    // returns null rather than throwing).
    const request = {
      // Prompt is required + non-empty server-side; fall back if somehow blank.
      prompt: lastPrompt.trim() || "Untitled drawing",
      title: title.trim() ? title.trim() : null,
      thumbnailB64: renderThumbnail(scene),
      commands: sceneToSavedCommands(scene),
    };

    try {
      if (isUpdate) {
        await updateDrawing(currentDrawingId, request);
        setStatus("Saved changes.");
      } else {
        const created = await saveDrawing(request);
        dispatch(setCurrentDrawingId(created.id));
        setStatus("Drawing saved.");
      }
      onSaved();
    } catch (err) {
      dispatch(
        setError(
          err instanceof DrawingApiError ? err.message : "Could not save the drawing.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => dispatch(setTitle(e.target.value))}
        disabled={isSaving || !hasScene}
        maxLength={200}
        placeholder="Title (optional)"
        aria-label="Drawing title"
        className="w-44 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!hasScene || isSaving}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSaving ? "Saving..." : isUpdate ? "Update" : "Save"}
      </button>
      {status && <span className="text-sm text-emerald-600">{status}</span>}
    </div>
  );
}
