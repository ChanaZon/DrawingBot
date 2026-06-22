import { describe, it, expect } from "vitest";
import { validateCommands } from "./validateCommands";

describe("validateCommands", () => {
  it("accepts a valid command array (already-parsed value)", () => {
    const result = validateCommands([
      { type: "background", color: "#fff" },
      { type: "circle", cx: 10, cy: 20, r: 5 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].type).toBe("background");
    }
  });

  it("parses a JSON string before validating", () => {
    const result = validateCommands('[{"type":"clear"}]');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commands[0].type).toBe("clear");
  });

  it("reports invalid_json for a malformed JSON string", () => {
    const result = validateCommands("{ not json ]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid_json");
  });

  it("rejects an unknown command type with a schema error", () => {
    const result = validateCommands([{ type: "spaceship", x: 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema");
  });

  it("rejects a circle with non-positive radius and points at the field", () => {
    const result = validateCommands([{ type: "circle", cx: 1, cy: 1, r: 0 }]);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "schema") {
      expect(result.error.issues.some((i) => i.path === "[0].r")).toBe(true);
    }
  });

  it("rejects an invalid CSS color", () => {
    const result = validateCommands([
      { type: "background", color: "not a color!!" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "schema") {
      expect(result.error.issues.some((i) => i.path === "[0].color")).toBe(true);
    }
  });

  it("rejects an empty array (min 1)", () => {
    const result = validateCommands([]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-array payload", () => {
    const result = validateCommands({ type: "circle" });
    expect(result.ok).toBe(false);
  });

  it("rejects a polygon with fewer than 3 points", () => {
    const result = validateCommands([
      { type: "polygon", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ]);
    expect(result.ok).toBe(false);
  });
});
