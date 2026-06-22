import type { SceneObject } from "../types/SceneObject";
import { validateCommands, type ValidationError } from "./validateCommands";
import { normalizeCommands } from "./normalizeCommands";

// Single entry point for the normalization pipeline (CLAUDE.md):
//   raw → JSON.parse → Zod validate → normalize → SceneObject[]
// No throwing — every failure is returned as a value.

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// The pipeline can only fail at validation; normalization is total.
export type PipelineError = ValidationError;

/**
 * Run the full pipeline on a backend response.
 *
 * @param raw A JSON string or already-parsed value holding the DrawCommand[].
 */
export function runPipeline(raw: unknown): Result<SceneObject[], PipelineError> {
  const validated = validateCommands(raw);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const scene = normalizeCommands(validated.commands);
  return { ok: true, value: scene };
}

// Turn a PipelineError into a single human-readable line for the UI.
export function describePipelineError(error: PipelineError): string {
  if (error.kind === "invalid_json") {
    return `The drawing service returned invalid JSON: ${error.message}`;
  }
  return error.message;
}

export type { ValidationError, FieldIssue } from "./validateCommands";
export { validateCommands } from "./validateCommands";
export { normalizeCommands } from "./normalizeCommands";
