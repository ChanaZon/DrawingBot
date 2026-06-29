using backend.Dtos;
using backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/draw")]
// Phase 5: the parse endpoint now requires a valid JWT (CLAUDE.md > API Endpoints).
[Authorize]
public class DrawController : ControllerBase
{
    private readonly IDrawParsingService _parsing;

    public DrawController(IDrawParsingService parsing)
    {
        _parsing = parsing;
    }

    // POST /api/draw/parse  — prompt in, validated DrawCommand[] out.
    // Thin: delegate to the service, then map its Result to an HTTP response.
    [HttpPost("parse")]
    public async Task<IActionResult> Parse([FromBody] ParsePromptRequest request, CancellationToken ct)
    {
        var result = await _parsing.ParsePromptAsync(request.Prompt, ct);

        if (result.IsSuccess)
            return Ok(new ParseResponse(result.Value!));

        return MapError(result.Error!);
    }

    // Translate a domain error into the matching HTTP status + body.
    private IActionResult MapError(DrawParseError error) => error.Code switch
    {
        DrawParseErrorCode.EmptyPrompt =>
            BadRequest(new { error = "empty_prompt", message = error.Message }),

        DrawParseErrorCode.LlmUnavailable =>
            StatusCode(503, new { error = "llm_unavailable", message = error.Message }),

        DrawParseErrorCode.InvalidLlmResponse =>
            UnprocessableEntity(new { error = "invalid_llm_response", raw = error.Raw }),

        DrawParseErrorCode.TooManyCommands =>
            UnprocessableEntity(new { error = "too_many_commands", message = error.Message }),

        DrawParseErrorCode.ValidationFailed =>
            UnprocessableEntity(new { error = "validation_failed", errors = error.FieldErrors }),

        _ => StatusCode(500, new { error = "unknown", message = error.Message }),
    };
}
