using Issuer.Api.Data;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Issuer.Api.Services;

/// <summary>Marks Live rows past validUntil as Expired. Does not depend on customer heartbeats.</summary>
public sealed class ExpirySweeper(IServiceScopeFactory scopes, IOptions<IssuerOptions> options, ILogger<ExpirySweeper> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, options.Value.ExpirySweepMinutes)));
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var n = await scope.ServiceProvider.GetRequiredService<EntitlementService>().ExpireDueAsync(stoppingToken);
                if (n > 0) log.LogInformation("Expiry sweep: {Count} license(s) expired", n);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Expiry sweep failed");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

/// <summary>Creates indexes and the first admin (from Issuer:AdminSeed) when no admin exists.</summary>
public sealed class StartupInitializer(MongoContext db, IOptions<IssuerOptions> options, ILogger<StartupInitializer> log) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        await db.EnsureIndexesAsync(ct);
        if (await db.Admins.Find(_ => true).AnyAsync(ct)) return;

        var seed = options.Value.AdminSeed;
        if (string.IsNullOrWhiteSpace(seed.Username) || string.IsNullOrWhiteSpace(seed.Password))
        {
            log.LogWarning("No admin user exists. Set Issuer__AdminSeed__Username and Issuer__AdminSeed__Password once to create one.");
            return;
        }
        if (seed.Password.Length < 12) throw new InvalidOperationException("Issuer:AdminSeed:Password must be at least 12 characters.");

        await db.Admins.InsertOneAsync(new AdminUser
        {
            Username = seed.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.EnhancedHashPassword(seed.Password, 12),
            Roles = [Roles.LicenseAdmin],
        }, cancellationToken: ct);
        log.LogInformation("Seeded admin '{User}'. TOTP enrollment happens at first login. Remove the seed password from configuration now.", seed.Username);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
