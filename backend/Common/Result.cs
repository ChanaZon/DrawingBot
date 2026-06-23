namespace backend.Common;

// Minimal Result type: a call either succeeds with a value or fails with a
// domain error — no exceptions for expected failures. Mirrors the frontend's
// "errors as values" approach (pipeline/index.ts returns Result, never throws).
// The service layer returns this; the controller maps it to an IActionResult.
public sealed class Result<TValue, TError>
{
    public bool IsSuccess { get; }
    public TValue? Value { get; }
    public TError? Error { get; }

    private Result(bool isSuccess, TValue? value, TError? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public static Result<TValue, TError> Success(TValue value) => new(true, value, default);

    public static Result<TValue, TError> Failure(TError error) => new(false, default, error);
}
