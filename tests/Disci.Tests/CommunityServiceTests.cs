using Microsoft.AspNetCore.DataProtection;
using System.Text.Json.Nodes;
using Disci.Web.Data;
using Disci.Web.Models.Entities;
using Disci.Web.Services.Community;
using Disci.Web.Services.State;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Disci.Tests;

public sealed class CommunityServiceTests : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    private readonly ServiceProvider _sp;

    public CommunityServiceTests()
    {
        _conn.Open();
        var sc = new ServiceCollection();
        sc.AddLogging(); sc.AddDataProtection().UseEphemeralDataProtectionProvider();
        sc.AddDbContext<ApplicationDbContext>(o => o.UseSqlite(_conn));
        sc.AddScoped<ICommunityService, CommunityService>(); sc.AddScoped<IUserStateService, UserStateService>();
        _sp = sc.BuildServiceProvider();
        using var s = _sp.CreateScope(); var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>(); db.Database.EnsureCreated();
        foreach (var id in new[] { "a", "b", "c" }) db.Users.Add(new ApplicationUser { Id = id, UserName = id + "@x.vn", Email = id + "@x.vn", FullName = "Người " + id.ToUpper() });
        db.Challenges.Add(new Challenge { Id = "ch1", Name = "30 ngày", Days = 30, Goal = 20, Metric = "sessions" });
        db.SaveChanges();
    }
    public void Dispose() { _sp.Dispose(); _conn.Dispose(); }

    private async Task<T> With<T>(Func<ICommunityService, ApplicationDbContext, Task<T>> f) { using var s = _sp.CreateScope(); return await f(s.ServiceProvider.GetRequiredService<ICommunityService>(), s.ServiceProvider.GetRequiredService<ApplicationDbContext>()); }
    private Task<T> Svc<T>(Func<ICommunityService, Task<T>> f) => With((s, _) => f(s));
    private T Db<T>(Func<ApplicationDbContext, T> f) { using var s = _sp.CreateScope(); return f(s.ServiceProvider.GetRequiredService<ApplicationDbContext>()); }
    private void AddPosts(params (string Owner, string Id, string Vis, bool Hidden)[] ps)
    {
        using var s = _sp.CreateScope(); var db = s.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        foreach (var p in ps) db.Posts.Add(new Post { UserId = p.Owner, ClientId = p.Id, Body = "nội dung", Visibility = p.Vis, Hidden = p.Hidden, RawJson = $$"""{"id":"{{p.Id}}","text":"nội dung","at":1,"vis":"{{p.Vis}}"}""" });
        db.SaveChanges();
    }
    private async Task<string[]> Visible(string me, bool staff = false) => ((JsonArray)(await Svc(s => s.GetSnapshotAsync(me, staff)))["posts"]!).Select(n => (string)n!["id"]!).OrderBy(x => x).ToArray();

    [Fact]
    public async Task Post_Visibility_Is_Enforced_On_Server()
    {
        AddPosts(("a", "pub", "public", false), ("a", "fol", "followers", false), ("a", "pri", "private", false), ("a", "hid", "public", true));
        Assert.Equal(new[] { "pub" }, await Visible("b"));                                           // người lạ: chỉ bài công khai, không thấy bài bị ẩn
        Assert.Equal(new[] { "fol", "hid", "pri", "pub" }, await Visible("a"));                      // chủ bài thấy tất cả bài của mình
        Assert.Equal(new[] { "hid", "pub" }, await Visible("c", staff: true));                       // nhân sự thấy bài bị ẩn nhưng KHÔNG thấy bài riêng tư/followers của người khác
        Assert.True((await Svc(s => s.ToggleFollowAsync("b", "a"))).Ok);
        Assert.Equal(new[] { "fol", "pub" }, await Visible("b"));                                    // theo dõi xong mới thấy bài followers
    }

    [Fact]
    public async Task Cannot_Interact_With_Posts_You_Cannot_See()
    {
        AddPosts(("a", "pri", "private", false), ("a", "fol", "followers", false));
        Assert.Equal(404, (await Svc(s => s.ToggleLikeAsync("b", false, "pri"))).Status);
        Assert.Equal(404, (await Svc(s => s.AddCommentAsync("b", false, "pri", "xin chào"))).Status);
        Assert.Equal(404, (await Svc(s => s.ShareAsync("b", false, "fol"))).Status);
        Assert.Equal(404, (await Svc(s => s.ReportAsync("b", false, "pri", "spam"))).Status);
        Assert.Equal(0, Db(d => d.PostLikes.Count() + d.Comments.Count() + d.PostShares.Count() + d.Reports.Count()));
    }

    [Fact]
    public async Task Like_Toggles_And_Notifies_Owner_Once()
    {
        AddPosts(("a", "p1", "public", false));
        var r1 = await Svc(s => s.ToggleLikeAsync("b", false, "p1")); Assert.True(r1.Ok); Assert.Equal(1, Db(d => d.PostLikes.Count()));
        await Svc(s => s.ToggleLikeAsync("b", false, "p1")); Assert.Equal(0, Db(d => d.PostLikes.Count()));
        await Svc(s => s.ToggleLikeAsync("b", false, "p1"));                                          // thích lại: không tạo thông báo trùng
        Assert.Equal(1, Db(d => d.Notifications.Count(n => n.UserId == "a" && n.Type == "like")));
        AddPosts(("b", "mine", "public", false)); await Svc(s => s.ToggleLikeAsync("b", false, "mine"));
        Assert.Equal(0, Db(d => d.Notifications.Count(n => n.UserId == "b")));                        // thích bài của chính mình: không tự thông báo
    }

    [Fact]
    public async Task Comments_Validate_Moderate_And_Rate_Limit()
    {
        AddPosts(("a", "p1", "public", false));
        Assert.Equal(422, (await Svc(s => s.AddCommentAsync("b", false, "p1", "   "))).Status);
        var bad = await Svc(s => s.AddCommentAsync("b", false, "p1", "rủ đi CÁ ĐỘ không")); Assert.Equal(422, bad.Status); Assert.Contains("cá độ", bad.Error);
        var ok = await Svc(s => s.AddCommentAsync("b", false, "p1", "  Bài hay quá  ", "c_local1")); Assert.True(ok.Ok);
        Assert.Equal("Bài hay quá", Db(d => d.Comments.Single().Body)); Assert.Equal("c_local1", Db(d => d.Comments.Single().ClientId));   // nhận id do giao diện sinh
        Assert.True((await Svc(s => s.AddCommentAsync("b", false, "p1", "x", "c_local1"))).Ok);          // id trùng → máy chủ tự sinh id khác, vẫn thành công
        Assert.Equal(2, Db(d => d.Comments.Select(c => c.ClientId).Distinct().Count()));
        Assert.Equal(404, (await Svc(s => s.DeleteCommentAsync("c", "c_local1"))).Status);             // người khác không xóa được
        Assert.True((await Svc(s => s.DeleteCommentAsync("b", "c_local1"))).Ok);
        for (int i = 0; i < 25; i++) await Svc(s => s.AddCommentAsync("c", false, "p1", "spam " + i));
        Assert.Equal(20, Db(d => d.Comments.Count(x => x.UserId == "c")));                             // tối đa 20 bình luận/phút
        Assert.Equal(429, (await Svc(s => s.AddCommentAsync("c", false, "p1", "thêm"))).Status);
    }

    [Fact]
    public async Task Follow_Rules()
    {
        Assert.Equal(422, (await Svc(s => s.ToggleFollowAsync("a", "a"))).Status);
        Assert.Equal(404, (await Svc(s => s.ToggleFollowAsync("a", "khong-ton-tai"))).Status);
        Assert.True((await Svc(s => s.ToggleFollowAsync("a", "b"))).Ok); Assert.Equal(1, Db(d => d.Follows.Count())); Assert.Equal(1, Db(d => d.Notifications.Count(n => n.UserId == "b" && n.Type == "follow")));
        await Svc(s => s.ToggleFollowAsync("a", "b")); Assert.Equal(0, Db(d => d.Follows.Count()));
        Db(d => { var u = d.Users.Find("c")!; u.IsActive = false; d.SaveChanges(); return 0; });
        Assert.Equal(404, (await Svc(s => s.ToggleFollowAsync("a", "c"))).Status);                    // không theo dõi tài khoản bị khóa
    }

    [Fact]
    public async Task Group_Ownership_And_Membership()
    {
        Assert.Equal(422, (await Svc(s => s.CreateGroupAsync("a", new GroupInput { Name = "  " }))).Status);
        var created = await Svc(s => s.CreateGroupAsync("a", new GroupInput { Id = "g_local1", Name = "  Chạy bộ sáng ", Desc = "mô tả", Hue = 120 })); Assert.True(created.Ok);
        Assert.Equal("Chạy bộ sáng", Db(d => d.Groups.Single().Name)); Assert.Equal("g_local1", Db(d => d.Groups.Single().ClientId)); Assert.Equal(1, Db(d => d.GroupMembers.Count()));
        Assert.True((await Svc(s => s.ToggleJoinGroupAsync("b", "g_local1"))).Ok); Assert.Equal(2, Db(d => d.GroupMembers.Count()));
        Assert.Equal(403, (await Svc(s => s.UpdateGroupAsync("b", false, "g_local1", new GroupInput { Name = "Chiếm nhóm" }))).Status);   // thành viên thường không sửa được
        Assert.Equal(403, (await Svc(s => s.DeleteGroupAsync("b", false, "g_local1"))).Status);
        Assert.True((await Svc(s => s.UpdateGroupAsync("a", false, "g_local1", new GroupInput { Name = "Chạy bộ tối" }))).Ok); Assert.Equal("Chạy bộ tối", Db(d => d.Groups.Single().Name));
        AddPosts(("b", "pg", "public", false)); Db(d => { d.Posts.Single().GroupId = d.Groups.Single().Id; d.SaveChanges(); return 0; });
        Assert.True((await Svc(s => s.DeleteGroupAsync("c", true, "g_local1"))).Ok);                  // nhân sự quản trị xóa được
        Assert.Equal(0, Db(d => d.Groups.Count() + d.GroupMembers.Count())); Assert.Null(Db(d => d.Posts.Single().GroupId)); Assert.Equal(1, Db(d => d.Posts.Count()));
    }

    [Fact]
    public async Task Challenge_Join_And_Leave()
    {
        Assert.Equal(404, (await Svc(s => s.SetChallengeAsync("a", "khong-co", true))).Status);
        await Svc(s => s.SetChallengeAsync("a", "ch1", true)); await Svc(s => s.SetChallengeAsync("a", "ch1", true)); Assert.Equal(1, Db(d => d.ChallengeParticipants.Count()));   // tham gia hai lần vẫn một bản ghi
        await Svc(s => s.SetChallengeAsync("a", "ch1", false)); Assert.Equal(0, Db(d => d.ChallengeParticipants.Count()));
    }

    [Fact]
    public async Task Snapshot_Never_Leaks_Email_Or_Hidden_Stats()
    {
        Db(d => {
            d.UserDataBlobs.Add(new UserDataBlob { UserId = "b", Key = "settings", Value = """{"privacy":{"showStats":false,"showBoard":false}}""" });
            d.WorkoutSessions.AddRange(new WorkoutSession { UserId = "a", ClientId = "s1", DoneOn = DateOnly.FromDateTime(DateTime.UtcNow), Minutes = 30, Status = "done" }, new WorkoutSession { UserId = "b", ClientId = "s2", DoneOn = DateOnly.FromDateTime(DateTime.UtcNow), Minutes = 40, Status = "done" });
            d.SaveChanges(); return 0;
        });
        var snap = await Svc(s => s.GetSnapshotAsync("c", false)); var json = snap.ToJsonString();
        Assert.DoesNotContain("@x.vn", json); Assert.DoesNotContain("email", json, StringComparison.OrdinalIgnoreCase); Assert.DoesNotContain("PasswordHash", json);
        var stats = (JsonObject)snap["stats"]!; Assert.True(stats.ContainsKey("a")); Assert.Equal(1, (int)stats["a"]!["sessions"]!); Assert.False(stats.ContainsKey("b"));   // b đã tắt hiển thị thống kê
    }

    [Fact]
    public async Task Own_Posts_Saved_Via_State_Are_Visible_To_Others_And_Cascade_On_Delete()
    {
        using (var s = _sp.CreateScope())
        {
            var st = s.ServiceProvider.GetRequiredService<IUserStateService>();
            Assert.True((await st.SaveAsync("a", (JsonObject)JsonNode.Parse("""{"posts":[{"id":"pst1","text":"Hôm nay chạy 5km","topic":"Chạy bộ","at":1700000000000,"vis":"public"},{"id":"pst2","text":"Riêng tư","at":1700000000001,"vis":"private"}]}""")!)).Ok);
        }
        Assert.Equal(new[] { "pst1" }, await Visible("b"));
        Assert.Equal("Hôm nay chạy 5km", Db(d => d.Posts.Single(p => p.ClientId == "pst1").Body)); Assert.Equal("private", Db(d => d.Posts.Single(p => p.ClientId == "pst2").Visibility));
        await Svc(s => s.AddCommentAsync("b", false, "pst1", "Giỏi quá")); await Svc(s => s.ToggleLikeAsync("b", false, "pst1")); await Svc(s => s.ReportAsync("c", false, "pst1", "spam"));
        using (var s = _sp.CreateScope())          // xóa bài trong giao diện → xóa luôn bình luận/thích/báo cáo liên quan
            Assert.True((await s.ServiceProvider.GetRequiredService<IUserStateService>().SaveAsync("a", (JsonObject)JsonNode.Parse("""{"posts":[{"id":"pst2","text":"Riêng tư","at":1700000000001,"vis":"private"}]}""")!)).Ok);
        Assert.Equal(0, Db(d => d.Comments.Count() + d.PostLikes.Count() + d.Reports.Count())); Assert.Equal(1, Db(d => d.Posts.Count()));
        using (var s = _sp.CreateScope())          // không thể chiếm mã bài của người khác
            Assert.False((await s.ServiceProvider.GetRequiredService<IUserStateService>().SaveAsync("b", (JsonObject)JsonNode.Parse("""{"posts":[{"id":"pst2","text":"Giả mạo","at":1}]}""")!)).Ok);
    }

    // ===================== Tin nhắn & Stories =====================
    private static JsonNode? J(CommunityResult r) => System.Text.Json.JsonSerializer.SerializeToNode(r.Data);

    [Fact]
    public async Task Group_Chat_Is_Members_Only_Ordered_Filtered_And_Rate_Limited()
    {
        await Svc(s => s.CreateGroupAsync("a", new GroupInput { Id = "g_chat1", Name = "Nhóm chat" })); await Svc(s => s.ToggleJoinGroupAsync("b", "g_chat1"));
        Assert.Equal(404, (await Svc(s => s.SendGroupMessageAsync("c", "g_chat1", "xin chào"))).Status); Assert.Equal(404, (await Svc(s => s.GetGroupMessagesAsync("c", "g_chat1", null))).Status);   // người ngoài nhóm
        Assert.Equal(422, (await Svc(s => s.SendGroupMessageAsync("a", "g_chat1", "   "))).Status); Assert.Equal(422, (await Svc(s => s.SendGroupMessageAsync("a", "g_chat1", "rủ đi cá độ"))).Status);
        Assert.True((await Svc(s => s.SendGroupMessageAsync("a", "g_chat1", "  Chào cả nhóm  "))).Ok); await Task.Delay(15); Assert.True((await Svc(s => s.SendGroupMessageAsync("b", "g_chat1", "Chào bạn"))).Ok);
        var all = (JsonArray)J(await Svc(s => s.GetGroupMessagesAsync("b", "g_chat1", null)))!["messages"]!; Assert.Equal(new[] { "Chào cả nhóm", "Chào bạn" }, all.Select(m => (string)m!["text"]!).ToArray()); Assert.Equal(new[] { "a", "b" }, all.Select(m => (string)m!["by"]!).ToArray());
        var firstAt = (long)all[0]!["at"]!; var later = (JsonArray)J(await Svc(s => s.GetGroupMessagesAsync("a", "g_chat1", firstAt)))!["messages"]!; Assert.Single(later); Assert.Equal("Chào bạn", (string)later[0]!["text"]!);
        for (int i = 0; i < 40; i++) await Svc(s => s.SendGroupMessageAsync("a", "g_chat1", "tin " + i));
        Assert.Equal(30, Db(d => d.GroupMessages.Count(m => m.UserId == "a")));                                                        // tối đa 30 tin/phút
        Assert.Equal(429, (await Svc(s => s.SendGroupMessageAsync("a", "g_chat1", "thêm"))).Status);
        await Svc(s => s.ToggleJoinGroupAsync("b", "g_chat1")); Assert.Equal(404, (await Svc(s => s.GetGroupMessagesAsync("b", "g_chat1", null))).Status);    // rời nhóm là hết quyền đọc
        Assert.True((await Svc(s => s.DeleteGroupAsync("a", false, "g_chat1"))).Ok); Assert.Equal(0, Db(d => d.GroupMessages.Count()));                          // xóa nhóm xóa luôn tin nhắn
    }

    [Fact]
    public async Task Direct_Messages_Are_Private_Marked_Read_And_Notify_Once()
    {
        Assert.Equal(422, (await Svc(s => s.SendDirectMessageAsync("a", "a", "tự nhắn"))).Status); Assert.Equal(404, (await Svc(s => s.SendDirectMessageAsync("a", "khong-co", "x"))).Status);
        Assert.True((await Svc(s => s.SendDirectMessageAsync("a", "b", "Chào B"))).Ok); Assert.True((await Svc(s => s.SendDirectMessageAsync("a", "b", "Tập chung không?"))).Ok); await Task.Delay(15); Assert.True((await Svc(s => s.SendDirectMessageAsync("b", "a", "Ok A"))).Ok);
        Assert.Equal(1, Db(d => d.Notifications.Count(n => n.UserId == "b" && n.Type == "message")));                                  // hai tin liên tiếp → một thông báo
        Assert.Equal(1, Db(d => d.Notifications.Count(n => n.UserId == "a" && n.Type == "message")));
        Assert.Equal(2, Db(d => d.DirectMessages.Count(m => m.ReceiverId == "b" && !m.IsRead)));
        var conv = (JsonArray)J(await Svc(s => s.GetDirectMessagesAsync("b", "a", null)))!["messages"]!; Assert.Equal(new[] { "Chào B", "Tập chung không?", "Ok A" }, conv.Select(m => (string)m!["text"]!).ToArray());
        Assert.Equal(0, Db(d => d.DirectMessages.Count(m => m.ReceiverId == "b" && !m.IsRead)));                                         // mở hội thoại = đã đọc
        Assert.Empty((JsonArray)J(await Svc(s => s.GetDirectMessagesAsync("c", "a", null)))!["messages"]!);                              // người thứ ba không thấy hội thoại của A và B
        Db(d => { d.Users.Find("c")!.IsActive = false; d.SaveChanges(); return 0; }); Assert.Equal(404, (await Svc(s => s.SendDirectMessageAsync("a", "c", "alo"))).Status);
    }

    [Fact]
    public async Task Stories_Validate_Expire_And_Respect_Ownership()
    {
        Assert.Equal(422, (await Svc(s => s.AddStoryAsync("a", new StoryInput { Text = "  " }))).Status);
        Assert.Equal(422, (await Svc(s => s.AddStoryAsync("a", new StoryInput { Text = "x", Img = "data:image/png;base64,AAAA" }))).Status);
        Assert.Equal(422, (await Svc(s => s.AddStoryAsync("a", new StoryInput { Text = "x", Img = "https://evil.example/a.jpg" }))).Status);
        Assert.True((await Svc(s => s.AddStoryAsync("a", new StoryInput { Id = "s_local1", Text = "  Chạy 5km  ", Img = "/media/0123456789abcdef0123456789abcdef.jpg", Hue = 200 }))).Ok);
        Assert.Equal("Chạy 5km", Db(d => d.Stories.Single().Text)); Assert.Equal("s_local1", Db(d => d.Stories.Single().ClientId)); Assert.True(Db(d => d.Stories.Single().ExpiresAt) > DateTime.UtcNow.AddHours(23));
        var snap = await Svc(s => s.GetSnapshotAsync("b", false)); var stories = (JsonArray)snap["stories"]!; Assert.Single(stories); Assert.Equal("a", (string)stories[0]!["by"]!); Assert.Equal(200, (int)stories[0]!["hue"]!);
        Db(d => { var st = d.Stories.Single(); st.ExpiresAt = DateTime.UtcNow.AddMinutes(-1); d.SaveChanges(); return 0; });
        Assert.Empty((JsonArray)(await Svc(s => s.GetSnapshotAsync("b", false)))["stories"]!);                                           // hết 24 giờ thì biến mất
        Assert.True((await Svc(s => s.AddStoryAsync("b", new StoryInput { Id = "s_b1", Text = "của B" }))).Ok);
        Assert.Equal(404, (await Svc(s => s.DeleteStoryAsync("a", false, "s_b1"))).Status); Assert.True((await Svc(s => s.DeleteStoryAsync("c", true, "s_b1"))).Ok);                   // người khác không xóa được; nhân sự xóa được
        Assert.True((await Svc(s => s.AddStoryAsync("a", new StoryInput { Id = "s_a2", Text = "của A" }))).Ok); Assert.True((await Svc(s => s.DeleteStoryAsync("a", false, "s_a2"))).Ok);
        for (int i = 0; i < 25; i++) await Svc(s => s.AddStoryAsync("c", new StoryInput { Text = "story " + i }));
        Assert.Equal(20, Db(d => d.Stories.Count(x => x.UserId == "c")));                                                                  // tối đa 20 story/24 giờ
    }
}