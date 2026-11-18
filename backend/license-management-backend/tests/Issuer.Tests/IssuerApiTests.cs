using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Enforcer.Core;
using Issuer.Api.Services;
using Licensing.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Issuer.Tests;

public class IssuerApiTests(IssuerFactory f) : IClassFixture<IssuerFactory>
{
    private const string Fingerprint = "hf1_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    public static TheoryData<string, string> AdminEndpoints => new()
    {
        { "GET", "/api/auth/me" },
        { "GET", "/api/catalog" },
        { "GET", "/api/dashboard" },
        { "GET", "/api/entitlements" },
        { "GET", "/api/entitlements/000000000000000000000000" },
        { "GET", "/api/entitlements/history/ACME" },
        { "POST", "/api/entitlements" },
        { "POST", "/api/entitlements/000000000000000000000000/renew" },
        { "POST", "/api/entitlements/000000000000000000000000/suspend" },
        { "POST", "/api/entitlements/000000000000000000000000/resume" },
        { "POST", "/api/entitlements/000000000000000000000000/revoke" },
        { "GET", "/api/entitlements/000000000000000000000000/file" },
        { "POST", "/api/entitlements/000000000000000000000000/install-key" },
        { "POST", "/api/activation/parse" },
        { "GET", "/api/audit" },
    };

    private static HttpRequestMessage Req(string method, string url) =>
        new(new HttpMethod(method), url) { Content = method == "POST" ? JsonContent.Create(new { }) : null };

    [Theory, MemberData(nameof(AdminEndpoints))]
    public async Task Admin_endpoint_without_token_is_401(string method, string url)
    {
        var res = await f.CreateClient().SendAsync(Req(method, url));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Theory, MemberData(nameof(AdminEndpoints))]
    public async Task Admin_endpoint_with_non_admin_token_is_403(string method, string url)
    {
        var (token, _) = f.Tokens.CreateAccessToken("viewer", ["Viewer"]);
        var req = Req(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var res = await f.CreateClient().SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Mfa_pending_token_cannot_call_admin_endpoints()
    {
        var req = Req("GET", "/api/entitlements");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", f.Tokens.CreateMfaToken(IssuerFactory.AdminUser));
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.CreateClient().SendAsync(req)).StatusCode);
    }

    [Fact]
    public async Task Customer_install_key_cannot_call_admin_endpoints()
    {
        var req = Req("GET", "/api/entitlements");
        req.Headers.Add("X-Install-Key", "p360ik_anything");
        Assert.Equal(HttpStatusCode.Unauthorized, (await f.CreateClient().SendAsync(req)).StatusCode);
    }

    [Fact]
    public async Task Wrong_password_is_rejected()
    {
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/login", new { username = IssuerFactory.AdminUser, password = "nope-nope-nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Totp_code_cannot_be_replayed()
    {
        await f.AdminClientAsync();
        var c = f.CreateClient();
        var login = await (await c.PostAsJsonAsync("/api/auth/login", new { username = IssuerFactory.AdminUser, password = IssuerFactory.AdminPassword }))
            .Content.ReadFromJsonAsync<IssuerFactory.LoginResponse>();
        Assert.False(login!.EnrollRequired);
        var res = await c.PostAsJsonAsync("/api/auth/mfa", new { mfaToken = login.MfaToken, code = f.LastUsedCode });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Create_then_renew_makes_new_revision_and_supersedes_old()
    {
        var admin = await f.AdminClientAsync();
        var created = await Create(admin);
        Assert.Equal(1, created.Revision);
        Assert.Equal(EntitlementState.Live, created.State);
        Assert.Equal(IssuerFactory.AdminUser, created.IssuedBy);
        // Core modules are always added
        Assert.Contains(created.Modules, m => m.ModuleKey == "people-identity");

        var renewRes = await admin.PostAsJsonAsync($"/api/entitlements/{created.Id}/renew", new { validUntil = DateTime.UtcNow.AddYears(2) });
        Assert.Equal(HttpStatusCode.Created, renewRes.StatusCode);
        var renewed = (await renewRes.Content.ReadFromJsonAsync<Ent>(LicensingJson.Options))!;
        Assert.Equal(2, renewed.Revision);
        Assert.NotEqual(created.Id, renewed.Id);

        var old = (await admin.GetFromJsonAsync<Ent>($"/api/entitlements/{created.Id}", LicensingJson.Options))!;
        Assert.Equal(EntitlementState.Superseded, old.State);
        Assert.Equal(created.ValidUntil, old.ValidUntil); // terms of the old row untouched

        // Renewing the superseded row again is refused
        var again = await admin.PostAsJsonAsync($"/api/entitlements/{created.Id}/renew", new { validUntil = DateTime.UtcNow.AddYears(3) });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);

        var audit = await admin.GetFromJsonAsync<JsonElement>($"/api/audit?subscriberCode={created.SubscriberCode}");
        var actions = audit.GetProperty("items").EnumerateArray().Select(a => a.GetProperty("action").GetString()).ToList();
        Assert.Contains("entitlement.create", actions);
        Assert.Contains("entitlement.renew", actions);
        Assert.Contains("entitlement.supersede", actions);

        // Renewed file was emailed
        Assert.True(Directory.EnumerateFiles(f.MailDir, "*.eml").Count() >= 2);
    }

    [Fact]
    public async Task Downloaded_file_verifies_with_public_key_and_has_signed_terms()
    {
        var admin = await f.AdminClientAsync();
        var created = await Create(admin);
        var bytes = await admin.GetByteArrayAsync($"/api/entitlements/{created.Id}/file");
        var verified = new SignatureVerifier([f.PublicKey]).Verify<EntitlementPayload>(bytes);
        Assert.NotNull(verified);
        Assert.Equal(created.SubscriberCode, verified.Value.SubscriberCode);
        Assert.Equal(Fingerprint, verified.Value.HostFingerprint);

        // Same revision always downloads the same bytes (needed for rollback protection)
        Assert.Equal(bytes, await admin.GetByteArrayAsync($"/api/entitlements/{created.Id}/file"));
    }

    [Fact]
    public async Task OnPrem_without_fingerprint_is_rejected()
    {
        var admin = await f.AdminClientAsync();
        var res = await admin.PostAsJsonAsync("/api/entitlements", Input(fingerprint: null));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Checkin_needs_install_key_and_returns_signed_receipt()
    {
        var admin = await f.AdminClientAsync();
        var created = await Create(admin);
        var key = await (await admin.PostAsync($"/api/entitlements/{created.Id}/install-key", null)).Content.ReadFromJsonAsync<JsonElement>();
        var apiKey = key.GetProperty("apiKey").GetString()!;

        var anon = f.CreateClient();
        var body = new { revision = 1, hostFingerprint = Fingerprint, build = "3.0.0" };

        var noKey = await anon.PostAsJsonAsync($"/api/checkin/{created.SubscriberCode}", body);
        Assert.Equal(HttpStatusCode.Unauthorized, noKey.StatusCode);

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/checkin/{created.SubscriberCode}") { Content = JsonContent.Create(body) };
        req.Headers.Add("X-Install-Key", apiKey);
        var ok = await anon.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var json = await ok.Content.ReadFromJsonAsync<JsonElement>();
        var env = json.GetProperty("receipt").Deserialize<SignedEnvelope>(LicensingJson.Options)!;
        var receipt = new SignatureVerifier([f.PublicKey]).Verify<CheckinReceipt>(env);
        Assert.NotNull(receipt);
        Assert.Equal(EntitlementState.Live, receipt.Value.State);

        // Key for subscriber A does not work for subscriber B
        var other = await Create(admin);
        var cross = new HttpRequestMessage(HttpMethod.Post, $"/api/checkin/{other.SubscriberCode}") { Content = JsonContent.Create(body) };
        cross.Headers.Add("X-Install-Key", apiKey);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.SendAsync(cross)).StatusCode);
    }

    [Fact]
    public async Task Suspend_resume_revoke_flow_is_audited()
    {
        var admin = await f.AdminClientAsync();
        var e = await Create(admin);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/entitlements/{e.Id}/suspend", new { reason = "" })).StatusCode);
        var s = await (await admin.PostAsJsonAsync($"/api/entitlements/{e.Id}/suspend", new { reason = "Unpaid invoice" })).Content.ReadFromJsonAsync<Ent>(LicensingJson.Options);
        Assert.Equal(EntitlementState.Suspended, s!.State);
        var r = await (await admin.PostAsJsonAsync($"/api/entitlements/{e.Id}/resume", new { reason = "Paid" })).Content.ReadFromJsonAsync<Ent>(LicensingJson.Options);
        Assert.Equal(EntitlementState.Live, r!.State);
        var v = await (await admin.PostAsJsonAsync($"/api/entitlements/{e.Id}/revoke", new { reason = "Contract ended" })).Content.ReadFromJsonAsync<Ent>(LicensingJson.Options);
        Assert.Equal(EntitlementState.Revoked, v!.State);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/entitlements/{e.Id}/renew", new { validUntil = DateTime.UtcNow.AddYears(1) })).StatusCode);
    }

    [Fact]
    public async Task Expiry_sweep_expires_rows_without_any_heartbeat()
    {
        var admin = await f.AdminClientAsync();
        var e = await Create(admin);
        // Simulate time passing: move validUntil into the past directly in the DB.
        using (var scope = f.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Issuer.Api.Data.MongoContext>();
            await MongoDB.Driver.IMongoCollectionExtensions.UpdateOneAsync(db.Entitlements, x => x.Id == e.Id,
                MongoDB.Driver.Builders<Issuer.Api.Data.EntitlementDoc>.Update.Set(x => x.ValidUntil, DateTime.UtcNow.AddMinutes(-1)));
            var n = await scope.ServiceProvider.GetRequiredService<EntitlementService>().ExpireDueAsync(default);
            Assert.True(n >= 1);
        }
        var after = await admin.GetFromJsonAsync<Ent>($"/api/entitlements/{e.Id}", LicensingJson.Options);
        Assert.Equal(EntitlementState.Expired, after!.State);
    }

    [Fact]
    public async Task Catalog_matches_tier_sheet()
    {
        var admin = await f.AdminClientAsync();
        var cat = await admin.GetFromJsonAsync<JsonElement>("/api/catalog");
        var tiers = cat.GetProperty("tiers").EnumerateArray().ToDictionary(t => t.GetProperty("tier").GetString()!, t => t.GetProperty("inclusion"));
        Assert.Equal("None", tiers["Essential"].GetProperty("patrol-guard-management").GetString());
        Assert.Equal("AddOn", tiers["Professional"].GetProperty("real-time-location").GetString());
        Assert.Equal("None", tiers["Professional"].GetProperty("workflow-automation").GetString());
        Assert.Equal("Included", tiers["Enterprise"].GetProperty("workflow-automation").GetString());
        Assert.Equal("Included", tiers["Essential"].GetProperty("contractor-vendor").GetString());
    }

    // ------------------------------------------------------------------

    private static object Input(string? fingerprint = Fingerprint) => new
    {
        customerName = "Acme Corp",
        contactEmail = "it@acme.example",
        tier = "Professional",
        modules = new[] { new { moduleKey = "time-attendance" }, new { moduleKey = "visitor-management" } },
        features = ProductCatalog.FullFeatures,
        seatLimit = 250,
        validFrom = DateTime.UtcNow.Date,
        validUntil = DateTime.UtcNow.Date.AddYears(1),
        hostingMode = "OnPrem",
        hostFingerprint = fingerprint,
    };

    private static async Task<Ent> Create(HttpClient admin)
    {
        var res = await admin.PostAsJsonAsync("/api/entitlements", Input());
        Assert.True(res.StatusCode == HttpStatusCode.Created, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<Ent>(LicensingJson.Options))!;
    }

    public sealed record Ent(string Id, string SubscriberCode, int Revision, EntitlementState State, string IssuedBy,
        DateTime ValidUntil, List<ModuleGrant> Modules);
}
