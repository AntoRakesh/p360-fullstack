using System.Net;
using System.Net.Sockets;

namespace Enforcer.Core;

/// <summary>
/// Split mode = license DB on vendor side, business data on customer side.
/// If the license DB connection points at the customer's own network the customer
/// could edit it, so startup must fail.
/// </summary>
public static class SplitModeGuard
{
    public static void EnsureVendorSide(string? connectionString, Func<string, IPAddress[]>? resolve = null)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Split mode: Enforcer:LicenseDbConnectionString is required and must point to the vendor license database.");

        resolve ??= h => { try { return Dns.GetHostAddresses(h); } catch (SocketException) { return []; } };
        foreach (var host in ExtractHosts(connectionString))
        {
            if (IsLocalName(host)) throw Bad(host);
            var addrs = IPAddress.TryParse(host, out var ip) ? [ip] : resolve(host);
            if (addrs.Any(IsPrivate)) throw Bad(host);
        }
    }

    internal static IEnumerable<string> ExtractHosts(string cs)
    {
        // mongodb://user:pass@h1:27017,h2/db?x  or  mongodb+srv://cluster.example.net/db
        var s = cs;
        var scheme = s.IndexOf("://", StringComparison.Ordinal);
        if (scheme >= 0) s = s[(scheme + 3)..];
        var at = s.LastIndexOf('@');
        if (at >= 0) s = s[(at + 1)..];
        var end = s.IndexOfAny(['/', '?']);
        if (end >= 0) s = s[..end];
        foreach (var part in s.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var h = part.Trim();
            if (h.StartsWith('['))
            {
                var close = h.IndexOf(']');
                yield return close > 0 ? h[1..close] : h;
                continue;
            }
            var colon = h.LastIndexOf(':');
            yield return colon > 0 ? h[..colon] : h;
        }
    }

    private static bool IsLocalName(string h) =>
        h.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || h.EndsWith(".local", StringComparison.OrdinalIgnoreCase)
        || h.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase)
        || !h.Contains('.') && !IPAddress.TryParse(h, out _); // bare intranet name

    internal static bool IsPrivate(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any)) return true;
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6UniqueLocal;
        var b = ip.GetAddressBytes();
        return b[0] == 10
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254)
            || (b[0] == 100 && b[1] >= 64 && b[1] <= 127); // CGNAT
    }

    private static InvalidOperationException Bad(string host) =>
        new($"Split mode: license DB host '{host}' is local or on a private network. It must point to the vendor license database.");
}
