using System.Text.Json;
using backend.Data;
using backend.Dtos;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public interface IDrawingService
{
    Task<DrawingDetailDto> CreateAsync(string userId, SaveDrawingRequest request, CancellationToken ct);

    Task<PagedResult<DrawingSummaryDto>> ListAsync(string userId, int page, int pageSize, CancellationToken ct);

    // Null = no drawing with that id owned by this user (controller → 404).
    Task<DrawingDetailDto?> GetByIdAsync(string userId, int id, CancellationToken ct);

    // Null = not found / not owned (controller → 404).
    Task<DrawingDetailDto?> UpdateAsync(string userId, int id, SaveDrawingRequest request, CancellationToken ct);

    // False = not found / not owned (controller → 404).
    Task<bool> DeleteAsync(string userId, int id, CancellationToken ct);
}

// Data access for saved drawings. Ownership is non-negotiable: every read /
// update / delete filters by userId and reports not-found (never forbidden
// detail) when the row is not the caller's. Command rows are stored normalized
// (one DrawingCommand per command) and cascade-delete with their parent.
public class DrawingService : IDrawingService
{
    private const int MaxPageSize = 100;

    private readonly AppDbContext _db;

    public DrawingService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<DrawingDetailDto> CreateAsync(
        string userId, SaveDrawingRequest request, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        var drawing = new Drawing
        {
            UserId = userId,
            Prompt = request.Prompt,
            Title = request.Title,
            ThumbnailB64 = request.ThumbnailB64,
            CreatedAt = now,
            UpdatedAt = now,
            Commands = ToCommandEntities(request.Commands),
        };

        _db.Drawings.Add(drawing);
        await _db.SaveChangesAsync(ct);

        return ToDetailDto(drawing);
    }

    public async Task<PagedResult<DrawingSummaryDto>> ListAsync(
        string userId, int page, int pageSize, CancellationToken ct)
    {
        // Defensive clamping so bad query params can't request a huge page or skip.
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 1 : pageSize > MaxPageSize ? MaxPageSize : pageSize;

        var query = _db.Drawings
            .AsNoTracking()
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.UpdatedAt);

        var total = await query.CountAsync(ct);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DrawingSummaryDto(
                d.Id, d.Prompt, d.Title, d.ThumbnailB64, d.CreatedAt, d.UpdatedAt))
            .ToListAsync(ct);

        return new PagedResult<DrawingSummaryDto>(items, page, pageSize, total);
    }

    public async Task<DrawingDetailDto?> GetByIdAsync(string userId, int id, CancellationToken ct)
    {
        var drawing = await _db.Drawings
            .AsNoTracking()
            .Include(d => d.Commands)
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);

        return drawing is null ? null : ToDetailDto(drawing);
    }

    public async Task<DrawingDetailDto?> UpdateAsync(
        string userId, int id, SaveDrawingRequest request, CancellationToken ct)
    {
        // Tracked load (no AsNoTracking) so EF persists the mutations below.
        var drawing = await _db.Drawings
            .Include(d => d.Commands)
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);

        if (drawing is null)
            return null;

        drawing.Prompt = request.Prompt;
        drawing.Title = request.Title;
        drawing.ThumbnailB64 = request.ThumbnailB64;
        drawing.UpdatedAt = DateTime.UtcNow;

        // Replace the command set wholesale: drop the old rows, insert the new
        // ordered list. Simpler and safer than diffing for a full-scene replace.
        _db.DrawingCommands.RemoveRange(drawing.Commands);
        drawing.Commands = ToCommandEntities(request.Commands);

        await _db.SaveChangesAsync(ct);

        return ToDetailDto(drawing);
    }

    public async Task<bool> DeleteAsync(string userId, int id, CancellationToken ct)
    {
        var drawing = await _db.Drawings
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == userId, ct);

        if (drawing is null)
            return false;

        // Command rows go with it via the cascade delete configured in AppDbContext.
        _db.Drawings.Remove(drawing);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    // Map wire commands to entities, deriving SortOrder from array position and
    // storing each Params object as raw JSON text.
    private static List<DrawingCommand> ToCommandEntities(IReadOnlyList<DrawingCommandDto> commands) =>
        commands
            .Select((c, i) => new DrawingCommand
            {
                SortOrder = i,
                Kind = c.Kind,
                ParamsJson = c.Params.GetRawText(),
            })
            .ToList();

    private static DrawingDetailDto ToDetailDto(Drawing drawing)
    {
        var commands = drawing.Commands
            .OrderBy(c => c.SortOrder)
            // Deserialize back into an independent JsonElement so Params serializes
            // as a nested JSON object (not an escaped string) in the response.
            .Select(c => new DrawingCommandDto(c.Kind, ParseParams(c.ParamsJson)))
            .ToList();

        return new DrawingDetailDto(
            drawing.Id, drawing.Prompt, drawing.Title, drawing.ThumbnailB64,
            drawing.CreatedAt, drawing.UpdatedAt, commands);
    }

    // The read path must not throw on stored data (errors-as-values). A corrupt
    // ParamsJson row degrades to an empty params object instead of a raw 500.
    private static JsonElement ParseParams(string paramsJson)
    {
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(paramsJson);
        }
        catch (JsonException)
        {
            return JsonSerializer.Deserialize<JsonElement>("{}");
        }
    }
}
