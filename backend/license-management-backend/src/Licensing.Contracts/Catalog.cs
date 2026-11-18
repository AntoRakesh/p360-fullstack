namespace Licensing.Contracts;

public sealed record CatalogModule(string Key, string Title, string Group, bool Core);

public sealed record TierDef(Tier Tier, string Title, IReadOnlyDictionary<string, Inclusion> Inclusion, Features Features);

/// <summary>
/// Product catalog. Module keys are the People360 module paths
/// (frontend/p360/src/app/modules.ts). Tier inclusion follows the
/// Essential / Professional / Enterprise sheet.
///
/// The signed license always carries the final module list, so changing this
/// table later does not change licenses already issued.
/// </summary>
public static class ProductCatalog
{
    public static readonly IReadOnlyList<CatalogModule> Modules =
    [
        // Core: always on in every tier
        new("people-identity", "People & Identity Management", "Core", true),
        new("administration-configuration", "Administration & Configuration", "Core", true),
        new("device-edge-management", "Device & Edge Management", "Core", true),
        new("contractor-vendor", "Contractor & Vendor Workforce", "Core", true),
        new("safety-wellbeing", "Safety & Wellbeing", "Core", true),
        new("workplace-facility-services", "Workplace & Facility Services", "Core", true),
        new("training-skills-compliance", "Training, Skills & Compliance", "Core", true),

        new("time-attendance", "Time & Attendance", "Time & Attendance", false),
        new("physical-access-control", "Physical Access Control", "Access Control", false),
        new("visitor-management", "Visitor Management", "Visitor Management", false),
        new("patrol-guard-management", "Patrol & Guard Management", "Patrol Tracking", false),
        new("meal-canteen-management", "Meal & Canteen Management", "Meal Tracking", false),
        new("shift-workforce", "Shift & Workforce Scheduling", "Workforce Management", false),
        new("leave-absence", "Leave & Absence Management", "Workforce Management", false),
        new("tasks-workforce-operations", "Tasks & Workforce Operations", "Workforce Management", false),
        new("emergency-mustering", "Emergency & Mustering", "Emergency Evacuation & Mustering", false),
        new("real-time-location", "Real-Time Location (RTLS)", "RTLS – People Tracking", false),
        new("digital-twin", "Digital Twin & Spatial Intelligence", "Digital Twin", false),
        new("customer-visitor-analytics", "Customer & Visitor Analytics", "Customer Analytics", false),
        new("command-center", "Command Center & Dashboards", "Advanced Analytics & Dashboards", false),
        new("reports-analytics", "Reports & Analytics", "Advanced Analytics & Dashboards", false),
        new("ai-people-intelligence", "AI & People Intelligence", "Advanced Analytics & Dashboards", false),
        new("integrations-api-hub", "Integrations & API Hub", "API / Third-Party Integration", false),
        new("workflow-automation", "Workflow & Automation", "Custom Workflows", false),
    ];

    private const Inclusion I = Inclusion.Included, A = Inclusion.AddOn, N = Inclusion.None;

    //                                         Essential  Professional  Enterprise
    private static readonly (string Key, Inclusion E, Inclusion P, Inclusion X)[] Matrix =
    [
        ("time-attendance",              I, I, I),
        ("physical-access-control",      I, I, I),
        ("visitor-management",           I, I, I),
        ("patrol-guard-management",      N, I, I),
        ("meal-canteen-management",      N, I, I),
        ("shift-workforce",              N, I, I),
        ("leave-absence",                N, I, I),
        ("tasks-workforce-operations",   N, I, I),
        ("emergency-mustering",          N, I, I),
        ("real-time-location",           N, A, I),
        ("digital-twin",                 N, A, I),
        ("customer-visitor-analytics",   N, A, I),
        ("command-center",               I, I, I), // Essential: Basic (see Features.AnalyticsLevel)
        ("reports-analytics",            I, I, I), // Essential: Basic
        ("ai-people-intelligence",       N, I, I), // AI insights are not part of Basic analytics
        ("integrations-api-hub",         I, I, I), // Essential: Limited (see Features.ApiAccess)
        ("workflow-automation",          N, N, I),
    ];

    public static readonly Features EssentialFeatures = new()
    {
        AnalyticsLevel = AnalyticsLevel.Basic,
        ApiAccess = ApiAccess.Limited,
        ApiDailyCallLimit = 1000,
        ApiReadOnly = true,
        MaxSites = 1,
    };

    public static readonly Features FullFeatures = new()
    {
        AnalyticsLevel = AnalyticsLevel.Full,
        ApiAccess = ApiAccess.Full,
        ApiDailyCallLimit = null,
        ApiReadOnly = false,
        MaxSites = null,
    };

    public static readonly IReadOnlyList<TierDef> Tiers =
    [
        Build(Tier.Essential, "People360 Essential", m => m.E, EssentialFeatures),
        Build(Tier.Professional, "People360 Professional", m => m.P, FullFeatures),
        Build(Tier.Enterprise, "People360 Enterprise", m => m.X, FullFeatures),
    ];

    public static TierDef GetTier(Tier tier) => Tiers.First(t => t.Tier == tier);

    public static bool IsKnownModule(string key) => Modules.Any(m => m.Key == key);

    public static bool IsCore(string key) => Modules.Any(m => m.Key == key && m.Core);

    private static TierDef Build(Tier tier, string title, Func<(string Key, Inclusion E, Inclusion P, Inclusion X), Inclusion> pick, Features features)
    {
        var map = new Dictionary<string, Inclusion>();
        foreach (var m in Modules.Where(m => m.Core)) map[m.Key] = Inclusion.Included;
        foreach (var row in Matrix) map[row.Key] = pick(row);
        return new TierDef(tier, title, map, features);
    }
}
