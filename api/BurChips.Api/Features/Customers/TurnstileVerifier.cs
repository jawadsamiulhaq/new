using Microsoft.Extensions.Options;

namespace BurChips.Api.Features.Customers;

public class TurnstileOptions
{
    public const string Section = "Turnstile";

    /// <summary>Public key the browser widget uses. Empty = bot check disabled (development).</summary>
    public string SiteKey { get; set; } = "";
    public string SecretKey { get; set; } = "";

    public bool Enabled => !string.IsNullOrWhiteSpace(SecretKey);
}

/// <summary>Checks Cloudflare Turnstile tokens so bots can't burn SMS credit by requesting codes.</summary>
public class TurnstileVerifier(HttpClient http, IOptions<TurnstileOptions> options, ILogger<TurnstileVerifier> logger)
{
    private record SiteVerifyResponse(bool Success);

    public async Task<bool> VerifyAsync(string? token, string? ip, CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled) return true;
        if (string.IsNullOrWhiteSpace(token)) return false;

        var form = new Dictionary<string, string> { ["secret"] = settings.SecretKey, ["response"] = token };
        if (ip is not null) form["remoteip"] = ip;

        try
        {
            using var response = await http.PostAsync(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify", new FormUrlEncodedContent(form), ct);
            var result = await response.Content.ReadFromJsonAsync<SiteVerifyResponse>(ct);
            return result?.Success == true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Turnstile verification failed to reach Cloudflare");
            return false;
        }
    }
}
