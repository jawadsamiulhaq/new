namespace BurChips.Api.Features.Notifications;

public interface ISmsSender
{
    /// <summary>True when messages actually reach phones (false for the development logger).</summary>
    bool IsLive { get; }

    Task SendAsync(string phoneE164, string message, CancellationToken ct = default);
}

/// <summary>Development/testing: writes SMS to the log instead of sending them.</summary>
public class LogSmsSender(ILogger<LogSmsSender> logger) : ISmsSender
{
    public bool IsLive => false;

    public Task SendAsync(string phoneE164, string message, CancellationToken ct = default)
    {
        logger.LogInformation("[SMS to {Phone}] {Message}", phoneE164, message);
        return Task.CompletedTask;
    }
}

/// <summary>Production placeholder until the owner picks an SMS gateway (e.g. Veevo Tech, EOcean).</summary>
public class UnconfiguredSmsSender : ISmsSender
{
    public bool IsLive => true;

    public Task SendAsync(string phoneE164, string message, CancellationToken ct = default) =>
        throw new SmsNotConfiguredException();
}

public class SmsNotConfiguredException() : Exception("No SMS provider is configured (Sms:Provider).");
