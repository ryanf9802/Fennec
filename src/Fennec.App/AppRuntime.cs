using Fennec.Core;
using Fennec.Infrastructure;

namespace Fennec.App;

public sealed class AppRuntime : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _matchesGate = new();
    private readonly MatchReducer _reducer = new();
    private readonly SqliteFennecStore _store;
    private readonly AppSettingsStore _settingsStore;
    private StatsFeedClient? _feed;
    private Task? _feedTask;

    public AppRuntime()
    {
        DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Fennec");
        _store = new SqliteFennecStore(Path.Combine(DataDirectory, "fennec.db"));
        SettingsPath = Path.Combine(DataDirectory, "settings.json");
        IsFirstRun = !File.Exists(SettingsPath);
        _settingsStore = new AppSettingsStore(SettingsPath);
    }

    public string DataDirectory { get; }
    public string SettingsPath { get; }
    public bool IsFirstRun { get; private set; }
    public FennecSettings Settings { get; private set; } = new();
    public FeedConnectionState ConnectionState { get; private set; } = FeedConnectionState.Stopped;
    private readonly List<MatchState> _matches = [];
    public string? ProfilePrimaryId { get; private set; }
    public string? ProfileDisplayName { get; private set; }
    public string? LastOpenedMatchId { get; private set; }
    public MatchState? ActiveMatch => _reducer.Current is { Lifecycle: MatchLifecycle.Live } current && IsTrackable(current)
        ? current
        : null;
    public event Action? Changed;

    public async Task InitializeAsync()
    {
        await _store.InitializeAsync().ConfigureAwait(false);
        Settings = await _settingsStore.LoadAsync().ConfigureAwait(false);
        var loadedMatches = await _store.LoadMatchesAsync().ConfigureAwait(false);
        var interruptedMatches = loadedMatches.Where(item => item.Lifecycle == MatchLifecycle.Live).ToArray();
        foreach (var match in interruptedMatches)
        {
            match.Lifecycle = MatchLifecycle.Incomplete;
            match.EndedAt = match.LastEventAt;
            await _store.SaveMatchAsync(match).ConfigureAwait(false);
        }
        lock (_matchesGate) _matches.AddRange(loadedMatches);
        if (loadedMatches.LastOrDefault(item => item.Lifecycle == MatchLifecycle.Incomplete) is { } resumable)
            _reducer.Resume(resumable);
        if (await _store.GetProfileAsync().ConfigureAwait(false) is { } profile)
        {
            ProfilePrimaryId = profile.PrimaryId;
            ProfileDisplayName = profile.DisplayName;
        }
        StartFeed();
        WindowsStartupService.SetEnabled(Settings.StartWithWindows, Environment.ProcessPath!);
        Changed?.Invoke();
    }

    public async Task SelectProfileAsync(ParticipantState participant)
    {
        if (string.IsNullOrWhiteSpace(participant.PrimaryId))
            throw new InvalidOperationException("A stable platform identifier is required.");
        ProfilePrimaryId = participant.PrimaryId;
        ProfileDisplayName = participant.Name;
        await _store.SaveProfileAsync(participant.PrimaryId, participant.Name).ConfigureAwait(false);
        Changed?.Invoke();
    }

    public async Task SaveSettingsAsync(FennecSettings settings)
    {
        var reconnect = settings.WebSocketPort != Settings.WebSocketPort;
        Settings = settings;
        await _settingsStore.SaveAsync(settings).ConfigureAwait(false);
        IsFirstRun = false;
        if (reconnect)
        {
            if (_feed is not null) await _feed.DisposeAsync().ConfigureAwait(false);
            StartFeed();
        }
        Changed?.Invoke();
    }

    public Task ExportAsync(string directory) => _store.ExportAsync(directory, ProfilePrimaryId);

    public async Task ClearHistoryAsync()
    {
        await _store.ClearHistoryAsync().ConfigureAwait(false);
        lock (_matchesGate) _matches.Clear();
        Changed?.Invoke();
    }

    public IReadOnlyList<SessionGroup> GetSessions() =>
        Sessionizer.Group(GetMatchesSnapshot(), TimeSpan.FromMinutes(Settings.SessionGapMinutes));

    public IReadOnlyList<MatchState> GetMatchesSnapshot()
    {
        lock (_matchesGate) return _matches.ToArray();
    }

    public MatchState? FindMatch(string id)
    {
        lock (_matchesGate) return _matches.FirstOrDefault(item => item.Id == id);
    }

    public void MarkMatchOpened(string id) => LastOpenedMatchId = id;

    public IReadOnlyList<EncounterSummary> GetEncounters(string? excludeMatchId = null) =>
        string.IsNullOrWhiteSpace(ProfilePrimaryId)
            ? []
            : EncounterCalculator.Calculate(GetMatchesSnapshot().Where(item => item.Id != excludeMatchId), ProfilePrimaryId);

    private void StartFeed()
    {
        _feed = new StatsFeedClient(new Uri($"ws://127.0.0.1:{Settings.WebSocketPort}"));
        _feed.StateChanged += state =>
        {
            ConnectionState = ActiveMatch is null ? state : FeedConnectionState.Live;
            Changed?.Invoke();
        };
        _feed.MessageReceived += HandleMessageAsync;
        _feedTask = _feed.RunAsync();
    }

    private async Task HandleMessageAsync(StatsEnvelope envelope)
    {
        if (envelope.Event == "ReplayCreated") return;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            var match = _reducer.Apply(envelope);
            if (!IsTrackable(match)) return;
            lock (_matchesGate)
            {
                var existing = _matches.FindIndex(item => item.Id == match.Id);
                if (existing < 0) _matches.Add(match);
                else _matches[existing] = match;
            }

            if (ProfilePrimaryId is not null &&
                match.Participants.FirstOrDefault(item => item.PrimaryId == ProfilePrimaryId) is { } profile &&
                profile.Name != ProfileDisplayName)
            {
                ProfileDisplayName = profile.Name;
                await _store.SaveProfileAsync(ProfilePrimaryId, profile.Name).ConfigureAwait(false);
            }
            await _store.SaveMatchAsync(match).ConfigureAwait(false);
            ConnectionState = match.Lifecycle == MatchLifecycle.Live ? FeedConnectionState.Live : FeedConnectionState.Waiting;
        }
        finally
        {
            _gate.Release();
        }
        Changed?.Invoke();
    }

    private static bool IsTrackable(MatchState match) => match.PlaylistId > 0 && match.Teams.Count >= 2;

    public async ValueTask DisposeAsync()
    {
        if (_feed is not null) await _feed.DisposeAsync().ConfigureAwait(false);
        if (_feedTask is not null)
        {
            try { await _feedTask.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
        _gate.Dispose();
    }
}
