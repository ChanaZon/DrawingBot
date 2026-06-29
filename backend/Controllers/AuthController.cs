using backend.Dtos;
using backend.Services;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/auth")]
// The only anonymous routes in the app: you need these to obtain a token.
[AllowAnonymous]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly IValidator<RegisterRequest> _registerValidator;
    private readonly IValidator<LoginRequest> _loginValidator;

    public AuthController(
        IAuthService auth,
        IValidator<RegisterRequest> registerValidator,
        IValidator<LoginRequest> loginValidator)
    {
        _auth = auth;
        _registerValidator = registerValidator;
        _loginValidator = loginValidator;
    }

    // POST /api/auth/register — create an account, return a JWT.
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        var validation = _registerValidator.Validate(request);
        if (!validation.IsValid)
            return ValidationProblemResponse(validation);

        var result = await _auth.RegisterAsync(request.Email, request.Password, ct);

        if (result.IsSuccess)
            return Ok(result.Value);

        return MapError(result.Error!);
    }

    // POST /api/auth/login — verify credentials, return a JWT.
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var validation = _loginValidator.Validate(request);
        if (!validation.IsValid)
            return ValidationProblemResponse(validation);

        var result = await _auth.LoginAsync(request.Email, request.Password, ct);

        if (result.IsSuccess)
            return Ok(result.Value);

        return MapError(result.Error!);
    }

    // Map a domain auth error to the matching HTTP status + body.
    private IActionResult MapError(AuthError error) => error.Code switch
    {
        AuthErrorCode.EmailAlreadyExists =>
            Conflict(new { error = "email_already_exists", message = error.Message }),

        AuthErrorCode.InvalidCredentials =>
            Unauthorized(new { error = "invalid_credentials", message = error.Message }),

        _ => StatusCode(500, new { error = "unknown", message = error.Message }),
    };

    // 422 with field-level errors, matching the validation_failed shape used by
    // /api/draw/parse so the frontend can handle one error contract.
    private IActionResult ValidationProblemResponse(FluentValidation.Results.ValidationResult validation)
    {
        var errors = validation.Errors
            .Select(e => new { field = e.PropertyName, message = e.ErrorMessage });
        return UnprocessableEntity(new { error = "validation_failed", errors });
    }
}
