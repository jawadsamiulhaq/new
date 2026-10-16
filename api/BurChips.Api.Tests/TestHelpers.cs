using System.Text.Json;
using System.Text.Json.Serialization;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Checkout;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

public static class TestJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };
}

/// <summary>Looks up real ids from the seeded menu so tests read like the printed menu.</summary>
public static class TestMenu
{
    public static async Task<int> ItemIdAsync(this ApiFactory factory, string slug)
    {
        var id = 0;
        await factory.WithDbAsync(async db => id = await db.MenuItems.Where(i => i.Slug == slug).Select(i => i.Id).SingleAsync());
        return id;
    }

    /// <summary>Option id on an item, optionally narrowed by the attachment title (e.g. "Choose your sauce").</summary>
    public static async Task<int> OptionIdAsync(this ApiFactory factory, string itemSlug, string optionName, string? groupTitleStartsWith = null)
    {
        var id = 0;
        await factory.WithDbAsync(async db => id = await db.MenuItemOptionGroups
            .Where(l => l.MenuItem.Slug == itemSlug && (groupTitleStartsWith == null || l.Title.StartsWith(groupTitleStartsWith)))
            .SelectMany(l => l.OptionGroup.Options)
            .Where(o => o.Name == optionName)
            .Select(o => o.Id)
            .SingleAsync());
        return id;
    }

    public static async Task<int> AreaIdAsync(this ApiFactory factory, string name)
    {
        var id = 0;
        await factory.WithDbAsync(async db => id = await db.DeliveryAreas.Where(a => a.Name == name).Select(a => a.Id).SingleAsync());
        return id;
    }

    public static async Task<string> CreatePromoAsync(this ApiFactory factory, Action<PromoCode> configure)
    {
        var promo = new PromoCode { Code = "T" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant() };
        configure(promo);
        await factory.WithDbAsync(async db =>
        {
            db.PromoCodes.Add(promo);
            await db.SaveChangesAsync();
        });
        return promo.Code;
    }

    /// <summary>A Crispy Zinger meal with Pepsi and cheese: 560 + 220 + 80 = Rs 860.</summary>
    public static async Task<CartLineRequest> ZingerMealAsync(this ApiFactory factory, int quantity = 1) => new(
        await factory.ItemIdAsync("crispy-zinger"),
        quantity,
        [
            await factory.OptionIdAsync("crispy-zinger", "Make it a meal (fries + drink)"),
            await factory.OptionIdAsync("crispy-zinger", "Pepsi"),
            await factory.OptionIdAsync("crispy-zinger", "Cheese Slice"),
        ],
        null);
}
