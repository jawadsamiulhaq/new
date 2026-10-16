using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Notifications;
using BurChips.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace BurChips.Api.Features.Orders;

/// <summary>Tells the customer's tracking page, the staff Live Orders screen and the owner's phone about order changes.</summary>
public interface IOrderNotifier
{
    Task OrderPlacedAsync(Order order, CancellationToken ct = default);
    Task OrderStatusChangedAsync(Order order, CancellationToken ct = default);
}

public class SignalROrderNotifier(
    IHubContext<OrderTrackingHub> tracking,
    IHubContext<StaffHub> staff,
    OwnerAlertQueue ownerAlerts,
    ILogger<SignalROrderNotifier> logger) : IOrderNotifier
{
    /// <remarks>Called for orders that are ready for the kitchen (cash orders at once, online orders once paid).</remarks>
    public async Task OrderPlacedAsync(Order order, CancellationToken ct = default)
    {
        logger.LogInformation("Order #{OrderNumber} placed ({Total} via {Method})", order.OrderNumber, order.Total, order.PaymentMethod);

        if (order.Status == OrderStatus.Placed)
        {
            ownerAlerts.Enqueue(new OwnerOrderAlert(
                order.OrderNumber,
                order.Total,
                order.Type == OrderType.Delivery ? $"Delivery to {order.DeliveryAreaName}" : "Pick-up",
                order.CustomerName,
                string.Join(", ", order.Items.Select(i => i.Quantity > 1 ? $"{i.Quantity}x {i.Name}" : i.Name))));

            await staff.Clients.Group(StaffHub.Group).SendAsync(StaffHub.OrderPlaced, order.Id, order.OrderNumber, ct);
        }
        await PushToCustomerAsync(order, ct);
    }

    public async Task OrderStatusChangedAsync(Order order, CancellationToken ct = default)
    {
        logger.LogInformation("Order #{OrderNumber} is now {Status}", order.OrderNumber, order.Status);
        await staff.Clients.Group(StaffHub.Group).SendAsync(StaffHub.OrderUpdated, order.Id, order.Status.ToString(), ct);
        await PushToCustomerAsync(order, ct);
    }

    private Task PushToCustomerAsync(Order order, CancellationToken ct) =>
        tracking.Clients.Group(OrderTrackingHub.GroupFor(order.PublicId))
            .SendAsync(OrderTrackingHub.OrderUpdated, order.PublicId, order.Status.ToString(), ct);
}
