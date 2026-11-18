using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Issuer.Api.Security;

/// <summary>
/// Two token kinds signed with the same HMAC key but different audiences:
/// a 5-minute "mfa" token (password ok, TOTP pending) and the 1-hour admin access token.
/// The mfa token is never accepted by the JWT bearer handler because its audience differs.
/// </summary>
public sealed class TokenService
{
    public const string MfaAudienceSuffix = ":mfa";
    public const string NameClaim = "name";
    public const string RoleClaim = "role";
    private readonly JwtOptions _jwt;
    private readonly SymmetricSecurityKey _key;
    private readonly TimeProvider _time;

    public TokenService(IOptions<IssuerOptions> options, TimeProvider time)
    {
        _jwt = options.Value.Jwt;
        _key = CreateKey(_jwt.Key);
        _time = time;
    }

    public static SymmetricSecurityKey CreateKey(string key)
    {
        var bytes = Encoding.UTF8.GetBytes(key ?? "");
        if (bytes.Length < 32) throw new InvalidOperationException("Issuer:Jwt:Key must be at least 32 bytes. Provide it via environment variable Issuer__Jwt__Key or user-secrets.");
        return new SymmetricSecurityKey(bytes);
    }

    public string CreateMfaToken(string username) =>
        Write([new Claim(JwtRegisteredClaimNames.Sub, username), new Claim("purpose", "mfa")],
              _jwt.Audience + MfaAudienceSuffix, TimeSpan.FromMinutes(5));

    public (string Token, DateTime ExpiresAt) CreateAccessToken(string username, IEnumerable<string> roles)
    {
        var life = TimeSpan.FromMinutes(_jwt.AccessTokenMinutes);
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, username), new(NameClaim, username) };
        claims.AddRange(roles.Select(r => new Claim(RoleClaim, r)));
        return (Write(claims, _jwt.Audience, life), _time.GetUtcNow().UtcDateTime + life);
    }

    /// <summary>Returns the username if the mfa token is valid.</summary>
    public string? ValidateMfaToken(string token)
    {
        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        try
        {
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidIssuer = _jwt.Issuer,
                ValidAudience = _jwt.Audience + MfaAudienceSuffix,
                IssuerSigningKey = _key,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            }, out _);
            return principal.FindFirst("purpose")?.Value == "mfa" ? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value : null;
        }
        catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
        {
            return null;
        }
    }

    private string Write(IEnumerable<Claim> claims, string audience, TimeSpan life)
    {
        var now = _time.GetUtcNow().UtcDateTime;
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: audience,
            claims: claims.Append(new Claim(JwtRegisteredClaimNames.Jti, Convert.ToHexString(RandomNumberGenerator.GetBytes(8)))),
            notBefore: now,
            expires: now + life,
            signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
