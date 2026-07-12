using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Domain.Entities;

/// <summary>
/// A persisted snapshot of one analysed EEG epoch, stored under a
/// <see cref="MeditationSession"/> so meditation progress can be tracked over time.
/// </summary>
public sealed class AnalysisRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public MeditationSession? Session { get; set; }

    public DateTimeOffset Timestamp { get; set; }

    // Classification
    public ChittaBhumi ChittaBhumi { get; set; }
    public double ChittaConfidence { get; set; }
    public string ContemplativeDepth { get; set; } = string.Empty;

    // Swara
    public SwaraNadi Swara { get; set; }

    // Gunas
    public double Sattva { get; set; }
    public double Rajas { get; set; }
    public double Tamas { get; set; }

    // Interpretive scores
    public double VrittiIndex { get; set; }
    public double ContemplativeDepthScore { get; set; }

    // Key features
    public double Faa { get; set; }
    public double Plv { get; set; }
    public double AlphaRelative { get; set; }
    public double HighBetaRelative { get; set; }
    public double GammaRelative { get; set; }

    // Full relative band powers + provenance (control-hub epoch storage).
    public double DeltaRelative { get; set; }
    public double ThetaRelative { get; set; }
    public double BetaRelative { get; set; }
    public int EpochNum { get; set; }
    public double? ElapsedSeconds { get; set; }
    public string? GunaLabel { get; set; }

    // Optional biometrics
    public double? BloodOxygen { get; set; }
    public double? HeartRate { get; set; }
}
