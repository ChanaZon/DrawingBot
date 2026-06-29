import { z } from "zod";
import { DrawCommandSchema } from "../types/DrawCommand";
import type { SceneDelta, SceneObject } from "../types/SceneObject";
import { normalizeCommands } from "./normalizeCommands";
import type { FieldIssue, ValidationError } from "./validateCommands";
import type { Result } from "./index";

// EDIT-mode pipeline: turn the backend's { add, remove } response into a
// SceneDelta against the current scene — WITHOUT recreating existing objects, so
// shapes that are kept never drift (the project's hard constraint).
//
//   add    → validated + normalized into new SceneObjects (painted on top)
//   remove → indices into the current scene, mapped back to object ids
//
// Like the create pipeline (index.ts), this never throws: every failure is a value.

// The LLM response shape. Both fields default to empty so a pure-add or
// pure-remove edit is valid. `remove` holds indices into the current scene.
const EditResponseSchema = z.object({
  add: z.array(DrawCommandSchema).max(200).optional().default([]),
  remove: z.array(z.number().int().nonnegative()).optional().default([]),
});

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment}]`;
    } else {
      out += out.length === 0 ? String(segment) : `.${String(segment)}`;
    }
  }
  return out;
}

function schemaError(error: z.ZodError): ValidationError {
  const issues: FieldIssue[] = error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
  return { kind: "schema", message: z.prettifyError(error), issues };
}

/**
 * Build the delta for an edit response against the current scene.
 *
 * @param raw          The backend's `{ add, remove }` (already-decoded value).
 * @param currentScene The scene the edit applies to. `remove` indices point here.
 */
export function runEditPipeline(
  raw: unknown,
  currentScene: SceneObject[],
): Result<SceneDelta, ValidationError> {
  const parsed = EditResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: schemaError(parsed.error) };
  }

  const { add, remove } = parsed.data;

  // background/clear cannot be added in an edit: a "clear" would only reset the
  // appended objects (normalizeCommands semantics), and an appended background
  // would paint over the existing drawing — both break the preservation guarantee.
  // The backend rejects these too; this is the canvas-side gate (CLAUDE.md: validate
  // every LLM response before touching the canvas).
  const illegal = add
    .map((cmd, i) => ({ type: cmd.type, i }))
    .filter((c) => c.type === "background" || c.type === "clear");
  if (illegal.length > 0) {
    return {
      ok: false,
      error: {
        kind: "schema",
        message: `An edit cannot add a background or clear command (at ${illegal
          .map((c) => `add[${c.i}]`)
          .join(", ")}).`,
        issues: illegal.map((c) => ({
          path: `add[${c.i}].type`,
          message: `'${c.type}' is not allowed in an edit`,
        })),
      },
    };
  }

  // Reject indices that don't point at a real object: applying them would be a
  // silent no-op, masking a stale-client / bad-LLM mismatch.
  const outOfRange = remove
    .map((value, pos) => ({ value, pos }))
    .filter((e) => e.value >= currentScene.length);
  if (outOfRange.length > 0) {
    return {
      ok: false,
      error: {
        kind: "schema",
        message: `Remove index out of range: ${outOfRange
          .map((e) => e.value)
          .join(", ")} (scene has ${currentScene.length} objects).`,
        issues: outOfRange.map((e) => ({
          path: `remove[${e.pos}]`,
          message: "index out of range",
        })),
      },
    };
  }

  // New objects paint on top of everything currently on the canvas.
  const maxZ = currentScene.reduce((m, o) => Math.max(m, o.zIndex), -1);
  const added = normalizeCommands(add, maxZ + 1);

  // Dedupe: an id mapped from a repeated index must appear once in the delta.
  const removed = [...new Set(remove.map((i) => currentScene[i].id))];

  return { ok: true, value: { added, removed, changed: [] } };
}
