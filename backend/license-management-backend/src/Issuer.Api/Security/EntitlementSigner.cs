using System.Security.Cryptography;
using Licensing.Contracts;
using Microsoft.Extensions.Options;
using NSec.Cryptography;

namespace Issuer.Api.Security;

/// <summary>Holds the Ed25519 private key. The key comes from configuration (environment / vault) only.</summary>
public sealed class EntitlementSigner : IDisposable
{
    private static readonly SignatureAlgorithm Alg = SignatureAlgorithm.Ed25519;
    private readonly Key _key;

    public EntitlementSigner(IOptions<IssuerOptions> options)
    {
        var seedB64 = options.Value.SigningKey;
        if (string.IsNullOrWhiteSpace(seedB64))
            throw new InvalidOperationException("Issuer:SigningKey is not set. Generate one with `dotnet run --project src/Issuer.Api -- keygen` and provide it via environment variable Issuer__SigningKey or user-secrets.");
        var seed = Convert.FromBase64String(seedB64.Trim());
        try
        {
            _key = Key.Import(Alg, seed, KeyBlobFormat.RawPrivateKey);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(seed);
        }
        PublicKey = _key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
        Kid = Convert.ToHexStringLower(SHA256.HashData(PublicKey))[..16];
    }

    public byte[] PublicKey { get; }
    public string PublicKeyBase64 => Convert.ToBase64String(PublicKey);
    public string Kid { get; }

    public SignedEnvelope Sign<T>(T payload)
    {
        var bytes = EnvelopeCodec.Serialize(payload);
        var sig = Alg.Sign(_key, bytes);
        return new SignedEnvelope { Kid = Kid, Payload = Convert.ToBase64String(bytes), Sig = Convert.ToBase64String(sig) };
    }

    public static string NewNonce() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));

    public void Dispose() => _key.Dispose();

    /// <summary>Prints a fresh key pair. Used by the `keygen` command.</summary>
    public static (string PrivateSeedB64, string PublicB64) Generate()
    {
        using var key = Key.Create(Alg, new KeyCreationParameters { ExportPolicy = KeyExportPolicies.AllowPlaintextExport });
        return (Convert.ToBase64String(key.Export(KeyBlobFormat.RawPrivateKey)),
                Convert.ToBase64String(key.PublicKey.Export(KeyBlobFormat.RawPublicKey)));
    }
}
