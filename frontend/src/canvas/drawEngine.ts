import type { Point, SceneObject } from "../types/SceneObject";

// Logical canvas space is always 800x600 (see CLAUDE.md). CSS scales the element.
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const TRANSPARENT = new Set(["transparent", "none", ""]);

function allFinite(...nums: number[]): boolean {
  return nums.every((n) => Number.isFinite(n));
}

function hasFill(color: string): boolean {
  return !TRANSPARENT.has(color.trim().toLowerCase());
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Pure renderer: draws a scene graph onto a 2D context.
 * Each object is guarded against non-finite geometry — bad commands are
 * logged and skipped, never allowed to throw and break the canvas.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  scene: SceneObject[],
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const ordered = [...scene].sort((a, b) => a.zIndex - b.zIndex);

  for (const obj of ordered) {
    ctx.save();
    ctx.globalAlpha = Number.isFinite(obj.opacity)
      ? Math.max(0, Math.min(1, obj.opacity))
      : 1;
    try {
      drawObject(ctx, obj);
    } catch (err) {
      // Should not happen given the guards, but never let one bad object
      // take down the whole render pass.
      console.warn("drawEngine: skipped object due to render error", obj.id, err);
    }
    ctx.restore();
  }
}

function drawObject(ctx: CanvasRenderingContext2D, obj: SceneObject): void {
  switch (obj.kind) {
    case "background": {
      ctx.fillStyle = obj.color;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      return;
    }

    case "circle": {
      if (!allFinite(obj.cx, obj.cy, obj.r) || obj.r <= 0) return skip(obj);
      ctx.beginPath();
      ctx.arc(obj.cx, obj.cy, obj.r, 0, Math.PI * 2);
      paint(ctx, obj.fill, obj.stroke, obj.strokeWidth);
      return;
    }

    case "rect": {
      if (!allFinite(obj.x, obj.y, obj.w, obj.h, obj.rx)) return skip(obj);
      ctx.beginPath();
      // Clamp the corner radius: roundRect throws a RangeError if rx exceeds
      // half the width or height. Clamping draws a valid rect instead of dropping it.
      const rx = Math.min(Math.max(obj.rx, 0), Math.abs(obj.w) / 2, Math.abs(obj.h) / 2);
      if (rx > 0 && typeof ctx.roundRect === "function") {
        ctx.roundRect(obj.x, obj.y, obj.w, obj.h, rx);
      } else {
        ctx.rect(obj.x, obj.y, obj.w, obj.h);
      }
      paint(ctx, obj.fill, obj.stroke, obj.strokeWidth);
      return;
    }

    case "line": {
      if (!allFinite(obj.x1, obj.y1, obj.x2, obj.y2)) return skip(obj);
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = Number.isFinite(obj.width) && obj.width > 0 ? obj.width : 1;
      ctx.stroke();
      return;
    }

    case "triangle": {
      if (!pointsFinite(obj.points)) return skip(obj);
      tracePolygon(ctx, obj.points);
      paint(ctx, obj.fill, obj.stroke, 1);
      return;
    }

    case "ellipse": {
      if (!allFinite(obj.cx, obj.cy, obj.rx, obj.ry) || obj.rx <= 0 || obj.ry <= 0)
        return skip(obj);
      ctx.beginPath();
      ctx.ellipse(obj.cx, obj.cy, obj.rx, obj.ry, 0, 0, Math.PI * 2);
      paint(ctx, obj.fill, obj.stroke, 1);
      return;
    }

    case "polygon": {
      if (obj.points.length < 3 || !pointsFinite(obj.points)) return skip(obj);
      tracePolygon(ctx, obj.points);
      paint(ctx, obj.fill, obj.stroke, 1);
      return;
    }

    case "text": {
      if (!allFinite(obj.x, obj.y)) return skip(obj);
      ctx.font = obj.font;
      ctx.fillStyle = obj.color;
      ctx.fillText(obj.content, obj.x, obj.y);
      return;
    }

    case "arc": {
      if (!allFinite(obj.cx, obj.cy, obj.r, obj.startAngle, obj.endAngle) || obj.r <= 0)
        return skip(obj);
      ctx.beginPath();
      ctx.arc(obj.cx, obj.cy, obj.r, degToRad(obj.startAngle), degToRad(obj.endAngle));
      ctx.strokeStyle = obj.color;
      ctx.lineWidth = Number.isFinite(obj.width) && obj.width > 0 ? obj.width : 1;
      ctx.stroke();
      return;
    }
  }
}

function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function pointsFinite(points: Point[]): boolean {
  return points.every((p) => allFinite(p.x, p.y));
}

// Fill (if not transparent) then stroke (if not transparent) the current path.
function paint(
  ctx: CanvasRenderingContext2D,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  if (hasFill(fill)) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (hasFill(stroke) && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Number.isFinite(strokeWidth) ? strokeWidth : 1;
    ctx.stroke();
  }
}

function skip(obj: SceneObject): void {
  console.warn("drawEngine: skipped object with non-finite geometry", obj.id, obj.kind);
}
