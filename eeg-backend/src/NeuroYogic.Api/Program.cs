using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NeuroYogic.Analysis;
using NeuroYogic.Api.Hubs;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure;
using NeuroYogic.Infrastructure.Identity;
using NeuroYogic.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// ── MVC + JSON ──
builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        o.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR(o =>
{
    o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    // Raw multichannel EEG epochs (e.g. 256 Hz × 4 s × 4 ch) exceed the 32 KB default.
    o.MaximumReceiveMessageSize = 2 * 1024 * 1024;
});
builder.Services.AddHealthChecks();

// ── Application layers ──
builder.Services.AddEegAnalysis();
builder.Services.AddInfrastructure(builder.Configuration);

// AI Baba chat (Groq over HttpClient).
builder.Services.AddHttpClient();
builder.Services.AddScoped<NeuroYogic.Api.Services.IChatService, NeuroYogic.Api.Services.GroqChatService>();

// ── CORS (open by default; restrict via Cors:Origins) ──
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if (corsOrigins is { Length: > 0 })
        policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    else
        policy.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
}));

// ── JWT authentication ──
// The validation key is bound from IOptions<JwtOptions> (resolved at runtime),
// matching the key used for token *creation* in JwtTokenService — a single
// source of truth that also survives configuration overrides in tests.
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Allow JWT via query string for the SignalR websocket handshake.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/eeg"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            },
        };
    });

builder.Services
    .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtOptions) =>
    {
        var jwt = jwtOptions.Value;
        bearer.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
// Role policies mirroring the eeg-ui middleware (control-hub role vocabulary:
// admin = superadmin, co-admin = instructor, user = student).
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdmin", p => p.RequireRole("admin"));
    options.AddPolicy("RequireElevated", p => p.RequireRole("admin", "co-admin"));
});

var app = builder.Build();

// ── Database bootstrap (migrations when present, else EnsureCreated) ──
// Serialized process-wide: WebApplicationFactory may resolve the host more than
// once, and concurrent Migrate() calls on the same database race. The lock is a
// no-op in production (single host build).
lock (Program.BootstrapGate)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<NeuroYogicDbContext>();
    // Migrate() owns the schema when migrations exist — it is idempotent via the
    // __EFMigrationsHistory table, so repeated bootstrap runs (e.g. WebApplicationFactory
    // resolving the host more than once) are safe. Fall back to EnsureCreated only when
    // no migrations are defined or the provider is non-relational (in-memory).
    if (db.Database.IsRelational() && db.Database.GetMigrations().Any())
        db.Database.Migrate();
    else
        db.Database.EnsureCreated();

    // Seed the superadmin (username 'admin') on first boot, mirroring the
    // control hub. Password from Admin:SeedPassword (env Admin__SeedPassword).
    if (!db.Users.Any(u => u.Role == "admin"))
    {
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        db.Users.Add(new User
        {
            Username = "admin",
            DisplayName = "Administrator",
            Role = "admin",
            PasswordHash = hasher.Hash(app.Configuration["Admin:SeedPassword"] ?? "admin123"),
            CreatedAt = clock.GetUtcNow(),
        });
        // The unique Username index is the real guard: if another host build
        // (WebApplicationFactory resolves the host more than once) seeded first,
        // swallow the duplicate rather than crash startup.
        try { db.SaveChanges(); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); }
    }

    // Seed the default practice vocabulary on first boot (ported from schema.sql).
    if (!db.ActivityTypes.Any())
    {
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        var now = clock.GetUtcNow();
        var seed = new (string Name, int Order)[]
        {
            ("Dhyāna (meditation)", 10), ("Dhāraṇā (concentration)", 20), ("Japa / Mantra", 30),
            ("Trāṭaka (gazing)", 40), ("Nāḍī Śodhana (alternate-nostril)", 50), ("Kapālabhāti", 60),
            ("Bhastrikā", 70), ("Ujjāyī", 80), ("So’ham / Ajapa", 90),
            ("Ānāpāna (breath awareness)", 100), ("Yoga Nidrā", 110), ("Śavāsana / rest", 120),
            ("Open awareness", 130),
        };
        foreach (var (name, order) in seed)
            db.ActivityTypes.Add(new ActivityType { Name = name, SortOrder = order, CreatedAt = now });
        try { db.SaveChanges(); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); }
    }
}

// One-off data migration from the legacy Express Postgres:
//   dotnet NeuroYogic.Api.dll --import-from "Host=…;Database=eeg;Username=…;Password=…"
var importIdx = Array.IndexOf(args, "--import-from");
if (importIdx >= 0 && importIdx + 1 < args.Length)
{
    using var importScope = app.Services.CreateScope();
    var importer = new NeuroYogic.Infrastructure.Services.DataImporter(
        importScope.ServiceProvider.GetRequiredService<NeuroYogicDbContext>());
    var summary = await importer.ImportAsync(args[importIdx + 1]);
    Console.WriteLine("── Data import complete ──\n" + summary);
    return;
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

// Serve the bundled Vue SPA (copied into wwwroot by the Docker build). Harmless
// when wwwroot is empty (API-only dev): the fallback simply 404s unmatched paths.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<EegStreamHub>("/hubs/eeg").RequireAuthorization();
app.MapHealthChecks("/health");
// Any non-API, non-file path → the SPA shell (client-side routing).
app.MapFallbackToFile("index.html");

app.Run();

// Exposed for WebApplicationFactory-based integration tests.
public partial class Program
{
    /// <summary>Process-wide gate serializing database bootstrap across host builds.</summary>
    internal static readonly object BootstrapGate = new();
}
