namespace backend.Models;

// One normalized command row (CLAUDE.md > Database Schema). SortOrder preserves
// the original draw order; Kind is the discriminator ("circle", "rect", ...);
// ParamsJson holds just that command's own fields as JSON. Cascade-deleted with
// its parent Drawing.
public class DrawingCommand
{
    public int Id { get; set; }
    public int DrawingId { get; set; }

    public int SortOrder { get; set; }
    public string Kind { get; set; } = "";
    public string ParamsJson { get; set; } = "";

    public Drawing Drawing { get; set; } = null!;
}
