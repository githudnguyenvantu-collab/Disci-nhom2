using Disci.Web.Models.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Disci.Web.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<BodyMetric> BodyMetrics => Set<BodyMetric>();
    public DbSet<HealthConsent> HealthConsents => Set<HealthConsent>();
    public DbSet<HealthRecord> HealthRecords => Set<HealthRecord>();

    public DbSet<ExerciseCategory> ExerciseCategories => Set<ExerciseCategory>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<WorkoutPlan> WorkoutPlans => Set<WorkoutPlan>();
    public DbSet<WorkoutDay> WorkoutDays => Set<WorkoutDay>();
    public DbSet<WorkoutScheduleOverride> WorkoutScheduleOverrides => Set<WorkoutScheduleOverride>();
    public DbSet<WorkoutSession> WorkoutSessions => Set<WorkoutSession>();
    public DbSet<WorkoutSessionDetail> WorkoutSessionDetails => Set<WorkoutSessionDetail>();
    public DbSet<ProgressRecord> ProgressRecords => Set<ProgressRecord>();
    public DbSet<BadgeDefinition> BadgeDefinitions => Set<BadgeDefinition>();
    public DbSet<UserBadge> UserBadges => Set<UserBadge>();

    public DbSet<NutritionPlan> NutritionPlans => Set<NutritionPlan>();
    public DbSet<FoodItem> FoodItems => Set<FoodItem>();
    public DbSet<NutritionLog> NutritionLogs => Set<NutritionLog>();

    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<SavedProduct> SavedProducts => Set<SavedProduct>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<PostLike> PostLikes => Set<PostLike>();
    public DbSet<PostSave> PostSaves => Set<PostSave>();
    public DbSet<PostShare> PostShares => Set<PostShare>();
    public DbSet<Follow> Follows => Set<Follow>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<Challenge> Challenges => Set<Challenge>();
    public DbSet<ChallengeParticipant> ChallengeParticipants => Set<ChallengeParticipant>();
    public DbSet<DirectMessage> DirectMessages => Set<DirectMessage>();
    public DbSet<GroupMessage> GroupMessages => Set<GroupMessage>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Announcement> Announcements => Set<Announcement>();

    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<BackupRecord> BackupRecords => Set<BackupRecord>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<UserDataBlob> UserDataBlobs => Set<UserDataBlob>();

    /// <summary>
    /// Quy ước xóa: mặc định RESTRICT cho mọi khóa ngoại của bảng nghiệp vụ; chỉ CASCADE theo cặp (bảng con, cột FK) liệt kê dưới đây.
    /// Cách này tránh lỗi "multiple cascade paths" của SQL Server. Với quan hệ thứ cấp (ví dụ bình luận/thích của người dùng trên bài người khác)
    /// việc xóa tài khoản do AccountDeletionService xử lý tường minh (Lượt 2).
    /// </summary>
    private static readonly HashSet<(Type, string)> Cascade = new()
    {
        (typeof(UserProfile), nameof(UserProfile.UserId)),
        (typeof(WorkoutDay), nameof(WorkoutDay.PlanId)),
        (typeof(WorkoutSessionDetail), nameof(WorkoutSessionDetail.SessionId)),
        (typeof(OrderItem), nameof(OrderItem.OrderId)),
        (typeof(Comment), nameof(Comment.PostId)),
        (typeof(PostLike), nameof(PostLike.PostId)),
        (typeof(PostSave), nameof(PostSave.PostId)),
        (typeof(PostShare), nameof(PostShare.PostId)),
        (typeof(GroupMember), nameof(GroupMember.GroupId)),
        (typeof(GroupMessage), nameof(GroupMessage.GroupId)),
        (typeof(ChallengeParticipant), nameof(ChallengeParticipant.ChallengeId)),
        (typeof(UserBadge), nameof(UserBadge.BadgeId)),
        (typeof(Post), nameof(Post.UserId)),
    };

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<ApplicationUser>(e =>
        {
            e.HasOne(u => u.Profile).WithOne(p => p.User).HasForeignKey<UserProfile>(p => p.UserId);
            e.HasIndex(u => u.DeletedAt);
        });

        // Các bảng con thuộc về người dùng: khai báo FK tường minh (không cần navigation) để dùng chung quy ước xóa phía dưới.
        void UserFk<T>(System.Linq.Expressions.Expression<Func<T, object?>> fk) where T : class => b.Entity<T>().HasOne<ApplicationUser>().WithMany().HasForeignKey(fk);
        UserFk<BodyMetric>(x => x.UserId); UserFk<HealthConsent>(x => x.UserId); UserFk<HealthRecord>(x => x.UserId);
        UserFk<WorkoutPlan>(x => x.UserId); UserFk<WorkoutScheduleOverride>(x => x.UserId); UserFk<WorkoutSession>(x => x.UserId);
        UserFk<ProgressRecord>(x => x.UserId); UserFk<UserBadge>(x => x.UserId);
        UserFk<NutritionPlan>(x => x.UserId); UserFk<NutritionLog>(x => x.UserId);
        UserFk<SavedProduct>(x => x.UserId); UserFk<CartItem>(x => x.UserId); UserFk<Order>(x => x.UserId);
        UserFk<PostLike>(x => x.UserId); UserFk<PostSave>(x => x.UserId); UserFk<PostShare>(x => x.UserId);
        UserFk<Story>(x => x.UserId); UserFk<Group>(x => x.OwnerId); UserFk<GroupMember>(x => x.UserId);
        UserFk<ChallengeParticipant>(x => x.UserId); UserFk<Notification>(x => x.UserId);
        UserFk<Report>(x => x.ReporterId); UserFk<MediaAsset>(x => x.OwnerId); UserFk<UserDataBlob>(x => x.UserId);
        UserFk<DirectMessage>(x => x.SenderId); UserFk<DirectMessage>(x => x.ReceiverId); UserFk<GroupMessage>(x => x.UserId);
        UserFk<Follow>(x => x.FollowerId); UserFk<Follow>(x => x.FolloweeId);
        UserFk<Friendship>(x => x.UserId); UserFk<Friendship>(x => x.FriendId);

        // Khóa chính ghép
        b.Entity<UserBadge>().HasKey(x => new { x.UserId, x.BadgeId });
        b.Entity<SavedProduct>().HasKey(x => new { x.UserId, x.ProductId });
        b.Entity<CartItem>().HasKey(x => new { x.UserId, x.ProductId });
        b.Entity<PostLike>().HasKey(x => new { x.PostId, x.UserId });
        b.Entity<PostSave>().HasKey(x => new { x.PostId, x.UserId });
        b.Entity<Follow>().HasKey(x => new { x.FollowerId, x.FolloweeId });
        b.Entity<Friendship>().HasKey(x => new { x.UserId, x.FriendId });
        b.Entity<GroupMember>().HasKey(x => new { x.GroupId, x.UserId });
        b.Entity<ChallengeParticipant>().HasKey(x => new { x.ChallengeId, x.UserId });
        b.Entity<UserDataBlob>().HasKey(x => new { x.UserId, x.Key });

        // Ràng buộc duy nhất & chỉ mục
        b.Entity<BodyMetric>().HasIndex(x => new { x.UserId, x.MeasuredOn });
        b.Entity<WorkoutSession>().HasIndex(x => new { x.UserId, x.ClientId }).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<ProgressRecord>().HasIndex(x => new { x.UserId, x.WeekStart }).IsUnique();
        b.Entity<NutritionPlan>().HasIndex(x => new { x.UserId, x.PlanDate }).IsUnique();
        b.Entity<WorkoutDay>().HasIndex(x => new { x.PlanId, x.Dow }).IsUnique();
        b.Entity<WorkoutPlan>().HasIndex(x => new { x.UserId, x.Active });
        b.Entity<WorkoutSession>().HasIndex(x => new { x.UserId, x.DoneOn });
        b.Entity<NutritionLog>().HasIndex(x => new { x.UserId, x.LogDate });
        b.Entity<HealthConsent>().HasIndex(x => new { x.UserId, x.DataType });
        b.Entity<Post>().HasIndex(x => x.CreatedAt);
        b.Entity<Comment>().HasIndex(x => new { x.PostId, x.CreatedAt });
        b.Entity<Notification>().HasIndex(x => new { x.UserId, x.IsRead });
        b.Entity<AuditLog>().HasIndex(x => x.At);
        b.Entity<Report>().HasIndex(x => x.Status);
        b.Entity<Exercise>().HasIndex(x => x.CategoryKey);
        b.Entity<MediaAsset>().HasIndex(x => x.StoredName).IsUnique();
        b.Entity<Post>().HasIndex(x => x.ClientId).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Comment>().HasIndex(x => x.ClientId).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Group>().HasIndex(x => x.ClientId).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Notification>().HasIndex(x => new { x.UserId, x.CreatedAt });
        b.Entity<Announcement>().HasIndex(x => x.ClientId).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Story>().HasIndex(x => x.ClientId).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Story>().HasIndex(x => x.ExpiresAt);
        b.Entity<GroupMessage>().HasIndex(x => new { x.GroupId, x.CreatedAt });
        b.Entity<DirectMessage>().HasIndex(x => new { x.SenderId, x.ReceiverId, x.CreatedAt });
        b.Entity<MediaAsset>().HasIndex(x => new { x.OwnerId, x.ClientKey }).IsUnique().HasFilter("[ClientKey] IS NOT NULL");
        b.Entity<Order>().HasIndex(x => new { x.UserId, x.ClientId }).IsUnique().HasFilter("[ClientId] IS NOT NULL");
        b.Entity<Product>().HasIndex(x => x.CategoryKey);

        b.Entity<Exercise>().HasOne(x => x.Replacement).WithMany().HasForeignKey(x => x.ReplacementId);
        b.Entity<Report>().HasOne(x => x.Post).WithMany().HasForeignKey(x => x.PostId);

        // Quy ước xóa (áp dụng sau khi mọi quan hệ đã được khai báo). Các bảng của Identity giữ nguyên hành vi mặc định.
        foreach (var fk in b.Model.GetEntityTypes()
                     .Where(t => t.ClrType.Namespace?.StartsWith("Microsoft.AspNetCore.Identity") != true)
                     .SelectMany(t => t.GetForeignKeys()))
        {
            var key = (fk.DeclaringEntityType.ClrType, fk.Properties[0].Name);
            fk.DeleteBehavior = Cascade.Contains(key) ? DeleteBehavior.Cascade : DeleteBehavior.Restrict;
        }

        // Chủ sở hữu → dữ liệu riêng: xóa người dùng xóa luôn dữ liệu sức khỏe/tập luyện/giỏ hàng/thông báo của họ.
        foreach (var (type, prop) in new (Type, string)[]
        {
            (typeof(BodyMetric), "UserId"), (typeof(HealthConsent), "UserId"), (typeof(HealthRecord), "UserId"),
            (typeof(WorkoutPlan), "UserId"), (typeof(WorkoutScheduleOverride), "UserId"), (typeof(WorkoutSession), "UserId"),
            (typeof(ProgressRecord), "UserId"), (typeof(UserBadge), "UserId"), (typeof(NutritionPlan), "UserId"), (typeof(NutritionLog), "UserId"),
            (typeof(SavedProduct), "UserId"), (typeof(CartItem), "UserId"), (typeof(Notification), "UserId"), (typeof(Story), "UserId"),
            (typeof(GroupMember), "UserId"), (typeof(ChallengeParticipant), "UserId"), (typeof(UserDataBlob), "UserId"), (typeof(Follow), "FollowerId"), (typeof(Friendship), "UserId"),
        })
        {
            foreach (var fk in b.Model.FindEntityType(type)!.GetForeignKeys().Where(f => f.Properties[0].Name == prop && f.PrincipalEntityType.ClrType == typeof(ApplicationUser)))
                fk.DeleteBehavior = DeleteBehavior.Cascade;
        }
    }
}
