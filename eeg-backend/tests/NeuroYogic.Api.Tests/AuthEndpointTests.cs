using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Slice 2 of the consolidation: username identity + roles. Verifies register /
/// login by username, that /auth/me reflects the token, and that the superadmin
/// seeded on boot can sign in with the admin role.
/// </summary>
public class AuthEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Register_Login_And_Me_ByUsername()
    {
        var client = _factory.CreateClient();
        var username = $"yogi-{Guid.NewGuid():N}";

        var reg = await client.PostAsJsonAsync("/auth/register",
            new { username, password = "supersecret1", display_name = "Yogi" });
        reg.EnsureSuccessStatusCode();
        var regDoc = JsonDocument.Parse(await reg.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(username, regDoc.GetProperty("username").GetString());
        Assert.Equal("user", regDoc.GetProperty("role").GetString());

        var login = await client.PostAsJsonAsync("/auth/login", new { username, password = "supersecret1" });
        login.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrEmpty(token));

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var me = await client.GetAsync("/auth/me");
        me.EnsureSuccessStatusCode();
        var meDoc = JsonDocument.Parse(await me.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(username, meDoc.GetProperty("username").GetString());
        Assert.Equal("user", meDoc.GetProperty("role").GetString());
    }

    [Fact]
    public async Task SeededAdmin_CanLogin_WithAdminRole()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/auth/login", new { username = "admin", password = "admin123" });
        login.EnsureSuccessStatusCode();
        var token = JsonDocument.Parse(await login.Content.ReadAsStringAsync())
            .RootElement.GetProperty("token").GetString();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var me = await client.GetAsync("/auth/me");
        me.EnsureSuccessStatusCode();
        var role = JsonDocument.Parse(await me.Content.ReadAsStringAsync())
            .RootElement.GetProperty("role").GetString();
        Assert.Equal("admin", role);
    }
}
