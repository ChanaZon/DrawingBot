using System.Net;
using System.Net.Http.Json;
using backend.Dtos;
using Xunit;

namespace backend.Tests;

// Integration tests for /api/drawings. Cover auth gating, the full CRUD
// round-trip (including that nested command params survive persistence), and —
// most importantly — ownership: one user can never read, update, or delete
// another user's drawing (the server reports 404, never another user's data).
public class DrawingsEndpointsTests : IClassFixture<CustomWebAppFactory>
{
    private readonly CustomWebAppFactory _factory;

    public DrawingsEndpointsTests(CustomWebAppFactory factory) => _factory = factory;

    [Fact]
    public async Task Create_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("a red circle",
                ApiHelpers.Command("circle", new { cx = 400, cy = 300, r = 50, fill = "red" })));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_ThenGet_RoundTripsAndPreservesCommandParams()
    {
        var client = await _factory.AuthenticatedClientAsync();

        var createResp = await client.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("a red circle",
                ApiHelpers.Command("circle", new { cx = 400, cy = 300, r = 50, fill = "red" })));
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);

        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();
        Assert.NotNull(created);

        var got = await client.GetFromJsonAsync<DrawingDetailDto>($"/api/drawings/{created!.Id}");
        Assert.NotNull(got);
        Assert.Equal("a red circle", got!.Prompt);
        Assert.Single(got.Commands);
        Assert.Equal("circle", got.Commands[0].Kind);
        // Nested params object survives the ParamsJson round-trip.
        Assert.Equal(400, got.Commands[0].Params.GetProperty("cx").GetDouble());
        Assert.Equal("red", got.Commands[0].Params.GetProperty("fill").GetString());
    }

    [Fact]
    public async Task List_ReturnsOnlyCallersDrawings()
    {
        // User A saves two drawings.
        var clientA = await _factory.AuthenticatedClientAsync();
        await clientA.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("a", ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1 })));
        await clientA.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("b", ApiHelpers.Command("circle", new { cx = 2, cy = 2, r = 2 })));

        // User B saves one.
        var clientB = await _factory.AuthenticatedClientAsync();
        await clientB.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("c", ApiHelpers.Command("circle", new { cx = 3, cy = 3, r = 3 })));

        var listA = await clientA.GetFromJsonAsync<PagedResult<DrawingSummaryDto>>("/api/drawings");
        var listB = await clientB.GetFromJsonAsync<PagedResult<DrawingSummaryDto>>("/api/drawings");

        Assert.Equal(2, listA!.Total);
        Assert.Equal(1, listB!.Total);
    }

    [Fact]
    public async Task Update_ReplacesPromptAndCommands()
    {
        var client = await _factory.AuthenticatedClientAsync();

        var createResp = await client.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("first",
                ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1, fill = "red" })));
        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();

        var updateResp = await client.PutAsJsonAsync($"/api/drawings/{created!.Id}",
            ApiHelpers.SaveBody("second",
                ApiHelpers.Command("rect", new { x = 10, y = 20, w = 30, h = 40, fill = "blue" })));
        Assert.Equal(HttpStatusCode.OK, updateResp.StatusCode);

        var updated = await updateResp.Content.ReadFromJsonAsync<DrawingDetailDto>();
        Assert.Equal("second", updated!.Prompt);
        Assert.Single(updated.Commands);
        Assert.Equal("rect", updated.Commands[0].Kind);
        Assert.Equal("blue", updated.Commands[0].Params.GetProperty("fill").GetString());
    }

    [Fact]
    public async Task Delete_ThenGet_Returns404()
    {
        var client = await _factory.AuthenticatedClientAsync();

        var createResp = await client.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("doomed", ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1 })));
        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();

        var deleteResp = await client.DeleteAsync($"/api/drawings/{created!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResp.StatusCode);

        var getResp = await client.GetAsync($"/api/drawings/{created.Id}");
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);
    }

    [Fact]
    public async Task Create_WithNoCommands_Returns422()
    {
        var client = await _factory.AuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("empty")); // zero commands

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    // ---- Ownership: the core Phase 5 invariant ----

    [Fact]
    public async Task Get_OtherUsersDrawing_Returns404()
    {
        var owner = await _factory.AuthenticatedClientAsync();
        var createResp = await owner.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("owned", ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1 })));
        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();

        var intruder = await _factory.AuthenticatedClientAsync();
        var response = await intruder.GetAsync($"/api/drawings/{created!.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_OtherUsersDrawing_Returns404AndDoesNotMutate()
    {
        var owner = await _factory.AuthenticatedClientAsync();
        var createResp = await owner.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("owned", ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1 })));
        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();

        var intruder = await _factory.AuthenticatedClientAsync();
        var updateResp = await intruder.PutAsJsonAsync($"/api/drawings/{created!.Id}",
            ApiHelpers.SaveBody("hijacked", ApiHelpers.Command("rect", new { x = 0, y = 0, w = 1, h = 1 })));
        Assert.Equal(HttpStatusCode.NotFound, updateResp.StatusCode);

        // The owner's drawing is untouched.
        var stillOwned = await owner.GetFromJsonAsync<DrawingDetailDto>($"/api/drawings/{created.Id}");
        Assert.Equal("owned", stillOwned!.Prompt);
    }

    [Fact]
    public async Task Delete_OtherUsersDrawing_Returns404AndKeepsRow()
    {
        var owner = await _factory.AuthenticatedClientAsync();
        var createResp = await owner.PostAsJsonAsync("/api/drawings",
            ApiHelpers.SaveBody("owned", ApiHelpers.Command("circle", new { cx = 1, cy = 1, r = 1 })));
        var created = await createResp.Content.ReadFromJsonAsync<DrawingDetailDto>();

        var intruder = await _factory.AuthenticatedClientAsync();
        var deleteResp = await intruder.DeleteAsync($"/api/drawings/{created!.Id}");
        Assert.Equal(HttpStatusCode.NotFound, deleteResp.StatusCode);

        // The owner can still load it.
        var getResp = await owner.GetAsync($"/api/drawings/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
    }
}
