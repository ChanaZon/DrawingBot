namespace backend.Services;

// LLM provider was unreachable / returned 5xx-429 after the retry. → 503 to client.
public class LlmUnavailableException : Exception
{
    public LlmUnavailableException(string message, Exception? inner = null)
        : base(message, inner) { }
}

// LLM responded but the body was not usable JSON (prose, empty, truncated).
// Carries the raw text so the controller can surface it as 422. → 422 to client.
public class LlmInvalidResponseException : Exception
{
    public string Raw { get; }

    public LlmInvalidResponseException(string message, string raw)
        : base(message)
    {
        Raw = raw;
    }
}
