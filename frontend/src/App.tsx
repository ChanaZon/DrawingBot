import { CanvasView } from "./components/CanvasView";
import { ErrorBoundary, type FallbackProps } from "./components/ErrorBoundary";
import type { SceneObject } from "./types/SceneObject";

// Phase 1: render from a hardcoded scene graph to verify every renderer.
// Pipeline + Redux replace this in Phase 2.
const TEST_SCENE: SceneObject[] = [
  { id: "bg", zIndex: 0, opacity: 1, kind: "background", color: "#87CEEB" },
  {
    id: "sun",
    zIndex: 1,
    opacity: 1,
    kind: "circle",
    cx: 650,
    cy: 120,
    r: 60,
    fill: "#FFD93B",
    stroke: "#F4A100",
    strokeWidth: 3,
  },
  {
    id: "sea",
    zIndex: 2,
    opacity: 1,
    kind: "rect",
    x: 0,
    y: 420,
    w: 800,
    h: 180,
    fill: "#1E6FB8",
    stroke: "transparent",
    strokeWidth: 0,
    rx: 0,
  },
  {
    id: "sail",
    zIndex: 3,
    opacity: 1,
    kind: "triangle",
    points: [
      { x: 300, y: 300 },
      { x: 300, y: 440 },
      { x: 400, y: 440 },
    ],
    fill: "#FFFFFF",
    stroke: "#333333",
  },
  {
    id: "cloud",
    zIndex: 2,
    opacity: 0.85,
    kind: "ellipse",
    cx: 200,
    cy: 110,
    rx: 90,
    ry: 36,
    fill: "#FFFFFF",
    stroke: "transparent",
  },
  {
    id: "hill",
    zIndex: 1,
    opacity: 1,
    kind: "polygon",
    points: [
      { x: 0, y: 420 },
      { x: 220, y: 300 },
      { x: 440, y: 420 },
    ],
    fill: "#4C9A2A",
    stroke: "transparent",
  },
  {
    id: "horizon",
    zIndex: 4,
    opacity: 1,
    kind: "line",
    x1: 0,
    y1: 420,
    x2: 800,
    y2: 420,
    color: "#0F4C81",
    width: 2,
  },
  {
    id: "rainbow",
    zIndex: 3,
    opacity: 1,
    kind: "arc",
    cx: 400,
    cy: 440,
    r: 160,
    startAngle: 180,
    endAngle: 360,
    color: "#C0392B",
    width: 4,
  },
  {
    id: "title",
    zIndex: 5,
    opacity: 1,
    kind: "text",
    x: 24,
    y: 48,
    content: "Drawing Bot — Phase 1",
    font: "600 28px system-ui, sans-serif",
    color: "#08060d",
  },
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
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-bold text-gray-800">Drawing Bot</h1>
        <ErrorBoundary FallbackComponent={CanvasFallback}>
          <CanvasView scene={TEST_SCENE} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
