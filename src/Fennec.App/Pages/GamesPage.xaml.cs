using Fennec.Core;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Pages;

public sealed record SessionListItem(string Id, string Header, string Range, string Summary, IReadOnlyList<MatchRow> Matches);

public sealed partial class GamesPage : UserControl
{
    private readonly AppRuntime _runtime;
    private readonly Action<MatchState> _openMatch;
    private readonly Action<SessionGroup> _openSession;
    private IReadOnlyList<SessionGroup> _sessions = [];
    private readonly DispatcherTimer _sessionTimer = new() { Interval = TimeSpan.FromSeconds(30) };
    private bool _refreshing;

    public GamesPage(AppRuntime runtime, Action<MatchState> openMatch, Action<SessionGroup> openSession)
    {
        _runtime = runtime; _openMatch = openMatch; _openSession = openSession;
        InitializeComponent();
        _runtime.Changed += Runtime_Changed;
        _sessionTimer.Tick += (_, _) => Refresh();
        _sessionTimer.Start();
        Unloaded += (_, _) => { _runtime.Changed -= Runtime_Changed; _sessionTimer.Stop(); };
        Refresh();
    }

    private void Runtime_Changed() => DispatcherQueue.TryEnqueue(Refresh);

    private void Refresh()
    {
        if (_refreshing) return;
        _refreshing = true;
        try
        {
            _sessions = _runtime.GetSessions();
            var threshold = TimeSpan.FromMinutes(_runtime.Settings.SessionGapMinutes);
            var latest = _sessions.LastOrDefault();
            var isCurrent = latest is not null &&
                (_runtime.ActiveMatch is not null || DateTimeOffset.UtcNow - latest.EndedAt < threshold);
            var currentMatches = isCurrent ? latest!.Matches : [];
            var metrics = UiProjection.Metrics(currentMatches, _runtime.ProfilePrimaryId);
            RecordMetric.Text = metrics.Record; WinRateMetric.Text = metrics.WinRate; StreakMetric.Text = metrics.Streak;
            GoalsForAgainstMetric.Text = metrics.GoalsForAgainst;
            GoalDiffMetric.Text = metrics.GoalDifference; ShootingMetric.Text = metrics.Shooting;
            GoalsMetric.Text = metrics.Goals; AssistsMetric.Text = metrics.Assists; SavesMetric.Text = metrics.Saves;
            ShotsMetric.Text = metrics.Shots; ScoreMetric.Text = metrics.Score; DemosMetric.Text = metrics.Demos;
            TouchesMetric.Text = metrics.Touches; GamesMetric.Text = metrics.Games;
            SessionRange.Text = isCurrent ? $"Started {latest!.StartedAt.ToLocalTime():h:mm tt}" : "Waiting for a match";

            var encounters = _runtime.GetEncounters(_runtime.ActiveMatch?.Id).ToDictionary(item => item.PrimaryId, StringComparer.Ordinal);
            if (_runtime.ActiveMatch is { } active)
            {
                var row = UiProjection.Match(active, _runtime.ProfilePrimaryId, encounters);
                LiveButton.Visibility = Visibility.Visible; LivePlaylist.Text = row.Playlist;
                LivePersonal.Text = row.PersonalLine; LiveScore.Text = row.Score;
                LiveClock.Text = active.IsOvertime ? "OVERTIME" : $"{active.TimeSeconds / 60}:{active.TimeSeconds % 60:00}";
                var unopened = active.Id != _runtime.LastOpenedMatchId;
                LiveCard.BorderBrush = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources[unopened ? "FennecOrangeBrush" : "FennecCyanBrush"];
                LiveCard.BorderThickness = new Thickness(unopened ? 2 : 1);
            }
            else LiveButton.Visibility = Visibility.Collapsed;

            var snapshot = _runtime.GetMatchesSnapshot();
            var selectedPlaylist = PlaylistFilter.SelectedItem?.ToString();
            var playlists = snapshot.Select(item => item.PlaylistName).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
            var playlistSelection = selectedPlaylist ?? "All playlists";
            PlaylistFilter.ItemsSource = new[] { "All playlists" }.Concat(playlists).ToArray();
            PlaylistFilter.SelectedItem = PlaylistFilter.Items.Cast<string>().FirstOrDefault(item => item == playlistSelection) ?? "All playlists";

            var historySessions = isCurrent ? _sessions.Take(Math.Max(0, _sessions.Count - 1)) : _sessions;
            var filtered = historySessions.Reverse().Select(session => new
            {
                Session = session,
                Matches = session.Matches.Where(MatchesHistoryFilter).ToArray()
            }).Where(item => item.Matches.Length > 0).ToArray();
            var rows = filtered.Select(item => new SessionListItem(
                item.Session.Id, item.Session.StartedAt.ToLocalTime().ToString("dddd, MMMM d"),
                $"{item.Session.StartedAt.ToLocalTime():h:mm tt} – {item.Session.EndedAt.ToLocalTime():h:mm tt}",
                $"{UiProjection.Metrics(item.Session.Matches, _runtime.ProfilePrimaryId).Record}  ·  {item.Session.Matches.Count} games",
                item.Matches.Reverse().Select(match => UiProjection.Match(match, _runtime.ProfilePrimaryId, encounters)).ToArray())).ToArray();
            SessionList.ItemsSource = rows;
            EmptyHistory.Text = snapshot.Count == 0
                ? "Your games will appear here as soon as Fennec receives a match."
                : "No games match these filters.";
            EmptyHistory.Visibility = rows.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        finally { _refreshing = false; }
    }

    private bool MatchesHistoryFilter(MatchState match)
    {
        var playlist = PlaylistFilter.SelectedItem?.ToString();
        if (!string.IsNullOrWhiteSpace(playlist) && playlist != "All playlists" &&
            !string.Equals(match.PlaylistName, playlist, StringComparison.OrdinalIgnoreCase)) return false;
        var result = ResultFilter.SelectedItem?.ToString();
        var profile = match.Participants.FirstOrDefault(item => item.PrimaryId == _runtime.ProfilePrimaryId);
        var won = profile is not null && match.WinnerTeamNumber == profile.TeamNumber;
        if (result == "Wins" && (!won || match.Lifecycle != MatchLifecycle.Completed)) return false;
        if (result == "Losses" && (won || match.Lifecycle != MatchLifecycle.Completed)) return false;
        if (result == "Incomplete" && match.Lifecycle != MatchLifecycle.Incomplete) return false;
        var days = DateFilter.SelectedIndex switch { 1 => 7, 2 => 30, 3 => 90, _ => 0 };
        if (days > 0 && match.StartedAt < DateTimeOffset.UtcNow.AddDays(-days)) return false;
        var query = HistorySearch.Text.Trim();
        return query.Length == 0 || match.PlaylistName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
            match.Arena.Contains(query, StringComparison.OrdinalIgnoreCase) ||
            match.Participants.Any(item => item.Name.Contains(query, StringComparison.OrdinalIgnoreCase));
    }

    private void HistorySearch_TextChanged(object sender, TextChangedEventArgs e) => Refresh();
    private void HistoryFilter_Changed(object sender, SelectionChangedEventArgs e) => Refresh();

    private void LiveButton_Click(object sender, RoutedEventArgs e)
    {
        if (_runtime.ActiveMatch is { } match) _openMatch(match);
    }
    private void MatchButton_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag?.ToString() is { } id && _runtime.FindMatch(id) is { } match)
            _openMatch(match);
    }
    private void SessionButton_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag?.ToString() is { } id && _sessions.FirstOrDefault(item => item.Id == id) is { } session)
            _openSession(session);
    }
}
