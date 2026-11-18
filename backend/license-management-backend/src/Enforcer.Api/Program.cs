using System.Security.Cryptography;
using System.Text;
using Enforcer.Api;
using Enforcer.Core;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddLicenseEnforcer(builder.Configuration);
builder.Services.AddProblemDetails();

var enforcerDb = builder.Configuration.GetConnectionString("EnforcerDb");
if (!string.IsNullOrWhiteSpace(enforcerDb))
{
    var url = MongoUrl.Create(enforcerDb);
    builder.Services.AddSingleton<IMongoClient>(new MongoClient(url));
    builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(url.DatabaseName ?? "p360_enforcer"));
    builder.Services.AddSingleton<IEnforcerStateStore, MongoEnforcerStateStore>();
}

// Split mode: fail startup if the license DB is on the customer's network.
if (string.Equals(builder.Configuration["Enforcer:HostingMode"], "Split", StringComparison.OrdinalIgnoreCase))
    SplitModeGuard.EnsureVendorSide(builder.Configuration["Enforcer:LicenseDbConnectionString"]);

var app = builder.Build();

app.UseExceptionHandler();
app.UseRouting();      // so the gate can read the {moduleKey} route value
app.UseLicenseGate();

var localAdminKey = app.Configuration["LocalAdmin:ApiKey"] ?? "";

// Local admin operations (import, manual check-in) need the install's own admin key.
bool IsLocalAdmin(HttpContext ctx)
{
    if (string.IsNullOrEmpty(localAdminKey)) return false;
    var given = ctx.Request.Headers["X-Local-Admin"].ToString();
    return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(localAdminKey));
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

var license = app.MapGroup("/api/license");

license.MapGet("/status", async (LicenseEngine engine, CancellationToken ct) =>
{
    var s = await engine.GetStatusAsync(ct);
    return Results.Ok(new
    {
        allowed = s.Decision.Allowed,
        code = s.Decision.Code.ToString(),
        message = s.Decision.Message,
        entitlement = s.Entitlement,
        trustedNow = s.TrustedNow,
        daysLeft = s.DaysLeft,
        lastCheckin = s.LastReceipt?.ServerTime,
        newerRevisionAvailable = s.NewerRevisionAvailable,
        hostFingerprint = s.HostFingerprint,
    });
});

license.MapPost("/import", async (HttpContext ctx, IFormFile file, LicenseEngine engine, CancellationToken ct) =>
{
    if (!IsLocalAdmin(ctx)) return Results.Unauthorized();
    if (file.Length is 0 or > Licensing.Contracts.EnvelopeCodec.MaxFileBytes) return Results.BadRequest(new { message = "File is empty or too large." });
    using var ms = new MemoryStream();
    await file.CopyToAsync(ms, ct);
    var r = await engine.ImportAsync(ms.ToArray(), ct);
    return r.Ok
        ? Results.Ok(new { message = r.Message, revision = r.Payload!.Revision, validUntil = r.Payload.ValidUntil })
        : Results.UnprocessableEntity(new { code = r.Code.ToString(), message = r.Message });
}).DisableAntiforgery();

license.MapGet("/activation-request", (LicenseEngine engine) =>
    Results.File(Encoding.UTF8.GetBytes(engine.CreateActivationRequest()), "application/octet-stream", "p360-activation.actreq"));

license.MapPost("/checkin", async (HttpContext ctx, RemoteCheckinClient client, CancellationToken ct) =>
{
    if (!IsLocalAdmin(ctx)) return Results.Unauthorized();
    var r = await client.CheckInAsync(ct);
    return r.Ok ? Results.Ok(new { message = r.Message, r.Receipt }) : Results.Problem(r.Message, statusCode: 502);
});

// Sample gated endpoint. Real p360 services get the same gate by calling AddLicenseEnforcer + UseLicenseGate.
app.MapGet("/api/modules/{moduleKey}/ping", (string moduleKey) => Results.Ok(new { module = moduleKey, licensed = true }));

app.Run();

public partial class Program;
