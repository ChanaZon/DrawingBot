using System.Net;
using System.Net.Http.Json;
using backend.Dtos;
using Xunit;

namespace backend.Tests;

// Integration tests for /api/auth (register + login). Exercise the full pipeline:
// validation → AuthService (BCrypt + JWT) → EF (unique email index) → HTTP.
public class AuthEndpointsTests : IClassFixture<CustomWebAppFactory>
{
    private readonly CustomWebAppFactory _factory;

    public AuthEndpointsTests(CustomWebAppFactory factory) => _factory = factory;

    [Fact]
    public async Task Register_WithValidPayload_ReturnsTokenAndUserId()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email = "new.user@test.com", password = "password123" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.False(string.IsNullOrWhiteSpace(auth!.Token));
        Assert.False(string.IsNullOrWhiteSpace(auth.UserId));
        Assert.Equal("new.user@test.com", auth.Email);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var client = _factory.CreateClient();
        var email = $"dup_{Guid.NewGuid():N}@test.com";

        var first = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Register_NormalizesEmail_SoCaseDifferingDuplicateIsRejected()
    {
        var client = _factory.CreateClient();
        var local = $"case_{Guid.NewGuid():N}";

        var first = await client.PostAsJsonAsync("/api/auth/register",
            new { email = $"{local}@test.com", password = "password123" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Same address, different casing — must collide with the normalized record.
        var second = await client.PostAsJsonAsync("/api/auth/register",
            new { email = $"{local.ToUpperInvariant()}@TEST.com", password = "password123" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Theory]
    [InlineData("not-an-email", "password123")] // bad email shape
    [InlineData("ok@test.com", "short")]          // password under 8 chars
    [InlineData("", "password123")]               // missing email
    public async Task Register_InvalidPayload_Returns422(string email, string password)
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsToken()
    {
        var client = _factory.CreateClient();
        var email = $"login_{Guid.NewGuid():N}@test.com";
        await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "password123" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.False(string.IsNullOrWhiteSpace(auth!.Token));
    }

    [Fact]
    public async Task Login_WrongPassword_Returns401()
    {
        var client = _factory.CreateClient();
        var email = $"wrongpw_{Guid.NewGuid():N}@test.com";
        await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123" });

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "wrong-password" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_UnknownEmail_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new { email = $"ghost_{Guid.NewGuid():N}@test.com", password = "password123" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
