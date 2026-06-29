namespace backend.Models;

// Application user. Identity is a GUID string (Id) so it can be embedded in the
// JWT `sub` claim and stored as Drawing.UserId without a join. Passwords are
// never stored in plain text — only a BCrypt hash (see AuthService).
public class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString();

    // Stored lowercased + trimmed (AuthService normalizes) so lookups are
    // case-insensitive and the unique index has no near-duplicates.
    public string Email { get; set; } = "";

    // BCrypt hash of the password. Never the password itself.
    public string PasswordHash { get; set; } = "";

    public DateTime CreatedAt { get; set; }

    // A user owns many drawings. The relationship is configured explicitly in
    // AppDbContext with cascade delete (removing a user removes their drawings).
    public ICollection<Drawing> Drawings { get; set; } = [];
}
