using System.Text.Json;

namespace Fennec.Core;

public enum MatchLifecycle { Live, Completed, Incomplete }
public enum MatchResult { Unknown, Win, Loss, Tie }
public enum PlaylistCategory { Unknown, Ranked, Casual, Private, Lan }

public sealed record StatsEnvelope(string Event, JsonElement Data)
{
    public static StatsEnvelope Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (!root.TryGetProperty("Event", out var eventName) || eventName.ValueKind != JsonValueKind.String)
            throw new JsonException("Stats API messages require a string Event field.");
        if (!root.TryGetProperty("Data", out var data) || data.ValueKind != JsonValueKind.Object)
            throw new JsonException("Stats API messages require an object Data field.");
        return new StatsEnvelope(eventName.GetString()!, data.Clone());
    }
}

public sealed class ParticipantState
{
    public string Name { get; set; } = "Unknown player";
    public string? PrimaryId { get; set; }
    public int TeamNumber { get; set; }
    public int Score { get; set; }
    public int Goals { get; set; }
    public int Assists { get; set; }
    public int Saves { get; set; }
    public int Shots { get; set; }
    public int Touches { get; set; }
    public int Demos { get; set; }
}

public sealed class TeamState
{
    public int TeamNumber { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Score { get; set; }
    public string ColorPrimary { get; set; } = string.Empty;
}

public sealed class TimelineEvent
{
    public long Sequence { get; init; }
    public required string EventName { get; init; }
    public required DateTimeOffset ReceivedAt { get; init; }
    public int? MatchClockSeconds { get; init; }
    public required string PayloadJson { get; init; }
}

public sealed class MatchState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string? MatchGuid { get; set; }
    public MatchLifecycle Lifecycle { get; set; } = MatchLifecycle.Live;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset LastEventAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public int PlaylistId { get; set; }
    public string PlaylistName { get; set; } = "Unknown playlist";
    public PlaylistCategory PlaylistCategory { get; set; }
    public string Arena { get; set; } = string.Empty;
    public int TimeSeconds { get; set; }
    public bool IsOvertime { get; set; }
    public bool IsReplay { get; set; }
    public int? WinnerTeamNumber { get; set; }
    public List<TeamState> Teams { get; } = [];
    public List<ParticipantState> Participants { get; } = [];
    public List<TimelineEvent> Events { get; } = [];
}

public sealed record SessionGroup(
    string Id,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    IReadOnlyList<MatchState> Matches);

public sealed record EncounterSummary(
    string PrimaryId,
    string LatestName,
    int GamesTogether,
    int WinsTogether,
    int LossesTogether,
    int GamesOpposed,
    int WinsAgainst,
    int LossesAgainst,
    DateTimeOffset FirstSeen,
    DateTimeOffset LastSeen);
