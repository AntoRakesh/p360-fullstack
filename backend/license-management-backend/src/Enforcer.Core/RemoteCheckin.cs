using System.Net.Http.Json;
using Licensing.Contracts;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Enforcer.Core;

public sealed record CheckinOutcome(bool Ok, string Message, CheckinReceipt? Receipt = null);

/// <summary>Calls the Issuer: OnPrem → /api/checkin (X-Install-Key), Cloud/Split → /api/ping (X-Service-Token).</summary>
public sealed class RemoteCheckinClient(
    HttpClient http,
    IOptions<EnforcerOptions> options,
    LicenseEngine engine,
    SignatureVerifier verifier,
    IHostFingerprintProvider host,
    ILogger<RemoteCheckinClient> log)
{
    private sealed record IssuerResponse(string State, int LatestRevision, DateTime ValidUntil, DateTime ServerTime, SignedEnvelope Receipt);

    public async Task<CheckinOutcome> CheckInAsync(CancellationToken ct = default)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.RemoteCheckIn.IssuerUrl) || string.IsNullOrWhiteSpace(o.RemoteCheckIn.Credential))
            return new(false, "Remote check-in is not configured.");

        var status = await engine.GetStatusAsync(ct);
        var mode = status.Entitlement?.HostingMode ?? HostingMode.OnPrem;
        var code = Uri.EscapeDataString(o.SubscriberCode);
        var baseUrl = o.RemoteCheckIn.IssuerUrl.TrimEnd('/');

        using var req = mode == HostingMode.OnPrem
            ? new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/checkin/{code}")
            {
                Content = JsonContent.Create(new { revision = status.Entitlement?.Revision ?? 0, hostFingerprint = host.GetFingerprint(), build = o.ProductBuild }, options: LicensingJson.Options),
            }
            : new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/ping/{code}")
            {
                Content = JsonContent.Create(new { build = o.ProductBuild }, options: LicensingJson.Options),
            };
        req.Headers.Add(mode == HostingMode.OnPrem ? "X-Install-Key" : "X-Service-Token", o.RemoteCheckIn.Credential);

        try
        {
            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return new(false, $"Issuer answered {(int)res.StatusCode}.");
            var body = await res.Content.ReadFromJsonAsync<IssuerResponse>(LicensingJson.Options, ct);
            if (body?.Receipt is null) return new(false, "Issuer response had no receipt.");

            var envBytes = EnvelopeCodec.Write(body.Receipt);
            var verified = verifier.Verify<CheckinReceipt>(envBytes);
            if (verified is null) return new(false, "Issuer receipt signature is not valid.");
            if (!await engine.AcceptReceiptAsync(envBytes, ct)) return new(false, "Receipt was rejected (wrong subscriber, host or older than the last one).");
            return new(true, "Checked in.", verified.Value);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            log.LogWarning(ex, "License check-in failed");
            return new(false, "Could not reach the license server.");
        }
    }
}

public sealed class RemoteCheckinWorker(RemoteCheckinClient client, IOptions<EnforcerOptions> options, ILogger<RemoteCheckinWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var o = options.Value.RemoteCheckIn;
        if (!o.Enabled) return;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, o.IntervalMinutes)));
        do
        {
            var r = await client.CheckInAsync(stoppingToken);
            log.LogInformation("License check-in: {Result}", r.Message);
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
