using System.Threading.RateLimiting;
using Issuer.Api;
using Issuer.Api.Data;
using Issuer.Api.Endpoints;
using Issuer.Api.Security;
using Issuer.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;

// `dotnet run -- keygen` prints a new Ed25519 key pair and exits.
if (args.Length > 0 && args[0] == "keygen")
{
    var (priv, pub) = EntitlementSigner.Generate();
    Console.WriteLine("# PRIVATE signing key: store in a vault or env Issuer__SigningKey. Never commit.");
    Console.WriteLine($"ISSUER_SIGNING_KEY={priv}");
    Console.WriteLine("# Public key: ship with the product as Enforcer__PublicKeys__0.");
    Console.WriteLine($"ISSUER_PUBLIC_KEY={pub}");
    return;
}

var resetAdmin = args.Length > 0 && args[0] == "reset-admin";
var builder = WebApplication.CreateBuilder(resetAdmin ? args[1..] : args);
var cfg = builder.Configuration;

builder.Services.AddOptions<IssuerOptions>().Bind(cfg.GetSection(IssuerOptions.Section))
    .Validate(o => !string.IsNullOrWhiteSpace(o.SigningKey), "Issuer:SigningKey is missing. Dev: run ./scripts/dev-setup.sh once. Prod: set env Issuer__SigningKey.")
    .Validate(o => o.Jwt.Key.Length >= 32, "Issuer:Jwt:Key is missing or shorter than 32 characters. Dev: run ./scripts/dev-setup.sh once. Prod: set env Issuer__Jwt__Key.")
    .ValidateOnStart();
var opts = cfg.GetSection(IssuerOptions.Section).Get<IssuerOptions>() ?? new IssuerOptions();

// ---- data
var mongoUrl = MongoUrl.Create(cfg.GetConnectionString("IssuerDb") ?? "mongodb://localhost:27017/p360_license_issuer");
builder.Services.AddSingleton<IMongoClient>(new MongoClient(mongoUrl));
builder.Services.AddSingleton(sp => new MongoContext(sp.GetRequiredService<IMongoClient>().GetDatabase(mongoUrl.DatabaseName ?? "p360_license_issuer")));

// `dotnet run -- reset-admin` sets the admin password from Issuer:AdminSeed, clears TOTP and lockout, then exits.
// Does not start the web server, so it works while the API is running.
if (resetAdmin)
{
    var db = new MongoContext(new MongoClient(mongoUrl).GetDatabase(mongoUrl.DatabaseName ?? "p360_license_issuer"));
    Environment.ExitCode = await AdminReset.RunAsync(db, opts.AdminSeed);
    return;
}

// ---- services
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<EntitlementSigner>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<EntitlementService>();
builder.Services.AddHostedService<StartupInitializer>();
builder.Services.AddHostedService<ExpirySweeper>();
builder.Services.AddDataProtection().SetApplicationName("p360-license-issuer");
builder.Services.AddProblemDetails();
builder.Services.Configure<ForwardedHeadersOptions>(o => o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

// ---- authentication: JWT (LicenseAdmin role). TOTP is enforced at token issue time.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = opts.Jwt.Issuer,
        ValidAudience = opts.Jwt.Audience,
        IssuerSigningKey = TokenService.CreateKey(opts.Jwt.Key),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = TokenService.NameClaim,
        RoleClaimType = TokenService.RoleClaim,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
    };
});

// Every endpoint requires LicenseAdmin unless it explicitly says AllowAnonymous
// (only /api/auth/login, /api/auth/mfa, /api/ping, /api/checkin, /health).
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().RequireRole(Roles.LicenseAdmin).Build());

// ---- rate limiting (per client IP)
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static string Ip(HttpContext c) => c.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    o.AddPolicy("auth", c => RateLimitPartition.GetFixedWindowLimiter(Ip(c), _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("admin", c => RateLimitPartition.GetFixedWindowLimiter(Ip(c), _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("customer", c => RateLimitPartition.GetFixedWindowLimiter(Ip(c), _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
});

if (opts.CorsOrigins.Count > 0)
    builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins([.. opts.CorsOrigins]).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseMiddleware<AdminNetworkMiddleware>();
if (opts.CorsOrigins.Count > 0) app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapAuth();
app.MapCustomer();
app.MapAdmin();

app.Run();

public partial class Program;
