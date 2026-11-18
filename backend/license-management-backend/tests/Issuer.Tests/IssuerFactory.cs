using System.Net.Http.Headers;
using System.Net.Http.Json;
using Issuer.Api.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using OtpNet;

namespace Issuer.Tests;

/// <summary>Runs Issuer.Api against a throwaway database on the local MongoDB.</summary>
public sealed class IssuerFactory : WebApplicationFactory<Program>
{
    public const string AdminUser = "admin";
    public const string AdminPassword = "correct-horse-battery";
    public string DbName { get; } = "p360_issuer_test_" + Guid.NewGuid().ToString("N")[..8];
    public string PublicKey { get; }
    public string? TotpSecret { get; private set; }
    public string? LastUsedCode { get; private set; }

    private readonly string _privateKey;
    private readonly string _mailDir = Path.Combine(Path.GetTempPath(), "p360-issuer-test-mail-" + Guid.NewGuid().ToString("N")[..8]);
    private readonly SemaphoreSlim _loginLock = new(1, 1);
    private HttpClient? _admin;

    public IssuerFactory() => (_privateKey, PublicKey) = EntitlementSigner.Generate();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:IssuerDb", $"mongodb://localhost:27017/{DbName}");
        builder.UseSetting("Issuer:SigningKey", _privateKey);
        builder.UseSetting("Issuer:Jwt:Key", "test-jwt-key-that-is-long-enough-1234567890");
        builder.UseSetting("Issuer:AdminSeed:Username", AdminUser);
        builder.UseSetting("Issuer:AdminSeed:Password", AdminPassword);
        builder.UseSetting("Issuer:Smtp:PickupDirectory", _mailDir);
    }

    public TokenService Tokens => Services.GetRequiredService<TokenService>();
    public string MailDir => _mailDir;

    /// <summary>One full login per factory (password → TOTP enrollment → access token), then reused.</summary>
    public async Task<HttpClient> AdminClientAsync()
    {
        await _loginLock.WaitAsync();
        try
        {
            if (_admin is not null) return _admin;
            var c = CreateClient();
            var login = await PostJson<LoginResponse>(c, "/api/auth/login", new { username = AdminUser, password = AdminPassword });
            TotpSecret = login.Secret ?? throw new InvalidOperationException("Expected TOTP enrollment on first login.");
            LastUsedCode = new Totp(Base32Encoding.ToBytes(TotpSecret)).ComputeTotp(DateTime.UtcNow);
            var mfa = await PostJson<MfaResponse>(c, "/api/auth/mfa", new { mfaToken = login.MfaToken, code = LastUsedCode });
            c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", mfa.AccessToken);
            return _admin = c;
        }
        finally { _loginLock.Release(); }
    }

    private static async Task<T> PostJson<T>(HttpClient c, string url, object body)
    {
        var res = await c.PostAsJsonAsync(url, body);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<T>())!;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            try { new MongoClient("mongodb://localhost:27017").DropDatabase(DbName); } catch { /* best effort */ }
            try { Directory.Delete(_mailDir, true); } catch { /* best effort */ }
        }
        base.Dispose(disposing);
    }

    public sealed record LoginResponse(string MfaToken, bool EnrollRequired, string? OtpauthUri, string? Secret);
    public sealed record MfaResponse(string AccessToken, DateTime ExpiresAt);
}
