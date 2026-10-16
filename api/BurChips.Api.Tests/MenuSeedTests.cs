using BurChips.Api.Data.Entities;
using BurChips.Api.Data.Seed;

namespace BurChips.Api.Tests;

public class MenuSeedTests
{
    private readonly List<Category> _menu = MenuSeed.Build();

    private IEnumerable<MenuItem> AllItems => _menu.SelectMany(c => c.Items);

    private MenuItem Item(string name) => AllItems.Single(i => i.Name == name);

    [Fact]
    public void Has_all_printed_items()
    {
        Assert.Equal(10, _menu.Count);
        Assert.Equal(35, AllItems.Count());
    }

    [Theory]
    [InlineData("Plain Fries", 230)]
    [InlineData("Loaded Fries", 570)]
    [InlineData("Crispy Chicken Strips", 450)]
    [InlineData("Crispy Royale Wings", 550)]
    [InlineData("Alfredo Pasta", 600)]
    [InlineData("Crispy FrankFurter", 350)]
    [InlineData("Crispy Zinger", 560)]
    [InlineData("BurChips Special Grilled", 650)]
    [InlineData("BurChips Mushroom Special", 880)]
    [InlineData("Grilled Chicken Wrap", 720)]
    [InlineData("Creamy Spinach Grilled Chicken", 820)]
    [InlineData("Brownie Tin", 380)]
    [InlineData("Tiramisu", 450)]
    [InlineData("Regular Drink", 120)]
    [InlineData("French Vanilla Coffee", 400)]
    public void Prices_match_printed_menu(string name, decimal price) =>
        Assert.Equal(price, Item(name).Price);

    [Fact]
    public void Slugs_are_unique()
    {
        Assert.Equal(AllItems.Count(), AllItems.Select(i => i.Slug).Distinct().Count());
        Assert.Equal(_menu.Count, _menu.Select(c => c.Slug).Distinct().Count());
    }

    [Fact]
    public void Option_rules_are_consistent()
    {
        foreach (var link in AllItems.SelectMany(i => i.OptionGroups))
        {
            Assert.InRange(link.MinSelect, 0, link.MaxSelect);
            Assert.InRange(link.FreeSelections, 0, link.MaxSelect);
            Assert.True(link.MaxSelect <= link.OptionGroup.Options.Count,
                $"'{link.Title}' allows more picks than it has options");
        }
    }

    [Fact]
    public void Burgers_and_wraps_offer_meal_with_dependent_drink()
    {
        var mealItems = AllItems.Where(i => i.OptionGroups.Any(l => l.OptionGroup.Name == "Make it a meal")).ToList();
        Assert.Equal(9, mealItems.Count); // 7 burgers + 2 wraps

        foreach (var item in mealItems)
        {
            var meal = item.OptionGroups.Single(l => l.OptionGroup.Name == "Make it a meal");
            Assert.Equal(220m, meal.OptionGroup.Options.Single().PriceDelta);

            var drink = item.OptionGroups.Single(l => l.Title == "Meal drink");
            Assert.Same(meal.OptionGroup.Options.Single(), drink.DependsOnOption);
        }
    }

    [Theory]
    [InlineData("BBQ Bucket")]
    [InlineData("Loaded Fries")]
    [InlineData("Crispy Royale Wings")]
    [InlineData("Crispy Chicken Wrap")]
    [InlineData("Grilled Chicken Wrap")]
    public void Two_sauce_items_include_two_free_dip_sauces(string name)
    {
        var sauces = Item(name).OptionGroups.Single(l => l.OptionGroup.Name == "Dip sauces");
        Assert.Equal(2, sauces.MinSelect);
        Assert.Equal(2, sauces.FreeSelections);
        Assert.All(sauces.OptionGroup.Options, o => Assert.Equal(80m, o.PriceDelta));
    }

    [Fact]
    public void Strip_sauces_match_menu_including_garlic_mayo()
    {
        var strips = Item("Crispy Chicken Strips").OptionGroups.Single(l => l.OptionGroup.Name == "Strip sauces");
        Assert.Equal(["Honey Mustard", "Garlic Mayo", "Sriracha", "BurChips Special"],
            strips.OptionGroup.Options.Select(o => o.Name));
        Assert.Equal(1, strips.MinSelect);
    }

    [Fact]
    public void Only_desserts_use_bake_dukan_brand()
    {
        var bakeDukan = Assert.Single(_menu, c => c.Brand == Brand.BakeDukan);
        Assert.Equal("Bake Dukan Desserts", bakeDukan.Name);
    }
}
