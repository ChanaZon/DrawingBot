import { CanvasView } from "./components/CanvasView";
import { PromptBar } from "./components/PromptBar";
import { Toolbar } from "./components/Toolbar";
import { ErrorBoundary, type FallbackProps } from "./components/ErrorBoundary";
import { selectScene, useAppSelector } from "./store";

function CanvasFallback({ error }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-700">
      <p className="font-semibold">The canvas failed to render.</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}

function App() {
  const scene = useAppSelector(selectScene);
  const error = useAppSelector((s) => s.drawing.error);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">Drawing Bot</h1>

        <div className="mb-4 flex flex-col gap-3">
          <PromptBar />
          <div className="flex justify-end">
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
      </div>
    </div>
  );
}

export default App;
