using Issuer.Api.Data;
using Issuer.Api.Security;
using Issuer.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using MongoDB.Driver;
using OtpNet;

namespace Issuer.Api.Endpoints;

public static class AuthEndpoints
{
    private const int MaxFailures = 5;
    private static readonly TimeSpan LockFor = TimeSpan.FromMinutes(15);
    private const string Generic = "Invalid username or password.";
    // Verified against when the user does not exist, so timing does not reveal valid usernames.
    private static readonly string DummyHash = BCrypt.Net.BCrypt.EnhancedHashPassword("dummy-password-for-timing", 12);

    public sealed record LoginInput(string? Username, string? Password);
    public sealed record MfaInput(string? MfaToken, string? Code);

    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").RequireRateLimiting("auth");

        g.MapPost("/login", Login).AllowAnonymous();
        g.MapPost("/mfa", Mfa).AllowAnonymous();
        g.MapGet("/me", (HttpContext ctx) => Results.Ok(new
        {
            username = ctx.User.Identity?.Name,
            roles = ctx.User.FindAll(TokenService.RoleClaim).Select(c => c.Value).ToArray(),
        }));
    }

    private static async Task<IResult> Login(LoginInput input, MongoContext db, TokenService tokens, IDataProtectionProvider dp,
        AuditService audit, TimeProvider time, HttpContext ctx, CancellationToken ct)
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString();
        var username = input.Username?.Trim() ?? "";
        var user = username.Length is > 0 and <= 100 ? await db.Admins.Find(a => a.Username == username).FirstOrDefaultAsync(ct) : null;
        var now = time.GetUtcNow().UtcDateTime;

        if (user is null)
        {
            BCrypt.Net.BCrypt.EnhancedVerify(input.Password ?? "", DummyHash);
            return Results.Problem(Generic, statusCode: 401);
        }
        if (user.LockedUntil > now)
            return Results.Problem("Account is temporarily locked after failed attempts. Try again later.", statusCode: 401);

        if (!BCrypt.Net.BCrypt.EnhancedVerify(input.Password ?? "", user.PasswordHash))
        {
            await RegisterFailureAsync(db, user, now, ct);
            await audit.WriteRawAsync(username, "auth.login_failed", null, null, ip, ct);
            return Results.Problem(Generic, statusCode: 401);
        }

        string? otpauthUri = null, secret = null;
        if (!user.TotpEnrolled)
        {
            var protector = dp.CreateProtector("totp");
            if (user.TotpSecretProtected is null)
            {
                secret = Base32Encoding.ToString(KeyGeneration.GenerateRandomKey(20));
                await db.Admins.UpdateOneAsync(a => a.Id == user.Id,
                    Builders<AdminUser>.Update.Set(a => a.TotpSecretProtected, protector.Protect(secret)), cancellationToken: ct);
            }
            else
            {
                secret = protector.Unprotect(user.TotpSecretProtected);
            }
            otpauthUri = $"otpauth://totp/{Uri.EscapeDataString("P360 License:" + user.Username)}?secret={secret}&issuer={Uri.EscapeDataString("P360 License")}&algorithm=SHA1&digits=6&period=30";
        }

        return Results.Ok(new
        {
            mfaToken = tokens.CreateMfaToken(user.Username),
            enrollRequired = !user.TotpEnrolled,
            otpauthUri,
            secret,
        });
    }

    private static async Task<IResult> Mfa(MfaInput input, MongoContext db, TokenService tokens, IDataProtectionProvider dp,
        AuditService audit, TimeProvider time, HttpContext ctx, CancellationToken ct)
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString();
        var username = tokens.ValidateMfaToken(input.MfaToken ?? "");
        if (username is null) return Results.Problem("Sign-in expired. Enter your password again.", statusCode: 401);

        var user = await db.Admins.Find(a => a.Username == username).FirstOrDefaultAsync(ct);
        var now = time.GetUtcNow().UtcDateTime;
        if (user?.TotpSecretProtected is null) return Results.Problem("Sign-in expired. Enter your password again.", statusCode: 401);
        if (user.LockedUntil > now) return Results.Problem("Account is temporarily locked after failed attempts. Try again later.", statusCode: 401);

        var secret = dp.CreateProtector("totp").Unprotect(user.TotpSecretProtected);
        var totp = new Totp(Base32Encoding.ToBytes(secret));
        var code = (input.Code ?? "").Replace(" ", "");
        long step = 0;
        var ok = code.Length == 6 && totp.VerifyTotp(now, code, out step, new VerificationWindow(previous: 1, future: 1));

        // Each code is single use: the step must be newer than the last accepted one.
        if (!ok || step <= user.LastTotpStep)
        {
            await RegisterFailureAsync(db, user, now, ct);
            await audit.WriteRawAsync(username, "auth.mfa_failed", null, null, ip, ct);
            return Results.Problem("Invalid authentication code.", statusCode: 401);
        }

        var updated = await db.Admins.UpdateOneAsync(
            a => a.Id == user.Id && a.LastTotpStep < step,
            Builders<AdminUser>.Update.Set(a => a.LastTotpStep, step).Set(a => a.TotpEnrolled, true)
                .Set(a => a.FailedLogins, 0).Set(a => a.LockedUntil, null),
            cancellationToken: ct);
        if (updated.ModifiedCount == 0) return Results.Problem("Invalid authentication code.", statusCode: 401);

        await audit.WriteRawAsync(username, user.TotpEnrolled ? "auth.login" : "auth.mfa_enrolled", null, null, ip, ct);
        var (token, expiresAt) = tokens.CreateAccessToken(user.Username, user.Roles);
        return Results.Ok(new { accessToken = token, expiresAt, user = new { username = user.Username, roles = user.Roles } });
    }

    private static Task RegisterFailureAsync(MongoContext db, AdminUser user, DateTime now, CancellationToken ct)
    {
        var failures = user.FailedLogins + 1;
        var update = failures >= MaxFailures
            ? Builders<AdminUser>.Update.Set(a => a.LockedUntil, now + LockFor).Set(a => a.FailedLogins, 0)
            : Builders<AdminUser>.Update.Inc(a => a.FailedLogins, 1);
        return db.Admins.UpdateOneAsync(a => a.Id == user.Id, update, cancellationToken: ct);
    }
}
