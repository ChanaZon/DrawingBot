import { useCallback, useEffect, useState } from "react";
import {
  deleteDrawing,
  getDrawing,
  listDrawings,
  type DrawingSummary,
} from "../api/drawingsApi";
import { DrawingApiError } from "../api/drawingApi";
import { savedCommandsToScene } from "../pipeline/savedDrawing";
import { describePipelineError } from "../pipeline";
import { useAppDispatch, useAppSelector } from "../store";
import {
  loadScene,
  setCurrentDrawingId,
  setError,
  setLastPrompt,
  setPrompt,
  setTitle,
} from "../store/drawingSlice";

// Phase 6 gallery: the current user's saved drawings. Loading one runs its stored
// commands back through the validation pipeline (savedCommandsToScene) before it
// touches the canvas, then resets history to that drawing as a fresh baseline.
//
// `reloadToken` is bumped by the parent after a successful save so the list
// refreshes without a manual reload.
type DrawingListProps = {
  reloadToken: number;
};

export function DrawingList({ reloadToken }: DrawingListProps) {
  const dispatch = useAppDispatch();
  const currentDrawingId = useAppSelector((s) => s.drawing.currentDrawingId);

  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setListError(null);
    try {
      const page = await listDrawings();
      setDrawings(page.items);
    } catch (err) {
      setListError(
        err instanceof DrawingApiError ? err.message : "Could not load your drawings.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadToken]);

  async function handleLoad(id: number) {
    if (busyId !== null) return;
    setBusyId(id);
    dispatch(setError(null));
    try {
      const detail = await getDrawing(id);
      const result = savedCommandsToScene(detail.commands);
      if (!result.ok) {
        dispatch(setError(describePipelineError(result.error)));
        return;
      }
      // Replace the canvas and reset undo history to this drawing as the baseline.
      dispatch(loadScene(result.value));
      dispatch(setCurrentDrawingId(detail.id));
      dispatch(setLastPrompt(detail.prompt));
      dispatch(setTitle(detail.title ?? ""));
      dispatch(setPrompt(""));
    } catch (err) {
      dispatch(
        setError(
          err instanceof DrawingApiError ? err.message : "Could not load that drawing.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (busyId !== null) return;
    setBusyId(id);
    setListError(null);
    try {
      await deleteDrawing(id);
      // If the open drawing was deleted, detach it so the next save creates anew.
      if (currentDrawingId === id) {
        dispatch(setCurrentDrawingId(null));
      }
      await refresh();
    } catch (err) {
      setListError(
        err instanceof DrawingApiError ? err.message : "Could not delete that drawing.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Your drawings</h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {listError && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {listError}
        </div>
      )}

      {!isLoading && drawings.length === 0 && !listError && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No saved drawings yet. Draw something and click Save.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {drawings.map((d) => (
          <li
            key={d.id}
            className={`overflow-hidden rounded-lg border bg-white shadow-sm transition ${
              d.id === currentDrawingId ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-200"
            }`}
          >
            {d.thumbnailB64 ? (
              <img
                src={d.thumbnailB64}
                alt={d.title ?? d.prompt}
                className="aspect-[4/3] w-full bg-gray-50 object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-gray-50 text-xs text-gray-400">
                No preview
              </div>
            )}

            <div className="p-3">
              <p className="truncate text-sm font-medium text-gray-800" title={d.title ?? d.prompt}>
                {d.title?.trim() ? d.title : d.prompt}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-400" title={d.prompt}>
                {d.prompt}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleLoad(d.id)}
                  disabled={busyId !== null}
                  className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === d.id ? "..." : "Load"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(d.id)}
                  disabled={busyId !== null}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
