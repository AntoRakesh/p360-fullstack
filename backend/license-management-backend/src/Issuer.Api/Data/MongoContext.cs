using MongoDB.Bson;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;

namespace Issuer.Api.Data;

public sealed class MongoContext
{
    static MongoContext()
    {
        ConventionRegistry.Register("p360-license", new ConventionPack
        {
            new CamelCaseElementNameConvention(),
            new EnumRepresentationConvention(BsonType.String),
            new IgnoreExtraElementsConvention(true),
        }, _ => true);
    }

    public MongoContext(IMongoDatabase db)
    {
        Database = db;
        Entitlements = db.GetCollection<EntitlementDoc>("entitlements");
        Admins = db.GetCollection<AdminUser>("admins");
        Credentials = db.GetCollection<CustomerCredential>("customerCredentials");
        Audit = db.GetCollection<AuditDoc>("auditEvents");
    }

    public IMongoDatabase Database { get; }
    public IMongoCollection<EntitlementDoc> Entitlements { get; }
    public IMongoCollection<AdminUser> Admins { get; }
    public IMongoCollection<CustomerCredential> Credentials { get; }
    public IMongoCollection<AuditDoc> Audit { get; }

    public async Task EnsureIndexesAsync(CancellationToken ct = default)
    {
        await Entitlements.Indexes.CreateManyAsync(
        [
            new(Builders<EntitlementDoc>.IndexKeys.Ascending(x => x.SubscriberCode).Descending(x => x.Revision), new CreateIndexOptions { Unique = true }),
            new(Builders<EntitlementDoc>.IndexKeys.Ascending(x => x.State).Ascending(x => x.ValidUntil)),
        ], ct);
        await Admins.Indexes.CreateOneAsync(new CreateIndexModel<AdminUser>(Builders<AdminUser>.IndexKeys.Ascending(x => x.Username), new CreateIndexOptions { Unique = true }), null, ct);
        await Credentials.Indexes.CreateOneAsync(new CreateIndexModel<CustomerCredential>(Builders<CustomerCredential>.IndexKeys.Ascending(x => x.Hash), new CreateIndexOptions { Unique = true }), null, ct);
        await Audit.Indexes.CreateManyAsync(
        [
            new(Builders<AuditDoc>.IndexKeys.Descending(x => x.At)),
            new(Builders<AuditDoc>.IndexKeys.Ascending(x => x.SubscriberCode).Descending(x => x.At)),
        ], ct);
    }
}
