---
name: add-crud-endpoint
description: >-
  Add a new backend API endpoint to Drawing Bot following the project's
  Controller + Service + Validator + DI-registration pattern with JWT auth and
  ownership checks. Use when the user wants to add, create, or implement a new
  backend route / API endpoint / controller action (e.g. "add an endpoint to
  rename a drawing", "add a /api/drawings/{id}/duplicate route"). Relevant from
  Phase 5 onward.
---

# Add a CRUD Endpoint

Every endpoint in Drawing Bot follows the same layered pattern. Mirror an
existing action in `DrawingsController.cs` / `DrawingService.cs` as the
reference. Do all five steps so auth, validation, and ownership are never missed.

## Inputs to settle first
- **Route + verb** (e.g. `PUT /api/drawings/{id}/title`).
- **Request/response DTO** shape.
- **Auth**: from Phase 5 every `/api/drawings` and `/api/draw` route is
  `[Authorize]`. Only `/api/auth/register|login` are anonymous.
- **Ownership**: does it operate on a user-owned `Drawing`? If so it must scope
  by the current user.

## The five layers (edit in order)

### 1. DTOs / models — `backend/Models/`
Add request/response records. For drawing data, reuse the normalized shape:
`Drawing` + child `DrawingCommand` rows (`SortOrder`, `Kind`, `ParamsJson`) —
never a single CommandsJson blob.

### 2. Validator — `backend/Validators/`
Add a FluentValidation validator for the request DTO (string lengths, required
fields, ranges). Register it so the controller rejects bad input with 422 and
field-level errors before touching the service.

### 3. Service — `backend/Services/DrawingService.cs`
Add the data-access method. **Every read/update/delete of a user-owned entity
must filter by `userId`** — load with `.Where(d => d.Id == id && d.UserId ==
userId)` and return not-found (not forbidden detail) when it does not match.
Use EF Core; respect cascade delete on `DrawingCommands`.

### 4. Controller — `backend/Controllers/DrawingsController.cs`
Add the action with the correct `[HttpGet/Post/Put/Delete]` + route, `[Authorize]`,
and resolve the caller:
`var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);`
Pass `userId` into the service. Return `200/201/204` on success, `404` when the
service reports no owned match, `422` on validation failure. Never return another
user's data.

### 5. DI registration — `backend/Program.cs`
Register any new service/validator if not already covered by assembly scanning.
Confirm the route is inside CORS policy for the frontend origin and behind the
JWT middleware.

## Finish
1. `cd backend && dotnet build` — no errors.
2. If models changed: `dotnet ef migrations add <Name> && dotnet ef database update`.
3. Verify via Swagger: unauthenticated call → 401; authenticated call as a
   non-owner on someone else's `id` → 404; happy path → expected status.
4. Update the API Endpoints table in `.claude/CLAUDE.md` and `.claude/PLAN.md`.

> Language Policy: all routes, identifiers, messages, and DTO names in English.
> Hebrew only in inline code comments.
> API Key Security: never read or log the LLM key in any new endpoint.
