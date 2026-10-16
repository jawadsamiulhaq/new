using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Data.Seed;
using BurChips.Api.Features.Admin;
using BurChips.Api.Features.Checkout;
using BurChips.Api.Features.Customers;
using BurChips.Api.Features.Menu;
using BurChips.Api.Features.Notifications;
using BurChips.Api.Features.Orders;
using BurChips.Api.Features.Platform;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.ResponseCompression;
using BurChips.Api.Features.Store;
using BurChips.Api.Hubs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var isDevOrTest = builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing");

// ---- Database ----
var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Connection string 'Default' is not configured.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));

// ---- Authentication: staff (Identity cookie) and customers (phone-code cookie) ----
builder.Services
    .AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();

builder.Services.AddAuthentication()
    .AddCookie(CustomerAuth.Scheme, cookie =>
    {
        cookie.Cookie.Name = "bc_customer";
        cookie.Cookie.HttpOnly = true;
        cookie.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        cookie.Cookie.SameSite = SameSiteMode.Lax;
        cookie.ExpireTimeSpan = TimeSpan.FromDays(90);
        cookie.SlidingExpiration = true;
        cookie.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        cookie.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    });

builder.Services.ConfigureApplicationCookie(cookie =>
{
    cookie.Cookie.Name = "bc_staff";
    cookie.Cookie.HttpOnly = true;
    cookie.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    cookie.Cookie.SameSite = SameSiteMode.Lax;
    cookie.ExpireTimeSpan = TimeSpan.FromHours(12);
    cookie.SlidingExpiration = true;
    // API: answer 401/403 instead of redirecting to a login page.
    cookie.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    cookie.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 10;
        options.Password.RequireNonAlphanumeric = false;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

// Re-check staff sessions every minute, so deactivating someone signs them out quickly.
builder.Services.Configure<SecurityStampValidatorOptions>(o => o.ValidationInterval = TimeSpan.FromMinutes(1));

builder.Services.AddAntiforgery(o =>
{
    o.HeaderName = AntiforgeryFilter.HeaderName;
    o.Cookie.Name = "bc_xsrf";
    // Local development runs on plain http; everywhere else the token cookie is HTTPS-only.
    // (Behind Azure's HTTPS front end the app must trust X-Forwarded-Proto — see README "Deployment".)
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.Cookie.SameSite = SameSiteMode.Strict;
});

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(Roles.Owner, p => p.RequireRole(Roles.Owner))
    .AddPolicy(Roles.Staff, p => p.RequireRole(Roles.Owner, Roles.Staff))
    .AddPolicy(CustomerAuth.Policy, p => p
        .AddAuthenticationSchemes(CustomerAuth.Scheme)
        .RequireAuthenticatedUser()
        .RequireClaim(System.Security.Claims.ClaimTypes.NameIdentifier));

// ---- Rate limits (per client IP) ----
var limits = builder.Configuration.GetSection("RateLimits");
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(CustomerEndpoints.OtpRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limits.GetValue("OtpPer10Minutes", 10), Window = TimeSpan.FromMinutes(10) }));
    options.AddPolicy(OrderEndpoints.CheckoutRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limits.GetValue("CheckoutPerMinute", 60), Window = TimeSpan.FromMinutes(1) }));
    options.AddPolicy(AdminAuthEndpoints.LoginRateLimit, http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = limits.GetValue("StaffLoginPer10Minutes", 20), Window = TimeSpan.FromMinutes(10) }));
});

// ---- Phone codes, SMS, bot check ----
builder.Services.AddOptions<OtpOptions>()
    .Bind(builder.Configuration.GetSection(OtpOptions.Section))
    .Validate(o => o.Secret.Length >= 32, "Otp:Secret must be set to a random string of at least 32 characters.")
    .ValidateOnStart();
builder.Services.Configure<TurnstileOptions>(builder.Configuration.GetSection(TurnstileOptions.Section));
builder.Services.AddHttpClient<TurnstileVerifier>();
builder.Services.AddScoped<OtpService>();

if (builder.Configuration["Sms:Provider"] == "Log" && isDevOrTest)
    builder.Services.AddSingleton<ISmsSender, LogSmsSender>();
else
    builder.Services.AddSingleton<ISmsSender, UnconfiguredSmsSender>();

// ---- Ordering ----
builder.Services.AddScoped<PricingService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<IOrderNotifier, SignalROrderNotifier>();
builder.Services.AddSignalR();

// ---- Owner alerts (WhatsApp, SMS fallback) ----
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection(WhatsAppOptions.Section));
builder.Services.AddSingleton<OwnerAlertQueue>();
builder.Services.AddHostedService<OwnerAlertWorker>();
if (builder.Configuration.GetSection(WhatsAppOptions.Section).Get<WhatsAppOptions>() is { Enabled: true })
    builder.Services.AddHttpClient<IOwnerAlertSender, WhatsAppAlertSender>();
else
    builder.Services.AddSingleton<IOwnerAlertSender, LogAlertSender>();

// ---- Menu photos ----
builder.Services.Configure<ImageOptions>(builder.Configuration.GetSection(ImageOptions.Section));
if (builder.Configuration[$"{ImageOptions.Section}:Provider"] == "AzureBlob")
    builder.Services.AddSingleton<IImageStorage, BlobImageStorage>();
else
    builder.Services.AddSingleton<IImageStorage, LocalImageStorage>();

// ---- Platform ----
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();
builder.Services.AddScoped<DbSeeder>();

// Sign-in cookie and security-token keys live in the database, so restarts and deploys don't sign people out.
builder.Services.AddDataProtection()
    .PersistKeysToDbContext<AppDbContext>()
    .SetApplicationName("BurChips");

// Compress the site's files (not API JSON, which can carry security tokens — avoids BREACH-style leaks).
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    o.MimeTypes = ["text/html", "text/css", "text/javascript", "application/javascript", "image/svg+xml", "application/xml", "text/plain"];
});

// Error and performance monitoring in Azure Application Insights (only when configured).
if (!string.IsNullOrWhiteSpace(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
    builder.Services.AddOpenTelemetry().UseAzureMonitor();

var app = builder.Build();

// ---- Database migrate + seed ----
using (var scope = app.Services.CreateScope())
{
    if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();

    await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();
}

// ---- Pipeline ----
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

var imageOptions = app.Configuration.GetSection(ImageOptions.Section).Get<ImageOptions>() ?? new ImageOptions();
var imageHost = imageOptions.PublicBaseUrl is { Length: > 0 } baseUrl
    ? new Uri(baseUrl).GetLeftPart(UriPartial.Authority)
    : imageOptions.Provider == "AzureBlob" ? "https://*.blob.core.windows.net" : null;
app.UseSecurityHeaders(WebHosting.BuildCsp(imageHost, upgradeInsecureRequests: !app.Environment.IsDevelopment()));
app.UseResponseCompression();

// index.html is always served through the page fallback (which fills in the site address), never as a raw file.
app.Use((context, next) =>
{
    if (!context.Request.Path.Equals("/index.html", StringComparison.OrdinalIgnoreCase)) return next();
    context.Response.Redirect("/", permanent: true);
    return Task.CompletedTask;
});
app.UseStaticFiles(WebHosting.StaticFileCaching());

// Locally stored menu photos (development); production serves them from Azure Blob Storage.
if (app.Services.GetRequiredService<IImageStorage>() is LocalImageStorage localImages)
{
    Directory.CreateDirectory(localImages.Folder);
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(localImages.Folder),
        RequestPath = LocalImageStorage.RequestPath,
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.XContentTypeOptions = "nosniff",
    });
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/api/health");
app.MapSeoEndpoints();
app.MapStoreEndpoints();
app.MapMenuEndpoints();
app.MapCustomerEndpoints();
app.MapOrderEndpoints();
app.MapHub<OrderTrackingHub>(OrderTrackingHub.Path);

// ---- Admin API: every state-changing call needs the anti-forgery token ----
var admin = app.MapGroup("/api/admin");
admin.MapAdminAuthEndpoints();

admin.MapGroup("")
    .RequireAuthorization(Roles.Staff)
    .AddEndpointFilter<AntiforgeryFilter>()
    .MapAdminOrderEndpoints()
    .MapAdminMenuStaffEndpoints()
    .MapAdminStoreStaffEndpoints();

admin.MapGroup("")
    .RequireAuthorization(Roles.Owner)
    .AddEndpointFilter<AntiforgeryFilter>()
    .MapAdminMenuOwnerEndpoints()
    .MapAdminStoreOwnerEndpoints()
    .MapAdminStaffEndpoints()
    .MapAdminReportEndpoints();

app.MapHub<StaffHub>(StaffHub.Path);

// Unknown /api routes are real 404s; everything else falls through to the React app.
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapSpaFallback();

app.Run();

public partial class Program;
