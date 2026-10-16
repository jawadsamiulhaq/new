using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using BurChips.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Admin;

public record AreaDto(int Id, string Name, decimal Fee, decimal MinOrder, bool IsActive, int SortOrder);

public record AreaInput(string Name, decimal Fee, decimal MinOrder, bool IsActive);

public record PromoDto(
    int Id, string Code, string? Description, DiscountType DiscountType, decimal Value, decimal? MaxDiscount, decimal MinOrder,
    DateTimeOffset? StartsAt, DateTimeOffset? ExpiresAt, int? MaxUses, int? MaxUsesPerCustomer, bool FirstOrderOnly, bool IsActive, int UsedCount);

public record PromoInput(
    string Code, string? Description, DiscountType DiscountType, decimal Value, decimal? MaxDiscount, decimal MinOrder,
    DateTimeOffset? StartsAt, DateTimeOffset? ExpiresAt, int? MaxUses, int? MaxUsesPerCustomer, bool FirstOrderOnly, bool IsActive);

public record HoursDto(DayOfWeek Day, string OpensAt, string ClosesAt, bool IsClosed);

public record SettingsDto(
    string StoreName, string Phone, string? WhatsAppNumber, string Address,
    bool IsPaused, string? PauseMessage,
    bool DeliveryEnabled, bool PickupEnabled, bool CodEnabled, bool PayFastEnabled,
    decimal? FreeDeliveryThreshold, decimal TaxPercent, bool PricesIncludeTax,
    int EstimatedDeliveryMinutes, int EstimatedPickupMinutes,
    IReadOnlyList<HoursDto> Hours);

public record SettingsInput(
    string StoreName, string Phone, string? WhatsAppNumber, string Address,
    bool DeliveryEnabled, bool PickupEnabled, bool CodEnabled,
    decimal? FreeDeliveryThreshold, decimal TaxPercent, bool PricesIncludeTax,
    int EstimatedDeliveryMinutes, int EstimatedPickupMinutes,
    IReadOnlyList<HoursDto> Hours);

public record PauseRequest(bool IsPaused, string? Message);

public static class AdminStoreEndpoints
{
    public static RouteGroupBuilder MapAdminStoreStaffEndpoints(this RouteGroupBuilder staff)
    {
        // Pausing is a rush-hour decision the counter must be able to make without the owner.
        staff.MapPost("/store/pause", Pause);
        return staff;
    }

    public static RouteGroupBuilder MapAdminStoreOwnerEndpoints(this RouteGroupBuilder owner)
    {
        owner.MapGet("/areas", Areas);
        owner.MapPost("/areas", CreateArea);
        owner.MapPut("/areas/{id:int}", UpdateArea);
        owner.MapDelete("/areas/{id:int}", DeleteArea);
        owner.MapPost("/areas/reorder", ReorderAreas);

        owner.MapGet("/promos", Promos);
        owner.MapPost("/promos", CreatePromo);
        owner.MapPut("/promos/{id:int}", UpdatePromo);

        owner.MapGet("/settings", GetSettings);
        owner.MapPut("/settings", UpdateSettings);
        return owner;
    }

    // ---------- Pause ----------

    private static async Task<IResult> Pause(PauseRequest request, AppDbContext db, IHubContext<StaffHub> staff, CancellationToken ct)
    {
        var message = string.IsNullOrWhiteSpace(request.Message) ? null : request.Message.Trim();
        if (message is { Length: > 200 }) return AdminResults.Problem(400, "The pause message is too long (max 200 characters).");

        await db.StoreSettings.ExecuteUpdateAsync(s => s
            .SetProperty(x => x.IsPaused, request.IsPaused)
            .SetProperty(x => x.PauseMessage, request.IsPaused ? message : null), ct);
        await staff.Clients.Group(StaffHub.Group).SendAsync(StaffHub.StoreChanged, ct);
        return Results.NoContent();
    }

    // ---------- Delivery areas ----------

    private static async Task<IReadOnlyList<AreaDto>> Areas(AppDbContext db, CancellationToken ct) =>
        await db.DeliveryAreas.AsNoTracking().OrderBy(a => a.SortOrder).ThenBy(a => a.Name)
            .Select(a => new AreaDto(a.Id, a.Name, a.Fee, a.MinOrder, a.IsActive, a.SortOrder)).ToListAsync(ct);

    private static string? ValidateArea(AreaInput input) =>
        string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60 ? "Area name is required (max 60 characters)."
        : input.Fee is < 0 or > 5_000 ? "Delivery fee must be between Rs 0 and Rs 5,000."
        : input.MinOrder is < 0 or > 50_000 ? "Minimum order must be between Rs 0 and Rs 50,000."
        : null;

    private static async Task<IResult> CreateArea(AreaInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateArea(input) is { } error) return AdminResults.Problem(400, error);
        if (await db.DeliveryAreas.AnyAsync(a => a.Name == input.Name.Trim(), ct)) return AdminResults.Problem(409, "An area with that name already exists.");

        var area = new DeliveryArea
        {
            Name = input.Name.Trim(),
            Fee = decimal.Round(input.Fee, 0),
            MinOrder = decimal.Round(input.MinOrder, 0),
            IsActive = input.IsActive,
            SortOrder = (await db.DeliveryAreas.MaxAsync(a => (int?)a.SortOrder, ct) ?? 0) + 1,
        };
        db.DeliveryAreas.Add(area);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { area.Id });
    }

    private static async Task<IResult> UpdateArea(int id, AreaInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidateArea(input) is { } error) return AdminResults.Problem(400, error);
        var area = await db.DeliveryAreas.FindAsync([id], ct);
        if (area is null) return Results.NotFound();
        area.Name = input.Name.Trim();
        area.Fee = decimal.Round(input.Fee, 0);
        area.MinOrder = decimal.Round(input.MinOrder, 0);
        area.IsActive = input.IsActive;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteArea(int id, AppDbContext db, CancellationToken ct)
    {
        var used = await db.Orders.AnyAsync(o => o.DeliveryAreaId == id, ct) || await db.CustomerAddresses.AnyAsync(a => a.DeliveryAreaId == id, ct);
        if (used) return AdminResults.Problem(409, "This area has past orders or saved addresses. Switch it off instead of deleting it.");
        var deleted = await db.DeliveryAreas.Where(a => a.Id == id).ExecuteDeleteAsync(ct);
        return deleted == 0 ? Results.NotFound() : Results.NoContent();
    }

    private static async Task<IResult> ReorderAreas(ReorderRequest request, AppDbContext db, CancellationToken ct)
    {
        var areas = await db.DeliveryAreas.Where(a => request.Ids.Contains(a.Id)).ToListAsync(ct);
        foreach (var a in areas) a.SortOrder = request.Ids.ToList().IndexOf(a.Id) + 1;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ---------- Promo codes ----------

    private static async Task<IReadOnlyList<PromoDto>> Promos(AppDbContext db, CancellationToken ct) =>
        await db.PromoCodes.AsNoTracking().OrderByDescending(p => p.IsActive).ThenBy(p => p.Code)
            .Select(p => new PromoDto(p.Id, p.Code, p.Description, p.DiscountType, p.Value, p.MaxDiscount, p.MinOrder,
                p.StartsAt, p.ExpiresAt, p.MaxUses, p.MaxUsesPerCustomer, p.FirstOrderOnly, p.IsActive, p.UsedCount))
            .ToListAsync(ct);

    private static string? ValidatePromo(PromoInput input)
    {
        var code = input.Code?.Trim() ?? "";
        if (code.Length is < 3 or > 40 || !code.All(char.IsAsciiLetterOrDigit)) return "Code must be 3–40 letters or numbers (no spaces).";
        if (input.Description is { Length: > 200 }) return "Description is too long.";
        if (input.DiscountType == DiscountType.Percent && input.Value is <= 0 or > 100) return "Percent discount must be between 1 and 100.";
        if (input.DiscountType == DiscountType.Flat && input.Value is <= 0 or > 50_000) return "Flat discount must be between Rs 1 and Rs 50,000.";
        if (input.MaxDiscount is < 0) return "Maximum discount can't be negative.";
        if (input.MinOrder < 0) return "Minimum order can't be negative.";
        if (input.MaxUses is < 1 || input.MaxUsesPerCustomer is < 1) return "Usage limits must be at least 1 (or left empty for no limit).";
        if (input.StartsAt is { } s && input.ExpiresAt is { } e && e <= s) return "The end date must be after the start date.";
        return null;
    }

    private static async Task<IResult> CreatePromo(PromoInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidatePromo(input) is { } error) return AdminResults.Problem(400, error);
        var code = input.Code.Trim().ToUpperInvariant();
        if (await db.PromoCodes.AnyAsync(p => p.Code == code, ct)) return AdminResults.Problem(409, "That code already exists.");

        var promo = new PromoCode { Code = code };
        Apply(promo, input);
        db.PromoCodes.Add(promo);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { promo.Id });
    }

    private static async Task<IResult> UpdatePromo(int id, PromoInput input, AppDbContext db, CancellationToken ct)
    {
        if (ValidatePromo(input) is { } error) return AdminResults.Problem(400, error);
        var promo = await db.PromoCodes.FindAsync([id], ct);
        if (promo is null) return Results.NotFound();

        var code = input.Code.Trim().ToUpperInvariant();
        if (code != promo.Code)
        {
            if (promo.UsedCount > 0) return AdminResults.Problem(409, "This code has already been used, so it can't be renamed. Create a new code instead.");
            if (await db.PromoCodes.AnyAsync(p => p.Code == code && p.Id != id, ct)) return AdminResults.Problem(409, "That code already exists.");
            promo.Code = code;
        }
        Apply(promo, input);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return AdminResults.Problem(409, "This code was just used by a customer. Please try again.");
        }
        return Results.NoContent();
    }

    private static void Apply(PromoCode promo, PromoInput input)
    {
        promo.Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();
        promo.DiscountType = input.DiscountType;
        promo.Value = decimal.Round(input.Value, 0);
        promo.MaxDiscount = input.DiscountType == DiscountType.Percent && input.MaxDiscount is { } cap ? decimal.Round(cap, 0) : null;
        promo.MinOrder = decimal.Round(input.MinOrder, 0);
        promo.StartsAt = input.StartsAt;
        promo.ExpiresAt = input.ExpiresAt;
        promo.MaxUses = input.MaxUses;
        promo.MaxUsesPerCustomer = input.MaxUsesPerCustomer;
        promo.FirstOrderOnly = input.FirstOrderOnly;
        promo.IsActive = input.IsActive;
    }

    // ---------- Settings & hours ----------

    private static async Task<SettingsDto> GetSettings(AppDbContext db, CancellationToken ct)
    {
        var s = await db.StoreSettings.AsNoTracking().FirstAsync(ct);
        var hours = await db.OpeningHours.AsNoTracking().ToListAsync(ct);
        return new SettingsDto(
            s.StoreName, s.Phone, s.WhatsAppNumber, s.Address, s.IsPaused, s.PauseMessage,
            s.DeliveryEnabled, s.PickupEnabled, s.CodEnabled, s.PayFastEnabled,
            s.FreeDeliveryThreshold, s.TaxPercent, s.PricesIncludeTax, s.EstimatedDeliveryMinutes, s.EstimatedPickupMinutes,
            [.. hours.OrderBy(h => ((int)h.DayOfWeek + 6) % 7).Select(h => new HoursDto(h.DayOfWeek, h.OpensAt.ToString("HH:mm"), h.ClosesAt.ToString("HH:mm"), h.IsClosed))]);
    }

    private static async Task<IResult> UpdateSettings(SettingsInput input, AppDbContext db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.StoreName) || input.StoreName.Length > 80) return AdminResults.Problem(400, "Store name is required.");
        if (string.IsNullOrWhiteSpace(input.Phone) || input.Phone.Length > 20) return AdminResults.Problem(400, "Phone number is required.");
        if (input.WhatsAppNumber is { Length: > 20 }) return AdminResults.Problem(400, "WhatsApp number is too long.");
        if (string.IsNullOrWhiteSpace(input.Address) || input.Address.Length > 500) return AdminResults.Problem(400, "Address is required.");
        if (!input.DeliveryEnabled && !input.PickupEnabled) return AdminResults.Problem(400, "Keep at least one of delivery or pick-up switched on.");
        if (input.TaxPercent is < 0 or > 50) return AdminResults.Problem(400, "Tax must be between 0% and 50%.");
        if (input.FreeDeliveryThreshold is < 0) return AdminResults.Problem(400, "Free-delivery amount can't be negative.");
        if (input.EstimatedDeliveryMinutes is < 5 or > 240 || input.EstimatedPickupMinutes is < 5 or > 240)
            return AdminResults.Problem(400, "Time estimates must be between 5 and 240 minutes.");

        var days = input.Hours ?? [];
        if (days.Count != 7 || days.Select(d => d.Day).Distinct().Count() != 7) return AdminResults.Problem(400, "Please set hours for all 7 days.");
        var parsed = new List<(DayOfWeek Day, TimeOnly Opens, TimeOnly Closes, bool Closed)>();
        foreach (var d in days)
        {
            if (!TimeOnly.TryParse(d.OpensAt, out var opens) || !TimeOnly.TryParse(d.ClosesAt, out var closes))
                return AdminResults.Problem(400, $"Please enter valid times for {d.Day}.");
            parsed.Add((d.Day, opens, closes, d.IsClosed));
        }

        var s = await db.StoreSettings.FirstAsync(ct);
        if (!input.CodEnabled && !s.PayFastEnabled)
            return AdminResults.Problem(400, "Cash payment can't be switched off while online payment isn't set up — customers would have no way to pay.");

        s.StoreName = input.StoreName.Trim();
        s.Phone = input.Phone.Trim();
        s.WhatsAppNumber = string.IsNullOrWhiteSpace(input.WhatsAppNumber) ? null : input.WhatsAppNumber.Trim();
        s.Address = input.Address.Trim();
        s.DeliveryEnabled = input.DeliveryEnabled;
        s.PickupEnabled = input.PickupEnabled;
        s.CodEnabled = input.CodEnabled;
        s.FreeDeliveryThreshold = input.FreeDeliveryThreshold is > 0 ? decimal.Round(input.FreeDeliveryThreshold.Value, 0) : null;
        s.TaxPercent = input.TaxPercent;
        s.PricesIncludeTax = input.PricesIncludeTax;
        s.EstimatedDeliveryMinutes = input.EstimatedDeliveryMinutes;
        s.EstimatedPickupMinutes = input.EstimatedPickupMinutes;

        var hours = await db.OpeningHours.ToListAsync(ct);
        foreach (var (day, opens, closes, closed) in parsed)
        {
            var row = hours.FirstOrDefault(h => h.DayOfWeek == day);
            if (row is null) db.OpeningHours.Add(row = new OpeningHours { DayOfWeek = day });
            row.OpensAt = opens;
            row.ClosesAt = closes;
            row.IsClosed = closed;
        }

        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
