using System.Text.Json;
using backend.Common;
using backend.Dtos;
using FluentValidation;

namespace backend.Services;

public interface IDrawParsingService
{
    // Turn a natural-language prompt into a validated DrawCommand list.
    // Never throws for expected failures — returns a DrawParseError instead.
    Task<Result<IReadOnlyList<DrawCommandDto>, DrawParseError>> ParsePromptAsync(
        string prompt, CancellationToken ct);
}

// Application/business layer for POST /api/draw/parse. Owns the whole flow that
// used to live in the controller: call the LLM, parse its JSON, run
// FluentValidation, enforce the command-count cap. The controller now only maps
// the Result to HTTP.
public class DrawParsingService : IDrawParsingService
{
    private const int MaxCommands = 200;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly ILlmService _llm;
    private readonly IValidator<DrawCommandDto> _validator;
    private readonly ILogger<DrawParsingService> _logger;

    public DrawParsingService(
        ILlmService llm,
        IValidator<DrawCommandDto> validator,
        ILogger<DrawParsingService> logger)
    {
        _llm = llm;
        _validator = validator;
        _logger = logger;
    }

    public async Task<Result<IReadOnlyList<DrawCommandDto>, DrawParseError>> ParsePromptAsync(
        string prompt, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(prompt))
            return Fail(DrawParseErrorCode.EmptyPrompt, "Prompt must not be empty.");

        // 1. Ask the LLM for raw JSON.
        string rawJson;
        try
        {
            rawJson = await _llm.GenerateCommandsJsonAsync(prompt, ct);
        }
        catch (LlmUnavailableException ex)
        {
            _logger.LogError(ex, "LLM provider unavailable.");
            return Fail(DrawParseErrorCode.LlmUnavailable, ex.Message);
        }
        catch (LlmInvalidResponseException ex)
        {
            _logger.LogWarning("LLM returned an unusable response.");
            return Fail(DrawParseErrorCode.InvalidLlmResponse, ex.Message, raw: ex.Raw);
        }

        // 2. Parse the model's JSON into our command DTOs.
        List<DrawCommandDto>? commands;
        try
        {
            commands = JsonSerializer.Deserialize<List<DrawCommandDto>>(rawJson, JsonOptions);
        }
        catch (JsonException)
        {
            return Fail(DrawParseErrorCode.InvalidLlmResponse, "LLM returned invalid JSON.", raw: rawJson);
        }

        if (commands is null || commands.Count == 0)
            return Fail(DrawParseErrorCode.InvalidLlmResponse, "LLM returned no commands.", raw: rawJson);

        if (commands.Count > MaxCommands)
            return Fail(DrawParseErrorCode.TooManyCommands,
                $"LLM returned {commands.Count} commands; max is {MaxCommands}.");

        // 3. Server-side validation mirroring the frontend Zod schema.
        var fieldErrors = new List<FieldError>();
        for (var i = 0; i < commands.Count; i++)
        {
            var result = _validator.Validate(commands[i]);
            if (result.IsValid)
                continue;

            foreach (var failure in result.Errors)
                fieldErrors.Add(new FieldError(i, failure.PropertyName, failure.ErrorMessage));
        }

        if (fieldErrors.Count > 0)
            return Fail(DrawParseErrorCode.ValidationFailed, "One or more commands failed validation.",
                fieldErrors: fieldErrors);

        return Result<IReadOnlyList<DrawCommandDto>, DrawParseError>.Success(commands);
    }

    private static Result<IReadOnlyList<DrawCommandDto>, DrawParseError> Fail(
        DrawParseErrorCode code,
        string message,
        string? raw = null,
        IReadOnlyList<FieldError>? fieldErrors = null) =>
        Result<IReadOnlyList<DrawCommandDto>, DrawParseError>.Failure(
            new DrawParseError(code, message, raw, fieldErrors));
}
