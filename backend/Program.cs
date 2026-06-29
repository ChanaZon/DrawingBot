using System.Text;
using System.Text.Json.Serialization;
using backend.Data;
using backend.Infrastructure;
using backend.Services;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    // Omit null optional fields so the frontend Zod .optional() parse succeeds
    // (Zod optional allows `undefined`, not explicit `null`).
    options.JsonSerializerOptions.DefaultIgnoreCondition =
        JsonIgnoreCondition.WhenWritingNull;
});

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// LLM configuration + typed HttpClient (CLAUDE.md > Security: LLM Calls Move to Backend).
builder.Services.Configure<LlmOptions>(
    builder.Configuration.GetSection(LlmOptions.SectionName));

builder.Services.AddHttpClient<ILlmService, LlmService>((sp, http) =>
{
    var opts = builder.Configuration
        .GetSection(LlmOptions.SectionName)
        .Get<LlmOptions>() ?? new LlmOptions();
    http.Timeout = TimeSpan.FromSeconds(opts.TimeoutSeconds);
});

// FluentValidation: server-side mirror of the frontend Zod schema.
builder.Services.AddValidatorsFromAssemblyContaining<backend.Validators.DrawCommandDtoValidator>();

// Application layer: orchestrates LLM call + parse + validation for /api/draw/parse.
builder.Services.AddScoped<IDrawParsingService, DrawParsingService>();

// Phase 5 — Persistence: EF Core + SQL Server (CLAUDE.md > Database Schema).
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Phase 5 — CRUD + Auth services.
builder.Services.AddScoped<IDrawingService, DrawingService>();
builder.Services.AddScoped<IAuthService, AuthService>();

// Phase 5 — JWT authentication. Secret + issuer/audience come from the "Jwt"
// config section (gitignored appsettings.Development.json / env vars).
builder.Services.Configure<JwtOptions>(
    builder.Configuration.GetSection(JwtOptions.SectionName));

var jwtOptions = builder.Configuration
    .GetSection(JwtOptions.SectionName)
    .Get<JwtOptions>() ?? new JwtOptions();

// Fail loudly at boot on a missing/weak signing key rather than silently booting
// with an empty key that would weaken auth. HMAC-SHA256 needs >= 256 bits.
if (Encoding.UTF8.GetByteCount(jwtOptions.Secret) < 32)
    throw new InvalidOperationException(
        "Jwt:Secret is missing or too short (need at least 32 bytes). " +
        "Set it in appsettings.Development.json or the Jwt__Secret environment variable.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtOptions.Secret)),
            // No grace period on expiry — a stale token is rejected immediately.
            ClockSkew = TimeSpan.Zero,
        };
    });

builder.Services.AddAuthorization();

// Global safety net for UNEXPECTED exceptions → consistent 500 ProblemDetails.
// Domain failures stay as Result + MapError in the controller (never thrown).
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// Allow the Vite dev server to call the API during development.
const string DevCorsPolicy = "DevCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
// Exception handler first: it must wrap everything downstream to catch their faults.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors(DevCorsPolicy);
}

app.UseHttpsRedirection();

// Authentication must run before authorization so [Authorize] sees the principal.
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposes the implicit top-level Program class so the integration test project
// (backend.Tests) can drive the app via WebApplicationFactory<Program>.
public partial class Program { }
