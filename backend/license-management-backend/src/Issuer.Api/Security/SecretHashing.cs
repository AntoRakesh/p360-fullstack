using System.Security.Cryptography;
using System.Text;

namespace Issuer.Api.Security;

public static class SecretHashing
{
    /// <summary>Customer credentials are 256-bit random values, so a plain SHA-256 is enough (no brute force possible).</summary>
    public static string Sha256Hex(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public static string NewCredential(string prefix) =>
        prefix + Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    private static string Base64UrlEncode(byte[] b) =>
        Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private const string SubscriberAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static string NewSubscriberCode(string prefix = "P360")
    {
        Span<char> chars = stackalloc char[8];
        for (var i = 0; i < chars.Length; i++) chars[i] = SubscriberAlphabet[RandomNumberGenerator.GetInt32(SubscriberAlphabet.Length)];
        return prefix + "-" + new string(chars);
    }
}
