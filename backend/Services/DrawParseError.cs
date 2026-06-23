namespace backend.Services;

// Why the prompt could not be turned into a validated command list. The service
// returns one of these inside a Result; the controller maps the Code to an HTTP
// status. This keeps HTTP concerns out of the service layer.
public enum DrawParseErrorCode
{
    EmptyPrompt,        // → 400
    LlmUnavailable,     // → 503
    InvalidLlmResponse, // → 422
    TooManyCommands,    // → 422
    ValidationFailed,   // → 422
}

// A single FluentValidation failure, flattened for the JSON error response.
public record FieldError(int Index, string Field, string Message);

public record DrawParseError(
    DrawParseErrorCode Code,
    string Message,
    string? Raw = null,
    IReadOnlyList<FieldError>? FieldErrors = null);
