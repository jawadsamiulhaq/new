using System.Security.Claims;
using BurChips.Api.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Admin;

public record StaffDto(string Id, string Email, string DisplayName, string Role, bool IsActive, bool IsLockedOut, bool IsYou);

public record CreateStaffRequest(string Email, string DisplayName, string Role, string Password);

public record UpdateStaffRequest(string DisplayName, string Role, bool IsActive);

public record ResetPasswordRequest(string Password);

/// <summary>Owner-only management of the people who can sign in to the admin panel.</summary>
public static class AdminStaffEndpoints
{
    public static RouteGroupBuilder MapAdminStaffEndpoints(this RouteGroupBuilder owner)
    {
        owner.MapGet("/staff", List);
        owner.MapPost("/staff", Create);
        owner.MapPut("/staff/{id}", Update);
        owner.MapPost("/staff/{id}/password", ResetPassword);
        return owner;
    }

    private static async Task<IReadOnlyList<StaffDto>> List(UserManager<AppUser> users, ClaimsPrincipal me, CancellationToken ct)
    {
        var myId = users.GetUserId(me);
        var owners = (await users.GetUsersInRoleAsync(Roles.Owner)).Select(u => u.Id).ToHashSet();
        var all = await users.Users.AsNoTracking().OrderBy(u => u.DisplayName).ToListAsync(ct);
        return [.. all.Select(u => new StaffDto(
            u.Id, u.Email!, u.DisplayName,
            owners.Contains(u.Id) ? Roles.Owner : Roles.Staff,
            u.IsActive,
            u.LockoutEnd is { } end && end > DateTimeOffset.UtcNow,
            u.Id == myId))];
    }

    private static async Task<IResult> Create(CreateStaffRequest request, UserManager<AppUser> users)
    {
        if (!Roles.All.Contains(request.Role)) return AdminResults.Problem(400, "Role must be Owner or Staff.");
        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Length > 60) return AdminResults.Problem(400, "Name is required.");
        var email = request.Email?.Trim() ?? "";
        if (await users.FindByEmailAsync(email) is not null) return AdminResults.Problem(409, "Someone already uses that email.");

        var user = new AppUser { UserName = email, Email = email, EmailConfirmed = true, DisplayName = request.DisplayName.Trim() };
        var created = await users.CreateAsync(user, request.Password ?? "");
        if (!created.Succeeded) return AdminResults.IdentityErrors(created);

        await users.AddToRoleAsync(user, request.Role);
        return Results.Ok(new { user.Id });
    }

    private static async Task<IResult> Update(string id, UpdateStaffRequest request, UserManager<AppUser> users, ClaimsPrincipal me)
    {
        if (!Roles.All.Contains(request.Role)) return AdminResults.Problem(400, "Role must be Owner or Staff.");
        if (string.IsNullOrWhiteSpace(request.DisplayName) || request.DisplayName.Length > 60) return AdminResults.Problem(400, "Name is required.");

        var user = await users.FindByIdAsync(id);
        if (user is null) return Results.NotFound();

        var isOwner = await users.IsInRoleAsync(user, Roles.Owner);
        var losingOwner = isOwner && (request.Role != Roles.Owner || !request.IsActive);
        if (losingOwner)
        {
            if (user.Id == users.GetUserId(me)) return AdminResults.Problem(409, "You can't remove your own owner access. Ask another owner to do it.");
            var activeOwners = (await users.GetUsersInRoleAsync(Roles.Owner)).Count(u => u.IsActive);
            if (activeOwners <= 1) return AdminResults.Problem(409, "There must always be at least one active owner.");
        }

        var wasActive = user.IsActive;
        user.DisplayName = request.DisplayName.Trim();
        user.IsActive = request.IsActive;
        await users.UpdateAsync(user);

        if (request.Role != (isOwner ? Roles.Owner : Roles.Staff))
        {
            await users.RemoveFromRolesAsync(user, Roles.All);
            await users.AddToRoleAsync(user, request.Role);
        }

        // Signs the person out everywhere within a minute when access is removed or changed.
        if (wasActive != request.IsActive || losingOwner) await users.UpdateSecurityStampAsync(user);
        if (request.IsActive && !wasActive) await users.SetLockoutEndDateAsync(user, null);
        return Results.NoContent();
    }

    private static async Task<IResult> ResetPassword(string id, ResetPasswordRequest request, UserManager<AppUser> users)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null) return Results.NotFound();

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var result = await users.ResetPasswordAsync(user, token, request.Password ?? "");
        if (!result.Succeeded) return AdminResults.IdentityErrors(result);

        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        return Results.NoContent();
    }
}
