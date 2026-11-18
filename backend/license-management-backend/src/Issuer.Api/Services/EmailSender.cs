using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace Issuer.Api.Services;

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, string? attachmentName = null, byte[]? attachment = null, CancellationToken ct = default);
}

/// <summary>SMTP when Issuer:Smtp:Host is set, otherwise writes .eml files to the pickup directory (dev).</summary>
public sealed class SmtpEmailSender(IOptions<IssuerOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string body, string? attachmentName = null, byte[]? attachment = null, CancellationToken ct = default)
    {
        var o = options.Value.Smtp;
        using var msg = new MailMessage(o.From, to, subject, body);
        if (attachment is not null)
            msg.Attachments.Add(new Attachment(new MemoryStream(attachment), attachmentName ?? "license.entl", "application/octet-stream"));

        using var client = new SmtpClient();
        if (string.IsNullOrWhiteSpace(o.Host))
        {
            Directory.CreateDirectory(o.PickupDirectory);
            client.DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory;
            client.PickupDirectoryLocation = Path.GetFullPath(o.PickupDirectory);
        }
        else
        {
            client.Host = o.Host;
            client.Port = o.Port;
            client.EnableSsl = o.EnableSsl;
            if (!string.IsNullOrEmpty(o.Username)) client.Credentials = new NetworkCredential(o.Username, o.Password);
        }
        await client.SendMailAsync(msg, ct);
        log.LogInformation("Mail '{Subject}' sent to {To} via {Mode}", subject, to, string.IsNullOrWhiteSpace(o.Host) ? "pickup directory" : "SMTP");
    }
}
