using System.Collections.Concurrent;
using System.Net.Http.Json;
using BurChips.Api.Data;
using BurChips.Api.Features.Admin;
using BurChips.Api.Features.Customers;
using BurChips.Api.Features.Notifications;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BurChips.Api.Tests;

/// <summary>
/// Runs the real API against a throwaway SQL Server LocalDB database
/// (migrated and seeded on start, dropped on dispose) with a controllable clock.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public const string OwnerEmail = "owner@test.local";
    public const string OwnerPassword = "Test-password-123";

    private readonly string _database = $"BurChips_Tests_{Guid.NewGuid():N}";
    private readonly string _uploads = Path.Combine(Path.GetTempPath(), $"burchips-tests-{Guid.NewGuid():N}");

    /// <summary>Starts on Thursday 15 Oct 2026, 13:00 in Lahore (inside the seeded 12 PM – 2 AM hours).</summary>
    public TestClock Clock { get; } = new(new DateTimeOffset(2026, 10, 15, 8, 0, 0, TimeSpan.Zero));

    /// <summary>Owner alerts the app tried to send (instead of WhatsApp).</summary>
    public TestAlertSender Alerts { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        // LocalDB on Windows; CI sets TEST_SQL_SERVER to a SQL Server container's connection string (without a database).
        var server = Environment.GetEnvironmentVariable("TEST_SQL_SERVER")
            ?? "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";
        builder.UseSetting("ConnectionStrings:Default", $"{server.TrimEnd(';')};Database={_database}");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Seed:SampleDeliveryAreas", "true");
        builder.UseSetting("Seed:OwnerEmail", OwnerEmail);
        builder.UseSetting("Seed:OwnerPassword", OwnerPassword);
        builder.UseSetting("Otp:Secret", "test-secret-test-secret-test-secret-0123456789");
        builder.UseSetting("Sms:Provider", "Log");
        builder.UseSetting("RateLimits:OtpPer10Minutes", "10000");
        builder.UseSetting("RateLimits:CheckoutPerMinute", "10000");
        builder.UseSetting("RateLimits:StaffLoginPer10Minutes", "10000");
        builder.UseSetting("Images:LocalPath", _uploads);

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.RemoveAll<IOwnerAlertSender>();
            services.AddSingleton<IOwnerAlertSender>(Alerts);
        });
    }

    /// <summary>An HTTPS client with a cookie jar, so the Secure cookies round-trip.</summary>
    public HttpClient CreateHttpsClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

    /// <summary>Signs the client in as a customer via the phone-code flow. Returns the phone used.</summary>
    public async Task<string> SignInAsync(HttpClient client, string? phone = null)
    {
        phone ??= RandomPhone();
        var send = await client.PostAsJsonAsync("/api/auth/code", new { phone });
        send.EnsureSuccessStatusCode();
        var code = (await send.Content.ReadFromJsonAsync<SendCodeResponse>())!.DevCode;

        var verify = await client.PostAsJsonAsync("/api/auth/verify", new { phone, code });
        verify.EnsureSuccessStatusCode();
        return phone;
    }

    /// <summary>A client signed in to the admin panel, with the anti-forgery header set.</summary>
    public async Task<HttpClient> StaffClientAsync(string email = OwnerEmail, string password = OwnerPassword)
    {
        var client = CreateHttpsClient();
        var login = await client.PostAsJsonAsync("/api/admin/auth/login", new { email, password });
        login.EnsureSuccessStatusCode();

        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/admin/auth/csrf");
        client.DefaultRequestHeaders.Add(AntiforgeryFilter.HeaderName, csrf!.Token);
        return client;
    }

    /// <summary>Creates a Staff-role account through the owner API and returns a signed-in client for it.</summary>
    public async Task<(HttpClient Client, string Email, string Id)> CreateStaffAsync(string role = "Staff")
    {
        var owner = await StaffClientAsync();
        var email = $"staff-{Guid.NewGuid():N}@test.local";
        var created = await owner.PostAsJsonAsync("/api/admin/staff", new { email, displayName = "Counter", role, password = "Staff-password-1" });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<IdResponse>())!.Id;
        return (await StaffClientAsync(email, "Staff-password-1"), email, id);
    }

    public record IdResponse(string Id);

    public static string RandomPhone() => $"03{Random.Shared.Next(0, 10)}{Random.Shared.Next(1_000_000, 9_999_999)}{Random.Shared.Next(0, 10)}";

    /// <summary>Runs a block against the test database.</summary>
    public async Task WithDbAsync(Func<AppDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public override async ValueTask DisposeAsync()
    {
        try
        {
            using var scope = Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureDeletedAsync();
            if (Directory.Exists(_uploads)) Directory.Delete(_uploads, recursive: true);
        }
        finally
        {
            await base.DisposeAsync();
        }
    }
}

public class TestAlertSender : IOwnerAlertSender
{
    public ConcurrentQueue<OwnerOrderAlert> Sent { get; } = new();

    public Task SendAsync(OwnerOrderAlert alert, CancellationToken ct)
    {
        Sent.Enqueue(alert);
        return Task.CompletedTask;
    }
}
