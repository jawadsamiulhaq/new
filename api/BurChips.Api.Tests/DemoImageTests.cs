using System.Net;
using System.Net.Http.Json;
using BurChips.Api.Data.Seed;
using BurChips.Api.Features.Menu;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BurChips.Api.Tests;

/// <summary>The starting stock photos: added once on first start, never re-added after the owner changes them.</summary>
[Collection(ApiCollection.Name)]
public class DemoImageTests(ApiFactory factory)
{
    [Fact]
    public void Every_menu_item_has_a_starting_photo_file()
    {
        var missing = MenuSeed.Build()
            .SelectMany(c => c.Items)
            .Where(i => !File.Exists(Path.Combine(DbSeeder.DemoImageFolder, $"{i.Slug}.webp")))
            .Select(i => i.Slug)
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public async Task Menu_items_start_with_photos_that_are_served()
    {
        var menu = await factory.CreateHttpsClient().GetFromJsonAsync<MenuDto>("/api/menu", TestJson.Options);
        var zinger = menu!.Categories.SelectMany(c => c.Items).Single(i => i.Slug == "crispy-zinger");
        Assert.NotNull(zinger.ImageUrl);

        var photo = await factory.CreateHttpsClient().GetAsync(zinger.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal("image/webp", photo.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task A_photo_the_owner_removes_is_not_added_back_on_restart()
    {
        var owner = await factory.StaffClientAsync();
        var waterId = await factory.ItemIdAsync("water");
        (await owner.DeleteAsync($"/api/admin/menu/items/{waterId}/image")).EnsureSuccessStatusCode();

        // Run the startup seeder again, as happens on every restart/deploy.
        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();

        await factory.WithDbAsync(async db =>
            Assert.Null(await db.MenuItems.Where(i => i.Id == waterId).Select(i => i.ImageUrl).SingleAsync()));
    }
}
