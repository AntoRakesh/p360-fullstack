using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace Enforcer.Core;

/// <summary>
/// Server-side enforcement. Runs on every request to every service that hosts it.
/// Frontend route guards are UX only.
/// </summary>
public sealed class LicenseGateMiddleware(
    RequestDelegate next,
    LicenseEngine engine,
    IOptions<EnforcerOptions> options,
    ModuleKeyResolver resolver)
{
    private readonly string[] _exempt = options.Value.ExemptPathPrefixes.ToArray();

    public async Task InvokeAsync(HttpContext ctx)
    {
        var path = ctx.Request.Path.Value ?? "/";
        if (_exempt.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)) || HttpMethods.IsOptions(ctx.Request.Method))
        {
            await next(ctx);
            return;
        }

        var decision = await engine.EvaluateAsync(resolver.Resolve(ctx), ctx.RequestAborted);
        if (decision.Allowed)
        {
            await next(ctx);
            return;
        }

        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(new
        {
            type = "https://purpleiq.ai/problems/license",
            title = "License",
            status = 403,
            detail = decision.Message,
            code = decision.Code.ToString(),
        }, (JsonSerializerOptions?)null, "application/problem+json");
    }
}

/// <summary>
/// Maps a request to a p360 module key. Default: first path segment after
/// <c>/api/</c> when it is a known catalog module, e.g. <c>/api/visitor-management/visits</c>.
/// </summary>
public class ModuleKeyResolver
{
    public virtual string? Resolve(HttpContext ctx)
    {
        if (ctx.GetRouteValue("moduleKey") is string rk) return rk;
        var segs = (ctx.Request.Path.Value ?? "").Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segs.Length >= 2 && segs[0] == "api" && Licensing.Contracts.ProductCatalog.IsKnownModule(segs[1])) return segs[1];
        if (segs.Length >= 3 && segs[0] == "api" && segs[1] == "modules") return segs[2];
        return null;
    }
}
