using System.Net;
using Microsoft.Extensions.Options;

namespace Issuer.Api.Security;

/// <summary>
/// IP allowlist for everything except the customer endpoints (/api/ping, /api/checkin).
/// Network-level isolation (VPN / internal bind) is still recommended; this is a second fence.
/// </summary>
public sealed class AdminNetworkMiddleware
{
    private static readonly string[] CustomerPrefixes = ["/api/ping/", "/api/checkin/"];
    private readonly RequestDelegate _next;
    private readonly List<IPNetwork> _allowed;

    public AdminNetworkMiddleware(RequestDelegate next, IOptions<IssuerOptions> options, ILogger<AdminNetworkMiddleware> log)
    {
        _next = next;
        _allowed = options.Value.AdminAllowedNetworks.Select(IPNetwork.Parse).ToList();
        if (_allowed.Count == 0)
            log.LogWarning("Issuer:AdminAllowedNetworks is empty. Admin endpoints accept any source IP. Restrict this in production.");
    }

    public static bool IsCustomerPath(PathString path) =>
        CustomerPrefixes.Any(p => path.StartsWithSegments(p.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (_allowed.Count > 0 && !IsCustomerPath(ctx.Request.Path))
        {
            var ip = ctx.Connection.RemoteIpAddress;
            if (ip is null || !Allowed(ip))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                await ctx.Response.WriteAsJsonAsync(new { title = "Forbidden", status = 403, detail = "Source address not allowed." });
                return;
            }
        }
        await _next(ctx);
    }

    private bool Allowed(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        return _allowed.Any(n => n.Contains(ip));
    }
}
