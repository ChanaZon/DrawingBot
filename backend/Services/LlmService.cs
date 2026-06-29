using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace backend.Services;

public interface ILlmService
{
    // Returns the raw JSON text the LLM produced (expected: a DrawCommand[] array).
    // Throws LlmUnavailableException (→503) or LlmInvalidResponseException (→422).
    Task<string> GenerateCommandsJsonAsync(string prompt, CancellationToken ct);

    // EDIT mode: given the current drawing as a DrawCommand[] JSON string and a
    // natural-language change request, returns the raw JSON text the LLM produced
    // (expected: { "add": DrawCommand[], "remove": int[] }). Same exceptions.
    Task<string> GenerateEditJsonAsync(string prompt, string currentCommandsJson, CancellationToken ct);
}

// Calls Google Gemini's generateContent endpoint and returns the model's raw JSON.
// The controller is responsible for parsing + FluentValidation before trusting it.
public class LlmService : ILlmService
{
    private readonly HttpClient _http;
    private readonly LlmOptions _options;
    private readonly ILogger<LlmService> _logger;

    public LlmService(HttpClient http, IOptions<LlmOptions> options, ILogger<LlmService> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    // Canvas is always 800x600 (see CLAUDE.md > Canvas Coordinate Space).
    private const string SystemPrompt = """
        You convert a natural-language drawing request into a JSON array of drawing commands.

        Output rules:
        - Respond with ONLY a JSON array. No prose, no markdown, no code fences.
        - The canvas is exactly 800 wide and 600 tall. Origin (0,0) is top-left.
          Keep every coordinate inside these bounds.
        - Use between 1 and 200 commands.
        - Colors must be valid CSS: hex (#rgb / #rrggbb / #rrggbbaa), a lowercase
          named color (e.g. "red", "skyblue"), or rgb()/rgba(...).
        - Draw back-to-front: emit the background first, then far objects, then near ones.

        Each command is one object with a "type" field. Allowed shapes and fields:
        - { "type": "background", "color": string }
        - { "type": "clear" }
        - { "type": "circle", "cx": number, "cy": number, "r": number>0,
            "fill"?: color, "stroke"?: color, "strokeWidth"?: number }
        - { "type": "rect", "x": number, "y": number, "w": number>0, "h": number>0,
            "fill"?: color, "stroke"?: color, "strokeWidth"?: number, "rx"?: number }
        - { "type": "line", "x1": number, "y1": number, "x2": number, "y2": number,
            "color"?: color, "width"?: number }
        - { "type": "triangle", "x1": number, "y1": number, "x2": number, "y2": number,
            "x3": number, "y3": number, "fill"?: color, "stroke"?: color }
        - { "type": "ellipse", "cx": number, "cy": number, "rx": number>0, "ry": number>0,
            "fill"?: color, "stroke"?: color }
        - { "type": "polygon", "points": [{ "x": number, "y": number }, ...>=3],
            "fill"?: color, "stroke"?: color }
        - { "type": "text", "x": number, "y": number, "content": string,
            "font"?: string, "color"?: color, "size"?: number }
        - { "type": "arc", "cx": number, "cy": number, "r": number>0,
            "startAngle": number, "endAngle": number, "color"?: color, "width"?: number }

        Example request: "draw a red circle in the center".
        Example response: [{"type":"background","color":"white"},{"type":"circle","cx":400,"cy":300,"r":80,"fill":"red"}]
        """;

    // EDIT mode: the model is shown the current drawing and must return only the
    // changes — never a regenerated full scene — so existing shapes never drift.
    private const string EditSystemPrompt = """
        You edit an existing drawing on an 800x600 canvas (origin (0,0) top-left).
        You are given the current drawing as a JSON array of commands; the array
        INDEX (0-based) identifies each existing shape.

        The user asks to add and/or remove things. Respond with ONLY a JSON object:
          { "add": [ <new commands> ], "remove": [ <indices to delete> ] }
        No prose, no markdown, no code fences.

        Rules:
        - NEVER modify, move, restyle, or re-emit an existing shape. To keep a shape,
          simply leave it out of both "add" and "remove".
        - To add new shapes, put new command objects in "add" (same schema and color
          rules as below). Keep coordinates inside 0..800 / 0..600.
        - To delete shapes, put their indices (into the given array) in "remove".
        - If nothing should be added, use "add": []. If nothing removed, "remove": [].
        - Use at most 200 commands in "add".
        - NEVER put a "background" or "clear" command in "add": the background cannot
          be changed in an edit, and clearing is not an additive operation.

        Command schema for items in "add" (each has a "type" field):
        - { "type": "circle", "cx": number, "cy": number, "r": number>0,
            "fill"?: color, "stroke"?: color, "strokeWidth"?: number }
        - { "type": "rect", "x": number, "y": number, "w": number>0, "h": number>0,
            "fill"?: color, "stroke"?: color, "strokeWidth"?: number, "rx"?: number }
        - { "type": "line", "x1": number, "y1": number, "x2": number, "y2": number,
            "color"?: color, "width"?: number }
        - { "type": "triangle", "x1": number, "y1": number, "x2": number, "y2": number,
            "x3": number, "y3": number, "fill"?: color, "stroke"?: color }
        - { "type": "ellipse", "cx": number, "cy": number, "rx": number>0, "ry": number>0,
            "fill"?: color, "stroke"?: color }
        - { "type": "polygon", "points": [{ "x": number, "y": number }, ...>=3],
            "fill"?: color, "stroke"?: color }
        - { "type": "text", "x": number, "y": number, "content": string,
            "font"?: string, "color"?: color, "size"?: number }
        - { "type": "arc", "cx": number, "cy": number, "r": number>0,
            "startAngle": number, "endAngle": number, "color"?: color, "width"?: number }
        Colors must be valid CSS: hex, a lowercase named color, or rgb()/rgba(...).

        Example current drawing: [{"type":"background","color":"skyblue"},{"type":"circle","cx":700,"cy":100,"r":60,"fill":"yellow"}]
        Example request: "remove the sun and add green grass at the bottom".
        Example response: {"add":[{"type":"rect","x":0,"y":520,"w":800,"h":80,"fill":"green"}],"remove":[1]}
        """;

    public async Task<string> GenerateCommandsJsonAsync(string prompt, CancellationToken ct)
    {
        return await CallAsync(SystemPrompt, prompt, ct);
    }

    public async Task<string> GenerateEditJsonAsync(
        string prompt, string currentCommandsJson, CancellationToken ct)
    {
        var userContent =
            $"Current drawing (JSON array, index = position):\n{currentCommandsJson}\n\nUser request: {prompt}";
        return await CallAsync(EditSystemPrompt, userContent, ct);
    }

    // Shared Gemini call used by both create and edit modes: build the request with
    // the given system prompt + user content, retry transient failures, and return
    // the model's extracted text.
    private async Task<string> CallAsync(string systemPrompt, string userContent, CancellationToken ct)
    {
        // Gemini 2.5 models "think" by default, and thinking tokens are billed against
        // maxOutputTokens — which can starve the actual JSON and truncate it. Disable
        // thinking for 2.5 models; this whole task is structured output, not reasoning.
        var generationConfig = _options.Model.StartsWith("gemini-2.5", StringComparison.OrdinalIgnoreCase)
            ? (object)new
            {
                maxOutputTokens = _options.MaxOutputTokens,
                temperature = 0.4,
                responseMimeType = "application/json",
                thinkingConfig = new { thinkingBudget = 0 },
            }
            : new
            {
                maxOutputTokens = _options.MaxOutputTokens,
                temperature = 0.4,
                responseMimeType = "application/json",
            };

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = systemPrompt } } },
            contents = new[] { new { parts = new[] { new { text = userContent } } } },
            generationConfig,
        };

        // v1beta generateContent; key passed as a query param.
        var url =
            $"https://generativelanguage.googleapis.com/v1beta/models/{_options.Model}:generateContent?key={_options.ApiKey}";

        var json = JsonSerializer.Serialize(requestBody);

        // Gemini intermittently returns 429 (rate limit) and 503 (model overloaded).
        // Retry transient failures (429 / 5xx / network) a few times with exponential
        // backoff before giving up, since these usually clear within seconds.
        const int maxAttempts = 4;
        HttpResponseMessage? response = null;
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            var isLastAttempt = attempt == maxAttempts;
            try
            {
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                response = await _http.PostAsync(url, content, ct);

                if (IsTransient(response.StatusCode) && !isLastAttempt)
                {
                    _logger.LogWarning(
                        "LLM call returned transient status {Status}, retrying (attempt {Attempt}/{Max}).",
                        (int)response.StatusCode, attempt, maxAttempts);
                    response.Dispose();
                    response = null;
                    await Task.Delay(BackoffDelay(attempt), ct);
                    continue;
                }

                break;
            }
            catch (HttpRequestException ex) when (!isLastAttempt)
            {
                _logger.LogWarning(ex,
                    "LLM call threw transient network error, retrying (attempt {Attempt}/{Max}).",
                    attempt, maxAttempts);
                await Task.Delay(BackoffDelay(attempt), ct);
            }
        }

        if (response is null)
            throw new LlmUnavailableException("LLM provider could not be reached.");

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var body = await SafeReadAsync(response, ct);
                _logger.LogError(
                    "LLM call failed with status {Status}: {Body}",
                    (int)response.StatusCode, body);
                throw new LlmUnavailableException(
                    $"LLM provider returned status {(int)response.StatusCode}.");
            }

            var payload = await response.Content.ReadAsStringAsync(ct);
            return ExtractText(payload);
        }
    }

    private static bool IsTransient(HttpStatusCode status) =>
        status == HttpStatusCode.TooManyRequests || (int)status >= 500;

    // Exponential backoff: ~0.5s, 1s, 2s between retries.
    private static TimeSpan BackoffDelay(int attempt) =>
        TimeSpan.FromMilliseconds(500 * Math.Pow(2, attempt - 1));

    private static async Task<string> SafeReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try { return await response.Content.ReadAsStringAsync(ct); }
        catch { return "<unreadable body>"; }
    }

    // Pull the model's text out of the Gemini candidates envelope.
    private static string ExtractText(string payload)
    {
        try
        {
            using var doc = JsonDocument.Parse(payload);
            var candidate = doc.RootElement.GetProperty("candidates")[0];

            // MAX_TOKENS → the JSON was cut off; surface a clear message rather than
            // letting the truncated text fail later as a generic parse error.
            if (candidate.TryGetProperty("finishReason", out var reason)
                && reason.GetString() == "MAX_TOKENS")
            {
                throw new LlmInvalidResponseException(
                    "LLM response was truncated (hit the output token limit). "
                    + "Increase Llm:MaxOutputTokens or simplify the prompt.",
                    payload);
            }

            var text = candidate
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            if (string.IsNullOrWhiteSpace(text))
                throw new LlmInvalidResponseException("LLM returned an empty response.", payload);

            return StripCodeFences(text);
        }
        catch (LlmInvalidResponseException)
        {
            throw;
        }
        catch (Exception ex) when (ex is KeyNotFoundException or InvalidOperationException or JsonException)
        {
            throw new LlmInvalidResponseException(
                "LLM response envelope was not in the expected shape.", payload);
        }
    }

    // Defensive: strip ```json fences if the model ignores the no-markdown instruction.
    private static string StripCodeFences(string text)
    {
        var trimmed = text.Trim();
        if (!trimmed.StartsWith("```"))
            return trimmed;

        var firstNewline = trimmed.IndexOf('\n');
        if (firstNewline >= 0)
            trimmed = trimmed[(firstNewline + 1)..];

        if (trimmed.EndsWith("```"))
            trimmed = trimmed[..^3];

        return trimmed.Trim();
    }
}
