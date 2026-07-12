namespace NeuroYogic.Infrastructure.Identity;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "neuro-yogic";
    public string Audience { get; set; } = "neuro-yogic-clients";

    /// <summary>Symmetric signing key. MUST be overridden in production (≥32 chars).</summary>
    public string SigningKey { get; set; } = "dev-only-insecure-signing-key-change-me-please-32b";

    public int ExpiryMinutes { get; set; } = 120;
}
