using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Admin;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Data.Seed;

public class SeedOptions
{
    public const string Section = "Seed";

    /// <summary>First owner account, created only when no staff users exist.</summary>
    public string? OwnerEmail { get; set; }
    public string? OwnerPassword { get; set; }
    public string OwnerName { get; set; } = "Owner";

    /// <summary>Adds example delivery areas (development only — the owner sets real ones in admin).</summary>
    public bool SampleDeliveryAreas { get; set; }

    /// <summary>Adds the starting stock photos to menu items without a photo (once per database).</summary>
    public bool DemoImages { get; set; } = true;
}

/// <summary>
/// Fills an empty database with roles, the owner account, store settings, opening hours and the menu.
/// Every step is skipped if its data already exists, so it is safe to run on every start.
/// </summary>
public class DbSeeder(
    AppDbContext db,
    RoleManager<IdentityRole> roles,
    UserManager<AppUser> users,
    IImageStorage images,
    IConfiguration config,
    ILogger<DbSeeder> logger)
{
    /// <summary>Folder (next to the app) holding the starting photos, one per item slug: <c>{slug}.webp</c>.</summary>
    public static string DemoImageFolder => Path.Combine(AppContext.BaseDirectory, "Data", "Seed", "Images");

    public async Task SeedAsync(CancellationToken ct = default)
    {
        var options = config.GetSection(SeedOptions.Section).Get<SeedOptions>() ?? new SeedOptions();

        await SeedRolesAsync();
        await SeedOwnerAsync(options);
        await SeedStoreAsync(ct);
        await SeedHoursAsync(ct);
        if (options.SampleDeliveryAreas) await SeedSampleAreasAsync(ct);
        await SeedMenuAsync(ct);
        if (options.DemoImages) await SeedDemoImagesAsync(ct);
    }

    /// <summary>
    /// Gives every item without a photo its matching stock photo, then remembers that this was done,
    /// so photos the owner later removes or replaces in admin never come back.
    /// </summary>
    private async Task SeedDemoImagesAsync(CancellationToken ct)
    {
        var settings = await db.StoreSettings.FirstAsync(ct);
        if (settings.DemoImagesApplied || !Directory.Exists(DemoImageFolder)) return;

        var items = await db.MenuItems.Where(i => i.ImageUrl == null).ToListAsync(ct);
        var added = 0;
        foreach (var item in items)
        {
            var file = Path.Combine(DemoImageFolder, $"{item.Slug}.webp");
            if (!File.Exists(file)) continue;

            var bytes = await File.ReadAllBytesAsync(file, ct);
            if (ImageValidator.Detect(bytes) is not { } kind) continue;
            item.ImageUrl = await images.SaveAsync(bytes, kind, ct);
            added++;
        }

        settings.DemoImagesApplied = true;
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Added {Count} starting menu photos", added);
    }

    private async Task SeedRolesAsync()
    {
        foreach (var role in Roles.All)
        {
            if (!await roles.RoleExistsAsync(role))
                await roles.CreateAsync(new IdentityRole(role));
        }
    }

    private async Task SeedOwnerAsync(SeedOptions options)
    {
        if (await users.Users.AnyAsync()) return;

        if (string.IsNullOrWhiteSpace(options.OwnerEmail) || string.IsNullOrWhiteSpace(options.OwnerPassword))
        {
            logger.LogWarning("No staff accounts exist and Seed:OwnerEmail/Seed:OwnerPassword are not set — owner account not created.");
            return;
        }

        var owner = new AppUser
        {
            UserName = options.OwnerEmail,
            Email = options.OwnerEmail,
            EmailConfirmed = true,
            DisplayName = options.OwnerName,
        };
        var result = await users.CreateAsync(owner, options.OwnerPassword);
        if (!result.Succeeded)
            throw new InvalidOperationException(
                "Could not create owner account: " + string.Join("; ", result.Errors.Select(e => e.Description)));

        await users.AddToRoleAsync(owner, Roles.Owner);
        logger.LogInformation("Created owner account {Email}", options.OwnerEmail);
    }

    private async Task SeedStoreAsync(CancellationToken ct)
    {
        if (await db.StoreSettings.AnyAsync(ct)) return;

        db.StoreSettings.Add(new StoreSettings
        {
            StoreName = "BurChips × Bake Dukan",
            Phone = "0344-1858989",
            WhatsAppNumber = "+923441858989",
            Address = "185/1 D Block, DHA Phase 8, Commercial Broadway, Lahore (Back side of DHA Business Hub)",
        });
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedHoursAsync(CancellationToken ct)
    {
        if (await db.OpeningHours.AnyAsync(ct)) return;

        // Placeholder 12:00 PM – 2:00 AM every day; the owner updates real hours in admin.
        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            db.OpeningHours.Add(new OpeningHours
            {
                DayOfWeek = day,
                OpensAt = new TimeOnly(12, 0),
                ClosesAt = new TimeOnly(2, 0),
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedSampleAreasAsync(CancellationToken ct)
    {
        if (await db.DeliveryAreas.AnyAsync(ct)) return;

        (string Name, decimal Fee, decimal Min)[] areas =
        [
            ("DHA Phase 8", 100m, 500m),
            ("DHA Phase 6", 150m, 700m),
            ("DHA Phase 5", 150m, 700m),
            ("DHA Phase 7", 200m, 1000m),
            ("Askari 10", 250m, 1000m),
        ];
        for (var i = 0; i < areas.Length; i++)
        {
            db.DeliveryAreas.Add(new DeliveryArea
            {
                Name = areas[i].Name,
                Fee = areas[i].Fee,
                MinOrder = areas[i].Min,
                SortOrder = i + 1,
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedMenuAsync(CancellationToken ct)
    {
        if (await db.Categories.AnyAsync(ct)) return;

        db.Categories.AddRange(MenuSeed.Build());
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Seeded menu");
    }
}
