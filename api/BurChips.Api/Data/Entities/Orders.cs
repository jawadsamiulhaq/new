namespace BurChips.Api.Data.Entities;

public enum OrderType
{
    Delivery = 0,
    Pickup = 1,
}

public enum OrderStatus
{
    PendingPayment = 0,
    Placed = 1,
    Accepted = 2,
    Preparing = 3,
    OutForDelivery = 4,
    ReadyForPickup = 5,
    Completed = 6,
    Rejected = 7,
    Cancelled = 8,
}

public enum PaymentMethod
{
    Cod = 0,
    PayFast = 1,
}

public enum PaymentStatus
{
    Unpaid = 0,
    Pending = 1,
    Paid = 2,
    Failed = 3,
    Refunded = 4,
}

public class Order
{
    public int Id { get; set; }
    public int BranchId { get; set; } = 1;

    /// <summary>Short human number shown to staff and customers, e.g. 1001.</summary>
    public int OrderNumber { get; set; }

    /// <summary>Unguessable id used in the customer tracking URL.</summary>
    public Guid PublicId { get; set; }

    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public required string CustomerName { get; set; }
    public required string CustomerPhone { get; set; }

    public OrderType Type { get; set; }
    public OrderStatus Status { get; set; }

    public int? DeliveryAreaId { get; set; }
    public string? DeliveryAreaName { get; set; }
    public string? AddressLine { get; set; }
    public string? Landmark { get; set; }
    public string? Notes { get; set; }

    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal Tax { get; set; }
    public decimal Total { get; set; }

    public int? PromoCodeId { get; set; }
    public string? PromoCodeText { get; set; }

    public PaymentMethod PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; }

    public string? RejectReason { get; set; }

    /// <summary>Sent by the browser with each checkout attempt so a double-tap or retry can't create two orders.</summary>
    public Guid? ClientRequestId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PlacedAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public List<OrderItem> Items { get; set; } = [];
    public List<OrderEvent> Events { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
}

/// <summary>A snapshot of what was ordered, so later menu changes never alter past orders.</summary>
public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public int? MenuItemId { get; set; }

    public required string Name { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal OptionsPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
    public string? Notes { get; set; }

    public List<OrderItemOption> Options { get; set; } = [];
}

public class OrderItemOption
{
    public int Id { get; set; }
    public int OrderItemId { get; set; }
    public OrderItem OrderItem { get; set; } = null!;

    /// <summary>Menu ids at order time (kept for "reorder"; may no longer exist).</summary>
    public int? OptionId { get; set; }
    public int? OptionGroupLinkId { get; set; }

    public required string GroupTitle { get; set; }
    public required string Name { get; set; }

    /// <summary>Price actually charged for this choice (0 when it was a free selection).</summary>
    public decimal Price { get; set; }
}

public class OrderEvent
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public OrderStatus Status { get; set; }
    public string? Note { get; set; }
    public string? ByUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public PaymentMethod Gateway { get; set; }
    public decimal Amount { get; set; }
    public PaymentStatus Status { get; set; }

    /// <summary>Gateway transaction id; unique per gateway so callbacks are processed once.</summary>
    public string? ProviderReference { get; set; }
    public string? RawPayload { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
