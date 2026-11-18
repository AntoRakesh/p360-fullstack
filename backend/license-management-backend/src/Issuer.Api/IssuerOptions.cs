namespace Issuer.Api;

public sealed class IssuerOptions
{
    public const string Section = "Issuer";

    /// <summary>Ed25519 private key seed (base64, 32 bytes). Environment variable <c>Issuer__SigningKey</c> or a vault. Never in appsettings.</summary>
    public string SigningKey { get; set; } = "";

    /// <summary>CIDRs allowed to reach admin endpoints. Empty = allow all (logged as a warning). Customer endpoints are not filtered.</summary>
    public List<string> AdminAllowedNetworks { get; set; } = [];

    public List<string> CorsOrigins { get; set; } = [];

    public int ExpirySweepMinutes { get; set; } = 10;

    public JwtOptions Jwt { get; set; } = new();
    public AdminSeedOptions AdminSeed { get; set; } = new();
    public SmtpOptions Smtp { get; set; } = new();
}

public sealed class JwtOptions
{
    /// <summary>HMAC key, at least 32 bytes. Environment variable <c>Issuer__Jwt__Key</c>.</summary>
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "p360-license-issuer";
    public string Audience { get; set; } = "p360-license-admin";
    public int AccessTokenMinutes { get; set; } = 60;
}

/// <summary>First admin, created at startup only when no admin exists. Set via environment, then remove.</summary>
public sealed class AdminSeedOptions
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

public sealed class SmtpOptions
{
    /// <summary>Empty = write .eml files to <see cref="PickupDirectory"/> instead of sending.</summary>
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string From { get; set; } = "licensing@example.com";
    public string PickupDirectory { get; set; } = "mail-outbox";
}

public static class Roles
{
    public const string LicenseAdmin = "LicenseAdmin";
}
