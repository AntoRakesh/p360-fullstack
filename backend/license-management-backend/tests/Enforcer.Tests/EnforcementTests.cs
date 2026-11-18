using System.Text;
using Enforcer.Core;
using Licensing.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace Enforcer.Tests;

public class ImportTests
{
    [Fact]
    public async Task Valid_license_imports_and_unlocks_granted_module()
    {
        using var rig = new Rig();
        var r = await rig.Engine.ImportAsync(rig.File());
        Assert.True(r.Ok, r.Message);
        Assert.True((await rig.Engine.EvaluateAsync("time-attendance")).Allowed);
    }

    [Fact]
    public async Task Edited_payload_is_rejected()
    {
        using var rig = new Rig();
        var env = EnvelopeCodec.TryRead(rig.File())!;
        var json = Encoding.UTF8.GetString(Convert.FromBase64String(env.Payload));
        var forged = json.Replace("2026-07-01", "2099-07-01"); // push validUntil forward
        Assert.NotEqual(json, forged);
        var file = EnvelopeCodec.Write(env with { Payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(forged)) });

        var r = await rig.Engine.ImportAsync(file);
        Assert.Equal(LicenseCode.InvalidSignature, r.Code);
    }

    [Fact]
    public async Task License_signed_by_another_key_is_rejected()
    {
        using var rig = new Rig();
        using var attacker = new FakeIssuer();
        var r = await rig.Engine.ImportAsync(attacker.Sign(rig.Payload()));
        Assert.Equal(LicenseCode.InvalidSignature, r.Code);
    }

    [Fact]
    public async Task Older_revision_after_newer_is_rejected()
    {
        using var rig = new Rig();
        var r1 = rig.File(1);
        Assert.True((await rig.Engine.ImportAsync(rig.File(2))).Ok);
        var r = await rig.Engine.ImportAsync(r1);
        Assert.Equal(LicenseCode.Rollback, r.Code);
    }

    [Fact]
    public async Task Rollback_still_rejected_when_one_state_store_is_wiped()
    {
        using var rig = new Rig();
        var r1 = rig.File(1);
        Assert.True((await rig.Engine.ImportAsync(rig.File(2))).Ok);
        rig.Store.State = null; // customer deletes the file store
        rig.NewEngine();
        Assert.Equal(LicenseCode.Rollback, (await rig.Engine.ImportAsync(r1)).Code);
    }

    [Fact]
    public async Task License_copied_to_another_machine_is_rejected()
    {
        using var rig = new Rig();
        rig.HostFingerprint = "hf1_" + new string('b', 64);
        rig.NewEngine();
        var r = await rig.Engine.ImportAsync(rig.File());
        Assert.Equal(LicenseCode.HostMismatch, r.Code);
    }

    [Fact]
    public async Task Gate_blocks_when_installed_license_is_moved_to_another_machine()
    {
        using var rig = new Rig();
        Assert.True((await rig.Engine.ImportAsync(rig.File())).Ok);
        rig.HostFingerprint = "hf1_" + new string('c', 64);
        rig.NewEngine();
        // Copied state also fails its MAC on the new host when no explicit key is set; here the key is explicit, so the host check catches it.
        Assert.Equal(LicenseCode.HostMismatch, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task OnPrem_license_without_host_binding_is_rejected()
    {
        using var rig = new Rig();
        var r = await rig.Engine.ImportAsync(rig.File(1, b => b.HostFingerprint = null));
        Assert.Equal(LicenseCode.HostBindingRequired, r.Code);
    }

    [Fact]
    public async Task License_for_another_subscriber_is_rejected()
    {
        using var rig = new Rig();
        var r = await rig.Engine.ImportAsync(rig.File(1, b => b.SubscriberCode = "OTHER-0001"));
        Assert.Equal(LicenseCode.WrongSubscriber, r.Code);
    }

    [Fact]
    public async Task Build_outside_range_is_rejected()
    {
        using var rig = new Rig();
        var r = await rig.Engine.ImportAsync(rig.File(1, b => { b.MinBuild = "4.0.0"; }));
        Assert.Equal(LicenseCode.BuildOutOfRange, r.Code);
    }

    [Fact]
    public async Task Already_expired_file_is_rejected_at_import()
    {
        using var rig = new Rig();
        var r = await rig.Engine.ImportAsync(rig.File(1, b => b.ValidUntil = Rig.T0.AddDays(-1)));
        Assert.Equal(LicenseCode.Expired, r.Code);
    }
}

public class GateTests
{
    private static async Task<Rig> Installed(Action<EnforcerOptions>? cfg = null)
    {
        var rig = new Rig(cfg);
        var r = await rig.Engine.ImportAsync(rig.File());
        Assert.True(r.Ok, r.Message);
        return rig;
    }

    [Fact]
    public async Task Expired_license_with_no_tampering_is_blocked()
    {
        using var rig = await Installed();
        rig.Time.Advance(TimeSpan.FromDays(31));
        var d = await rig.Engine.EvaluateAsync("time-attendance");
        Assert.False(d.Allowed);
        Assert.Equal(LicenseCode.Expired, d.Code);
        Assert.Equal("License expired — contact your vendor to renew.", d.Message);
    }

    [Fact]
    public async Task Setting_clock_back_past_validUntil_is_still_blocked()
    {
        using var rig = await Installed();
        rig.Time.Advance(TimeSpan.FromDays(31));
        await rig.Engine.EvaluateAsync(null); // engine sees the real date once
        rig.Time.Now = Rig.T0.AddDays(10);     // customer sets clock back
        Assert.Equal(LicenseCode.ClockTampered, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Clock_set_back_while_service_was_stopped_is_detected_after_restart()
    {
        using var rig = await Installed();
        rig.Time.Advance(TimeSpan.FromDays(31));
        await rig.Engine.EvaluateAsync(null);    // high-water persisted
        rig.Time.Now = Rig.T0.AddDays(10);
        rig.NewEngine();                          // restart
        Assert.Equal(LicenseCode.ClockTampered, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Small_clock_corrections_are_tolerated()
    {
        using var rig = await Installed();
        rig.Time.Advance(TimeSpan.FromHours(1));
        await rig.Engine.EvaluateAsync(null);
        rig.Time.Advance(TimeSpan.FromMinutes(-3));
        Assert.True((await rig.Engine.EvaluateAsync(null)).Allowed);
    }

    [Fact]
    public async Task Module_not_in_license_is_blocked()
    {
        using var rig = await Installed();
        Assert.Equal(LicenseCode.ModuleNotLicensed, (await rig.Engine.EvaluateAsync("digital-twin")).Code);
    }

    [Fact]
    public async Task Module_with_passed_moduleValidUntil_is_blocked()
    {
        using var rig = new Rig();
        await rig.Engine.ImportAsync(rig.File(1, b => b.Modules =
        [
            new() { ModuleKey = "time-attendance" },
            new() { ModuleKey = "real-time-location", ModuleValidUntil = Rig.T0.AddDays(5) },
        ]));
        rig.Time.Advance(TimeSpan.FromDays(6));
        Assert.Equal(LicenseCode.ModuleExpired, (await rig.Engine.EvaluateAsync("real-time-location")).Code);
        Assert.True((await rig.Engine.EvaluateAsync("time-attendance")).Allowed);
    }

    [Fact]
    public async Task Editing_stored_state_by_hand_locks_the_license()
    {
        using var rig = await Installed();
        rig.Store.State = rig.Store.State! with { HighestRevision = 0 }; // DB edit without valid MAC
        rig.NewEngine();
        Assert.Equal(LicenseCode.StateTampered, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Editing_last_checkin_time_is_detected_even_with_a_valid_mac()
    {
        using var rig = await Installed(o => o.RemoteCheckIn.Enabled = true);
        Assert.True(await rig.Engine.AcceptReceiptAsync(rig.Receipt(Rig.T0)));
        rig.Time.Advance(TimeSpan.FromDays(10)); // check-in overdue (grace 7 days)
        Assert.Equal(LicenseCode.CheckinOverdue, (await rig.Engine.EvaluateAsync(null)).Code);

        // Attacker knows the MAC key and rewrites the stored check-in time.
        var loaded = await rig.Repo.LoadAsync();
        await rig.Repo.SaveAsync(loaded.State with { ReceiptServerTime = rig.Time.Now });
        rig.NewEngine();
        Assert.Equal(LicenseCode.CheckinInvalid, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Fresh_signed_receipt_keeps_license_alive()
    {
        using var rig = await Installed(o => o.RemoteCheckIn.Enabled = true);
        rig.Time.Advance(TimeSpan.FromDays(6));
        Assert.True(await rig.Engine.AcceptReceiptAsync(rig.Receipt(rig.Time.Now)));
        rig.Time.Advance(TimeSpan.FromDays(6));
        Assert.True((await rig.Engine.EvaluateAsync(null)).Allowed);
    }

    [Fact]
    public async Task Forged_receipt_is_ignored()
    {
        using var rig = await Installed(o => o.RemoteCheckIn.Enabled = true);
        using var attacker = new FakeIssuer();
        var forged = attacker.Sign(new CheckinReceipt
        {
            SubscriberCode = Rig.Subscriber, State = EntitlementState.Live, LatestRevision = 1,
            ValidUntil = Rig.T0.AddYears(5), ServerTime = Rig.T0, Nonce = "x",
        });
        Assert.False(await rig.Engine.AcceptReceiptAsync(forged));
    }

    [Fact]
    public async Task Revoked_or_suspended_receipt_blocks()
    {
        using var rig = await Installed();
        Assert.True(await rig.Engine.AcceptReceiptAsync(rig.Receipt(Rig.T0, EntitlementState.Revoked)));
        Assert.Equal(LicenseCode.RemoteRevoked, (await rig.Engine.EvaluateAsync(null)).Code);

        Assert.True(await rig.Engine.AcceptReceiptAsync(rig.Receipt(Rig.T0.AddMinutes(1), EntitlementState.Suspended)));
        Assert.Equal(LicenseCode.RemoteSuspended, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Older_receipt_cannot_replace_newer_one()
    {
        using var rig = await Installed();
        Assert.True(await rig.Engine.AcceptReceiptAsync(rig.Receipt(Rig.T0.AddMinutes(5), EntitlementState.Suspended)));
        Assert.False(await rig.Engine.AcceptReceiptAsync(rig.Receipt(Rig.T0, EntitlementState.Live)));
    }

    [Fact]
    public async Task No_license_blocks()
    {
        using var rig = new Rig();
        Assert.Equal(LicenseCode.NoLicense, (await rig.Engine.EvaluateAsync(null)).Code);
    }

    [Fact]
    public async Task Middleware_returns_403_with_clear_message()
    {
        using var rig = await Installed();
        rig.Time.Advance(TimeSpan.FromDays(31));
        var mw = new LicenseGateMiddleware(_ => Task.CompletedTask, rig.Engine, Options.Create(rig.Options), new ModuleKeyResolver());
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = "/api/time-attendance/records";
        ctx.Response.Body = new MemoryStream();

        await mw.InvokeAsync(ctx);

        Assert.Equal(403, ctx.Response.StatusCode);
        ctx.Response.Body.Position = 0;
        var body = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
        Assert.Contains("License expired", body);
    }

    [Fact]
    public async Task Middleware_lets_exempt_paths_through()
    {
        using var rig = new Rig(); // no license at all
        var called = false;
        var mw = new LicenseGateMiddleware(_ => { called = true; return Task.CompletedTask; }, rig.Engine, Options.Create(rig.Options), new ModuleKeyResolver());
        var ctx = new DefaultHttpContext();
        ctx.Request.Path = "/api/license/import";
        await mw.InvokeAsync(ctx);
        Assert.True(called);
    }
}

public class SplitModeGuardTests
{
    [Theory]
    [InlineData("mongodb://localhost:27017/lic")]
    [InlineData("mongodb://127.0.0.1/lic")]
    [InlineData("mongodb://user:pw@10.1.2.3:27017/lic")]
    [InlineData("mongodb://192.168.1.20/lic")]
    [InlineData("mongodb://172.20.0.5/lic")]
    [InlineData("mongodb://[::1]:27017/lic")]
    [InlineData("mongodb://dbserver/lic")]
    [InlineData("mongodb://db.local/lic")]
    [InlineData("")]
    public void Local_or_private_license_db_fails_startup(string cs) =>
        Assert.Throws<InvalidOperationException>(() => SplitModeGuard.EnsureVendorSide(cs, _ => []));

    [Fact]
    public void Hostname_resolving_to_private_address_fails() =>
        Assert.Throws<InvalidOperationException>(() =>
            SplitModeGuard.EnsureVendorSide("mongodb://license.customer.com/lic", _ => [System.Net.IPAddress.Parse("10.0.0.9")]));

    [Fact]
    public void Vendor_hosted_db_passes() =>
        SplitModeGuard.EnsureVendorSide("mongodb+srv://u:p@licensing.vendor.example.com/lic?retryWrites=true",
            _ => [System.Net.IPAddress.Parse("203.0.113.10")]);
}
