using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NeuroYogic.Api.Services;

public sealed record ChatMessage(string Role, string Content);

public interface IChatService
{
    bool Configured { get; }
    Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, double temperature, int maxTokens, CancellationToken ct);
}

/// <summary>
/// Port of the eeg-ui "AI Baba" chat, calling Groq's OpenAI-compatible chat
/// completions over HttpClient (replacing the Node groq-sdk). Configured via
/// Groq:ApiKey (env Groq__ApiKey); a missing key leaves <see cref="Configured"/> false.
/// </summary>
public sealed class GroqChatService : IChatService
{
    private const string Endpoint = "https://api.groq.com/openai/v1/chat/completions";
    private const string Model = "llama-3.1-8b-instant";

    private readonly IHttpClientFactory _httpFactory;
    private readonly string? _apiKey;

    public GroqChatService(IHttpClientFactory httpFactory, IConfiguration config)
    {
        _httpFactory = httpFactory;
        _apiKey = config["Groq:ApiKey"]?.Trim();
    }

    public bool Configured => !string.IsNullOrEmpty(_apiKey);

    public async Task<string> CompleteAsync(IReadOnlyList<ChatMessage> messages, double temperature, int maxTokens, CancellationToken ct)
    {
        if (!Configured)
            throw new InvalidOperationException("Groq API key not configured.");

        var payload = new
        {
            model = Model,
            messages = messages.Select(m => new { role = m.Role, content = m.Content }),
            temperature,
            max_tokens = maxTokens,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        var http = _httpFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(30);
        using var res = await http.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Groq request failed ({(int)res.StatusCode}).");

        var parsed = JsonSerializer.Deserialize<GroqResponse>(body);
        return parsed?.Choices?.FirstOrDefault()?.Message?.Content ?? string.Empty;
    }

    private sealed class GroqResponse
    {
        [JsonPropertyName("choices")] public List<Choice>? Choices { get; set; }
        public sealed class Choice { [JsonPropertyName("message")] public Msg? Message { get; set; } }
        public sealed class Msg { [JsonPropertyName("content")] public string? Content { get; set; } }
    }
}
