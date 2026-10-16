using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Admin;

public record DaySales(DateOnly Date, int Orders, decimal Revenue);

public record TopItem(string Name, int Quantity, decimal Revenue);

public record SalesReport(
    DateOnly From,
    DateOnly To,
    int Orders,
    decimal Revenue,
    decimal AverageOrder,
    decimal Discounts,
    decimal DeliveryFees,
    int Delivery,
    int Pickup,
    decimal CashRevenue,
    decimal OnlineRevenue,
    int Rejected,
    int Cancelled,
    IReadOnlyList<DaySales> ByDay,
    IReadOnlyList<TopItem> TopItems);

/// <summary>Owner sales summary. Counts orders that went through (not unpaid, rejected or cancelled).</summary>
public static class AdminReportEndpoints
{
    public const int MaxDays = 366;

    public static RouteGroupBuilder MapAdminReportEndpoints(this RouteGroupBuilder owner)
    {
        owner.MapGet("/reports/sales", Sales);
        return owner;
    }

    private static async Task<IResult> Sales(AppDbContext db, TimeProvider clock, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        var tz = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), tz).DateTime);

        var end = to ?? today;
        var start = from ?? end.AddDays(-6);
        if (start > end) return AdminResults.Problem(400, "The start date must be before the end date.");
        if (end.DayNumber - start.DayNumber >= MaxDays) return AdminResults.Problem(400, "Please choose a range of one year or less.");

        var startUtc = AdminOrderEndpoints.StartOfDay(start, tz);
        var endUtc = AdminOrderEndpoints.StartOfDay(end.AddDays(1), tz);

        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= startUtc && o.CreatedAt < endUtc && o.Status != OrderStatus.PendingPayment)
            .Select(o => new { o.Id, o.Status, o.Type, o.PaymentMethod, o.Total, o.Discount, o.DeliveryFee, o.CreatedAt })
            .ToListAsync(ct);

        var counted = orders.Where(o => o.Status is not (OrderStatus.Rejected or OrderStatus.Cancelled)).ToList();
        var countedIds = counted.Select(o => o.Id).ToList();

        var topItems = (await db.OrderItems.AsNoTracking()
                .Where(i => countedIds.Contains(i.OrderId))
                .GroupBy(i => i.Name)
                .Select(g => new { Name = g.Key, Quantity = g.Sum(i => i.Quantity), Revenue = g.Sum(i => i.LineTotal) })
                .OrderByDescending(t => t.Quantity).ThenByDescending(t => t.Revenue)
                .Take(10)
                .ToListAsync(ct))
            .Select(t => new TopItem(t.Name, t.Quantity, t.Revenue))
            .ToList();

        var byDay = Enumerable.Range(0, end.DayNumber - start.DayNumber + 1)
            .Select(start.AddDays)
            .GroupJoin(counted,
                day => day,
                o => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.CreatedAt, tz).DateTime),
                (day, dayOrders) => new DaySales(day, dayOrders.Count(), dayOrders.Sum(o => o.Total)))
            .ToList();

        var revenue = counted.Sum(o => o.Total);
        return Results.Ok(new SalesReport(
            start, end,
            counted.Count,
            revenue,
            counted.Count == 0 ? 0 : decimal.Round(revenue / counted.Count, 0),
            counted.Sum(o => o.Discount),
            counted.Sum(o => o.DeliveryFee),
            counted.Count(o => o.Type == OrderType.Delivery),
            counted.Count(o => o.Type == OrderType.Pickup),
            counted.Where(o => o.PaymentMethod == PaymentMethod.Cod).Sum(o => o.Total),
            counted.Where(o => o.PaymentMethod != PaymentMethod.Cod).Sum(o => o.Total),
            orders.Count(o => o.Status == OrderStatus.Rejected),
            orders.Count(o => o.Status == OrderStatus.Cancelled),
            byDay,
            topItems));
    }
}
