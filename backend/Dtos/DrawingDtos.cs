using System.Text.Json;

namespace backend.Dtos;

// Request/response contracts for /api/drawings. The wire shape mirrors the
// normalized DB schema: a drawing is a header plus an ordered list of commands,
// each a discriminator (Kind) and its own field bag (Params). Params is carried
// as a raw JSON object so the backend stays agnostic of the exact command
// schema (that contract is owned by the frontend Zod/SceneObject layer).

// One command on the wire. Params is the command's own fields as a JSON object
// (e.g. { "cx": 400, "cy": 300, "r": 50, "fill": "yellow" }). Stored verbatim
// as DrawingCommand.ParamsJson; SortOrder is derived from array position.
public record DrawingCommandDto(string Kind, JsonElement Params);

// Body for POST (create) and PUT (update). Title/thumbnail are optional.
public record SaveDrawingRequest(
    string Prompt,
    string? Title,
    string? ThumbnailB64,
    IReadOnlyList<DrawingCommandDto> Commands);

// List-item shape for the gallery (GET /api/drawings). Deliberately omits the
// command rows — the list only needs headers + thumbnail.
public record DrawingSummaryDto(
    int Id,
    string Prompt,
    string? Title,
    string? ThumbnailB64,
    DateTime CreatedAt,
    DateTime UpdatedAt);

// Full drawing including its commands (GET /api/drawings/{id}, and the body
// echoed back on create/update).
public record DrawingDetailDto(
    int Id,
    string Prompt,
    string? Title,
    string? ThumbnailB64,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<DrawingCommandDto> Commands);

// Generic page envelope for paginated list endpoints.
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
