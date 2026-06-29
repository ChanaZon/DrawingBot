# Drawing Bot — Full Implementation Plan

## Context

The project is a Fullstack interactive web application where the user types a free-form instruction (e.g., "draw a sun over the sea"), the LLM converts it to JSON commands, and a drawing engine renders the result on Canvas. The project is currently empty — only CLAUDE.md exists. All source code needs to be built from scratch.

---

## Current Status

- Project directory: `c:\Users\User\Desktop\drawing bot`
- Exists: `.claude/CLAUDE.md` (full specification) + `.gitignore`
- **Missing: all source code** — no `frontend/`, no `backend/`

---

## Architecture

```
Frontend (React 19 + TS + Vite)     Backend (ASP.NET Core 10)
┌───────────────────────────┐       ┌──────────────────────────┐
│ PromptBar                 │──────▶│ POST /api/draw/parse      │──▶ Gemini
│ CanvasView (800×600)      │◀──────│ GET/POST /api/drawings    │
│ Toolbar (Undo/Redo/Clear) │       │ POST /api/auth/login      │
│ DrawingList               │       │ SQL Server (EF Core)      │
└───────────────────────────┘       └──────────────────────────┘
```

---

## Phase 0 — Scaffolding

**Actions:**

```powershell
# Frontend
cd "c:\Users\User\Desktop\drawing bot"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @reduxjs/toolkit react-redux zod axios nanoid react-hot-toast react-error-boundary
npm install -D tailwindcss @tailwindcss/vite

# Backend
cd "c:\Users\User\Desktop\drawing bot"
dotnet new webapi -n backend
cd backend
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add package FluentValidation.AspNetCore
dotnet add package System.IdentityModel.Tokens.Jwt
dotnet add package BCrypt.Net-Next
dotnet tool install --global dotnet-ef
```

**Config files to create manually:**
- `frontend/.env` → `VITE_API_BASE_URL=http://localhost:5000`
- `backend/appsettings.Development.json` → ConnectionString (SQL Server), Llm — no Auth at this stage
- `vite.config.ts` → add `@tailwindcss/vite` plugin
- `frontend/src/index.css` → `@import "tailwindcss"`

> **⚠️ Gemini API Key — Security:** The key must NEVER be committed to code or Git.
> Options (choose one):
> - `appsettings.Development.json` (kept in gitignore)
> - `dotnet user-secrets set "Llm:ApiKey" "YOUR_KEY"` (User Secrets)
> - Environment variable: `LLM__APIKEY=...` (prod)

---

## Phase 1 — Canvas Engine + Types

**Goal:** Shapes render from hardcoded SceneObject[] in memory. No network, no state.

**Files to create (in order):**

| File | Main content |
|------|-------------|
| `frontend/src/types/DrawCommand.ts` | Zod schema — discriminated union with 10 types (circle, rect, line, triangle, ellipse, polygon, text, arc, background, clear). `ColorField` regex, `DrawCommandArraySchema.min(1).max(200)` |
| `frontend/src/types/SceneObject.ts` | `SceneObjectBase` with `id: string`, `zIndex: number`, `opacity: number`. Union with discriminant `kind`. Also `SceneDelta` and `HistoryEntry` defined here |
| `frontend/src/utils/colorUtils.ts` | `isValidCssColor(s)` and `normalizeCssColor(s, fallback)` |
| `frontend/src/canvas/drawEngine.ts` | `render(ctx, scene)` — sort by zIndex, `ctx.save/restore` + `globalAlpha` per object, guard on `isFinite()`, convert degrees→radians for arc |
| `frontend/src/canvas/hitTest.ts` | Stub only: `return null` |
| `frontend/src/components/ErrorBoundary.tsx` | `export { ErrorBoundary } from "react-error-boundary"` |
| `frontend/src/components/CanvasView.tsx` | `<canvas width={800} height={600}>`, CSS-scaling with `aspectRatio: "800/600"`, `useEffect` calls `render(ctx, scene)` |
| `frontend/src/components/App.tsx` | Phase 1 version: Canvas with hardcoded scene for testing |

**Verification:** `npm run dev` → see canvas with test shapes. `npm run build` with no TypeScript errors.

---

## Phase 2 — Pipeline + Redux State

**Goal:** Raw JSON → validation → normalization → Redux store → render.

**Files to create:**

| File | Main content |
|------|-------------|
| `frontend/src/pipeline/validateCommands.ts` | `validateCommands(raw): ValidationResult` — `DrawCommandArraySchema.safeParse()`, no-throw, returns errors as values |
| `frontend/src/pipeline/normalizeCommands.ts` | `normalizeCommands(commands): SceneObject[]` — adds `id` (nanoid), `zIndex`, `opacity=1`, defaults for every field (fill→"transparent", stroke→"black") |
| `frontend/src/pipeline/index.ts` | `runPipeline(raw): Result<SceneObject[], PipelineError>` — 4 steps with no throws |
| `frontend/src/store/drawingSlice.ts` | Redux Toolkit slice (`createSlice`). **applyDelta**: auto-computes revert, cuts redo stack, updates scene. **undo/redo**: applies delta/revert. **clear**: applyDelta with removed=all IDs |
| `frontend/src/store/index.ts` | `configureStore({ reducer: { drawing: drawingReducer } })`, `RootState`/`AppDispatch` types, typed hooks `useAppSelector`/`useAppDispatch` |
| `frontend/src/components/Toolbar.tsx` | Undo/Redo/Clear buttons with correct disabled states |

**Update existing:** `main.tsx` — wrap `<App />` in `<Provider store={store}>`. `App.tsx` — replace hardcoded scene with `useAppSelector`, add `<Toolbar />` and "Test Pipeline" button.

**Verification:** undo/redo works, pipeline returns error as value on invalid JSON.

---

## Phase 2.5 — Unit Tests (Frontend)

**Goal:** Basic coverage for 3 core components before backend integration.

```powershell
cd frontend
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

Add to `vite.config.ts`: `test: { environment: "jsdom", globals: true }`

| File | What to test |
|------|-------------|
| `frontend/src/pipeline/validateCommands.test.ts` | Valid JSON passes, invalid JSON returns errors as values (no throw), missing fields reported with path |
| `frontend/src/pipeline/normalizeCommands.test.ts` | circle receives correct defaults, triangle converts x1y1x2y2x3y3 to points[], nanoid unique per object |
| `frontend/src/canvas/drawEngine.test.ts` | render does not throw on NaN/Infinity, correct zIndex order, canvas mock receives correct ctx calls |

```powershell
cd frontend && npx vitest run
```

**Verification:** All tests pass, zero TypeScript errors.

---

## Phase 3 — Backend: LLM Endpoint

**Goal:** `POST /api/draw/parse` calls Gemini and returns DrawCommand[]. **No Auth at this stage.**

**Files to create:**

| File | Main content |
|------|-------------|
| `backend/Program.cs` | CORS for localhost:5173, `AddHttpClient<LlmService>()`, FluentValidation — **no JWT yet** |
| `backend/Models/LlmModels.cs` | POCOs for GeminiRequest/Response |
| `backend/Services/LlmService.cs` | Gemini API call, system prompt (see below), retry on 429, strip markdown fences |
| `backend/Validators/DrawCommandValidator.cs` | FluentValidation — validate `kind`, numeric ranges |
| `backend/Controllers/DrawController.cs` | **`[AllowAnonymous]`** — stays this way until end-to-end works (Phase 4) |

### JSON Contract — System Prompt (critical for drawing quality)

The system prompt must include:
1. **Canvas dimensions:** `The canvas is 800×600 pixels. Origin (0,0) is top-left.`
2. **Strict instruction:** `Return ONLY a valid JSON array. No markdown, no prose, no code fences.`
3. **Definition of every command type with an example:**

```json
[
  { "type": "background", "color": "#87CEEB" },
  { "type": "circle",   "cx": 400, "cy": 300, "r": 50,  "fill": "yellow", "stroke": "orange", "strokeWidth": 2 },
  { "type": "rect",     "x": 100,  "y": 200,  "w": 150, "h": 80, "fill": "red", "rx": 5 },
  { "type": "line",     "x1": 0,   "y1": 0,   "x2": 800, "y2": 600, "color": "black", "width": 1 },
  { "type": "triangle", "x1": 400, "y1": 100, "x2": 300, "y2": 300, "x3": 500, "y3": 300, "fill": "green" },
  { "type": "ellipse",  "cx": 400, "cy": 300, "rx": 100, "ry": 50, "fill": "pink" },
  { "type": "polygon",  "points": [{"x":400,"y":100},{"x":500,"y":300},{"x":300,"y":300}], "fill": "blue" },
  { "type": "text",     "x": 400,  "y": 50,   "content": "Hello", "font": "Arial", "size": 24, "color": "black" },
  { "type": "arc",      "cx": 400, "cy": 300, "r": 100, "startAngle": 0, "endAngle": 180, "color": "red", "width": 2 },
  { "type": "clear" }
]
```

4. **Coordinate guidance:** `Center of canvas: (400, 300). Reasonable sizes: 30–200px radius.`

**Verification:** Swagger → POST with `{"prompt": "draw a red circle"}` → receives JSON array.

---

## Phase 4 — Frontend LLM Integration

**Goal:** Prompt → API → canvas. End-to-end working.

**Files to create:**

| File | Main content |
|------|-------------|
| `frontend/src/api/drawingApi.ts` | Axios instance, `parsePrompt(prompt): Promise<DrawCommand[]>`. **JWT interceptor to be added in Phase 6** |
| `frontend/src/components/PromptBar.tsx` | input + submit (Enter/button), applies "full-replace" delta to scene, displays loading/error states |

**Update:** `App.tsx` → `<PromptBar />` instead of test button. Layout: prompt-bar → toolbar → canvas.

**Verification:** Type "draw a blue sky with a yellow sun" → canvas shows drawing. Undo after drawing — canvas clears.

---

## Phase 5 — Backend: CRUD + DB

> **Status: implemented.** EF Core models + `AppDbContext` + `Init` migration
> applied to SQL Server; `AuthController` (register/login, BCrypt + JWT) and
> `DrawingsController` (full CRUD, ownership-scoped) live; JWT middleware wired in
> `Program.cs`; `DrawController` switched to `[Authorize]`. Verified end-to-end
> (401 unauth → register → save → list → get → update → cross-user 404 → delete).
> Covered by `backend.Tests` (xUnit + WebApplicationFactory + SQLite in-memory):
> 18 integration tests for auth + CRUD + ownership. Run with `dotnet test`.

**Goal:** Save and load drawings from SQL Server. Auth protects all endpoints.

**Files to create:**

| File | Main content |
|------|-------------|
| `backend/Models/Drawing.cs` | EF Core model, `ICollection<DrawingCommand> Commands = []` |
| `backend/Models/DrawingCommand.cs` | `SortOrder`, `Kind`, `ParamsJson` |
| `backend/Models/User.cs` | `Email`, `PasswordHash` (BCrypt) |
| `backend/Data/AppDbContext.cs` | DbSets, cascade delete DrawingCommands, `.UseSqlServer(...)` |
| `backend/Services/DrawingService.cs` | CRUD methods, ownership check in GetByIdAsync |
| `backend/Controllers/DrawingsController.cs` | CRUD endpoints, `User.FindFirstValue(ClaimTypes.NameIdentifier)` |
| `backend/Controllers/AuthController.cs` | register/login, `BCrypt.Verify`, JWT generation |

> **JWT Auth** enters here for the first time: `Program.cs` receives JWT configuration, and `DrawController` switches from `[AllowAnonymous]` to `[Authorize]`.

**Connection String (SQL Server):**
```json
"ConnectionStrings": {
  "DefaultConnection": "Server=localhost;Database=DrawingBot;Trusted_Connection=True;TrustServerCertificate=True"
}
```

```powershell
dotnet ef migrations add Init
dotnet ef database update
```

**Verification:** register → get JWT → save drawing → load drawing → delete drawing.

---

## Phase 6 — Save/Load UI

**Goal:** Full round-trip — draw, save with thumbnail, load.

**Files to create/update:**

| File | Main content |
|------|-------------|
| `frontend/src/components/AuthForm.tsx` | Register/Login tabs, save JWT to localStorage |
| `frontend/src/components/DrawingList.tsx` | Thumbnail grid, click to load, delete, pagination. Wrapped in `<ErrorBoundary>` |
| Update `drawingApi.ts` | Add saveDrawing/listDrawings/loadDrawing/deleteDrawing/loginUser/registerUser |
| Update `drawingSlice.ts` | isAuthenticated, setAuthenticated, currentDrawingId |
| Update `App.tsx` | Final layout: sidebar (DrawingList) + main (Canvas), modal AuthForm if !isAuthenticated |

**Thumbnail:** `canvasRef.current?.toDataURL("image/jpeg", 0.5)` — export canvasRef from CanvasView.tsx.

**Verification:** Save drawing → thumbnail appears in sidebar → click it → canvas loads. Refresh → JWT persists, drawings load.

---

## Phase 7 — Polish

**Changes:**
- `react-hot-toast`: replace inline errors with `toast.error/success`
- Retry interceptor in `drawingApi.ts` on 429/503 (wait 3 seconds, retry once)
- Mobile: test responsive layout at 375px viewport
- `errorMessages.ts`: map error codes to user-friendly messages
- `npm run build` + `dotnet publish` → verify production build

---

## Critical Files (by priority)

1. `frontend/src/store/drawingSlice.ts` — backbone of all state
2. `backend/Services/LlmService.cs` — system prompt determines drawing quality
3. `frontend/src/pipeline/index.ts` — no-throw contract between LLM and canvas
4. `frontend/src/canvas/drawEngine.ts` — all graphical rendering

---

## Dependency Graph

```
Phase 0 (Scaffold)
  └── Phase 1 (Types + Canvas)
        └── Phase 2 (Pipeline + Redux)
              ├── Phase 3 (Backend LLM)   ← can be developed in parallel
              └── Phase 4 (Frontend LLM)  ← needs both Phase 2 and Phase 3
                    └── Phase 5 (CRUD + DB)
                          └── Phase 6 (Save/Load UI)
                                └── Phase 7 (Polish)
```

---

## End-to-End Verification

1. Start: `cd frontend && npm run dev` + `cd backend && dotnet run`
2. Open `http://localhost:5173`
3. Register with email + password
4. Type "draw a sunset over the sea" → click Send
5. Verify: canvas shows a sunset (sun, sea, sky)
6. Click Undo → canvas clears. Redo → returns
7. Click Save → thumbnail appears in DrawingList
8. Click Clear, then the thumbnail → drawing loads back
9. Delete the drawing → disappears from the list
