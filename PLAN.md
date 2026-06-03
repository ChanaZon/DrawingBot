# Drawing Bot — תוכנית יישום מלאה

## Context

הפרויקט מיועד לבניית אפליקציית Fullstack אינטראקטיבית בה המשתמש מקליד הוראה בשפה חופשית (כגון "צייר שמש מעל הים"), ה-LLM ממיר אותה לפקודות JSON, ומנוע ציור מרנדר את התוצאה על Canvas. הפרויקט כרגע ריק לחלוטין — רק CLAUDE.md קיים. כל קוד המקור צריך להיבנות מאפס.

---

## מצב נוכחי

- תיקיית הפרויקט: `c:\Users\User\Desktop\drawing bot`
- קיים: `.claude/CLAUDE.md` (ספציפיקציה מלאה) + `.gitignore`
- **חסר: כל קוד המקור** — אין `frontend/`, אין `backend/`

---

## ארכיטקטורה

```
Frontend (React 18 + TS + Vite)     Backend (ASP.NET Core 8)
┌───────────────────────────┐       ┌──────────────────────────┐
│ PromptBar                 │──────▶│ POST /api/draw/parse      │──▶ Gemini
│ CanvasView (800×600)      │◀──────│ GET/POST /api/drawings    │
│ Toolbar (Undo/Redo/Clear) │       │ POST /api/auth/login      │
│ DrawingList               │       │ SQLite (EF Core)          │
└───────────────────────────┘       └──────────────────────────┘
```

---

## Phase 0 — Scaffolding (תשתית)

**פעולות:**

```powershell
# Frontend
cd "c:\Users\User\Desktop\drawing bot"
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install zustand zod axios nanoid react-hot-toast react-error-boundary
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

**קבצי תצורה ליצור ידנית:**
- `frontend/.env` → `VITE_API_BASE_URL=http://localhost:5000`
- `backend/appsettings.Development.json` → ConnectionString (SQL Server), Llm ללא Auth בשלב זה
- `vite.config.ts` → הוספת `@tailwindcss/vite` plugin
- `frontend/src/index.css` → `@import "tailwindcss"`

> **⚠️ Gemini API Key — אבטחה:** המפתח לא נכנס לקוד ולא ל-Git לעולם.
> אפשרויות לפי העדפה (בחר אחת):
> - `appsettings.Development.json` (שמור ב-gitignore)
> - `dotnet user-secrets set "Llm:ApiKey" "YOUR_KEY"` (User Secrets)
> - משתנה סביבה: `LLM__APIKEY=...` (prod)

---

## Phase 1 — Canvas Engine + Types

**מטרה:** צורות מתרנדרות מ-SceneObject[] קשיח בזיכרון. אין רשת, אין state.

**קבצים ליצור (בסדר):**

| קובץ | תוכן עיקרי |
|------|------------|
| `frontend/src/types/DrawCommand.ts` | Zod schema — discriminated union עם 10 סוגים (circle, rect, line, triangle, ellipse, polygon, text, arc, background, clear). `ColorField` regex, `DrawCommandArraySchema.min(1).max(200)` |
| `frontend/src/types/SceneObject.ts` | `SceneObjectBase` עם `id: string`, `zIndex: number`, `opacity: number`. Union עם discriminant `kind`. גם `SceneDelta` ו-`HistoryEntry` מוגדרים כאן |
| `frontend/src/utils/colorUtils.ts` | `isValidCssColor(s)` ו-`normalizeCssColor(s, fallback)` |
| `frontend/src/canvas/drawEngine.ts` | `render(ctx, scene)` — מיון לפי zIndex, `ctx.save/restore` + `globalAlpha` לכל אובייקט, guard על `isFinite()`, המרת degrees→radians ל-arc |
| `frontend/src/canvas/hitTest.ts` | Stub בלבד: `return null` |
| `frontend/src/components/ErrorBoundary.tsx` | `export { ErrorBoundary } from "react-error-boundary"` |
| `frontend/src/components/CanvasView.tsx` | `<canvas width={800} height={600}>`, CSS-scaling עם `aspectRatio: "800/600"`, `useEffect` מפעיל `render(ctx, scene)` |
| `frontend/src/components/App.tsx` | גרסת Phase 1: Canvas עם scene קשיח לבדיקה |

**בדיקה:** `npm run dev` → רואים canvas עם צורות בדיקה. `npm run build` ללא שגיאות TypeScript.

---

## Phase 2 — Pipeline + State

**מטרה:** JSON גולמי → validation → normalization → Zustand store → רנדור.

**קבצים ליצור:**

| קובץ | תוכן עיקרי |
|------|------------|
| `frontend/src/pipeline/validateCommands.ts` | `validateCommands(raw): ValidationResult` — `DrawCommandArraySchema.safeParse()`, no-throw, מחזיר errors כ-values |
| `frontend/src/pipeline/normalizeCommands.ts` | `normalizeCommands(commands): SceneObject[]` — מוסיף `id` (nanoid), `zIndex`, `opacity=1`, ברירות מחדל לכל שדה (fill→"transparent", stroke→"black") |
| `frontend/src/pipeline/index.ts` | `runPipeline(raw): Result<SceneObject[], PipelineError>` — 4 שלבים בלי throws |
| `frontend/src/store/useDrawingStore.ts` | Zustand store. **applyDelta**: מחשב revert אוטומטית, חותך redo stack, מעדכן scene. **undo/redo**: מחיל delta/revert. **clear**: applyDelta עם removed=כל ה-IDs |
| `frontend/src/components/Toolbar.tsx` | כפתורי Undo/Redo/Clear, disabled states נכונים |

**עדכון קיים:** `App.tsx` — מחליף scene קשיח ב-`useDrawingStore`, מוסיף `<Toolbar />` וכפתור "בדוק Pipeline".

**בדיקה:** undo/redo עובד, pipeline מחזיר error כ-value על JSON שגוי.

---

## Phase 2.5 — בדיקות יחידה (Frontend)

**מטרה:** כיסוי בסיסי ל-3 רכיבי הליבה לפני האינטגרציה עם ה-backend.

```powershell
cd frontend
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

הוסף ל-`vite.config.ts`: `test: { environment: "jsdom", globals: true }`

| קובץ | מה בודקים |
|------|-----------|
| `frontend/src/pipeline/validateCommands.test.ts` | JSON תקין עובר, JSON שגוי מחזיר errors כ-values (לא throw), שדות חסרים מדווחים עם path |
| `frontend/src/pipeline/normalizeCommands.test.ts` | circle מקבל defaults נכונים, triangle ממיר x1y1x2y2x3y3 ל-points[], nanoid ייחודי לכל object |
| `frontend/src/canvas/drawEngine.test.ts` | render לא זורק על NaN/Infinity, סדר zIndex נכון, canvas mock מקבל קריאות ctx נכונות |

```powershell
cd frontend && npx vitest run
```

**בדיקה:** כל הבדיקות עוברות, אפס TypeScript errors.

---

## Phase 3 — Backend: LLM Endpoint

**מטרה:** `POST /api/draw/parse` קורא ל-Gemini ומחזיר DrawCommand[]. **ללא Auth בשלב זה.**

**קבצים ליצור:**

| קובץ | תוכן עיקרי |
|------|------------|
| `backend/Program.cs` | CORS ל-localhost:5173, `AddHttpClient<LlmService>()`, FluentValidation — **ללא JWT עדיין** |
| `backend/Models/LlmModels.cs` | POCOs ל-GeminiRequest/Response |
| `backend/Services/LlmService.cs` | קריאה ל-Gemini API, system prompt (ראה להלן), retry על 429, הסרת markdown fences |
| `backend/Validators/DrawCommandValidator.cs` | FluentValidation — בדיקת `kind`, טווחי מספרים |
| `backend/Controllers/DrawController.cs` | **`[AllowAnonymous]`** — יישאר כך עד שה-end-to-end עובד (Phase 4) |

### JSON Contract — System Prompt (קריטי לאיכות הציור)

ה-system prompt חייב לכלול:
1. **מימדי canvas:** `The canvas is 800×600 pixels. Origin (0,0) is top-left.`
2. **הנחיה מחמירה:** `Return ONLY a valid JSON array. No markdown, no prose, no code fences.`
3. **הגדרת כל סוג פקודה עם דוגמה:**

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

4. **הנחיות קואורדינטות:** `Center of canvas: (400, 300). Reasonable sizes: 30–200px radius.`

**בדיקה:** Swagger → POST עם `{"prompt": "draw a red circle"}` → מקבל JSON array.

---

## Phase 4 — Frontend LLM Integration

**מטרה:** פרומפט → API → canvas. end-to-end עובד.

**קבצים ליצור:**

| קובץ | תוכן עיקרי |
|------|------------|
| `frontend/src/api/drawingApi.ts` | Axios instance, `parsePrompt(prompt): Promise<DrawCommand[]>`. **JWT interceptor יתווסף בפועל ב-Phase 6** |
| `frontend/src/components/PromptBar.tsx` | input + submit (Enter/button), מחיל delta "full-replace" על scene, מציג loading/error states |

**עדכון:** `App.tsx` → `<PromptBar />` במקום כפתור הבדיקה. Layout: prompt-bar → toolbar → canvas.

**בדיקה:** הקלד "draw a blue sky with a yellow sun" → canvas מציג ציור. undo אחרי הציור — canvas מתרוקן.

---

## Phase 5 — Backend: CRUD + DB

**מטרה:** שמירה וטעינה של ציורים מ-SQL Server. Auth מגן על כל endpoints.

**קבצים ליצור:**

| קובץ | תוכן עיקרי |
|------|------------|
| `backend/Models/Drawing.cs` | EF Core model, `ICollection<DrawingCommand> Commands = []` |
| `backend/Models/DrawingCommand.cs` | `SortOrder`, `Kind`, `ParamsJson` |
| `backend/Models/User.cs` | `Email`, `PasswordHash` (BCrypt) |
| `backend/Data/AppDbContext.cs` | DbSets, cascade delete DrawingCommands, `.UseSqlServer(...)` |
| `backend/Services/DrawingService.cs` | CRUD methods, בדיקת ownership ב-GetByIdAsync |
| `backend/Controllers/DrawingsController.cs` | CRUD endpoints, `User.FindFirstValue(ClaimTypes.NameIdentifier)` |
| `backend/Controllers/AuthController.cs` | register/login, `BCrypt.Verify`, JWT generation |

> **JWT Auth** נכנס כאן לראשונה: `Program.cs` מקבל את תצורת ה-JWT, ו-`DrawController` עובר מ-`[AllowAnonymous]` ל-`[Authorize]`.

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

**בדיקה:** register → קבל JWT → save drawing → load drawing → delete drawing.

---

## Phase 6 — Save/Load UI

**מטרה:** round-trip מלא — ציור, שמירה עם thumbnail, טעינה.

**קבצים ליצור/לעדכן:**

| קובץ | תוכן עיקרי |
|------|------------|
| `frontend/src/components/AuthForm.tsx` | Register/Login tabs, שמירת JWT ב-localStorage |
| `frontend/src/components/DrawingList.tsx` | גריד thumbnails, לחיצה לטעינה, מחיקה, pagination. עטוף ב-`<ErrorBoundary>` |
| עדכון `drawingApi.ts` | הוספת saveDrawing/listDrawings/loadDrawing/deleteDrawing/loginUser/registerUser |
| עדכון `useDrawingStore.ts` | isAuthenticated, setAuthenticated, currentDrawingId |
| עדכון `App.tsx` | layout סופי: sidebar (DrawingList) + main (Canvas), modal AuthForm אם !isAuthenticated |

**Thumbnail:** `canvasRef.current?.toDataURL("image/jpeg", 0.5)` — export canvasRef מ-CanvasView.tsx.

**בדיקה:** שמור ציור → thumbnail מופיע בסרגל → לחץ עליו → canvas נטען. רענן → JWT נשמר, ציורים נטענים.

---

## Phase 7 — Polish

**שינויים:**
- `react-hot-toast`: החלפת inline errors ב-`toast.error/success`
- Retry interceptor ב-`drawingApi.ts` על 429/503 (חכה 3 שניות, נסה פעם אחת)
- Mobile: בדיקת responsive layout ב-375px viewport
- `errorMessages.ts`: מיפוי קודי שגיאה להודעות user-friendly
- `npm run build` + `dotnet publish` → בדיקת production build

---

## קבצים קריטיים (לפי עדיפות)

1. `frontend/src/store/useDrawingStore.ts` — עמוד השדרה של כל ה-state
2. `backend/Services/LlmService.cs` — system prompt קובע את איכות הציורים
3. `frontend/src/pipeline/index.ts` — חוזה ה-no-throw בין LLM לבין canvas
4. `frontend/src/canvas/drawEngine.ts` — כל הרנדור הגרפי

---

## Dependency Graph

```
Phase 0 (Scaffold)
  └── Phase 1 (Types + Canvas)
        └── Phase 2 (Pipeline + Zustand)
              ├── Phase 3 (Backend LLM)   ← ניתן לפיתוח מקביל
              └── Phase 4 (Frontend LLM)  ← צריך גם Phase 2 וגם Phase 3
                    └── Phase 5 (CRUD + DB)
                          └── Phase 6 (Save/Load UI)
                                └── Phase 7 (Polish)
```

---

## בדיקה end-to-end

1. הפעל: `cd frontend && npm run dev` + `cd backend && dotnet run`
2. פתח `http://localhost:5173`
3. הרשם עם email + password
4. הקלד "draw a sunset over the sea" → לחץ Send
5. ודא: canvas מציג שקיעה (שמש, ים, שמים)
6. לחץ Undo → canvas מתרוקן. Redo → חוזר
7. לחץ Save → thumbnail מופיע ב-DrawingList
8. לחץ Clear, ואז על ה-thumbnail → ציור נטען חזרה
9. מחק את הציור → נעלם מהרשימה
