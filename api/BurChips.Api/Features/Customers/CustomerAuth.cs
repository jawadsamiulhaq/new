using System.Security.Claims;

namespace BurChips.Api.Features.Customers;

/// <summary>Customers sign in with a phone code and get their own cookie, separate from staff logins.</summary>
public static class CustomerAuth
{
    public const string Scheme = "Customer";
    public const string Policy = "Customer";

    public static ClaimsPrincipal CreatePrincipal(int customerId, string phone) =>
        new(new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, customerId.ToString()),
                new Claim(ClaimTypes.MobilePhone, phone),
            ],
            Scheme));

    /// <summary>The signed-in customer's id, or null for anonymous visitors and staff.</summary>
    public static int? GetCustomerId(this ClaimsPrincipal user) =>
        user.Identity?.AuthenticationType == Scheme && int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id
            : null;
}
