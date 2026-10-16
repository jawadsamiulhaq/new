namespace BurChips.Api.Data.Entities;

/// <summary>Visual brand a category belongs to. Bake Dukan sections get the pink accent.</summary>
public enum Brand
{
    BurChips = 0,
    BakeDukan = 1,
}

public class Category
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public string? Description { get; set; }
    public Brand Brand { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public List<MenuItem> Items { get; set; } = [];
}

public class MenuItem
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;

    public required string Name { get; set; }
    public required string Slug { get; set; }
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string? ImageUrl { get; set; }

    /// <summary>Temporarily sold out (staff toggle). Item stays visible but can't be ordered.</summary>
    public bool IsAvailable { get; set; } = true;

    /// <summary>Hidden from the menu entirely (owner toggle).</summary>
    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }

    /// <summary>Shown in "Popular picks" on the home page.</summary>
    public bool IsFeatured { get; set; }

    /// <summary>Hours of advance notice required (e.g. 24 for cakes). 0 = ready ASAP.</summary>
    public int LeadTimeHours { get; set; }

    public List<MenuItemOptionGroup> OptionGroups { get; set; } = [];
}

/// <summary>A reusable list of choices, e.g. "Dip sauces" or "Soft drink flavours".</summary>
public class OptionGroup
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;
    public required string Name { get; set; }

    public List<Option> Options { get; set; } = [];
}

public class Option
{
    public int Id { get; set; }
    public int OptionGroupId { get; set; }
    public OptionGroup OptionGroup { get; set; } = null!;

    public required string Name { get; set; }
    public decimal PriceDelta { get; set; }
    public bool IsAvailable { get; set; } = true;
    public int SortOrder { get; set; }
}

/// <summary>
/// Attaches an option group to an item with item-specific rules, so the same
/// "Dip sauces" group can be "Choose 2 sauces (included)" on a bucket and
/// "Extra dip sauce" on a burger.
/// </summary>
public class MenuItemOptionGroup
{
    public int Id { get; set; }
    public int MenuItemId { get; set; }
    public MenuItem MenuItem { get; set; } = null!;
    public int OptionGroupId { get; set; }
    public OptionGroup OptionGroup { get; set; } = null!;

    /// <summary>Label the customer sees, e.g. "Choose 2 sauces".</summary>
    public required string Title { get; set; }
    public int MinSelect { get; set; }
    public int MaxSelect { get; set; } = 1;

    /// <summary>How many selections are included in the item price (the most expensive ones are free).</summary>
    public int FreeSelections { get; set; }

    public int SortOrder { get; set; }

    /// <summary>Only shown/required when this option is selected on the same item (e.g. meal drink needs "Make it a meal").</summary>
    public int? DependsOnOptionId { get; set; }
    public Option? DependsOnOption { get; set; }
}
