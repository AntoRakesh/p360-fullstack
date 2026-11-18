using Issuer.Api.Data;
using Issuer.Api.Dto;
using Issuer.Api.Security;
using Licensing.Contracts;
using Microsoft.AspNetCore.DataProtection;
using MongoDB.Driver;

namespace Issuer.Api.Services;

public sealed class DomainException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public sealed class EntitlementService(
    MongoContext db,
    EntitlementSigner signer,
    AuditService audit,
    IEmailSender email,
    IDataProtectionProvider dataProtection,
    TimeProvider time,
    ILogger<EntitlementService> log)
{
    private DateTime Now => Truncate(time.GetUtcNow().UtcDateTime);

    // ---------------------------------------------------------------- queries

    public async Task<EntitlementDoc?> GetAsync(string id, CancellationToken ct) =>
        MongoDB.Bson.ObjectId.TryParse(id, out _)
            ? await db.Entitlements.Find(x => x.Id == id).FirstOrDefaultAsync(ct)
            : null;

    /// <summary>Current row of a subscriber = highest revision.</summary>
    public async Task<EntitlementDoc?> GetCurrentAsync(string subscriberCode, CancellationToken ct) =>
        await db.Entitlements.Find(x => x.SubscriberCode == subscriberCode).SortByDescending(x => x.Revision).FirstOrDefaultAsync(ct);

    public Task<List<EntitlementDoc>> HistoryAsync(string subscriberCode, CancellationToken ct) =>
        db.Entitlements.Find(x => x.SubscriberCode == subscriberCode).SortByDescending(x => x.Revision).ToListAsync(ct);

    public async Task<string?> KeyPrefixAsync(string subscriberCode, CancellationToken ct) =>
        (await db.Credentials.Find(c => c.SubscriberCode == subscriberCode && c.RevokedAt == null)
            .SortByDescending(c => c.CreatedAt).FirstOrDefaultAsync(ct))?.Prefix;

    // ---------------------------------------------------------------- create

    public async Task<EntitlementDoc> CreateAsync(EntitlementInput input, string who, string? ip, CancellationToken ct)
    {
        var code = string.IsNullOrWhiteSpace(input.SubscriberCode) ? await UniqueCodeAsync(ct) : input.SubscriberCode.Trim();
        if (await db.Entitlements.Find(x => x.SubscriberCode == code).AnyAsync(ct))
            throw new DomainException(409, $"Subscriber code '{code}' already exists. Use Renew for existing customers.");

        var now = Now;
        var doc = Sign(new EntitlementDoc
        {
            SubscriberCode = code,
            CustomerName = input.CustomerName.Trim(),
            ContactEmail = input.ContactEmail.Trim(),
            Revision = 1,
            State = EntitlementState.Live,
            Tier = input.Tier,
            Modules = NormalizeModules(input.Modules),
            Capacity = CapacityRules.Normalize(input.Capacity),
            ValidFrom = Truncate(input.ValidFrom.ToUniversalTime()),
            ValidUntil = Truncate(input.ValidUntil.ToUniversalTime()),
            MinBuild = Blank(input.MinBuild),
            MaxBuild = Blank(input.MaxBuild),
            HostingMode = input.HostingMode,
            HostFingerprint = input.HostingMode == HostingMode.OnPrem ? Blank(input.HostFingerprint) : null, // machine binding is OnPrem only
            IssuedAt = now,
            IssuedBy = who,
            Notes = Blank(input.Notes),
            ClientDbConnectionProtected = Blank(input.ClientDbConnectionString) is { } cdb ? ClientDb.Protect(cdb) : null,
            SignedFile = "",
        });

        try { await db.Entitlements.InsertOneAsync(doc, cancellationToken: ct); }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { throw new DomainException(409, $"Subscriber code '{code}' already exists."); }

        await audit.WriteAsync(who, "entitlement.create", null, doc, ip, ct);
        await MailFileAsync(doc, "Your People360 license", ct);
        return doc;
    }

    // ---------------------------------------------------------------- renew

    /// <summary>Inserts revision+1 and marks the previous row Superseded. Never edits license terms in place.</summary>
    public async Task<EntitlementDoc> RenewAsync(string id, RenewInput input, string who, string? ip, CancellationToken ct)
    {
        var prev = await GetAsync(id, ct) ?? throw new DomainException(404, "Entitlement not found.");
        var current = await GetCurrentAsync(prev.SubscriberCode, ct);
        if (current!.Id != prev.Id) throw new DomainException(409, $"Revision {prev.Revision} is not the current one (current is {current.Revision}).");
        if (prev.State == EntitlementState.Revoked) throw new DomainException(409, "A revoked license cannot be renewed. Create a new one.");

        var tier = input.Tier ?? prev.Tier;
        var next = Sign(new EntitlementDoc
        {
            SubscriberCode = prev.SubscriberCode,
            CustomerName = prev.CustomerName,
            ContactEmail = prev.ContactEmail,
            Revision = prev.Revision + 1,
            State = EntitlementState.Live,
            Tier = tier,
            Modules = input.Modules is null ? prev.Modules : NormalizeModules(input.Modules),
            Capacity = input.Capacity is null ? CapacityRules.Normalize(prev.Capacity) : CapacityRules.Normalize(input.Capacity),
            ValidFrom = prev.ValidFrom,
            ValidUntil = Truncate(input.ValidUntil.ToUniversalTime()),
            MinBuild = prev.MinBuild,
            MaxBuild = prev.MaxBuild,
            HostingMode = prev.HostingMode,
            HostFingerprint = prev.HostingMode != HostingMode.OnPrem ? null
                : input.HostFingerprint is null ? prev.HostFingerprint : Blank(input.HostFingerprint),
            IssuedAt = Now,
            IssuedBy = who,
            Notes = input.Notes ?? prev.Notes,
            ClientDbConnectionProtected = prev.ClientDbConnectionProtected,
            SignedFile = "",
        });

        try { await db.Entitlements.InsertOneAsync(next, cancellationToken: ct); }
        catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { throw new DomainException(409, "Another renewal happened at the same time. Reload and try again."); }

        var superseded = await db.Entitlements.FindOneAndUpdateAsync(
            x => x.Id == prev.Id,
            Builders<EntitlementDoc>.Update.Set(x => x.State, EntitlementState.Superseded).Set(x => x.StateReason, $"Renewed as revision {next.Revision}"),
            new FindOneAndUpdateOptions<EntitlementDoc> { ReturnDocument = ReturnDocument.After }, ct);

        await audit.WriteAsync(who, "entitlement.renew", prev, next, ip, ct);
        await audit.WriteAsync(who, "entitlement.supersede", prev, superseded, ip, ct);
        await MailFileAsync(next, $"Your People360 license was renewed (revision {next.Revision})", ct);
        return next;
    }

    // ---------------------------------------------------------------- state changes

    public Task<EntitlementDoc> SuspendAsync(string id, string reason, string who, string? ip, CancellationToken ct) =>
        ChangeStateAsync(id, [EntitlementState.Live], _ => EntitlementState.Suspended, reason, "entitlement.suspend", who, ip, ct);

    public Task<EntitlementDoc> ResumeAsync(string id, string reason, string who, string? ip, CancellationToken ct) =>
        ChangeStateAsync(id, [EntitlementState.Suspended],
            d => d.ValidUntil < Now ? EntitlementState.Expired : EntitlementState.Live, reason, "entitlement.resume", who, ip, ct);

    public Task<EntitlementDoc> RevokeAsync(string id, string reason, string who, string? ip, CancellationToken ct) =>
        ChangeStateAsync(id, [EntitlementState.Live, EntitlementState.Suspended, EntitlementState.Expired],
            _ => EntitlementState.Revoked, reason, "entitlement.revoke", who, ip, ct);

    private async Task<EntitlementDoc> ChangeStateAsync(
        string id, EntitlementState[] from, Func<EntitlementDoc, EntitlementState> to, string reason,
        string action, string who, string? ip, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw new DomainException(400, "A reason is required (max 500 characters).");
        var before = await GetAsync(id, ct) ?? throw new DomainException(404, "Entitlement not found.");
        if (!from.Contains(before.State)) throw new DomainException(409, $"Cannot {action.Split('.')[1]} a license that is {before.State}.");

        // Conditional on the old state so two admins cannot race each other.
        var after = await db.Entitlements.FindOneAndUpdateAsync(
            x => x.Id == id && x.State == before.State,
            Builders<EntitlementDoc>.Update.Set(x => x.State, to(before)).Set(x => x.StateReason, reason.Trim()),
            new FindOneAndUpdateOptions<EntitlementDoc> { ReturnDocument = ReturnDocument.After }, ct)
            ?? throw new DomainException(409, "The license changed meanwhile. Reload and try again.");

        await audit.WriteAsync(who, action, before, after, ip, ct);
        return after;
    }

    /// <summary>Background sweep: Live rows past validUntil become Expired, whether or not the customer ever pings.</summary>
    public async Task<int> ExpireDueAsync(CancellationToken ct)
    {
        var now = Now;
        var due = await db.Entitlements.Find(x => x.State == EntitlementState.Live && x.ValidUntil < now).ToListAsync(ct);
        var n = 0;
        foreach (var before in due)
        {
            var after = await db.Entitlements.FindOneAndUpdateAsync(
                x => x.Id == before.Id && x.State == EntitlementState.Live,
                Builders<EntitlementDoc>.Update.Set(x => x.State, EntitlementState.Expired).Set(x => x.StateReason, "Validity period ended"),
                new FindOneAndUpdateOptions<EntitlementDoc> { ReturnDocument = ReturnDocument.After }, ct);
            if (after is null) continue;
            await audit.WriteAsync("system", "entitlement.expire", before, after, null, ct);
            n++;
        }
        return n;
    }

    // ---------------------------------------------------------------- credentials

    public async Task<(string ApiKey, string Prefix)> IssueCredentialAsync(string id, string who, string? ip, CancellationToken ct)
    {
        var doc = await GetAsync(id, ct) ?? throw new DomainException(404, "Entitlement not found.");
        var kind = doc.HostingMode == HostingMode.OnPrem ? CredentialKind.InstallKey : CredentialKind.ServiceToken;
        var raw = SecretHashing.NewCredential(kind == CredentialKind.InstallKey ? "p360ik_" : "p360st_");
        var prefix = raw[..14];
        var now = Now;

        await db.Credentials.UpdateManyAsync(
            c => c.SubscriberCode == doc.SubscriberCode && c.RevokedAt == null,
            Builders<CustomerCredential>.Update.Set(c => c.RevokedAt, now), cancellationToken: ct);
        await db.Credentials.InsertOneAsync(new CustomerCredential
        {
            SubscriberCode = doc.SubscriberCode,
            Kind = kind,
            Hash = SecretHashing.Sha256Hex(raw),
            Prefix = prefix,
            CreatedAt = now,
            CreatedBy = who,
        }, cancellationToken: ct);

        await audit.WriteRawAsync(who, "credential.issue", doc.SubscriberCode, new { kind = kind.ToString(), prefix }, ip, ct);
        return (raw, prefix);
    }

    public async Task<CustomerCredential?> FindCredentialAsync(string subscriberCode, string raw, CredentialKind kind, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(raw) || raw.Length > 200) return null;
        var hash = SecretHashing.Sha256Hex(raw);
        return await db.Credentials.Find(c => c.Hash == hash && c.Kind == kind && c.SubscriberCode == subscriberCode && c.RevokedAt == null)
            .FirstOrDefaultAsync(ct);
    }

    // ---------------------------------------------------------------- customer contact

    public async Task<(EntitlementDoc Current, SignedEnvelope Receipt)> RecordContactAsync(string subscriberCode, bool isCheckin, string? hostFingerprint, CancellationToken ct)
    {
        var current = await GetCurrentAsync(subscriberCode, ct) ?? throw new DomainException(404, "Unknown subscriber.");
        if (isCheckin && current.HostFingerprint is not null && current.HostFingerprint != hostFingerprint)
            throw new DomainException(403, "Host fingerprint does not match the license.");

        var now = Now;
        var update = isCheckin
            ? Builders<EntitlementDoc>.Update.Set(x => x.LastCheckinAt, now)
            : Builders<EntitlementDoc>.Update.Set(x => x.LastPingAt, now);
        await db.Entitlements.UpdateOneAsync(x => x.Id == current.Id, update, cancellationToken: ct);

        var state = current.State == EntitlementState.Live && current.ValidUntil < now ? EntitlementState.Expired : current.State;
        var receipt = signer.Sign(new CheckinReceipt
        {
            SubscriberCode = current.SubscriberCode,
            State = state,
            LatestRevision = current.Revision,
            ValidUntil = current.ValidUntil,
            ServerTime = time.GetUtcNow().UtcDateTime, // full precision: receipts must be strictly ordered
            HostFingerprint = current.HostFingerprint,
            Nonce = EntitlementSigner.NewNonce(),
        });
        return (current, receipt);
    }

    // ---------------------------------------------------------------- helpers

    public static byte[] FileBytes(EntitlementDoc d) => Convert.FromBase64String(d.SignedFile);
    public static string FileName(EntitlementDoc d) => $"{d.SubscriberCode}-r{d.Revision}.entl";

    private EntitlementDoc Sign(EntitlementDoc d)
    {
        var env = signer.Sign(new EntitlementPayload
        {
            EntitlementId = d.Id,
            SubscriberCode = d.SubscriberCode,
            CustomerName = d.CustomerName,
            Revision = d.Revision,
            State = EntitlementState.Live,
            Tier = d.Tier,
            Modules = d.Modules,
            Capacity = d.Capacity,
            ValidFrom = d.ValidFrom,
            ValidUntil = d.ValidUntil,
            MinBuild = d.MinBuild,
            MaxBuild = d.MaxBuild,
            HostingMode = d.HostingMode,
            HostFingerprint = d.HostFingerprint,
            IssuedAt = d.IssuedAt,
            Nonce = EntitlementSigner.NewNonce(),
        });
        d.SignedFile = Convert.ToBase64String(EnvelopeCodec.Write(env));
        return d;
    }

    /// <summary>Only the modules the admin selected (core modules can be left out). Order follows the catalog.</summary>
    private static List<ModuleGrant> NormalizeModules(List<ModuleGrant> input)
    {
        var byKey = input.ToDictionary(m => m.ModuleKey);
        return ProductCatalog.Modules.Where(m => byKey.ContainsKey(m.Key))
            .Select(m => byKey[m.Key] with { ModuleValidUntil = byKey[m.Key].ModuleValidUntil is { } v ? Truncate(v.ToUniversalTime()) : null })
            .ToList();
    }

    private async Task<string> UniqueCodeAsync(CancellationToken ct)
    {
        for (var i = 0; i < 10; i++)
        {
            var c = SecretHashing.NewSubscriberCode();
            if (!await db.Entitlements.Find(x => x.SubscriberCode == c).AnyAsync(ct)) return c;
        }
        throw new DomainException(500, "Could not generate a unique subscriber code.");
    }

    private async Task MailFileAsync(EntitlementDoc d, string subject, CancellationToken ct)
    {
        try
        {
            await email.SendAsync(d.ContactEmail, subject,
                $"Hello {d.CustomerName},\n\nAttached is your People360 {d.Tier} license (revision {d.Revision}), valid until {d.ValidUntil:yyyy-MM-dd}.\n" +
                "Import it in People360 under Administration → License.\n\nThis file is signed. Editing it makes it invalid.\n",
                FileName(d), FileBytes(d), ct);
        }
        catch (Exception ex)
        {
            // License is issued even if mail fails; admin can download and send it manually.
            log.LogError(ex, "Could not email license {Subscriber} r{Revision}", d.SubscriberCode, d.Revision);
        }
    }

    private IDataProtector ClientDb => dataProtection.CreateProtector("client-db-connection");

    /// <summary>Full connection string (decrypted), or null when none is stored.</summary>
    public string? RevealClientDb(EntitlementDoc d) =>
        d.ClientDbConnectionProtected is null ? null : ClientDb.Unprotect(d.ClientDbConnectionProtected);

    /// <summary>Masked connection string for display, or null when none is stored.</summary>
    public string? MaskedClientDb(EntitlementDoc d)
    {
        try { return ConnectionStringMasker.Mask(RevealClientDb(d)); }
        catch (System.Security.Cryptography.CryptographicException) { return "(stored, cannot decrypt — data protection keys changed)"; }
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static DateTime Truncate(DateTime d) => new(d.Ticks - d.Ticks % TimeSpan.TicksPerSecond, DateTimeKind.Utc);
}
