using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 1 of the backend consolidation: the ported /activities vocabulary.
/// Verifies the auth surface — anonymous is rejected, any authenticated user may
/// read, and writes are gated to the admin role. (Admin-success paths land with
/// slice 2, once the control-hub role vocabulary is reconciled into the token.)
/// </summary>
public class ActivitiesEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public ActivitiesEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Activities_Unauthenticated_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/activities");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Activities_Readable_ButWritesGatedToAdmin()
    {
        var client = _factory.CreateClient();

        // A freshly registered account is a non-admin (role "User").
        var email = $"user-{Guid.NewGuid():N}@test.dev";
        var reg = await client.PostAsJsonAsync("/auth/register",
            new { email, password = "supersecret1", display_name = "Test Yogi" });
        reg.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await reg.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        // Any authenticated user may read the vocabulary.
        var list = await client.GetAsync("/activities");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var arr = JsonDocument.Parse(await list.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(JsonValueKind.Array, arr.ValueKind);

        // Writing is admin-only → a non-admin is forbidden.
        var create = await client.PostAsJsonAsync("/activities", new { name = "Dhyāna" });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
    }

    [Fact]
    public async Task Admin_CanCreateActivity_ThenItIsListed()
    {
        var client = _factory.CreateClient();

        // The superadmin seeded on boot may write the vocabulary.
        var login = await client.PostAsJsonAsync("/auth/login", new { username = "admin", password = "admin123" });
        login.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var name = $"Trāṭaka-{Guid.NewGuid():N}";
        var create = await client.PostAsJsonAsync("/activities", new { name });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        var list = await client.GetAsync("/activities");
        list.EnsureSuccessStatusCode();
        var names = JsonDocument.Parse(await list.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray().Select(a => a.GetProperty("name").GetString());
        Assert.Contains(name, names);
    }
}
