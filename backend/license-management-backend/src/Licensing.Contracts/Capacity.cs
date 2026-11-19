namespace Licensing.Contracts;

/// <summary>One purchased capacity. <c>Quantity</c> null = unlimited.</summary>
public sealed record CapacityGrant
{
    public long? Quantity { get; init; }
}

/// <summary>Registered and Connected capacity bought with the license. A null grant = not purchased.</summary>
public sealed record Capacity
{
    public CapacityGrant? Registered { get; init; }
    public CapacityGrant? Connected { get; init; }
}

/// <summary>Capacity rules per product (see <see cref="ProductDef.Capacity"/>).</summary>
public static class CapacityRules
{
    /// <summary>Products with Registered: Connected alone gets Registered at the auto quantity (50).</summary>
    public static Capacity Normalize(Capacity? c, ProductDef product)
    {
        c ??= new Capacity();
        var o = product.Capacity;
        if (o.Registered is not null && o.AutoRegistered is { } auto && c.Connected is not null && c.Registered is null)
            c = c with { Registered = new CapacityGrant { Quantity = auto } };
        return c;
    }

    /// <summary>Returns an error message, or null when valid.</summary>
    public static string? Validate(Capacity? c, ProductDef product)
    {
        if (c is null) return null;
        var o = product.Capacity;
        if (c.Registered is { } r)
        {
            if (o.Registered is null) return $"{product.Title} has no Registered capacity, only Connected.";
            var autoWithConnected = o.AutoRegistered is { } auto && r.Quantity == auto && c.Connected is not null;
            if (!o.Registered.Contains(r.Quantity) && !autoWithConnected)
                return $"Registered quantity must be {Describe(o.Registered)}" +
                       (o.AutoRegistered is { } a ? $" ({a} only together with Connected)." : ".");
        }
        if (c.Connected is { } k && (k.Quantity is not { } q || !o.Connected.Contains(q)))
            return $"Connected quantity must be {Describe(o.Connected.Select(x => (long?)x))}.";
        return null;
    }

    private static string Describe(IEnumerable<long?> values) =>
        string.Join(", ", values.Select(v => v is null ? "Unlimited" : v.Value.ToString("N0", System.Globalization.CultureInfo.InvariantCulture)));
}
