using System.Globalization;
using System.Text;
using System.Text.Json;
using Fennec.Core;
using Microsoft.Data.Sqlite;

namespace Fennec.Infrastructure;

public sealed class SqliteFennecStore(string databasePath)
{
    private static int _providerInitialized;
    private readonly string _connectionString = new SqliteConnectionStringBuilder
    {
        DataSource = databasePath,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Shared
    }.ToString();

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (OperatingSystem.IsWindows() && Interlocked.Exchange(ref _providerInitialized, 1) == 0)
            SQLitePCL.raw.SetProvider(new SQLitePCL.SQLite3Provider_winsqlite3());
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(databasePath))!);
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                primary_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                match_guid TEXT,
                lifecycle INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                last_event_at TEXT NOT NULL,
                ended_at TEXT,
                playlist_id INTEGER NOT NULL,
                playlist_name TEXT NOT NULL,
                playlist_category INTEGER NOT NULL,
                arena TEXT NOT NULL,
                time_seconds INTEGER NOT NULL,
                is_overtime INTEGER NOT NULL,
                winner_team_number INTEGER,
                snapshot_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS participants (
                match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
                ordinal INTEGER NOT NULL,
                primary_id TEXT,
                display_name TEXT NOT NULL,
                team_number INTEGER NOT NULL,
                score INTEGER NOT NULL,
                goals INTEGER NOT NULL,
                assists INTEGER NOT NULL,
                saves INTEGER NOT NULL,
                shots INTEGER NOT NULL,
                touches INTEGER NOT NULL,
                demos INTEGER NOT NULL,
                PRIMARY KEY (match_id, ordinal)
            );
            CREATE INDEX IF NOT EXISTS ix_participants_primary_id ON participants(primary_id);
            CREATE TABLE IF NOT EXISTS timeline_events (
                match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL,
                event_name TEXT NOT NULL,
                received_at TEXT NOT NULL,
                match_clock_seconds INTEGER,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (match_id, sequence)
            );
            CREATE TABLE IF NOT EXISTS timeline_presets (
                name TEXT PRIMARY KEY,
                preset_json TEXT NOT NULL
            );
            INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '1');
            """;
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task SaveProfileAsync(string primaryId, string displayName, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO profile(id, primary_id, display_name, updated_at)
            VALUES (1, $primaryId, $displayName, $updatedAt)
            ON CONFLICT(id) DO UPDATE SET
                primary_id=excluded.primary_id,
                display_name=excluded.display_name,
                updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$primaryId", primaryId);
        command.Parameters.AddWithValue("$displayName", displayName);
        command.Parameters.AddWithValue("$updatedAt", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<(string PrimaryId, string DisplayName)?> GetProfileAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = "SELECT primary_id, display_name FROM profile WHERE id=1";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        return await reader.ReadAsync(cancellationToken).ConfigureAwait(false)
            ? (reader.GetString(0), reader.GetString(1))
            : null;
    }

    public async Task SaveMatchAsync(MatchState match, CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken).ConfigureAwait(false);
        var matchCommand = connection.CreateCommand();
        matchCommand.Transaction = (SqliteTransaction)transaction;
        matchCommand.CommandText = """
            INSERT INTO matches(
                id, match_guid, lifecycle, started_at, last_event_at, ended_at,
                playlist_id, playlist_name, playlist_category, arena, time_seconds,
                is_overtime, winner_team_number, snapshot_json)
            VALUES (
                $id, $guid, $lifecycle, $started, $lastEvent, $ended,
                $playlistId, $playlistName, $playlistCategory, $arena, $time,
                $overtime, $winner, $snapshot)
            ON CONFLICT(id) DO UPDATE SET
                match_guid=excluded.match_guid,
                lifecycle=excluded.lifecycle,
                last_event_at=excluded.last_event_at,
                ended_at=excluded.ended_at,
                playlist_id=excluded.playlist_id,
                playlist_name=excluded.playlist_name,
                playlist_category=excluded.playlist_category,
                arena=excluded.arena,
                time_seconds=excluded.time_seconds,
                is_overtime=excluded.is_overtime,
                winner_team_number=excluded.winner_team_number,
                snapshot_json=excluded.snapshot_json;
            """;
        Add(matchCommand, "$id", match.Id);
        Add(matchCommand, "$guid", match.MatchGuid);
        Add(matchCommand, "$lifecycle", (int)match.Lifecycle);
        Add(matchCommand, "$started", Format(match.StartedAt));
        Add(matchCommand, "$lastEvent", Format(match.LastEventAt));
        Add(matchCommand, "$ended", match.EndedAt is null ? null : Format(match.EndedAt.Value));
        Add(matchCommand, "$playlistId", match.PlaylistId);
        Add(matchCommand, "$playlistName", match.PlaylistName);
        Add(matchCommand, "$playlistCategory", (int)match.PlaylistCategory);
        Add(matchCommand, "$arena", match.Arena);
        Add(matchCommand, "$time", match.TimeSeconds);
        Add(matchCommand, "$overtime", match.IsOvertime ? 1 : 0);
        Add(matchCommand, "$winner", match.WinnerTeamNumber);
        Add(matchCommand, "$snapshot", JsonSerializer.Serialize(match.Teams));
        await matchCommand.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

        await ReplaceChildrenAsync(connection, (SqliteTransaction)transaction, match, cancellationToken).ConfigureAwait(false);
        await transaction.CommitAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<MatchState>> LoadMatchesAsync(CancellationToken cancellationToken = default)
    {
        var matches = new List<MatchState>();
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, match_guid, lifecycle, started_at, last_event_at, ended_at,
                   playlist_id, playlist_name, playlist_category, arena, time_seconds,
                   is_overtime, winner_team_number, snapshot_json
            FROM matches ORDER BY started_at;
            """;
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false))
        {
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                var match = new MatchState
                {
                    Id = reader.GetString(0),
                    MatchGuid = reader.IsDBNull(1) ? null : reader.GetString(1),
                    Lifecycle = (MatchLifecycle)reader.GetInt32(2),
                    StartedAt = Parse(reader.GetString(3)),
                    LastEventAt = Parse(reader.GetString(4)),
                    EndedAt = reader.IsDBNull(5) ? null : Parse(reader.GetString(5)),
                    PlaylistId = reader.GetInt32(6),
                    PlaylistName = reader.GetString(7),
                    PlaylistCategory = (PlaylistCategory)reader.GetInt32(8),
                    Arena = reader.GetString(9),
                    TimeSeconds = reader.GetInt32(10),
                    IsOvertime = reader.GetInt32(11) != 0,
                    WinnerTeamNumber = reader.IsDBNull(12) ? null : reader.GetInt32(12)
                };
                var teams = JsonSerializer.Deserialize<List<TeamState>>(reader.GetString(13)) ?? [];
                match.Teams.AddRange(teams);
                matches.Add(match);
            }
        }

        foreach (var match in matches)
            await LoadChildrenAsync(connection, match, cancellationToken).ConfigureAwait(false);
        return matches;
    }

    public async Task ClearHistoryAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM timeline_events; DELETE FROM participants; DELETE FROM matches;";
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task ExportAsync(string directory, string? profilePrimaryId, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(directory);
        var matches = await LoadMatchesAsync(cancellationToken).ConfigureAwait(false);
        var stamp = DateTimeOffset.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
        var jsonPath = Path.Combine(directory, $"fennec-export-{stamp}.json");
        await File.WriteAllTextAsync(jsonPath, JsonSerializer.Serialize(matches, new JsonSerializerOptions { WriteIndented = true }), cancellationToken).ConfigureAwait(false);

        var csv = new StringBuilder("match_id,started_at,playlist,lifecycle,result,player,score,goals,assists,saves,shots,touches,demos\n");
        foreach (var match in matches)
        {
            var profile = match.Participants.FirstOrDefault(item => item.PrimaryId == profilePrimaryId);
            var result = profile is null || match.WinnerTeamNumber is null ? "unknown" :
                match.WinnerTeamNumber == profile.TeamNumber ? "win" : "loss";
            foreach (var player in match.Participants)
            {
                csv.Append(Csv(match.Id)).Append(',').Append(Csv(Format(match.StartedAt))).Append(',')
                    .Append(Csv(match.PlaylistName)).Append(',').Append(Csv(match.Lifecycle.ToString())).Append(',')
                    .Append(Csv(result)).Append(',').Append(Csv(player.Name)).Append(',')
                    .Append(player.Score).Append(',').Append(player.Goals).Append(',').Append(player.Assists).Append(',')
                    .Append(player.Saves).Append(',').Append(player.Shots).Append(',').Append(player.Touches).Append(',')
                    .Append(player.Demos).Append('\n');
            }
        }
        await File.WriteAllTextAsync(Path.Combine(directory, $"fennec-matches-{stamp}.csv"), csv.ToString(), cancellationToken).ConfigureAwait(false);
    }

    private static async Task ReplaceChildrenAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        MatchState match,
        CancellationToken cancellationToken)
    {
        var deleteParticipants = connection.CreateCommand();
        deleteParticipants.Transaction = transaction;
        deleteParticipants.CommandText = "DELETE FROM participants WHERE match_id=$id";
        deleteParticipants.Parameters.AddWithValue("$id", match.Id);
        await deleteParticipants.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);

        for (var index = 0; index < match.Participants.Count; index++)
        {
            var participant = match.Participants[index];
            var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO participants VALUES (
                    $matchId, $ordinal, $primaryId, $name, $team, $score, $goals,
                    $assists, $saves, $shots, $touches, $demos);
                """;
            Add(insert, "$matchId", match.Id); Add(insert, "$ordinal", index);
            Add(insert, "$primaryId", participant.PrimaryId); Add(insert, "$name", participant.Name);
            Add(insert, "$team", participant.TeamNumber); Add(insert, "$score", participant.Score);
            Add(insert, "$goals", participant.Goals); Add(insert, "$assists", participant.Assists);
            Add(insert, "$saves", participant.Saves); Add(insert, "$shots", participant.Shots);
            Add(insert, "$touches", participant.Touches); Add(insert, "$demos", participant.Demos);
            await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }

        var latestEvent = connection.CreateCommand();
        latestEvent.Transaction = transaction;
        latestEvent.CommandText = "SELECT COALESCE(MAX(sequence), 0) FROM timeline_events WHERE match_id=$id";
        latestEvent.Parameters.AddWithValue("$id", match.Id);
        var persistedSequence = Convert.ToInt64(await latestEvent.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false), CultureInfo.InvariantCulture);
        foreach (var item in match.Events.Where(item => item.Sequence > persistedSequence))
        {
            var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = "INSERT INTO timeline_events VALUES ($matchId,$sequence,$name,$received,$clock,$payload)";
            Add(insert, "$matchId", match.Id); Add(insert, "$sequence", item.Sequence);
            Add(insert, "$name", item.EventName); Add(insert, "$received", Format(item.ReceivedAt));
            Add(insert, "$clock", item.MatchClockSeconds); Add(insert, "$payload", item.PayloadJson);
            await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task LoadChildrenAsync(SqliteConnection connection, MatchState match, CancellationToken cancellationToken)
    {
        var participants = connection.CreateCommand();
        participants.CommandText = """
            SELECT primary_id, display_name, team_number, score, goals, assists, saves, shots, touches, demos
            FROM participants WHERE match_id=$id ORDER BY ordinal;
            """;
        participants.Parameters.AddWithValue("$id", match.Id);
        await using (var reader = await participants.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false))
        {
            while (await reader.ReadAsync(cancellationToken).ConfigureAwait(false))
            {
                match.Participants.Add(new ParticipantState
                {
                    PrimaryId = reader.IsDBNull(0) ? null : reader.GetString(0),
                    Name = reader.GetString(1),
                    TeamNumber = reader.GetInt32(2),
                    Score = reader.GetInt32(3),
                    Goals = reader.GetInt32(4),
                    Assists = reader.GetInt32(5),
                    Saves = reader.GetInt32(6),
                    Shots = reader.GetInt32(7),
                    Touches = reader.GetInt32(8),
                    Demos = reader.GetInt32(9)
                });
            }
        }

        var events = connection.CreateCommand();
        events.CommandText = """
            SELECT sequence, event_name, received_at, match_clock_seconds, payload_json
            FROM timeline_events WHERE match_id=$id ORDER BY sequence;
            """;
        events.Parameters.AddWithValue("$id", match.Id);
        await using var eventReader = await events.ExecuteReaderAsync(cancellationToken).ConfigureAwait(false);
        while (await eventReader.ReadAsync(cancellationToken).ConfigureAwait(false))
        {
            match.Events.Add(new TimelineEvent
            {
                Sequence = eventReader.GetInt64(0),
                EventName = eventReader.GetString(1),
                ReceivedAt = Parse(eventReader.GetString(2)),
                MatchClockSeconds = eventReader.IsDBNull(3) ? null : eventReader.GetInt32(3),
                PayloadJson = eventReader.GetString(4)
            });
        }
    }

    private async Task<SqliteConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
        var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys=ON;";
        await command.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
        return connection;
    }

    private static void Add(SqliteCommand command, string name, object? value) =>
        command.Parameters.AddWithValue(name, value ?? DBNull.Value);
    private static string Format(DateTimeOffset value) => value.ToString("O", CultureInfo.InvariantCulture);
    private static DateTimeOffset Parse(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
}
