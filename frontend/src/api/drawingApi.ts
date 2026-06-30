import axios, { type AxiosError } from "axios";
import type { DrawCommand } from "../types/DrawCommand";
import { http } from "./http";

// HTTP client for the ASP.NET backend. The frontend never holds an LLM API key
// (CLAUDE.md > Security): prompts go to POST /api/draw/parse and the server
// returns a validated DrawCommand[]. The raw command array is returned here as
// `unknown` so the Zod pipeline (runPipeline) remains the single validation gate.
//
// The shared `http` instance (api/http.ts) attaches the JWT bearer token, so the
// now-protected parse/edit routes are authenticated automatically.

// Backend success body for POST /api/draw/parse in CREATE mode: { commands: DrawCommand[] }.
type ParseResponseBody = { commands: unknown };

// Success body in EDIT mode: shapes to append + indices to remove. Returned raw
// (unvalidated) so runEditPipeline stays the single validation gate.
type ParseEditResponseBody = { add: unknown; remove: unknown };

// Backend error body (see DrawController.MapError): always carries `error`, plus
// one of `message` / `raw` / `errors` depending on the failure.
type ApiErrorBody = {
  error?: string;
  message?: string;
  raw?: string;
  // Field-level failures sent with `validation_failed` (DrawController.MapError).
  // Included for contract fidelity; the mapper returns a fixed line for that code.
  errors?: unknown;
};

// A drawing-API failure with a message already phrased for the user. Thrown by
// parsePrompt so callers can surface `.message` directly via setError().
export class DrawingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawingApiError";
  }
}

// Send a prompt to the backend and return the raw DrawCommand[] (unvalidated
// here on purpose — the caller feeds it to runPipeline). Throws DrawingApiError
// with a user-facing message on any failure.
export async function parsePrompt(prompt: string): Promise<unknown> {
  try {
    const { data } = await http.post<ParseResponseBody>("/api/draw/parse", {
      prompt,
    });
    return data.commands;
  } catch (err) {
    throw new DrawingApiError(toFriendlyMessage(err));
  }
}

// EDIT mode: send the prompt together with the current drawing (as DrawCommand[])
// so the backend asks the LLM only for changes. Returns the raw { add, remove }
// for runEditPipeline to validate. Throws DrawingApiError on failure.
export async function requestEdit(
  prompt: string,
  currentCommands: DrawCommand[],
): Promise<ParseEditResponseBody> {
  try {
    const { data } = await http.post<ParseEditResponseBody>("/api/draw/parse", {
      prompt,
      currentCommands,
    });
    return { add: data.add, remove: data.remove };
  } catch (err) {
    throw new DrawingApiError(toFriendlyMessage(err));
  }
}

// Translate any thrown error from the parse call into a single user-facing line.
// Exported (and pure) so it can be unit-tested without a live backend.
export function toFriendlyMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return "Something went wrong while reaching the drawing service.";
  }

  const axiosErr = err as AxiosError<ApiErrorBody>;

  // No response → request never completed (server down, CORS, network).
  if (!axiosErr.response) {
    return "Could not reach the drawing service. Is the backend running?";
  }

  // The protected route rejected our token. The shared 401 interceptor already
  // routes back to login; this is just the message shown in the meantime.
  if (axiosErr.response.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  const body = axiosErr.response.data;
  switch (body?.error) {
    case "empty_prompt":
      return "Please enter a drawing prompt.";
    case "llm_unavailable":
      return "The drawing service is temporarily unavailable. Please try again in a moment.";
    case "invalid_llm_response":
      return "The drawing service returned an unexpected response. Try rephrasing your prompt.";
    case "too_many_commands":
      return "That prompt produced too many shapes. Try something a bit simpler.";
    case "validation_failed":
      return "The drawing service returned invalid drawing data. Try rephrasing your prompt.";
    default:
      return body?.message ?? "The drawing service returned an error.";
  }
}
