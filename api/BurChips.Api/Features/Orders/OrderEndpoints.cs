using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Checkout;
using BurChips.Api.Features.Customers;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BurChips.Api.Features.Orders;

public record QuoteRequest(OrderType Type, int? DeliveryAreaId, string? PromoCode, IReadOnlyList<CartLineRequest> Lines);

public record QuoteResponse(
    IReadOnlyList<PricedLine> Lines,
    decimal Subtotal,
    decimal Discount,
    decimal DeliveryFee,
    decimal Tax,
    decimal Total,
    string? PromoCode,
    string? PromoMessage,
    IReadOnlyList<PricingProblem> Problems);

public record OrderProblemsResponse(IReadOnlyList<PricingProblem> Problems);

public static class OrderEndpoints
{
    public const string CheckoutRateLimit = "checkout";

    public static IEndpointRouteBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/checkout/quote", Quote).AllowAnonymous().RequireRateLimiting(CheckoutRateLimit);

        var orders = app.MapGroup("/api/orders").RequireAuthorization(CustomerAuth.Policy);
        orders.MapPost("/", Place).RequireRateLimiting(CheckoutRateLimit);
        orders.MapGet("/", MyOrders);
        orders.MapGet("/{publicId:guid}", Get);
        return app;
    }

    /// <summary>Prices the cart for the checkout summary. Works before sign-in; customer-specific promo rules apply once signed in.</summary>
    private static async Task<QuoteResponse> Quote(QuoteRequest request, HttpContext http, PricingService pricing, CancellationToken ct)
    {
        var customer = await http.AuthenticateAsync(CustomerAuth.Scheme);
        var priced = await pricing.PriceAsync(
            new PricingRequest(request.Type, request.DeliveryAreaId, request.PromoCode, request.Lines ?? [], customer.Principal?.GetCustomerId()), ct);

        return new QuoteResponse(
            priced.Lines, priced.Subtotal, priced.Discount, priced.DeliveryFee, priced.Tax, priced.Total,
            priced.PromoCode, priced.PromoMessage, priced.Problems);
    }

    private static async Task<IResult> Place(
        PlaceOrderRequest request, ClaimsPrincipal user, OrderService orders, AppDbContext db, CancellationToken ct)
    {
        var customerId = user.GetCustomerId()!.Value;
        var result = await orders.PlaceAsync(customerId, request with { Lines = request.Lines ?? [] }, ct);
        if (result.Order is null) return Results.UnprocessableEntity(new OrderProblemsResponse(result.Problems));

        var dto = await LoadAsync(db, result.Order.PublicId, customerId, ct);
        return Results.Created($"/api/orders/{dto!.PublicId}", dto);
    }

    private static async Task<IResult> Get(Guid publicId, ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        // Another customer's order looks the same as a missing one.
        var dto = await LoadAsync(db, publicId, user.GetCustomerId()!.Value, ct);
        return dto is null ? Results.NotFound() : Results.Ok(dto);
    }

    private static async Task<IReadOnlyList<OrderSummaryDto>> MyOrders(ClaimsPrincipal user, AppDbContext db, CancellationToken ct)
    {
        var customerId = user.GetCustomerId()!.Value;
        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.CustomerId == customerId && o.Status != OrderStatus.PendingPayment)
            .OrderByDescending(o => o.CreatedAt)
            .Take(50)
            .Select(o => new
            {
                o.PublicId, o.OrderNumber, o.Status, o.Type, o.Total, o.CreatedAt,
                Items = o.Items.OrderBy(i => i.Id).Select(i => new { i.Name, i.Quantity }).ToList(),
            })
            .ToListAsync(ct);

        return [.. orders.Select(o => new OrderSummaryDto(
            o.PublicId, o.OrderNumber, o.Status, o.Type, o.Total,
            o.Items.Sum(i => i.Quantity),
            string.Join(", ", o.Items.Select(i => i.Quantity > 1 ? $"{i.Quantity}× {i.Name}" : i.Name)),
            o.CreatedAt))];
    }

    private static async Task<OrderDto?> LoadAsync(AppDbContext db, Guid publicId, int customerId, CancellationToken ct)
    {
        var order = await db.Orders.AsNoTracking()
            .Include(o => o.Items).ThenInclude(i => i.Options)
            .Include(o => o.Events)
            .AsSplitQuery()
            .FirstOrDefaultAsync(o => o.PublicId == publicId && o.CustomerId == customerId, ct);
        if (order is null) return null;

        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        var minutes = order.Type == OrderType.Delivery ? settings.EstimatedDeliveryMinutes : settings.EstimatedPickupMinutes;
        return OrderDto.From(order, minutes);
    }
}
