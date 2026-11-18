using Issuer.Api.Data;
using Issuer.Api.Services;

namespace Issuer.Api.Endpoints;

/// <summary>
/// The only endpoints a customer install may call. Each has its own credential;
/// neither accepts an admin token, and admin endpoints never accept these credentials.
/// </summary>
public static class CustomerEndpoints
{
    public sealed record PingInput(string? Build);
    public sealed record CheckinInput(int Revision, string? HostFingerprint, string? Build);

    public static void MapCustomer(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").AllowAnonymous().RequireRateLimiting("customer");

        // Cloud / Split heartbeat
        g.MapPost("/ping/{subscriberCode}", async (string subscriberCode, PingInput? body, HttpContext ctx, EntitlementService svc, CancellationToken ct) =>
        {
            var token = ctx.Request.Headers["X-Service-Token"].ToString();
            if (await svc.FindCredentialAsync(subscriberCode, token, CredentialKind.ServiceToken, ct) is null) return Results.Unauthorized();
            return await Respond(svc, subscriberCode, false, null, ct);
        });

        // OnPrem online check-in
        g.MapPost("/checkin/{subscriberCode}", async (string subscriberCode, CheckinInput input, HttpContext ctx, EntitlementService svc, CancellationToken ct) =>
        {
            var key = ctx.Request.Headers["X-Install-Key"].ToString();
            if (await svc.FindCredentialAsync(subscriberCode, key, CredentialKind.InstallKey, ct) is null) return Results.Unauthorized();
            return await Respond(svc, subscriberCode, true, input.HostFingerprint, ct);
        });
    }

    private static Task<IResult> Respond(EntitlementService svc, string code, bool isCheckin, string? fingerprint, CancellationToken ct) =>
        EntitlementEndpoints.Run(async () =>
        {
            var (current, receipt) = await svc.RecordContactAsync(code, isCheckin, fingerprint, ct);
            var signed = System.Text.Json.JsonSerializer.Deserialize<Licensing.Contracts.CheckinReceipt>(
                Convert.FromBase64String(receipt.Payload), Licensing.Contracts.LicensingJson.Options)!;
            return Results.Ok(new
            {
                state = signed.State.ToString(),
                revision = current.Revision,
                latestRevision = current.Revision,
                validUntil = current.ValidUntil,
                serverTime = signed.ServerTime,
                receipt,
            });
        });
}
