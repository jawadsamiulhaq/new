using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Admin;
using BurChips.Api.Features.Menu;
using BurChips.Api.Features.Orders;
using BurChips.Api.Features.Store;

namespace BurChips.Api.Tests;

[Collection(ApiCollection.Name)]
public class AdminMenuAndStoreTests(ApiFactory factory)
{
    public record IdResult(int Id);

    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    [Fact]
    public async Task Owner_adds_a_cake_category_and_item_that_customers_can_order()
    {
        var owner = await factory.StaffClientAsync();

        var category = await owner.PostAsJsonAsync("/api/admin/menu/categories",
            new { name = $"Cakes {Guid.NewGuid():N}"[..14], description = "Order a day ahead", brand = Brand.BakeDukan, isActive = true }, TestJson.Options);
        category.EnsureSuccessStatusCode();
        var categoryId = (await category.Content.ReadFromJsonAsync<IdResult>())!.Id;

        var sizes = await owner.PostAsJsonAsync("/api/admin/menu/option-groups", new
        {
            name = "Cake sizes",
            options = new[] { new { name = "1 lb", priceDelta = 0, isAvailable = true }, new { name = "2 lb", priceDelta = 1200, isAvailable = true } },
        });
        sizes.EnsureSuccessStatusCode();
        var sizesId = (await sizes.Content.ReadFromJsonAsync<IdResult>())!.Id;

        var item = await owner.PostAsJsonAsync("/api/admin/menu/items", new
        {
            categoryId,
            name = "Chocolate Fudge Cake",
            description = "Rich chocolate sponge",
            price = 1500,
            isAvailable = true,
            isActive = true,
            isFeatured = false,
            leadTimeHours = 24,
            optionGroups = new[] { new { optionGroupId = sizesId, title = "Choose size", minSelect = 1, maxSelect = 1, freeSelections = 0 } },
        });
        item.EnsureSuccessStatusCode();

        var menu = await factory.CreateHttpsClient().GetFromJsonAsync<MenuDto>("/api/menu", TestJson.Options);
        var cake = menu!.Categories.Single(c => c.Id == categoryId).Items.Single();
        Assert.Equal("chocolate-fudge-cake", cake.Slug);
        Assert.Equal(24, cake.LeadTimeHours);
        Assert.Equal("Choose size", cake.OptionGroups.Single().Title);

        // Can't delete a category that still has items.
        Assert.Equal(HttpStatusCode.Conflict, (await owner.DeleteAsync($"/api/admin/menu/categories/{categoryId}")).StatusCode);
    }

    [Fact]
    public async Task Broken_option_rules_are_refused()
    {
        var owner = await factory.StaffClientAsync();
        var admin = await owner.GetFromJsonAsync<AdminMenuDto>("/api/admin/menu", TestJson.Options);
        var drinks = admin!.OptionGroups.Single(g => g.Name == "Soft drink flavours");

        var response = await owner.PostAsJsonAsync("/api/admin/menu/items", new
        {
            categoryId = admin.Categories[0].Id,
            name = "Impossible Burger",
            price = 500,
            isAvailable = true,
            isActive = true,
            optionGroups = new[] { new { optionGroupId = drinks.Id, title = "Pick drinks", minSelect = 0, maxSelect = 9, freeSelections = 0 } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("can't be more than", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Removing_the_meal_option_that_controls_the_drink_is_refused()
    {
        var owner = await factory.StaffClientAsync();
        var admin = await owner.GetFromJsonAsync<AdminMenuDto>("/api/admin/menu", TestJson.Options);
        var meal = admin!.OptionGroups.Single(g => g.Name == "Make it a meal");

        var response = await owner.PutAsJsonAsync($"/api/admin/menu/option-groups/{meal.Id}",
            new { name = meal.Name, options = new[] { new { id = (int?)null, name = "Combo", priceDelta = 200, isAvailable = true } } });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Staff_mark_an_item_sold_out_and_customers_see_it()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        var waterId = await factory.ItemIdAsync("water");

        (await staff.PostAsJsonAsync($"/api/admin/menu/items/{waterId}/availability", new { isAvailable = false })).EnsureSuccessStatusCode();
        try
        {
            var menu = await factory.CreateHttpsClient().GetFromJsonAsync<MenuDto>("/api/menu", TestJson.Options);
            Assert.False(menu!.Categories.SelectMany(c => c.Items).Single(i => i.Id == waterId).IsAvailable);
        }
        finally
        {
            (await staff.PostAsJsonAsync($"/api/admin/menu/items/{waterId}/availability", new { isAvailable = true })).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Photos_must_be_real_images_and_are_served_back()
    {
        var owner = await factory.StaffClientAsync();
        var itemId = await factory.ItemIdAsync("tiramisu");

        using var fake = new MultipartFormDataContent { { new ByteArrayContent("<script>alert(1)</script>"u8.ToArray()), "file", "evil.png" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/admin/menu/items/{itemId}/image", fake)).StatusCode);

        var png = new ByteArrayContent(TinyPng);
        png.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        using var real = new MultipartFormDataContent { { png, "file", "tiramisu.png" } };
        var upload = await owner.PostAsync($"/api/admin/menu/items/{itemId}/image", real);
        upload.EnsureSuccessStatusCode();
        var url = (await upload.Content.ReadFromJsonAsync<ImageUrlResult>())!.ImageUrl;

        var served = await factory.CreateHttpsClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/png", served.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());

        (await owner.DeleteAsync($"/api/admin/menu/items/{itemId}/image")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await factory.CreateHttpsClient().GetAsync(url)).StatusCode);
    }

    public record ImageUrlResult(string ImageUrl);

    [Fact]
    public async Task Owner_manages_delivery_areas()
    {
        var owner = await factory.StaffClientAsync();
        var name = $"Bahria {Guid.NewGuid():N}"[..14];
        var created = await owner.PostAsJsonAsync("/api/admin/areas", new { name, fee = 300, minOrder = 1500, isActive = true });
        created.EnsureSuccessStatusCode();

        var store = await factory.CreateHttpsClient().GetFromJsonAsync<StoreDto>("/api/store", TestJson.Options);
        Assert.Contains(store!.DeliveryAreas, a => a.Name == name && a.Fee == 300m);

        // An area with past orders can only be switched off.
        var used = await factory.AreaIdAsync("DHA Phase 8");
        var customer = factory.CreateHttpsClient();
        await factory.SignInAsync(customer);
        (await customer.PostAsJsonAsync("/api/orders", new
        {
            clientRequestId = Guid.NewGuid(), type = OrderType.Delivery, deliveryAreaId = used, addressLine = "House 9, Street 9",
            customerName = "Area Test", paymentMethod = PaymentMethod.Cod, lines = new[] { await factory.ZingerMealAsync() },
        }, TestJson.Options)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await owner.DeleteAsync($"/api/admin/areas/{used}")).StatusCode);
    }

    [Fact]
    public async Task Owner_creates_a_promo_code_customers_can_use()
    {
        var owner = await factory.StaffClientAsync();
        var code = $"EID{Random.Shared.Next(1000, 9999)}";
        (await owner.PostAsJsonAsync("/api/admin/promos", new
        {
            code = code.ToLowerInvariant(), discountType = DiscountType.Flat, value = 100, minOrder = 500,
            maxUsesPerCustomer = 1, firstOrderOnly = false, isActive = true,
        }, TestJson.Options)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync("/api/admin/promos",
            new { code, discountType = DiscountType.Flat, value = 50, minOrder = 0, isActive = true }, TestJson.Options)).StatusCode);

        var quote = await (await factory.CreateHttpsClient().PostAsJsonAsync("/api/checkout/quote",
            new { type = OrderType.Pickup, promoCode = code, lines = new[] { await factory.ZingerMealAsync() } }, TestJson.Options))
            .Content.ReadFromJsonAsync<QuoteResponse>(TestJson.Options);
        Assert.Equal(100m, quote!.Discount);
    }

    [Fact]
    public async Task Staff_can_pause_orders_and_owner_can_change_hours()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        var publicClient = factory.CreateHttpsClient();

        (await staff.PostAsJsonAsync("/api/admin/store/pause", new { isPaused = true, message = "Back at 9" })).EnsureSuccessStatusCode();
        var paused = await publicClient.GetFromJsonAsync<StoreDto>("/api/store", TestJson.Options);
        Assert.False(paused!.Status.CanOrder);
        Assert.Equal("Back at 9", paused.Status.PauseMessage);
        (await staff.PostAsJsonAsync("/api/admin/store/pause", new { isPaused = false })).EnsureSuccessStatusCode();

        var owner = await factory.StaffClientAsync();
        var settings = await owner.GetFromJsonAsync<SettingsDto>("/api/admin/settings", TestJson.Options);
        var closedThursday = settings! with
        {
            Hours = [.. settings.Hours.Select(h => h.Day == DayOfWeek.Thursday ? h with { IsClosed = true } : h)],
        };
        (await owner.PutAsJsonAsync("/api/admin/settings", closedThursday, TestJson.Options)).EnsureSuccessStatusCode();
        try
        {
            var store = await publicClient.GetFromJsonAsync<StoreDto>("/api/store", TestJson.Options);
            Assert.False(store!.Status.IsOpen); // test clock is Thursday 1 PM
        }
        finally
        {
            (await owner.PutAsJsonAsync("/api/admin/settings", settings, TestJson.Options)).EnsureSuccessStatusCode();
        }
    }

    [Fact]
    public async Task Settings_cannot_switch_off_every_way_to_order_or_pay()
    {
        var owner = await factory.StaffClientAsync();
        var settings = await owner.GetFromJsonAsync<SettingsDto>("/api/admin/settings", TestJson.Options);

        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync("/api/admin/settings",
            settings! with { DeliveryEnabled = false, PickupEnabled = false }, TestJson.Options)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync("/api/admin/settings",
            settings with { CodEnabled = false }, TestJson.Options)).StatusCode);
    }
}
