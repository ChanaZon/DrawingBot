import type { SceneObject } from "../types/SceneObject";
import type { SavedCommandDto } from "../api/drawingsApi";
import { denormalizeScene } from "./denormalizeCommands";
import { runPipeline, type PipelineError, type Result } from "./index";

// Persistence round-trip for saved drawings (Phase 6).
//
// The DB stores one normalized row per command as { kind, params } (DrawingDtos.cs).
// We persist commands in the same Layer-1 DrawCommand shape the LLM emits: kind =
// the command's `type`, params = its remaining fields. Loading therefore goes back
// through the SAME Zod+normalize pipeline as an LLM response, so a saved drawing is
// re-validated before it ever touches the canvas (CLAUDE.md: never render unvalidated
// data) and we reuse one tested conversion instead of a second SceneObject codec.

// scene → wire commands. Uses denormalizeScene (SceneObject → DrawCommand, 1:1 and
// order-preserving), then splits each command's discriminator out as `kind`.
export function sceneToSavedCommands(scene: SceneObject[]): SavedCommandDto[] {
  return denormalizeScene(scene).map((command) => {
    const { type, ...params } = command;
    return { kind: type, params };
  });
}

// wire commands → scene. Rebuilds each DrawCommand ({ type: kind, ...params }) and
// runs the full validation pipeline. Returns a PipelineError (never throws) when a
// stored row is malformed or the persisted schema is stale, so the caller can show
// an error instead of crashing the canvas.
export function savedCommandsToScene(
  commands: SavedCommandDto[],
): Result<SceneObject[], PipelineError> {
  const rawCommands = commands.map((c) => ({ type: c.kind, ...c.params }));
  return runPipeline(rawCommands);
}
