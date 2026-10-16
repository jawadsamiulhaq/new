using System.Net;
using System.Net.Http.Json;
using BurChips.Api.Features.Admin;

namespace BurChips.Api.Tests;

/// <summary>Who can do what in the admin panel.</summary>
[Collection(ApiCollection.Name)]
public class AdminAccessTests(ApiFactory factory)
{
    public static readonly TheoryData<string, string> OwnerOnly = new()
    {
        { "GET", "/api/admin/settings" },
        { "GET", "/api/admin/areas" },
        { "GET", "/api/admin/promos" },
        { "GET", "/api/admin/staff" },
        { "GET", "/api/admin/reports/sales" },
        { "POST", "/api/admin/menu/categories" },
        { "POST", "/api/admin/menu/items" },
        { "PUT", "/api/admin/settings" },
    };

    private static HttpRequestMessage Request(string method, string url) =>
        new(new HttpMethod(method), url) { Content = method == "GET" ? null : JsonContent.Create(new { }) };

    [Theory]
    [InlineData("GET", "/api/admin/orders/live")]
    [InlineData("GET", "/api/admin/menu")]
    [InlineData("GET", "/api/admin/settings")]
    [InlineData("POST", "/api/admin/store/pause")]
    public async Task Anonymous_visitors_are_refused(string method, string url)
    {
        var response = await factory.CreateHttpsClient().SendAsync(Request(method, url));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Customers_are_not_staff()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/orders/live")).StatusCode);
    }

    [Theory]
    [MemberData(nameof(OwnerOnly))]
    public async Task Staff_cannot_use_owner_features(string method, string url)
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        var response = await staff.SendAsync(Request(method, url));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Staff_can_see_live_orders_and_menu()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/admin/orders/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await staff.GetAsync("/api/admin/menu")).StatusCode);

        var me = await staff.GetFromJsonAsync<StaffMeResponse>("/api/admin/auth/me");
        Assert.Equal("Staff", me!.Role);
    }

    [Fact]
    public async Task Changes_without_the_anti_forgery_token_are_rejected()
    {
        var client = factory.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/admin/auth/login", new { email = ApiFactory.OwnerEmail, password = ApiFactory.OwnerPassword })).EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync("/api/admin/store/pause", new { isPaused = true });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("security token", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Wrong_password_is_rejected_and_locks_the_account()
    {
        var (_, email, _) = await factory.CreateStaffAsync();
        var client = factory.CreateHttpsClient();

        for (var i = 0; i < 4; i++)
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/admin/auth/login", new { email, password = "wrong-password" })).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/admin/auth/login", new { email, password = "wrong-password" })).StatusCode);
        // Locked even with the right password now.
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/admin/auth/login", new { email, password = "Staff-password-1" })).StatusCode);
    }

    [Fact]
    public async Task Deactivated_staff_cannot_sign_in()
    {
        var (_, email, id) = await factory.CreateStaffAsync();
        var owner = await factory.StaffClientAsync();
        (await owner.PutAsJsonAsync($"/api/admin/staff/{id}", new { displayName = "Counter", role = "Staff", isActive = false })).EnsureSuccessStatusCode();

        var login = await factory.CreateHttpsClient().PostAsJsonAsync("/api/admin/auth/login", new { email, password = "Staff-password-1" });
        Assert.Equal(HttpStatusCode.BadRequest, login.StatusCode);
    }

    [Fact]
    public async Task The_last_owner_cannot_remove_their_own_access()
    {
        var owner = await factory.StaffClientAsync();
        var me = await owner.GetFromJsonAsync<StaffMeResponse>("/api/admin/auth/me");

        var response = await owner.PutAsJsonAsync($"/api/admin/staff/{me!.Id}", new { displayName = "Owner", role = "Staff", isActive = true });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Weak_staff_passwords_are_refused()
    {
        var owner = await factory.StaffClientAsync();
        var response = await owner.PostAsJsonAsync("/api/admin/staff",
            new { email = $"weak-{Guid.NewGuid():N}@test.local", displayName = "Weak", role = "Staff", password = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
