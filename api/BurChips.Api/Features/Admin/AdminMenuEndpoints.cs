using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Data.Seed;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Admin;

public record ItemGroupLinkDto(int OptionGroupId, string Title, int MinSelect, int MaxSelect, int FreeSelections, int? DependsOnOptionId);

public record AdminItemDto(
    int Id, int CategoryId, string Name, string Slug, string? Description, decimal Price, string? ImageUrl,
    bool IsAvailable, bool IsActive, bool IsFeatured, int SortOrder, int LeadTimeHours,
    IReadOnlyList<ItemGroupLinkDto> OptionGroups);

public record AdminCategoryDto(
    int Id, string Name, string Slug, string? Description, Brand Brand, int SortOrder, bool IsActive,
    IReadOnlyList<AdminItemDto> Items);

public record AdminOptionDto(int Id, string Name, decimal PriceDelta, bool IsAvailable, int SortOrder);

public record AdminOptionGroupDto(int Id, string Name, IReadOnlyList<AdminOptionDto> Options, int UsedByItems);

public record AdminMenuDto(IReadOnlyList<AdminCategoryDto> Categories, IReadOnlyList<AdminOptionGroupDto> OptionGroups);

public record CategoryInput(string Name, string? Description, Brand Brand, bool IsActive);

public record ItemInput(
    int CategoryId, string Name, string? Description, decimal Price, bool IsAvailable, bool IsActive, bool IsFeatured,
    int LeadTimeHours, IReadOnlyList<ItemGroupLinkDto>? OptionGroups);

public record OptionInput(int? Id, string Name, decimal PriceDelta, bool IsAvailable);

public record OptionGroupInput(string Name, IReadOnlyList<OptionInput>? Options);

public record ReorderRequest(IReadOnlyList<int> Ids);

public record AvailabilityRequest(bool IsAvailable);

public static class AdminMenuEndpoints
{
    public static RouteGroupBuilder MapAdminMenuStaffEndpoints(this RouteGroupBuilder staff)
    {
        staff.MapGet("/menu", GetMenu);
        staff.MapPost("/menu/items/{id:int}/availability", SetItemAvailability);
        staff.MapPost("/menu/options/{id:int}/availability", SetOptionAvailability);
        return staff;
    }

    public static RouteGroupBuilder MapAdminMenuOwnerEndpoints(this RouteGroupBuilder owner)
    {
        owner.MapPost("/menu/categories", CreateCategory);
        owner.MapPut("/menu/categories/{id:int}", UpdateCategory);
        owner.MapDelete("/menu/categories/{id:int}", DeleteCategory);
        owner.MapPost("/menu/categories/reorder", ReorderCategories);

        owner.MapPost("/menu/items", CreateItem);
        owner.MapPut("/menu/items/{id:int}", UpdateItem);
        owner.MapDelete("/menu/items/{id:int}", DeleteItem);
        owner.MapPost("/menu/categories/{id:int}/items/reorder", ReorderItems);
        owner.MapPost("/menu/items/{id:int}/image", UploadImage).DisableAntiforgery(); // validated by AntiforgeryFilter
        owner.MapDelete("/menu/items/{id:int}/image", DeleteImage);

        owner.MapPost("/menu/option-groups", CreateOptionGroup);
        owner.MapPut("/menu/option-groups/{id:int}", UpdateOptionGroup);
        owner.MapDelete("/menu/option-groups/{id:int}", DeleteOptionGroup);
        return owner;
    }

    // ---------- Read ----------

    private static async Task<AdminMenuDto> GetMenu(AppDbContext db, CancellationToken ct)
    {
        var categories = await db.Categories.AsNoTracking()
            .Include(c => c.Items).ThenInclude(i => i.OptionGroups)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .AsSplitQuery()
            .ToListAsync(ct);
        var groups = await db.OptionGroups.AsNoTracking().Include(g => g.Options).OrderBy(g => g.Name).ToListAsync(ct);
        var usage = await db.MenuItemOptionGroups.GroupBy(l => l.OptionGroupId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        return new AdminMenuDto(
            [.. categories.Select(c => new AdminCategoryDto(c.Id, c.Name, c.Slug, c.Description, c.Brand, c.SortOrder, c.IsActive,
                [.. c.Items.OrderBy(i => i.SortOrder).ThenBy(i => i.Name).Select(ToDto)]))],
            [.. groups.Select(g => ToDto(g, usage.GetValueOrDefault(g.Id)))]);
    }

    private static AdminItemDto ToDto(MenuItem i) => new(
        i.Id, i.CategoryId, i.Name, i.Slug, i.Description, i.Price, i.ImageUrl, i.IsAvailable, i.IsActive, i.IsFeatured,
        i.SortOrder, i.LeadTimeHours,
        [.. i.OptionGroups.OrderBy(l => l.SortOrder).Select(l => new ItemGroupLinkDto(l.OptionGroupId, l.Title, l.MinSelect, l.MaxSelect, l.FreeSelections, l.DependsOnOptionId))]);

    private static AdminOptionGroupDto ToDto(OptionGroup g, int usedBy) => new(
        g.Id, g.Name,
        [.. g.Options.OrderBy(o => o.SortOrder).ThenBy(o => o.Name).Select(o => new AdminOptionDto(o.Id, o.Name, o.PriceDelta, o.IsAvailable, o.SortOrder))],
        usedBy);

    // ---------- Sold-out toggles (staff) ----------

    private static async Task<IResult> SetItemAvailability(int id, AvailabilityRequest request, AppDbContext db, CancellationToken ct)
    {
        var updated = await db.MenuItems.Where(i => i.Id == id).ExecuteUpdateAsync(s => s.SetProperty(i => i.IsAvailable, request.IsAvailable), ct);
        return updated == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> SetOptionAvailability(int id, AvailabilityRequest request, AppDbContext db, CancellationToken ct)
    {
        var updated = await db.Options.Where(o => o.Id == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.IsAvailable, request.IsAvailable), ct);
        return updated == 0 ? Results.NotFound() : Results.NoContent();
    }

    // ---------- Categories ----------

    private static string? ValidateCategory(CategoryInput input) =>
        string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60 ? "Category name is required (max 60 characters)."
        : input.Description is { Length: > 300 } ? "Description is too long (max 300 characters)."
        : null;

    private static async Task<IResult> CreateCategory(CategoryInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateCategory(input) is { } error) return AdminResults.Problem(400, error);

        var maxSort = await db.Categories.MaxAsync(c => (int?)c.SortOrder, ct) ?? 0;
        var category = new Category
        {
            Name = input.Name.Trim(),
            Slug = await UniqueSlugAsync(input.Name, slug => db.Categories.AnyAsync(c => c.Slug == slug, ct)),
            Description = Clean(input.Description),
            Brand = input.Brand,
            IsActive = input.IsActive,
            SortOrder = maxSort + 1,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { category.Id });
    }

    private static async Task<IResult> UpdateCategory(int id, CategoryInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateCategory(input) is { } error) return AdminResults.Problem(400, error);
        var category = await db.Categories.FindAsync([id], ct);
        if (category is null) return Results.NotFound();

        category.Name = input.Name.Trim();
        category.Description = Clean(input.Description);
        category.Brand = input.Brand;
        category.IsActive = input.IsActive;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteCategory(int id, AppDbContext db, CancellationToken ct)
    {
        if (await db.MenuItems.AnyAsync(i => i.CategoryId == id, ct))
            return AdminResults.Problem(409, "Move or delete the items in this category first, or hide it instead.");
        var deleted = await db.Categories.Where(c => c.Id == id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> ReorderCategories(ReorderRequest request, AppDbContext db, CancellationToken ct)
    {
        var categories = await db.Categories.Where(c => request.Ids.Contains(c.Id)).ToListAsync(ct);
        foreach (var c in categories) c.SortOrder = IndexOf(request.Ids, c.Id) + 1;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ---------- Items ----------

    private static async Task<string?> ValidateItemAsync(ItemInput input, AppDbContext db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 80) return "Item name is required (max 80 characters).";
        if (input.Description is { Length: > 500 }) return "Description is too long (max 500 characters).";
        if (input.Price is < 0 or > 100_000) return "Price must be between Rs 0 and Rs 100,000.";
        if (input.LeadTimeHours is < 0 or > 24 * 14) return "Advance notice must be between 0 and 336 hours.";
        if (!await db.Categories.AnyAsync(c => c.Id == input.CategoryId, ct)) return "Please choose a category.";

        var links = input.OptionGroups ?? [];
        if (links.Select(l => l.OptionGroupId).Distinct().Count() != links.Count) return "Each option group can only be added once.";

        var groupIds = links.Select(l => l.OptionGroupId).ToList();
        var groups = await db.OptionGroups.AsNoTracking().Include(g => g.Options).Where(g => groupIds.Contains(g.Id)).ToDictionaryAsync(g => g.Id, ct);

        foreach (var link in links)
        {
            if (!groups.TryGetValue(link.OptionGroupId, out var group)) return "An option group no longer exists.";
            if (string.IsNullOrWhiteSpace(link.Title) || link.Title.Length > 80) return $"Give \"{group.Name}\" a title customers will see.";
            if (link.MaxSelect < 1 || link.MinSelect < 0 || link.MinSelect > link.MaxSelect)
                return $"\"{link.Title}\": minimum must be between 0 and the maximum, and the maximum at least 1.";
            if (link.MaxSelect > group.Options.Count) return $"\"{link.Title}\": maximum can't be more than its {group.Options.Count} options.";
            if (link.FreeSelections < 0 || link.FreeSelections > link.MaxSelect) return $"\"{link.Title}\": free picks must be between 0 and the maximum.";
            if (link.DependsOnOptionId is { } parent)
            {
                var parentGroup = links.FirstOrDefault(l => l.OptionGroupId != link.OptionGroupId && groups[l.OptionGroupId].Options.Any(o => o.Id == parent));
                if (parentGroup is null) return $"\"{link.Title}\": it can only depend on a choice from another group on this item.";
            }
        }
        return null;
    }

    private static async Task<IResult> CreateItem(ItemInput input, AppDbContext db, CancellationToken ct)
    {
        if (await ValidateItemAsync(input, db, ct) is { } error) return AdminResults.Problem(400, error);

        var maxSort = await db.MenuItems.Where(i => i.CategoryId == input.CategoryId).MaxAsync(i => (int?)i.SortOrder, ct) ?? 0;
        var item = new MenuItem
        {
            Name = input.Name.Trim(),
            Slug = await UniqueSlugAsync(input.Name, slug => db.MenuItems.AnyAsync(i => i.Slug == slug, ct)),
            SortOrder = maxSort + 1,
        };
        Apply(item, input);
        db.MenuItems.Add(item);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { item.Id, item.Slug });
    }

    private static async Task<IResult> UpdateItem(int id, ItemInput input, AppDbContext db, CancellationToken ct)
    {
        if (await ValidateItemAsync(input, db, ct) is { } error) return AdminResults.Problem(400, error);
        var item = await db.MenuItems.Include(i => i.OptionGroups).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null) return Results.NotFound();

        if (item.CategoryId != input.CategoryId)
            item.SortOrder = (await db.MenuItems.Where(i => i.CategoryId == input.CategoryId).MaxAsync(i => (int?)i.SortOrder, ct) ?? 0) + 1;

        // Links are replaced wholesale; the slug stays stable so shared links keep working.
        db.MenuItemOptionGroups.RemoveRange(item.OptionGroups);
        item.OptionGroups.Clear();
        Apply(item, input);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static void Apply(MenuItem item, ItemInput input)
    {
        item.CategoryId = input.CategoryId;
        item.Name = input.Name.Trim();
        item.Description = Clean(input.Description);
        item.Price = decimal.Round(input.Price, 0);
        item.IsAvailable = input.IsAvailable;
        item.IsActive = input.IsActive;
        item.IsFeatured = input.IsFeatured;
        item.LeadTimeHours = input.LeadTimeHours;
        item.OptionGroups = [.. (input.OptionGroups ?? []).Select((l, index) => new MenuItemOptionGroup
        {
            OptionGroupId = l.OptionGroupId,
            Title = l.Title.Trim(),
            MinSelect = l.MinSelect,
            MaxSelect = l.MaxSelect,
            FreeSelections = l.FreeSelections,
            DependsOnOptionId = l.DependsOnOptionId,
            SortOrder = index + 1,
        })];
    }

    private static async Task<IResult> DeleteItem(int id, AppDbContext db, IImageStorage images, CancellationToken ct)
    {
        var item = await db.MenuItems.FindAsync([id], ct);
        if (item is null) return Results.NotFound();
        db.MenuItems.Remove(item); // past orders keep their own copy of the name and price
        await db.SaveChangesAsync(ct);
        if (item.ImageUrl is not null) await images.DeleteAsync(item.ImageUrl, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ReorderItems(int id, ReorderRequest request, AppDbContext db, CancellationToken ct)
    {
        var items = await db.MenuItems.Where(i => i.CategoryId == id && request.Ids.Contains(i.Id)).ToListAsync(ct);
        foreach (var i in items) i.SortOrder = IndexOf(request.Ids, i.Id) + 1;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> UploadImage(int id, IFormFile file, AppDbContext db, IImageStorage images, CancellationToken ct)
    {
        var item = await db.MenuItems.FindAsync([id], ct);
        if (item is null) return Results.NotFound();
        if (file.Length is 0 or > ImageOptions.MaxBytes) return AdminResults.Problem(400, "Please upload an image smaller than 3 MB.");

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();
        if (ImageValidator.Detect(bytes) is not { } kind) return AdminResults.Problem(400, "Only JPG, PNG or WebP photos are allowed.");

        var old = item.ImageUrl;
        item.ImageUrl = await images.SaveAsync(bytes, kind, ct);
        await db.SaveChangesAsync(ct);
        if (old is not null) await images.DeleteAsync(old, ct);
        return Results.Ok(new { item.ImageUrl });
    }

    private static async Task<IResult> DeleteImage(int id, AppDbContext db, IImageStorage images, CancellationToken ct)
    {
        var item = await db.MenuItems.FindAsync([id], ct);
        if (item is null) return Results.NotFound();
        if (item.ImageUrl is { } url)
        {
            item.ImageUrl = null;
            await db.SaveChangesAsync(ct);
            await images.DeleteAsync(url, ct);
        }
        return Results.NoContent();
    }

    // ---------- Option groups ----------

    private static string? ValidateGroup(OptionGroupInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60) return "Group name is required (max 60 characters).";
        var options = input.Options ?? [];
        if (options.Count == 0) return "Add at least one option.";
        if (options.Count > 40) return "A group can have at most 40 options.";
        if (options.Any(o => string.IsNullOrWhiteSpace(o.Name) || o.Name.Trim().Length > 60)) return "Every option needs a name (max 60 characters).";
        if (options.Any(o => o.PriceDelta is < 0 or > 50_000)) return "Option prices must be between Rs 0 and Rs 50,000.";
        if (options.Select(o => o.Name.Trim().ToLowerInvariant()).Distinct().Count() != options.Count) return "Option names must be different.";
        return null;
    }

    private static async Task<IResult> CreateOptionGroup(OptionGroupInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateGroup(input) is { } error) return AdminResults.Problem(400, error);
        var group = new OptionGroup
        {
            Name = input.Name.Trim(),
            Options = [.. input.Options!.Select((o, i) => new Option { Name = o.Name.Trim(), PriceDelta = decimal.Round(o.PriceDelta, 0), IsAvailable = o.IsAvailable, SortOrder = i + 1 })],
        };
        db.OptionGroups.Add(group);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { group.Id });
    }

    private static async Task<IResult> UpdateOptionGroup(int id, OptionGroupInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateGroup(input) is { } error) return AdminResults.Problem(400, error);
        var group = await db.OptionGroups.Include(g => g.Options).FirstOrDefaultAsync(g => g.Id == id, ct);
        if (group is null) return Results.NotFound();

        var keepIds = input.Options!.Where(o => o.Id is not null).Select(o => o.Id!.Value).ToHashSet();
        var removed = group.Options.Where(o => !keepIds.Contains(o.Id)).ToList();
        var removedIds = removed.Select(o => o.Id).ToList();
        if (removedIds.Count > 0 && await db.MenuItemOptionGroups.AnyAsync(l => l.DependsOnOptionId != null && removedIds.Contains(l.DependsOnOptionId.Value), ct))
            return AdminResults.Problem(409, "One of the removed options controls another group on an item (e.g. the meal drink). Change that item first.");

        db.Options.RemoveRange(removed);
        group.Name = input.Name.Trim();
        for (var i = 0; i < input.Options!.Count; i++)
        {
            var o = input.Options[i];
            var option = o.Id is { } optionId ? group.Options.FirstOrDefault(x => x.Id == optionId) : null;
            if (option is null)
            {
                option = new Option { Name = o.Name.Trim() };
                group.Options.Add(option);
            }
            option.Name = o.Name.Trim();
            option.PriceDelta = decimal.Round(o.PriceDelta, 0);
            option.IsAvailable = o.IsAvailable;
            option.SortOrder = i + 1;
        }

        // An item can't require more picks than the group now has.
        var tooMany = await db.MenuItemOptionGroups.Include(l => l.MenuItem)
            .Where(l => l.OptionGroupId == id && l.MaxSelect > input.Options.Count).Select(l => l.MenuItem.Name).FirstOrDefaultAsync(ct);
        if (tooMany is not null) return AdminResults.Problem(409, $"\"{tooMany}\" lets customers pick more options than this group would have. Lower its maximum first.");

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteOptionGroup(int id, AppDbContext db, CancellationToken ct)
    {
        if (await db.MenuItemOptionGroups.AnyAsync(l => l.OptionGroupId == id, ct))
            return AdminResults.Problem(409, "This group is used by menu items. Remove it from those items first.");
        var deleted = await db.OptionGroups.Where(g => g.Id == id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? Results.NotFound() : Results.NoContent();
    }

    // ---------- Helpers ----------

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static int IndexOf(IReadOnlyList<int> ids, int id)
    {
        for (var i = 0; i < ids.Count; i++) if (ids[i] == id) return i;
        return ids.Count;
    }

    private static async Task<string> UniqueSlugAsync(string name, Func<string, Task<bool>> exists)
    {
        var baseSlug = MenuSeed.Slugify(name);
        if (baseSlug.Length == 0) baseSlug = "item";
        var slug = baseSlug;
        for (var n = 2; await exists(slug); n++) slug = $"{baseSlug}-{n}";
        return slug;
    }
}
