using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Checkout;
using BurChips.Api.Features.Store;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Orders;

public record PlaceOrderRequest(
    Guid ClientRequestId,
    OrderType Type,
    int? DeliveryAreaId,
    string? AddressLine,
    string? Landmark,
    bool SaveAddress,
    string CustomerName,
    string? Notes,
    string? PromoCode,
    PaymentMethod PaymentMethod,
    IReadOnlyList<CartLineRequest> Lines);

/// <summary>Either the placed order, or the problems that stopped it.</summary>
public record PlaceOrderResult(Order? Order, IReadOnlyList<PricingProblem> Problems)
{
    public static PlaceOrderResult Fail(string code, string message) => new(null, [new PricingProblem(code, message)]);
}

public class OrderService(
    AppDbContext db,
    PricingService pricing,
    IOrderNotifier notifier,
    TimeProvider clock,
    ILogger<OrderService> logger)
{
    public const int MaxNameLength = 60;
    public const int MaxAddressLength = 300;
    public const int MaxLandmarkLength = 120;
    public const int MaxNotesLength = 300;

    public async Task<PlaceOrderResult> PlaceAsync(int customerId, PlaceOrderRequest request, CancellationToken ct)
    {
        // A retried submit returns the order it already created.
        var existing = await FindByClientRequestAsync(customerId, request.ClientRequestId, ct);
        if (existing is not null) return new PlaceOrderResult(existing, []);

        if (ValidateDetails(request) is { } detailsProblem) return detailsProblem;

        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        var now = clock.GetUtcNow();

        var hours = await db.OpeningHours.AsNoTracking().ToListAsync(ct);
        var status = StoreHoursService.Evaluate(now, hours, settings.TimeZone);
        if (!status.IsOpen) return PlaceOrderResult.Fail("closed", "Sorry, we're closed right now. Please order when we open.");
        if (settings.IsPaused)
            return PlaceOrderResult.Fail("paused", settings.PauseMessage ?? "Online orders are paused for a few minutes. Please try again shortly.");

        var paymentAllowed = request.PaymentMethod switch
        {
            PaymentMethod.Cod => settings.CodEnabled,
            PaymentMethod.PayFast => settings.PayFastEnabled,
            _ => false,
        };
        if (!paymentAllowed) return PlaceOrderResult.Fail("payment_unavailable", "That payment method isn't available right now.");

        var priced = await pricing.PriceAsync(
            new PricingRequest(request.Type, request.DeliveryAreaId, request.PromoCode, request.Lines, customerId), ct);
        if (!priced.CanOrder) return new PlaceOrderResult(null, priced.Problems);
        if (priced.PromoMessage is not null) return PlaceOrderResult.Fail("promo_invalid", priced.PromoMessage);

        var customer = await db.Customers.FirstAsync(c => c.Id == customerId, ct);
        var order = BuildOrder(customer, request, priced, now);

        try
        {
            var placed = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);

                if (priced.PromoCodeId is { } promoId)
                {
                    // Claim one use atomically so a limited code can't be over-used by simultaneous orders.
                    var claimed = await db.PromoCodes
                        .Where(p => p.Id == promoId && (p.MaxUses == null || p.UsedCount < p.MaxUses))
                        .ExecuteUpdateAsync(s => s.SetProperty(p => p.UsedCount, p => p.UsedCount + 1), ct);
                    if (claimed == 0) return false;
                }

                customer.Name = request.CustomerName.Trim();
                db.Orders.Add(order);
                await db.SaveChangesAsync(ct);

                if (priced.PromoCodeId is { } id)
                {
                    db.PromoRedemptions.Add(new PromoRedemption { PromoCodeId = id, CustomerId = customerId, OrderId = order.Id, CreatedAt = now });
                }
                if (request.SaveAddress && order.Type == OrderType.Delivery)
                {
                    await SaveAddressAsync(customerId, order, now, ct);
                }
                await db.SaveChangesAsync(ct);

                await transaction.CommitAsync(ct);
                return true;
            });

            if (!placed) return PlaceOrderResult.Fail("promo_invalid", "That promo code has just been fully used.");
        }
        catch (DbUpdateException)
        {
            // Two identical submits raced; if the other one won, return its order.
            db.ChangeTracker.Clear();
            var duplicate = await FindByClientRequestAsync(customerId, request.ClientRequestId, ct);
            if (duplicate is null) throw;
            return new PlaceOrderResult(duplicate, []);
        }

        logger.LogInformation("Order #{OrderNumber} placed by customer {CustomerId}", order.OrderNumber, customerId);
        await NotifySafelyAsync(() => notifier.OrderPlacedAsync(order, ct));
        return new PlaceOrderResult(order, []);
    }

    private static PlaceOrderResult? ValidateDetails(PlaceOrderRequest r)
    {
        var name = r.CustomerName?.Trim() ?? "";
        if (name.Length is < 2 or > MaxNameLength) return PlaceOrderResult.Fail("name", "Please enter your name.");

        if (r.Type == OrderType.Delivery)
        {
            var address = r.AddressLine?.Trim() ?? "";
            if (address.Length < 5) return PlaceOrderResult.Fail("address", "Please enter your full delivery address (house, street, block).");
            if (address.Length > MaxAddressLength) return PlaceOrderResult.Fail("address", "Your address is too long.");
            if (r.Landmark is { Length: > MaxLandmarkLength }) return PlaceOrderResult.Fail("landmark", "The landmark is too long.");
        }
        if (r.Notes is { Length: > MaxNotesLength }) return PlaceOrderResult.Fail("notes", "Your order note is too long.");
        if (r.ClientRequestId == Guid.Empty) return PlaceOrderResult.Fail("request", "Something went wrong — please refresh and try again.");
        return null;
    }

    private static Order BuildOrder(Customer customer, PlaceOrderRequest request, PricingResult priced, DateTimeOffset now)
    {
        var isCod = request.PaymentMethod == PaymentMethod.Cod;
        var status = isCod ? OrderStatus.Placed : OrderStatus.PendingPayment;
        var delivery = request.Type == OrderType.Delivery;

        return new Order
        {
            PublicId = Guid.NewGuid(),
            ClientRequestId = request.ClientRequestId,
            CustomerId = customer.Id,
            CustomerName = request.CustomerName.Trim(),
            CustomerPhone = customer.Phone,
            Type = request.Type,
            Status = status,
            DeliveryAreaId = delivery ? priced.Area!.Id : null,
            DeliveryAreaName = delivery ? priced.Area!.Name : null,
            AddressLine = delivery ? request.AddressLine!.Trim() : null,
            Landmark = delivery && !string.IsNullOrWhiteSpace(request.Landmark) ? request.Landmark.Trim() : null,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Subtotal = priced.Subtotal,
            Discount = priced.Discount,
            DeliveryFee = priced.DeliveryFee,
            Tax = priced.Tax,
            Total = priced.Total,
            PromoCodeId = priced.PromoCodeId,
            PromoCodeText = priced.PromoCode,
            PaymentMethod = request.PaymentMethod,
            PaymentStatus = isCod ? PaymentStatus.Unpaid : PaymentStatus.Pending,
            CreatedAt = now,
            PlacedAt = isCod ? now : null,
            Items = [.. priced.Lines.Select(l => new OrderItem
            {
                MenuItemId = l.MenuItemId,
                Name = l.Name,
                UnitPrice = l.BasePrice,
                OptionsPrice = l.OptionsPrice,
                Quantity = l.Quantity,
                LineTotal = l.LineTotal,
                Notes = l.Note,
                Options = [.. l.Options.Select(o => new OrderItemOption
                {
                    OptionId = o.OptionId,
                    OptionGroupLinkId = o.GroupId,
                    GroupTitle = o.GroupTitle,
                    Name = o.Name,
                    Price = o.Price,
                })],
            })],
            Events = [new OrderEvent { Status = status, CreatedAt = now }],
        };
    }

    private async Task SaveAddressAsync(int customerId, Order order, DateTimeOffset now, CancellationToken ct)
    {
        var duplicate = await db.CustomerAddresses.AnyAsync(a =>
            a.CustomerId == customerId && a.DeliveryAreaId == order.DeliveryAreaId && a.AddressLine == order.AddressLine, ct);
        if (duplicate) return;

        db.CustomerAddresses.Add(new CustomerAddress
        {
            CustomerId = customerId,
            DeliveryAreaId = order.DeliveryAreaId!.Value,
            AddressLine = order.AddressLine!,
            Landmark = order.Landmark,
            CreatedAt = now,
        });
    }

    private Task<Order?> FindByClientRequestAsync(int customerId, Guid clientRequestId, CancellationToken ct) =>
        db.Orders.FirstOrDefaultAsync(o => o.CustomerId == customerId && o.ClientRequestId == clientRequestId, ct);

    // ---- Status changes (used by the admin Live Orders screen in Phase 3, and by payments in Phase 4) ----

    private static readonly Dictionary<OrderStatus, OrderStatus[]> AllowedTransitions = new()
    {
        [OrderStatus.PendingPayment] = [OrderStatus.Placed, OrderStatus.Cancelled],
        [OrderStatus.Placed] = [OrderStatus.Accepted, OrderStatus.Rejected],
        [OrderStatus.Accepted] = [OrderStatus.Preparing, OrderStatus.OutForDelivery, OrderStatus.ReadyForPickup, OrderStatus.Cancelled],
        [OrderStatus.Preparing] = [OrderStatus.OutForDelivery, OrderStatus.ReadyForPickup, OrderStatus.Cancelled],
        [OrderStatus.OutForDelivery] = [OrderStatus.Completed],
        [OrderStatus.ReadyForPickup] = [OrderStatus.Completed],
    };

    public static bool CanTransition(Order order, OrderStatus to)
    {
        if (!AllowedTransitions.TryGetValue(order.Status, out var allowed) || !allowed.Contains(to)) return false;
        if (to == OrderStatus.OutForDelivery && order.Type != OrderType.Delivery) return false;
        if (to == OrderStatus.ReadyForPickup && order.Type != OrderType.Pickup) return false;
        return true;
    }

    /// <returns>False if the change isn't allowed from the order's current status.</returns>
    public async Task<bool> ChangeStatusAsync(Order order, OrderStatus to, string? byUserId, string? note, CancellationToken ct)
    {
        if (!CanTransition(order, to)) return false;

        var now = clock.GetUtcNow();
        order.Status = to;
        switch (to)
        {
            case OrderStatus.Placed: order.PlacedAt ??= now; break;
            case OrderStatus.Accepted: order.AcceptedAt = now; break;
            case OrderStatus.Completed: order.CompletedAt = now; break;
            case OrderStatus.Rejected: order.RejectReason = note; break;
        }
        db.OrderEvents.Add(new OrderEvent { OrderId = order.Id, Status = to, Note = note, ByUserId = byUserId, CreatedAt = now });
        await db.SaveChangesAsync(ct);

        await NotifySafelyAsync(() => to == OrderStatus.Placed
            ? notifier.OrderPlacedAsync(order, ct)
            : notifier.OrderStatusChangedAsync(order, ct));
        return true;
    }

    /// <summary>A failed notification must never undo or fail a saved order.</summary>
    private async Task NotifySafelyAsync(Func<Task> notify)
    {
        try
        {
            await notify();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Order notification failed");
        }
    }
}
