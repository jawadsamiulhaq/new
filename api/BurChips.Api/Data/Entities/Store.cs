namespace BurChips.Api.Data.Entities;

public class StoreSettings
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;

    public required string StoreName { get; set; }
    public required string Phone { get; set; }
    public string? WhatsAppNumber { get; set; }
    public required string Address { get; set; }

    /// <summary>Manual "pause online orders" switch for rush hours.</summary>
    public bool IsPaused { get; set; }
    public string? PauseMessage { get; set; }

    public bool DeliveryEnabled { get; set; } = true;
    public bool PickupEnabled { get; set; } = true;
    public bool CodEnabled { get; set; } = true;
    public bool PayFastEnabled { get; set; }

    /// <summary>Delivery is free when the subtotal (after discount) reaches this. Null = never free.</summary>
    public decimal? FreeDeliveryThreshold { get; set; }

    /// <summary>Tax rate in percent. Menu prices already include it when <see cref="PricesIncludeTax"/> is true.</summary>
    public decimal TaxPercent { get; set; }
    public bool PricesIncludeTax { get; set; } = true;

    public int EstimatedDeliveryMinutes { get; set; } = 45;
    public int EstimatedPickupMinutes { get; set; } = 20;

    /// <summary>IANA time zone used for opening hours.</summary>
    public string TimeZone { get; set; } = "Asia/Karachi";
}

/// <summary>
/// Opening hours for one weekday. When <see cref="ClosesAt"/> is earlier than or equal to
/// <see cref="OpensAt"/>, the shop closes after midnight (e.g. 12:00 → 02:00).
/// </summary>
public class OpeningHours
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly OpensAt { get; set; }
    public TimeOnly ClosesAt { get; set; }
    public bool IsClosed { get; set; }
}

public class DeliveryArea
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;
    public required string Name { get; set; }
    public decimal Fee { get; set; }
    public decimal MinOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public enum DiscountType
{
    Percent = 0,
    Flat = 1,
}

public class PromoCode
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;

    /// <summary>Stored upper-case, e.g. "FIRST10".</summary>
    public required string Code { get; set; }
    public string? Description { get; set; }
    public DiscountType DiscountType { get; set; }
    public decimal Value { get; set; }

    /// <summary>Cap for percent discounts.</summary>
    public decimal? MaxDiscount { get; set; }
    public decimal MinOrder { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public int? MaxUses { get; set; }
    public int? MaxUsesPerCustomer { get; set; } = 1;
    public bool FirstOrderOnly { get; set; }
    public bool IsActive { get; set; } = true;
    public int UsedCount { get; set; }

    public byte[] RowVersion { get; set; } = [];
}

public class PromoRedemption
{
    public int Id { get; set; }
    public int PromoCodeId { get; set; }
    public PromoCode PromoCode { get; set; } = null!;
    public int CustomerId { get; set; }
    public int OrderId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
