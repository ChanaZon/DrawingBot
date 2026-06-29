using System.Net.Http.Headers;
using System.Net.Http.Json;
using backend.Dtos;

namespace backend.Tests;

// Shared helpers for the integration tests: register a user and attach the JWT.
// Requests reuse the real backend DTOs so the tests exercise the actual contract.
public static class ApiHelpers
{
    // Build a body for one command. params is a keyword, hence @params; it
    // serializes as the "params" JSON object the API expects.
    public static object Command(string kind, object @params) => new { kind, @params };

    public static object SaveBody(string prompt, params object[] commands) =>
        new { prompt, title = (string?)null, thumbnailB64 = (string?)null, commands };

    // Register a fresh user and return the issued token + user id.
    public static async Task<(string Token, string UserId)> RegisterAsync(
        HttpClient client, string? email = null, string password = "password123")
    {
        email ??= $"user_{Guid.NewGuid():N}@test.com";

        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password });
        response.EnsureSuccessStatusCode();

        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return (auth!.Token, auth.UserId);
    }

    // A client whose Authorization header carries a freshly-registered user's JWT.
    public static async Task<HttpClient> AuthenticatedClientAsync(
        this CustomWebAppFactory factory, string? email = null)
    {
        var client = factory.CreateClient();
        var (token, _) = await RegisterAsync(client, email);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
