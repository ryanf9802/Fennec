using System.Text.Json;

namespace Fennec.Core;

public enum TimelinePresetKind { Curated, Everything, Custom }

public sealed record TimelineEventRule(string EventName, bool Enabled, IReadOnlyList<string> Attributes);

public sealed record TimelineConfiguration(
    string Name,
    TimelinePresetKind Kind,
    IReadOnlyList<TimelineEventRule> Rules)
{
    private static readonly string[] CuratedEvents =
    [
        "GoalScored", "CrossbarHit", "PlayerJoined", "PlayerLeft", "CountdownBegin",
        "RoundStarted", "MatchEnded", "StatfeedEvent"
    ];

    public static TimelineConfiguration Curated { get; } = new(
        "Curated",
        TimelinePresetKind.Curated,
        CuratedEvents.Select(name => new TimelineEventRule(name, true, DefaultAttributes(name))).ToArray());

    public static TimelineConfiguration Everything(IEnumerable<TimelineEvent> events) => new(
        "Everything",
        TimelinePresetKind.Everything,
        events.Select(item => item.EventName).Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .Select(name => new TimelineEventRule(name, true,
                DiscoverAttributes(events.Where(item => item.EventName == name))))
            .ToArray());

    public static IReadOnlyList<string> DiscoverAttributes(IEnumerable<TimelineEvent> events)
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var item in events)
        {
            using var document = JsonDocument.Parse(item.PayloadJson);
            Flatten(document.RootElement, string.Empty, paths);
        }
        return paths.ToArray();
    }

    private static IReadOnlyList<string> DefaultAttributes(string eventName) => eventName switch
    {
        "GoalScored" => ["Scorer.Name", "Assister.Name", "GoalSpeed"],
        "CrossbarHit" => ["BallLastTouch.Player.Name", "BallSpeed", "ImpactForce"],
        "StatfeedEvent" => ["Type", "MainTarget.Name", "SecondaryTarget.Name"],
        "PlayerJoined" or "PlayerLeft" => ["PlayerName"],
        _ => []
    };

    private static void Flatten(JsonElement element, string prefix, ISet<string> output)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
                Flatten(property.Value, string.IsNullOrEmpty(prefix) ? property.Name : $"{prefix}.{property.Name}", output);
            return;
        }
        if (element.ValueKind == JsonValueKind.Array)
        {
            output.Add(prefix);
            return;
        }
        if (!string.IsNullOrEmpty(prefix)) output.Add(prefix);
    }
}
