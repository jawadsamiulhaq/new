using System.Net.Http.Json;
using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Customers;
using BurChips.Api.Features.Orders;
using BurChips.Api.Hubs;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BurChips.Api.Tests;

[Collection(ApiCollection.Name)]
public class OrderTrackingHubTests(ApiFactory factory)
{
    /// <summary>A signed-in client plus its raw cookie header (needed for the hub connection).</summary>
    private async Task<(HttpClient Client, string Cookie)> SignInAsync()
    {
        var client = factory.CreateDefaultClient(new Uri("https://localhost"));
        var phone = ApiFactory.RandomPhone();
        var send = await client.PostAsJsonAsync("/api/auth/code", new { phone });
        var code = (await send.Content.ReadFromJsonAsync<SendCodeResponse>())!.DevCode;
        var verify = await client.PostAsJsonAsync("/api/auth/verify", new { phone, code });
        verify.EnsureSuccessStatusCode();

        var cookie = string.Join("; ", verify.Headers.GetValues("Set-Cookie").Select(c => c.Split(';')[0]));
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return (client, cookie);
    }

    private HubConnection Hub(string? cookie) => new HubConnectionBuilder()
        .WithUrl(new Uri(factory.Server.BaseAddress, OrderTrackingHub.Path), o =>
        {
            o.Transports = HttpTransportType.LongPolling;
            o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            if (cookie is not null) o.Headers["Cookie"] = cookie;
        })
        .Build();

    private async Task<OrderDto> PlaceAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/orders", new
        {
            clientRequestId = Guid.NewGuid(),
            type = OrderType.Pickup,
            customerName = "Hamza",
            paymentMethod = PaymentMethod.Cod,
            lines = new[] { await factory.ZingerMealAsync() },
        }, TestJson.Options);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderDto>(TestJson.Options))!;
    }

    [Fact]
    public async Task Customer_receives_live_status_updates_for_their_order()
    {
        var (client, cookie) = await SignInAsync();
        var order = await PlaceAsync(client);

        await using var hub = Hub(cookie);
        var received = new TaskCompletionSource<(Guid, string)>(TaskCreationOptions.RunContinuationsAsynchronously);
        hub.On<Guid, string>(OrderTrackingHub.OrderUpdated, (id, status) => received.TrySetResult((id, status)));
        await hub.StartAsync();
        Assert.True(await hub.InvokeAsync<bool>("Track", order.PublicId));

        // Staff accept the order (the admin screen will call this in Phase 3).
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var orders = scope.ServiceProvider.GetRequiredService<OrderService>();
            var entity = await db.Orders.SingleAsync(o => o.PublicId == order.PublicId);
            Assert.True(await orders.ChangeStatusAsync(entity, OrderStatus.Accepted, null, null, default));
        }

        var (publicId, status) = await received.Task.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.Equal(order.PublicId, publicId);
        Assert.Equal("Accepted", status);

        var refreshed = await client.GetFromJsonAsync<OrderDto>($"/api/orders/{order.PublicId}", TestJson.Options);
        Assert.Equal(OrderStatus.Accepted, refreshed!.Status);
        Assert.Equal([OrderStatus.Placed, OrderStatus.Accepted], refreshed.Events.Select(e => e.Status));
    }

    [Fact]
    public async Task Customer_cannot_track_someone_elses_order()
    {
        var (owner, _) = await SignInAsync();
        var order = await PlaceAsync(owner);

        var (_, strangerCookie) = await SignInAsync();
        await using var hub = Hub(strangerCookie);
        await hub.StartAsync();

        Assert.False(await hub.InvokeAsync<bool>("Track", order.PublicId));
    }

    [Fact]
    public async Task Anonymous_visitors_cannot_connect()
    {
        await using var hub = Hub(cookie: null);
        await Assert.ThrowsAnyAsync<Exception>(() => hub.StartAsync());
    }
}
