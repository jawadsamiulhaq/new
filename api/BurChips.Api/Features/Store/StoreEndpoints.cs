using BurChips.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Store;

public record StoreStatusDto(
    bool IsOpen,
    bool IsPaused,
    bool CanOrder,
    string? PauseMessage,
    DateTimeOffset? ClosesAt,
    DateTimeOffset? NextOpenAt);

public record OpeningHoursDto(DayOfWeek Day, string OpensAt, string ClosesAt, bool IsClosed);

public record DeliveryAreaDto(int Id, string Name, decimal Fee, decimal MinOrder);

public record StoreDto(
    string Name,
    string Phone,
    string? WhatsAppNumber,
    string Address,
    string TimeZone,
    bool DeliveryEnabled,
    bool PickupEnabled,
    decimal? FreeDeliveryThreshold,
    int EstimatedDeliveryMinutes,
    int EstimatedPickupMinutes,
    StoreStatusDto Status,
    IReadOnlyList<OpeningHoursDto> Hours,
    IReadOnlyList<DeliveryAreaDto> DeliveryAreas);

public static class StoreEndpoints
{
    public static IEndpointRouteBuilder MapStoreEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/store", GetStore).AllowAnonymous();
        return app;
    }

    private static async Task<IResult> GetStore(AppDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var settings = await db.StoreSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        if (settings is null) return Results.Problem("Store is not configured.", statusCode: 503);

        var hours = await db.OpeningHours.AsNoTracking().ToListAsync(ct);
        var areas = await db.DeliveryAreas.AsNoTracking()
            .Where(a => a.IsActive)
            .OrderBy(a => a.SortOrder).ThenBy(a => a.Name)
            .Select(a => new DeliveryAreaDto(a.Id, a.Name, a.Fee, a.MinOrder))
            .ToListAsync(ct);

        var hoursStatus = StoreHoursService.Evaluate(clock.GetUtcNow(), hours, settings.TimeZone);
        var status = new StoreStatusDto(
            hoursStatus.IsOpen,
            settings.IsPaused,
            CanOrder: hoursStatus.IsOpen && !settings.IsPaused,
            settings.IsPaused ? settings.PauseMessage : null,
            hoursStatus.ClosesAt,
            hoursStatus.NextOpenAt);

        // Week starting Monday reads naturally for Pakistani customers.
        var week = hours
            .OrderBy(h => ((int)h.DayOfWeek + 6) % 7)
            .Select(h => new OpeningHoursDto(h.DayOfWeek, h.OpensAt.ToString("HH:mm"), h.ClosesAt.ToString("HH:mm"), h.IsClosed))
            .ToList();

        return Results.Ok(new StoreDto(
            settings.StoreName,
            settings.Phone,
            settings.WhatsAppNumber,
            settings.Address,
            settings.TimeZone,
            settings.DeliveryEnabled,
            settings.PickupEnabled,
            settings.FreeDeliveryThreshold,
            settings.EstimatedDeliveryMinutes,
            settings.EstimatedPickupMinutes,
            status,
            week,
            areas));
    }
}
