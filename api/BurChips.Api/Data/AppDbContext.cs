using BurChips.Api.Data.Entities;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BurChips.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options), IDataProtectionKeyContext
{
    /// <summary>Encryption keys for sign-in cookies and security tokens, shared across restarts and instances.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<OptionGroup> OptionGroups => Set<OptionGroup>();
    public DbSet<Option> Options => Set<Option>();
    public DbSet<MenuItemOptionGroup> MenuItemOptionGroups => Set<MenuItemOptionGroup>();

    public DbSet<StoreSettings> StoreSettings => Set<StoreSettings>();
    public DbSet<OpeningHours> OpeningHours => Set<OpeningHours>();
    public DbSet<DeliveryArea> DeliveryAreas => Set<DeliveryArea>();
    public DbSet<PromoCode> PromoCodes => Set<PromoCode>();
    public DbSet<PromoRedemption> PromoRedemptions => Set<PromoRedemption>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerAddress> CustomerAddresses => Set<CustomerAddress>();
    public DbSet<OtpCode> OtpCodes => Set<OtpCode>();

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderItemOption> OrderItemOptions => Set<OrderItemOption>();
    public DbSet<OrderEvent> OrderEvents => Set<OrderEvent>();
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        builder.Properties<decimal>().HavePrecision(10, 2);
        builder.Properties<string>().HaveMaxLength(256);
        builder.Properties<Brand>().HaveConversion<string>().HaveMaxLength(32);
        builder.Properties<DiscountType>().HaveConversion<string>().HaveMaxLength(32);
        builder.Properties<OrderType>().HaveConversion<string>().HaveMaxLength(32);
        builder.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(32);
        builder.Properties<PaymentMethod>().HaveConversion<string>().HaveMaxLength(32);
        builder.Properties<PaymentStatus>().HaveConversion<string>().HaveMaxLength(32);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        // Identity: keep token/claim values unlimited despite the 256-char string convention.
        b.Entity<IdentityUserToken<string>>().Property(x => x.Value).HasColumnType("nvarchar(max)");
        b.Entity<IdentityUserClaim<string>>().Property(x => x.ClaimValue).HasColumnType("nvarchar(max)");
        b.Entity<IdentityRoleClaim<string>>().Property(x => x.ClaimValue).HasColumnType("nvarchar(max)");
        b.Entity<DataProtectionKey>().Property(x => x.Xml).HasColumnType("nvarchar(max)");

        // ---- Menu ----
        b.Entity<Category>(e =>
        {
            e.HasIndex(x => new { x.BranchId, x.Slug }).IsUnique();
            e.Property(x => x.Description).HasMaxLength(1000);
        });

        b.Entity<MenuItem>(e =>
        {
            e.HasIndex(x => new { x.BranchId, x.Slug }).IsUnique();
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.ImageUrl).HasMaxLength(1000);
            e.HasOne(x => x.Category).WithMany(c => c.Items).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Option>(e =>
        {
            e.HasOne(x => x.OptionGroup).WithMany(g => g.Options).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<MenuItemOptionGroup>(e =>
        {
            e.HasIndex(x => new { x.MenuItemId, x.OptionGroupId }).IsUnique();
            e.HasOne(x => x.MenuItem).WithMany(i => i.OptionGroups).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.OptionGroup).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.DependsOnOption).WithMany().OnDelete(DeleteBehavior.Restrict);
        });

        // ---- Store ----
        b.Entity<StoreSettings>(e =>
        {
            e.HasIndex(x => x.BranchId).IsUnique();
            e.Property(x => x.Address).HasMaxLength(500);
            e.Property(x => x.PauseMessage).HasMaxLength(500);
            e.Property(x => x.TaxPercent).HasPrecision(5, 2);
        });

        b.Entity<OpeningHours>(e => e.HasIndex(x => new { x.BranchId, x.DayOfWeek }).IsUnique());

        b.Entity<PromoCode>(e =>
        {
            e.HasIndex(x => new { x.BranchId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(40);
            e.Property(x => x.RowVersion).IsRowVersion();
        });

        b.Entity<PromoRedemption>(e =>
        {
            e.HasIndex(x => x.OrderId).IsUnique();
            e.HasIndex(x => new { x.PromoCodeId, x.CustomerId });
            e.HasOne(x => x.PromoCode).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
        });

        // ---- Customers ----
        b.Entity<Customer>(e =>
        {
            e.HasIndex(x => x.Phone).IsUnique();
            e.Property(x => x.Phone).HasMaxLength(20);
        });

        b.Entity<CustomerAddress>(e =>
        {
            e.Property(x => x.AddressLine).HasMaxLength(500);
            e.HasOne(x => x.Customer).WithMany(c => c.Addresses).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.DeliveryArea).WithMany().OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<OtpCode>(e =>
        {
            e.HasIndex(x => new { x.Phone, x.CreatedAt });
            e.Property(x => x.Phone).HasMaxLength(20);
            e.Property(x => x.RequestIp).HasMaxLength(64);
        });

        // ---- Orders ----
        b.HasSequence<int>("OrderNumbers").StartsAt(1001);

        b.Entity<Order>(e =>
        {
            e.Property(x => x.OrderNumber).HasDefaultValueSql("NEXT VALUE FOR OrderNumbers");
            e.HasIndex(x => x.OrderNumber).IsUnique();
            e.HasIndex(x => x.PublicId).IsUnique();
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.HasIndex(x => new { x.CustomerId, x.CreatedAt });
            e.HasIndex(x => new { x.CustomerId, x.ClientRequestId })
                .IsUnique()
                .HasFilter("[ClientRequestId] IS NOT NULL");
            e.Property(x => x.CustomerPhone).HasMaxLength(20);
            e.Property(x => x.AddressLine).HasMaxLength(500);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.Property(x => x.RejectReason).HasMaxLength(500);
            e.Property(x => x.PromoCodeText).HasMaxLength(40);
            e.Property(x => x.RowVersion).IsRowVersion();
            e.HasOne(x => x.Customer).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasOne<DeliveryArea>().WithMany().HasForeignKey(x => x.DeliveryAreaId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<PromoCode>().WithMany().HasForeignKey(x => x.PromoCodeId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<OrderItem>(e =>
        {
            e.Property(x => x.Notes).HasMaxLength(500);
            e.HasOne(x => x.Order).WithMany(o => o.Items).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<OrderItemOption>(e =>
            e.HasOne(x => x.OrderItem).WithMany(i => i.Options).OnDelete(DeleteBehavior.Cascade));

        b.Entity<OrderEvent>(e =>
        {
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasOne(x => x.Order).WithMany(o => o.Events).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Payment>(e =>
        {
            e.HasIndex(x => new { x.Gateway, x.ProviderReference })
                .IsUnique()
                .HasFilter("[ProviderReference] IS NOT NULL");
            e.Property(x => x.RawPayload).HasColumnType("nvarchar(max)");
            e.HasOne(x => x.Order).WithMany(o => o.Payments).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
