using backend.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace backend.Tests;

// Boots the real app (full HTTP pipeline + JWT auth + validation + EF) but points
// the DbContext at an in-memory SQLite database instead of SQL Server. SQLite is
// chosen over EF InMemory because it actually enforces the relational invariants
// we care about: the unique email index and cascade delete of command rows.
public class CustomWebAppFactory : WebApplicationFactory<Program>
{
    // A single connection kept open for the factory's lifetime: ":memory:" SQLite
    // databases vanish when their last connection closes, so this keeps the schema
    // and data alive across requests.
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public CustomWebAppFactory()
    {
        // Supply Jwt config via environment variables (highest config precedence,
        // read at builder-creation time). This matters because Program.cs reads the
        // signing key eagerly for the bearer middleware, while AuthService resolves
        // it later via IOptions — both must see the SAME secret or tokens signed by
        // one path fail validation in the other. Env vars are visible to both reads
        // and override the gitignored appsettings.Development.json.
        Environment.SetEnvironmentVariable("Jwt__Secret", "integration-test-signing-secret-0123456789abcdef");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "drawing-bot");
        Environment.SetEnvironmentVariable("Jwt__Audience", "drawing-bot");
        Environment.SetEnvironmentVariable("Jwt__ExpiryHours", "1");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();

        builder.ConfigureServices(services =>
        {
            // Drop every SQL Server DbContext registration before re-pointing at
            // SQLite. EF Core 10 registers the provider not only via
            // DbContextOptions<AppDbContext> but also an
            // IDbContextOptionsConfiguration<AppDbContext> that carries the
            // UseSqlServer call — leaving it in place would register two providers.
            var toRemove = services.Where(d =>
                d.ServiceType == typeof(AppDbContext) ||
                d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                (d.ServiceType.IsGenericType
                 && d.ServiceType.GetGenericTypeDefinition().Name.StartsWith("IDbContextOptionsConfiguration")
                 && d.ServiceType.GetGenericArguments()[0] == typeof(AppDbContext)))
                .ToList();
            foreach (var descriptor in toRemove)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));
        });
    }

    // Create the schema once, on the real host's service provider (not a throwaway
    // container built inside ConfigureServices), right after the host is built and
    // before any request runs. The shared open _connection keeps it alive.
    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

        return host;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
            // Undo the process-wide env vars set in the constructor so this factory
            // doesn't leak JWT config into unrelated tests.
            Environment.SetEnvironmentVariable("Jwt__Secret", null);
            Environment.SetEnvironmentVariable("Jwt__Issuer", null);
            Environment.SetEnvironmentVariable("Jwt__Audience", null);
            Environment.SetEnvironmentVariable("Jwt__ExpiryHours", null);
        }
    }
}
