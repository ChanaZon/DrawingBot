namespace backend.Dtos;

// Request/response contracts for POST /api/draw/parse. Kept separate from the
// domain so the HTTP shape can evolve independently of internal models.
public record ParsePromptRequest(string Prompt);

public record ParseResponse(IReadOnlyList<DrawCommandDto> Commands);
