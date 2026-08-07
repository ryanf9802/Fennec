namespace Fennec.Core;

public sealed record IniUpdateResult(string FilePath, string BackupPath, int PacketSendRate, int WebPort);

public static class StatsApiIniEditor
{
    public const string Section = "TAGame.MatchStatsExporter_TA";

    public static IniUpdateResult Update(string filePath, int packetSendRate, int webPort)
    {
        ValidateTarget(filePath);
        if (packetSendRate is < 1 or > 120)
            throw new ArgumentOutOfRangeException(nameof(packetSendRate), "Packet send rate must be between 1 and 120.");
        if (webPort is < 1024 or > 65535)
            throw new ArgumentOutOfRangeException(nameof(webPort), "WebSocket port must be between 1024 and 65535.");

        var fullPath = Path.GetFullPath(filePath);
        var original = File.Exists(fullPath) ? File.ReadAllText(fullPath) : string.Empty;
        var newline = original.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var lines = original.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n').ToList();
        if (lines.Count == 1 && lines[0].Length == 0) lines.Clear();

        var sectionStart = FindSection(lines, Section);
        if (sectionStart < 0)
        {
            if (lines.Count > 0 && lines[^1].Length != 0) lines.Add(string.Empty);
            lines.Add($"[{Section}]");
            sectionStart = lines.Count - 1;
        }

        var sectionEnd = lines.FindIndex(sectionStart + 1, line =>
            line.TrimStart().StartsWith("[", StringComparison.Ordinal));
        if (sectionEnd < 0) sectionEnd = lines.Count;
        SetValue(lines, sectionStart + 1, ref sectionEnd, "PacketSendRate", packetSendRate.ToString());
        SetValue(lines, sectionStart + 1, ref sectionEnd, "WebPort", webPort.ToString());

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        var backupPath = $"{fullPath}.{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.bak";
        if (File.Exists(fullPath)) File.Copy(fullPath, backupPath, overwrite: false);
        else File.WriteAllText(backupPath, string.Empty);

        var temporaryPath = $"{fullPath}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporaryPath, string.Join(newline, lines));
        File.Move(temporaryPath, fullPath, overwrite: true);
        return new IniUpdateResult(fullPath, backupPath, packetSendRate, webPort);
    }

    public static void ValidateTarget(string filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath)) throw new ArgumentException("A configuration file is required.", nameof(filePath));
        var fullPath = Path.GetFullPath(filePath);
        var fileName = Path.GetFileName(fullPath);
        if (!fileName.Equals("TAStatsAPI.ini", StringComparison.OrdinalIgnoreCase) &&
            !fileName.Equals("DefaultStatsAPI.ini", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only Rocket League Stats API INI files can be modified.");

        var directory = new DirectoryInfo(Path.GetDirectoryName(fullPath)!);
        if (!directory.Name.Equals("Config", StringComparison.OrdinalIgnoreCase) ||
            directory.Parent is null ||
            !directory.Parent.Name.Equals("TAGame", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The configuration file must be under TAGame\\Config.");
    }

    private static int FindSection(IReadOnlyList<string> lines, string section)
    {
        var expected = $"[{section}]";
        for (var index = 0; index < lines.Count; index++)
            if (lines[index].Trim().Equals(expected, StringComparison.OrdinalIgnoreCase)) return index;
        return -1;
    }

    private static void SetValue(List<string> lines, int start, ref int end, string key, string value)
    {
        for (var index = start; index < end; index++)
        {
            var trimmed = lines[index].TrimStart();
            if (!trimmed.StartsWith($"{key}=", StringComparison.OrdinalIgnoreCase)) continue;
            var indentation = lines[index][..(lines[index].Length - trimmed.Length)];
            lines[index] = $"{indentation}{key}={value}";
            return;
        }
        lines.Insert(end, $"{key}={value}");
        end++;
    }
}
