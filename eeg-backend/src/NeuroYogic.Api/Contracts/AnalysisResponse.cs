using System.Text.Json.Serialization;
using NeuroYogic.Domain.Analysis;

namespace NeuroYogic.Api.Contracts;

/// <summary>
/// Response shape kept byte-compatible with the original Python API so existing
/// frontends continue to work unchanged.
/// </summary>
public sealed class AnalysisResponse
{
    [JsonPropertyName("chitta_bhumi")] public ChittaBhumiDto ChittaBhumi { get; set; } = new();
    [JsonPropertyName("swara")] public SwaraDto Swara { get; set; } = new();
    [JsonPropertyName("depth")] public string Depth { get; set; } = string.Empty;
    [JsonPropertyName("contemplative_depth_score")] public double ContemplativeDepthScore { get; set; }
    [JsonPropertyName("vritti_index")] public double VrittiIndex { get; set; }
    [JsonPropertyName("nirodha_state")] public string NirodhaState { get; set; } = string.Empty;
    [JsonPropertyName("tattva_flags")] public IReadOnlyList<string> TattvaFlags { get; set; } = Array.Empty<string>();
    [JsonPropertyName("eeg_spectrum")] public IReadOnlyDictionary<string, double> EegSpectrum { get; set; } = new Dictionary<string, double>();
    [JsonPropertyName("band_relative")] public IReadOnlyDictionary<string, double> BandRelative { get; set; } = new Dictionary<string, double>();
    [JsonPropertyName("hemispheric_asymmetry")] public HemisphericDto HemisphericAsymmetry { get; set; } = new();
    [JsonPropertyName("gunas")] public GunasDto Gunas { get; set; } = new();
    [JsonPropertyName("is_padded")] public bool IsPadded { get; set; }

    [JsonPropertyName("complexity")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ComplexityDto? Complexity { get; set; }

    [JsonPropertyName("aperiodic")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AperiodicDto? Aperiodic { get; set; }

    [JsonPropertyName("connectivity")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ConnectivityDto? Connectivity { get; set; }

    [JsonPropertyName("iaf")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Iaf { get; set; }

    [JsonPropertyName("signal_quality")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? SignalQuality { get; set; }

    [JsonPropertyName("artifact_flagged")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? ArtifactFlagged { get; set; }

    [JsonPropertyName("blood_oxygen")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? BloodOxygen { get; set; }

    [JsonPropertyName("heart_rate")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? HeartRate { get; set; }

    [JsonPropertyName("record_id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Guid? RecordId { get; set; }

    public static AnalysisResponse From(AnalysisResult r, Guid? recordId = null)
    {
        var probs = r.Chitta.Probabilities.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);
        var bands = r.Features.BandRelative.ToDictionary();
        return new AnalysisResponse
        {
            ChittaBhumi = new ChittaBhumiDto
            {
                State = r.Chitta.State.ToString(),
                Depth = r.Vedantic.ContemplativeDepth,
                ClassicalGuna = r.Vedantic.ClassicalGuna,
                Confidence = r.Chitta.Confidence,
                Margin = r.Chitta.Margin,
                Indeterminate = r.Chitta.IsIndeterminate,
                Probabilities = probs,
                Corroboration = new CorroborationDto
                {
                    Axes = r.Vedantic.Corroboration.Axes
                        .Select(a => new CorroborationAxisDto
                        {
                            Axis = a.Axis,
                            Reading = a.Reading,
                            Agrees = a.Agrees,
                            Note = a.Note,
                        })
                        .ToList(),
                    Concord = r.Vedantic.Corroboration.Concord,
                    Indeterminate = r.Vedantic.Corroboration.Indeterminate,
                    Caveat = r.Vedantic.Corroboration.Caveat,
                },
            },
            Swara = new SwaraDto
            {
                State = r.Vedantic.Swara.State,
                Confidence = r.Vedantic.Swara.Confidence,
                Note = r.Vedantic.Swara.Note,
            },
            Depth = r.Vedantic.ContemplativeDepth,
            ContemplativeDepthScore = r.Vedantic.ContemplativeDepthScore,
            VrittiIndex = r.Vedantic.VrittiIndex,
            NirodhaState = r.Vedantic.NirodhaState,
            TattvaFlags = r.Vedantic.TattvaFlags,
            EegSpectrum = bands,
            BandRelative = bands,
            HemisphericAsymmetry = new HemisphericDto
            {
                Asymmetry = r.Features.AlphaAsymmetry,
                Faa = r.Features.Faa,
                Plv = r.Features.Plv,
                AlphaLeft = r.Features.AlphaLeft,
                AlphaRight = r.Features.AlphaRight,
            },
            Gunas = new GunasDto
            {
                Sattva = r.Vedantic.Gunas.Sattva,
                Rajas = r.Vedantic.Gunas.Rajas,
                Tamas = r.Vedantic.Gunas.Tamas,
                Label = r.Vedantic.Gunas.Label,
                Dominant = r.Vedantic.Gunas.Dominant?.ToString().ToLowerInvariant(),
                Secondary = r.Vedantic.Gunas.Secondary?.ToString().ToLowerInvariant(),
                Note = r.Vedantic.Gunas.Note,
            },
            IsPadded = r.Features.IsPadded,
            Complexity = r.Features.Complexity is { } cx
                ? new ComplexityDto
                {
                    Lziv = cx.Lziv,
                    HiguchiFd = cx.HiguchiFd,
                    SampleEntropy = cx.SampleEntropy,
                    PermEntropy = cx.PermEntropy,
                }
                : null,
            Aperiodic = r.Features.Aperiodic is { } ap
                ? new AperiodicDto { Exponent = ap.Exponent, Offset = ap.Offset }
                : null,
            Connectivity = r.Features.Connectivity is { } cn
                ? new ConnectivityDto { Wsmi = cn.Wsmi, Plv = r.Features.Plv }
                : null,
            Iaf = r.Features.Iaf,
            SignalQuality = r.Features.SignalQuality,
            ArtifactFlagged = r.Features.ArtifactFlagged,
            BloodOxygen = r.BloodOxygen,
            HeartRate = r.HeartRate,
            RecordId = recordId,
        };
    }
}

public sealed class ChittaBhumiDto
{
    [JsonPropertyName("state")] public string State { get; set; } = string.Empty;
    [JsonPropertyName("depth")] public string Depth { get; set; } = string.Empty;
    [JsonPropertyName("classical_guna")] public string ClassicalGuna { get; set; } = string.Empty;
    [JsonPropertyName("confidence")] public double Confidence { get; set; }
    [JsonPropertyName("margin")] public double Margin { get; set; }
    [JsonPropertyName("indeterminate")] public bool Indeterminate { get; set; }
    [JsonPropertyName("probabilities")] public IReadOnlyDictionary<string, double> Probabilities { get; set; } = new Dictionary<string, double>();
    [JsonPropertyName("corroboration")] public CorroborationDto Corroboration { get; set; } = new();
}

/// <summary>
/// Western neuromarkers folded under the bhūmi as signed corroboration (see the
/// Python <c>corroborate</c>). Mirrors the response shape exactly.
/// </summary>
public sealed class CorroborationDto
{
    [JsonPropertyName("axes")] public IReadOnlyList<CorroborationAxisDto> Axes { get; set; } = Array.Empty<CorroborationAxisDto>();
    [JsonPropertyName("concord")] public string Concord { get; set; } = string.Empty;
    [JsonPropertyName("indeterminate")] public bool Indeterminate { get; set; }
    [JsonPropertyName("caveat")] public string Caveat { get; set; } = string.Empty;
}

public sealed class CorroborationAxisDto
{
    [JsonPropertyName("axis")] public string Axis { get; set; } = string.Empty;
    [JsonPropertyName("reading")] public string Reading { get; set; } = string.Empty;
    // Serialised even when null (agrees: null = neutral axis), matching Python.
    [JsonPropertyName("agrees")] public bool? Agrees { get; set; }
    [JsonPropertyName("note")] public string Note { get; set; } = string.Empty;
}

public sealed class SwaraDto
{
    [JsonPropertyName("state")] public string State { get; set; } = string.Empty;
    [JsonPropertyName("confidence")] public string Confidence { get; set; } = string.Empty;
    [JsonPropertyName("note")] public string Note { get; set; } = string.Empty;
}

public sealed class ComplexityDto
{
    [JsonPropertyName("lziv")] public double Lziv { get; set; }
    [JsonPropertyName("higuchi_fd")] public double HiguchiFd { get; set; }
    [JsonPropertyName("sample_entropy")] public double SampleEntropy { get; set; }
    [JsonPropertyName("perm_entropy")] public double PermEntropy { get; set; }
}

public sealed class AperiodicDto
{
    [JsonPropertyName("exponent")] public double Exponent { get; set; }
    [JsonPropertyName("offset")] public double Offset { get; set; }
}

public sealed class ConnectivityDto
{
    [JsonPropertyName("wsmi")] public double Wsmi { get; set; }
    [JsonPropertyName("plv")] public double Plv { get; set; }
}

public sealed class HemisphericDto
{
    [JsonPropertyName("asymmetry")] public double Asymmetry { get; set; }
    [JsonPropertyName("faa")] public double Faa { get; set; }
    [JsonPropertyName("plv")] public double Plv { get; set; }
    [JsonPropertyName("alpha_left")] public double AlphaLeft { get; set; }
    [JsonPropertyName("alpha_right")] public double AlphaRight { get; set; }
}

public sealed class GunasDto
{
    [JsonPropertyName("sattva")] public double Sattva { get; set; }
    [JsonPropertyName("rajas")] public double Rajas { get; set; }
    [JsonPropertyName("tamas")] public double Tamas { get; set; }
    [JsonPropertyName("label")] public string Label { get; set; } = string.Empty;

    [JsonPropertyName("dominant")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Dominant { get; set; }

    [JsonPropertyName("secondary")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Secondary { get; set; }

    [JsonPropertyName("note")] public string Note { get; set; } = string.Empty;
}
