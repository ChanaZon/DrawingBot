using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Common;
using backend.Dtos;
using FluentValidation;

namespace backend.Services;

public interface IDrawParsingService
{
    // Turn a natural-language prompt into a validated DrawCommand list (CREATE mode).
    // Never throws for expected failures — returns a DrawParseError instead.
    Task<Result<IReadOnlyList<DrawCommandDto>, DrawParseError>> ParsePromptAsync(
        string prompt, CancellationToken ct);

    // EDIT mode: given the current drawing, turn a change request into a validated
    // set of additions + removal indices. Existing shapes not removed are untouched.
    Task<Result<DrawEdit, DrawParseError>> ParseEditAsync(
        string prompt, IReadOnlyList<DrawCommandDto> currentCommands, CancellationToken ct);
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

    // For serializing the current drawing into the LLM prompt: camelCase + omit
    // nulls so the model sees the same lowercase shape it is asked to emit.
    private static readonly JsonSerializerOptions SerializeOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
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

    public async Task<Result<DrawEdit, DrawParseError>> ParseEditAsync(
        string prompt, IReadOnlyList<DrawCommandDto> currentCommands, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(prompt))
            return EditFail(DrawParseErrorCode.EmptyPrompt, "Prompt must not be empty.");

        // 0. Validate the caller-supplied current drawing before it reaches the LLM.
        //    It is client-controlled input that we serialize straight into the prompt
        //    context and whose Count bounds the removal-index check below; an
        //    unvalidated passthrough would let a stale/malicious client inject
        //    arbitrary JSON into the LLM and undermine the bounds guard. Same rules
        //    as the commands we accept on the create path.
        if (currentCommands.Count > MaxCommands)
            return EditFail(DrawParseErrorCode.TooManyCommands,
                $"Current drawing has {currentCommands.Count} commands; max is {MaxCommands}.");

        var currentErrors = new List<FieldError>();
        for (var i = 0; i < currentCommands.Count; i++)
        {
            var result = _validator.Validate(currentCommands[i]);
            if (result.IsValid)
                continue;

            foreach (var failure in result.Errors)
                currentErrors.Add(new FieldError(i, $"currentCommands.{failure.PropertyName}", failure.ErrorMessage));
        }

        if (currentErrors.Count > 0)
            return EditFail(DrawParseErrorCode.ValidationFailed,
                "The current drawing failed validation.", fieldErrors: currentErrors);

        // 1. Ask the LLM for an edit, giving it the current drawing as context.
        var currentJson = JsonSerializer.Serialize(currentCommands, SerializeOptions);
        string rawJson;
        try
        {
            rawJson = await _llm.GenerateEditJsonAsync(prompt, currentJson, ct);
        }
        catch (LlmUnavailableException ex)
        {
            _logger.LogError(ex, "LLM provider unavailable.");
            return EditFail(DrawParseErrorCode.LlmUnavailable, ex.Message);
        }
        catch (LlmInvalidResponseException ex)
        {
            _logger.LogWarning("LLM returned an unusable response.");
            return EditFail(DrawParseErrorCode.InvalidLlmResponse, ex.Message, raw: ex.Raw);
        }

        // 2. Parse the model's { add, remove } object.
        LlmEditDto? edit;
        try
        {
            edit = JsonSerializer.Deserialize<LlmEditDto>(rawJson, JsonOptions);
        }
        catch (JsonException)
        {
            return EditFail(DrawParseErrorCode.InvalidLlmResponse, "LLM returned invalid JSON.", raw: rawJson);
        }

        if (edit is null)
            return EditFail(DrawParseErrorCode.InvalidLlmResponse, "LLM returned no edit.", raw: rawJson);

        var add = edit.Add ?? [];
        var remove = edit.Remove ?? [];

        if (add.Count == 0 && remove.Count == 0)
            return EditFail(DrawParseErrorCode.InvalidLlmResponse,
                "LLM returned no changes to apply.", raw: rawJson);

        if (add.Count > MaxCommands)
            return EditFail(DrawParseErrorCode.TooManyCommands,
                $"LLM returned {add.Count} commands to add; max is {MaxCommands}.");

        // 3. Validate the added commands (same rules as create) and the removal
        //    indices (must point at a real shape in the supplied current drawing).
        var fieldErrors = new List<FieldError>();
        for (var i = 0; i < add.Count; i++)
        {
            // background/clear make no sense as an EDIT addition: a "clear" can't be
            // expressed as an appended object, and an appended background would paint
            // on top of (hide) the existing drawing. Full-canvas resets go through
            // CREATE / the Clear action instead. Reject them so the contract stays
            // strictly additive over existing shapes.
            if (add[i].Type is "clear" or "background")
            {
                fieldErrors.Add(new FieldError(i, "type",
                    $"'{add[i].Type}' cannot be added in an edit; it would not preserve existing shapes."));
                continue;
            }

            var result = _validator.Validate(add[i]);
            if (result.IsValid)
                continue;

            foreach (var failure in result.Errors)
                fieldErrors.Add(new FieldError(i, failure.PropertyName, failure.ErrorMessage));
        }

        for (var i = 0; i < remove.Count; i++)
        {
            if (remove[i] < 0 || remove[i] >= currentCommands.Count)
                fieldErrors.Add(new FieldError(i, "remove",
                    $"Remove index {remove[i]} is out of range (0..{currentCommands.Count - 1})."));
        }

        if (fieldErrors.Count > 0)
            return EditFail(DrawParseErrorCode.ValidationFailed, "The edit failed validation.",
                fieldErrors: fieldErrors);

        return Result<DrawEdit, DrawParseError>.Success(new DrawEdit(add, remove));
    }

    private static Result<IReadOnlyList<DrawCommandDto>, DrawParseError> Fail(
        DrawParseErrorCode code,
        string message,
        string? raw = null,
        IReadOnlyList<FieldError>? fieldErrors = null) =>
        Result<IReadOnlyList<DrawCommandDto>, DrawParseError>.Failure(
            new DrawParseError(code, message, raw, fieldErrors));

    private static Result<DrawEdit, DrawParseError> EditFail(
        DrawParseErrorCode code,
        string message,
        string? raw = null,
        IReadOnlyList<FieldError>? fieldErrors = null) =>
        Result<DrawEdit, DrawParseError>.Failure(
            new DrawParseError(code, message, raw, fieldErrors));

    // Shape of the EDIT-mode LLM response: { "add": [...], "remove": [...] }.
    private sealed class LlmEditDto
    {
        public List<DrawCommandDto>? Add { get; set; }
        public List<int>? Remove { get; set; }
    }
}
