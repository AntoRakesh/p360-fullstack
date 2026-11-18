using Issuer.Api.Data;
using MongoDB.Driver;

namespace Issuer.Api.Services;

/// <summary>Break-glass reset: admin password from config, TOTP re-enrollment at next login.</summary>
public static class AdminReset
{
    public static async Task<int> RunAsync(MongoContext db, AdminSeedOptions seed)
    {
        if (string.IsNullOrWhiteSpace(seed.Username) || seed.Password.Length < 12)
        {
            Console.Error.WriteLine("Set Issuer:AdminSeed:Username and Issuer:AdminSeed:Password (min 12 chars) first, e.g. ./scripts/dev-setup.sh");
            return 1;
        }
        var username = seed.Username.Trim();
        await db.Admins.UpdateOneAsync(
            a => a.Username == username,
            Builders<AdminUser>.Update
                .Set(a => a.PasswordHash, BCrypt.Net.BCrypt.EnhancedHashPassword(seed.Password, 12))
                .Set(a => a.TotpSecretProtected, null)
                .Set(a => a.TotpEnrolled, false)
                .Set(a => a.LastTotpStep, 0)
                .Set(a => a.FailedLogins, 0)
                .Set(a => a.LockedUntil, null)
                .SetOnInsert(a => a.Roles, [Roles.LicenseAdmin])
                .SetOnInsert(a => a.CreatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
        await db.Audit.InsertOneAsync(new AuditDoc { Who = "cli", Action = "auth.admin_reset", After = $"{{\"username\":\"{username}\"}}", At = DateTime.UtcNow });
        Console.WriteLine($"Admin '{username}' reset. Log in with the seed password and set up the authenticator again.");
        return 0;
    }
}
