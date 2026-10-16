using System.Net.Http.Headers;
using System.Threading.Channels;
using BurChips.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BurChips.Api.Features.Notifications;

/// <summary>What the owner's phone is told about a new order.</summary>
public record OwnerOrderAlert(int OrderNumber, decimal Total, string Fulfilment, string Customer, string Items);

public interface IOwnerAlertSender
{
    Task SendAsync(OwnerOrderAlert alert, CancellationToken ct);
}

public class WhatsAppOptions
{
    public const string Section = "WhatsApp";

    /// <summary>Meta WhatsApp Cloud API credentials. Empty = alerts are only logged.</summary>
    public string PhoneNumberId { get; set; } = "";
    public string AccessToken { get; set; } = "";

    /// <summary>Pre-approved utility template with 4 body parameters: order number, total, fulfilment, items.</summary>
    public string TemplateName { get; set; } = "new_order_alert";
    public string LanguageCode { get; set; } = "en";

    /// <summary>Owner's WhatsApp number in international format without +, e.g. 923441858989.</summary>
    public string RecipientPhone { get; set; } = "";

    public bool Enabled => PhoneNumberId != "" && AccessToken != "" && RecipientPhone != "";
}

/// <summary>Sends the new-order alert as a WhatsApp template message via Meta's Cloud API.</summary>
public class WhatsAppAlertSender(HttpClient http, IOptions<WhatsAppOptions> options) : IOwnerAlertSender
{
    public async Task SendAsync(OwnerOrderAlert alert, CancellationToken ct)
    {
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/v21.0/{o.PhoneNumberId}/messages")
        {
            Content = JsonContent.Create(new
            {
                messaging_product = "whatsapp",
                to = o.RecipientPhone,
                type = "template",
                template = new
                {
                    name = o.TemplateName,
                    language = new { code = o.LanguageCode },
                    components = new[]
                    {
                        new
                        {
                            type = "body",
                            parameters = new[]
                            {
                                new { type = "text", text = $"#{alert.OrderNumber}" },
                                new { type = "text", text = $"Rs {alert.Total:0}" },
                                new { type = "text", text = alert.Fulfilment },
                                new { type = "text", text = Truncate(alert.Items, 300) },
                            },
                        },
                    },
                },
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.AccessToken);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"WhatsApp API returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
    }

    private static string Truncate(string text, int max) => text.Length <= max ? text : text[..(max - 1)] + "…";
}

public class LogAlertSender(ILogger<LogAlertSender> logger) : IOwnerAlertSender
{
    public Task SendAsync(OwnerOrderAlert alert, CancellationToken ct)
    {
        logger.LogInformation("[Owner alert] New order #{Number} · Rs {Total:0} · {Fulfilment} · {Items}",
            alert.OrderNumber, alert.Total, alert.Fulfilment, alert.Items);
        return Task.CompletedTask;
    }
}

/// <summary>Queue of owner alerts, so a slow WhatsApp call never delays a customer's checkout.</summary>
public class OwnerAlertQueue
{
    private readonly Channel<OwnerOrderAlert> _channel = Channel.CreateBounded<OwnerOrderAlert>(
        new BoundedChannelOptions(500) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(OwnerOrderAlert alert) => _channel.Writer.TryWrite(alert);

    public IAsyncEnumerable<OwnerOrderAlert> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

/// <summary>Delivers queued alerts: WhatsApp first, SMS to the shop's number if WhatsApp fails.</summary>
public class OwnerAlertWorker(
    OwnerAlertQueue queue,
    IOwnerAlertSender sender,
    ISmsSender sms,
    IServiceScopeFactory scopes,
    ILogger<OwnerAlertWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var alert in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await sender.SendAsync(alert, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "WhatsApp alert for order #{Number} failed; falling back to SMS", alert.OrderNumber);
                await SendSmsFallbackAsync(alert, stoppingToken);
            }
        }
    }

    private async Task SendSmsFallbackAsync(OwnerOrderAlert alert, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var number = await db.StoreSettings.Select(s => s.WhatsAppNumber).FirstOrDefaultAsync(ct);
            if (string.IsNullOrWhiteSpace(number)) return;

            await sms.SendAsync(number, $"BurChips: NEW ORDER #{alert.OrderNumber} Rs {alert.Total:0} ({alert.Fulfilment}). Open Live Orders.", ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "SMS fallback for order #{Number} also failed", alert.OrderNumber);
        }
    }
}
