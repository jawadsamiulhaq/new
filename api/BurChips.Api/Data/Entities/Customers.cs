namespace BurChips.Api.Data.Entities;

/// <summary>A customer is identified by their verified phone number (no password).</summary>
public class Customer
{
    public int Id { get; set; }

    /// <summary>Normalised Pakistani mobile in E.164 form, e.g. +923441858989.</summary>
    public required string Phone { get; set; }
    public string? Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }

    public List<CustomerAddress> Addresses { get; set; } = [];
}

public class CustomerAddress
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public string? Label { get; set; }
    public int DeliveryAreaId { get; set; }
    public DeliveryArea DeliveryArea { get; set; } = null!;
    public required string AddressLine { get; set; }
    public string? Landmark { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class OtpCode
{
    public int Id { get; set; }
    public required string Phone { get; set; }

    /// <summary>Hash of the 6-digit code; the code itself is never stored.</summary>
    public required string CodeHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? RequestIp { get; set; }
}
