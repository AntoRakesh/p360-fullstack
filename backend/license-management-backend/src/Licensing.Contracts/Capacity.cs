namespace Licensing.Contracts;

/// <summary>One purchased capacity. <c>Quantity</c> null = unlimited.</summary>
public sealed record CapacityGrant
{
    public long? Quantity { get; init; }
}

/// <summary>
/// Registered and Connected capacity bought with the license. A null grant = not purchased.
/// Buying Connected without Registered automatically includes Registered (<see cref="CapacityRules.AutoRegisteredQuantity"/>).
/// </summary>
public sealed record Capacity
{
    public CapacityGrant? Registered { get; init; }
    public CapacityGrant? Connected { get; init; }
}

public static class CapacityRules
{
    /// <summary>Registered options. null = unlimited.</summary>
    public static readonly IReadOnlyList<long?> RegisteredOptions = [50_000, 200_000, null];

    public static readonly IReadOnlyList<long> ConnectedOptions = [100, 500, 2_500, 10_000, 50_000];

    /// <summary>
    /// Registered quantity added automatically when only Connected is bought.
    /// Valid only together with Connected; on its own Registered must be one of <see cref="RegisteredOptions"/>.
    /// </summary>
    public const long AutoRegisteredQuantity = 50;

    public static Capacity Normalize(Capacity? c)
    {
        c ??= new Capacity();
        if (c.Connected is not null && c.Registered is null)
            c = c with { Registered = new CapacityGrant { Quantity = AutoRegisteredQuantity } };
        return c;
    }

    /// <summary>Returns an error message, or null when valid.</summary>
    public static string? Validate(Capacity? c)
    {
        if (c is null) return null;
        if (c.Registered is { } r && !RegisteredOptions.Contains(r.Quantity)
            && !(r.Quantity == AutoRegisteredQuantity && c.Connected is not null))
            return "Registered quantity must be 50,000, 200,000 or Unlimited (50 only together with Connected).";
        if (c.Connected is { } k && (k.Quantity is not { } q || !ConnectedOptions.Contains(q)))
            return "Connected quantity must be 100, 500, 2,500, 10,000 or 50,000.";
        return null;
    }
}
