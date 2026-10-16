using System.Net.Http.Json;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Checkout;
using BurChips.Api.Features.Orders;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

/// <summary>Server-side pricing: every rupee comes from the database, never from the browser.</summary>
[Collection(ApiCollection.Name)]
public class CheckoutQuoteTests(ApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateHttpsClient();

    private async Task<QuoteResponse> QuoteAsync(object request)
    {
        var response = await _client.PostAsJsonAsync("/api/checkout/quote", request, TestJson.Options);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<QuoteResponse>(TestJson.Options))!;
    }

    private static object Pickup(params CartLineRequest[] lines) => new { type = OrderType.Pickup, lines };

    [Fact]
    public async Task Burger_meal_with_drink_and_cheese_costs_860()
    {
        var quote = await QuoteAsync(Pickup(await factory.ZingerMealAsync(quantity: 2)));

        Assert.Empty(quote.Problems);
        var line = Assert.Single(quote.Lines);
        Assert.Equal(860m, line.UnitPrice);
        Assert.Equal(1720m, quote.Subtotal);
        Assert.Equal(1720m, quote.Total);
    }

    [Fact]
    public async Task Bucket_includes_two_sauces_and_charges_the_third()
    {
        var item = await factory.ItemIdAsync("bbq-bucket");
        int[] two = [await factory.OptionIdAsync("bbq-bucket", "Honey Mustard"), await factory.OptionIdAsync("bbq-bucket", "Cocktail")];
        int[] three = [.. two, await factory.OptionIdAsync("bbq-bucket", "Sriracha")];

        Assert.Equal(400m, (await QuoteAsync(Pickup(new CartLineRequest(item, 1, two, null)))).Total);
        Assert.Equal(480m, (await QuoteAsync(Pickup(new CartLineRequest(item, 1, three, null)))).Total);
    }

    [Fact]
    public async Task Missing_required_choice_is_a_problem()
    {
        var bucket = new CartLineRequest(await factory.ItemIdAsync("bbq-bucket"), 1, [await factory.OptionIdAsync("bbq-bucket", "Cocktail")], null);
        var quote = await QuoteAsync(Pickup(bucket));
        Assert.Contains(quote.Problems, p => p.Code == "bad_selection");
    }

    [Fact]
    public async Task Meal_drink_without_the_meal_is_rejected()
    {
        var line = new CartLineRequest(await factory.ItemIdAsync("crispy-zinger"), 1, [await factory.OptionIdAsync("crispy-zinger", "Pepsi")], null);
        var quote = await QuoteAsync(Pickup(line));
        Assert.Contains(quote.Problems, p => p.Code == "bad_option");
    }

    [Fact]
    public async Task Options_from_another_item_cannot_be_smuggled_in()
    {
        // Beef Patty is an extra on burgers, not on plain fries.
        var line = new CartLineRequest(await factory.ItemIdAsync("plain-fries"), 1, [await factory.OptionIdAsync("crispy-zinger", "Beef Patty")], null);
        var quote = await QuoteAsync(Pickup(line));
        Assert.Contains(quote.Problems, p => p.Code == "bad_option");
        Assert.Equal(0m, quote.Total);
    }

    [Fact]
    public async Task Quantity_must_be_sensible()
    {
        var item = await factory.ItemIdAsync("water");
        Assert.Contains((await QuoteAsync(Pickup(new CartLineRequest(item, 0, null, null)))).Problems, p => p.Code == "bad_quantity");
        Assert.Contains((await QuoteAsync(Pickup(new CartLineRequest(item, 999, null, null)))).Problems, p => p.Code == "bad_quantity");
    }

    [Fact]
    public async Task Sold_out_items_cannot_be_ordered()
    {
        await factory.WithDbAsync(db => db.MenuItems.Where(i => i.Slug == "cardamom-tea").ExecuteUpdateAsync(s => s.SetProperty(i => i.IsAvailable, false)));
        try
        {
            var quote = await QuoteAsync(Pickup(new CartLineRequest(await factory.ItemIdAsync("cardamom-tea"), 1, null, null)));
            Assert.Contains(quote.Problems, p => p.Code == "item_sold_out");
        }
        finally
        {
            await factory.WithDbAsync(db => db.MenuItems.Where(i => i.Slug == "cardamom-tea").ExecuteUpdateAsync(s => s.SetProperty(i => i.IsAvailable, true)));
        }
    }

    [Fact]
    public async Task Delivery_adds_area_fee_and_enforces_minimum_order()
    {
        var area = await factory.AreaIdAsync("DHA Phase 6"); // sample: fee 150, minimum 700
        var water = new CartLineRequest(await factory.ItemIdAsync("water"), 1, null, null);

        var small = await QuoteAsync(new { type = OrderType.Delivery, deliveryAreaId = area, lines = new[] { water } });
        Assert.Contains(small.Problems, p => p.Code == "below_minimum");

        var meal = await QuoteAsync(new { type = OrderType.Delivery, deliveryAreaId = area, lines = new[] { await factory.ZingerMealAsync() } });
        Assert.Empty(meal.Problems);
        Assert.Equal(150m, meal.DeliveryFee);
        Assert.Equal(1010m, meal.Total);
    }

    [Fact]
    public async Task Delivery_needs_an_area()
    {
        var quote = await QuoteAsync(new { type = OrderType.Delivery, lines = new[] { await factory.ZingerMealAsync() } });
        Assert.Contains(quote.Problems, p => p.Code == "area_required");
    }

    [Fact]
    public async Task Free_delivery_above_threshold()
    {
        await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s.SetProperty(x => x.FreeDeliveryThreshold, 1500m)));
        try
        {
            var area = await factory.AreaIdAsync("DHA Phase 6");
            var quote = await QuoteAsync(new { type = OrderType.Delivery, deliveryAreaId = area, lines = new[] { await factory.ZingerMealAsync(2) } });
            Assert.Equal(0m, quote.DeliveryFee);
            Assert.Equal(1720m, quote.Total);
        }
        finally
        {
            await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s.SetProperty(x => x.FreeDeliveryThreshold, (decimal?)null)));
        }
    }

    [Fact]
    public async Task Percent_promo_is_capped_and_flat_promo_applies()
    {
        var percent = await factory.CreatePromoAsync(p => { p.DiscountType = DiscountType.Percent; p.Value = 10; p.MaxDiscount = 100; });
        var flat = await factory.CreatePromoAsync(p => { p.DiscountType = DiscountType.Flat; p.Value = 150; p.MinOrder = 1000; });
        var lines = new[] { await factory.ZingerMealAsync(2) }; // 1720

        var withPercent = await QuoteAsync(new { type = OrderType.Pickup, promoCode = percent.ToLowerInvariant(), lines });
        Assert.Equal(100m, withPercent.Discount); // 10% = 172, capped at 100
        Assert.Equal(1620m, withPercent.Total);

        var withFlat = await QuoteAsync(new { type = OrderType.Pickup, promoCode = flat, lines });
        Assert.Equal(150m, withFlat.Discount);
        Assert.Equal(1570m, withFlat.Total);
    }

    [Fact]
    public async Task Invalid_promos_explain_why_and_give_no_discount()
    {
        var expired = await factory.CreatePromoAsync(p => { p.Value = 10; p.ExpiresAt = factory.Clock.GetUtcNow().AddDays(-1); });
        var minimum = await factory.CreatePromoAsync(p => { p.Value = 10; p.MinOrder = 5000; });
        var lines = new[] { await factory.ZingerMealAsync() };

        var a = await QuoteAsync(new { type = OrderType.Pickup, promoCode = expired, lines });
        Assert.Equal(0m, a.Discount);
        Assert.Contains("expired", a.PromoMessage);

        var b = await QuoteAsync(new { type = OrderType.Pickup, promoCode = minimum, lines });
        Assert.Equal(0m, b.Discount);
        Assert.Contains("more to use", b.PromoMessage);

        var c = await QuoteAsync(new { type = OrderType.Pickup, promoCode = "NOPE", lines });
        Assert.Contains("isn't valid", c.PromoMessage);
        Assert.Empty(c.Problems); // a bad promo alone doesn't block the cart
    }

    [Fact]
    public async Task Tax_is_added_only_when_prices_exclude_it()
    {
        await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s
            .SetProperty(x => x.PricesIncludeTax, false).SetProperty(x => x.TaxPercent, 5m)));
        try
        {
            var quote = await QuoteAsync(Pickup(await factory.ZingerMealAsync()));
            Assert.Equal(43m, quote.Tax); // 5% of 860
            Assert.Equal(903m, quote.Total);
        }
        finally
        {
            await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s
                .SetProperty(x => x.PricesIncludeTax, true).SetProperty(x => x.TaxPercent, 0m)));
        }
    }
}
