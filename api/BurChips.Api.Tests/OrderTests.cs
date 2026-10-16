using System.Net;
using System.Net.Http.Json;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Checkout;
using BurChips.Api.Features.Customers;
using BurChips.Api.Features.Orders;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Tests;

[Collection(ApiCollection.Name)]
public class OrderTests(ApiFactory factory)
{
    private async Task<object> PickupOrderAsync(Guid? requestId = null, string? promo = null, int quantity = 1) => new
    {
        clientRequestId = requestId ?? Guid.NewGuid(),
        type = OrderType.Pickup,
        customerName = "Ayesha Khan",
        paymentMethod = PaymentMethod.Cod,
        promoCode = promo,
        lines = new[] { await factory.ZingerMealAsync(quantity) },
    };

    private static async Task<OrderDto> PlaceOkAsync(HttpClient client, object request)
    {
        var response = await client.PostAsJsonAsync("/api/orders", request, TestJson.Options);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OrderDto>(TestJson.Options))!;
    }

    private static async Task<OrderProblemsResponse> PlaceFailsAsync(HttpClient client, object request)
    {
        var response = await client.PostAsJsonAsync("/api/orders", request, TestJson.Options);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OrderProblemsResponse>(TestJson.Options))!;
    }

    [Fact]
    public async Task Cash_pickup_order_is_placed_with_server_prices()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);

        var order = await PlaceOkAsync(client, await PickupOrderAsync());

        Assert.Equal(OrderStatus.Placed, order.Status);
        Assert.True(order.OrderNumber >= 1001);
        Assert.Equal(860m, order.Total);
        Assert.Equal(PaymentStatus.Unpaid, order.PaymentStatus);
        Assert.Equal("Ayesha Khan", order.CustomerName);
        Assert.Equal(["Make it a meal (fries + drink)", "Pepsi", "Cheese Slice"], order.Items.Single().Options.Select(o => o.Name));
        Assert.Single(order.Events);
        Assert.NotNull(order.EstimatedReadyAt);
    }

    [Fact]
    public async Task Prices_sent_by_the_browser_are_ignored()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var line = await factory.ZingerMealAsync();

        var order = await PlaceOkAsync(client, new
        {
            clientRequestId = Guid.NewGuid(),
            type = OrderType.Pickup,
            customerName = "Tamper Test",
            paymentMethod = PaymentMethod.Cod,
            total = 1,
            lines = new[] { new { line.MenuItemId, line.Quantity, line.OptionIds, unitPrice = 1, lineTotal = 1 } },
        });

        Assert.Equal(860m, order.Total);
    }

    [Fact]
    public async Task Delivery_order_saves_the_address_for_next_time()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var area = await factory.AreaIdAsync("DHA Phase 8");

        var order = await PlaceOkAsync(client, new
        {
            clientRequestId = Guid.NewGuid(),
            type = OrderType.Delivery,
            deliveryAreaId = area,
            addressLine = "House 12, Street 4, Sector A",
            landmark = "Near the park",
            saveAddress = true,
            customerName = "Bilal",
            paymentMethod = PaymentMethod.Cod,
            lines = new[] { await factory.ZingerMealAsync() },
        });

        Assert.Equal(100m, order.DeliveryFee);
        Assert.Equal(960m, order.Total);
        Assert.Equal("DHA Phase 8", order.DeliveryAreaName);

        var me = await client.GetFromJsonAsync<MeResponse>("/api/me", TestJson.Options);
        Assert.Equal("Bilal", me!.Customer!.Name);
        var address = Assert.Single(me.Customer.Addresses);
        Assert.Equal("House 12, Street 4, Sector A", address.AddressLine);
    }

    [Fact]
    public async Task Delivery_without_address_is_rejected()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var problems = await PlaceFailsAsync(client, new
        {
            clientRequestId = Guid.NewGuid(),
            type = OrderType.Delivery,
            deliveryAreaId = await factory.AreaIdAsync("DHA Phase 8"),
            customerName = "Bilal",
            paymentMethod = PaymentMethod.Cod,
            lines = new[] { await factory.ZingerMealAsync() },
        });
        Assert.Equal("address", problems.Problems.Single().Code);
    }

    [Fact]
    public async Task Double_submit_returns_the_same_order()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var request = await PickupOrderAsync(Guid.NewGuid());

        var first = await PlaceOkAsync(client, request);
        var second = await PlaceOkAsync(client, request);

        Assert.Equal(first.PublicId, second.PublicId);
        var orders = await client.GetFromJsonAsync<List<OrderSummaryDto>>("/api/orders", TestJson.Options);
        Assert.Single(orders!);
    }

    [Fact]
    public async Task Cannot_order_while_closed_or_paused()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);

        var start = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(ApiFactory.Start.AddHours(15)); // 4 AM Friday in Lahore
        try
        {
            Assert.Equal("closed", (await PlaceFailsAsync(client, await PickupOrderAsync())).Problems.Single().Code);
        }
        finally
        {
            factory.Clock.SetUtcNow(start);
        }

        await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsPaused, true)));
        try
        {
            Assert.Equal("paused", (await PlaceFailsAsync(client, await PickupOrderAsync())).Problems.Single().Code);
        }
        finally
        {
            await factory.WithDbAsync(db => db.StoreSettings.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsPaused, false)));
        }
    }

    [Fact]
    public async Task Online_payment_is_refused_until_enabled()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var request = new
        {
            clientRequestId = Guid.NewGuid(),
            type = OrderType.Pickup,
            customerName = "Sara",
            paymentMethod = PaymentMethod.PayFast,
            lines = new[] { await factory.ZingerMealAsync() },
        };
        Assert.Equal("payment_unavailable", (await PlaceFailsAsync(client, request)).Problems.Single().Code);
    }

    [Fact]
    public async Task First_order_promo_works_once_per_customer()
    {
        var code = await factory.CreatePromoAsync(p => { p.DiscountType = DiscountType.Percent; p.Value = 10; p.FirstOrderOnly = true; });
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);

        var first = await PlaceOkAsync(client, await PickupOrderAsync(promo: code));
        Assert.Equal(86m, first.Discount);
        Assert.Equal(774m, first.Total);

        var again = await PlaceFailsAsync(client, await PickupOrderAsync(promo: code));
        Assert.Equal("promo_invalid", again.Problems.Single().Code);
    }

    [Fact]
    public async Task Limited_promo_cannot_be_used_more_than_allowed()
    {
        var code = await factory.CreatePromoAsync(p => { p.DiscountType = DiscountType.Flat; p.Value = 50; p.MaxUses = 1; });

        var a = factory.CreateHttpsClient();
        await factory.SignInAsync(a);
        await PlaceOkAsync(a, await PickupOrderAsync(promo: code));

        var b = factory.CreateHttpsClient();
        await factory.SignInAsync(b);
        Assert.Equal("promo_invalid", (await PlaceFailsAsync(b, await PickupOrderAsync(promo: code))).Problems.Single().Code);

        await factory.WithDbAsync(async db => Assert.Equal(1, await db.PromoCodes.Where(p => p.Code == code).Select(p => p.UsedCount).SingleAsync()));
    }

    [Fact]
    public async Task Customers_only_see_their_own_orders()
    {
        var owner = factory.CreateHttpsClient();
        await factory.SignInAsync(owner);
        var order = await PlaceOkAsync(owner, await PickupOrderAsync());

        var stranger = factory.CreateHttpsClient();
        await factory.SignInAsync(stranger);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/orders/{order.PublicId}")).StatusCode);
        Assert.Empty((await stranger.GetFromJsonAsync<List<OrderSummaryDto>>("/api/orders", TestJson.Options))!);

        var mine = await owner.GetFromJsonAsync<OrderDto>($"/api/orders/{order.PublicId}", TestJson.Options);
        Assert.Equal(order.OrderNumber, mine!.OrderNumber);
    }

    [Fact]
    public async Task Status_flow_follows_the_rules()
    {
        var client = factory.CreateHttpsClient();
        await factory.SignInAsync(client);
        var placed = await PlaceOkAsync(client, await PickupOrderAsync());

        await factory.WithDbAsync(async db =>
        {
            var order = await db.Orders.SingleAsync(o => o.PublicId == placed.PublicId);
            Assert.False(OrderService.CanTransition(order, OrderStatus.Completed));
            Assert.False(OrderService.CanTransition(order, OrderStatus.OutForDelivery)); // it's a pickup order
            Assert.True(OrderService.CanTransition(order, OrderStatus.Accepted));
            Assert.True(OrderService.CanTransition(order, OrderStatus.Rejected));
        });
    }
}
