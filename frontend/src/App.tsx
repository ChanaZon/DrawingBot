import { useEffect, useState } from "react";
import { CanvasView } from "./components/CanvasView";
import { PromptBar } from "./components/PromptBar";
import { Toolbar } from "./components/Toolbar";
import { SaveBar } from "./components/SaveBar";
import { AuthForm } from "./components/AuthForm";
import { DrawingList } from "./components/DrawingList";
import { ErrorBoundary, type FallbackProps } from "./components/ErrorBoundary";
import { clearToken, getToken, onUnauthorized } from "./api/http";
import { selectScene, useAppDispatch, useAppSelector } from "./store";
import { clear, setAuthenticated, setError } from "./store/drawingSlice";

function CanvasFallback({ error }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-700">
      <p className="font-semibold">The canvas failed to render.</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

function ListFallback({ error }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mt-8 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-semibold">The drawing list failed to load.</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

function App() {
  const dispatch = useAppDispatch();
  const scene = useAppSelector(selectScene);
  const error = useAppSelector((s) => s.drawing.error);
  const isAuthenticated = useAppSelector((s) => s.drawing.isAuthenticated);

  // Bumped after a successful save so the gallery re-fetches.
  const [galleryReloadToken, setGalleryReloadToken] = useState(0);

  // Bootstrap auth from a persisted token, and react to a server-side 401 (expired
  // token) by dropping back to the login screen.
  useEffect(() => {
    if (getToken()) {
      dispatch(setAuthenticated(true));
    }
    onUnauthorized(() => {
      dispatch(setAuthenticated(false));
      dispatch(setError("Your session has expired. Please sign in again."));
    });
  }, [dispatch]);

  function handleSignOut() {
    clearToken();
    dispatch(clear()); // wipe the canvas + detach from any loaded drawing
    dispatch(setAuthenticated(false));
    dispatch(setError(null));
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-center text-2xl font-bold text-gray-800">Drawing Bot</h1>
          <AuthForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Drawing Bot</h1>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3">
          <PromptBar />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SaveBar onSaved={() => setGalleryReloadToken((t) => t + 1)} />
            <Toolbar />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <ErrorBoundary FallbackComponent={CanvasFallback}>
          <CanvasView scene={scene} />
        </ErrorBoundary>

        <ErrorBoundary FallbackComponent={ListFallback}>
          <DrawingList reloadToken={galleryReloadToken} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
