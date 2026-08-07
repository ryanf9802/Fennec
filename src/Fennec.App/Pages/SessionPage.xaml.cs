using Fennec.Core;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Pages;

public sealed partial class SessionPage : UserControl
{
    private readonly SessionGroup _session; private readonly Action<MatchState> _openMatch;
    public SessionPage(AppRuntime runtime, SessionGroup session, Action<MatchState> openMatch)
    {
        _session = session; _openMatch = openMatch; InitializeComponent();
        TitleText.Text = session.StartedAt.ToLocalTime().ToString("dddd, MMMM d");
        RangeText.Text = $"{session.StartedAt.ToLocalTime():h:mm tt} – {session.EndedAt.ToLocalTime():h:mm tt} · {session.Matches.Count} games";
        var metrics = UiProjection.Metrics(session.Matches, runtime.ProfilePrimaryId);
        RecordText.Text = metrics.Record; WinRateText.Text = metrics.WinRate; StreakText.Text = metrics.Streak;
        GoalsForAgainstText.Text = metrics.GoalsForAgainst; GoalDiffText.Text = metrics.GoalDifference; ShootingText.Text = metrics.Shooting;
        GoalsText.Text = metrics.Goals; AssistsText.Text = metrics.Assists; SavesText.Text = metrics.Saves; ShotsText.Text = metrics.Shots;
        ScoreText.Text = metrics.Score; DemosText.Text = metrics.Demos; TouchesText.Text = metrics.Touches; GamesText.Text = metrics.Games;
        var encounters = runtime.GetEncounters().ToDictionary(item => item.PrimaryId, StringComparer.Ordinal);
        var familiar = session.Matches.SelectMany(item => item.Participants).Where(item => item.PrimaryId != runtime.ProfilePrimaryId && item.PrimaryId is not null)
            .GroupBy(item => item.PrimaryId!).Select(group => encounters.GetValueOrDefault(group.Key)).Where(item => item is not null && item.GamesTogether + item.GamesOpposed > 1)
            .OrderByDescending(item => item!.GamesTogether + item.GamesOpposed).Select(item => $"{item!.LatestName}: {item.GamesTogether} together, {item.GamesOpposed} opposed").ToArray();
        RecurringPlayersText.Text = familiar.Length == 0 ? "No recurring players in this session." : string.Join("  ·  ", familiar);
        GameList.ItemsSource = session.Matches.Reverse().Select(item => UiProjection.Match(item, runtime.ProfilePrimaryId, encounters)).ToArray();
    }
    private void GameList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is MatchRow row && _session.Matches.FirstOrDefault(item => item.Id == row.Id) is { } match) _openMatch(match);
    }
}
