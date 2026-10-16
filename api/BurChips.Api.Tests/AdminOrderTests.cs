using System.Net;
using System.Net.Http.Json;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Admin;
using BurChips.Api.Features.Orders;
using BurChips.Api.Hubs;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;

namespace BurChips.Api.Tests;

[Collection(ApiCollection.Name)]
public class AdminOrderTests(ApiFactory factory)
{
    private async Task<OrderDto> CustomerOrderAsync(OrderType type = OrderType.Pickup)
    {
        var customer = factory.CreateHttpsClient();
        await factory.SignInAsync(customer);
        var response = await customer.PostAsJsonAsync("/api/orders", new
        {
            clientRequestId = Guid.NewGuid(),
            type,
            deliveryAreaId = type == OrderType.Delivery ? await factory.AreaIdAsync("DHA Phase 8") : (int?)null,
            addressLine = type == OrderType.Delivery ? "House 1, Street 1" : null,
            customerName = "Live Board Test",
            paymentMethod = PaymentMethod.Cod,
            lines = new[] { await factory.ZingerMealAsync() },
        }, TestJson.Options);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<OrderDto>(TestJson.Options))!;
    }

    private static async Task<AdminOrderDto> FindLiveAsync(HttpClient staff, Guid publicId)
    {
        var live = await staff.GetFromJsonAsync<List<AdminOrderDto>>("/api/admin/orders/live", TestJson.Options);
        return live!.Single(o => o.Order.PublicId == publicId);
    }

    private static Task<HttpResponseMessage> SetStatusAsync(HttpClient staff, int id, OrderStatus status, string? note = null) =>
        staff.PostAsJsonAsync($"/api/admin/orders/{id}/status", new { status, note }, TestJson.Options);

    [Fact]
    public async Task New_order_rings_the_staff_screen_and_alerts_the_owner()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();

        // Connect to the staff hub with a staff session cookie.
        var login = factory.CreateDefaultClient(new Uri("https://localhost"));
        var owner = await login.PostAsJsonAsync("/api/admin/auth/login", new { email = ApiFactory.OwnerEmail, password = ApiFactory.OwnerPassword });
        var cookie = string.Join("; ", owner.Headers.GetValues("Set-Cookie").Select(c => c.Split(';')[0]));

        await using var hub = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, StaffHub.Path), o =>
            {
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                o.Headers["Cookie"] = cookie;
            })
            .Build();
        var rang = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        hub.On<int, int>(StaffHub.OrderPlaced, (_, number) => rang.TrySetResult(number));
        await hub.StartAsync();

        var order = await CustomerOrderAsync(OrderType.Delivery);

        Assert.Equal(order.OrderNumber, await rang.Task.WaitAsync(TimeSpan.FromSeconds(15)));

        // Owner WhatsApp alert is sent in the background.
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!factory.Alerts.Sent.Any(a => a.OrderNumber == order.OrderNumber) && DateTime.UtcNow < deadline) await Task.Delay(50);
        var alert = factory.Alerts.Sent.Single(a => a.OrderNumber == order.OrderNumber);
        Assert.Equal(960m, alert.Total);
        Assert.Equal("Delivery to DHA Phase 8", alert.Fulfilment);
        Assert.Contains("Crispy Zinger", alert.Items);

        var live = await FindLiveAsync(staff, order.PublicId);
        Assert.Equal([OrderStatus.Accepted, OrderStatus.Rejected], live.NextStatuses);
    }

    [Fact]
    public async Task Staff_move_an_order_through_to_completion_and_the_customer_sees_it()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        var order = await CustomerOrderAsync();
        var id = (await FindLiveAsync(staff, order.PublicId)).Id;

        foreach (var step in new[] { OrderStatus.Accepted, OrderStatus.Preparing, OrderStatus.ReadyForPickup, OrderStatus.Completed })
            Assert.Equal(HttpStatusCode.OK, (await SetStatusAsync(staff, id, step)).StatusCode);

        var detail = await staff.GetFromJsonAsync<AdminOrderDto>($"/api/admin/orders/{id}", TestJson.Options);
        Assert.Equal(OrderStatus.Completed, detail!.Order.Status);
        Assert.Empty(detail.NextStatuses);
        Assert.Equal(5, detail.Order.Events.Count);
    }

    [Fact]
    public async Task Rejecting_needs_a_reason_and_skipping_steps_is_refused()
    {
        var (staff, _, _) = await factory.CreateStaffAsync();
        var order = await CustomerOrderAsync();
        var id = (await FindLiveAsync(staff, order.PublicId)).Id;

        Assert.Equal(HttpStatusCode.Conflict, (await SetStatusAsync(staff, id, OrderStatus.Completed)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await SetStatusAsync(staff, id, OrderStatus.Rejected)).StatusCode);

        var rejected = await SetStatusAsync(staff, id, OrderStatus.Rejected, "Out of chicken, sorry!");
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        var dto = await rejected.Content.ReadFromJsonAsync<AdminOrderDto>(TestJson.Options);
        Assert.Equal("Out of chicken, sorry!", dto!.Order.RejectReason);
    }

    [Fact]
    public async Task History_search_finds_orders_by_number_and_phone()
    {
        var owner = await factory.StaffClientAsync();
        var order = await CustomerOrderAsync();

        var byNumber = await owner.GetFromJsonAsync<OrderPage>($"/api/admin/orders?q=%23{order.OrderNumber}", TestJson.Options);
        Assert.Contains(byNumber!.Items, o => o.PublicId == order.PublicId);

        var byPhone = await owner.GetFromJsonAsync<OrderPage>($"/api/admin/orders?q={Uri.EscapeDataString(order.CustomerPhone)}", TestJson.Options);
        Assert.Contains(byPhone!.Items, o => o.PublicId == order.PublicId);

        var byStatus = await owner.GetFromJsonAsync<OrderPage>("/api/admin/orders?status=Placed&pageSize=100", TestJson.Options);
        Assert.All(byStatus!.Items, o => Assert.Equal(OrderStatus.Placed, o.Status));
    }

    [Fact]
    public async Task Sales_report_counts_only_orders_that_went_through()
    {
        var owner = await factory.StaffClientAsync();
        var day = ApiFactory.StartDate.ToString("yyyy-MM-dd");
        var url = $"/api/admin/reports/sales?from={day}&to={day}";
        var before = await owner.GetFromJsonAsync<SalesReport>(url, TestJson.Options);

        await CustomerOrderAsync();
        var rejected = await CustomerOrderAsync();
        var id = (await FindLiveAsync(owner, rejected.PublicId)).Id;
        (await SetStatusAsync(owner, id, OrderStatus.Rejected, "Closing early")).EnsureSuccessStatusCode();

        var after = await owner.GetFromJsonAsync<SalesReport>(url, TestJson.Options);
        Assert.Equal(before!.Orders + 1, after!.Orders);
        Assert.Equal(before.Revenue + 860m, after.Revenue);
        Assert.Equal(before.Rejected + 1, after.Rejected);
        Assert.Equal(after.Revenue, after.ByDay.Single().Revenue);
        Assert.Contains(after.TopItems, t => t.Name == "Crispy Zinger");
    }
}
