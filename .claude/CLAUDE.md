# Drawing Bot — Natural Language Drawing Application

## Language Policy

All code, UI strings, variable names, file names, error messages, and documentation must be in **English only**. Hebrew is permitted exclusively in inline code comments (`// ...` or `/* ... */`). Never write Hebrew in user-facing text, string literals, identifiers, or markdown docs.

## Project Overview
An interactive web application where users type natural-language drawing instructions (e.g., "draw a sunset over the sea"), an LLM parses the prompt into structured JSON drawing commands, and a canvas engine renders the result. Drawings can be saved to and loaded from a backend API.

---

## Architecture

```
drawing-bot/
├── CLAUDE.md
├── frontend/                      # React 19 + TypeScript (Vite)
│   └── src/
│       ├── types/
│       │   ├── DrawCommand.ts     # LLM raw output schema (Zod)
│       │   └── SceneObject.ts     # Internal scene graph model
│       ├── pipeline/
│       │   ├── validateCommands.ts# Zod parse + error reporting
│       │   ├── normalizeCommands.ts# DrawCommand[] → SceneObject[]
│       │   └── index.ts           # pipeline(raw): SceneObject[] | PipelineError
│       ├── canvas/
│       │   ├── drawEngine.ts      # render(ctx, SceneObject[]) — pure
│       │   └── hitTest.ts         # future: point-in-object for selection
│       ├── store/
│       │   ├── index.ts           # configureStore, RootState, AppDispatch, typed hooks
│       │   └── drawingSlice.ts    # Redux Toolkit: scene graph + delta history
│       ├── api/
│       │   └── drawingApi.ts      # CRUD to ASP.NET backend
│       ├── components/
│       │   ├── App.tsx
│       │   ├── PromptBar.tsx
│       │   ├── CanvasView.tsx
│       │   ├── Toolbar.tsx
│       │   ├── DrawingList.tsx
│       │   └── ErrorBoundary.tsx
│       └── utils/
│           └── colorUtils.ts      # CSS color validation / normalization
│
└── backend/                       # ASP.NET Core 8 Web API
    ├── Controllers/
    │   ├── DrawController.cs      # POST /api/draw/parse  ← LLM lives HERE
    │   ├── DrawingsController.cs  # CRUD for saved drawings
    │   └── AuthController.cs      # register / login / JWT
    ├── Services/
    │   ├── LlmService.cs          # Gemini/GPT call, API key in config
    │   └── DrawingService.cs
    ├── Models/
    │   ├── Drawing.cs             # aggregate root
    │   ├── DrawingCommand.cs      # normalized command row (see DB section)
    │   └── User.cs
    ├── Validators/
    │   └── DrawCommandValidator.cs# FluentValidation on LLM JSON
    └── Data/
        └── AppDbContext.cs        # EF Core + SQL Server
```

---

## Tech Stack

### Frontend
- **React 19** + **TypeScript** (Vite)
- **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) — delta-based undo/redo (not snapshots)
- **Zod** — runtime validation of every LLM response before canvas touch
- **Canvas API** — native HTML5 canvas; render from scene graph only
- **Axios** — HTTP client
- **Tailwind CSS** — styling
- **react-error-boundary** — wrap CanvasView and DrawingList
- **Vitest** — unit tests for pipeline + drawEngine

### Backend
- **ASP.NET Core 8** Web API
- **Entity Framework Core** + **SQL Server**
- **FluentValidation** — server-side validation of LLM output
- **JWT Auth** — user identity (added in Phase 5, not earlier)
- **Microsoft.Extensions.Http** — typed HttpClient for LLM API

---

## Security: LLM Calls Move to Backend

**Problem with frontend LLM calls:** API key exposed in browser, no rate limiting, no server-side audit log.

**Solution:** The frontend never holds an API key. All LLM calls go through the backend.

```
Frontend                    Backend (ASP.NET)          LLM (Gemini/GPT)
   |                              |                          |
   |-- POST /api/draw/parse ----->|                          |
   |   { prompt: "draw a sun" }   |-- POST /v1/generate ---->|
   |                              |<-- { DrawCommand[] } ----|
   |<-- { commands: [...] } ------|
```

`DrawController.cs` holds the API key in `appsettings.json` / environment variables, calls the LLM, validates the response with FluentValidation, and returns the sanitized `DrawCommand[]` to the frontend.

> **⚠️ API Key Security:** The Gemini API key must NEVER be committed to Git. Store it in `appsettings.Development.json` (gitignored), via `dotnet user-secrets`, or as an environment variable (`LLM__APIKEY`).

---

## Two-Layer Type System

### Layer 1 — `DrawCommand` (LLM raw output, Zod-validated)
Exactly what the LLM emits. Validated strictly before anything else happens.

```typescript
// Zod schema — single source of truth
import { z } from "zod";

const ColorField = z.string().regex(/^(#[0-9a-fA-F]{3,8}|[a-z]+|rgba?\(.+\))$/, "invalid CSS color");

export const DrawCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("background"), color: ColorField }),
  z.object({ type: z.literal("clear") }),
  z.object({ type: z.literal("circle"),   cx: z.number(), cy: z.number(), r: z.number().positive(), fill: ColorField.optional(), stroke: ColorField.optional(), strokeWidth: z.number().optional() }),
  z.object({ type: z.literal("rect"),     x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(), fill: ColorField.optional(), stroke: ColorField.optional(), strokeWidth: z.number().optional(), rx: z.number().optional() }),
  z.object({ type: z.literal("line"),     x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), color: ColorField.optional(), width: z.number().optional() }),
  z.object({ type: z.literal("triangle"), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), x3: z.number(), y3: z.number(), fill: ColorField.optional(), stroke: ColorField.optional() }),
  z.object({ type: z.literal("ellipse"),  cx: z.number(), cy: z.number(), rx: z.number().positive(), ry: z.number().positive(), fill: ColorField.optional(), stroke: ColorField.optional() }),
  z.object({ type: z.literal("polygon"),  points: z.array(z.object({ x: z.number(), y: z.number() })).min(3), fill: ColorField.optional(), stroke: ColorField.optional() }),
  z.object({ type: z.literal("text"),     x: z.number(), y: z.number(), content: z.string().max(500), font: z.string().optional(), color: ColorField.optional(), size: z.number().optional() }),
  z.object({ type: z.literal("arc"),      cx: z.number(), cy: z.number(), r: z.number().positive(), startAngle: z.number(), endAngle: z.number(), color: ColorField.optional(), width: z.number().optional() }),
]);

export const DrawCommandArraySchema = z.array(DrawCommandSchema).min(1).max(200);
export type DrawCommand = z.infer<typeof DrawCommandSchema>;
```

### Layer 2 — `SceneObject` (internal scene graph, renderable)
After validation, commands are **normalized** into scene objects. Each object has a stable `id`, explicit `zIndex`, resolved defaults. This is what undo/redo, selection, and the renderer operate on.

```typescript
export type SceneObjectBase = {
  id: string;          // nanoid
  zIndex: number;
  opacity: number;     // 0–1, default 1
};

export type SceneObject =
  | SceneObjectBase & { kind: "background"; color: string }
  | SceneObjectBase & { kind: "circle";   cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number }
  | SceneObjectBase & { kind: "rect";     x: number; y: number; w: number; h: number; fill: string; stroke: string; strokeWidth: number; rx: number }
  | SceneObjectBase & { kind: "line";     x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | SceneObjectBase & { kind: "triangle"; points: [Point, Point, Point]; fill: string; stroke: string }
  | SceneObjectBase & { kind: "ellipse";  cx: number; cy: number; rx: number; ry: number; fill: string; stroke: string }
  | SceneObjectBase & { kind: "polygon";  points: Point[]; fill: string; stroke: string }
  | SceneObjectBase & { kind: "text";     x: number; y: number; content: string; font: string; color: string }
  | SceneObjectBase & { kind: "arc";      cx: number; cy: number; r: number; startAngle: number; endAngle: number; color: string; width: number }
```

---

## Normalization Pipeline

```
POST /api/draw/parse response
        │
        ▼
┌─────────────────────┐
│  1. JSON.parse()    │  catch SyntaxError → show "LLM returned invalid JSON"
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  2. Zod validation  │  DrawCommandArraySchema.safeParse()
│     (frontend)      │  → ZodError details shown per-field
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  3. normalizeCommands│  fill in defaults, assign id + zIndex
│     DrawCommand[]   │  → SceneObject[]
│     → SceneObject[] │
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  4. store.addScene  │  push delta to history, trigger re-render
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  5. drawEngine      │  render(ctx, scene) — sorted by zIndex
│     render()        │
└─────────────────────┘
```

`pipeline/index.ts` exports a single `runPipeline(raw: unknown): Result<SceneObject[], PipelineError>` — no throwing, all errors are values.

---

## Undo/Redo — Delta-Based (not snapshots)

**Problem with snapshots:** Each undo step stores the entire `SceneObject[]`. With 50 steps × 50 objects, memory explodes. Also breaks for large scenes.

**Solution:** Store a list of **deltas** (diffs). Each action is:

```typescript
type HistoryEntry = {
  label: string;       // e.g. "draw circle", "clear"
  apply: SceneDelta;   // what was added/removed/changed
  revert: SceneDelta;  // how to undo it
};

type SceneDelta = {
  added:   SceneObject[];   // objects to add
  removed: string[];        // object ids to remove
  changed: { id: string; from: Partial<SceneObject>; to: Partial<SceneObject> }[];
};
```

Undo = apply `revert` delta. Redo = apply `apply` delta. The current canvas state is always `baseScene` + all applied deltas up to `historyIndex`.

For a full LLM draw (which replaces everything), the delta is:
- `apply.added` = all new objects
- `apply.removed` = all previous object ids
- `revert.added` = all previous objects
- `revert.removed` = all new object ids

This means memory cost per step is O(changed objects), not O(total scene).

```typescript
// Redux Toolkit slice — store/drawingSlice.ts
type DrawingState = {
  scene: SceneObject[];         // current rendered scene
  history: HistoryEntry[];      // all recorded deltas
  historyIndex: number;         // points to last applied entry (-1 = clean)
  prompt: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  currentDrawingId: number | null;
};

// Actions (reducers in createSlice):
// applyDelta(state, action: PayloadAction<{delta: SceneDelta, label: string}>)
// undo(state)
// redo(state)
// clear(state)
// loadScene(state, action: PayloadAction<SceneObject[]>)
// setLoading / setPrompt / setAuthenticated / setCurrentDrawingId
```

```typescript
// store/index.ts — typed hooks
export const store = configureStore({ reducer: { drawing: drawingReducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

---

## Database Schema — Normalized (not CommandsJson blob)

**Problem with single CommandsJson column:** Can't query by command type, can't reorder commands, can't diff versions.

**Solution:** One row per command in a child table.

```sql
CREATE TABLE Drawings (
  Id           INT IDENTITY PRIMARY KEY,
  UserId       NVARCHAR(450) NOT NULL,
  Prompt       NVARCHAR(2000) NOT NULL,
  Title        NVARCHAR(200),
  ThumbnailB64 NVARCHAR(MAX),
  CreatedAt    DATETIME2 NOT NULL,
  UpdatedAt    DATETIME2 NOT NULL
);

CREATE TABLE DrawingCommands (
  Id         INT IDENTITY PRIMARY KEY,
  DrawingId  INT NOT NULL REFERENCES Drawings(Id) ON DELETE CASCADE,
  SortOrder  INT NOT NULL,
  Kind       NVARCHAR(50) NOT NULL,   -- "circle", "rect", etc.
  ParamsJson NVARCHAR(MAX) NOT NULL   -- JSON of just that command's fields
);
```

EF Core models:
```csharp
public class Drawing {
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Prompt { get; set; } = "";
    public string? Title { get; set; }
    public string? ThumbnailB64 { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<DrawingCommand> Commands { get; set; } = [];
}

public class DrawingCommand {
    public int Id { get; set; }
    public int DrawingId { get; set; }
    public int SortOrder { get; set; }
    public string Kind { get; set; } = "";
    public string ParamsJson { get; set; } = "";
    public Drawing Drawing { get; set; } = null!;
}
```

---

## Error Handling Strategy

| Layer | What can fail | Handling |
|-------|--------------|----------|
| Backend LLM call | HTTP 429 / 500 from Gemini | Retry once, then return 503 to frontend |
| Backend LLM parse | LLM returns prose instead of JSON | Return 422 with `{ error: "invalid_llm_response", raw: "..." }` |
| Backend FluentValidation | command fields out of range | Return 422 with field-level errors |
| Frontend Zod | stale client schema vs server | Surface per-field error in UI, never crash canvas |
| Canvas render | bad geometry (NaN, Infinity) | `drawEngine` guards each command, logs + skips |
| React render | any component throw | `<ErrorBoundary>` wraps `<CanvasView>` and `<DrawingList>` |

---

## API Endpoints (Backend)

| Method | Route                     | Auth | Description                         |
|--------|---------------------------|------|-------------------------------------|
| POST   | /api/draw/parse           | JWT (Phase 5+) | Send prompt → get DrawCommand[] |
| POST   | /api/drawings             | JWT  | Save new drawing                    |
| GET    | /api/drawings             | JWT  | List user's drawings (paginated)    |
| GET    | /api/drawings/{id}        | JWT  | Load drawing by ID                  |
| PUT    | /api/drawings/{id}        | JWT  | Update drawing (prompt + commands)  |
| DELETE | /api/drawings/{id}        | JWT  | Delete drawing                      |
| POST   | /api/auth/register        | —    | Register                            |
| POST   | /api/auth/login           | —    | Login → JWT                         |

---

## Environment Variables

### Frontend (`.env`)
```
VITE_API_BASE_URL=http://localhost:5000
# No LLM key here — it lives on the server
```

### Backend (`appsettings.Development.json`) — **gitignored, never commit**
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=DrawingBot;Trusted_Connection=True;TrustServerCertificate=True"
  },
  "Jwt": { "Secret": "...", "Issuer": "drawing-bot", "Audience": "drawing-bot" },
  "Llm": {
    "Provider": "gemini",
    "ApiKey": "YOUR_GEMINI_KEY_HERE",
    "Model": "gemini-2.0-flash",
    "MaxOutputTokens": 2048,
    "TimeoutSeconds": 30
  }
}
```

---

## Recommended Implementation Order

### Phase 1 — Canvas Engine + Types
Goal: shapes render from hardcoded scene objects.
1. `types/DrawCommand.ts` with Zod schemas
2. `types/SceneObject.ts`
3. `canvas/drawEngine.ts` — all renderers, guarded
4. `components/CanvasView.tsx` — renders from hardcoded scene
5. `components/ErrorBoundary.tsx`

### Phase 2 — Pipeline + Redux State
Goal: raw JSON → validated → scene graph → Redux store → rendered.
1. `pipeline/validateCommands.ts`
2. `pipeline/normalizeCommands.ts`
3. `pipeline/index.ts`
4. `store/drawingSlice.ts` — Redux Toolkit slice with delta undo/redo
5. `store/index.ts` — configureStore + typed hooks (`useAppSelector`, `useAppDispatch`)
6. Wrap `<App />` in `<Provider store={store}>` in `main.tsx`
7. `components/Toolbar.tsx` — Undo/Redo/Clear

### Phase 2.5 — Unit Tests
Goal: catch regressions in pipeline and renderer early.
- `pipeline/validateCommands.test.ts`
- `pipeline/normalizeCommands.test.ts`
- `canvas/drawEngine.test.ts`
- Tool: **Vitest** + jsdom

### Phase 3 — Backend: LLM Endpoint
Goal: backend proxies LLM call. **No auth yet — `[AllowAnonymous]`.**
1. ASP.NET Core scaffold
2. `LlmService.cs` — Gemini HTTP call with detailed system prompt
3. `DrawController.cs` — POST /api/draw/parse (`[AllowAnonymous]`)
4. FluentValidation on response

### Phase 4 — Frontend LLM Integration
Goal: type prompt → backend → Redux → render (end-to-end).
1. `api/drawingApi.ts` — parse endpoint call
2. `components/PromptBar.tsx` — dispatches to Redux store
3. Loading state + error display

### Phase 5 — Backend: CRUD + DB + Auth
Goal: save/load drawings with SQL Server. JWT Auth added here.
1. EF Core models + migrations (SQL Server, normalized schema)
2. `DrawingsController.cs` — full CRUD
3. `AuthController.cs` + register/login
4. JWT middleware added to `Program.cs`
5. `DrawController` switches from `[AllowAnonymous]` to `[Authorize]`

### Phase 6 — Save/Load UI
Goal: full round-trip.
1. Save with thumbnail (canvas.toDataURL)
2. `components/DrawingList.tsx`
3. `components/AuthForm.tsx` — register/login, dispatches `setAuthenticated`

### Phase 7 — Polish
- Responsive layout + mobile canvas scaling
- Toast notifications (react-hot-toast)
- Paginated drawing gallery
- Retry on LLM 429
- Production build + env docs

---

## Development Commands
```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && dotnet run

# Backend migrations
cd backend && dotnet ef migrations add Init && dotnet ef database update
```

## Canvas Coordinate Space
Always 800×600. The LLM system prompt states this explicitly. `CanvasView` CSS-scales the canvas to fit the viewport but the logical pixel space is always 800×600. This prevents coordinate drift between LLM output and render.
