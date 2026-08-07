using System.Text.Json;

namespace Fennec.Core;

public sealed class MatchReducer(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider _timeProvider = timeProvider ?? TimeProvider.System;
    private long _sequence;

    public MatchState? Current { get; private set; }

    public void Resume(MatchState match)
    {
        Current = match;
        _sequence = Math.Max(_sequence, match.Events.Count == 0 ? 0 : match.Events.Max(item => item.Sequence));
    }

    public MatchState Apply(StatsEnvelope message)
    {
        var now = _timeProvider.GetUtcNow();
        var guid = ReadString(message.Data, "MatchGuid");
        if (Current is null || ShouldStartNewMatch(message.Event, guid))
            Current = CreateMatch(guid, now);

        Current.LastEventAt = now;
        if (!string.IsNullOrWhiteSpace(guid)) Current.MatchGuid = guid;

        switch (message.Event)
        {
            case "UpdateState":
                ApplyUpdateState(Current, message.Data);
                break;
            case "ClockUpdatedSeconds":
                Current.TimeSeconds = ReadInt(message.Data, "TimeSeconds");
                Current.IsOvertime = ReadBool(message.Data, "bOvertime");
                StoreEvent(Current, message, now);
                break;
            case "MatchEnded":
                Current.WinnerTeamNumber = TryReadInt(message.Data, "WinnerTeamNum");
                Current.Lifecycle = MatchLifecycle.Completed;
                Current.EndedAt = now;
                StoreEvent(Current, message, now);
                break;
            case "MatchDestroyed":
                if (Current.Lifecycle == MatchLifecycle.Live)
                    Current.Lifecycle = MatchLifecycle.Incomplete;
                Current.EndedAt ??= now;
                StoreEvent(Current, message, now);
                break;
            default:
                StoreEvent(Current, message, now);
                break;
        }

        return Current;
    }

    private bool ShouldStartNewMatch(string eventName, string? guid)
    {
        if (Current is null) return true;
        if (!string.IsNullOrWhiteSpace(guid) && !string.IsNullOrWhiteSpace(Current.MatchGuid) &&
            !string.Equals(Current.MatchGuid, guid, StringComparison.Ordinal))
            return true;
        if (Current.Lifecycle == MatchLifecycle.Live) return false;
        return eventName is "MatchCreated" or "MatchInitialized";
    }

    private static MatchState CreateMatch(string? guid, DateTimeOffset now) => new()
    {
        Id = string.IsNullOrWhiteSpace(guid) ? Guid.NewGuid().ToString("N") : guid,
        MatchGuid = guid,
        StartedAt = now,
        LastEventAt = now
    };

    private void StoreEvent(MatchState match, StatsEnvelope message, DateTimeOffset now) =>
        match.Events.Add(new TimelineEvent
        {
            Sequence = ++_sequence,
            EventName = message.Event,
            ReceivedAt = now,
            MatchClockSeconds = match.TimeSeconds,
            PayloadJson = message.Data.GetRawText()
        });

    private static void ApplyUpdateState(MatchState match, JsonElement data)
    {
        match.Lifecycle = MatchLifecycle.Live;
        match.EndedAt = null;
        if (data.TryGetProperty("Players", out var players) && players.ValueKind == JsonValueKind.Array)
        {
            match.Participants.Clear();
            foreach (var player in players.EnumerateArray())
            {
                match.Participants.Add(new ParticipantState
                {
                    Name = ReadString(player, "Name") ?? "Unknown player",
                    PrimaryId = ReadString(player, "PrimaryId"),
                    TeamNumber = ReadInt(player, "TeamNum"),
                    Score = ReadInt(player, "Score"),
                    Goals = ReadInt(player, "Goals"),
                    Assists = ReadInt(player, "Assists"),
                    Saves = ReadInt(player, "Saves"),
                    Shots = ReadInt(player, "Shots"),
                    Touches = ReadInt(player, "Touches"),
                    Demos = ReadInt(player, "Demos")
                });
            }
        }

        if (!data.TryGetProperty("Game", out var game) || game.ValueKind != JsonValueKind.Object) return;
        match.PlaylistId = ReadInt(game, "PlaylistId");
        (match.PlaylistName, match.PlaylistCategory) = PlaylistCatalog.Resolve(match.PlaylistId);
        match.TimeSeconds = ReadInt(game, "TimeSeconds");
        match.IsOvertime = ReadBool(game, "bOvertime");
        match.IsReplay = ReadBool(game, "bReplay");
        match.Arena = ReadString(game, "Arena") ?? string.Empty;

        if (game.TryGetProperty("Teams", out var teams) && teams.ValueKind == JsonValueKind.Array)
        {
            match.Teams.Clear();
            foreach (var team in teams.EnumerateArray())
            {
                match.Teams.Add(new TeamState
                {
                    TeamNumber = ReadInt(team, "TeamNum"),
                    Name = ReadString(team, "Name") ?? string.Empty,
                    Score = ReadInt(team, "Score"),
                    ColorPrimary = ReadString(team, "ColorPrimary") ?? string.Empty
                });
            }
        }
    }

    private static string? ReadString(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static int ReadInt(JsonElement value, string name) => TryReadInt(value, name) ?? 0;

    private static int? TryReadInt(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.TryGetInt32(out var result) ? result : null;

    private static bool ReadBool(JsonElement value, string name) =>
        value.TryGetProperty(name, out var property) && property.ValueKind == JsonValueKind.True;
}
