using backend.Dtos;
using FluentValidation;

namespace backend.Validators;

// Validates the login payload. Intentionally light: only presence checks, so we
// never leak whether the email or the password was the problem (that distinction
// is handled uniformly as InvalidCredentials in AuthService).
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().WithMessage("Email is required.");
        RuleFor(r => r.Password).NotEmpty().WithMessage("Password is required.");
    }
}
