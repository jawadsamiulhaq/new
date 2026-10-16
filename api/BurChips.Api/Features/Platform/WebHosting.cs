using System.Text;

namespace BurChips.Api.Features.Platform;

public static class WebHosting
{
    /// <summary>
    /// Content-Security-Policy: only our own scripts run; the exceptions are Cloudflare Turnstile
    /// (bot check) and the Google Maps embed on the Find us page. Inline style attributes are allowed
    /// because React sets a few (e.g. chart bar heights).
    /// </summary>
    public static string BuildCsp(string? imageHost, bool upgradeInsecureRequests) =>
        string.Join("; ", new[]
        {
            "default-src 'self'",
            "script-src 'self' https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline'",
            $"img-src 'self' data: blob:{(imageHost is null ? "" : " " + imageHost)}",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            upgradeInsecureRequests ? "upgrade-insecure-requests" : null,
        }.Where(d => d is not null));

    /// <summary>Security headers on every response.</summary>
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, string csp) =>
        app.Use(async (context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                headers.XContentTypeOptions = "nosniff";
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
                headers["Cross-Origin-Opener-Policy"] = "same-origin";
                headers.XFrameOptions = "DENY";
                headers.ContentSecurityPolicy = csp;
                return Task.CompletedTask;
            });
            await next();
        });

    /// <summary>
    /// Built files in /assets have content hashes in their names, so browsers can keep them for a year.
    /// index.html must always be re-checked so a new deploy shows up immediately.
    /// </summary>
    public static StaticFileOptions StaticFileCaching() => new()
    {
        OnPrepareResponse = ctx =>
        {
            var headers = ctx.Context.Response.Headers;
            if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
                headers.CacheControl = "public, max-age=31536000, immutable";
            else if (ctx.File.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                headers.CacheControl = "no-cache";
            else
                headers.CacheControl = "public, max-age=86400";
        },
    };

    public const string OriginPlaceholder = "__ORIGIN__";
    public const string CanonicalPlaceholder = "__CANONICAL__";

    /// <summary>
    /// Serves the React app's index.html for every page (/, /menu, /order/…), with the site's real
    /// address filled in for link previews and search engines. Never cached, so new deploys show at once.
    /// </summary>
    public static IEndpointRouteBuilder MapSpaFallback(this IEndpointRouteBuilder app)
    {
        string? template = null;
        app.MapFallback(async (HttpContext http, IWebHostEnvironment env) =>
        {
            var file = env.WebRootFileProvider.GetFileInfo("index.html");
            if (!file.Exists) return Results.NotFound();

            // Cache the file in production; re-read in development so rebuilds show up.
            if (template is null || env.IsDevelopment())
            {
                await using var stream = file.CreateReadStream();
                using var reader = new StreamReader(stream);
                template = await reader.ReadToEndAsync();
            }

            var origin = $"{http.Request.Scheme}://{http.Request.Host}";
            // Each page names itself as the original (no query string), so /menu isn't seen as a copy of the home page.
            var canonical = origin + (http.Request.Path.HasValue ? http.Request.Path.Value!.TrimEnd('/') : "");
            if (canonical == origin) canonical += "/";

            http.Response.Headers.CacheControl = "no-cache";
            var html = template
                .Replace(CanonicalPlaceholder, System.Net.WebUtility.HtmlEncode(canonical))
                .Replace(OriginPlaceholder, origin);
            return Results.Content(html, "text/html; charset=utf-8");
        });
        return app;
    }

    /// <summary>Public pages search engines should index (customer pages only).</summary>
    private static readonly string[] SitemapPaths = ["/", "/menu", "/about", "/privacy", "/terms", "/refunds", "/delivery"];

    public static IEndpointRouteBuilder MapSeoEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/robots.txt", (HttpRequest request) =>
        {
            var origin = $"{request.Scheme}://{request.Host}";
            var body = new StringBuilder()
                .AppendLine("User-agent: *")
                .AppendLine("Allow: /")
                .AppendLine("Disallow: /admin")
                .AppendLine("Disallow: /api/")
                .AppendLine("Disallow: /checkout")
                .AppendLine("Disallow: /order/")
                .AppendLine("Disallow: /orders")
                .AppendLine($"Sitemap: {origin}/sitemap.xml")
                .ToString();
            return Results.Text(body, "text/plain; charset=utf-8");
        }).AllowAnonymous();

        app.MapGet("/sitemap.xml", (HttpRequest request) =>
        {
            var origin = $"{request.Scheme}://{request.Host}";
            var xml = new StringBuilder("""<?xml version="1.0" encoding="UTF-8"?>""").AppendLine()
                .AppendLine("""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">""");
            foreach (var path in SitemapPaths)
                xml.AppendLine($"  <url><loc>{origin}{path}</loc></url>");
            xml.AppendLine("</urlset>");
            return Results.Text(xml.ToString(), "application/xml; charset=utf-8");
        }).AllowAnonymous();

        return app;
    }
}
