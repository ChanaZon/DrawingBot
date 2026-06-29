using backend.Dtos;
using FluentValidation;

namespace backend.Validators;

// Validates the save/update payload before DrawingService writes it. Bounds
// mirror the DB column limits (AppDbContext / CLAUDE.md schema). The exact
// command vocabulary stays owned by the frontend Zod/SceneObject layer — here we
// only guard persistence (non-empty Kind within the column length, command cap).
public class SaveDrawingRequestValidator : AbstractValidator<SaveDrawingRequest>
{
    // Same cap as the LLM parse path (DrawParsingService.MaxCommands).
    private const int MaxCommands = 200;

    public SaveDrawingRequestValidator()
    {
        RuleFor(r => r.Prompt)
            .NotEmpty().WithMessage("Prompt is required.")
            .MaximumLength(2000);

        RuleFor(r => r.Title)
            .MaximumLength(200)
            .When(r => r.Title is not null);

        RuleFor(r => r.Commands)
            .NotNull().WithMessage("Commands are required.")
            .Must(c => c is { Count: >= 1 }).WithMessage("A drawing needs at least one command.")
            .Must(c => c is null || c.Count <= MaxCommands)
            .WithMessage($"A drawing cannot have more than {MaxCommands} commands.");

        RuleForEach(r => r.Commands).ChildRules(cmd =>
        {
            cmd.RuleFor(c => c.Kind)
                .NotEmpty().WithMessage("Command kind is required.")
                .MaximumLength(50);
        });
    }
}
