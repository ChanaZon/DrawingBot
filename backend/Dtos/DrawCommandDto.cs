namespace backend.Dtos;

// Transport layer (Layer 1) — mirror of the frontend Zod DrawCommand
// (types/DrawCommand.ts). Flat DTO: every shape-specific field is nullable;
// the "type" discriminator decides which fields are required. Conditional
// validation lives in Validators/DrawCommandDtoValidator.cs so this stays a
// plain data holder. This is NOT a domain entity — those live under Models/.
public class Point
{
    public double X { get; set; }
    public double Y { get; set; }
}

public class DrawCommandDto
{
    // discriminator: background | clear | circle | rect | line |
    //                triangle | ellipse | polygon | text | arc
    public string Type { get; set; } = "";

    // background
    // (also reused as a generic color field by line/arc/text below)
    public string? Color { get; set; }

    // circle / arc
    public double? Cx { get; set; }
    public double? Cy { get; set; }
    public double? R { get; set; }

    // rect / text / line-start
    public double? X { get; set; }
    public double? Y { get; set; }
    public double? W { get; set; }
    public double? H { get; set; }

    // line / triangle endpoints
    public double? X1 { get; set; }
    public double? Y1 { get; set; }
    public double? X2 { get; set; }
    public double? Y2 { get; set; }
    public double? X3 { get; set; }
    public double? Y3 { get; set; }

    // ellipse / rect corner radius
    public double? Rx { get; set; }
    public double? Ry { get; set; }

    // polygon
    public List<Point>? Points { get; set; }

    // text
    public string? Content { get; set; }
    public string? Font { get; set; }
    public double? Size { get; set; }

    // arc
    public double? StartAngle { get; set; }
    public double? EndAngle { get; set; }

    // shared style
    public string? Fill { get; set; }
    public string? Stroke { get; set; }
    public double? StrokeWidth { get; set; }
    public double? Width { get; set; }
}
