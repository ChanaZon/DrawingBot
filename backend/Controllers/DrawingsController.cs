using System.Security.Claims;
using backend.Dtos;
using backend.Services;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/drawings")]
// Every drawings route requires a valid JWT (Phase 5+). Ownership is enforced
// per-action via the caller's user id.
[Authorize]
public class DrawingsController : ControllerBase
{
    private readonly IDrawingService _drawings;
    private readonly IValidator<SaveDrawingRequest> _saveValidator;

    public DrawingsController(
        IDrawingService drawings,
        IValidator<SaveDrawingRequest> saveValidator)
    {
        _drawings = drawings;
        _saveValidator = saveValidator;
    }

    // POST /api/drawings — save a new drawing for the current user.
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SaveDrawingRequest request, CancellationToken ct)
    {
        var validation = _saveValidator.Validate(request);
        if (!validation.IsValid)
            return ValidationProblemResponse(validation);

        var userId = CurrentUserId();
        var created = await _drawings.CreateAsync(userId, request, ct);

        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    // GET /api/drawings?page=1&pageSize=20 — list the current user's drawings.
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var userId = CurrentUserId();
        var result = await _drawings.ListAsync(userId, page, pageSize, ct);
        return Ok(result);
    }

    // GET /api/drawings/{id} — load one of the current user's drawings.
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var drawing = await _drawings.GetByIdAsync(userId, id, ct);

        // Not-found for both missing and not-owned, so we never reveal that an id
        // belongs to another user.
        return drawing is null ? NotFoundResponse(id) : Ok(drawing);
    }

    // PUT /api/drawings/{id} — replace prompt + commands of an owned drawing.
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(
        int id, [FromBody] SaveDrawingRequest request, CancellationToken ct)
    {
        var validation = _saveValidator.Validate(request);
        if (!validation.IsValid)
            return ValidationProblemResponse(validation);

        var userId = CurrentUserId();
        var updated = await _drawings.UpdateAsync(userId, id, request, ct);

        return updated is null ? NotFoundResponse(id) : Ok(updated);
    }

    // DELETE /api/drawings/{id} — delete an owned drawing (cascades commands).
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var deleted = await _drawings.DeleteAsync(userId, id, ct);

        return deleted ? NoContent() : NotFoundResponse(id);
    }

    // The authenticated user's id, from the JWT NameIdentifier/sub claim. Non-null
    // because [Authorize] guarantees an authenticated principal reached here.
    private string CurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new InvalidOperationException("Authenticated request is missing a user id claim.");

    private IActionResult NotFoundResponse(int id) =>
        NotFound(new { error = "not_found", message = $"Drawing {id} was not found." });

    // 422 with field-level errors, matching the validation_failed shape used by
    // the other controllers so the frontend handles one error contract.
    private IActionResult ValidationProblemResponse(FluentValidation.Results.ValidationResult validation)
    {
        var errors = validation.Errors
            .Select(e => new { field = e.PropertyName, message = e.ErrorMessage });
        return UnprocessableEntity(new { error = "validation_failed", errors });
    }
}
