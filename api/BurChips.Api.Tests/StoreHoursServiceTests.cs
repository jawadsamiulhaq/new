using BurChips.Api.Data.Entities;
using BurChips.Api.Features.Store;

namespace BurChips.Api.Tests;

public class StoreHoursServiceTests
{
    private const string Karachi = "Asia/Karachi";

    /// <summary>Local Pakistan time (UTC+5). 15 Oct 2026 is a Thursday.</summary>
    private static DateTimeOffset Pkt(int day, int hour, int minute = 0) =>
        new(2026, 10, day, hour, minute, 0, TimeSpan.FromHours(5));

    private static List<OpeningHours> EveryDay(int open, int close, params DayOfWeek[] closedDays) =>
    [
        .. Enum.GetValues<DayOfWeek>().Select(d => new OpeningHours
        {
            DayOfWeek = d,
            OpensAt = new TimeOnly(open, 0),
            ClosesAt = new TimeOnly(close, 0),
            IsClosed = closedDays.Contains(d),
        }),
    ];

    [Fact]
    public void Open_during_the_afternoon_closes_after_midnight()
    {
        var status = StoreHoursService.Evaluate(Pkt(15, 13), EveryDay(12, 2), Karachi);

        Assert.True(status.IsOpen);
        Assert.Equal(Pkt(16, 2), status.ClosesAt);
    }

    [Fact]
    public void Still_open_after_midnight_from_previous_day()
    {
        var status = StoreHoursService.Evaluate(Pkt(16, 1, 30), EveryDay(12, 2), Karachi);

        Assert.True(status.IsOpen);
        Assert.Equal(Pkt(16, 2), status.ClosesAt);
    }

    [Fact]
    public void Closed_at_closing_time_and_reopens_at_noon()
    {
        var status = StoreHoursService.Evaluate(Pkt(16, 2), EveryDay(12, 2), Karachi);

        Assert.False(status.IsOpen);
        Assert.Equal(Pkt(16, 12), status.NextOpenAt);
    }

    [Fact]
    public void Closed_just_before_opening()
    {
        var status = StoreHoursService.Evaluate(Pkt(15, 11, 59), EveryDay(12, 2), Karachi);

        Assert.False(status.IsOpen);
        Assert.Equal(Pkt(15, 12), status.NextOpenAt);
    }

    [Fact]
    public void Same_day_hours_close_before_midnight()
    {
        var status = StoreHoursService.Evaluate(Pkt(15, 23, 30), EveryDay(12, 23), Karachi);

        Assert.False(status.IsOpen);
        Assert.Equal(Pkt(16, 12), status.NextOpenAt);
    }

    [Fact]
    public void Closed_day_is_skipped_but_previous_night_still_runs_into_it()
    {
        var hours = EveryDay(12, 2, DayOfWeek.Friday);

        // Thursday's late shift still ends at 2 AM Friday.
        var lateThursday = StoreHoursService.Evaluate(Pkt(16, 1), hours, Karachi);
        Assert.True(lateThursday.IsOpen);

        // Friday is closed, so the next opening is Saturday noon.
        var fridayAfternoon = StoreHoursService.Evaluate(Pkt(16, 15), hours, Karachi);
        Assert.False(fridayAfternoon.IsOpen);
        Assert.Equal(Pkt(17, 12), fridayAfternoon.NextOpenAt);
    }

    [Fact]
    public void Equal_open_and_close_means_open_all_day()
    {
        var status = StoreHoursService.Evaluate(Pkt(15, 4), EveryDay(0, 0), Karachi);

        Assert.True(status.IsOpen);
    }

    [Fact]
    public void Works_from_utc_input()
    {
        // 08:00 UTC = 13:00 in Lahore.
        var status = StoreHoursService.Evaluate(
            new DateTimeOffset(2026, 10, 15, 8, 0, 0, TimeSpan.Zero), EveryDay(12, 2), Karachi);

        Assert.True(status.IsOpen);
    }

    [Fact]
    public void No_hours_means_closed_with_no_next_opening()
    {
        var status = StoreHoursService.Evaluate(Pkt(15, 13), [], Karachi);

        Assert.False(status.IsOpen);
        Assert.Null(status.NextOpenAt);
    }
}
