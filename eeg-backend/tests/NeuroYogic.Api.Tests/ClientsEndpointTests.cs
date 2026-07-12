using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 3 of the consolidation: users + clients (cohort). Verifies elevated
/// gating, admin client CRUD with computed session tallies, that creating a
/// student links a cohort client, and the depth-summary shape.
/// </summary>
public class ClientsEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ClientsEndpointTests(ApiFactory factory) => _factory = factory;

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
    public async Task Clients_RequireElevated_PlainUserForbidden()
    {
        var client = _factory.CreateClient();
        var username = $"u-{Guid.NewGuid():N}";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { username, password = "supersecret1", display_name = "U" });
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var res = await client.GetAsync("/clients");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Admin_CreateClient_ListsWithZeroSessions()
    {
        var admin = await AdminClientAsync();
        var name = $"Asha-{Guid.NewGuid():N}";

        var create = await admin.PostAsJsonAsync("/clients", new { name });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        var list = await admin.GetAsync("/clients");
        list.EnsureSuccessStatusCode();
        var found = JsonDocument.Parse(await list.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray()
            .First(c => c.GetProperty("name").GetString() == name);
        Assert.Equal(0, found.GetProperty("sessionsCount").GetInt32());
        Assert.Equal("new", found.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Admin_CreateStudent_LinksCohortClient()
    {
        var admin = await AdminClientAsync();
        var studentName = $"student-{Guid.NewGuid():N}";

        var create = await admin.PostAsJsonAsync("/users",
            new { username = studentName, password = "secret123", role = "user" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        var list = await admin.GetAsync("/clients");
        list.EnsureSuccessStatusCode();
        // Null props are omitted from the JSON, so probe with TryGetProperty.
        var linkedNames = JsonDocument.Parse(await list.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray()
            .Select(c => c.TryGetProperty("linkedUsername", out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString() : null)
            .Where(n => n is not null);
        Assert.Contains(studentName, linkedNames);
    }

    [Fact]
    public async Task Summary_ReturnsObject()
    {
        var admin = await AdminClientAsync();
        var res = await admin.GetAsync("/clients/summary");
        res.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(JsonValueKind.Object, root.ValueKind);
    }
}
