using Licensing.Contracts;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Issuer.Api.Data;

/// <summary>
/// One row per revision. Renew inserts a new row; the old row only gets its state set to Superseded.
/// The only other in-place changes are state transitions (suspend/resume/revoke/expire) and
/// heartbeat timestamps. The signed file is generated once and stored, so its bytes never change.
/// </summary>
public sealed class EntitlementDoc
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public required string SubscriberCode { get; set; }
    public required string CustomerName { get; set; }
    public required string ContactEmail { get; set; }
    public required int Revision { get; set; }
    public required EntitlementState State { get; set; }
    public required Tier Tier { get; set; }
    public required List<ModuleGrant> Modules { get; set; }
    public Capacity Capacity { get; set; } = new();
    public required DateTime ValidFrom { get; set; }
    public required DateTime ValidUntil { get; set; }
    public string? MinBuild { get; set; }
    public string? MaxBuild { get; set; }
    public required HostingMode HostingMode { get; set; }
    public string? HostFingerprint { get; set; }
    public required DateTime IssuedAt { get; set; }
    public required string IssuedBy { get; set; }
    public DateTime? LastPingAt { get; set; }
    public DateTime? LastCheckinAt { get; set; }
    public string? Notes { get; set; }
    /// <summary>Optional customer database connection string, encrypted with ASP.NET Data Protection. Never in the signed file.</summary>
    public string? ClientDbConnectionProtected { get; set; }
    public string? StateReason { get; set; }
    /// <summary>The .entl file bytes, base64. Generated once at issue time.</summary>
    public required string SignedFile { get; set; }
}

public sealed class AdminUser
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public List<string> Roles { get; set; } = [];
    /// <summary>TOTP secret, encrypted with ASP.NET Data Protection.</summary>
    public string? TotpSecretProtected { get; set; }
    public bool TotpEnrolled { get; set; }
    public long LastTotpStep { get; set; }
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum CredentialKind { InstallKey, ServiceToken }

/// <summary>Per-subscriber customer credential. Only the SHA-256 hash is stored.</summary>
public sealed class CustomerCredential
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public required string SubscriberCode { get; set; }
    public required CredentialKind Kind { get; set; }
    public required string Hash { get; set; }
    public required string Prefix { get; set; }
    public required DateTime CreatedAt { get; set; }
    public required string CreatedBy { get; set; }
    public DateTime? RevokedAt { get; set; }
}

/// <summary>Append-only. Code only ever inserts into this collection.</summary>
public sealed class AuditDoc
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public required string Who { get; set; }
    public required string Action { get; set; }
    public string? EntitlementId { get; set; }
    public string? SubscriberCode { get; set; }
    /// <summary>JSON snapshot before the change.</summary>
    public string? Before { get; set; }
    /// <summary>JSON snapshot after the change.</summary>
    public string? After { get; set; }
    public required DateTime At { get; set; }
    public string? Ip { get; set; }
}
