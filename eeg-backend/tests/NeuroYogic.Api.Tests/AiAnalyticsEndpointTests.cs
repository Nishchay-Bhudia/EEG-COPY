using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 5: AI Baba + session analytics. The test host has no Groq key, so we
/// verify health reporting, the LLM-free off-topic guard, the not-configured
/// path, and the analytics aggregation over stored epochs.
/// </summary>
public class AiAnalyticsEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AiAnalyticsEndpointTests(ApiFactory factory) => _factory = factory;

    private async Task<HttpClient> AdminClientAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/auth/login", new { username = "admin", password = "admin123" });
        login.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Health_ReportsGroqNotConfigured()
    {
        var http = await AdminClientAsync();
        var res = await http.GetAsync("/ai/health");
        res.EnsureSuccessStatusCode();
        var configured = JsonDocument.Parse(await res.Content.ReadAsStringAsync())
            .RootElement.GetProperty("groqConfigured").GetBoolean();
        Assert.False(configured);
    }

    [Fact]
    public async Task Chat_OffTopic_ReturnsCannedReply_NoKeyNeeded()
    {
        var http = await AdminClientAsync();
        var res = await http.PostAsJsonAsync("/ai/chat", new
        {
            session_id = Guid.NewGuid(),
            message = "What is the weather in Paris today and tomorrow?",
        });
        res.EnsureSuccessStatusCode();
        var reply = JsonDocument.Parse(await res.Content.ReadAsStringAsync())
            .RootElement.GetProperty("reply").GetString();
        Assert.Contains("only help you understand your EEG session data", reply);
    }

    [Fact]
    public async Task Chat_OnTopic_WithoutKey_Returns503()
    {
        var http = await AdminClientAsync();
        var res = await http.PostAsJsonAsync("/ai/chat", new
        {
            session_id = Guid.NewGuid(),
            message = "How focused was I during this meditation session and my alpha brainwaves?",
        });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
    }

    [Fact]
    public async Task Analytics_AggregatesStoredEpochs()
    {
        var http = await AdminClientAsync();
        var start = await http.PostAsJsonAsync("/sessions/start", new { name = "sit" });
        var id = JsonDocument.Parse(await start.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        await http.PostAsJsonAsync($"/sessions/{id}/epoch", new
        {
            epochNum = 1, chittaBhumi = "Ekagra", swara = "Sushumna", elapsedSeconds = 4.0,
            bands = new { delta = 0.08, theta = 0.29, alpha = 0.37, beta = 0.19, gamma = 0.07 },
            gunas = new { sattva = 0.78, rajas = 0.12, tamas = 0.10, label = "Sattvic" },
        });
        await http.PostAsJsonAsync($"/sessions/{id}/epoch", new
        {
            epochNum = 2, chittaBhumi = "Kshipta", swara = "Pingala", elapsedSeconds = 8.0,
            bands = new { delta = 0.09, theta = 0.12, alpha = 0.12, beta = 0.55, gamma = 0.10 },
            gunas = new { sattva = 0.12, rajas = 0.73, tamas = 0.15, label = "Rajasic" },
        });

        var res = await http.GetAsync($"/sessions/{id}/analytics");
        res.EnsureSuccessStatusCode();
        var summary = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.GetProperty("summary");
        Assert.Equal(2, summary.GetProperty("totalEpochs").GetInt32());
        Assert.Equal(8, summary.GetProperty("durationSeconds").GetInt32());
        var states = summary.GetProperty("stateCounts");
        Assert.Equal(1, states.GetProperty("Ekagra").GetInt32());
        Assert.Equal(1, states.GetProperty("Kshipta").GetInt32());
    }
}
