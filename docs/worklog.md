# Work Log

A running, dated log of work steps. For each step record **what** was done, **why**, and the
**verification result** (which checks ran and whether they passed, including edge cases checked).
Keep entries concise. See the "Frequent Verification & Step Logging" convention in `.claude/CLAUDE.md`.

---

## 2026-06-29

- **What:** Added a standing "Frequent Verification & Step Logging" convention to `.claude/CLAUDE.md`
  and created this work log.
- **Why:** Ensure every session verifies work frequently (including edge cases) and documents each
  step, without having to repeat the instruction in each message.
- **Verification:** Docs-only change — no build/test impact. Confirmed `.claude/CLAUDE.md` still
  follows the English-only language policy and the new section sits alongside the other Working
  Conventions.

- **What:** Added conversational **EDIT mode** to `POST /api/draw/parse`. When the request carries
  `CurrentCommands`, the backend asks the LLM only for `{ add, remove }` changes (new `EditSystemPrompt`,
  `GenerateEditJsonAsync`, `ParseEditAsync`, `ParseEditResponse`, `DrawEdit`) instead of a full redraw;
  the frontend denormalizes the scene back to `DrawCommand[]` (`denormalizeCommands.ts`), sends it
  (`requestEdit`), validates the response (`runEditPipeline`), and applies it as a Redux delta
  (`applyDelta`) so kept shapes never drift. `PromptBar` switches between create/edit by scene emptiness.
- **Why:** Lets users iteratively refine a drawing ("add a boat", "remove the sun") without losing
  existing shapes — the project's hard preservation guarantee.
- **Review fixes applied (from `drawing-bot-reviewer` + `schema-parity-checker`):**
  - Backend now validates `CurrentCommands` (count cap + per-command FluentValidation) before
    serializing it into the LLM prompt — closes an unvalidated client-input passthrough.
  - `denormalizeCommands` now splits the SceneObject's combined CSS `font` string back into the
    two-field `{ size, font }` shape, fixing silent loss of text sizing on an edit round-trip.
- **Verification:** Frontend `vitest run` 60/60 passed (incl. new `applyEdit` + `denormalize` edge
  cases: out-of-range remove index, duplicate index dedupe, pure-add/pure-remove, rejected
  background/clear in `add`, malformed response shape, text size/custom-font round-trip);
  `tsc --noEmit` clean. Backend `dotnet test` 25/25 passed (incl. new guard: invalid
  `currentCommands` → 422 without calling the LLM; out-of-range remove, added background, invalid
  color all → 422). Both project review agents run on the diff and their findings addressed.

- **What:** Implemented **Phase 6 — Save/Load UI + Auth gating** (frontend only; the backend
  CRUD/Auth controllers already shipped in Phase 5). Added a shared authenticated HTTP client
  (`api/http.ts`: JWT in localStorage, request interceptor attaching `Authorization: Bearer`, a
  single 401 interceptor that drops the token and routes back to login); `api/authApi.ts`
  (register/login, persists token); `api/drawingsApi.ts` (save/update/list/get/delete). Drawings
  persist in the Layer-1 command shape: `pipeline/savedDrawing.ts` converts scene → `{ kind, params }`
  via `denormalizeScene` on save and reloads through the **same** `runPipeline` (Zod + normalize),
  so a loaded drawing is re-validated before it touches the canvas. New UI: `AuthForm` (gates the
  whole app), `SaveBar` (title + Save/Update with an off-screen PNG thumbnail), `DrawingList`
  (gallery with Load/Delete, wrapped in an `ErrorBoundary`). Store gained `lastPrompt` + `title`
  (so Save can persist the originating prompt after the input clears) and `clear` now detaches from
  the loaded drawing (`currentDrawingId`/`lastPrompt`/`title` reset). `drawingApi.ts` now uses the
  shared client so the now-protected `/api/draw/parse` is authenticated.
- **Why:** Completes the full round-trip (CLAUDE.md Phase 6): sign in, draw, save with a thumbnail,
  and load/delete saved drawings. Auth gating was also load-bearing — `/api/draw/parse` became
  `[Authorize]` in Phase 5, so the client could not draw at all without sending a token.
- **Review fixes applied (from `drawing-bot-reviewer`):** moved thumbnail/command building out of
  the save `try` so a preview hiccup can't be reported as a network save failure; documented the
  `loadScene` ↔ caller coupling for the saved-drawing linkage. `schema-parity-checker` → IN SYNC
  (no drift; persistence round-trip field-complete for all 10 kinds, `clear` correctly excluded
  from scenes).
- **Verification:** Frontend `vitest run` **67/67** passed (new `savedDrawing.test.ts`: round-trip
  fidelity incl. text sizing + triangle/ellipse geometry, plus edge cases — empty list rejected,
  malformed `r`, unknown stored `kind`); `tsc --noEmit` clean; `npm run build` clean (180 modules).
  Backend `dotnet test` **25/25** (unchanged — no backend edits; pre-existing NU1903 SQLitePCLRaw
  advisory unrelated). Both review agents run on the diff and their findings addressed.
