using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 4: control-hub session lifecycle. Start a sitting with a practice,
/// store a client-side-analysed epoch, list it via /sessions/mine, read it back
/// via /epochs, round-trip notes, and rebind the session to a cohort client.
/// </summary>
public class HubSessionsEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HubSessionsEndpointTests(ApiFactory factory) => _factory = factory;

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
    public async Task Start_StoreEpoch_Mine_Epochs_Notes()
    {
        var http = await AdminClientAsync();

        var start = await http.PostAsJsonAsync("/sessions/start",
            new { name = "Morning sit", activity = "Dhyāna" });
        Assert.Equal(HttpStatusCode.Created, start.StatusCode);
        var session = JsonDocument.Parse(await start.Content.ReadAsStringAsync()).RootElement;
        var id = session.GetProperty("id").GetGuid();
        Assert.Equal("Dhyāna", session.GetProperty("activity").GetString());

        // Store one client-side-analysed epoch.
        var epoch = await http.PostAsJsonAsync($"/sessions/{id}/epoch", new
        {
            epochNum = 1,
            chittaBhumi = "Ekagra",
            chittaConfidence = 0.82,
            contemplativeDepth = "Deep",
            swara = "Sushumna",
            bands = new { delta = 0.08, theta = 0.29, alpha = 0.37, beta = 0.19, gamma = 0.07 },
            gunas = new { sattva = 0.78, rajas = 0.12, tamas = 0.10, label = "Sattvic" },
        });
        Assert.Equal(HttpStatusCode.Created, epoch.StatusCode);

        // /sessions/mine carries the session with its practice.
        var mine = await http.GetAsync("/sessions/mine");
        mine.EnsureSuccessStatusCode();
        var found = JsonDocument.Parse(await mine.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray().First(s => s.GetProperty("id").GetGuid() == id);
        Assert.Equal("Dhyāna", found.GetProperty("activity").GetString());

        // /epochs reads the stored epoch back with its bands + bhumi.
        var epochs = await http.GetAsync($"/sessions/{id}/epochs");
        epochs.EnsureSuccessStatusCode();
        var arr = JsonDocument.Parse(await epochs.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, arr.GetArrayLength());
        var e0 = arr[0];
        Assert.Equal("Ekagra", e0.GetProperty("chittaBhumi").GetString());
        Assert.Equal(0.37, e0.GetProperty("bands").GetProperty("alpha").GetDouble(), 3);

        // Notes round-trip.
        var put = await http.PutAsJsonAsync($"/sessions/{id}/notes", new { content = "settled quickly" });
        put.EnsureSuccessStatusCode();
        var notes = await http.GetAsync($"/sessions/{id}/notes");
        notes.EnsureSuccessStatusCode();
        Assert.Equal("settled quickly", JsonDocument.Parse(await notes.Content.ReadAsStringAsync())
            .RootElement.GetProperty("content").GetString());
    }

    [Fact]
    public async Task StoreEpoch_ToleratesStringConfidence_AndNullBands()
    {
        var http = await AdminClientAsync();
        var start = await http.PostAsJsonAsync("/sessions/start", new { name = "sit" });
        var id = JsonDocument.Parse(await start.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        // The SPA's real shape: confidence as a "82.4%" string, some bands null.
        var epoch = await http.PostAsJsonAsync($"/sessions/{id}/epoch", new
        {
            epochNum = 1,
            chittaBhumi = "Ekagra",
            chittaConfidence = "82.4%",
            swara = "Sushumna",
            bands = new { delta = (double?)null, theta = 0.29, alpha = 0.37, beta = (double?)null, gamma = 0.07 },
            gunas = new { sattva = 0.78, rajas = 0.12, tamas = 0.10, label = "Sattvic" },
        });
        Assert.Equal(HttpStatusCode.Created, epoch.StatusCode);
    }

    [Fact]
    public async Task RebindSession_ToClient()
    {
        var http = await AdminClientAsync();

        var createClient = await http.PostAsJsonAsync("/clients", new { name = $"Asha-{Guid.NewGuid():N}" });
        var clientId = JsonDocument.Parse(await createClient.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        var start = await http.PostAsJsonAsync("/sessions/start", new { name = "sit" });
        var sessionId = JsonDocument.Parse(await start.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        var patch = await http.PatchAsJsonAsync($"/sessions/{sessionId}/client", new { client_id = clientId });
        patch.EnsureSuccessStatusCode();
        var bound = JsonDocument.Parse(await patch.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(clientId, bound.GetProperty("clientId").GetGuid());
    }
}
