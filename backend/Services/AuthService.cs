using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using backend.Common;
using backend.Data;
using backend.Dtos;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace backend.Services;

public interface IAuthService
{
    // Create a new account and return a signed JWT. Fails with EmailAlreadyExists.
    Task<Result<AuthResponse, AuthError>> RegisterAsync(
        string email, string password, CancellationToken ct);

    // Verify credentials and return a signed JWT. Fails with InvalidCredentials.
    Task<Result<AuthResponse, AuthError>> LoginAsync(
        string email, string password, CancellationToken ct);
}

// Owns account creation, credential verification, and JWT minting. Passwords are
// hashed with BCrypt; tokens are signed with the HMAC secret from JwtOptions.
public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly JwtOptions _jwt;

    public AuthService(AppDbContext db, IOptions<JwtOptions> jwt)
    {
        _db = db;
        _jwt = jwt.Value;
    }

    public async Task<Result<AuthResponse, AuthError>> RegisterAsync(
        string email, string password, CancellationToken ct)
    {
        var normalized = Normalize(email);

        // One account per email (also enforced by the unique index as a backstop).
        var exists = await _db.Users.AnyAsync(u => u.Email == normalized, ct);
        if (exists)
            return Fail(AuthErrorCode.EmailAlreadyExists, "An account with this email already exists.");

        var user = new User
        {
            Email = normalized,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            CreatedAt = DateTime.UtcNow,
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return Result<AuthResponse, AuthError>.Success(IssueToken(user));
    }

    public async Task<Result<AuthResponse, AuthError>> LoginAsync(
        string email, string password, CancellationToken ct)
    {
        var normalized = Normalize(email);

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalized, ct);

        // Same error whether the email is unknown or the password is wrong, so we
        // never reveal which emails are registered.
        if (user is null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            return Fail(AuthErrorCode.InvalidCredentials, "Invalid email or password.");

        return Result<AuthResponse, AuthError>.Success(IssueToken(user));
    }

    // Build a signed JWT carrying the user's id (sub/NameIdentifier) and email.
    private AuthResponse IssueToken(User user)
    {
        var expiresAt = DateTime.UtcNow.AddHours(_jwt.ExpiryHours);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds);

        var encoded = new JwtSecurityTokenHandler().WriteToken(token);
        return new AuthResponse(encoded, user.Id, user.Email, expiresAt);
    }

    // Case-insensitive, whitespace-trimmed email so lookups and the unique index
    // treat "User@X.com " and "user@x.com" as the same account.
    private static string Normalize(string email) => email.Trim().ToLowerInvariant();

    private static Result<AuthResponse, AuthError> Fail(AuthErrorCode code, string message) =>
        Result<AuthResponse, AuthError>.Failure(new AuthError(code, message));
}
