using System.Text.Json;
using Enforcer.Core;
using Licensing.Contracts;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Enforcer.Api;

/// <summary>Second copy of the enforcer state. Merged with the file copy, highest values win.</summary>
public sealed class MongoEnforcerStateStore(IMongoDatabase db) : IEnforcerStateStore
{
    private readonly IMongoCollection<BsonDocument> _col = db.GetCollection<BsonDocument>("license_state");

    public string Name => "mongo";

    public async Task<EnforcerState?> LoadAsync(CancellationToken ct = default)
    {
        var doc = await _col.Find(Builders<BsonDocument>.Filter.Eq("_id", "state")).FirstOrDefaultAsync(ct);
        if (doc is null || !doc.TryGetValue("json", out var json)) return null;
        try { return JsonSerializer.Deserialize<EnforcerState>(json.AsString, LicensingJson.Options); }
        catch (JsonException) { return new EnforcerState { Mac = "corrupt" }; }
    }

    public Task SaveAsync(EnforcerState state, CancellationToken ct = default) =>
        _col.ReplaceOneAsync(
            Builders<BsonDocument>.Filter.Eq("_id", "state"),
            new BsonDocument { ["_id"] = "state", ["json"] = JsonSerializer.Serialize(state, LicensingJson.Options), ["savedAt"] = DateTime.UtcNow },
            new ReplaceOptions { IsUpsert = true },
            ct);
}
