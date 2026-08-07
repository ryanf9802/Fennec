using System.Text.Json;
using Fennec.Core;
using Fennec.Infrastructure;

namespace Fennec.App;

public sealed record SessionMetrics(
    string Record, string WinRate, string Games, string Streak, string GoalDifference, string GoalsForAgainst,
    string Goals, string Assists, string Saves, string Shots,
    string Shooting, string Score, string Demos, string Touches)
{
    public static SessionMetrics Empty { get; } = new("0–0", "—", "0", "—", "0", "0–0", "0", "0", "0", "0", "—", "0", "0", "0");
}

public sealed record MatchRow(
    string Id, string Result, string Score, string Playlist, string When,
    string PersonalLine, string FamiliarPlayers, bool IsLive);

public sealed record PlayerRow(
    string? PrimaryId, string Name, string Score, string Goals, string Assists, string Saves,
    string Shots, string Touches, string Demos, string Encounter);

public sealed record TimelineRow(string Clock, string Title, string Details);

public static class UiProjection
{
    public static SessionMetrics Metrics(IEnumerable<MatchState> matches, string? profileId)
    {
        var all = matches.ToArray();
        if (string.IsNullOrWhiteSpace(profileId)) return SessionMetrics.Empty with { Games = all.Length.ToString() };
        var completed = all.Where(item => item.Lifecycle == MatchLifecycle.Completed &&
            item.Participants.Any(player => player.PrimaryId == profileId)).ToArray();
        var profiles = all.Select(item => (Match: item, Player: item.Participants.FirstOrDefault(p => p.PrimaryId == profileId)))
            .Where(item => item.Player is not null).ToArray();
        var wins = completed.Count(item => IsWin(item, profileId));
        var losses = completed.Length - wins;
        var goalsFor = all.Sum(item => TeamScore(item, profileId));
        var goalsAgainst = all.Sum(item => OpponentScore(item, profileId));
        var shots = profiles.Sum(item => item.Player!.Shots);
        var goals = profiles.Sum(item => item.Player!.Goals);
        var streak = Streak(completed, profileId);
        return new SessionMetrics(
            $"{wins}–{losses}", completed.Length == 0 ? "—" : $"{wins * 100d / completed.Length:0}%",
            all.Length.ToString(), streak, Signed(goalsFor - goalsAgainst), $"{goalsFor}–{goalsAgainst}",
            goals.ToString(), profiles.Sum(item => item.Player!.Assists).ToString(),
            profiles.Sum(item => item.Player!.Saves).ToString(), shots.ToString(),
            shots == 0 ? "—" : $"{goals * 100d / shots:0}%",
            profiles.Length == 0 ? "0" : $"{profiles.Average(item => item.Player!.Score):0}",
            profiles.Sum(item => item.Player!.Demos).ToString(),
            profiles.Sum(item => item.Player!.Touches).ToString());
    }

    public static MatchRow Match(MatchState match, string? profileId, IReadOnlyDictionary<string, EncounterSummary> encounters)
    {
        var profile = match.Participants.FirstOrDefault(item => item.PrimaryId == profileId);
        var result = match.Lifecycle switch
        {
            MatchLifecycle.Live => "LIVE",
            MatchLifecycle.Incomplete => "INCOMPLETE",
            _ when profile is null || match.WinnerTeamNumber is null => "—",
            _ when profile.TeamNumber == match.WinnerTeamNumber => "WIN",
            _ => "LOSS"
        };
        var score = match.Teams.Count >= 2
            ? $"{match.Teams.OrderBy(item => item.TeamNumber).First().Score} – {match.Teams.OrderBy(item => item.TeamNumber).Last().Score}"
            : "—";
        var familiar = match.Participants
            .Where(item => item.PrimaryId is not null && item.PrimaryId != profileId && encounters.ContainsKey(item.PrimaryId))
            .Select(item => encounters[item.PrimaryId!])
            .Where(item => item.GamesTogether + item.GamesOpposed > 1)
            .Take(2)
            .Select(item => item.GamesTogether > 0
                ? $"With {item.LatestName} again ({item.WinsTogether}–{item.LossesTogether} together)"
                : $"Faced {item.LatestName} before")
            .ToArray();
        return new MatchRow(match.Id, result, score, match.PlaylistName,
            match.StartedAt.ToLocalTime().ToString("ddd h:mm tt"),
            profile is null ? "Profile not found" : $"{profile.Goals}G  {profile.Assists}A  {profile.Saves}SV  {profile.Shots}SH",
            string.Join(" · ", familiar), match.Lifecycle == MatchLifecycle.Live);
    }

    public static IReadOnlyList<PlayerRow> Players(MatchState match, string? profileId, IReadOnlyDictionary<string, EncounterSummary> encounters) =>
        match.Participants.OrderBy(item => item.TeamNumber).ThenByDescending(item => item.Score).Select(player =>
        {
            var encounter = string.Empty;
            if (player.PrimaryId is not null && player.PrimaryId != profileId && encounters.TryGetValue(player.PrimaryId, out var summary))
            {
                var profile = match.Participants.FirstOrDefault(item => item.PrimaryId == profileId);
                encounter = profile?.TeamNumber == player.TeamNumber
                    ? $"{summary.GamesTogether} together · {summary.WinsTogether}–{summary.LossesTogether}"
                    : $"Faced {summary.GamesOpposed}× · {summary.WinsAgainst}–{summary.LossesAgainst}";
            }
            return new PlayerRow(player.PrimaryId, player.PrimaryId == profileId ? $"{player.Name}  YOU" : player.Name,
                player.Score.ToString(), player.Goals.ToString(), player.Assists.ToString(), player.Saves.ToString(),
                player.Shots.ToString(), player.Touches.ToString(), player.Demos.ToString(), encounter);
        }).ToArray();

    public static IReadOnlyList<TimelineRow> Timeline(MatchState match, FennecSettings settings)
    {
        var curated = TimelineConfiguration.Curated.Rules.Select(item => item.EventName).ToHashSet(StringComparer.Ordinal);
        return match.Events
            .Where(item => settings.TimelinePreset switch
            {
                TimelinePresetKind.Curated => curated.Contains(item.EventName),
                TimelinePresetKind.Custom => settings.EnabledTimelineEvents?.Contains(item.EventName, StringComparer.Ordinal) == true,
                _ => true
            })
            .OrderByDescending(item => item.Sequence)
            .Select(item => new TimelineRow(FormatClock(item.MatchClockSeconds), FriendlyName(item), settings.TimelinePreset switch
            {
                TimelinePresetKind.Curated => FriendlyDetails(item),
                TimelinePresetKind.Custom => SelectedDetails(item, settings.TimelineAttributes?.GetValueOrDefault(item.EventName) ?? []),
                _ => SelectedDetails(item, FlattenValues(item).Select(pair => pair.Key))
            }))
            .ToArray();
    }

    public static IReadOnlyDictionary<string, string> FlattenValues(TimelineEvent item)
    {
        using var document = JsonDocument.Parse(item.PayloadJson);
        var values = new SortedDictionary<string, string>(StringComparer.Ordinal);
        Flatten(document.RootElement, string.Empty, values);
        return values;
    }

    private static string SelectedDetails(TimelineEvent item, IEnumerable<string> attributes)
    {
        var values = FlattenValues(item);
        return string.Join(" · ", attributes.Where(values.ContainsKey).Select(path => $"{path}: {values[path]}"));
    }

    private static void Flatten(JsonElement element, string prefix, IDictionary<string, string> output)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
                Flatten(property.Value, string.IsNullOrEmpty(prefix) ? property.Name : $"{prefix}.{property.Name}", output);
            return;
        }
        if (element.ValueKind == JsonValueKind.Array)
        {
            output[prefix] = element.GetRawText(); return;
        }
        if (!string.IsNullOrEmpty(prefix)) output[prefix] = element.ToString();
    }

    private static string FriendlyName(TimelineEvent item)
    {
        using var document = JsonDocument.Parse(item.PayloadJson);
        var data = document.RootElement;
        return item.EventName switch
        {
            "GoalScored" => $"Goal · {Path(data, "Scorer.Name") ?? "Unknown"}",
            "CrossbarHit" => $"Crossbar · {Path(data, "BallLastTouch.Player.Name") ?? "Unknown"}",
            "StatfeedEvent" => Path(data, "Type") ?? "Stat",
            "PlayerJoined" => $"{Path(data, "PlayerName") ?? "Player"} joined",
            "PlayerLeft" => $"{Path(data, "PlayerName") ?? "Player"} left",
            "MatchEnded" => "Match ended",
            "RoundStarted" => "Kickoff",
            _ => item.EventName
        };
    }

    private static string FriendlyDetails(TimelineEvent item)
    {
        using var document = JsonDocument.Parse(item.PayloadJson);
        var data = document.RootElement;
        return item.EventName switch
        {
            "GoalScored" => Join(Path(data, "Assister.Name") is { } assister ? $"Assist {assister}" : null,
                Path(data, "GoalSpeed") is { } speed ? $"Speed {speed}" : null),
            "CrossbarHit" => Join(Path(data, "BallSpeed") is { } speed ? $"Speed {speed}" : null,
                Path(data, "ImpactForce") is { } force ? $"Force {force}" : null),
            "StatfeedEvent" => Path(data, "SecondaryTarget.Name") is { } target ? $"Target {target}" : string.Empty,
            _ => string.Empty
        };
    }

    private static string? Path(JsonElement root, string path)
    {
        var current = root;
        foreach (var segment in path.Split('.'))
            if (!current.TryGetProperty(segment, out current)) return null;
        return current.ValueKind == JsonValueKind.String ? current.GetString() : current.ToString();
    }

    private static bool IsWin(MatchState match, string? profileId) =>
        match.Participants.FirstOrDefault(item => item.PrimaryId == profileId) is { } profile &&
        match.WinnerTeamNumber == profile.TeamNumber;
    private static int TeamScore(MatchState match, string? profileId) =>
        match.Participants.FirstOrDefault(item => item.PrimaryId == profileId) is { } profile
            ? match.Teams.FirstOrDefault(item => item.TeamNumber == profile.TeamNumber)?.Score ?? 0 : 0;
    private static int OpponentScore(MatchState match, string? profileId) =>
        match.Participants.FirstOrDefault(item => item.PrimaryId == profileId) is { } profile
            ? match.Teams.Where(item => item.TeamNumber != profile.TeamNumber).Sum(item => item.Score) : 0;
    private static string Streak(IReadOnlyList<MatchState> matches, string? profileId)
    {
        if (matches.Count == 0) return "—";
        var lastWasWin = IsWin(matches[^1], profileId);
        var count = 0;
        for (var index = matches.Count - 1; index >= 0 && IsWin(matches[index], profileId) == lastWasWin; index--) count++;
        return $"{(lastWasWin ? "W" : "L")}{count}";
    }
    private static string Signed(int value) => value > 0 ? $"+{value}" : value.ToString();
    private static string FormatClock(int? seconds) => seconds is null ? "—" : $"{seconds / 60}:{seconds % 60:00}";
    private static string Join(params string?[] values) => string.Join(" · ", values.Where(value => !string.IsNullOrWhiteSpace(value)));
}
