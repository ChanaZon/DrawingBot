using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Data;

// EF Core context (CLAUDE.md > Database Schema). Maps the normalized model:
// User 1—* Drawing 1—* DrawingCommand. Provider (SQL Server) is wired in
// Program.cs so the context stays provider-agnostic for testing.
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Drawing> Drawings => Set<Drawing>();
    public DbSet<DrawingCommand> DrawingCommands => Set<DrawingCommand>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Email).HasMaxLength(256).IsRequired();
            // One account per email; lookups in AuthService rely on this.
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.PasswordHash).IsRequired();

            // Explicit User 1—* Drawing relationship so the cascade is intentional,
            // not an EF convention surprise: deleting a user removes their drawings
            // (and, transitively, those drawings' command rows).
            entity.HasMany(u => u.Drawings)
                .WithOne()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Drawing>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.Property(d => d.UserId).HasMaxLength(450).IsRequired();
            entity.Property(d => d.Prompt).HasMaxLength(2000).IsRequired();
            entity.Property(d => d.Title).HasMaxLength(200);
            // Speeds up the per-user list query (GET /api/drawings).
            entity.HasIndex(d => d.UserId);

            entity.HasMany(d => d.Commands)
                .WithOne(c => c.Drawing)
                .HasForeignKey(c => c.DrawingId)
                // Deleting a Drawing removes its command rows (CLAUDE.md schema).
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DrawingCommand>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Kind).HasMaxLength(50).IsRequired();
            entity.Property(c => c.ParamsJson).IsRequired();
        });
    }
}
