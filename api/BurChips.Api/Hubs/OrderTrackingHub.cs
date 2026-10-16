using BurChips.Api.Data;
using BurChips.Api.Features.Customers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Hubs;

/// <summary>
/// Pushes live status changes to a customer's order page.
/// A customer can only subscribe to their own orders.
/// </summary>
[Authorize(Policy = CustomerAuth.Policy)]
public class OrderTrackingHub(AppDbContext db) : Hub
{
    public const string Path = "/hubs/orders";

    /// <summary>Client event: an order changed; payload is (publicId, status).</summary>
    public const string OrderUpdated = "orderUpdated";

    public static string GroupFor(Guid publicId) => $"order:{publicId}";

    public async Task<bool> Track(Guid publicId)
    {
        var customerId = Context.User?.GetCustomerId();
        if (customerId is null) return false;

        var owns = await db.Orders.AnyAsync(o => o.PublicId == publicId && o.CustomerId == customerId);
        if (!owns) return false;

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupFor(publicId));
        return true;
    }
}
