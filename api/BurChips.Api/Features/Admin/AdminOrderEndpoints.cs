using System.Security.Claims;
using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Orders;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Admin;

/// <summary>An order as staff see it: the customer view plus its id and the actions available now.</summary>
public record AdminOrderDto(int Id, OrderDto Order, IReadOnlyList<OrderStatus> NextStatuses);

public record AdminOrderRow(
    int Id,
    Guid PublicId,
    int OrderNumber,
    OrderStatus Status,
    OrderType Type,
    string CustomerName,
    string CustomerPhone,
    string? DeliveryAreaName,
    decimal Total,
    PaymentMethod PaymentMethod,
    DateTimeOffset CreatedAt);

public record OrderPage(IReadOnlyList<AdminOrderRow> Items, int Total, int Page, int PageSize);

public record ChangeStatusRequest(OrderStatus Status, string? Note);

public static class AdminOrderEndpoints
{
    /// <summary>Orders that still need the kitchen's attention.</summary>
    public static readonly OrderStatus[] ActiveStatuses =
        [OrderStatus.Placed, OrderStatus.Accepted, OrderStatus.Preparing, OrderStatus.OutForDelivery, OrderStatus.ReadyForPickup];

    public static RouteGroupBuilder MapAdminOrderEndpoints(this RouteGroupBuilder staff)
    {
        staff.MapGet("/orders/live", Live);
        staff.MapGet("/orders", Search);
        staff.MapGet("/orders/{id:int}", Get);
        staff.MapPost("/orders/{id:int}/status", ChangeStatus);
        return staff;
    }

    private static async Task<IReadOnlyList<AdminOrderDto>> Live(AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        // Active orders, plus anything finished in the last hour so staff can see what just happened.
        var recent = clock.GetUtcNow().AddHours(-1);
        var orders = await LoadQuery(db)
            .Where(o => ActiveStatuses.Contains(o.Status)
                || ((o.Status == OrderStatus.Completed || o.Status == OrderStatus.Rejected || o.Status == OrderStatus.Cancelled)
                    && o.CreatedAt >= recent))
            .OrderBy(o => o.CreatedAt)
            .ToListAsync(ct);

        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        return [.. orders.Select(o => ToDto(o, settings))];
    }

    private static async Task<OrderPage> Search(
        AppDbContext db,
        string? q,
        OrderStatus? status,
        DateOnly? from,
        DateOnly? to,
        int page = 1,
        int pageSize = 25,
        CancellationToken ct = default)
    {
        pageSize = Math.Clamp(pageSize, 1, 100);
        page = Math.Max(1, page);
        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);

        var query = db.Orders.AsNoTracking();
        if (status is { } s) query = query.Where(o => o.Status == s);
        if (from is { } f) query = query.Where(o => o.CreatedAt >= StartOfDay(f, tz));
        if (to is { } t) query = query.Where(o => o.CreatedAt < StartOfDay(t.AddDays(1), tz));

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().TrimStart('#');
            var digits = new string(term.Where(char.IsAsciiDigit).ToArray());
            query = int.TryParse(term, out var number) && term.Length <= 7
                ? query.Where(o => o.OrderNumber == number || o.CustomerPhone.Contains(digits))
                : digits.Length >= 4
                    ? query.Where(o => o.CustomerPhone.Contains(digits.TrimStart('0')))
                    : query.Where(o => o.CustomerName.Contains(term));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new AdminOrderRow(o.Id, o.PublicId, o.OrderNumber, o.Status, o.Type, o.CustomerName, o.CustomerPhone,
                o.DeliveryAreaName, o.Total, o.PaymentMethod, o.CreatedAt))
            .ToListAsync(ct);

        return new OrderPage([.. items.Select(i => i with { CustomerPhone = Customers.PhoneNumber.ToLocal(i.CustomerPhone) })], total, page, pageSize);
    }

    private static async Task<IResult> Get(int id, AppDbContext db, CancellationToken ct)
    {
        var order = await LoadQuery(db).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return Results.NotFound();
        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        return Results.Ok(ToDto(order, settings));
    }

    private static async Task<IResult> ChangeStatus(
        int id, ChangeStatusRequest request, ClaimsPrincipal user, AppDbContext db, OrderService orders, CancellationToken ct)
    {
        var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (order is null) return Results.NotFound();

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (request.Status is OrderStatus.Rejected or OrderStatus.Cancelled && note is null)
            return AdminResults.Problem(400, "Please give the customer a reason.");
        if (note is { Length: > 300 }) return AdminResults.Problem(400, "The note is too long.");

        try
        {
            var changed = await orders.ChangeStatusAsync(order, request.Status, user.FindFirstValue(ClaimTypes.NameIdentifier), note, ct);
            if (!changed)
                return AdminResults.Problem(409, $"Order #{order.OrderNumber} is already {order.Status} — refresh to see the latest.");
        }
        catch (DbUpdateConcurrencyException)
        {
            return AdminResults.Problem(409, $"Someone else just updated order #{order.OrderNumber}. Refresh to see the latest.");
        }

        var updated = await LoadQuery(db).FirstAsync(o => o.Id == id, ct);
        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        return Results.Ok(ToDto(updated, settings));
    }

    private static IQueryable<Order> LoadQuery(AppDbContext db) => db.Orders.AsNoTracking()
        .Include(o => o.Items).ThenInclude(i => i.Options)
        .Include(o => o.Events)
        .AsSplitQuery();

    private static AdminOrderDto ToDto(Order order, StoreSettings settings)
    {
        var minutes = order.Type == OrderType.Delivery ? settings.EstimatedDeliveryMinutes : settings.EstimatedPickupMinutes;
        var next = Enum.GetValues<OrderStatus>().Where(s => OrderService.CanTransition(order, s)).ToList();
        return new AdminOrderDto(order.Id, OrderDto.From(order, minutes), next);
    }

    public static DateTimeOffset StartOfDay(DateOnly date, TimeZoneInfo tz)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, tz.GetUtcOffset(local));
    }
}
