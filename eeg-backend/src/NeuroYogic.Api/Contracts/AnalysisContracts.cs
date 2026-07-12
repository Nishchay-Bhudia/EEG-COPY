using System.Text.Json.Serialization;

namespace NeuroYogic.Api.Contracts;

/// <summary>Raw EEG epoch request (mirrors the original POST /analyze body).</summary>
public sealed class AnalyzeRequest
{
    [JsonPropertyName("eeg_data")]
    public double[][]? EegData { get; set; }

    [JsonPropertyName("sample_rate")]
    public int SampleRate { get; set; } = 256;

    [JsonPropertyName("blood_oxygen")]
    public double? BloodOxygen { get; set; }

    [JsonPropertyName("heart_rate")]
    public double? HeartRate { get; set; }

    /// <summary>Optional: persist this epoch under a meditation session (requires auth).</summary>
    [JsonPropertyName("session_id")]
    public Guid? SessionId { get; set; }
}

/// <summary>Pre-computed band-power request (mirrors POST /analyze/bands).</summary>
public sealed class AnalyzeBandsRequest
{
    [JsonPropertyName("delta")] public double? Delta { get; set; }
    [JsonPropertyName("theta")] public double? Theta { get; set; }
    [JsonPropertyName("alpha")] public double? Alpha { get; set; }
    [JsonPropertyName("beta")] public double? Beta { get; set; }
    [JsonPropertyName("gamma")] public double? Gamma { get; set; }

    [JsonPropertyName("high_beta")] public double? HighBeta { get; set; }
    [JsonPropertyName("low_beta")] public double? LowBeta { get; set; }
    [JsonPropertyName("alpha_left")] public double? AlphaLeft { get; set; }
    [JsonPropertyName("alpha_right")] public double? AlphaRight { get; set; }
    [JsonPropertyName("faa")] public double? Faa { get; set; }
    [JsonPropertyName("plv")] public double? Plv { get; set; }
    [JsonPropertyName("blood_oxygen")] public double? BloodOxygen { get; set; }
    [JsonPropertyName("heart_rate")] public double? HeartRate { get; set; }

    [JsonPropertyName("session_id")] public Guid? SessionId { get; set; }
}
