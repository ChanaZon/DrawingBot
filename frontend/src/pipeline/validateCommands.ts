import { z } from "zod";
import {
  DrawCommandArraySchema,
  type DrawCommand,
} from "../types/DrawCommand";

// Pipeline steps 1–2: parse raw text/JSON, then validate against the Zod schema.
// All failures are returned as values — nothing here throws.

export type FieldIssue = {
  path: string; // e.g. "[0].r" — dotted/bracketed path to the bad field
  message: string;
};

export type ValidationError =
  | { kind: "invalid_json"; message: string }
  | { kind: "schema"; message: string; issues: FieldIssue[] };

export type ValidationResult =
  | { ok: true; commands: DrawCommand[] }
  | { ok: false; error: ValidationError };

// Render a Zod path array into a readable string: ["0","r"] → "[0].r".
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

/**
 * Validate a backend response into a typed DrawCommand[].
 *
 * @param raw Either a JSON string (will be parsed) or an already-parsed value
 *            (e.g. when the backend client hands us a decoded body).
 */
export function validateCommands(raw: unknown): ValidationResult {
  let data: unknown = raw;

  // Step 1: parse if we were handed a string.
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: { kind: "invalid_json", message },
      };
    }
  }

  // Step 2: strict Zod validation.
  const result = DrawCommandArraySchema.safeParse(data);
  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    }));
    return {
      ok: false,
      error: {
        kind: "schema",
        message: z.prettifyError(result.error),
        issues,
      },
    };
  }

  return { ok: true, commands: result.data };
}
