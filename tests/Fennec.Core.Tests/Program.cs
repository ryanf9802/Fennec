using System.Text.Json;
using Fennec.Core;

var tests = new (string Name, Action Run)[]
{
    ("Envelope validates required fields", EnvelopeValidation),
    ("Reducer derives update state without retaining ticks", ReducerUpdateState),
    ("Reducer retains discrete event payloads", ReducerDiscreteEvent),
    ("Reducer starts a new live match when the GUID changes", ReducerNewGuid),
    ("Reducer resumes event sequence after restart", ReducerResume),
    ("Session threshold is inclusive", SessionThreshold),
    ("Encounter roles and records are separated", EncounterRoles),
    ("Timeline discovers nested and unknown fields", TimelineDiscovery),
    ("INI editor preserves unrelated settings", IniPreservation),
    ("INI editor rejects arbitrary paths", IniValidation),
    ("Unknown playlists remain visible", UnknownPlaylist)
};

var failures = 0;
foreach (var test in tests)
{
    try { test.Run(); Console.WriteLine($"PASS {test.Name}"); }
    catch (Exception exception) { failures++; Console.Error.WriteLine($"FAIL {test.Name}: {exception.Message}"); }
}
return failures == 0 ? 0 : 1;

static void EnvelopeValidation()
{
    AssertThrows<JsonException>(() => StatsEnvelope.Parse("{}"));
    var message = StatsEnvelope.Parse("{\"Event\":\"MatchCreated\",\"Data\":{}} ");
    Equal("MatchCreated", message.Event);
}

static void ReducerUpdateState()
{
    var reducer = new MatchReducer(new TestTimeProvider(new DateTimeOffset(2026, 8, 7, 12, 0, 0, TimeSpan.Zero)));
    var match = reducer.Apply(StatsEnvelope.Parse(Fixture.UpdateStateJson));
    Equal(0, match.Events.Count); Equal(2, match.Participants.Count); Equal(11, match.PlaylistId);
    Equal("Ranked Duel", match.PlaylistName); Equal(1, match.Teams[0].Score);
}

static void ReducerDiscreteEvent()
{
    var reducer = new MatchReducer(new TestTimeProvider(DateTimeOffset.UnixEpoch));
    reducer.Apply(StatsEnvelope.Parse(Fixture.UpdateStateJson));
    var match = reducer.Apply(StatsEnvelope.Parse("{\"Event\":\"GoalScored\",\"Data\":{\"MatchGuid\":\"match-1\",\"GoalSpeed\":123.4,\"Scorer\":{\"Name\":\"Me\"}}}"));
    Equal(1, match.Events.Count); Equal("GoalScored", match.Events[0].EventName);
    True(match.Events[0].PayloadJson.Contains("123.4", StringComparison.Ordinal));
}

static void ReducerNewGuid()
{
    var reducer = new MatchReducer(new TestTimeProvider(DateTimeOffset.UnixEpoch));
    var first = reducer.Apply(StatsEnvelope.Parse(Fixture.UpdateStateJson));
    var second = reducer.Apply(StatsEnvelope.Parse(Fixture.UpdateStateJson.Replace("match-1", "match-2", StringComparison.Ordinal)));
    Equal("match-1", first.Id); Equal("match-2", second.Id); True(!ReferenceEquals(first, second));
}

static void ReducerResume()
{
    var existing = Match("match-1", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch);
    existing.Events.Add(new TimelineEvent { Sequence = 12, EventName = "GoalScored", ReceivedAt = DateTimeOffset.UnixEpoch, PayloadJson = "{}" });
    var reducer = new MatchReducer(new TestTimeProvider(DateTimeOffset.UnixEpoch));
    reducer.Resume(existing);
    var updated = reducer.Apply(StatsEnvelope.Parse("{\"Event\":\"PlayerJoined\",\"Data\":{\"MatchGuid\":\"match-1\"}}"));
    Equal(13L, updated.Events[^1].Sequence);
}

static void SessionThreshold()
{
    var start = DateTimeOffset.UnixEpoch;
    var first = Match("one", start, start.AddMinutes(5));
    var before = Match("two", start.AddMinutes(34).AddSeconds(59), start.AddMinutes(40));
    Equal(1, Sessionizer.Group([first, before], TimeSpan.FromMinutes(30)).Count);
    var exact = Match("three", start.AddMinutes(35), start.AddMinutes(40));
    Equal(2, Sessionizer.Group([first, exact], TimeSpan.FromMinutes(30)).Count);
}

static void EncounterRoles()
{
    var first = Completed("one", 0, 0, [Player("Me", "Steam|1|0", 0), Player("Friend", "Epic|2|0", 0), Player("Other", "Epic|3|0", 1)]);
    var second = Completed("two", 0, 10, [Player("Me", "Steam|1|0", 0), Player("Friend", "Epic|2|0", 1)]);
    var encounters = EncounterCalculator.Calculate([first, second], "Steam|1|0").ToDictionary(item => item.PrimaryId);
    Equal(1, encounters["Epic|2|0"].GamesTogether); Equal(1, encounters["Epic|2|0"].GamesOpposed);
    Equal(1, encounters["Epic|2|0"].WinsTogether); Equal(1, encounters["Epic|2|0"].WinsAgainst);
}

static void TimelineDiscovery()
{
    var item = new TimelineEvent { Sequence = 1, EventName = "FutureEvent", ReceivedAt = DateTimeOffset.UnixEpoch, PayloadJson = "{\"Nested\":{\"Value\":7},\"NewField\":true}" };
    var fields = TimelineConfiguration.DiscoverAttributes([item]);
    True(fields.Contains("Nested.Value")); True(fields.Contains("NewField"));
}

static void IniPreservation()
{
    var testRoot = Path.Combine(Path.GetTempPath(), $"fennec-test-{Guid.NewGuid():N}");
    var root = Path.Combine(testRoot, "TAGame", "Config");
    Directory.CreateDirectory(root); var path = Path.Combine(root, "TAStatsAPI.ini");
    File.WriteAllText(path, "; keep me\n[Other]\nValue=7\n[TAGame.MatchStatsExporter_TA]\nPort=49123\nPacketSendRate=0\n");
    var result = StatsApiIniEditor.Update(path, 2, 49124); var updated = File.ReadAllText(path);
    True(updated.Contains("; keep me", StringComparison.Ordinal)); True(updated.Contains("Port=49123", StringComparison.Ordinal));
    True(updated.Contains("PacketSendRate=2", StringComparison.Ordinal)); True(updated.Contains("WebPort=49124", StringComparison.Ordinal));
    True(File.Exists(result.BackupPath)); Directory.Delete(testRoot, true);
}

static void IniValidation() => AssertThrows<InvalidOperationException>(() => StatsApiIniEditor.ValidateTarget(Path.Combine(Path.GetTempPath(), "anything.ini")));
static void UnknownPlaylist() { var value = PlaylistCatalog.Resolve(9876); Equal("Playlist 9876", value.Name); Equal(PlaylistCategory.Unknown, value.Category); }

static MatchState Match(string id, DateTimeOffset start, DateTimeOffset end) => new() { Id = id, StartedAt = start, LastEventAt = end, EndedAt = end, Lifecycle = MatchLifecycle.Completed };
static MatchState Completed(string id, int winner, int minute, IEnumerable<ParticipantState> players)
{
    var match = Match(id, DateTimeOffset.UnixEpoch.AddMinutes(minute), DateTimeOffset.UnixEpoch.AddMinutes(minute + 5));
    match.WinnerTeamNumber = winner; match.Participants.AddRange(players); return match;
}
static ParticipantState Player(string name, string id, int team) => new() { Name = name, PrimaryId = id, TeamNumber = team };
static void True(bool value) { if (!value) throw new InvalidOperationException("Expected true."); }
static void Equal<T>(T expected, T actual) where T : notnull { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new InvalidOperationException($"Expected {expected}, got {actual}."); }
static void AssertThrows<T>(Action action) where T : Exception { try { action(); } catch (T) { return; } throw new InvalidOperationException($"Expected {typeof(T).Name}."); }

sealed class TestTimeProvider(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

static class Fixture
{
    public const string UpdateStateJson = """
    {"Event":"UpdateState","Data":{"MatchGuid":"match-1","Players":[
    {"Name":"Me","PrimaryId":"Steam|1|0","TeamNum":0,"Score":250,"Goals":1,"Shots":2,"Assists":0,"Saves":1,"Touches":14,"Demos":0},
    {"Name":"Other","PrimaryId":"Epic|2|0","TeamNum":1,"Score":100,"Goals":0,"Shots":1,"Assists":0,"Saves":0,"Touches":8,"Demos":0}],
    "Game":{"Teams":[{"Name":"Blue","TeamNum":0,"Score":1,"ColorPrimary":"0000FF"},{"Name":"Orange","TeamNum":1,"Score":0,"ColorPrimary":"FF8800"}],"PlaylistId":11,"TimeSeconds":180,"bOvertime":false,"bReplay":false,"Arena":"Stadium_P"}}}
    """;
}
