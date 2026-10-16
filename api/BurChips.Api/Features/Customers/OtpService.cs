using System.Security.Cryptography;
using System.Text;
using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurChips.Api.Features.Customers;

public class OtpOptions
{
    public const string Section = "Otp";

    /// <summary>Server secret used to hash codes (HMAC). Required outside development.</summary>
    public string Secret { get; set; } = "";
    public int CodeLifetimeMinutes { get; set; } = 5;
    public int MaxAttempts { get; set; } = 5;

    /// <summary>At most this many codes per phone within <see cref="SendWindowMinutes"/>.</summary>
    public int MaxSendsPerWindow { get; set; } = 3;
    public int SendWindowMinutes { get; set; } = 15;
}

public enum OtpSendResult { Sent, TooManyRequests }

public enum OtpVerifyResult { Verified, Invalid, Expired, TooManyAttempts }

/// <summary>Sends and checks 6-digit login codes. Codes are stored only as HMAC hashes.</summary>
public class OtpService(AppDbContext db, ISmsSender sms, TimeProvider clock, IOptions<OtpOptions> options)
{
    private readonly OtpOptions _options = options.Value;

    /// <returns>The result, plus the code itself when the SMS sender is not live (development only).</returns>
    public async Task<(OtpSendResult Result, string? DevCode)> SendAsync(string phone, string? ip, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var windowStart = now.AddMinutes(-_options.SendWindowMinutes);

        var recent = await db.OtpCodes.CountAsync(o => o.Phone == phone && o.CreatedAt >= windowStart, ct);
        if (recent >= _options.MaxSendsPerWindow) return (OtpSendResult.TooManyRequests, null);

        // A new code replaces any earlier unused one.
        await db.OtpCodes
            .Where(o => o.Phone == phone && o.ConsumedAt == null && o.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.ExpiresAt, now), ct);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        db.OtpCodes.Add(new OtpCode
        {
            Phone = phone,
            CodeHash = Hash(phone, code),
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(_options.CodeLifetimeMinutes),
            RequestIp = ip,
        });
        await db.SaveChangesAsync(ct);

        await sms.SendAsync(phone, $"{code} is your BurChips verification code. It expires in {_options.CodeLifetimeMinutes} minutes. Don't share it with anyone.", ct);

        return (OtpSendResult.Sent, sms.IsLive ? null : code);
    }

    public async Task<OtpVerifyResult> VerifyAsync(string phone, string code, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var otp = await db.OtpCodes
            .Where(o => o.Phone == phone && o.ConsumedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (otp is null) return OtpVerifyResult.Invalid;
        if (otp.ExpiresAt <= now) return OtpVerifyResult.Expired;
        if (otp.Attempts >= _options.MaxAttempts) return OtpVerifyResult.TooManyAttempts;

        otp.Attempts++;
        var matches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(otp.CodeHash),
            Encoding.UTF8.GetBytes(Hash(phone, code.Trim())));
        if (matches) otp.ConsumedAt = now;

        await db.SaveChangesAsync(ct);
        return matches ? OtpVerifyResult.Verified : OtpVerifyResult.Invalid;
    }

    private string Hash(string phone, string code)
    {
        var key = Encoding.UTF8.GetBytes(_options.Secret);
        return Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{phone}:{code}")));
    }
}
