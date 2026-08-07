using Fennec.Core;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Pages;

public sealed partial class ProfilePage : UserControl
{
    private readonly AppRuntime _runtime;
    public ProfilePage(AppRuntime runtime)
    {
        _runtime = runtime; InitializeComponent(); Refresh();
        _runtime.Changed += Runtime_Changed; Unloaded += (_, _) => _runtime.Changed -= Runtime_Changed;
    }
    private void Runtime_Changed() => DispatcherQueue.TryEnqueue(Refresh);
    private void Refresh()
    {
        DisplayNameText.Text = _runtime.ProfileDisplayName ?? "Not selected";
        PrimaryIdText.Text = _runtime.ProfilePrimaryId ?? "No platform identifier selected";
        PlatformText.Text = _runtime.ProfilePrimaryId?.Split('|').FirstOrDefault() ?? "—";
        var matches = _runtime.GetMatchesSnapshot();
        GamesText.Text = matches.Count.ToString(); SessionsText.Text = _runtime.GetSessions().Count.ToString();
        TrackingSinceText.Text = matches.Count == 0 ? "—" : matches.Min(item => item.StartedAt).ToLocalTime().ToString("MMMM d, yyyy");
        PlayerPicker.ItemsSource = matches.SelectMany(item => item.Participants)
            .Where(item => !string.IsNullOrWhiteSpace(item.PrimaryId)).GroupBy(item => item.PrimaryId)
            .Select(group => group.Last()).OrderBy(item => item.Name).ToArray();
    }
    private async void SavePlayer_Click(object sender, RoutedEventArgs e)
    {
        if (PlayerPicker.SelectedItem is not ParticipantState player) return;
        await _runtime.SelectProfileAsync(player);
        ProfileStatus.Severity = InfoBarSeverity.Success; ProfileStatus.Title = "Profile updated";
        ProfileStatus.Message = $"Future and existing matches will use {player.Name}."; ProfileStatus.IsOpen = true;
    }
}
