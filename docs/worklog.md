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
