using System.Text.Json;
using System.Text.Json.Serialization;

namespace Licensing.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<EntitlementState>))]
public enum EntitlementState { Live, Suspended, Revoked, Expired, Superseded }

[JsonConverter(typeof(JsonStringEnumConverter<Tier>))]
public enum Tier { Essential, Professional, Enterprise }

[JsonConverter(typeof(JsonStringEnumConverter<HostingMode>))]
public enum HostingMode { Cloud, OnPrem, Split }

[JsonConverter(typeof(JsonStringEnumConverter<Inclusion>))]
public enum Inclusion { Included, AddOn, None }

public sealed record ModuleGrant
{
    public required string ModuleKey { get; init; }
    public DateTime? ModuleValidUntil { get; init; }
    public List<string>? DeviceKinds { get; init; }
}

/// <summary>
/// Exactly what goes inside a signed .entl file. The customer product trusts
/// only these fields, and only after the signature is verified.
/// </summary>
public sealed record EntitlementPayload
{
    public int Format { get; init; } = 1;
    public required string EntitlementId { get; init; }
    public required string SubscriberCode { get; init; }
    public required string CustomerName { get; init; }
    public required int Revision { get; init; }
    public required EntitlementState State { get; init; }
    public required Tier Tier { get; init; }
    public required List<ModuleGrant> Modules { get; init; }
    /// <summary>Registered / Connected capacity. Files issued before this field existed read as empty.</summary>
    public Capacity Capacity { get; init; } = new();
    public required DateTime ValidFrom { get; init; }
    public required DateTime ValidUntil { get; init; }
    public string? MinBuild { get; init; }
    public string? MaxBuild { get; init; }
    public required HostingMode HostingMode { get; init; }
    public string? HostFingerprint { get; init; }
    public required DateTime IssuedAt { get; init; }
    public required string Nonce { get; init; }
}

/// <summary>Signed answer from the Issuer to a ping or check-in. Stored by the Enforcer as proof of contact.</summary>
public sealed record CheckinReceipt
{
    public required string SubscriberCode { get; init; }
    public required EntitlementState State { get; init; }
    public required int LatestRevision { get; init; }
    public required DateTime ValidUntil { get; init; }
    public required DateTime ServerTime { get; init; }
    public string? HostFingerprint { get; init; }
    public required string Nonce { get; init; }
}

/// <summary>Created by the customer install, uploaded by the admin when creating an entitlement. Not signed.</summary>
public sealed record ActivationRequest
{
    public int Format { get; init; } = 1;
    public string? SubscriberCode { get; init; }
    public required string HostFingerprint { get; init; }
    public required string ProductBuild { get; init; }
    public required string Hostname { get; init; }
    public required DateTime RequestedAt { get; init; }
}

/// <summary>
/// Signed envelope. <c>Payload</c> is base64 of the exact bytes that were signed.
/// Verifiers must check the signature against those bytes and only then parse them.
/// </summary>
public sealed record SignedEnvelope
{
    public int V { get; init; } = 1;
    public required string Kid { get; init; }
    public required string Payload { get; init; }
    public required string Sig { get; init; }
}

public static class LicensingJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = false,
    };
}
