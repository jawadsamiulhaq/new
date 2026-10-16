using Microsoft.AspNetCore.Identity;

namespace BurChips.Api.Data.Entities;

/// <summary>Restaurant staff account (Owner or Staff role). Customers are not Identity users.</summary>
public class AppUser : IdentityUser
{
    public required string DisplayName { get; set; }
    public int BranchId { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

public static class Roles
{
    public const string Owner = "Owner";
    public const string Staff = "Staff";

    public static readonly string[] All = [Owner, Staff];
}
