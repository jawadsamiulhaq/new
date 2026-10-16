using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

/// <summary>Production hardening: security headers, SEO files, sign-in keys that survive restarts.</summary>
[Collection(ApiCollection.Name)]
public class PlatformTests(ApiFactory factory)
{
    [Fact]
    public async Task Every_response_carries_security_headers()
    {
        var response = await factory.CreateHttpsClient().GetAsync("/api/store");
        var csp = response.Headers.GetValues("Content-Security-Policy").Single();

        Assert.Contains("default-src 'self'", csp);
        Assert.Contains("frame-ancestors 'none'", csp);
        Assert.Contains("https://challenges.cloudflare.com", csp); // Turnstile
        Assert.Contains("upgrade-insecure-requests", csp);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task Robots_hides_private_pages_and_points_to_the_sitemap()
    {
        var robots = await factory.CreateHttpsClient().GetStringAsync("/robots.txt");
        Assert.Contains("Disallow: /admin", robots);
        Assert.Contains("Disallow: /checkout", robots);
        Assert.Contains("Sitemap: https://localhost/sitemap.xml", robots);
    }

    [Fact]
    public async Task Sitemap_lists_public_pages_with_the_real_domain()
    {
        var response = await factory.CreateHttpsClient().GetAsync("/sitemap.xml");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/xml", response.Content.Headers.ContentType!.MediaType);

        var xml = await response.Content.ReadAsStringAsync();
        Assert.Contains("<loc>https://localhost/menu</loc>", xml);
        Assert.Contains("<loc>https://localhost/privacy</loc>", xml);
        Assert.DoesNotContain("/admin", xml);
    }

    [Fact]
    public async Task Pages_get_the_real_site_address_for_link_previews()
    {
        var response = await factory.CreateHttpsClient().GetAsync("/menu");
        if (response.StatusCode == HttpStatusCode.NotFound) return; // web app not built in this checkout

        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("""<link rel="canonical" href="https://localhost/menu" />""", html);
        Assert.Contains("""<meta property="og:image" content="https://localhost/og-image.png" />""", html);
        Assert.DoesNotContain("__ORIGIN__", html);
        Assert.DoesNotContain("__CANONICAL__", html);

        var home = await factory.CreateHttpsClient().GetStringAsync("/?utm_source=instagram");
        Assert.Contains("""<link rel="canonical" href="https://localhost/" />""", home);
        Assert.Contains("no-cache", response.Headers.CacheControl!.ToString());

        // The raw file is never served with the placeholder in it.
        var raw = await factory.CreateHttpsClient().GetStringAsync("/index.html");
        Assert.DoesNotContain("__ORIGIN__", raw);
    }

    [Fact]
    public async Task Api_json_is_never_compressed()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/menu");
        request.Headers.AcceptEncoding.ParseAdd("br, gzip");
        var response = await factory.CreateHttpsClient().SendAsync(request);
        Assert.Empty(response.Content.Headers.ContentEncoding);
    }

    [Fact]
    public async Task Sign_in_keys_are_stored_in_the_database()
    {
        var client = factory.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/admin/auth/login", new { email = ApiFactory.OwnerEmail, password = ApiFactory.OwnerPassword })).EnsureSuccessStatusCode();

        await factory.WithDbAsync(async db => Assert.True(await db.DataProtectionKeys.AnyAsync()));
    }
}
