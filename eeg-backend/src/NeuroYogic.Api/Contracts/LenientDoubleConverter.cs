using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NeuroYogic.Api.Contracts;

/// <summary>
/// Reads a double from a number, a string ("82.4%", "0.37"), or null — the SPA
/// sends confidences/bands in mixed forms. Prevents [ApiController] auto-400s on
/// epoch storage. Returns null for unparseable/empty input.
/// </summary>
public sealed class LenientDoubleConverter : JsonConverter<double?>
{
    public override double? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.Null:
                return null;
            case JsonTokenType.Number:
                return reader.GetDouble();
            case JsonTokenType.String:
                var s = reader.GetString();
                if (string.IsNullOrWhiteSpace(s)) return null;
                s = s.Replace("%", "").Trim();
                return double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null;
            default:
                reader.Skip();
                return null;
        }
    }

    public override void Write(Utf8JsonWriter writer, double? value, JsonSerializerOptions options)
    {
        if (value is null) writer.WriteNullValue();
        else writer.WriteNumberValue(value.Value);
    }
}
