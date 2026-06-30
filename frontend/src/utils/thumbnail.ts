import type { SceneObject } from "../types/SceneObject";
import { CANVAS_HEIGHT, CANVAS_WIDTH, render } from "../canvas/drawEngine";

// Generate a small PNG data URL preview of a scene for the saved-drawing gallery.
//
// Rendered on a throwaway offscreen canvas (not the live one) so saving never
// disturbs what the user sees, then downscaled to keep the base64 payload small
// — it is persisted in Drawings.ThumbnailB64 and shipped in the list response.

// Logical canvas is 800x600; the thumbnail keeps that aspect ratio.
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * CANVAS_HEIGHT) / CANVAS_WIDTH); // 240

// Returns a `data:image/png;base64,...` string, or null if a 2D context is
// unavailable (e.g. jsdom in tests) — callers persist a thumbnail only when present.
export function renderThumbnail(scene: SceneObject[]): string | null {
  const full = document.createElement("canvas");
  full.width = CANVAS_WIDTH;
  full.height = CANVAS_HEIGHT;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return null;
  render(fullCtx, scene);

  // Downscale into the thumbnail canvas in one drawImage pass.
  const thumb = document.createElement("canvas");
  thumb.width = THUMB_WIDTH;
  thumb.height = THUMB_HEIGHT;
  const thumbCtx = thumb.getContext("2d");
  if (!thumbCtx) return null;
  thumbCtx.drawImage(full, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  try {
    return thumb.toDataURL("image/png");
  } catch {
    // toDataURL can throw on a tainted canvas; a missing thumbnail is non-fatal.
    return null;
  }
}
