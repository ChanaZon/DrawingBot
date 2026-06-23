namespace backend.Services;

// Bound to the "Llm" section of appsettings (see CLAUDE.md > Environment Variables).
public class LlmOptions
{
    public const string SectionName = "Llm";

    public string Provider { get; set; } = "gemini";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "gemini-2.0-flash";
    public int MaxOutputTokens { get; set; } = 2048;
    public int TimeoutSeconds { get; set; } = 30;
}
