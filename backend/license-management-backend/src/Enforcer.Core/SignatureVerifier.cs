using System.Security.Cryptography;
using System.Text.Json;
using Licensing.Contracts;
using NSec.Cryptography;

namespace Enforcer.Core;

public sealed record Verified<T>(T Value, byte[] PayloadBytes);

/// <summary>
/// Verifies Ed25519 signatures over the exact payload bytes shipped in the envelope.
/// JSON is parsed only after the signature passes. Nothing is re-serialized.
/// </summary>
public sealed class SignatureVerifier
{
    private static readonly SignatureAlgorithm Alg = SignatureAlgorithm.Ed25519;
    private readonly Dictionary<string, PublicKey> _keys = new(StringComparer.Ordinal);

    public SignatureVerifier(IEnumerable<string> publicKeysBase64)
    {
        foreach (var b64 in publicKeysBase64.Where(k => !string.IsNullOrWhiteSpace(k)))
        {
            var raw = Convert.FromBase64String(b64.Trim());
            var key = PublicKey.Import(Alg, raw, KeyBlobFormat.RawPublicKey);
            _keys[KeyId(raw)] = key;
        }
        if (_keys.Count == 0) throw new InvalidOperationException("Enforcer: no issuer public key configured (Enforcer:PublicKeys).");
    }

    /// <summary>Key id = first 8 bytes of SHA-256(public key), hex.</summary>
    public static string KeyId(byte[] rawPublicKey) =>
        Convert.ToHexStringLower(SHA256.HashData(rawPublicKey))[..16];

    public Verified<T>? Verify<T>(SignedEnvelope env) where T : class
    {
        if (!_keys.TryGetValue(env.Kid, out var key)) return null;
        var payload = EnvelopeCodec.TryDecodeBase64(env.Payload);
        var sig = EnvelopeCodec.TryDecodeBase64(env.Sig);
        if (payload is null || sig is null || sig.Length != Alg.SignatureSize) return null;
        if (!Alg.Verify(key, payload, sig)) return null;
        try
        {
            var value = JsonSerializer.Deserialize<T>(payload, LicensingJson.Options);
            return value is null ? null : new Verified<T>(value, payload);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public Verified<T>? Verify<T>(byte[] fileBytes) where T : class
    {
        var env = EnvelopeCodec.TryRead(fileBytes);
        return env is null ? null : Verify<T>(env);
    }
}
