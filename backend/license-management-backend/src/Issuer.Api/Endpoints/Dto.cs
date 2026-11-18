using System.Net.Mail;
using System.Text.RegularExpressions;
using Issuer.Api.Data;
using Licensing.Contracts;

namespace Issuer.Api.Dto;

public sealed record EntitlementDto(
    string Id, string SubscriberCode, string CustomerName, string ContactEmail, int Revision,
    EntitlementState State, Tier Tier, List<ModuleGrant> Modules, Features Features,
    int SeatLimit, int? DeviceLimit, DateTime ValidFrom, DateTime ValidUntil,
    string? MinBuild, string? MaxBuild, HostingMode HostingMode, string? HostFingerprint,
    DateTime IssuedAt, string IssuedBy, DateTime? LastPingAt, DateTime? LastCheckinAt,
    string? InstallKeyPrefix, string? Notes, string? StateReason)
{
    public static EntitlementDto From(EntitlementDoc d, string? keyPrefix) => new(
        d.Id, d.SubscriberCode, d.CustomerName, d.ContactEmail, d.Revision, d.State, d.Tier, d.Modules, d.Features,
        d.SeatLimit, d.DeviceLimit, d.ValidFrom, d.ValidUntil, d.MinBuild, d.MaxBuild, d.HostingMode, d.HostFingerprint,
        d.IssuedAt, d.IssuedBy, d.LastPingAt, d.LastCheckinAt, keyPrefix, d.Notes, d.StateReason);
}

public sealed record EntitlementInput
{
    public string? SubscriberCode { get; init; }
    public string CustomerName { get; init; } = "";
    public string ContactEmail { get; init; } = "";
    public Tier Tier { get; init; }
    public List<ModuleGrant> Modules { get; init; } = [];
    public Features? Features { get; init; }
    public int SeatLimit { get; init; }
    public int? DeviceLimit { get; init; }
    public DateTime ValidFrom { get; init; }
    public DateTime ValidUntil { get; init; }
    public string? MinBuild { get; init; }
    public string? MaxBuild { get; init; }
    public HostingMode HostingMode { get; init; }
    public string? HostFingerprint { get; init; }
    public string? Notes { get; init; }
}

public sealed record RenewInput
{
    public DateTime ValidUntil { get; init; }
    public Tier? Tier { get; init; }
    public List<ModuleGrant>? Modules { get; init; }
    public Features? Features { get; init; }
    public int? SeatLimit { get; init; }
    public int? DeviceLimit { get; init; }
    public string? HostFingerprint { get; init; }
    public string? Notes { get; init; }
}

public sealed record ReasonInput(string? Reason);

public sealed record AuditDto(string Id, string Who, string Action, string? EntitlementId, string? SubscriberCode,
    System.Text.Json.JsonElement? Before, System.Text.Json.JsonElement? After, DateTime At, string? Ip)
{
    public static AuditDto From(AuditDoc a) => new(a.Id, a.Who, a.Action, a.EntitlementId, a.SubscriberCode,
        Parse(a.Before), Parse(a.After), a.At, a.Ip);

    private static System.Text.Json.JsonElement? Parse(string? json) =>
        json is null ? null : System.Text.Json.JsonDocument.Parse(json).RootElement.Clone();
}

public sealed record Paged<T>(List<T> Items, long Total, int Page, int PageSize);

public static partial class Validation
{
    [GeneratedRegex("^[A-Z0-9][A-Z0-9-]{3,39}$")]
    public static partial Regex SubscriberCodeRx();

    [GeneratedRegex("^hf1_[0-9a-f]{64}$")]
    public static partial Regex FingerprintRx();

    public static Dictionary<string, string[]> Check(EntitlementInput i, DateTime now)
    {
        var e = new Dictionary<string, string[]>();
        void Add(string k, string m) => e[k] = [m];

        if (i.SubscriberCode is { Length: > 0 } sc && !SubscriberCodeRx().IsMatch(sc)) Add("subscriberCode", "Use 4–40 characters: A–Z, 0–9 and '-'.");
        if (string.IsNullOrWhiteSpace(i.CustomerName) || i.CustomerName.Length > 200) Add("customerName", "Customer name is required (max 200 characters).");
        if (!IsEmail(i.ContactEmail)) Add("contactEmail", "A valid contact email is required.");
        if (!Enum.IsDefined(i.Tier)) Add("tier", "Unknown tier.");
        if (!Enum.IsDefined(i.HostingMode)) Add("hostingMode", "Unknown hosting mode.");
        if (i.SeatLimit <= 0) Add("seatLimit", "Seat limit must be greater than 0.");
        if (i.DeviceLimit is < 0) Add("deviceLimit", "Device limit cannot be negative.");
        if (i.ValidUntil <= i.ValidFrom) Add("validUntil", "Valid until must be after valid from.");
        if (i.ValidUntil <= now) Add("validUntil", "Valid until must be in the future.");
        CheckModules(i.Modules, e);
        CheckFeatures(i.Features, e);
        CheckBuilds(i.MinBuild, i.MaxBuild, e);
        if (i.HostFingerprint is { Length: > 0 } fp && !FingerprintRx().IsMatch(fp)) Add("hostFingerprint", "Host fingerprint format is not valid. Upload the customer's .actreq file.");
        if (i.HostingMode == HostingMode.OnPrem && string.IsNullOrWhiteSpace(i.HostFingerprint))
            Add("hostFingerprint", "On-premise licenses must be bound to a machine. Upload the customer's .actreq file.");
        if (i.Notes is { Length: > 2000 }) Add("notes", "Notes max 2000 characters.");
        return e;
    }

    public static Dictionary<string, string[]> Check(RenewInput r, EntitlementDoc prev, DateTime now)
    {
        var e = new Dictionary<string, string[]>();
        if (r.ValidUntil <= now) e["validUntil"] = ["Valid until must be in the future."];
        if (r.Modules is not null) CheckModules(r.Modules, e);
        if (r.Features is not null) CheckFeatures(r.Features, e);
        if (r.SeatLimit is <= 0) e["seatLimit"] = ["Seat limit must be greater than 0."];
        if (r.HostFingerprint is { Length: > 0 } fp && !FingerprintRx().IsMatch(fp)) e["hostFingerprint"] = ["Host fingerprint format is not valid."];
        if (r.Notes is { Length: > 2000 }) e["notes"] = ["Notes max 2000 characters."];
        return e;
    }

    private static void CheckModules(List<ModuleGrant> modules, Dictionary<string, string[]> e)
    {
        var unknown = modules.Where(m => !ProductCatalog.IsKnownModule(m.ModuleKey)).Select(m => m.ModuleKey).ToList();
        if (unknown.Count > 0) e["modules"] = [$"Unknown modules: {string.Join(", ", unknown)}"];
        else if (modules.GroupBy(m => m.ModuleKey).Any(g => g.Count() > 1)) e["modules"] = ["Duplicate modules."];
        else if (modules.Any(m => m.SeatLimit is <= 0)) e["modules"] = ["Module seat limit must be greater than 0."];
    }

    private static void CheckFeatures(Features? f, Dictionary<string, string[]> e)
    {
        if (f is null) return;
        if (f.ApiDailyCallLimit is <= 0) e["features.apiDailyCallLimit"] = ["Daily call limit must be greater than 0, or empty for unlimited."];
        if (f.MaxSites is <= 0) e["features.maxSites"] = ["Max sites must be greater than 0, or empty for unlimited."];
    }

    private static void CheckBuilds(string? min, string? max, Dictionary<string, string[]> e)
    {
        Version? lo = null, hi = null;
        if (min is { Length: > 0 } && !Version.TryParse(min, out lo)) e["minBuild"] = ["Use a version like 3.2.0."];
        if (max is { Length: > 0 } && !Version.TryParse(max, out hi)) e["maxBuild"] = ["Use a version like 3.2.0."];
        if (lo is not null && hi is not null && lo > hi) e["maxBuild"] = ["Max build must be at least min build."];
    }

    private static bool IsEmail(string s) =>
        !string.IsNullOrWhiteSpace(s) && s.Length <= 254 && MailAddress.TryCreate(s, out var a) && a.Address == s.Trim();
}
