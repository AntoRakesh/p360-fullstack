using System.Security.Cryptography;
using Enforcer.Core;
using Licensing.Contracts;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSec.Cryptography;

namespace Enforcer.Tests;

public sealed class ManualTime(DateTime start) : TimeProvider
{
    public DateTime Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => new(Now, TimeSpan.Zero);
    public void Advance(TimeSpan by) => Now += by;
}

public sealed class MemoryStore(string name = "memory") : IEnforcerStateStore
{
    public EnforcerState? State { get; set; }
    public string Name => name;
    public Task<EnforcerState?> LoadAsync(CancellationToken ct = default) => Task.FromResult(State);
    public Task SaveAsync(EnforcerState state, CancellationToken ct = default) { State = state; return Task.CompletedTask; }
}

/// <summary>Plays the Issuer: holds a private key and signs payloads/receipts.</summary>
public sealed class FakeIssuer : IDisposable
{
    private readonly Key _key = Key.Create(SignatureAlgorithm.Ed25519, new KeyCreationParameters { ExportPolicy = KeyExportPolicies.AllowPlaintextExport });
    public byte[] PublicKey => _key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
    public string PublicKeyB64 => Convert.ToBase64String(PublicKey);
    public string Kid => SignatureVerifier.KeyId(PublicKey);

    public byte[] Sign<T>(T payload)
    {
        var bytes = EnvelopeCodec.Serialize(payload);
        var sig = SignatureAlgorithm.Ed25519.Sign(_key, bytes);
        return EnvelopeCodec.Write(new SignedEnvelope { Kid = Kid, Payload = Convert.ToBase64String(bytes), Sig = Convert.ToBase64String(sig) });
    }

    /// <summary>Signs raw payload bytes (for simulating files from older formats).</summary>
    public byte[] SignRaw(byte[] bytes)
    {
        var sig = SignatureAlgorithm.Ed25519.Sign(_key, bytes);
        return EnvelopeCodec.Write(new SignedEnvelope { Kid = Kid, Payload = Convert.ToBase64String(bytes), Sig = Convert.ToBase64String(sig) });
    }

    public void Dispose() => _key.Dispose();
}

public sealed class Rig : IDisposable
{
    public const string Subscriber = "ACME-0001";
    public const string Host = "hf1_" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    public static readonly DateTime T0 = new(2026, 6, 1, 12, 0, 0, DateTimeKind.Utc);

    public FakeIssuer Issuer { get; } = new();
    public ManualTime Time { get; } = new(T0);
    public MemoryStore Store { get; } = new();
    public MemoryStore Store2 { get; } = new("memory2");
    public EnforcerOptions Options { get; }
    public string HostFingerprint { get; set; } = Host;
    public LicenseEngine Engine { get; private set; }
    public StateRepository Repo { get; private set; } = null!;

    public Rig(Action<EnforcerOptions>? configure = null)
    {
        Options = new EnforcerOptions
        {
            SubscriberCode = Subscriber,
            ProductBuild = "3.2.0",
            PublicKeys = [Issuer.PublicKeyB64],
            StateMacKey = "test-mac-key",
        };
        configure?.Invoke(Options);
        Engine = NewEngine();
    }

    /// <summary>Simulates a process restart: fresh engine, same stores.</summary>
    public LicenseEngine NewEngine()
    {
        var o = Microsoft.Extensions.Options.Options.Create(Options);
        var host = new FixedHostFingerprintProvider(HostFingerprint);
        Repo = new StateRepository([Store, Store2], o, host);
        Engine = new LicenseEngine(o, new SignatureVerifier(Options.PublicKeys), Repo, host, Time, NullLogger<LicenseEngine>.Instance);
        return Engine;
    }

    public EntitlementPayload Payload(int revision = 1, Action<PayloadBuilder>? edit = null)
    {
        var b = new PayloadBuilder
        {
            Revision = revision,
            ValidFrom = T0.AddDays(-1),
            ValidUntil = T0.AddDays(30),
            IssuedAt = T0.AddMinutes(-5),
            Modules = [new() { ModuleKey = "time-attendance" }, new() { ModuleKey = "visitor-management" }],
        };
        edit?.Invoke(b);
        return new EntitlementPayload
        {
            EntitlementId = "e" + revision,
            SubscriberCode = b.SubscriberCode,
            CustomerName = "Acme",
            Revision = b.Revision,
            State = b.State,
            Tier = Tier.Professional,
            Modules = b.Modules,
            ValidFrom = b.ValidFrom,
            ValidUntil = b.ValidUntil,
            MinBuild = b.MinBuild,
            MaxBuild = b.MaxBuild,
            HostingMode = b.HostingMode,
            HostFingerprint = b.HostFingerprint,
            IssuedAt = b.IssuedAt,
            Nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(8)),
        };
    }

    public byte[] File(int revision = 1, Action<PayloadBuilder>? edit = null) => Issuer.Sign(Payload(revision, edit));

    public byte[] Receipt(DateTime serverTime, EntitlementState state = EntitlementState.Live, int latest = 1) =>
        Issuer.Sign(new CheckinReceipt
        {
            SubscriberCode = Subscriber,
            State = state,
            LatestRevision = latest,
            ValidUntil = T0.AddDays(30),
            ServerTime = serverTime,
            HostFingerprint = Host,
            Nonce = "n",
        });

    public void Dispose() => Issuer.Dispose();
}

public sealed class PayloadBuilder
{
    public string SubscriberCode { get; set; } = Rig.Subscriber;
    public int Revision { get; set; }
    public EntitlementState State { get; set; } = EntitlementState.Live;
    public List<ModuleGrant> Modules { get; set; } = [];
    public DateTime ValidFrom { get; set; }
    public DateTime ValidUntil { get; set; }
    public DateTime IssuedAt { get; set; }
    public string? MinBuild { get; set; }
    public string? MaxBuild { get; set; }
    public HostingMode HostingMode { get; set; } = HostingMode.OnPrem;
    public string? HostFingerprint { get; set; } = Rig.Host;
}
