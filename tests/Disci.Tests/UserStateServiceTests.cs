using System.Text.Json;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services;
using Disci.Web.Services.State;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Disci.Tests;

/// <summary>Kiểm thử ánh xạ trạng thái giao diện ⇄ bảng SQL (dùng SQLite trong bộ nhớ; hành vi khóa ngoại/cascade tương tự SQL Server).</summary>
public sealed class UserStateServiceTests : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    private readonly ServiceProvider _sp;

    public UserStateServiceTests()
    {
        _conn.Open();
        var sc = new ServiceCollection();
        sc.AddLogging();
        sc.AddDataProtection().UseEphemeralDataProtectionProvider();
        sc.AddDbContext<ApplicationDbContext>(o => o.UseSqlite(_conn));
        sc.AddIdentityCore<ApplicationUser>().AddEntityFrameworkStores<ApplicationDbContext>();
        sc.AddScoped<IUserStateService, UserStateService>();
        sc.AddScoped<IAccountDeletionService, AccountDeletionService>();
        _sp = sc.BuildServiceProvider();
        using var s = _sp.CreateScope();
        s.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.EnsureCreated();
    }
    public void Dispose() { _sp.Dispose(); _conn.Dispose(); }

    private async Task<string> MakeUser(string email = "a@b.vn")
    {
        using var s = _sp.CreateScope();
        var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var u = new ApplicationUser { UserName = email, Email = email, FullName = "An" };
        Assert.True((await um.CreateAsync(u)).Succeeded);
        return u.Id;
    }
    private async Task<SaveOutcome> Save(string uid, string json) { using var s = _sp.CreateScope(); return await s.ServiceProvider.GetRequiredService<IUserStateService>().SaveAsync(uid, (JsonObject)JsonNode.Parse(json)!); }
    private async Task<StateSnapshot> Load(string uid) { using var s = _sp.CreateScope(); return await s.ServiceProvider.GetRequiredService<IUserStateService>().LoadAsync(uid); }
    private T Db<T>(Func<ApplicationDbContext, T> f) { using var s = _sp.CreateScope(); return f(s.ServiceProvider.GetRequiredService<ApplicationDbContext>()); }

    private static readonly JsonElement Golden = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Golden", "golden.json"))).RootElement;
    private static string PlanJson(int i) => Golden.GetProperty("plans")[i].GetProperty("plan").GetRawText();
    private static void Same(JsonNode? a, JsonNode? b, string what) => Assert.True(JsonNode.DeepEquals(a, b), $"{what}\nvào : {a?.ToJsonString()}\nra  : {b?.ToJsonString()}");

    [Fact]
    public async Task RoundTrip_Keeps_Every_Field()
    {
        var uid = await MakeUser();
        var plan = PlanJson(0); var hist = PlanJson(5);
        var keys = $$$$"""
        {
          "onboarded": true,
          "profile": {"name":"An Nguyen","email":"khac@x.vn","sex":"male","age":25,"height":170,"weight":65,"goal":"fatloss","goalWeight":60,"daysPerWeek":3,"minutes":40,"place":"home","equip":["band"],"budget":500000,"space":"small","activity":2,"quiet":false,"bio":"xin chào","phone":"0900","area":"HN","avatar":"data:image/png;base64,AAAA","birth":"2000-01-01"},
          "metrics": [{"id":"m1","date":"2026-11-01","weight":66.5,"at":1,"note":"sáng"},{"date":"2026-11-08","weight":65.8,"waist":78,"at":2,"demo":true}],
          "sessions": [{"id":"s1","date":"2026-11-02","title":"Toàn thân","minutes":40,"calories":250,"rpe":7,"exs":["a","b"],"status":"done","at":5},{"id":"s2","date":"2026-11-04","title":"Cardio","minutes":30,"calories":200,"rpe":null,"exs":[],"status":"done","at":6}],
          "plan": {{{{plan}}}},
          "planHistory": [{"id":"h1","at":1700000000000,"reason":"Tạo lại lịch tập","changes":[{"from":"a","to":"b"}],"plan":{{{{hist}}}}}],
          "health": {"records":[{"id":"r1","date":"2026-11-01","type":"bp","value":"120/80"}],"restrictions":["knee"],"notes":"","consents":{"bp":{"granted":true}}},
          "notifications": [{"id":"n1","t":"Chào","unread":true}],
          "settings": {"theme":"dark","lang":"vi"}
        }
        """;
        var r = await Save(uid, keys); Assert.True(r.Ok, r.Error); Assert.Equal(1, r.Version);

        var back = (await Load(uid)).State; var inp = (JsonObject)JsonNode.Parse(keys)!;
        foreach (var k in new[] { "metrics", "sessions", "plan", "planHistory", "health", "notifications", "settings", "onboarded" }) Same(inp[k], back[k], k);

        var p = (JsonObject)back["profile"]!;
        Assert.Equal("An Nguyen", (string?)p["name"]); Assert.Equal("a@b.vn", (string?)p["email"]);    // email do máy chủ quyết định
        Assert.Equal(25, (int?)p["age"]); Assert.Equal(65, (double?)p["weight"]); Assert.Equal("0900", (string?)p["phone"]);
        Assert.Equal("data:image/png;base64,AAAA", (string?)p["avatar"]); Assert.Equal("band", (string?)p["equip"]![0]);

        // dữ liệu đã vào bảng quan hệ, không chỉ nằm trong JSON
        Assert.Equal(2, Db(d => d.BodyMetrics.Count())); Assert.Equal(2, Db(d => d.WorkoutSessions.Count()));
        Assert.Equal(1, Db(d => d.WorkoutPlans.Count(x => x.Active))); Assert.Equal(1, Db(d => d.WorkoutPlans.Count(x => !x.Active)));
        Assert.True(Db(d => d.WorkoutDays.Count(x => x.Plan.Active)) >= 2);
        Assert.Equal(25, Db(d => d.UserProfiles.Single().Age)); Assert.True(Db(d => d.UserProfiles.Single().OnboardingCompleted));
    }

    [Fact]
    public async Task Health_Data_Is_Encrypted_At_Rest()
    {
        var uid = await MakeUser();
        Assert.True((await Save(uid, """{"health":{"records":[{"type":"bp","value":"135/88"}]},"address":{"name":"An","line":"12 Phố Huế"}}""")).Ok);
        var raw = Db(d => d.UserDataBlobs.Where(b => b.Key == "health" || b.Key == "address").ToList());
        Assert.All(raw, b => { Assert.True(b.IsProtected); Assert.DoesNotContain("135/88", b.Value); Assert.DoesNotContain("Phố Huế", b.Value); });
        Same(JsonNode.Parse("""{"records":[{"type":"bp","value":"135/88"}]}"""), (await Load(uid)).State["health"], "health");
    }

    [Fact]
    public async Task Rejects_Unknown_Keys_And_Invalid_Data_Atomically()
    {
        var uid = await MakeUser();
        Assert.False((await Save(uid, """{"isAdmin":true}""")).Ok);
        var bad = await Save(uid, """{"settings":{"theme":"light"},"metrics":[{"date":"2026-11-01","weight":5}]}""");   // cân nặng 5 kg không hợp lệ
        Assert.False(bad.Ok);
        Assert.Equal(0, Db(d => d.UserDataBlobs.Count()));            // khóa 'settings' đi cùng cũng không được ghi
        Assert.False((await Save(uid, """{"sessions":[{"id":"x","date":"không-phải-ngày"}]}""")).Ok);
        Assert.False((await Save(uid, """{"sessions":[{"id":"x","date":"2026-11-01"},{"id":"x","date":"2026-11-02"}]}""")).Ok);
    }

    [Fact]
    public async Task Sessions_Are_Diffed_By_Client_Id()
    {
        var uid = await MakeUser();
        Assert.True((await Save(uid, """{"sessions":[{"id":"a","date":"2026-11-01","minutes":30},{"id":"b","date":"2026-11-02","minutes":40},{"id":"c","date":"2026-11-03","minutes":50}]}""")).Ok);
        var idA = Db(d => d.WorkoutSessions.Single(x => x.ClientId == "a").Id);
        Assert.True((await Save(uid, """{"sessions":[{"id":"a","date":"2026-11-01","minutes":35},{"id":"c","date":"2026-11-03","minutes":50}]}""")).Ok);
        Assert.Equal(2, Db(d => d.WorkoutSessions.Count()));
        Assert.Equal(idA, Db(d => d.WorkoutSessions.Single(x => x.ClientId == "a").Id));              // cập nhật tại chỗ, không tạo lại
        Assert.Equal(35, Db(d => d.WorkoutSessions.Single(x => x.ClientId == "a").Minutes));
        Assert.Equal(["a", "c"], ((JsonArray)(await Load(uid)).State["sessions"]!).Select(n => (string)n!["id"]!).ToArray());
    }

    [Fact]
    public async Task New_Plan_Replaces_Active_And_Version_Increments()
    {
        var uid = await MakeUser();
        var r1 = await Save(uid, $$"""{"plan":{{PlanJson(0)}}}"""); var r2 = await Save(uid, $$"""{"plan":{{PlanJson(1)}}}""");
        Assert.Equal(1, r1.Version); Assert.Equal(2, r2.Version);
        Assert.Equal(1, Db(d => d.WorkoutPlans.Count(x => x.Active)));
        Same(JsonNode.Parse(PlanJson(1)), (await Load(uid)).State["plan"], "plan");
        Assert.True((await Save(uid, """{"plan":null}""")).Ok); Assert.Null((await Load(uid)).State["plan"]);
    }

    [Fact]
    public async Task Deleting_Account_Removes_Everything_Without_FK_Errors()
    {
        var uid = await MakeUser("a@b.vn"); var other = await MakeUser("c@d.vn");
        Assert.True((await Save(uid, $$"""{"profile":{"name":"An"},"sessions":[{"id":"s","date":"2026-11-01"}],"plan":{{PlanJson(0)}},"health":{"x":1},"cart":[]}""")).Ok);
        using (var s = _sp.CreateScope())
        {
            var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var post = new Post { UserId = other, Body = "bài của người khác" }; db.Posts.Add(post); await db.SaveChangesAsync();
            db.Comments.Add(new Comment { PostId = post.Id, UserId = uid, Body = "bình luận của An" });
            db.PostLikes.Add(new PostLike { PostId = post.Id, UserId = uid });
            db.Follows.Add(new Follow { FollowerId = other, FolloweeId = uid });
            await db.SaveChangesAsync();
        }
        using (var s = _sp.CreateScope())
        {
            var um = s.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var res = await s.ServiceProvider.GetRequiredService<IAccountDeletionService>().DeleteAsync((await um.FindByIdAsync(uid))!);
            Assert.True(res.Succeeded, string.Join(";", res.Errors.Select(e => e.Description)));
        }
        Assert.Null(Db(d => d.Users.Find(uid)));
        Assert.Equal(0, Db(d => d.WorkoutSessions.Count() + d.WorkoutPlans.Count() + d.UserDataBlobs.Count() + d.Comments.Count() + d.PostLikes.Count() + d.Follows.Count()));
        Assert.Equal(1, Db(d => d.Posts.Count()));                    // bài viết của người khác còn nguyên
        Assert.NotNull(Db(d => d.Users.Find(other)));
    }

    // ===================== Cửa hàng: giỏ hàng / đã lưu / đơn hàng =====================
    private void SeedProducts()
    {
        using var s = _sp.CreateScope(); var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.ProductCategories.Add(new ProductCategory { Key = "band", Name = "Dây" });
        db.Products.AddRange(new Product { Id = "p1", CategoryKey = "band", Name = "Dây A", PriceVnd = 100000 }, new Product { Id = "p2", CategoryKey = "band", Name = "Dây B", PriceVnd = 200000 });
        db.SaveChanges();
    }

    [Fact]
    public async Task Cart_Roundtrip_Keeps_Order_And_Unknown_Products()
    {
        SeedProducts(); var uid = await MakeUser();
        Assert.True((await Save(uid, """{"cart":[{"id":"p2","qty":3},{"id":"khong-co-trong-db","qty":1},{"id":"p1","qty":2}]}""")).Ok);
        Same(JsonNode.Parse("""[{"id":"p2","qty":3},{"id":"khong-co-trong-db","qty":1},{"id":"p1","qty":2}]"""), (await Load(uid)).State["cart"], "cart");
        Assert.Equal(2, Db(d => d.CartItems.Count()));                         // chỉ sản phẩm có thật vào bảng CartItems
        Assert.True((await Save(uid, """{"cart":[]}""")).Ok); Same(new JsonArray(), (await Load(uid)).State["cart"], "cart rỗng");
        Assert.Equal(0, Db(d => d.CartItems.Count() + d.UserDataBlobs.Count(b => b.Key.StartsWith("_unknown"))));
    }

    [Fact]
    public async Task Cart_Merges_Duplicates_And_Rejects_Bad_Quantity()
    {
        SeedProducts(); var uid = await MakeUser();
        Assert.True((await Save(uid, """{"cart":[{"id":"p1","qty":1},{"id":"p1","qty":2}]}""")).Ok);
        Same(JsonNode.Parse("""[{"id":"p1","qty":3}]"""), (await Load(uid)).State["cart"], "gộp trùng");
        Assert.False((await Save(uid, """{"cart":[{"id":"p1","qty":0}]}""")).Ok); Assert.False((await Save(uid, """{"cart":[{"id":"p1","qty":100}]}""")).Ok);
    }

    [Fact]
    public async Task SavedProducts_Roundtrip()
    {
        SeedProducts(); var uid = await MakeUser();
        Assert.True((await Save(uid, """{"productSaved":["p2","lạ","p1"]}""")).Ok);
        Same(JsonNode.Parse("""["p2","lạ","p1"]"""), (await Load(uid)).State["productSaved"], "productSaved"); Assert.Equal(2, Db(d => d.SavedProducts.Count()));
    }

    [Fact]
    public async Task Orders_Are_Stored_Relationally_With_Encrypted_Address()
    {
        SeedProducts(); var uid = await MakeUser();
        var order = """{"id":"o1","code":"DEMO-123456","at":1700000000000,"items":[{"id":"p1","name":"Dây A","qty":2,"price":100000},{"id":"khong-co","name":"X","qty":1,"price":5}],"sub":200005,"ship":20000,"total":220005,"disc":0,"coupon":"","address":{"name":"An Nguyen","phone":"0912345678","line":"12 Phố Huế, Hà Nội"},"pay":"Thanh toán khi nhận hàng","status":"Đơn demo – chưa gửi tới cửa hàng"}""";
        Assert.True((await Save(uid, $$"""{"orders":[{{order}}]}""")).Ok);
        Same(JsonNode.Parse(order), ((JsonArray)(await Load(uid)).State["orders"]!)[0], "order");

        var o = Db(d => d.Orders.Single()); var items = Db(d => d.OrderItems.ToList());
        Assert.Equal(220005, o.TotalVnd); Assert.Single(items); Assert.Equal("p1", items[0].ProductId); Assert.Equal(2, items[0].Qty);
        Assert.DoesNotContain("0912345678", o.ShipPhone); Assert.EndsWith("678", o.ShipPhone); Assert.Equal("", o.ShipAddress);
        Assert.DoesNotContain("Phố Huế", o.RawProtected); Assert.DoesNotContain("0912345678", o.RawProtected);

        Assert.True((await Save(uid, """{"orders":[]}""")).Ok);                // hủy đơn demo
        Assert.Equal(0, Db(d => d.Orders.Count() + d.OrderItems.Count()));
    }

    [Fact]
    public async Task NutritionLog_Roundtrip_Keeps_Order_Custom_Meals_And_Unknown_Ids()
    {
        using (var s = _sp.CreateScope()) { var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); db.FoodItems.Add(new FoodItem { Id = "m1", Name = "Phở", Slot = "sang", Kcal = 400 }); db.SaveChanges(); }
        var uid = await MakeUser();
        var log = """{"2026-11-20":[{"id":"m1"},{"id":"custom","meal":{"id":"custom","name":"Cơm nhà","kcal":650,"protein":30,"cost":0}},{"id":"mon_da_xoa"}],"2026-11-21":[{"id":"m1"}]}""";
        Assert.True((await Save(uid, $$"""{"nutritionLog":{{log}}}""")).Ok);
        Same(JsonNode.Parse(log), (await Load(uid)).State["nutritionLog"], "nutritionLog");                  // đúng thứ tự trong ngày
        Assert.Equal(4, Db(d => d.NutritionLogs.Count())); Assert.Equal(2, Db(d => d.NutritionLogs.Count(n => n.FoodItemId == "m1")));   // món đã xóa khỏi danh mục: không vi phạm khóa ngoại
        var custom = Db(d => d.NutritionLogs.Single(n => n.CustomName == "Cơm nhà")); Assert.Equal(650, custom.Kcal); Assert.Equal(30, custom.ProteinG); Assert.Equal(1, custom.Position);
        Assert.True((await Save(uid, """{"nutritionLog":{"2026-11-20":[{"id":"m1"}]}}""")).Ok);               // xóa mục (giao diện cắt mảng theo chỉ số)
        Assert.Equal(1, Db(d => d.NutritionLogs.Count()));
        Assert.False((await Save(uid, """{"nutritionLog":{"hôm nay":[{"id":"m1"}]}}""")).Ok); Assert.False((await Save(uid, """{"nutritionLog":{"2026-11-20":[{"meal":{}}]}}""")).Ok);
        Assert.Equal(1, Db(d => d.NutritionLogs.Count()));
    }
}