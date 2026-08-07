using System.Text.Json;
using System.Text.RegularExpressions;

namespace Fennec.Infrastructure;

public static partial class RocketLeagueInstallLocator
{
    public static IReadOnlyList<string> FindConfigurationFiles()
    {
        if (!OperatingSystem.IsWindows()) return [];
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddIfPresent(roots, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "Steam", "steamapps", "common", "rocketleague"));
        AddIfPresent(roots, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Epic Games", "rocketleague"));
        AddSteamLibraries(roots);
        AddEpicManifests(roots);

        return roots.SelectMany(root => new[]
            {
                Path.Combine(root, "TAGame", "Config", "TAStatsAPI.ini"),
                Path.Combine(root, "TAGame", "Config", "DefaultStatsAPI.ini")
            })
            .Where(path => File.Exists(path) || Directory.Exists(Path.GetDirectoryName(path)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static void AddSteamLibraries(ISet<string> roots)
    {
        var steam = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam");
        var libraries = Path.Combine(steam, "steamapps", "libraryfolders.vdf");
        if (!File.Exists(libraries)) return;
        foreach (Match match in SteamPathRegex().Matches(File.ReadAllText(libraries)))
        {
            var library = match.Groups[1].Value.Replace("\\\\", "\\", StringComparison.Ordinal);
            AddIfPresent(roots, Path.Combine(library, "steamapps", "common", "rocketleague"));
        }
    }

    private static void AddEpicManifests(ISet<string> roots)
    {
        var manifests = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Epic", "EpicGamesLauncher", "Data", "Manifests");
        if (!Directory.Exists(manifests)) return;
        foreach (var file in Directory.EnumerateFiles(manifests, "*.item"))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                var root = document.RootElement;
                var name = root.TryGetProperty("DisplayName", out var displayName) ? displayName.GetString() : null;
                if (!string.Equals(name, "Rocket League", StringComparison.OrdinalIgnoreCase)) continue;
                if (root.TryGetProperty("InstallLocation", out var location) && location.GetString() is { } path)
                    AddIfPresent(roots, path);
            }
            catch (JsonException) { }
        }
    }

    private static void AddIfPresent(ISet<string> roots, string path)
    {
        if (Directory.Exists(path)) roots.Add(path);
    }

    [GeneratedRegex("\\\"path\\\"\\s+\\\"([^\\\"]+)\\\"", RegexOptions.IgnoreCase)]
    private static partial Regex SteamPathRegex();
}
