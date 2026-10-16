using System.Text.RegularExpressions;
using BurChips.Api.Data.Entities;

namespace BurChips.Api.Data.Seed;

/// <summary>
/// The launch menu, transcribed from the printed BurChips × Bake Dukan menu.
/// Only used to fill an empty database — afterwards the owner manages everything in admin.
/// </summary>
public static partial class MenuSeed
{
    public static List<Category> Build()
    {
        // ---- Reusable option groups ----
        var dipSauces = Group("Dip sauces", 80m, "Honey Mustard", "BBQ Mustard", "Cocktail", "Sriracha", "BurChips Special");
        var stripSauces = Group("Strip sauces", 0m, "Honey Mustard", "Garlic Mayo", "Sriracha", "BurChips Special");
        var softDrinks = Group("Soft drink flavours", 0m, "Pepsi", "7Up", "Mirinda", "Mountain Dew");
        var sundaeFlavours = Group("Sundae flavours", 0m, "Chocolate", "Caramel");
        var milkBathFlavours = Group("Milk Bath flavours", 0m, "Chocolate", "Pina Colada", "Biscoff");

        var meal = Group("Make it a meal", 220m, "Make it a meal (fries + drink)");
        var mealOption = meal.Options[0];

        var burgerExtras = new OptionGroup
        {
            Name = "Burger extras",
            Options =
            [
                new Option { Name = "Cheese Slice", PriceDelta = 80m, SortOrder = 1 },
                new Option { Name = "Extra Bun", PriceDelta = 60m, SortOrder = 2 },
                new Option { Name = "Grilled Chicken Fillet", PriceDelta = 200m, SortOrder = 3 },
                new Option { Name = "Beef Patty", PriceDelta = 350m, SortOrder = 4 },
            ],
        };

        // ---- Item rule presets ----
        MenuItemOptionGroup TwoSaucesIncluded() =>
            Link(dipSauces, "Choose 2 sauces (extra +Rs 80 each)", min: 2, max: 5, free: 2, sort: 1);
        MenuItemOptionGroup ExtraDip(int sort = 9) =>
            Link(dipSauces, "Add a dip sauce (Rs 80 each)", min: 0, max: 5, free: 0, sort: sort);
        MenuItemOptionGroup[] MealUpgrade() =>
        [
            Link(meal, "Make it a meal? (+Rs 220)", min: 0, max: 1, free: 0, sort: 2),
            Link(softDrinks, "Meal drink", min: 1, max: 1, free: 0, sort: 3, dependsOn: mealOption),
        ];
        MenuItemOptionGroup Extras() =>
            Link(burgerExtras, "Extras", min: 0, max: 4, free: 0, sort: 4);

        MenuItemOptionGroup[] BurgerOptions() => [.. MealUpgrade(), Extras(), ExtraDip()];

        return
        [
            Category("Chicken Burgers", 1, "All burgers are 100g.", items:
            [
                Item("Crispy FrankFurter", 350m, null, BurgerOptions()),
                Item("Crispy Zinger", 560m, null, BurgerOptions()),
                Item("Classic Grilled (BBQ)", 580m, null, BurgerOptions()),
                Item("OG Grilled (Cocktail)", 580m, null, BurgerOptions()),
                Item("BurChips Special Grilled", 650m, null, BurgerOptions()),
            ]),
            Category("Beef Burgers", 2, "All burgers are 100g.", items:
            [
                Item("Classic OG Beef", 830m, null, BurgerOptions()),
                Item("BurChips Mushroom Special", 880m, null, BurgerOptions()),
            ]),
            Category("Wraps", 3, null, items:
            [
                Item("Crispy Chicken Wrap", 680m, "With lettuce, fries, jalapeño, olives & 2 in-house sauces.",
                    [TwoSaucesIncluded(), .. MealUpgrade()]),
                Item("Grilled Chicken Wrap", 720m, "With lettuce, fries, jalapeño, olives & 2 in-house sauces.",
                    [TwoSaucesIncluded(), .. MealUpgrade()]),
            ]),
            Category("Grilled Chicken", 4, null, items:
            [
                Item("Creamy Spinach Grilled Chicken", 820m, null, [ExtraDip()]),
                Item("Special Mushroom Grilled Chicken", 820m, null, [ExtraDip()]),
            ]),
            Category("Starters & Fries", 5, null, items:
            [
                Item("Plain Fries", 230m, null, [ExtraDip()]),
                Item("Masala Fries", 250m, null, [ExtraDip()]),
                Item("BBQ Fries", 250m, null, [ExtraDip()]),
                Item("Fries Bucket", 320m, null, [ExtraDip()]),
                Item("Masala Bucket", 350m, null, [ExtraDip()]),
                Item("BBQ Bucket", 400m, "Comes with 2 in-house sauces.", [TwoSaucesIncluded()]),
                Item("Loaded Fries", 570m, "Crispy chicken, 2 in-house sauces, jalapeño, olives & cheese.", [TwoSaucesIncluded()]),
            ]),
            Category("Chicken Strips", 6, "4 pieces per serving.", items:
            [
                Item("Crispy Chicken Strips", 450m, "4 pieces, served with our special in-house sauce.",
                [
                    Link(stripSauces, "Choose your sauce", min: 1, max: 1, free: 0, sort: 1),
                    ExtraDip(),
                ]),
            ]),
            Category("Crispy Wings", 7, null, items:
            [
                Item("Plain Wings", 450m, null, [ExtraDip()]),
                Item("Glossy Wings", 500m, "Tossed in our special in-house Glossy Sauce.", [ExtraDip()]),
                Item("Crispy Royale Wings", 550m, "Two in-house sauces, drizzled with black & white sesame seeds.", [TwoSaucesIncluded()]),
            ]),
            Category("Pasta", 8, null, items:
            [
                Item("Alfredo Pasta", 600m, null, []),
            ]),
            Category("Bake Dukan Desserts", 9, "Sweet treats from Bake Dukan.", Brand.BakeDukan, items:
            [
                Item("Waffle Cone", 200m, null, []),
                Item("Sundae", 350m, null, [Link(sundaeFlavours, "Choose flavour", min: 1, max: 1, free: 0, sort: 1)]),
                Item("Brownie with Ice Cream", 400m, null, []),
                Item("Milk Bath", 400m, null, [Link(milkBathFlavours, "Choose flavour", min: 1, max: 1, free: 0, sort: 1)]),
                Item("Brownie Tin", 380m, null, []),
                Item("Tiramisu", 450m, null, []),
            ]),
            Category("Beverages", 10, null, items:
            [
                Item("Regular Drink", 120m, null, [Link(softDrinks, "Choose your drink", min: 1, max: 1, free: 0, sort: 1)]),
                Item("Water", 100m, null, []),
                Item("Karak Chai", 250m, null, []),
                Item("Cardamom Tea", 250m, null, []),
                Item("Cappuccino Coffee", 350m, null, []),
                Item("French Vanilla Coffee", 400m, null, []),
            ]),
        ];
    }

    private static OptionGroup Group(string name, decimal price, params string[] options) => new()
    {
        Name = name,
        Options = [.. options.Select((o, i) => new Option { Name = o, PriceDelta = price, SortOrder = i + 1 })],
    };

    private static MenuItemOptionGroup Link(
        OptionGroup group, string title, int min, int max, int free, int sort, Option? dependsOn = null) => new()
    {
        OptionGroup = group,
        Title = title,
        MinSelect = min,
        MaxSelect = max,
        FreeSelections = free,
        SortOrder = sort,
        DependsOnOption = dependsOn,
    };

    private static Category Category(
        string name, int sort, string? description, Brand brand = Brand.BurChips, List<MenuItem>? items = null)
    {
        var list = items ?? [];
        for (var i = 0; i < list.Count; i++) list[i].SortOrder = i + 1;
        return new Category
        {
            Name = name,
            Slug = Slugify(name),
            Description = description,
            Brand = brand,
            SortOrder = sort,
            Items = list,
        };
    }

    /// <summary>Launch "Popular picks" — the owner can change these in admin.</summary>
    private static readonly HashSet<string> Featured =
    [
        "Crispy Zinger", "BurChips Special Grilled", "BurChips Mushroom Special",
        "Loaded Fries", "Crispy Royale Wings", "Milk Bath",
    ];

    private static MenuItem Item(string name, decimal price, string? description, MenuItemOptionGroup[] options) => new()
    {
        Name = name,
        Slug = Slugify(name),
        Price = price,
        Description = description,
        IsFeatured = Featured.Contains(name),
        OptionGroups = [.. options],
    };

    public static string Slugify(string text) =>
        NonSlugChars().Replace(text.ToLowerInvariant(), "-").Trim('-');

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();
}
