namespace backend.Services;

// Why a register/login attempt failed. The service returns one inside a Result;
// AuthController maps the Code to an HTTP status. Keeps HTTP out of the service.
public enum AuthErrorCode
{
    EmailAlreadyExists, // → 409
    InvalidCredentials, // → 401 (same message for unknown email OR wrong password)
}

public record AuthError(AuthErrorCode Code, string Message);
