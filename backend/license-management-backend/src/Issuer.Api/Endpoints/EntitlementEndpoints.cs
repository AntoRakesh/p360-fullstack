using System.Text.RegularExpressions;
using Issuer.Api.Data;
using Issuer.Api.Dto;
using Issuer.Api.Services;
using Licensing.Contracts;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Issuer.Api.Endpoints;

/// <summary>All admin endpoints. Authorization comes from the global fallback policy (LicenseAdmin role).</summary>
public static class EntitlementEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireRateLimiting("admin");

        api.MapGet("/catalog", () => Results.Ok(new
        {
            modules = ProductCatalog.Modules,
            tiers = ProductCatalog.Tiers,
            capacity = new
            {
                registered = CapacityRules.RegisteredOptions,
                connected = CapacityRules.ConnectedOptions,
                autoRegistered = CapacityRules.AutoRegisteredQuantity,
            },
        }));

        api.MapGet("/dashboard", Dashboard);
        api.MapGet("/entitlements", List);
        api.MapGet("/entitlements/history/{subscriberCode}", async (string subscriberCode, EntitlementService svc, CancellationToken ct) =>
        {
            var rows = await svc.HistoryAsync(subscriberCode, ct);
            if (rows.Count == 0) return Results.NotFound();
            var prefix = await svc.KeyPrefixAsync(subscriberCode, ct);
            return Results.Ok(rows.Select(r => EntitlementDto.From(r, prefix)));
        });
        api.MapGet("/entitlements/{id}", async (string id, EntitlementService svc, CancellationToken ct) =>
            await svc.GetAsync(id, ct) is { } d ? Results.Ok(EntitlementDto.From(d, await svc.KeyPrefixAsync(d.SubscriberCode, ct), svc.MaskedClientDb(d))) : Results.NotFound());

        api.MapPost("/entitlements", async (EntitlementInput input, EntitlementService svc, TimeProvider time, HttpContext ctx, CancellationToken ct) =>
        {
            var errors = Validation.Check(input, time.GetUtcNow().UtcDateTime);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            return await Run(async () =>
            {
                var d = await svc.CreateAsync(input, Who(ctx), Ip(ctx), ct);
                return Results.Created($"/api/entitlements/{d.Id}", EntitlementDto.From(d, null, svc.MaskedClientDb(d)));
            });
        });

        api.MapPost("/entitlements/{id}/renew", async (string id, RenewInput input, EntitlementService svc, TimeProvider time, HttpContext ctx, CancellationToken ct) =>
            await Run(async () =>
            {
                var prev = await svc.GetAsync(id, ct) ?? throw new DomainException(404, "Entitlement not found.");
                var errors = Validation.Check(input, prev, time.GetUtcNow().UtcDateTime);
                if (errors.Count > 0) return Results.ValidationProblem(errors);
                var d = await svc.RenewAsync(id, input, Who(ctx), Ip(ctx), ct);
                return Results.Created($"/api/entitlements/{d.Id}", EntitlementDto.From(d, await svc.KeyPrefixAsync(d.SubscriberCode, ct), svc.MaskedClientDb(d)));
            }));

        api.MapPost("/entitlements/{id}/suspend", (string id, ReasonInput r, EntitlementService svc, HttpContext ctx, CancellationToken ct) =>
            Run(async () => Results.Ok(EntitlementDto.From(await svc.SuspendAsync(id, r.Reason ?? "", Who(ctx), Ip(ctx), ct), null))));
        api.MapPost("/entitlements/{id}/resume", (string id, ReasonInput r, EntitlementService svc, HttpContext ctx, CancellationToken ct) =>
            Run(async () => Results.Ok(EntitlementDto.From(await svc.ResumeAsync(id, r.Reason ?? "", Who(ctx), Ip(ctx), ct), null))));
        api.MapPost("/entitlements/{id}/revoke", (string id, ReasonInput r, EntitlementService svc, HttpContext ctx, CancellationToken ct) =>
            Run(async () => Results.Ok(EntitlementDto.From(await svc.RevokeAsync(id, r.Reason ?? "", Who(ctx), Ip(ctx), ct), null))));

        // Full client DB connection string. Every view is audited.
        api.MapGet("/entitlements/{id}/client-db", async (string id, EntitlementService svc, AuditService audit, HttpContext ctx, CancellationToken ct) =>
        {
            var d = await svc.GetAsync(id, ct);
            if (d is null) return Results.NotFound();
            var cs = svc.RevealClientDb(d);
            if (cs is null) return Results.NotFound();
            await audit.WriteRawAsync(Who(ctx), "entitlement.client_db_view", d.SubscriberCode, new { d.Id, d.Revision }, Ip(ctx), ct);
            return Results.Ok(new { connectionString = cs });
        });

        api.MapGet("/entitlements/{id}/file", async (string id, EntitlementService svc, AuditService audit, HttpContext ctx, CancellationToken ct) =>
        {
            var d = await svc.GetAsync(id, ct);
            if (d is null) return Results.NotFound();
            await audit.WriteRawAsync(Who(ctx), "entitlement.download", d.SubscriberCode, new { d.Id, d.Revision }, Ip(ctx), ct);
            return Results.File(EntitlementService.FileBytes(d), "application/octet-stream", EntitlementService.FileName(d));
        });

        api.MapPost("/entitlements/{id}/install-key", (string id, EntitlementService svc, HttpContext ctx, CancellationToken ct) =>
            Run(async () =>
            {
                var (key, prefix) = await svc.IssueCredentialAsync(id, Who(ctx), Ip(ctx), ct);
                return Results.Ok(new { apiKey = key, keyPrefix = prefix });
            }));

        api.MapPost("/activation/parse", async (IFormFile file, CancellationToken ct) =>
        {
            if (file.Length is 0 or > EnvelopeCodec.MaxFileBytes) return Results.Problem("File is empty or too large.", statusCode: 400);
            using var reader = new StreamReader(file.OpenReadStream());
            var req = EnvelopeCodec.TryReadActivationRequest(await reader.ReadToEndAsync(ct));
            if (req is null || !Validation.FingerprintRx().IsMatch(req.HostFingerprint ?? ""))
                return Results.Problem("This is not a valid activation request (.actreq) file.", statusCode: 400);
            return Results.Ok(new { req.SubscriberCode, req.HostFingerprint, req.ProductBuild, req.Hostname, req.RequestedAt });
        }).DisableAntiforgery();

        api.MapGet("/audit", async (string? subscriberCode, string? action, int? page, int? pageSize, MongoContext db, CancellationToken ct) =>
        {
            var (p, size) = Paging(page, pageSize, 50);
            var f = Builders<AuditDoc>.Filter.Empty;
            if (!string.IsNullOrWhiteSpace(subscriberCode)) f &= Builders<AuditDoc>.Filter.Eq(a => a.SubscriberCode, subscriberCode.Trim());
            if (!string.IsNullOrWhiteSpace(action)) f &= Builders<AuditDoc>.Filter.Regex(a => a.Action, new BsonRegularExpression("^" + Regex.Escape(action.Trim())));
            var total = await db.Audit.CountDocumentsAsync(f, cancellationToken: ct);
            var items = await db.Audit.Find(f).SortByDescending(a => a.At).Skip((p - 1) * size).Limit(size).ToListAsync(ct);
            return Results.Ok(new Paged<AuditDto>(items.Select(AuditDto.From).ToList(), total, p, size));
        });
    }

    private static async Task<IResult> Dashboard(MongoContext db, TimeProvider time, CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var current = Builders<EntitlementDoc>.Filter.Ne(x => x.State, EntitlementState.Superseded);
        var rows = await db.Entitlements.Find(current).Project(x => new { x.State, x.Tier }).ToListAsync(ct);
        var expiring = await db.Entitlements
            .Find(x => x.State == EntitlementState.Live && x.ValidUntil >= now && x.ValidUntil <= now.AddDays(30))
            .SortBy(x => x.ValidUntil).Limit(50).ToListAsync(ct);
        var recent = await db.Audit.Find(_ => true).SortByDescending(a => a.At).Limit(10).ToListAsync(ct);

        return Results.Ok(new
        {
            byState = Enum.GetValues<EntitlementState>().ToDictionary(s => s.ToString(), s => rows.Count(r => r.State == s)),
            byTier = Enum.GetValues<Tier>().ToDictionary(t => t.ToString(), t => rows.Count(r => r.Tier == t)),
            expiringSoon = expiring.Select(d => EntitlementDto.From(d, null)),
            recentAudit = recent.Select(AuditDto.From),
        });
    }

    private static async Task<IResult> List(string? search, EntitlementState? state, Tier? tier, HostingMode? hostingMode,
        int? page, int? pageSize, MongoContext db, CancellationToken ct)
    {
        var (p, size) = Paging(page, pageSize, 20);
        var b = Builders<EntitlementDoc>.Filter;
        var f = state is { } s ? b.Eq(x => x.State, s) : b.Ne(x => x.State, EntitlementState.Superseded);
        if (tier is { } t) f &= b.Eq(x => x.Tier, t);
        if (hostingMode is { } h) f &= b.Eq(x => x.HostingMode, h);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var rx = new BsonRegularExpression(Regex.Escape(search.Trim()[..Math.Min(search.Trim().Length, 100)]), "i");
            f &= b.Or(b.Regex(x => x.CustomerName, rx), b.Regex(x => x.SubscriberCode, rx), b.Regex(x => x.ContactEmail, rx));
        }
        var total = await db.Entitlements.CountDocumentsAsync(f, cancellationToken: ct);
        var items = await db.Entitlements.Find(f).SortBy(x => x.ValidUntil).Skip((p - 1) * size).Limit(size).ToListAsync(ct);
        return Results.Ok(new Paged<EntitlementDto>(items.Select(d => EntitlementDto.From(d, null)).ToList(), total, p, size));
    }

    private static (int Page, int Size) Paging(int? page, int? size, int dflt) =>
        (Math.Max(1, page ?? 1), Math.Clamp(size ?? dflt, 1, 200));

    internal static string Who(HttpContext ctx) => ctx.User.Identity?.Name ?? throw new UnauthorizedAccessException();
    internal static string? Ip(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString();

    internal static async Task<IResult> Run(Func<Task<IResult>> action)
    {
        try { return await action(); }
        catch (DomainException ex) { return Results.Problem(ex.Message, statusCode: ex.Status); }
    }
}
