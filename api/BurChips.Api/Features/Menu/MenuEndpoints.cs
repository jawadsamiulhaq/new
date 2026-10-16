using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Menu;

public record MenuOptionDto(int Id, string Name, decimal Price, bool IsAvailable);

/// <summary>An option group as attached to one item (Id is the attachment id).</summary>
public record MenuOptionGroupDto(
    int Id,
    string Title,
    int MinSelect,
    int MaxSelect,
    int FreeSelections,
    int? DependsOnOptionId,
    IReadOnlyList<MenuOptionDto> Options);

public record MenuItemDto(
    int Id,
    string Name,
    string Slug,
    string? Description,
    decimal Price,
    string? ImageUrl,
    bool IsAvailable,
    bool IsFeatured,
    int LeadTimeHours,
    IReadOnlyList<MenuOptionGroupDto> OptionGroups);

public record MenuCategoryDto(
    int Id,
    string Name,
    string Slug,
    string? Description,
    Brand Brand,
    IReadOnlyList<MenuItemDto> Items);

public record MenuDto(IReadOnlyList<MenuCategoryDto> Categories);

public static class MenuEndpoints
{
    public static IEndpointRouteBuilder MapMenuEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/menu", GetMenu).AllowAnonymous();
        return app;
    }

    private static async Task<MenuDto> GetMenu(AppDbContext db, CancellationToken ct)
    {
        var categories = await db.Categories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Include(c => c.Items.Where(i => i.IsActive))
                .ThenInclude(i => i.OptionGroups)
                .ThenInclude(l => l.OptionGroup)
                .ThenInclude(g => g.Options)
            .AsSplitQuery()
            .ToListAsync(ct);

        return new MenuDto([.. categories
            .Where(c => c.Items.Count > 0)
            .Select(c => new MenuCategoryDto(
                c.Id, c.Name, c.Slug, c.Description, c.Brand,
                [.. c.Items.OrderBy(i => i.SortOrder).ThenBy(i => i.Name).Select(ToDto)]))]);
    }

    private static MenuItemDto ToDto(MenuItem i) => new(
        i.Id, i.Name, i.Slug, i.Description, i.Price, i.ImageUrl, i.IsAvailable, i.IsFeatured, i.LeadTimeHours,
        [.. i.OptionGroups.OrderBy(l => l.SortOrder).Select(l => new MenuOptionGroupDto(
            l.Id, l.Title, l.MinSelect, l.MaxSelect, l.FreeSelections, l.DependsOnOptionId,
            [.. l.OptionGroup.Options
                .OrderBy(o => o.SortOrder).ThenBy(o => o.Name)
                .Select(o => new MenuOptionDto(o.Id, o.Name, o.PriceDelta, o.IsAvailable))]))]);
}
