namespace backend.Services;

// Bound from the "Jwt" section of configuration (appsettings.Development.json /
// env vars). The Secret is sensitive and lives only in gitignored config — never
// in source or appsettings.json. Mirrors the LlmOptions pattern.
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = "";
    public string Issuer { get; set; } = "drawing-bot";
    public string Audience { get; set; } = "drawing-bot";

    // Token lifetime. Kept generous for a dev/demo app; tighten for production.
    public int ExpiryHours { get; set; } = 24;
}
