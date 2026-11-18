using System.Text.Json;
using Issuer.Api.Data;
using Licensing.Contracts;

namespace Issuer.Api.Services;

public sealed class AuditService(MongoContext db, TimeProvider time)
{
    public Task WriteAsync(string who, string action, EntitlementDoc? before, EntitlementDoc? after, string? ip, CancellationToken ct = default) =>
        db.Audit.InsertOneAsync(new AuditDoc
        {
            Who = who,
            Action = action,
            EntitlementId = after?.Id ?? before?.Id,
            SubscriberCode = after?.SubscriberCode ?? before?.SubscriberCode,
            Before = before is null ? null : Snapshot(before),
            After = after is null ? null : Snapshot(after),
            At = time.GetUtcNow().UtcDateTime,
            Ip = ip,
        }, cancellationToken: ct);

    public Task WriteRawAsync(string who, string action, string? subscriberCode, object? after, string? ip, CancellationToken ct = default) =>
        db.Audit.InsertOneAsync(new AuditDoc
        {
            Who = who,
            Action = action,
            SubscriberCode = subscriberCode,
            After = after is null ? null : JsonSerializer.Serialize(after, LicensingJson.Options),
            At = time.GetUtcNow().UtcDateTime,
            Ip = ip,
        }, cancellationToken: ct);

    /// <summary>Snapshot without the signed file blob.</summary>
    private static string Snapshot(EntitlementDoc d) =>
        JsonSerializer.Serialize(Dto.EntitlementDto.From(d, null), LicensingJson.Options);
}
