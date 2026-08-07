using Fennec.Core;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Pages;

public sealed partial class MatchPage : UserControl
{
    private readonly AppRuntime _runtime;
    private MatchState _match;

    public MatchPage(AppRuntime runtime, MatchState match)
    {
        _runtime = runtime; _match = match;
        InitializeComponent();
        _runtime.Changed += Runtime_Changed; Unloaded += (_, _) => _runtime.Changed -= Runtime_Changed;
        Refresh();
    }
    private void Runtime_Changed() => DispatcherQueue.TryEnqueue(() =>
    {
        _match = _runtime.FindMatch(_match.Id) ?? _match; Refresh();
    });
    private void Refresh()
    {
        PageTitleText.Text = _match.Lifecycle == MatchLifecycle.Live ? "Live match" : _match.PlaylistName;
        MatchContext.Text = $"{_match.PlaylistName}  ·  {_match.Arena}  ·  {_match.StartedAt.ToLocalTime():dddd, MMM d h:mm tt}";
        ScoreText.Text = _match.Teams.Count >= 2 ? string.Join(" – ", _match.Teams.OrderBy(item => item.TeamNumber).Select(item => item.Score)) : "—";
        ClockText.Text = _match.IsOvertime ? "OVERTIME" : $"{_match.TimeSeconds / 60}:{_match.TimeSeconds % 60:00}";
        var encounters = _runtime.GetEncounters(_match.Lifecycle == MatchLifecycle.Live ? _match.Id : null).ToDictionary(item => item.PrimaryId, StringComparer.Ordinal);
        ScoreboardList.ItemsSource = UiProjection.Players(_match, _runtime.ProfilePrimaryId, encounters);
        PresetLabel.Text = _runtime.Settings.TimelinePreset.ToString();
        TimelineList.ItemsSource = UiProjection.Timeline(_match, _runtime.Settings);
    }
    private async void ScoreboardList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not PlayerRow { PrimaryId: { } primaryId, Encounter.Length: > 0 } player) return;
        var summary = _runtime.GetEncounters(_match.Lifecycle == MatchLifecycle.Live ? _match.Id : null)
            .FirstOrDefault(item => item.PrimaryId == primaryId);
        if (summary is null) return;
        var previousGames = _runtime.GetMatchesSnapshot()
            .Where(item => item.Id != _match.Id && item.Participants.Any(participant => participant.PrimaryId == primaryId))
            .OrderByDescending(item => item.StartedAt).Take(8)
            .Select(item => $"{item.StartedAt.ToLocalTime():MMM d, h:mm tt}  ·  {item.PlaylistName}").ToArray();
        var panel = new StackPanel { Spacing = 9 };
        panel.Children.Add(new TextBlock
        {
            Text = $"Together: {summary.GamesTogether} games, {summary.WinsTogether}–{summary.LossesTogether}\n" +
                   $"Opposed: {summary.GamesOpposed} games, {summary.WinsAgainst}–{summary.LossesAgainst}\n" +
                   $"First seen: {summary.FirstSeen.ToLocalTime():MMM d, yyyy}\nLast seen: {summary.LastSeen.ToLocalTime():MMM d, yyyy}",
            TextWrapping = Microsoft.UI.Xaml.TextWrapping.Wrap
        });
        if (previousGames.Length > 0)
        {
            panel.Children.Add(new TextBlock { Text = "RECENT ENCOUNTERS", FontSize = 11, Opacity = 0.55, Margin = new Microsoft.UI.Xaml.Thickness(0, 8, 0, 0) });
            foreach (var game in previousGames) panel.Children.Add(new TextBlock { Text = game });
        }
        var dialog = new ContentDialog
        {
            Title = player.Name.Replace("  YOU", string.Empty, StringComparison.Ordinal),
            Content = panel,
            CloseButtonText = "Close",
            XamlRoot = XamlRoot
        };
        await dialog.ShowAsync();
    }
}
