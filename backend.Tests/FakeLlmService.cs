using backend.Services;

namespace backend.Tests;

// Test double for ILlmService so /api/draw/parse can be exercised end-to-end
// (auth → controller → DrawParsingService → FluentValidation → response) without
// a live Gemini call. Each test sets the delegate for the mode it drives.
public sealed class FakeLlmService : ILlmService
{
    // CREATE mode: prompt -> raw JSON (expected: a DrawCommand[] array).
    public Func<string, string>? OnGenerate { get; set; }

    // EDIT mode: (prompt, currentCommandsJson) -> raw JSON (expected: { add, remove }).
    public Func<string, string, string>? OnEdit { get; set; }

    public Task<string> GenerateCommandsJsonAsync(string prompt, CancellationToken ct) =>
        Task.FromResult(OnGenerate?.Invoke(prompt) ?? "[]");

    public Task<string> GenerateEditJsonAsync(string prompt, string currentCommandsJson, CancellationToken ct) =>
        Task.FromResult(OnEdit?.Invoke(prompt, currentCommandsJson) ?? "{}");
}
