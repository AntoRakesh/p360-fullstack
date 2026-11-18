using System.Text;
using Licensing.Contracts;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Enforcer.Core;

public enum LicenseCode
{
    Ok,
    NoLicense,
    StateTampered,
    InvalidSignature,
    WrongSubscriber,
    HostMismatch,
    HostBindingRequired,
    BuildOutOfRange,
    Rollback,
    ClockTampered,
    NotLive,
    Expired,
    NotYetValid,
    ModuleNotLicensed,
    ModuleExpired,
    CheckinOverdue,
    CheckinInvalid,
    RemoteSuspended,
    RemoteRevoked,
}

public sealed record GateDecision(bool Allowed, LicenseCode Code, string Message)
{
    public static readonly GateDecision Allow = new(true, LicenseCode.Ok, "OK");
}

public sealed record ImportResult(bool Ok, LicenseCode Code, string Message, EntitlementPayload? Payload = null);

public sealed record LicenseStatus(
    GateDecision Decision,
    EntitlementPayload? Entitlement,
    DateTime TrustedNow,
    int? DaysLeft,
    CheckinReceipt? LastReceipt,
    bool NewerRevisionAvailable,
    string HostFingerprint);

/// <summary>
/// The customer-side brain. Decisions come only from the signed license and signed
/// Issuer receipts, never from editable database fields.
/// </summary>
public sealed class LicenseEngine
{
    public const string ExpiredMessage = "License expired — contact your vendor to renew.";

    private readonly EnforcerOptions _o;
    private readonly SignatureVerifier _verifier;
    private readonly StateRepository _repo;
    private readonly IHostFingerprintProvider _host;
    private readonly TimeProvider _time;
    private readonly ILogger<LicenseEngine> _log;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private Snapshot? _snapshot;
    private DateTime _highWater;
    private DateTime _persistedHighWater;

    private sealed record Snapshot(
        EntitlementPayload? Payload,
        CheckinReceipt? Receipt,
        GateDecision? Failure,
        DateTime LoadedAt);

    public LicenseEngine(
        IOptions<EnforcerOptions> options,
        SignatureVerifier verifier,
        StateRepository repo,
        IHostFingerprintProvider host,
        TimeProvider time,
        ILogger<LicenseEngine> log)
    {
        _o = options.Value;
        _verifier = verifier;
        _repo = repo;
        _host = host;
        _time = time;
        _log = log;
    }

    // ------------------------------------------------------------------ gate

    public async Task<GateDecision> EvaluateAsync(string? moduleKey, CancellationToken ct = default)
    {
        var snap = await GetSnapshotAsync(ct);
        if (snap.Failure is not null) return snap.Failure;
        var p = snap.Payload!;

        var (clockOk, now) = await ObserveClockAsync(ct);
        if (!clockOk) return Deny(LicenseCode.ClockTampered, "System clock was moved backwards. Licensed features are locked until the clock is corrected.");
        if (now.AddMinutes(_o.ClockToleranceMinutes) < p.IssuedAt)
            return Deny(LicenseCode.ClockTampered, "System clock is earlier than the license issue date. Correct the clock.");

        if (p.State != EntitlementState.Live) return Deny(LicenseCode.NotLive, $"License is {p.State}. Contact your vendor.");
        if (now < p.ValidFrom) return Deny(LicenseCode.NotYetValid, $"License starts on {p.ValidFrom:yyyy-MM-dd}.");
        if (p.ValidUntil < now) return Deny(LicenseCode.Expired, ExpiredMessage);

        var remote = CheckRemote(snap.Receipt, now);
        if (remote is not null) return remote;

        if (moduleKey is not null)
        {
            var grant = p.Modules.FirstOrDefault(m => string.Equals(m.ModuleKey, moduleKey, StringComparison.Ordinal));
            if (grant is null) return Deny(LicenseCode.ModuleNotLicensed, $"Module '{moduleKey}' is not included in your license.");
            if (grant.ModuleValidUntil is { } mvu && mvu < now)
                return Deny(LicenseCode.ModuleExpired, $"Module '{moduleKey}' license expired — contact your vendor to renew.");
        }
        return GateDecision.Allow;
    }

    public async Task<LicenseStatus> GetStatusAsync(CancellationToken ct = default)
    {
        var decision = await EvaluateAsync(null, ct);
        var snap = _snapshot;
        var now = TrustedNow();
        var p = snap?.Payload;
        return new LicenseStatus(
            decision,
            p,
            now,
            p is null ? null : (int)Math.Floor((p.ValidUntil - now).TotalDays),
            snap?.Receipt,
            p is not null && snap?.Receipt is { } r && r.LatestRevision > p.Revision,
            _host.GetFingerprint());
    }

    /// <summary>Feature flags of the verified license, or null when the gate would block.</summary>
    public async Task<EntitlementPayload?> GetVerifiedAsync(CancellationToken ct = default)
    {
        var d = await EvaluateAsync(null, ct);
        return d.Allowed ? _snapshot?.Payload : null;
    }

    public void InvalidateCache() => _snapshot = null;

    // ------------------------------------------------------------------ import

    public async Task<ImportResult> ImportAsync(byte[] fileBytes, CancellationToken ct = default)
    {
        var verified = _verifier.Verify<EntitlementPayload>(fileBytes);
        if (verified is null) return Fail(LicenseCode.InvalidSignature, "License file is not valid or was modified.");
        var p = verified.Value;

        var bindCheck = CheckBinding(p);
        if (bindCheck is not null) return Fail(bindCheck.Code, bindCheck.Message);
        if (p.State != EntitlementState.Live) return Fail(LicenseCode.NotLive, $"License file state is {p.State}.");

        await _lock.WaitAsync(ct);
        try
        {
            var loaded = await _repo.LoadAsync(ct);
            if (loaded.Tampered) return Fail(LicenseCode.StateTampered, "Local license state was modified. Contact your vendor.");
            var s = loaded.State;

            if (p.Revision < s.HighestRevision)
                return Fail(LicenseCode.Rollback, $"Revision {p.Revision} is older than revision {s.HighestRevision} already installed.");
            var raw = Convert.ToBase64String(fileBytes);
            if (p.Revision == s.HighestRevision && s.RawEntitlement is not null && s.RawEntitlement != raw)
                return Fail(LicenseCode.Rollback, $"A different license with revision {p.Revision} is already installed.");

            var realNow = _time.GetUtcNow().UtcDateTime;
            var highWater = Max(_highWater, s.ClockHighWater);
            if (realNow.AddMinutes(_o.ClockToleranceMinutes) < highWater || realNow.AddMinutes(_o.ClockToleranceMinutes) < p.IssuedAt)
                return Fail(LicenseCode.ClockTampered, "System clock is behind. Correct the clock and try again.");
            var now = Max(realNow, highWater);
            if (p.ValidUntil < now) return Fail(LicenseCode.Expired, ExpiredMessage);

            await _repo.SaveAsync(s with
            {
                RawEntitlement = raw,
                HighestRevision = p.Revision,
                ClockHighWater = now,
            }, ct);
            _highWater = _persistedHighWater = now;
            _snapshot = null;
            _log.LogInformation("Imported license {Subscriber} revision {Revision}, valid until {ValidUntil:o}", p.SubscriberCode, p.Revision, p.ValidUntil);
            return new ImportResult(true, LicenseCode.Ok, $"License revision {p.Revision} installed.", p);
        }
        finally { _lock.Release(); }
    }

    // ------------------------------------------------------------------ receipts

    /// <summary>Stores a signed Issuer receipt (from ping or check-in). Unsigned or foreign receipts are ignored.</summary>
    public async Task<bool> AcceptReceiptAsync(byte[] envelopeBytes, CancellationToken ct = default)
    {
        var verified = _verifier.Verify<CheckinReceipt>(envelopeBytes);
        if (verified is null) return false;
        var r = verified.Value;
        if (!string.Equals(r.SubscriberCode, _o.SubscriberCode, StringComparison.Ordinal)) return false;
        if (r.HostFingerprint is not null && r.HostFingerprint != _host.GetFingerprint()) return false;

        await _lock.WaitAsync(ct);
        try
        {
            var loaded = await _repo.LoadAsync(ct);
            if (loaded.Tampered) return false;
            var s = loaded.State;
            if (s.ReceiptServerTime is { } prev && r.ServerTime <= prev) return false; // replay of an older receipt
            // Server time is trusted, so it also pushes the clock high-water forward.
            var hw = Max(Max(s.ClockHighWater, _highWater), r.ServerTime);
            await _repo.SaveAsync(s with
            {
                RawReceipt = Convert.ToBase64String(envelopeBytes),
                ReceiptServerTime = r.ServerTime,
                ClockHighWater = hw,
            }, ct);
            _highWater = _persistedHighWater = hw;
            _snapshot = null;
            return true;
        }
        finally { _lock.Release(); }
    }

    public string CreateActivationRequest() => EnvelopeCodec.WriteActivationRequest(new ActivationRequest
    {
        SubscriberCode = string.IsNullOrWhiteSpace(_o.SubscriberCode) ? null : _o.SubscriberCode,
        HostFingerprint = _host.GetFingerprint(),
        ProductBuild = _o.ProductBuild,
        Hostname = Environment.MachineName,
        RequestedAt = _time.GetUtcNow().UtcDateTime,
    });

    // ------------------------------------------------------------------ internals

    private async Task<Snapshot> GetSnapshotAsync(CancellationToken ct)
    {
        var snap = _snapshot;
        var realNow = _time.GetUtcNow().UtcDateTime;
        if (snap is not null && realNow >= snap.LoadedAt && realNow - snap.LoadedAt < TimeSpan.FromMinutes(_o.CacheMinutes))
            return snap;

        await _lock.WaitAsync(ct);
        try
        {
            snap = _snapshot;
            if (snap is not null && realNow >= snap.LoadedAt && realNow - snap.LoadedAt < TimeSpan.FromMinutes(_o.CacheMinutes))
                return snap;
            snap = await LoadSnapshotAsync(realNow, ct);
            _snapshot = snap;
            return snap;
        }
        finally { _lock.Release(); }
    }

    private async Task<Snapshot> LoadSnapshotAsync(DateTime realNow, CancellationToken ct)
    {
        Snapshot Failed(LicenseCode c, string m) => new(null, null, Deny(c, m), realNow);

        var loaded = await _repo.LoadAsync(ct);
        if (loaded.Tampered)
        {
            _log.LogWarning("License state store '{Store}' failed its integrity check", loaded.TamperedStore);
            return Failed(LicenseCode.StateTampered, "Local license state was modified. Licensed features are locked. Contact your vendor.");
        }
        var s = loaded.State;
        _highWater = Max(_highWater, s.ClockHighWater);
        _persistedHighWater = Max(_persistedHighWater, s.ClockHighWater);

        if (s.RawEntitlement is null) return Failed(LicenseCode.NoLicense, "No license installed. Import a license file from your vendor.");

        var bytes = EnvelopeCodec.TryDecodeBase64(s.RawEntitlement);
        var verified = bytes is null ? null : _verifier.Verify<EntitlementPayload>(bytes);
        if (verified is null) return Failed(LicenseCode.InvalidSignature, "Installed license is not valid or was modified.");
        var p = verified.Value;

        var bind = CheckBinding(p);
        if (bind is not null) return new(null, null, bind, realNow);
        if (p.Revision < s.HighestRevision) return Failed(LicenseCode.Rollback, "Installed license is older than one already accepted.");
        if (p.HostingMode == HostingMode.Split)
        {
            try { SplitModeGuard.EnsureVendorSide(_o.LicenseDbConnectionString); }
            catch (InvalidOperationException ex) { return Failed(LicenseCode.StateTampered, ex.Message); }
        }

        CheckinReceipt? receipt = null;
        if (s.RawReceipt is not null)
        {
            var rb = EnvelopeCodec.TryDecodeBase64(s.RawReceipt);
            var rv = rb is null ? null : _verifier.Verify<CheckinReceipt>(rb);
            if (rv is null || rv.Value.SubscriberCode != p.SubscriberCode || rv.Value.ServerTime != s.ReceiptServerTime)
                return Failed(LicenseCode.CheckinInvalid, "Stored check-in record is not valid or was modified. Licensed features are locked.");
            receipt = rv.Value;
        }
        return new Snapshot(p, receipt, null, realNow);
    }

    private GateDecision? CheckBinding(EntitlementPayload p)
    {
        if (!string.Equals(p.SubscriberCode, _o.SubscriberCode, StringComparison.Ordinal))
            return Deny(LicenseCode.WrongSubscriber, $"License is for subscriber '{p.SubscriberCode}', this install is '{_o.SubscriberCode}'.");
        if (!BuildInRange(_o.ProductBuild, p.MinBuild, p.MaxBuild))
            return Deny(LicenseCode.BuildOutOfRange, $"License covers builds {p.MinBuild ?? "any"} – {p.MaxBuild ?? "any"}; this is {_o.ProductBuild}.");
        if (p.HostFingerprint is null)
        {
            if (p.HostingMode == HostingMode.OnPrem && _o.RequireHostBindingOnPrem)
                return Deny(LicenseCode.HostBindingRequired, "On-premise license must be bound to this machine. Send an activation request to your vendor.");
        }
        else if (!string.Equals(p.HostFingerprint, _host.GetFingerprint(), StringComparison.Ordinal))
        {
            return Deny(LicenseCode.HostMismatch, "License is bound to a different machine.");
        }
        return null;
    }

    private GateDecision? CheckRemote(CheckinReceipt? r, DateTime now)
    {
        if (r is not null)
        {
            if (r.State == EntitlementState.Revoked) return Deny(LicenseCode.RemoteRevoked, "License was revoked by your vendor.");
            if (r.State == EntitlementState.Suspended) return Deny(LicenseCode.RemoteSuspended, "License is suspended. Contact your vendor.");
            if (r.State == EntitlementState.Expired) return Deny(LicenseCode.Expired, ExpiredMessage);
        }
        if (!_o.RemoteCheckIn.Enabled) return null;
        if (r is null || r.ServerTime.AddDays(_o.RemoteCheckIn.GraceDays) < now)
            return Deny(LicenseCode.CheckinOverdue, $"Could not reach the license server for more than {_o.RemoteCheckIn.GraceDays} days. Check the network connection.");
        return null;
    }

    /// <summary>Returns (ok, trustedNow). Persists the high-water mark at most once a minute.</summary>
    private async Task<(bool, DateTime)> ObserveClockAsync(CancellationToken ct)
    {
        var realNow = _time.GetUtcNow().UtcDateTime;
        var hw = _highWater;
        if (realNow.AddMinutes(_o.ClockToleranceMinutes) < hw) return (false, hw);
        if (realNow <= hw) return (true, hw);

        _highWater = realNow;
        if (realNow - _persistedHighWater > TimeSpan.FromMinutes(1))
        {
            await _lock.WaitAsync(ct);
            try
            {
                var loaded = await _repo.LoadAsync(ct);
                if (!loaded.Tampered && loaded.State.ClockHighWater < realNow)
                {
                    await _repo.SaveAsync(loaded.State with { ClockHighWater = realNow }, ct);
                    _persistedHighWater = realNow;
                }
            }
            finally { _lock.Release(); }
        }
        return (true, realNow);
    }

    private DateTime TrustedNow() => Max(_time.GetUtcNow().UtcDateTime, _highWater);

    internal static bool BuildInRange(string build, string? min, string? max)
    {
        if (min is null && max is null) return true;
        if (!Version.TryParse(build, out var b)) return false;
        if (min is not null && (!Version.TryParse(min, out var lo) || b < lo)) return false;
        if (max is not null && (!Version.TryParse(max, out var hi) || b > hi)) return false;
        return true;
    }

    private static GateDecision Deny(LicenseCode c, string m) => new(false, c, m);
    private static ImportResult Fail(LicenseCode c, string m) => new(false, c, m);
    private static DateTime Max(DateTime a, DateTime b) => a >= b ? a : b;
}
