# Conversational (Incremental) Canvas Editing

Status: implemented (2026-06-29).

## Goal

Make the prompt interface **iterative**: after a first drawing exists, the user can
type follow-up requests like *"add a boat"* or *"remove the sun"* and the canvas is
edited in place.

## Hard constraint (from the user)

> Existing details already on the canvas must **not** change when adding or removing
> things.

This rules out the naive "re-emit the whole drawing" approach, whose known failure
mode is the LLM subtly redrawing existing shapes. Instead:

- The backend **does** send the current drawing to the LLM as context.
- The LLM returns only **additions + removals**, never a regenerated full scene.
- The frontend keeps the existing `SceneObject`s **byte-for-byte** and only appends
  new objects / drops removed ones. Existing objects are never recreated from LLM
  output, so they cannot drift.

## Two modes of `POST /api/draw/parse`

The endpoint stays a single route; the request decides the mode.

### Create mode — empty canvas (unchanged behaviour)

Request:
```json
{ "prompt": "draw a sunset over the sea" }
```
Response:
```json
{ "commands": [ { "type": "background", ... }, ... ] }
```
Frontend runs the existing pipeline and dispatches `replaceScene`.

### Edit mode — canvas already has objects

Request (the current scene is denormalized back to `DrawCommand[]`; array index =
the object's position in the scene):
```json
{
  "prompt": "add a boat and remove the sun",
  "currentCommands": [ { "type": "background", ... }, { "type": "circle", ... } ]
}
```
Response:
```json
{
  "add":    [ { "type": "polygon", ... } ],
  "remove": [ 1 ]
}
```
- `add` — new `DrawCommand[]` (validated exactly like create-mode commands).
- `remove` — indices into `currentCommands` to delete. Validated to be in range.

Frontend builds a `SceneDelta { added: normalize(add), removed: ids of scene[remove] }`
and dispatches `applyDelta` — one undoable step, existing objects preserved.

## Why index-based removal (not id echo)

The LLM never sees or echoes our internal `nanoid` ids. It only references the
positional index of each command we showed it. Mapping `index -> scene[index].id`
happens on the frontend, where ordering is guaranteed 1:1 (every `SceneObject`
denormalizes to exactly one `DrawCommand`, in order). Worst case of an LLM index
mistake is keeping/dropping the wrong shape — never corrupting geometry.

## Files changed

Backend:
- `Dtos/ParseDtos.cs` — `ParsePromptRequest.CurrentCommands`, new `ParseEditResponse`.
- `Services/LlmService.cs` — `GenerateEditJsonAsync` + shared HTTP core; edit system prompt.
- `Services/DrawParsingService.cs` — `ParseEditAsync` (validate add + remove indices).
- `Services/DrawEdit.cs` — edit result record.
- `Controllers/DrawController.cs` — branch create vs edit; map edit errors.

Frontend:
- `pipeline/normalizeCommands.ts` — optional `startZIndex` so added objects paint on top.
- `pipeline/denormalizeCommands.ts` — `SceneObject[] -> DrawCommand[]` (new).
- `pipeline/applyEdit.ts` — `runEditPipeline(raw, currentScene) -> SceneDelta` (new).
- `api/drawingApi.ts` — `requestEdit(prompt, currentCommands)`.
- `components/PromptBar.tsx` — empty scene -> create; otherwise edit.

## Edge cases / guards

- **`background` / `clear` in an edit's `add` is rejected** (both backend
  `DrawParsingService.ParseEditAsync` and frontend `applyEdit.runEditPipeline`),
  and the edit system prompt tells the LLM not to emit them. Rationale: a `clear`
  cannot be expressed as an appended object, and an appended background would paint
  *on top of* the existing drawing (highest zIndex) — both break the preservation
  guarantee. Full-canvas resets go through CREATE or the Clear toolbar action.
- **No-op edit** (`add: []`, `remove: []`) → backend returns `invalid_llm_response`.
- **Out-of-range remove index** → 422 (backend) / validation error (frontend).
- **Invalid `currentCommands`** (client-supplied) → backend validates it (count cap +
  per-command FluentValidation) **before** serializing it into the LLM prompt, and
  returns 422 without calling the LLM. Prevents a stale/malicious client from
  injecting arbitrary JSON into the model context or defeating the remove bounds check.
- Added shapes get `zIndex = maxExistingZIndex + 1`, so they paint on top.

## Tests

- Backend: `backend.Tests/DrawEndpointTests.cs` — fake `ILlmService`
  (`backend.Tests/FakeLlmService.cs`, wired in `CustomWebAppFactory`). Covers
  401-without-token, create response, edit add+remove, out-of-range remove -> 422,
  invalid `currentCommands` -> 422 (without calling the LLM), added-background -> 422,
  invalid added color -> 422.
- Frontend: `pipeline/denormalizeCommands.test.ts` (8), `pipeline/applyEdit.test.ts`
  (10) — add/remove delta, top zIndex, pure-add, pure-remove, dedupe, out-of-range,
  bad command, malformed shape, background/clear rejection, text size/font round-trip.

## Test results (2026-06-29)

- Backend: `dotnet test backend.Tests` → **25 passed, 0 failed**.
- Frontend: `npx vitest run` → **60 passed, 0 failed** (7 files).
- Frontend typecheck (`tsc --noEmit`) → clean.
- (Pre-existing `NU1903` SQLitePCLRaw advisory warning is unrelated to this change.)

## Review (project agents, run on the diff)

- `schema-parity-checker` → found one drift: the `text` round-trip dropped `size`
  (the SceneObject stores a combined CSS `font` string). **Fixed**:
  `denormalizeCommands` now splits the font string back into the two-field
  `{ size, font }` shape the Zod schema and LLM prompt expect. Otherwise the
  normalize/denormalize round-trip is field-complete for all 10 kinds; edit `add`
  validation matches the create path; Zod / FluentValidation / SceneObject stay
  mutually consistent.
- `drawing-bot-reviewer` → **APPROVE WITH FIXES** (no blockers). Applied fixes:
  reject `background`/`clear` in edit `add` (the one real hole); validate client-supplied
  `currentCommands` before it reaches the LLM; omit `strokeWidth`/`rx` noise in
  denormalize when there is no stroke; clear the prompt after a successful create for
  parity with edit; report the offending position (not value) in the out-of-range error path.
