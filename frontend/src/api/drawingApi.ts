import axios, { type AxiosError } from "axios";

// HTTP client for the ASP.NET backend. The frontend never holds an LLM API key
// (CLAUDE.md > Security): prompts go to POST /api/draw/parse and the server
// returns a validated DrawCommand[]. The raw command array is returned here as
// `unknown` so the Zod pipeline (runPipeline) remains the single validation gate.

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

const http = axios.create({ baseURL });

// Backend success body for POST /api/draw/parse: { commands: DrawCommand[] }.
type ParseResponseBody = { commands: unknown };

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
