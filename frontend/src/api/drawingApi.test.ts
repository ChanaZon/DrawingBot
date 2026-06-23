import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { toFriendlyMessage } from "./drawingApi";

// Build an AxiosError carrying a backend error body with the given HTTP status.
function axiosErrorWith(status: number, data: unknown): AxiosError {
  const headers = new AxiosHeaders();
  const err = new AxiosError("request failed", "ERR_BAD_RESPONSE", {
    headers,
  });
  err.response = {
    status,
    statusText: "",
    data,
    headers,
    config: { headers },
  };
  return err;
}

describe("toFriendlyMessage", () => {
  it("maps each known backend error code to a user-facing line", () => {
    const cases: Record<string, RegExp> = {
      empty_prompt: /enter a drawing prompt/i,
      llm_unavailable: /temporarily unavailable/i,
      invalid_llm_response: /unexpected response/i,
      too_many_commands: /too many shapes/i,
      validation_failed: /invalid drawing data/i,
    };

    for (const [code, pattern] of Object.entries(cases)) {
      const msg = toFriendlyMessage(axiosErrorWith(422, { error: code }));
      expect(msg).toMatch(pattern);
    }
  });

  it("falls back to the server message for an unknown error code", () => {
    const msg = toFriendlyMessage(
      axiosErrorWith(500, { error: "unknown", message: "boom" }),
    );
    expect(msg).toBe("boom");
  });

  it("reports a connectivity problem when there is no response", () => {
    const err = new AxiosError("Network Error", "ERR_NETWORK");
    expect(toFriendlyMessage(err)).toMatch(/could not reach/i);
  });

  it("handles non-Axios errors gracefully", () => {
    expect(toFriendlyMessage(new Error("nope"))).toMatch(/something went wrong/i);
  });
});
