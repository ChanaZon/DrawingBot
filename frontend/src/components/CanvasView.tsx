import { useEffect, useRef } from "react";
import type { SceneObject } from "../types/SceneObject";
import { CANVAS_HEIGHT, CANVAS_WIDTH, render } from "../canvas/drawEngine";

type CanvasViewProps = {
  scene: SceneObject[];
};

export function CanvasView({ scene }: CanvasViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    render(ctx, scene);
  }, [scene]);

  // Logical pixel space is fixed at 800x600; CSS scales it to fit the viewport.
  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="block w-full rounded-lg border border-gray-300 bg-white shadow-sm"
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
    />
  );
}
