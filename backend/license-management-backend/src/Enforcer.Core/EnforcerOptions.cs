namespace Enforcer.Core;

public sealed class EnforcerOptions
{
    public const string Section = "Enforcer";

    /// <summary>Subscriber code this install belongs to. A license for any other code is rejected.</summary>
    public string SubscriberCode { get; set; } = "";

    /// <summary>Which application this install is. A license for another product is rejected.</summary>
    public Licensing.Contracts.Product Product { get; set; } = Licensing.Contracts.Product.People360;

    /// <summary>Running product build, e.g. "3.2.0". Checked against minBuild/maxBuild.</summary>
    public string ProductBuild { get; set; } = "1.0.0";

    /// <summary>Issuer public keys (base64 raw Ed25519, 32 bytes). Several allowed for key rotation.</summary>
    public List<string> PublicKeys { get; set; } = [];

    /// <summary>Where the enforcer keeps its state file (signed license, highest revision, clock high-water).</summary>
    public string StateDirectory { get; set; } = "license-state";

    /// <summary>Secret used to MAC the local state. Not a strong secret (it lives on the customer machine) but makes casual edits detectable.</summary>
    public string StateMacKey { get; set; } = "";

    /// <summary>How long a verified license stays cached before the signature is checked again.</summary>
    public int CacheMinutes { get; set; } = 5;

    /// <summary>How far the clock may go backwards before it counts as tampering (NTP corrections, DST bugs).</summary>
    public int ClockToleranceMinutes { get; set; } = 10;

    /// <summary>OnPrem licenses must carry a host fingerprint.</summary>
    public bool RequireHostBindingOnPrem { get; set; } = true;

    /// <summary>Connection string of the license database. In Split mode it must point to the vendor side.</summary>
    public string? LicenseDbConnectionString { get; set; }

    /// <summary>Request paths that skip the gate (license import/status pages, health checks).</summary>
    public List<string> ExemptPathPrefixes { get; set; } = ["/api/license", "/health"];

    public RemoteCheckInOptions RemoteCheckIn { get; set; } = new();
}

public sealed class RemoteCheckInOptions
{
    /// <summary>When true the install must reach the Issuer at least once every <see cref="GraceDays"/>.</summary>
    public bool Enabled { get; set; }
    public string IssuerUrl { get; set; } = "";
    /// <summary>OnPrem: per-install API key. Cloud/Split: service token.</summary>
    public string Credential { get; set; } = "";
    public int GraceDays { get; set; } = 7;
    public int IntervalMinutes { get; set; } = 60;
}
