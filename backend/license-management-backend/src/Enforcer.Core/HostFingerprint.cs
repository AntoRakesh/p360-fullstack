using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace Enforcer.Core;

public interface IHostFingerprintProvider
{
    string GetFingerprint();
}

/// <summary>
/// Hash of a stable machine id. Linux: /etc/machine-id. Windows: MachineGuid.
/// Raw id never leaves the machine, only the hash.
/// </summary>
public sealed class DefaultHostFingerprintProvider : IHostFingerprintProvider
{
    private readonly Lazy<string> _value = new(Compute);

    public string GetFingerprint() => _value.Value;

    private static string Compute()
    {
        var id = ReadMachineId() ?? throw new PlatformNotSupportedException("Cannot read a stable machine id on this host.");
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("p360-host-v1|" + RuntimeInformation.OSDescription.Split(' ')[0] + "|" + id.Trim()));
        return "hf1_" + Convert.ToHexStringLower(hash);
    }

    private static string? ReadMachineId()
    {
        if (OperatingSystem.IsLinux())
        {
            foreach (var p in new[] { "/etc/machine-id", "/var/lib/dbus/machine-id" })
                if (File.Exists(p)) return File.ReadAllText(p);
        }
        if (OperatingSystem.IsWindows())
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            return key?.GetValue("MachineGuid") as string;
        }
        return null;
    }
}

public sealed class FixedHostFingerprintProvider(string value) : IHostFingerprintProvider
{
    public string GetFingerprint() => value;
}
