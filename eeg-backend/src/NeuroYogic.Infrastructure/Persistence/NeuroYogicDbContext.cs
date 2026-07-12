using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Infrastructure.Persistence;

public sealed class NeuroYogicDbContext : DbContext
{
    public NeuroYogicDbContext(DbContextOptions<NeuroYogicDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<MeditationSession> Sessions => Set<MeditationSession>();
    public DbSet<AnalysisRecord> Records => Set<AnalysisRecord>();
    public DbSet<DepthProbe> Probes => Set<DepthProbe>();
    public DbSet<SessionWatchToken> WatchTokens => Set<SessionWatchToken>();
    public DbSet<ActivityType> ActivityTypes => Set<ActivityType>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<LiveStream> LiveStreams => Set<LiveStream>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            // Email and Username are both optional but each unique when present
            // (a nullable unique index permits many rows with no value).
            e.Property(x => x.Email).HasMaxLength(256);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Username).HasMaxLength(64);
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.DisplayName).HasMaxLength(128);
            e.Property(x => x.PasswordHash).IsRequired();
            e.Property(x => x.Role).HasMaxLength(32);
            e.HasMany(x => x.Sessions).WithOne(s => s.User!).HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<MeditationSession>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Label).HasMaxLength(200);
            e.Property(x => x.Activity).HasMaxLength(120);
            e.HasIndex(x => new { x.UserId, x.StartedAt });
            e.HasIndex(x => x.ClientId);
            e.HasMany(x => x.Records).WithOne(r => r.Session!).HasForeignKey(r => r.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Client>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(200);
            e.Property(x => x.Status).HasMaxLength(32);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Protocol).HasMaxLength(200);
            e.Property(x => x.Goal).HasMaxLength(500);
            e.HasIndex(x => x.OwnerId);
            e.HasIndex(x => x.UserId);
        });

        b.Entity<AnalysisRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ChittaBhumi).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.Swara).HasConversion<string>().HasMaxLength(16);
            e.Property(x => x.ContemplativeDepth).HasMaxLength(32);
            e.HasIndex(x => new { x.SessionId, x.Timestamp });
        });

        b.Entity<DepthProbe>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            e.HasIndex(x => new { x.SessionId, x.Timestamp });
            e.HasOne(x => x.Session).WithMany(s => s.Probes).HasForeignKey(x => x.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<SessionWatchToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.SessionId, x.ExpiresAt });
            e.HasOne(x => x.Session).WithMany(s => s.WatchTokens).HasForeignKey(x => x.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ActivityType>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).IsRequired().HasMaxLength(128);
            e.HasIndex(x => x.Name).IsUnique();
            e.HasIndex(x => x.SortOrder);
        });

        b.Entity<LiveStream>(e =>
        {
            e.HasKey(x => x.UserId);   // one live sitting per user
        });

        // SQLite cannot ORDER BY / compare DateTimeOffset stored as TEXT.
        // Store it as a sortable binary long so ordering and range queries work.
        if (Database.IsSqlite())
        {
            var converter = new DateTimeOffsetToBinaryConverter();
            foreach (var entityType in b.Model.GetEntityTypes())
                foreach (var prop in entityType.GetProperties())
                    if (prop.ClrType == typeof(DateTimeOffset) || prop.ClrType == typeof(DateTimeOffset?))
                        prop.SetValueConverter(converter);
        }
    }
}
