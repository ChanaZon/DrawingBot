# Save / Load + Auth (Phase 6)

Status: implemented (2026-06-29). Frontend only — the `/api/drawings` CRUD and
`/api/auth` controllers shipped in Phase 5.

## Goal

Close the full round-trip: sign in, draw, **save** a drawing (with a thumbnail),
and **load** / **delete** it later. Because `/api/draw/parse` became `[Authorize]`
in Phase 5, the client cannot draw at all without a token, so auth gating is part
of this phase too.

## Auth flow

- `api/http.ts` is the one axios instance every call shares. A request interceptor
  attaches `Authorization: Bearer <token>`; the token lives in `localStorage`
  (key `drawing-bot-token`) so the session survives reloads. The only secret the
  client ever holds is the user's own JWT — never an LLM/API key (CLAUDE.md > Security).
- A single response interceptor catches **401**, clears the token, and fires an
  `onUnauthorized` callback. `App` wires that to flip the store back to the login
  screen, so an expired token routes to `AuthForm` instead of looping failed calls.
- `AuthForm` (register/login) gates the whole app: when `isAuthenticated` is false,
  nothing else renders. On success `authApi` persists the token and the form
  dispatches `setAuthenticated(true)`.

## Persistence shape — reuse the Layer-1 pipeline

The DB stores one normalized row per command as `{ kind, params }` (an opaque field
bag the backend keeps verbatim — `DrawingDtos.cs`). The frontend persists commands
in the **same `DrawCommand` shape the LLM emits**:

```
save:  SceneObject[] --denormalizeScene--> DrawCommand[] --split--> { kind: type, params: rest }
load:  { kind, params } --rebuild--> { type: kind, ...params } --runPipeline--> SceneObject[]
```

`pipeline/savedDrawing.ts` owns both directions. The key property: **loading routes
through the same `runPipeline` (Zod validate + normalize) as an LLM response**, so a
saved drawing is re-validated before it ever touches the canvas. A corrupt/stale row
yields a `PipelineError` (shown to the user), never a thrown render. This reuses the
already-tested denormalize/normalize codec instead of inventing a second one.

`clear` never exists as a SceneObject, so it can never be persisted; every stored
`kind` is one of the nine renderable kinds.

## Save / load / delete

- `SaveBar` builds the request (prompt + optional title + off-screen PNG thumbnail +
  commands) and calls `saveDrawing` (POST) when the canvas is unlinked, or
  `updateDrawing` (PUT) when it is linked to a row. The thumbnail/command conversion
  runs **before** the network `try` so a preview hiccup can't be reported as a save
  failure (`utils/thumbnail.ts` is self-guarding and returns `null` rather than throwing).
- `DrawingList` lists the user's drawings (thumbnail + title/prompt), and Loads or
  Deletes them. It is wrapped in an `ErrorBoundary` (CLAUDE.md). The parent bumps a
  `reloadToken` after a save so the gallery refreshes.

## Store additions

- `lastPrompt` — the prompt that produced the current scene. The live `prompt` input
  is cleared after a draw, so Save reads `lastPrompt` for the required `Prompt` field.
  Set on create/edit and on load; edits accumulate (`"a | b"`, capped at the 2000-char
  DB column).
- `title` — optional, bound to the SaveBar input; populated when a drawing is loaded.
- `currentDrawingId` — the linked row (null = unsaved → Save creates; number → Update).
- `clear` now **detaches**: it resets `currentDrawingId` / `lastPrompt` / `title` so the
  next drawing is saved as a new row rather than overwriting the previous one.

## Files

New: `api/http.ts`, `api/authApi.ts`, `api/drawingsApi.ts`,
`pipeline/savedDrawing.ts` (+ `.test.ts`), `utils/thumbnail.ts`,
`components/AuthForm.tsx`, `components/SaveBar.tsx`, `components/DrawingList.tsx`.

Modified: `api/drawingApi.ts` (shared client + 401 message),
`store/drawingSlice.ts` (`lastPrompt`/`title` + `clear` detach),
`components/PromptBar.tsx` (record `lastPrompt`), `App.tsx` (auth gate + layout).

## Edge cases / guards

- **Empty canvas** → Save disabled; `savedCommandsToScene([])` is rejected by the
  pipeline (a drawing needs ≥ 1 command).
- **Malformed / stale stored command** (bad `r`, unknown `kind`) → `PipelineError`
  surfaced in the UI; the canvas never renders unvalidated data and never throws.
- **Expired token (401)** on any call → token dropped, back to login.
- **Thumbnail unavailable** (no 2D context / tainted canvas) → `null`, drawing still
  saves without a preview.
- **Round-trip lossiness** (pre-existing, documented): a text command with a custom
  non-`px` font cannot recover a `size` that the one-string `font` model never stored;
  `opacity != 1` is not persisted (no Layer-1 field). Neither is reachable today —
  flagged for if/when those become user-controllable.

## Test results (2026-06-29)

- Frontend `npx vitest run` → **67 passed, 0 failed** (8 files; new `savedDrawing.test.ts`
  covers round-trip fidelity + the edge cases above).
- Frontend `tsc --noEmit` clean; `npm run build` clean (180 modules).
- Backend `dotnet test` → **25 passed** (unchanged — no backend edits this phase).

## Review (project agents, run on the diff)

- `drawing-bot-reviewer` → **APPROVE** (no blockers). Applied: isolate thumbnail build
  from the save `try`; document the `loadScene` ↔ caller coupling. Latent warnings
  (opacity round-trip) noted above, not defects in this change.
- `schema-parity-checker` → **IN SYNC**. All 10 command types field- and
  constraint-consistent across Zod / FluentValidation / SceneObject; the persistence
  round-trip is field-complete and `clear` is correctly excluded from scenes.
