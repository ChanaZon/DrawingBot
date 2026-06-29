namespace backend.Dtos;

// Request/response contracts for POST /api/draw/parse. Kept separate from the
// domain so the HTTP shape can evolve independently of internal models.

// CurrentCommands is the caller's current canvas, denormalized back to
// DrawCommand[] (see frontend pipeline/denormalizeCommands.ts). When it is null
// or empty the endpoint runs in CREATE mode (returns ParseResponse); when it has
// items the endpoint runs in EDIT mode (returns ParseEditResponse). Array index
// is the command's position, which EDIT-mode removals reference.
public record ParsePromptRequest(string Prompt, IReadOnlyList<DrawCommandDto>? CurrentCommands = null);

// CREATE mode: the full new drawing.
public record ParseResponse(IReadOnlyList<DrawCommandDto> Commands);

// EDIT mode: shapes to append + indices (into the request's CurrentCommands) to
// delete. Existing shapes that are neither added nor removed are left untouched.
public record ParseEditResponse(IReadOnlyList<DrawCommandDto> Add, IReadOnlyList<int> Remove);
