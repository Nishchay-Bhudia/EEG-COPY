using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

public class EndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public EndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Status_IsReady()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/status");
        res.EnsureSuccessStatusCode();
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("model_ready").GetBoolean());
    }

    [Fact]
    public async Task AnalyzeBands_ReturnsGunasAndChitta()
    {
        var client = _factory.CreateClient();
        var body = new
        {
            delta = 0.06, theta = 0.30, alpha = 0.34, beta = 0.16, gamma = 0.06,
            high_beta = 0.07, low_beta = 0.09, faa = 0.02, plv = 0.72,
        };
        var res = await client.PostAsJsonAsync("/analyze/bands", body);
        res.EnsureSuccessStatusCode();

        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(root.GetProperty("chitta_bhumi").GetProperty("state").GetString()));
        var gunas = root.GetProperty("gunas");
        var sum = gunas.GetProperty("sattva").GetDouble()
                  + gunas.GetProperty("rajas").GetDouble()
                  + gunas.GetProperty("tamas").GetDouble();
        Assert.InRange(sum, 0.98, 1.02);
    }

    [Fact]
    public async Task AnalyzeBands_MissingFields_Returns400()
    {
        var client = _factory.CreateClient();
        var res = await client.PostAsJsonAsync("/analyze/bands", new { delta = 0.1 });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Sessions_RequireAuth()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/sessions");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task FullFlow_Register_StartSession_AnalyzeWithSession_Persists()
    {
        var client = _factory.CreateClient();

        // Register
        var email = $"user-{Guid.NewGuid():N}@test.dev";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "Test Yogi" });
        reg.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrEmpty(token));

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Start session
        var start = await client.PostAsJsonAsync("/sessions", new { label = "Morning sit" });
        start.EnsureSuccessStatusCode();
        var sessionId = JsonDocument.Parse(await start.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        // Analyze two epochs bound to the session
        for (var i = 0; i < 2; i++)
        {
            var res = await client.PostAsJsonAsync("/analyze/bands", new
            {
                delta = 0.10, theta = 0.18, alpha = 0.30, beta = 0.30, gamma = 0.08,
                high_beta = 0.13, low_beta = 0.17, faa = 0.03, plv = 0.6,
                session_id = sessionId,
            });
            res.EnsureSuccessStatusCode();
            var recordId = JsonDocument.Parse(await res.Content.ReadAsStringAsync())
                .RootElement.GetProperty("record_id").GetString();
            Assert.False(string.IsNullOrEmpty(recordId));
        }

        // Session detail shows two records and aggregates
        var detail = await client.GetAsync($"/sessions/{sessionId}");
        detail.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await detail.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, root.GetProperty("session").GetProperty("epoch_count").GetInt32());
        Assert.Equal(2, root.GetProperty("records").GetArrayLength());

        // New interpretive fields are persisted and surfaced (Phase 3 features).
        Assert.True(root.GetProperty("session").TryGetProperty("mean_depth_score", out _));
        var rec0 = root.GetProperty("records")[0];
        Assert.True(rec0.TryGetProperty("contemplative_depth_score", out var ds));
        Assert.InRange(ds.GetDouble(), 0.0, 1.0);
        Assert.True(rec0.TryGetProperty("vritti_index", out _));
    }

    [Fact]
    public async Task DepthProbe_RoundTripsUnderSession()
    {
        var client = _factory.CreateClient();

        var email = $"probe-{Guid.NewGuid():N}@test.dev";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "Prober" });
        reg.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var start = await client.PostAsJsonAsync("/sessions", new { label = "Labelled sit" });
        start.EnsureSuccessStatusCode();
        var sessionId = JsonDocument.Parse(await start.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        // Record an "emerge" depth probe
        var probe = await client.PostAsJsonAsync($"/sessions/{sessionId}/probe",
            new { depth_rating = 4, confidence = 5, kind = "emerge" });
        probe.EnsureSuccessStatusCode();

        // Read it back
        var got = await client.GetAsync($"/sessions/{sessionId}/probes");
        got.EnsureSuccessStatusCode();
        var arr = JsonDocument.Parse(await got.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, arr.GetArrayLength());
        Assert.Equal(4, arr[0].GetProperty("depth_rating").GetInt32());
        Assert.Equal("emerge", arr[0].GetProperty("kind").GetString());

        // Bad rating rejected
        var bad = await client.PostAsJsonAsync($"/sessions/{sessionId}/probe", new { depth_rating = 9 });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        // Another user's session is invisible (ownership / IDOR guard)
        var otherProbes = await client.GetAsync($"/sessions/{Guid.NewGuid()}/probes");
        Assert.Equal(HttpStatusCode.NotFound, otherProbes.StatusCode);
    }

    [Fact]
    public async Task WatchToken_MintedByOwner_ReturnsRawTokenOnce_ThenRevokes()
    {
        var client = _factory.CreateClient();

        var email = $"watch-{Guid.NewGuid():N}@test.dev";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "Student" });
        reg.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var start = await client.PostAsJsonAsync("/sessions", new { label = "Shared sit" });
        start.EnsureSuccessStatusCode();
        var sessionId = JsonDocument.Parse(await start.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        // Mint a watch token — raw token surfaced once, with an expiry.
        var mint = await client.PostAsync($"/sessions/{sessionId}/watch-token", null);
        mint.EnsureSuccessStatusCode();
        var minted = JsonDocument.Parse(await mint.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(minted.GetProperty("watch_token").GetString()));
        Assert.True(minted.GetProperty("expires_at").GetDateTimeOffset() > DateTimeOffset.UtcNow);

        // Revoke ("stop sharing") → 204.
        var revoke = await client.PostAsync($"/sessions/{sessionId}/watch-token/revoke", null);
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
    }

    [Fact]
    public async Task WatchToken_ForeignSession_ReturnsNotFound()
    {
        var client = _factory.CreateClient();
        var email = $"watch-idor-{Guid.NewGuid():N}@test.dev";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "Nosy" });
        reg.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // A session the caller does not own → 404 (IDOR; never 403).
        var mint = await client.PostAsync($"/sessions/{Guid.NewGuid()}/watch-token", null);
        Assert.Equal(HttpStatusCode.NotFound, mint.StatusCode);
    }

    [Fact]
    public async Task WatchToken_Unauthenticated_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var mint = await client.PostAsync($"/sessions/{Guid.NewGuid()}/watch-token", null);
        Assert.Equal(HttpStatusCode.Unauthorized, mint.StatusCode);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var client = _factory.CreateClient();
        var email = $"dup-{Guid.NewGuid():N}@test.dev";
        var first = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "A" });
        first.EnsureSuccessStatusCode();

        var second = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "B" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }
}
