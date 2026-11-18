using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Licensing.Contracts;
using Microsoft.Extensions.Options;

namespace Enforcer.Core;

/// <summary>
/// What the enforcer remembers between restarts. Security does not depend on these
/// fields being secret: the license and receipt are signed by the Issuer, and the
/// counters only ever move forward (highest value across all stores wins).
/// </summary>
public sealed record EnforcerState
{
    /// <summary>Raw .entl file bytes (base64), exactly as imported.</summary>
    public string? RawEntitlement { get; init; }
    public int HighestRevision { get; init; }
    public DateTime ClockHighWater { get; init; }
    /// <summary>Raw signed check-in receipt (base64 envelope bytes).</summary>
    public string? RawReceipt { get; init; }
    public DateTime? ReceiptServerTime { get; init; }
    public string? Mac { get; init; }
}

public interface IEnforcerStateStore
{
    string Name { get; }
    Task<EnforcerState?> LoadAsync(CancellationToken ct = default);
    Task SaveAsync(EnforcerState state, CancellationToken ct = default);
}

public sealed class FileEnforcerStateStore(IOptions<EnforcerOptions> options) : IEnforcerStateStore
{
    private readonly string _path = Path.Combine(options.Value.StateDirectory, "enforcer-state.json");
    private static readonly SemaphoreSlim Lock = new(1, 1);

    public string Name => "file";

    public async Task<EnforcerState?> LoadAsync(CancellationToken ct = default)
    {
        if (!File.Exists(_path)) return null;
        await using var s = File.OpenRead(_path);
        try { return await JsonSerializer.DeserializeAsync<EnforcerState>(s, LicensingJson.Options, ct); }
        catch (JsonException) { return new EnforcerState { Mac = "corrupt" }; }
    }

    public async Task SaveAsync(EnforcerState state, CancellationToken ct = default)
    {
        await Lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var tmp = _path + ".tmp";
            await File.WriteAllBytesAsync(tmp, JsonSerializer.SerializeToUtf8Bytes(state, LicensingJson.Options), ct);
            File.Move(tmp, _path, overwrite: true);
        }
        finally { Lock.Release(); }
    }
}

public sealed record LoadedState(EnforcerState State, bool Tampered, string? TamperedStore);

/// <summary>Reads every store, checks each MAC, and merges with "highest wins" so rolling back one store has no effect.</summary>
public sealed class StateRepository
{
    private readonly IReadOnlyList<IEnforcerStateStore> _stores;
    private readonly byte[] _macKey;

    public StateRepository(IEnumerable<IEnforcerStateStore> stores, IOptions<EnforcerOptions> options, IHostFingerprintProvider host)
    {
        _stores = stores.ToList();
        var o = options.Value;
        _macKey = !string.IsNullOrWhiteSpace(o.StateMacKey)
            ? Encoding.UTF8.GetBytes(o.StateMacKey)
            : SHA256.HashData(Encoding.UTF8.GetBytes("p360-state|" + o.SubscriberCode + "|" + host.GetFingerprint()));
    }

    public async Task<LoadedState> LoadAsync(CancellationToken ct = default)
    {
        EnforcerState merged = new();
        EnforcerState? best = null;
        foreach (var store in _stores)
        {
            var s = await store.LoadAsync(ct);
            if (s is null) continue;
            if (!MacValid(s)) return new LoadedState(merged, true, store.Name);

            if (best is null || s.HighestRevision > best.HighestRevision) best = s;
            merged = merged with
            {
                HighestRevision = Math.Max(merged.HighestRevision, s.HighestRevision),
                ClockHighWater = Max(merged.ClockHighWater, s.ClockHighWater),
            };
            if (s.RawReceipt is not null && (merged.ReceiptServerTime is null || s.ReceiptServerTime > merged.ReceiptServerTime))
                merged = merged with { RawReceipt = s.RawReceipt, ReceiptServerTime = s.ReceiptServerTime };
        }
        merged = merged with { RawEntitlement = best?.RawEntitlement };
        return new LoadedState(merged, false, null);
    }

    public async Task SaveAsync(EnforcerState state, CancellationToken ct = default)
    {
        var signed = state with { Mac = ComputeMac(state) };
        foreach (var store in _stores) await store.SaveAsync(signed, ct);
    }

    private bool MacValid(EnforcerState s) =>
        s.Mac is not null && CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(s.Mac), Encoding.ASCII.GetBytes(ComputeMac(s)));

    private string ComputeMac(EnforcerState s)
    {
        var canonical = string.Join('\n',
            s.RawEntitlement ?? "",
            s.HighestRevision.ToString(CultureInfo.InvariantCulture),
            s.ClockHighWater.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture),
            s.RawReceipt ?? "",
            s.ReceiptServerTime?.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture) ?? "");
        return Convert.ToHexStringLower(HMACSHA256.HashData(_macKey, Encoding.UTF8.GetBytes(canonical)));
    }

    private static DateTime Max(DateTime a, DateTime b) => a >= b ? a : b;
}
