using System.Text.Json;
using Fennec.Core;

namespace Fennec.Infrastructure;

public sealed record FennecSettings(
    int WebSocketPort = 49124,
    int SessionGapMinutes = 30,
    bool StartWithWindows = true,
    bool AutoOpenLiveMatch = false,
    string Theme = "Dark",
    TimelinePresetKind TimelinePreset = TimelinePresetKind.Curated,
    string[]? EnabledTimelineEvents = null,
    Dictionary<string, string[]>? TimelineAttributes = null);

public sealed class AppSettingsStore(string filePath)
{
    private static readonly JsonSerializerOptions Options = new() { WriteIndented = true };

    public async Task<FennecSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(filePath)) return new FennecSettings();
        await using var stream = File.OpenRead(filePath);
        return await JsonSerializer.DeserializeAsync<FennecSettings>(stream, Options, cancellationToken).ConfigureAwait(false)
            ?? new FennecSettings();
    }

    public async Task SaveAsync(FennecSettings settings, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(filePath))!);
        var temporary = $"{filePath}.{Guid.NewGuid():N}.tmp";
        await using (var stream = File.Create(temporary))
            await JsonSerializer.SerializeAsync(stream, settings, Options, cancellationToken).ConfigureAwait(false);
        File.Move(temporary, filePath, overwrite: true);
    }
}
