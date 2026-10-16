using BurChips.Api.Data.Entities;

namespace BurChips.Api.Features.Store;

/// <summary>Open/closed state of the shop at a moment in time, in the shop's local time zone.</summary>
public record StoreHoursStatus(bool IsOpen, DateTimeOffset? ClosesAt, DateTimeOffset? NextOpenAt);

/// <summary>
/// Works out whether the shop is open from its weekly opening hours.
/// A day whose closing time is at or before its opening time closes after midnight
/// (e.g. Friday 12:00 → 02:00 means open until 2 AM Saturday). Equal times mean open 24 hours.
/// </summary>
public static class StoreHoursService
{
    public static StoreHoursStatus Evaluate(DateTimeOffset now, IReadOnlyCollection<OpeningHours> hours, string timeZoneId)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
        var local = TimeZoneInfo.ConvertTime(now, tz);
        var today = DateOnly.FromDateTime(local.DateTime);

        // Yesterday's window can still be running after midnight, so check it first.
        for (var offset = -1; offset <= 0; offset++)
        {
            var window = Window(today.AddDays(offset), hours, tz);
            if (window is { } w && now >= w.Opens && now < w.Closes)
                return new StoreHoursStatus(true, w.Closes, null);
        }

        // Closed: find the next opening in the coming week.
        for (var offset = 0; offset <= 7; offset++)
        {
            var window = Window(today.AddDays(offset), hours, tz);
            if (window is { } w && w.Opens > now)
                return new StoreHoursStatus(false, null, w.Opens);
        }

        return new StoreHoursStatus(false, null, null);
    }

    private static (DateTimeOffset Opens, DateTimeOffset Closes)? Window(
        DateOnly date, IReadOnlyCollection<OpeningHours> hours, TimeZoneInfo tz)
    {
        var day = hours.FirstOrDefault(h => h.DayOfWeek == date.DayOfWeek);
        if (day is null || day.IsClosed) return null;

        var opens = date.ToDateTime(day.OpensAt);
        var closesDate = day.ClosesAt <= day.OpensAt ? date.AddDays(1) : date;
        var closes = closesDate.ToDateTime(day.ClosesAt);

        return (ToZoned(opens, tz), ToZoned(closes, tz));
    }

    private static DateTimeOffset ToZoned(DateTime localTime, TimeZoneInfo tz) =>
        new(localTime, tz.GetUtcOffset(localTime));
}
