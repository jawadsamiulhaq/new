using BurChips.Api.Data;
using BurChips.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Features.Checkout;

public record CartLineRequest(int MenuItemId, int Quantity, int[]? OptionIds, string? Note);

public record PricedOption(int GroupId, string GroupTitle, int OptionId, string Name, decimal Price);

public record PricedLine(
    int MenuItemId,
    string Name,
    decimal BasePrice,
    decimal OptionsPrice,
    decimal UnitPrice,
    int Quantity,
    decimal LineTotal,
    string? Note,
    IReadOnlyList<PricedOption> Options);

/// <summary>A reason the cart can't be ordered as-is. LineIndex points at the cart line, when relevant.</summary>
public record PricingProblem(string Code, string Message, int? LineIndex = null);

public record PricingResult(
    IReadOnlyList<PricedLine> Lines,
    decimal Subtotal,
    decimal Discount,
    decimal DeliveryFee,
    decimal Tax,
    decimal Total,
    int? PromoCodeId,
    string? PromoCode,
    /// <summary>Why an entered promo code wasn't applied (does not block the order by itself).</summary>
    string? PromoMessage,
    DeliveryArea? Area,
    IReadOnlyList<PricingProblem> Problems)
{
    public bool CanOrder => Problems.Count == 0;
}

public record PricingRequest(
    OrderType Type,
    int? DeliveryAreaId,
    string? PromoCode,
    IReadOnlyList<CartLineRequest> Lines,
    int? CustomerId);

/// <summary>
/// The single source of truth for what an order costs. Every total the customer pays is
/// computed here from the database — prices sent by the browser are never used.
/// Mirrors web/src/lib/pricing.ts (display only).
/// </summary>
public class PricingService(AppDbContext db, TimeProvider clock)
{
    public const int MaxQuantity = 20;
    public const int MaxLines = 30;
    public const int MaxNoteLength = 140;

    public async Task<PricingResult> PriceAsync(PricingRequest request, CancellationToken ct)
    {
        var problems = new List<PricingProblem>();
        var settings = await db.StoreSettings.AsNoTracking().FirstAsync(ct);

        if (request.Lines.Count == 0) problems.Add(new("empty_cart", "Your cart is empty."));
        if (request.Lines.Count > MaxLines) problems.Add(new("too_many_lines", "That's a very large order — please call us to place it."));

        // ---- Items ----
        var itemIds = request.Lines.Select(l => l.MenuItemId).Distinct().ToList();
        var items = await db.MenuItems.AsNoTracking()
            .Where(i => itemIds.Contains(i.Id))
            .Include(i => i.Category)
            .Include(i => i.OptionGroups).ThenInclude(l => l.OptionGroup).ThenInclude(g => g.Options)
            .AsSplitQuery()
            .ToDictionaryAsync(i => i.Id, ct);

        var lines = new List<PricedLine>();
        for (var index = 0; index < request.Lines.Count && index < MaxLines; index++)
        {
            var priced = PriceLine(request.Lines[index], index, items, problems);
            if (priced is not null) lines.Add(priced);
        }

        var subtotal = lines.Sum(l => l.LineTotal);

        // ---- Delivery area ----
        DeliveryArea? area = null;
        if (request.Type == OrderType.Delivery)
        {
            if (!settings.DeliveryEnabled)
                problems.Add(new("delivery_unavailable", "Delivery isn't available right now — please choose pick-up."));

            area = request.DeliveryAreaId is { } areaId
                ? await db.DeliveryAreas.AsNoTracking().FirstOrDefaultAsync(a => a.Id == areaId && a.IsActive, ct)
                : null;

            if (area is null)
                problems.Add(new("area_required", "Please choose your delivery area."));
            else if (subtotal < area.MinOrder)
                problems.Add(new("below_minimum", $"Minimum order for {area.Name} is Rs {area.MinOrder:0}. Add Rs {area.MinOrder - subtotal:0} more."));
        }
        else if (!settings.PickupEnabled)
        {
            problems.Add(new("pickup_unavailable", "Pick-up isn't available right now — please choose delivery."));
        }

        // ---- Promo ----
        var (promo, discount, promoMessage) = await ApplyPromoAsync(request.PromoCode, subtotal, request.CustomerId, ct);

        // ---- Fees, tax, total ----
        var afterDiscount = subtotal - discount;
        var deliveryFee = area is null
            ? 0m
            : settings.FreeDeliveryThreshold is { } threshold && afterDiscount >= threshold ? 0m : area.Fee;
        var tax = settings.PricesIncludeTax ? 0m : Math.Round(afterDiscount * settings.TaxPercent / 100m, 0, MidpointRounding.AwayFromZero);
        var total = afterDiscount + deliveryFee + tax;

        return new PricingResult(
            lines, subtotal, discount, deliveryFee, tax, total,
            promo?.Id, promo?.Code, promoMessage, area, problems);
    }

    private static PricedLine? PriceLine(
        CartLineRequest line, int index, Dictionary<int, MenuItem> items, List<PricingProblem> problems)
    {
        if (!items.TryGetValue(line.MenuItemId, out var item) || !item.IsActive || !item.Category.IsActive)
        {
            problems.Add(new("item_unavailable", "An item in your cart is no longer on the menu.", index));
            return null;
        }
        if (!item.IsAvailable)
        {
            problems.Add(new("item_sold_out", $"{item.Name} is sold out right now.", index));
            return null;
        }
        if (line.Quantity is < 1 or > MaxQuantity)
        {
            problems.Add(new("bad_quantity", $"Quantity for {item.Name} must be between 1 and {MaxQuantity}.", index));
            return null;
        }
        if (line.Note is { Length: > MaxNoteLength })
        {
            problems.Add(new("note_too_long", $"Instructions for {item.Name} are too long.", index));
            return null;
        }

        // Each option belongs to exactly one of the item's attached groups (an item can't attach a group twice).
        var selected = (line.OptionIds ?? []).Distinct().ToHashSet();
        var linksByOption = item.OptionGroups
            .SelectMany(link => link.OptionGroup.Options.Select(o => (Option: o, Link: link)))
            .ToDictionary(x => x.Option.Id);

        if (selected.Any(id => !linksByOption.ContainsKey(id)))
        {
            problems.Add(new("bad_option", $"Some choices for {item.Name} are no longer offered. Please re-add it.", index));
            return null;
        }
        if (selected.Any(id => !linksByOption[id].Option.IsAvailable))
        {
            problems.Add(new("option_sold_out", $"A choice for {item.Name} is sold out. Please re-add it.", index));
            return null;
        }

        var options = new List<PricedOption>();
        foreach (var link in item.OptionGroups.OrderBy(l => l.SortOrder))
        {
            var visible = link.DependsOnOptionId is not { } parent || selected.Contains(parent);
            var chosen = link.OptionGroup.Options.Where(o => selected.Contains(o.Id)).ToList();

            if (!visible)
            {
                if (chosen.Count > 0)
                {
                    problems.Add(new("bad_option", $"Some choices for {item.Name} don't go together. Please re-add it.", index));
                    return null;
                }
                continue;
            }

            if (chosen.Count < link.MinSelect || chosen.Count > link.MaxSelect)
            {
                problems.Add(new("bad_selection", $"{item.Name}: {link.Title} needs a valid choice. Please re-add it.", index));
                return null;
            }

            // The most expensive picks are the free ones (customer-friendly).
            var free = chosen.OrderByDescending(o => o.PriceDelta).Take(link.FreeSelections).Select(o => o.Id).ToHashSet();
            options.AddRange(chosen
                .OrderBy(o => o.SortOrder)
                .Select(o => new PricedOption(link.Id, link.Title, o.Id, o.Name, free.Contains(o.Id) ? 0m : o.PriceDelta)));
        }

        var optionsPrice = options.Sum(o => o.Price);
        var unitPrice = item.Price + optionsPrice;
        var note = string.IsNullOrWhiteSpace(line.Note) ? null : line.Note.Trim();
        return new PricedLine(item.Id, item.Name, item.Price, optionsPrice, unitPrice, line.Quantity, unitPrice * line.Quantity, note, options);
    }

    private async Task<(PromoCode? Promo, decimal Discount, string? Message)> ApplyPromoAsync(
        string? code, decimal subtotal, int? customerId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code)) return (null, 0m, null);

        var normalized = code.Trim().ToUpperInvariant();
        var now = clock.GetUtcNow();
        var promo = await db.PromoCodes.AsNoTracking().FirstOrDefaultAsync(p => p.Code == normalized, ct);

        string? reason = promo switch
        {
            null or { IsActive: false } => "That promo code isn't valid.",
            { StartsAt: { } starts } when starts > now => "That promo code isn't active yet.",
            { ExpiresAt: { } expires } when expires <= now => "That promo code has expired.",
            { MaxUses: { } max, UsedCount: var used } when used >= max => "That promo code has been fully used.",
            { MinOrder: var min } when subtotal < min => $"Add Rs {min - subtotal:0} more to use {normalized} (minimum Rs {min:0}).",
            _ => null,
        };

        if (reason is null && customerId is { } id)
        {
            if (promo!.FirstOrderOnly && await HasPreviousOrdersAsync(id, ct))
                reason = "That promo code is for first orders only.";
            else if (promo.MaxUsesPerCustomer is { } perCustomer &&
                     await db.PromoRedemptions.CountAsync(r => r.PromoCodeId == promo.Id && r.CustomerId == id, ct) >= perCustomer)
                reason = "You've already used that promo code.";
        }

        if (reason is not null) return (null, 0m, reason);

        var discount = promo!.DiscountType == DiscountType.Percent
            ? Math.Round(subtotal * promo.Value / 100m, 0, MidpointRounding.AwayFromZero)
            : promo.Value;
        if (promo.MaxDiscount is { } cap) discount = Math.Min(discount, cap);
        discount = Math.Min(discount, subtotal);

        return (promo, discount, null);
    }

    /// <summary>Orders that actually went through (not unpaid, rejected or cancelled).</summary>
    public Task<bool> HasPreviousOrdersAsync(int customerId, CancellationToken ct) =>
        db.Orders.AnyAsync(o => o.CustomerId == customerId
            && o.Status != OrderStatus.PendingPayment
            && o.Status != OrderStatus.Rejected
            && o.Status != OrderStatus.Cancelled, ct);
}
