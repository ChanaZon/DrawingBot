using System.Text.Json.Serialization;
using backend.Infrastructure;
using backend.Services;
using FluentValidation;

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

app.UseAuthorization();

app.MapControllers();

app.Run();
