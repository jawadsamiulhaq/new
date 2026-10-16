using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Notifications;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Customers;

public record SendCodeRequest(string Phone, string? TurnstileToken);

public record SendCodeResponse(string Phone, int ExpiresInSeconds, string? DevCode);

public record VerifyCodeRequest(string Phone, string Code);

public record AddressDto(int Id, string? Label, int DeliveryAreaId, string DeliveryAreaName, string AddressLine, string? Landmark);

public record CustomerDto(string Phone, string? Name, IReadOnlyList<AddressDto> Addresses);

/// <summary>Turnstile site key for the browser widget; null when the bot check is off.</summary>
public record AuthConfigResponse(string? TurnstileSiteKey);

/// <summary>`customer` is null when nobody is signed in.</summary>
public record MeResponse(CustomerDto? Customer);

public static class CustomerEndpoints
{
    public const string OtpRateLimit = "otp";

    public static IEndpointRouteBuilder MapCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth").AllowAnonymous();
        auth.MapPost("/code", SendCode).RequireRateLimiting(OtpRateLimit);
        auth.MapPost("/verify", Verify).RequireRateLimiting(OtpRateLimit);
        auth.MapPost("/logout", Logout);
        auth.MapGet("/config", (Microsoft.Extensions.Options.IOptions<TurnstileOptions> t) =>
            new AuthConfigResponse(t.Value.Enabled ? t.Value.SiteKey : null));

        app.MapGet("/api/me", Me).AllowAnonymous();
        return app;
    }

    private static async Task<IResult> SendCode(
        SendCodeRequest request, HttpContext http, OtpService otp, TurnstileVerifier turnstile, CancellationToken ct)
    {
        var phone = PhoneNumber.NormalizePakistaniMobile(request.Phone);
        if (phone is null)
            return Problem(400, "Please enter a valid Pakistani mobile number, e.g. 0300-1234567.");

        var ip = http.Connection.RemoteIpAddress?.ToString();
        if (!await turnstile.VerifyAsync(request.TurnstileToken, ip, ct))
            return Problem(400, "Please complete the security check and try again.");

        try
        {
            var (result, devCode) = await otp.SendAsync(phone, ip, ct);
            return result == OtpSendResult.TooManyRequests
                ? Problem(429, "Too many codes requested. Please wait a few minutes and try again.")
                : Results.Ok(new SendCodeResponse(PhoneNumber.ToLocal(phone), 300, devCode));
        }
        catch (SmsNotConfiguredException)
        {
            return Problem(503, "We can't send codes right now. Please call us to place your order.");
        }
    }

    private static async Task<IResult> Verify(
        VerifyCodeRequest request, HttpContext http, OtpService otp, AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var phone = PhoneNumber.NormalizePakistaniMobile(request.Phone);
        if (phone is null || string.IsNullOrWhiteSpace(request.Code))
            return Problem(400, "Please enter the 6-digit code.");

        var result = await otp.VerifyAsync(phone, request.Code, ct);
        if (result != OtpVerifyResult.Verified)
        {
            return Problem(400, result switch
            {
                OtpVerifyResult.Expired => "This code has expired. Please request a new one.",
                OtpVerifyResult.TooManyAttempts => "Too many wrong attempts. Please request a new code.",
                _ => "That code isn't right. Please check and try again.",
            });
        }

        var now = clock.GetUtcNow();
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Phone == phone, ct);
        if (customer is null)
        {
            customer = new Customer { Phone = phone, CreatedAt = now };
            db.Customers.Add(customer);
        }
        customer.LastLoginAt = now;
        await db.SaveChangesAsync(ct);

        await http.SignInAsync(CustomerAuth.Scheme, CustomerAuth.CreatePrincipal(customer.Id, phone));
        return Results.Ok(new MeResponse(await LoadCustomerAsync(db, customer.Id, ct)));
    }

    private static async Task<IResult> Logout(HttpContext http, CancellationToken ct)
    {
        await http.SignOutAsync(CustomerAuth.Scheme);
        return Results.NoContent();
    }

    private static async Task<MeResponse> Me(HttpContext http, AppDbContext db, CancellationToken ct)
    {
        var result = await http.AuthenticateAsync(CustomerAuth.Scheme);
        var customerId = result.Principal?.GetCustomerId();
        return new MeResponse(customerId is { } id ? await LoadCustomerAsync(db, id, ct) : null);
    }

    public static async Task<CustomerDto?> LoadCustomerAsync(AppDbContext db, int customerId, CancellationToken ct)
    {
        var customer = await db.Customers.AsNoTracking()
            .Where(c => c.Id == customerId)
            .Select(c => new
            {
                c.Phone,
                c.Name,
                Addresses = c.Addresses
                    .Where(a => a.DeliveryArea.IsActive)
                    .OrderByDescending(a => a.CreatedAt)
                    .Select(a => new AddressDto(a.Id, a.Label, a.DeliveryAreaId, a.DeliveryArea.Name, a.AddressLine, a.Landmark))
                    .ToList(),
            })
            .FirstOrDefaultAsync(ct);

        return customer is null ? null : new CustomerDto(PhoneNumber.ToLocal(customer.Phone), customer.Name, customer.Addresses);
    }

    private static IResult Problem(int status, string detail) => Results.Problem(detail: detail, statusCode: status);
}
