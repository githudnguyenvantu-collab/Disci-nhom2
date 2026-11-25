using System.ComponentModel.DataAnnotations;

namespace Disci.Web.Models.Entities;

public class ProductCategory
{
    [Key, MaxLength(20)] public string Key { get; set; } = "";             // band, dumbbell, mat, pullup, treadmill, cardio, recovery, supp
    [Required, MaxLength(60)] public string Name { get; set; } = "";
}

public class Product
{
    [Key, MaxLength(40)] public string Id { get; set; } = "";
    [Required, MaxLength(20)] public string CategoryKey { get; set; } = "";
    public ProductCategory Category { get; set; } = null!;
    [Required, MaxLength(150)] public string Name { get; set; } = "";
    [Range(0, 1_000_000_000)] public int PriceVnd { get; set; }
    [MaxLength(1000)] public string? Description { get; set; }
    [MaxLength(20)] public string? Unlocks { get; set; }
    public string GoalsJson { get; set; } = "[]";
    [MaxLength(10)] public string Space { get; set; } = "small";
    [MaxLength(20)] public string Priority { get; set; } = "";
    [MaxLength(40)] public string? Icon { get; set; }
    public string SpecsJson { get; set; } = "[]";
    [MaxLength(1000)] public string? HowToUse { get; set; }
    [MaxLength(500)] public string? ForWho { get; set; }
    [MaxLength(500)] public string? Note { get; set; }
    [MaxLength(300)] public string? ImageUrl { get; set; }
    public string ExtraJson { get; set; } = "{}";                            // images[], brand, sku, stock, badge, highlights, longDesc, specTable, usage, warranty, shipping, returns…
    public bool IsSupplement { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsCustom { get; set; }
}

public class SavedProduct
{
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(40)] public string ProductId { get; set; } = "";
    public Product Product { get; set; } = null!;
    public int Position { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CartItem
{
    [Required] public string UserId { get; set; } = "";
    [Required, MaxLength(40)] public string ProductId { get; set; } = "";
    public Product Product { get; set; } = null!;
    [Range(1, 99)] public int Qty { get; set; } = 1;
    public int Position { get; set; }                                       // giữ thứ tự hiển thị như giao diện
}

public class Order
{
    public long Id { get; set; }
    [Required] public string UserId { get; set; } = "";
    [MaxLength(40)] public string? ClientId { get; set; }
    /// <summary>Đơn hàng nguyên vẹn (gồm địa chỉ giao hàng) đã MÃ HÓA bằng Data Protection; các cột Ship* chỉ giữ bản che một phần.</summary>
    public string RawProtected { get; set; } = "";
    [Required, MaxLength(20)] public string Status { get; set; } = "demo";   // đơn demo: không có giao dịch thật
    public int SubtotalVnd { get; set; }
    public int ShippingVnd { get; set; }
    public int TotalVnd { get; set; }
    [Required, MaxLength(120)] public string ShipName { get; set; } = "";
    [Required, MaxLength(20)] public string ShipPhone { get; set; } = "";
    [Required, MaxLength(300)] public string ShipAddress { get; set; } = "";
    [MaxLength(30)] public string PaymentMethod { get; set; } = "cod";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<OrderItem> Items { get; set; } = new();
}

public class OrderItem
{
    public long Id { get; set; }
    public long OrderId { get; set; }
    public Order Order { get; set; } = null!;
    [Required, MaxLength(40)] public string ProductId { get; set; } = "";
    public Product Product { get; set; } = null!;
    [Range(1, 99)] public int Qty { get; set; }
    public int UnitPriceVnd { get; set; }
}
