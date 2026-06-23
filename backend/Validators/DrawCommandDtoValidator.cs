using backend.Dtos;
using FluentValidation;

namespace backend.Validators;

// Server-side mirror of the frontend Zod schema (types/DrawCommand.ts).
// Each shape's required fields are enforced conditionally on the discriminator.
public class DrawCommandDtoValidator : AbstractValidator<DrawCommandDto>
{
    // Same CSS color rule as the Zod ColorField:
    // hex (#rgb..#rrggbbaa), lowercase named color, or rgb/rgba(...)
    private const string ColorPattern = @"^(#[0-9a-fA-F]{3,8}|[a-z]+|rgba?\(.+\))$";

    private static readonly string[] KnownTypes =
    [
        "background", "clear", "circle", "rect", "line",
        "triangle", "ellipse", "polygon", "text", "arc",
    ];

    public DrawCommandDtoValidator()
    {
        RuleFor(c => c.Type)
            .NotEmpty()
            .Must(t => KnownTypes.Contains(t))
            .WithMessage("Unknown command type.");

        // background
        When(c => c.Type == "background", () =>
        {
            RuleFor(c => c.Color).NotNull().WithMessage("background requires color.");
            OptionalColorRule(c => c.Color);
        });

        // circle
        When(c => c.Type == "circle", () =>
        {
            RuleFor(c => c.Cx).NotNull();
            RuleFor(c => c.Cy).NotNull();
            RuleFor(c => c.R).NotNull().GreaterThan(0);
            OptionalColorRule(c => c.Fill);
            OptionalColorRule(c => c.Stroke);
        });

        // rect
        When(c => c.Type == "rect", () =>
        {
            RuleFor(c => c.X).NotNull();
            RuleFor(c => c.Y).NotNull();
            RuleFor(c => c.W).NotNull().GreaterThan(0);
            RuleFor(c => c.H).NotNull().GreaterThan(0);
            OptionalColorRule(c => c.Fill);
            OptionalColorRule(c => c.Stroke);
        });

        // line
        When(c => c.Type == "line", () =>
        {
            RuleFor(c => c.X1).NotNull();
            RuleFor(c => c.Y1).NotNull();
            RuleFor(c => c.X2).NotNull();
            RuleFor(c => c.Y2).NotNull();
            OptionalColorRule(c => c.Color);
        });

        // triangle
        When(c => c.Type == "triangle", () =>
        {
            RuleFor(c => c.X1).NotNull();
            RuleFor(c => c.Y1).NotNull();
            RuleFor(c => c.X2).NotNull();
            RuleFor(c => c.Y2).NotNull();
            RuleFor(c => c.X3).NotNull();
            RuleFor(c => c.Y3).NotNull();
            OptionalColorRule(c => c.Fill);
            OptionalColorRule(c => c.Stroke);
        });

        // ellipse
        When(c => c.Type == "ellipse", () =>
        {
            RuleFor(c => c.Cx).NotNull();
            RuleFor(c => c.Cy).NotNull();
            RuleFor(c => c.Rx).NotNull().GreaterThan(0);
            RuleFor(c => c.Ry).NotNull().GreaterThan(0);
            OptionalColorRule(c => c.Fill);
            OptionalColorRule(c => c.Stroke);
        });

        // polygon
        When(c => c.Type == "polygon", () =>
        {
            RuleFor(c => c.Points)
                .NotNull()
                .Must(p => p is { Count: >= 3 })
                .WithMessage("polygon requires at least 3 points.");
            OptionalColorRule(c => c.Fill);
            OptionalColorRule(c => c.Stroke);
        });

        // text
        When(c => c.Type == "text", () =>
        {
            RuleFor(c => c.X).NotNull();
            RuleFor(c => c.Y).NotNull();
            RuleFor(c => c.Content).NotNull().MaximumLength(500);
            OptionalColorRule(c => c.Color);
        });

        // arc
        When(c => c.Type == "arc", () =>
        {
            RuleFor(c => c.Cx).NotNull();
            RuleFor(c => c.Cy).NotNull();
            RuleFor(c => c.R).NotNull().GreaterThan(0);
            RuleFor(c => c.StartAngle).NotNull();
            RuleFor(c => c.EndAngle).NotNull();
            OptionalColorRule(c => c.Color);
        });
    }

    // Validate the CSS color pattern only when the field is present.
    // Required-ness (e.g. background.color) is enforced separately with NotNull.
    private void OptionalColorRule(System.Linq.Expressions.Expression<Func<DrawCommandDto, string?>> selector)
    {
        RuleFor(selector)
            .Matches(ColorPattern)
            .When(c => selector.Compile()(c) != null)
            .WithMessage("invalid CSS color");
    }
}
