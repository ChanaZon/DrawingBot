using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace backend.Tests;

// Integration tests for POST /api/draw/parse in both modes, using the fake LLM
// (CustomWebAppFactory.Llm) so the response is deterministic. Covers CREATE
// (full commands), EDIT (add + remove), and the EDIT removal-index guard.
public class DrawEndpointTests : IClassFixture<CustomWebAppFactory>
{
    private readonly CustomWebAppFactory _factory;

    public DrawEndpointTests(CustomWebAppFactory factory) => _factory = factory;

    [Fact]
    public async Task Parse_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/draw/parse", new { prompt = "a circle" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Parse_CreateMode_ReturnsFullCommands()
    {
        var client = await _factory.AuthenticatedClientAsync();
        _factory.Llm.OnGenerate = _ =>
            """[{"type":"background","color":"white"},{"type":"circle","cx":400,"cy":300,"r":80,"fill":"red"}]""";

        var response = await client.PostAsJsonAsync("/api/draw/parse", new { prompt = "a red circle" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, body.GetProperty("commands").GetArrayLength());
        Assert.False(body.TryGetProperty("add", out _));
    }

    [Fact]
    public async Task Parse_EditMode_ReturnsAddAndRemove()
    {
        var client = await _factory.AuthenticatedClientAsync();
        _factory.Llm.OnEdit = (_, _) =>
            """{"add":[{"type":"rect","x":0,"y":520,"w":800,"h":80,"fill":"green"}],"remove":[1]}""";

        var request = new
        {
            prompt = "remove the sun and add grass",
            currentCommands = new object[]
            {
                new { type = "background", color = "skyblue" },
                new { type = "circle", cx = 700, cy = 100, r = 60, fill = "yellow" },
            },
        };

        var response = await client.PostAsJsonAsync("/api/draw/parse", request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, body.GetProperty("add").GetArrayLength());
        Assert.Equal("rect", body.GetProperty("add")[0].GetProperty("type").GetString());
        var remove = body.GetProperty("remove");
        Assert.Equal(1, remove.GetArrayLength());
        Assert.Equal(1, remove[0].GetInt32());
    }

    [Fact]
    public async Task Parse_EditMode_OutOfRangeRemoveIndex_Returns422()
    {
        var client = await _factory.AuthenticatedClientAsync();
        // Current drawing has 2 commands (indices 0,1); index 5 is invalid.
        _factory.Llm.OnEdit = (_, _) => """{"add":[],"remove":[5]}""";

        var request = new
        {
            prompt = "delete shape 5",
            currentCommands = new object[]
            {
                new { type = "background", color = "white" },
                new { type = "circle", cx = 100, cy = 100, r = 20, fill = "red" },
            },
        };

        var response = await client.PostAsJsonAsync("/api/draw/parse", request);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Parse_EditMode_AddingBackground_Returns422()
    {
        var client = await _factory.AuthenticatedClientAsync();
        // A background in "add" would paint over the existing drawing — rejected.
        _factory.Llm.OnEdit = (_, _) =>
            """{"add":[{"type":"background","color":"red"}],"remove":[]}""";

        var request = new
        {
            prompt = "make the background red",
            currentCommands = new object[] { new { type = "background", color = "white" } },
        };

        var response = await client.PostAsJsonAsync("/api/draw/parse", request);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Parse_EditMode_InvalidCurrentCommands_Returns422()
    {
        var client = await _factory.AuthenticatedClientAsync();
        // The LLM must never be consulted: the bad current drawing is rejected first.
        _factory.Llm.OnEdit = (_, _) => throw new Xunit.Sdk.XunitException("LLM should not be called");

        var request = new
        {
            prompt = "add a tree",
            // r must be > 0; this current command is invalid.
            currentCommands = new object[] { new { type = "circle", cx = 100, cy = 100, r = -5, fill = "red" } },
        };

        var response = await client.PostAsJsonAsync("/api/draw/parse", request);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Parse_EditMode_InvalidAddedColor_Returns422()
    {
        var client = await _factory.AuthenticatedClientAsync();
        _factory.Llm.OnEdit = (_, _) =>
            """{"add":[{"type":"circle","cx":10,"cy":10,"r":5,"fill":"not a color!!"}],"remove":[]}""";

        var request = new
        {
            prompt = "add a circle",
            currentCommands = new object[] { new { type = "background", color = "white" } },
        };

        var response = await client.PostAsJsonAsync("/api/draw/parse", request);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", body.GetProperty("error").GetString());
    }
}
