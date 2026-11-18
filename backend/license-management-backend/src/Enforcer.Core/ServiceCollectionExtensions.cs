using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Enforcer.Core;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the license enforcer. Every p360 service calls this plus <see cref="UseLicenseGate"/>.
    /// Extra <see cref="IEnforcerStateStore"/> registrations (e.g. a Mongo store) are merged with the file store.
    /// </summary>
    public static IServiceCollection AddLicenseEnforcer(this IServiceCollection services, IConfiguration config)
    {
        services.AddOptions<EnforcerOptions>()
            .Bind(config.GetSection(EnforcerOptions.Section))
            .Validate(o => !string.IsNullOrWhiteSpace(o.SubscriberCode), "Enforcer:SubscriberCode is required.")
            .Validate(o => o.PublicKeys.Count > 0, "Enforcer:PublicKeys needs at least one issuer public key.")
            .ValidateOnStart();

        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IHostFingerprintProvider, DefaultHostFingerprintProvider>();
        services.AddSingleton<IEnforcerStateStore, FileEnforcerStateStore>();
        services.TryAddSingleton(sp => new SignatureVerifier(sp.GetRequiredService<IOptions<EnforcerOptions>>().Value.PublicKeys));
        services.TryAddSingleton<StateRepository>();
        services.TryAddSingleton<LicenseEngine>();
        services.TryAddSingleton<ModuleKeyResolver>();
        services.AddHttpClient<RemoteCheckinClient>(c => c.Timeout = TimeSpan.FromSeconds(20));
        services.AddHostedService<RemoteCheckinWorker>();
        return services;
    }

    public static IApplicationBuilder UseLicenseGate(this IApplicationBuilder app) =>
        app.UseMiddleware<LicenseGateMiddleware>();
}
