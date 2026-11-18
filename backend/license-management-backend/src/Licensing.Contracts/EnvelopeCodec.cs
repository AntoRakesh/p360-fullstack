using System.Text;
using System.Text.Json;

namespace Licensing.Contracts;

/// <summary>Reads and writes the signed envelope container. Does not verify. See Enforcer.Core.SignatureVerifier.</summary>
public static class EnvelopeCodec
{
    public const int MaxFileBytes = 64 * 1024;

    public static byte[] Serialize<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value, LicensingJson.Options);

    public static byte[] Write(SignedEnvelope envelope) => JsonSerializer.SerializeToUtf8Bytes(envelope, LicensingJson.Options);

    public static SignedEnvelope? TryRead(ReadOnlySpan<byte> fileBytes)
    {
        if (fileBytes.Length == 0 || fileBytes.Length > MaxFileBytes) return null;
        try
        {
            var env = JsonSerializer.Deserialize<SignedEnvelope>(fileBytes, LicensingJson.Options);
            if (env is null || env.V != 1 || string.IsNullOrEmpty(env.Payload) || string.IsNullOrEmpty(env.Sig)) return null;
            return env;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static byte[]? TryDecodeBase64(string s)
    {
        try { return Convert.FromBase64String(s); }
        catch (FormatException) { return null; }
    }

    /// <summary>.actreq file: base64 of activation request JSON. Plain text so it can be emailed.</summary>
    public static string WriteActivationRequest(ActivationRequest req) =>
        Convert.ToBase64String(Serialize(req));

    public static ActivationRequest? TryReadActivationRequest(string text)
    {
        var bytes = TryDecodeBase64(text.Trim());
        if (bytes is null || bytes.Length > MaxFileBytes) return null;
        try { return JsonSerializer.Deserialize<ActivationRequest>(bytes, LicensingJson.Options); }
        catch (JsonException) { return null; }
    }

    public static string Utf8(byte[] b) => Encoding.UTF8.GetString(b);
}
