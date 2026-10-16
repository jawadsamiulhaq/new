using BurChips.Api.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BurChips.Api.Hubs;

/// <summary>Live order feed for the counter's Live Orders screen (owner and staff).</summary>
[Authorize(Policy = Roles.Staff)]
public class StaffHub : Hub
{
    public const string Path = "/hubs/staff";
    public const string Group = "staff";

    /// <summary>Client event: a new order needs accepting; payload is (orderId, orderNumber).</summary>
    public const string OrderPlaced = "orderPlaced";

    /// <summary>Client event: an order changed; payload is (orderId, status).</summary>
    public const string OrderUpdated = "orderUpdated";

    /// <summary>Client event: menu availability or store pause changed — refresh.</summary>
    public const string StoreChanged = "storeChanged";

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, Group);
        await base.OnConnectedAsync();
    }
}
