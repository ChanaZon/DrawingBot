---
name: add-draw-command
description: >-
  Add a new drawing command type (a new shape like "star", "heart", "grid") to
  Drawing Bot across every layer at once. Use when the user wants to add, support,
  or implement a new shape / command / primitive that the LLM can emit and the
  canvas can render. Triggers: "add a star command", "support drawing hearts",
  "new shape type", "add a primitive". Ensures no layer is forgotten.
---

# Add a Draw Command

Adding one shape touches **six layers**. Skipping one causes silent failures:
a shape the LLM emits but the canvas ignores, a 422 from the backend, or a type
error. Do all six, in this order, then run the tests.

Use the existing `circle` command as the reference implementation to mirror —
read how it is defined in each file before adding the new one.

## Inputs to settle first

Ask the user (or infer from the request) before editing:
- **type name** (lowercase, e.g. `star`) — the discriminant value.
- **fields** the LLM emits (names, numeric vs string, which are optional colors).
- **defaults** for optional fields (fill, stroke, strokeWidth, opacity).
- **render math** — how the canvas draws it from those fields.

## The six layers (edit in order)

### 1. Zod schema — `frontend/src/types/DrawCommand.ts`
Add a member to `DrawCommandSchema`'s discriminated union:
`z.object({ type: z.literal("<name>"), ...fields })`. Use `ColorField` for color
fields, `.positive()` for radii/sizes, `.optional()` for optional fields. Mirror
`circle`.

### 2. Scene object — `frontend/src/types/SceneObject.ts`
Add a union arm: `SceneObjectBase & { kind: "<name>"; ...resolved fields }`.
Optional Zod fields become **required** here (they get defaults during
normalization). Apply known transforms (e.g. flatten `x1..y3` into `points`).

### 3. Normalizer — `frontend/src/pipeline/normalizeCommands.ts`
Add a `case "<name>":` that maps the `DrawCommand` to a `SceneObject`: assign
`id` (nanoid), `zIndex`, `opacity = 1`, and fill every optional field with its
default (`fill → "transparent"`, `stroke → "black"`, etc.). No field may be left
`undefined`.

### 4. Renderer — `frontend/src/canvas/drawEngine.ts`
Add a `case "<name>":` in the render switch. **Guard every numeric input with
`isFinite` and skip+log on bad geometry — never let the canvas throw.** Wrap in
`ctx.save()/restore()` and honor `globalAlpha = opacity`. Convert degrees→radians
for any angle.

### 5. Backend validation — `backend/Validators/DrawCommandValidator.cs`
Add FluentValidation rules for the new `type`: allowed `kind`, numeric ranges
matching the Zod constraints (e.g. positive radius), required-field checks.
Constraints must agree with layer 1 — mismatched constraints cause 422s.

### 6. LLM system prompt — `backend/Services/LlmService.cs`
Add a one-line JSON example of the new command to the system prompt's command
catalog, using the exact field names from layer 1. Without this the LLM will
never emit the shape.

## Tests — `frontend/src/`
- `pipeline/normalizeCommands.test.ts` — new type gets correct defaults and id.
- `canvas/drawEngine.test.ts` — renderer does not throw on `NaN`/`Infinity` and
  issues the expected ctx calls.
Add cases mirroring the existing `circle` tests.

## Finish
1. `cd frontend && npx vitest run` — all green, zero TS errors (`npm run build`).
2. Confirm parity across layers 1/2/5 (or invoke the `schema-parity-checker`
   agent).
3. Summarize to the user which files changed and the new command's JSON shape.

> Language Policy: all identifiers, strings, and the prompt example must be in
> English. Hebrew only in inline code comments.
