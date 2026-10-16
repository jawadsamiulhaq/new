using System.Security.Claims;
using BurChips.Api.Data.Entities;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;

namespace BurChips.Api.Features.Admin;

public record StaffLoginRequest(string Email, string Password);

public record StaffMeResponse(string Id, string Email, string DisplayName, string Role);

public record CsrfResponse(string Token);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

/// <summary>
/// Rejects state-changing admin requests without a valid anti-forgery token
/// (sent by the admin app in the X-XSRF-TOKEN header).
/// </summary>
public class AntiforgeryFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    public const string HeaderName = "X-XSRF-TOKEN";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(http);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.Problem(detail: "Your session security token is missing or expired. Please refresh the page.", statusCode: 400);
            }
        }
        return await next(context);
    }
}

public static class AdminAuthEndpoints
{
    public const string LoginRateLimit = "staff-login";

    public static RouteGroupBuilder MapAdminAuthEndpoints(this RouteGroupBuilder admin)
    {
        admin.MapPost("/auth/login", Login).AllowAnonymous().RequireRateLimiting(LoginRateLimit);

        var signedIn = admin.MapGroup("/auth").RequireAuthorization(Roles.Staff);
        signedIn.MapGet("/me", Me);
        signedIn.MapGet("/csrf", Csrf);
        signedIn.MapPost("/logout", Logout).AddEndpointFilter<AntiforgeryFilter>();
        signedIn.MapPost("/password", ChangePassword).AddEndpointFilter<AntiforgeryFilter>();
        return admin;
    }

    private static async Task<IResult> Login(StaffLoginRequest request, SignInManager<AppUser> signIn, UserManager<AppUser> users)
    {
        const string invalid = "Email or password is incorrect.";
        var user = await users.FindByEmailAsync(request.Email?.Trim() ?? "");
        if (user is null || !user.IsActive) return Results.Problem(detail: invalid, statusCode: 400);

        var result = await signIn.PasswordSignInAsync(user, request.Password ?? "", isPersistent: true, lockoutOnFailure: true);
        if (result.IsLockedOut)
            return Results.Problem(detail: "Too many wrong attempts. This account is locked for 15 minutes.", statusCode: 429);
        if (!result.Succeeded) return Results.Problem(detail: invalid, statusCode: 400);

        return Results.Ok(await ToMeAsync(user, users));
    }

    private static async Task<IResult> Me(ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = await users.GetUserAsync(principal);
        return user is null || !user.IsActive ? Results.Unauthorized() : Results.Ok(await ToMeAsync(user, users));
    }

    /// <summary>Issues the anti-forgery token for this signed-in session (call after login and on page load).</summary>
    private static CsrfResponse Csrf(HttpContext http, IAntiforgery antiforgery) =>
        new(antiforgery.GetAndStoreTokens(http).RequestToken!);

    private static async Task<IResult> Logout(SignInManager<AppUser> signIn)
    {
        await signIn.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> ChangePassword(ChangePasswordRequest request, ClaimsPrincipal principal, UserManager<AppUser> users, SignInManager<AppUser> signIn)
    {
        var user = await users.GetUserAsync(principal);
        if (user is null) return Results.Unauthorized();

        var result = await users.ChangePasswordAsync(user, request.CurrentPassword ?? "", request.NewPassword ?? "");
        if (!result.Succeeded) return AdminResults.IdentityErrors(result);

        await signIn.RefreshSignInAsync(user);
        return Results.NoContent();
    }

    public static async Task<StaffMeResponse> ToMeAsync(AppUser user, UserManager<AppUser> users)
    {
        var roles = await users.GetRolesAsync(user);
        var role = roles.Contains(Roles.Owner) ? Roles.Owner : Roles.Staff;
        return new StaffMeResponse(user.Id, user.Email!, user.DisplayName, role);
    }
}

public static class AdminResults
{
    public static IResult Problem(int status, string detail) => Results.Problem(detail: detail, statusCode: status);

    public static IResult IdentityErrors(IdentityResult result) =>
        Results.Problem(detail: string.Join(" ", result.Errors.Select(e => e.Description)), statusCode: 400);
}
