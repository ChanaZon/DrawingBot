namespace backend.Dtos;

// Request/response contracts for /api/auth. Validation (lengths, email shape)
// lives in Validators/; these stay plain data holders.
public record RegisterRequest(string Email, string Password);

public record LoginRequest(string Email, string Password);

// Returned on successful register/login. The token is a signed JWT the frontend
// stores and sends as `Authorization: Bearer <token>` on protected routes.
public record AuthResponse(string Token, string UserId, string Email, DateTime ExpiresAt);
