namespace backend.Models;

// Aggregate root for a saved drawing (CLAUDE.md > Database Schema). The command
// list is normalized into child DrawingCommand rows — never a single
// CommandsJson blob — so commands stay queryable and reorderable.
public class Drawing
{
    public int Id { get; set; }

    // Owner. Matches User.Id (the JWT `sub`/NameIdentifier claim). Every read /
    // update / delete filters by this so users only ever touch their own rows.
    public string UserId { get; set; } = "";

    public string Prompt { get; set; } = "";
    public string? Title { get; set; }

    // Base64 data-URL thumbnail (canvas.toDataURL), produced by the frontend in
    // Phase 6. Nullable: a drawing can be saved without one.
    public string? ThumbnailB64 { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<DrawingCommand> Commands { get; set; } = [];
}
