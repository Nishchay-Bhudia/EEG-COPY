using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 7: the live-streaming registry + instructor watch grant, ported from
/// the Express BFF. A student goes live; the instructor who owns their linked
/// client discovers it via /live/watchable and obtains a watch grant.
/// </summary>
public class LiveEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public LiveEndpointTests(ApiFactory factory) => _factory = factory;

    private async Task<(HttpClient client, string token)> LoginAsync(string username, string password)
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/auth/login", new { username, password });
        login.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, token!);
    }

    [Fact]
    public async Task Instructor_DiscoversAndWatches_LiveStudent()
    {
        var (admin, _) = await LoginAsync("admin", "admin123");

        // Admin provisions a student (creates a linked cohort client).
        var uname = $"stu-{Guid.NewGuid():N}";
        var created = await admin.PostAsJsonAsync("/users", new { username = uname, password = "secret123", role = "user" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        // Student signs in, starts a sitting, and goes live.
        var (student, _) = await LoginAsync(uname, "secret123");
        var start = await student.PostAsJsonAsync("/sessions/start", new { name = "live sit" });
        var sid = JsonDocument.Parse(await start.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        (await student.PostAsJsonAsync("/live/start", new { sessionId = sid })).EnsureSuccessStatusCode();

        // The instructor's cohort client for this student.
        var clientsJson = JsonDocument.Parse(await (await admin.GetAsync("/clients")).Content.ReadAsStringAsync()).RootElement;
        var clientId = clientsJson.EnumerateArray()
            .First(c => c.TryGetProperty("linkedUsername", out var v) && v.ValueKind == JsonValueKind.String && v.GetString() == uname)
            .GetProperty("id").GetGuid();

        // Watchable shows the student live on the right session.
        var watchable = JsonDocument.Parse(await (await admin.GetAsync("/live/watchable")).Content.ReadAsStringAsync()).RootElement;
        var entry = watchable.EnumerateArray().First(w => w.GetProperty("netSessionId").GetGuid() == sid);
        Assert.Equal(uname, entry.GetProperty("username").GetString());

        // Watch grant returns the session + a watch token.
        var grantRes = await admin.PostAsync($"/live/watch/{clientId}", null);
        grantRes.EnsureSuccessStatusCode();
        var grant = JsonDocument.Parse(await grantRes.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(sid, grant.GetProperty("session_id").GetGuid());
        Assert.False(string.IsNullOrEmpty(grant.GetProperty("watch_token").GetString()));

        // After the student stops, they're no longer watchable.
        (await student.PostAsync("/live/stop", null)).EnsureSuccessStatusCode();
        var after = JsonDocument.Parse(await (await admin.GetAsync("/live/watchable")).Content.ReadAsStringAsync()).RootElement;
        Assert.DoesNotContain(after.EnumerateArray(), w => w.GetProperty("netSessionId").GetGuid() == sid);
    }
}
