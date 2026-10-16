using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Customers;

namespace BurChips.Api.Features.Orders;

public record OrderItemOptionDto(int? OptionId, string GroupTitle, string Name, decimal Price);

public record OrderItemDto(
    int? MenuItemId,
    string Name,
    decimal UnitPrice,
    int Quantity,
    decimal LineTotal,
    string? Note,
    IReadOnlyList<OrderItemOptionDto> Options);

public record OrderEventDto(OrderStatus Status, DateTimeOffset At, string? Note);

public record OrderDto(
    Guid PublicId,
    int OrderNumber,
    OrderStatus Status,
    OrderType Type,
    string CustomerName,
    string CustomerPhone,
    string? DeliveryAreaName,
    string? AddressLine,
    string? Landmark,
    string? Notes,
    decimal Subtotal,
    decimal Discount,
    decimal DeliveryFee,
    decimal Tax,
    decimal Total,
    string? PromoCode,
    PaymentMethod PaymentMethod,
    PaymentStatus PaymentStatus,
    string? RejectReason,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PlacedAt,
    DateTimeOffset? EstimatedReadyAt,
    IReadOnlyList<OrderItemDto> Items,
    IReadOnlyList<OrderEventDto> Events)
{
    /// <summary>Builds the DTO from an order loaded with Items.Options and Events.</summary>
    public static OrderDto From(Order o, int estimatedMinutes) => new(
        o.PublicId,
        o.OrderNumber,
        o.Status,
        o.Type,
        o.CustomerName,
        PhoneNumber.ToLocal(o.CustomerPhone),
        o.DeliveryAreaName,
        o.AddressLine,
        o.Landmark,
        o.Notes,
        o.Subtotal,
        o.Discount,
        o.DeliveryFee,
        o.Tax,
        o.Total,
        o.PromoCodeText,
        o.PaymentMethod,
        o.PaymentStatus,
        o.RejectReason,
        o.CreatedAt,
        o.PlacedAt,
        o.PlacedAt?.AddMinutes(estimatedMinutes),
        [.. o.Items.OrderBy(i => i.Id).Select(i => new OrderItemDto(
            i.MenuItemId, i.Name, i.UnitPrice + i.OptionsPrice, i.Quantity, i.LineTotal, i.Notes,
            [.. i.Options.OrderBy(x => x.Id).Select(x => new OrderItemOptionDto(x.OptionId, x.GroupTitle, x.Name, x.Price))]))],
        [.. o.Events.OrderBy(e => e.CreatedAt).ThenBy(e => e.Id).Select(e => new OrderEventDto(e.Status, e.CreatedAt, e.Note))]);
}

public record OrderSummaryDto(
    Guid PublicId,
    int OrderNumber,
    OrderStatus Status,
    OrderType Type,
    decimal Total,
    int ItemCount,
    string ItemsPreview,
    DateTimeOffset CreatedAt);
