import { CanvasView } from "./components/CanvasView";
import { Toolbar } from "./components/Toolbar";
import { ErrorBoundary, type FallbackProps } from "./components/ErrorBoundary";
import { runPipeline, describePipelineError } from "./pipeline";
import { selectScene, useAppDispatch, useAppSelector } from "./store";
import { replaceScene, setError } from "./store/drawingSlice";

// Phase 2 demo input: raw LLM-style commands, fed through the real pipeline
// (validate → normalize → store → render). The PromptBar replaces this in Phase 4.
const DEMO_COMMANDS: unknown = [
  { type: "background", color: "#87CEEB" },
  { type: "circle", cx: 650, cy: 120, r: 60, fill: "#FFD93B", stroke: "#F4A100", strokeWidth: 3 },
  { type: "polygon", points: [{ x: 0, y: 420 }, { x: 220, y: 300 }, { x: 440, y: 420 }], fill: "#4C9A2A" },
  { type: "rect", x: 0, y: 420, w: 800, h: 180, fill: "#1E6FB8" },
  { type: "ellipse", cx: 200, cy: 110, rx: 90, ry: 36, fill: "#FFFFFF" },
  { type: "arc", cx: 400, cy: 440, r: 160, startAngle: 180, endAngle: 360, color: "#C0392B", width: 4 },
  { type: "text", x: 24, y: 48, content: "Drawing Bot — Phase 2", size: 28, color: "#08060d" },
];

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
  const dispatch = useAppDispatch();
  const scene = useAppSelector(selectScene);
  const error = useAppSelector((s) => s.drawing.error);

  function loadDemo() {
    const result = runPipeline(DEMO_COMMANDS);
    if (!result.ok) {
      dispatch(setError(describePipelineError(result.error)));
      return;
    }
    dispatch(setError(null));
    dispatch(replaceScene({ scene: result.value, label: "demo draw" }));
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">Drawing Bot</h1>

        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            Load demo scene
          </button>
          <Toolbar />
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
