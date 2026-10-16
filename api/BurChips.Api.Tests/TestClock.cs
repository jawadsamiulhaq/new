namespace BurChips.Api.Tests;

/// <summary>A clock tests can set to any moment (forwards or backwards).</summary>
public class TestClock(DateTimeOffset start) : TimeProvider
{
    private DateTimeOffset _now = start;

    public override DateTimeOffset GetUtcNow() => _now;

    public void SetUtcNow(DateTimeOffset value) => _now = value.ToUniversalTime();
}
