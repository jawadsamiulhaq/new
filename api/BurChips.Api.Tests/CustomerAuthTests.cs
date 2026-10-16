using System.Net;
using System.Net.Http.Json;
using BurChips.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

[Collection(ApiCollection.Name)]
public class CustomerAuthTests(ApiFactory factory)
{
    [Fact]
    public async Task Code_signs_customer_in_and_me_returns_them()
    {
        var client = factory.CreateHttpsClient();
        Assert.Null((await client.GetFromJsonAsync<MeResponse>("/api/me", TestJson.Options))!.Customer);

        var phone = ApiFactory.RandomPhone();
        await factory.SignInAsync(client, phone);

        var me = await client.GetFromJsonAsync<MeResponse>("/api/me", TestJson.Options);
        Assert.Equal(PhoneNumber.ToLocal(PhoneNumber.NormalizePakistaniMobile(phone)!), me!.Customer!.Phone);

        await client.PostAsync("/api/auth/logout", null);
        Assert.Null((await client.GetFromJsonAsync<MeResponse>("/api/me", TestJson.Options))!.Customer);
    }

    [Fact]
    public async Task Codes_are_stored_hashed_never_in_plain_text()
    {
        var client = factory.CreateHttpsClient();
        var phone = ApiFactory.RandomPhone();
        var response = await client.PostAsJsonAsync("/api/auth/code", new { phone });
        var code = (await response.Content.ReadFromJsonAsync<SendCodeResponse>())!.DevCode!;

        await factory.WithDbAsync(async db =>
        {
            var stored = await db.OtpCodes.SingleAsync(o => o.Phone == PhoneNumber.NormalizePakistaniMobile(phone));
            Assert.DoesNotContain(code, stored.CodeHash);
        });
    }

    [Fact]
    public async Task Wrong_code_is_rejected_and_locks_after_too_many_attempts()
    {
        var client = factory.CreateHttpsClient();
        var phone = ApiFactory.RandomPhone();
        var code = (await (await client.PostAsJsonAsync("/api/auth/code", new { phone }))
            .Content.ReadFromJsonAsync<SendCodeResponse>())!.DevCode!;
        var wrong = code == "000000" ? "111111" : "000000";

        for (var i = 0; i < 5; i++)
        {
            var attempt = await client.PostAsJsonAsync("/api/auth/verify", new { phone, code = wrong });
            Assert.Equal(HttpStatusCode.BadRequest, attempt.StatusCode);
        }

        // Even the right code no longer works once attempts are used up.
        var locked = await client.PostAsJsonAsync("/api/auth/verify", new { phone, code });
        Assert.Equal(HttpStatusCode.BadRequest, locked.StatusCode);
        Assert.Contains("Too many wrong attempts", await locked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Expired_code_is_rejected()
    {
        var client = factory.CreateHttpsClient();
        var phone = ApiFactory.RandomPhone();
        var code = (await (await client.PostAsJsonAsync("/api/auth/code", new { phone }))
            .Content.ReadFromJsonAsync<SendCodeResponse>())!.DevCode!;

        var start = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(start.AddMinutes(6));
        try
        {
            var response = await client.PostAsJsonAsync("/api/auth/verify", new { phone, code });
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("expired", await response.Content.ReadAsStringAsync());
        }
        finally
        {
            factory.Clock.SetUtcNow(start);
        }
    }

    [Fact]
    public async Task Requesting_too_many_codes_for_one_phone_is_limited()
    {
        var client = factory.CreateHttpsClient();
        var phone = ApiFactory.RandomPhone();
        for (var i = 0; i < 3; i++)
            (await client.PostAsJsonAsync("/api/auth/code", new { phone })).EnsureSuccessStatusCode();

        var fourth = await client.PostAsJsonAsync("/api/auth/code", new { phone });
        Assert.Equal(HttpStatusCode.TooManyRequests, fourth.StatusCode);
    }

    [Fact]
    public async Task Invalid_phone_is_rejected()
    {
        var response = await factory.CreateHttpsClient().PostAsJsonAsync("/api/auth/code", new { phone = "042-35700000" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Orders_require_sign_in()
    {
        var response = await factory.CreateHttpsClient().GetAsync("/api/orders");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
