using System.Text.RegularExpressions;

namespace Issuer.Api.Security;

/// <summary>Hides passwords in connection strings for display, logs and audit.</summary>
public static partial class ConnectionStringMasker
{
    // scheme://user:password@host  →  scheme://user:****@host
    [GeneratedRegex(@"(?<pre>://[^:/@\s]+:)(?<pw>[^@\s]+)(?=@)")]
    private static partial Regex UriPassword();

    // Password=...;  Pwd=...;  (key=value style, e.g. SQL Server / PostgreSQL)
    [GeneratedRegex(@"(?<pre>\b(password|pwd)\s*=\s*)(?<pw>[^;]*)", RegexOptions.IgnoreCase)]
    private static partial Regex KeyValuePassword();

    public static string? Mask(string? cs)
    {
        if (string.IsNullOrEmpty(cs)) return cs;
        var s = UriPassword().Replace(cs, m => m.Groups["pre"].Value + "****");
        return KeyValuePassword().Replace(s, m => m.Groups["pre"].Value + "****");
    }
}
