using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Menu;
using BurChips.Api.Features.Store;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

[CollectionDefinition(Name)]
public class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}

/// <summary>Public customer-facing endpoints, run against a real (LocalDB) database.</summary>
[Collection(ApiCollection.Name)]
public class PublicApiTests(ApiFactory factory)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Menu_returns_seeded_categories_items_and_options()
    {
        var menu = await _client.GetFromJsonAsync<MenuDto>("/api/menu", Json);

        Assert.NotNull(menu);
        Assert.Equal(10, menu.Categories.Count);
        Assert.Equal("Chicken Burgers", menu.Categories[0].Name);
        Assert.Equal(35, menu.Categories.Sum(c => c.Items.Count));

        var zinger = menu.Categories.SelectMany(c => c.Items).Single(i => i.Slug == "crispy-zinger");
        Assert.Equal(560m, zinger.Price);
        Assert.True(zinger.IsFeatured);

        var meal = zinger.OptionGroups.Single(g => g.Title.StartsWith("Make it a meal"));
        var drink = zinger.OptionGroups.Single(g => g.Title == "Meal drink");
        Assert.Equal(meal.Options.Single().Id, drink.DependsOnOptionId);

        Assert.Equal(Brand.BakeDukan, menu.Categories.Single(c => c.Slug == "bake-dukan-desserts").Brand);
    }

    [Fact]
    public async Task Menu_hides_inactive_items_but_shows_sold_out_ones()
    {
        await factory.WithDbAsync(async db =>
        {
            await db.MenuItems.Where(i => i.Slug == "tiramisu").ExecuteUpdateAsync(s => s.SetProperty(i => i.IsActive, false));
            await db.MenuItems.Where(i => i.Slug == "brownie-tin").ExecuteUpdateAsync(s => s.SetProperty(i => i.IsAvailable, false));
        });
        try
        {
            var items = (await _client.GetFromJsonAsync<MenuDto>("/api/menu", Json))!
                .Categories.SelectMany(c => c.Items).ToList();

            Assert.DoesNotContain(items, i => i.Slug == "tiramisu");
            Assert.False(items.Single(i => i.Slug == "brownie-tin").IsAvailable);
        }
        finally
        {
            await factory.WithDbAsync(db => db.MenuItems
                .Where(i => i.Slug == "tiramisu" || i.Slug == "brownie-tin")
                .ExecuteUpdateAsync(s => s.SetProperty(i => i.IsActive, true).SetProperty(i => i.IsAvailable, true)));
        }
    }

    [Fact]
    public async Task Store_reports_open_and_orderable_during_hours()
    {
        var store = await _client.GetFromJsonAsync<StoreDto>("/api/store", Json);

        Assert.NotNull(store);
        Assert.Equal("0344-1858989", store.Phone);
        Assert.True(store.Status.IsOpen);
        Assert.True(store.Status.CanOrder);
        Assert.Equal(7, store.Hours.Count);
        Assert.Equal(DayOfWeek.Monday, store.Hours[0].Day);
        Assert.NotEmpty(store.DeliveryAreas);
    }

    [Fact]
    public async Task Store_cannot_take_orders_when_paused()
    {
        await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s
            .SetProperty(x => x.IsPaused, true)
            .SetProperty(x => x.PauseMessage, "Back in 20 minutes")));
        try
        {
            var store = await _client.GetFromJsonAsync<StoreDto>("/api/store", Json);

            Assert.True(store!.Status.IsOpen);
            Assert.True(store.Status.IsPaused);
            Assert.False(store.Status.CanOrder);
            Assert.Equal("Back in 20 minutes", store.Status.PauseMessage);
        }
        finally
        {
            await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsPaused, false)));
        }
    }

    [Fact]
    public async Task Store_is_closed_outside_hours_and_says_when_it_opens()
    {
        var original = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(new DateTimeOffset(2026, 10, 15, 23, 0, 0, TimeSpan.Zero)); // 4 AM Friday in Lahore
        try
        {
            var store = await _client.GetFromJsonAsync<StoreDto>("/api/store", Json);

            Assert.False(store!.Status.IsOpen);
            Assert.False(store.Status.CanOrder);
            Assert.Equal(new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.FromHours(5)), store.Status.NextOpenAt);
        }
        finally
        {
            factory.Clock.SetUtcNow(original);
        }
    }

    [Fact]
    public async Task Unknown_api_route_is_404()
    {
        var response = await _client.GetAsync("/api/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
