using System.Text.Json.Serialization;

namespace Licensing.Contracts;

[JsonConverter(typeof(JsonStringEnumConverter<Product>))]
public enum Product { People360, Asset360, Environment360 }

public sealed record CatalogModule(string Key, string Title, string Group, bool Core);

public sealed record TierDef(Tier Tier, string Title, IReadOnlyDictionary<string, Inclusion> Inclusion);

/// <summary>Allowed Registered / Connected quantities for a product. <c>Registered</c> null = product has no Registered capacity.</summary>
public sealed record CapacityOptions(IReadOnlyList<long?>? Registered, IReadOnlyList<long> Connected, long? AutoRegistered);

/// <summary>
/// One sellable product: its modules, the Essential / Professional / Enterprise sheet and its capacity options.
/// The signed license always carries the final module list, so changing a table later does not change
/// licenses already issued.
/// </summary>
public sealed class ProductDef
{
    public required Product Product { get; init; }
    public required string Title { get; init; }
    /// <summary>Prefix of generated subscriber codes, e.g. "P360".</summary>
    public required string CodePrefix { get; init; }
    public required IReadOnlyList<CatalogModule> Modules { get; init; }
    public required IReadOnlyList<TierDef> Tiers { get; init; }
    public required CapacityOptions Capacity { get; init; }

    public TierDef GetTier(Tier tier) => Tiers.First(t => t.Tier == tier);
    public bool IsKnownModule(string key) => Modules.Any(m => m.Key == key);
}

public static class Products
{
    // Lazy: the product catalogs use CatalogBuilder, so building them here eagerly would be a static-init cycle.
    private static readonly Lazy<IReadOnlyList<ProductDef>> _all = new(() => [People360Catalog.Def, Asset360Catalog.Def, Environment360Catalog.Def]);

    public static IReadOnlyList<ProductDef> All => _all.Value;

    public static ProductDef Get(Product p) => All.First(d => d.Product == p);

    public static bool IsKnownModule(string key) => All.Any(d => d.IsKnownModule(key));

}

/// <summary>Shared helpers for the product catalogs. Kept separate from <see cref="Products"/> to avoid static-init cycles.</summary>
internal static class CatalogBuilder
{
    /// <summary>Builds a product from rows of (key, title, group, core, Essential, Professional, Enterprise).</summary>
    internal static ProductDef Build(
        Product product, string title, string codePrefix, CapacityOptions capacity,
        (string Key, string Title, string Group, bool Core, Inclusion E, Inclusion P, Inclusion X)[] rows)
    {
        var modules = rows.Select(r => new CatalogModule(r.Key, r.Title, r.Group, r.Core)).ToList();
        TierDef Tier(Tier t, Func<(string, string, string, bool Core, Inclusion E, Inclusion P, Inclusion X), Inclusion> pick) =>
            new(t, $"{title} {t}", rows.ToDictionary(r => r.Key, r => r.Core ? Inclusion.Included : pick(r)));
        return new ProductDef
        {
            Product = product,
            Title = title,
            CodePrefix = codePrefix,
            Modules = modules,
            Tiers =
            [
                Tier(Contracts.Tier.Essential, r => r.E),
                Tier(Contracts.Tier.Professional, r => r.P),
                Tier(Contracts.Tier.Enterprise, r => r.X),
            ],
            Capacity = capacity,
        };
    }

    internal const Inclusion I = Inclusion.Included, A = Inclusion.AddOn, N = Inclusion.None;

    /// <summary>Registered 50,000 / 200,000 / Unlimited, Connected 100–50,000, Connected alone adds Registered 50.</summary>
    internal static readonly CapacityOptions RegisteredAndConnected = new([50_000, 200_000, null], [100, 500, 2_500, 10_000, 50_000], 50);

    /// <summary>Connected only (no Registered).</summary>
    internal static readonly CapacityOptions ConnectedOnly = new(null, [100, 500, 2_500, 10_000, 50_000], null);
}

/// <summary>Module keys = People360 module paths (frontend/p360/src/app/modules.ts). "Limited" in the sheet = Included.</summary>
public static class People360Catalog
{
    private const Inclusion I = CatalogBuilder.I, A = CatalogBuilder.A, N = CatalogBuilder.N;

    public static readonly ProductDef Def = CatalogBuilder.Build(Product.People360, "People360", "P360", CatalogBuilder.RegisteredAndConnected,
    [
        //  key                              title                                   group                               core   Ess Pro Ent
        ("people-identity",              "People & Identity Management",      "Core",                              true,  I, I, I),
        ("administration-configuration", "Administration & Configuration",    "Core",                              true,  I, I, I),
        ("device-edge-management",       "Device & Edge Management",          "Core",                              true,  I, I, I),
        ("contractor-vendor",            "Contractor & Vendor Workforce",     "Core",                              true,  I, I, I),
        ("safety-wellbeing",             "Safety & Wellbeing",                "Core",                              true,  I, I, I),
        ("workplace-facility-services",  "Workplace & Facility Services",     "Core",                              true,  I, I, I),
        ("training-skills-compliance",   "Training, Skills & Compliance",     "Core",                              true,  I, I, I),
        ("time-attendance",              "Time & Attendance",                 "Time & Attendance",                 false, I, I, I),
        ("physical-access-control",      "Physical Access Control",           "Access Control",                    false, I, I, I),
        ("visitor-management",           "Visitor Management",                "Visitor Management",                false, I, I, I),
        ("patrol-guard-management",      "Patrol & Guard Management",         "Patrol Tracking",                   false, N, I, I),
        ("meal-canteen-management",      "Meal & Canteen Management",         "Meal Tracking",                     false, N, I, I),
        ("shift-workforce",              "Shift & Workforce Scheduling",      "Workforce Management",              false, N, I, I),
        ("leave-absence",                "Leave & Absence Management",        "Workforce Management",              false, N, I, I),
        ("tasks-workforce-operations",   "Tasks & Workforce Operations",      "Workforce Management",              false, N, I, I),
        ("emergency-mustering",          "Emergency & Mustering",             "Emergency Evacuation & Mustering",  false, N, I, I),
        ("real-time-location",           "Real-Time Location (RTLS)",         "RTLS – People Tracking",            false, N, A, I),
        ("digital-twin",                 "Digital Twin & Spatial Intelligence", "Digital Twin",                    false, N, A, I),
        ("customer-visitor-analytics",   "Customer & Visitor Analytics",      "Customer Analytics",                false, N, A, I),
        ("command-center",               "Command Center & Dashboards",       "Advanced Analytics & Dashboards",   false, I, I, I),
        ("reports-analytics",            "Reports & Analytics",               "Advanced Analytics & Dashboards",   false, I, I, I),
        ("ai-people-intelligence",       "AI & People Intelligence",          "Advanced Analytics & Dashboards",   false, N, I, I),
        ("integrations-api-hub",         "Integrations & API Hub",            "API / Third-Party Integration",     false, I, I, I),
        ("workflow-automation",          "Workflow & Automation",             "Custom Workflows",                  false, N, N, I),
    ]);
}

/// <summary>Asset360 sheet. "Optional" = add-on, "Limited" = Included.</summary>
public static class Asset360Catalog
{
    private const Inclusion I = CatalogBuilder.I, A = CatalogBuilder.A, N = CatalogBuilder.N;

    public static readonly ProductDef Def = CatalogBuilder.Build(Product.Asset360, "Asset360", "A360", CatalogBuilder.RegisteredAndConnected,
    [
        ("asset-registry",             "Asset Registry & Management",    "Asset Management",          false, I, I, I),
        ("asset-identification",       "Barcode / QR / NFC / RFID",      "Asset Management",          false, I, I, I),
        ("asset-assignment-movement",  "Asset Assignment / Movement",    "Asset Management",          false, I, I, I),
        ("asset-audit-verification",   "Audit / Verification",           "Asset Management",          false, I, I, I),
        ("asset-tracking",             "Asset Tracking",                 "Operations",                false, N, I, I),
        ("maintenance-management",     "Maintenance Management",         "Operations",                false, N, I, I),
        ("inspection-management",      "Inspection Management",          "Operations",                false, N, I, I),
        ("condition-monitoring",       "Condition Monitoring",           "Operations",                false, N, A, I),
        ("work-in-progress",           "Work in Progress",               "Operations",                false, N, A, I),
        ("advanced-analytics",         "Advanced Analytics",             "Analytics & Integration",   false, N, N, I),
        ("api-enterprise-integration", "API / Enterprise Integration",   "Analytics & Integration",   false, I, I, I),
        ("custom-workflow",            "Custom Workflow",                "Analytics & Integration",   false, N, N, I),
    ]);
}

/// <summary>Environment360 sheet. Connected capacity only (no Registered). "Optional" = add-on, "Limited" = Included.</summary>
public static class Environment360Catalog
{
    private const Inclusion I = CatalogBuilder.I, A = CatalogBuilder.A, N = CatalogBuilder.N;

    public static readonly ProductDef Def = CatalogBuilder.Build(Product.Environment360, "Environment360", "E360", CatalogBuilder.ConnectedOnly,
    [
        ("realtime-monitoring-dashboard", "Real-Time Monitoring Dashboard",  "Monitoring",                false, I, I, I),
        ("sensor-device-management",      "Sensor / Device Management",      "Monitoring",                false, I, I, I),
        ("multi-parameter-monitoring",    "Multi-Parameter Monitoring",      "Monitoring",                false, I, I, I),
        ("multi-site-monitoring",         "Multi-Site Monitoring",           "Monitoring",                false, N, I, I),
        ("mobile-web-access",             "Mobile / Web Access",             "Monitoring",                false, I, I, I),
        ("threshold-alerts",              "Threshold-Based Alerts",          "Alerts & Reports",          false, I, I, I),
        ("advanced-alert-rules",          "Advanced Alert Rules",            "Alerts & Reports",          false, N, I, I),
        ("escalation-notifications",      "Escalation & Notifications",      "Alerts & Reports",          false, N, I, I),
        ("historical-data-trends",        "Historical Data & Trends",        "Alerts & Reports",          false, I, I, I),
        ("standard-reports",              "Standard Reports",                "Alerts & Reports",          false, I, I, I),
        ("scheduled-reports",             "Scheduled Reports",               "Alerts & Reports",          false, N, I, I),
        ("workflow-incident-management",  "Workflow / Incident Management",  "Operations",                false, N, I, I),
        ("custom-workflows",              "Custom Workflows",                "Operations",                false, N, N, I),
        ("advanced-analytics",            "Advanced Analytics",              "Analytics & Intelligence",  false, N, I, I),
        ("predictive-analytics-ai",       "Predictive Analytics / AI",       "Analytics & Intelligence",  false, N, N, I),
        ("advanced-data-analytics",       "Advanced Data Analytics",         "Analytics & Intelligence",  false, N, N, I),
        ("digital-twin",                  "Digital Twin",                    "Analytics & Intelligence",  false, N, A, I),
        ("third-party-integration-api",   "Third-Party Integration / API",   "Integration & Enterprise",  false, I, I, I),
        ("enterprise-integration",        "Enterprise Integration",          "Integration & Enterprise",  false, N, N, I),
        ("enterprise-command-center",     "Enterprise / Central Command Center", "Integration & Enterprise", false, N, N, I),
    ]);
}
