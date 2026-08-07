using System.Diagnostics;
using Fennec.Core;
using Fennec.Infrastructure;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage.Pickers;

namespace Fennec.App.Pages;

public sealed partial class SettingsPage : UserControl
{
    private static readonly string[] DocumentedEvents = ["BallHit", "BoostPickup", "ClockUpdatedSeconds", "CountdownBegin", "CrossbarHit", "GoalReplayEnd", "GoalReplayStart", "GoalReplayWillEnd", "GoalScored", "MatchCreated", "MatchDestroyed", "MatchEnded", "MatchInitialized", "MatchPaused", "MatchUnpaused", "PlayerJoined", "PlayerLeft", "PodiumStart", "ReplayCreated", "RoundStarted", "StatfeedEvent"];
    private readonly AppRuntime _runtime;
    private readonly HashSet<string> _enabledEvents;
    private readonly Dictionary<string, string[]> _attributes;

    public SettingsPage(AppRuntime runtime)
    {
        _runtime = runtime; InitializeComponent();
        WebPort.Value = runtime.Settings.WebSocketPort; SessionGap.Value = runtime.Settings.SessionGapMinutes;
        AutoOpen.IsOn = runtime.Settings.AutoOpenLiveMatch; StartWithWindows.IsOn = runtime.Settings.StartWithWindows;
        ThemePicker.SelectedItem = runtime.Settings.Theme; TimelinePresetPicker.SelectedIndex = (int)runtime.Settings.TimelinePreset;
        ConfigPath.Text = RocketLeagueInstallLocator.FindConfigurationFiles().FirstOrDefault() ?? string.Empty;
        _enabledEvents = new HashSet<string>(runtime.Settings.EnabledTimelineEvents ?? TimelineConfiguration.Curated.Rules.Select(item => item.EventName), StringComparer.Ordinal);
        _attributes = runtime.Settings.TimelineAttributes is null ? new(StringComparer.Ordinal) : runtime.Settings.TimelineAttributes.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        BuildTimelineOptions();
    }

    private void BuildTimelineOptions()
    {
        if (TimelineEventOptions is null) return;
        TimelineEventOptions.Children.Clear();
        TimelineEventOptions.Visibility = TimelinePresetPicker.SelectedIndex == (int)TimelinePresetKind.Custom ? Visibility.Visible : Visibility.Collapsed;
        if (TimelineEventOptions.Visibility == Visibility.Collapsed) return;
        var observed = _runtime.GetMatchesSnapshot().SelectMany(item => item.Events).Select(item => item.EventName);
        foreach (var eventName in DocumentedEvents.Concat(observed).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var row = new Grid { ColumnSpacing = 8 };
            row.ColumnDefinitions.Add(new ColumnDefinition()); row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var check = new CheckBox { Content = eventName, IsChecked = _enabledEvents.Contains(eventName), Tag = eventName };
            check.Click += (_, _) => { if (check.IsChecked == true) _enabledEvents.Add(eventName); else _enabledEvents.Remove(eventName); };
            var button = new Button { Content = "Attributes", Tag = eventName };
            button.Click += ConfigureAttributes_Click; Grid.SetColumn(button, 1); row.Children.Add(check); row.Children.Add(button);
            TimelineEventOptions.Children.Add(row);
        }
    }

    private async void ConfigureAttributes_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as Button)?.Tag?.ToString() is not { } eventName) return;
        var discovered = _runtime.GetMatchesSnapshot().SelectMany(item => item.Events).Where(item => item.EventName == eventName)
            .SelectMany(item => UiProjection.FlattenValues(item).Keys).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        var panel = new StackPanel { Spacing = 4 };
        var boxes = discovered.Select(attribute => new CheckBox { Content = attribute, IsChecked = _attributes.GetValueOrDefault(eventName)?.Contains(attribute, StringComparer.Ordinal) == true }).ToArray();
        foreach (var box in boxes) panel.Children.Add(box);
        if (boxes.Length == 0) panel.Children.Add(new TextBlock { Text = "Attributes appear after Fennec observes this event.", Opacity = 0.65 });
        var dialog = new ContentDialog { Title = $"{eventName} attributes", Content = new ScrollViewer { Content = panel, MaxHeight = 430 }, PrimaryButtonText = "Save", CloseButtonText = "Cancel", XamlRoot = XamlRoot };
        if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            _attributes[eventName] = boxes.Where(box => box.IsChecked == true).Select(box => box.Content!.ToString()!).ToArray();
    }

    private void TimelinePreset_Changed(object sender, SelectionChangedEventArgs e) => BuildTimelineOptions();
    private void Detect_Click(object sender, RoutedEventArgs e) => ConfigPath.Text = RocketLeagueInstallLocator.FindConfigurationFiles().FirstOrDefault() ?? ConfigPath.Text;
    private async void Browse_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker(); picker.FileTypeFilter.Add(".ini");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow));
        if (await picker.PickSingleFileAsync() is { } file) ConfigPath.Text = file.Path;
    }
    private async void Configure_Click(object sender, RoutedEventArgs e)
    {
        try { var result = StatsApiIniEditor.Update(ConfigPath.Text, 2, checked((int)WebPort.Value)); Show(InfoBarSeverity.Success, "Configured", $"Backup: {result.BackupPath}. Restart Rocket League."); }
        catch (UnauthorizedAccessException) { LaunchElevatedConfigurator(ConfigPath.Text, checked((int)WebPort.Value)); Show(InfoBarSeverity.Informational, "Administrator approval requested", "Complete the Windows prompt, then restart Rocket League."); }
        catch (Exception exception) { Show(InfoBarSeverity.Error, "Configuration failed", exception.Message); }
        await Task.CompletedTask;
    }
    public static void LaunchElevatedConfigurator(string path, int port)
    {
        var helper = Path.Combine(AppContext.BaseDirectory, "Fennec.Configurator.exe");
        Process.Start(new ProcessStartInfo(helper) { UseShellExecute = true, Verb = "runas", ArgumentList = { "--file", path, "--packet-rate", "2", "--web-port", port.ToString() } });
    }
    private async void Manual_Click(object sender, RoutedEventArgs e) { var dialog = new ContentDialog { Title = "Manual setup", Content = $"[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nPort=49123\nWebPort={(int)WebPort.Value}\n\nSave before launching Rocket League, or restart it afterward.", CloseButtonText = "Close", XamlRoot = XamlRoot }; await dialog.ShowAsync(); }
    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        var settings = new FennecSettings(checked((int)WebPort.Value), checked((int)SessionGap.Value), StartWithWindows.IsOn, AutoOpen.IsOn,
            ThemePicker.SelectedItem?.ToString() ?? "Dark", (TimelinePresetKind)Math.Max(0, TimelinePresetPicker.SelectedIndex), _enabledEvents.ToArray(), _attributes);
        await _runtime.SaveSettingsAsync(settings); WindowsStartupService.SetEnabled(settings.StartWithWindows, Environment.ProcessPath!);
        Show(InfoBarSeverity.Success, "Settings saved", "Session groups and timeline displays have been refreshed.");
    }
    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker(); picker.FileTypeFilter.Add("*");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow));
        if (await picker.PickSingleFolderAsync() is { } folder) { await _runtime.ExportAsync(folder.Path); Show(InfoBarSeverity.Success, "Export complete", folder.Path); }
    }
    private async void Delete_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new ContentDialog { Title = "Delete all match history?", Content = "This permanently deletes recorded matches, participants, and timelines. Your profile and settings remain.", PrimaryButtonText = "Delete", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close, XamlRoot = XamlRoot };
        if (await dialog.ShowAsync() == ContentDialogResult.Primary) { await _runtime.ClearHistoryAsync(); Show(InfoBarSeverity.Success, "History deleted", "Fennec is ready to record the next match."); }
    }
    private void Show(InfoBarSeverity severity, string title, string message) { SettingsStatus.Severity = severity; SettingsStatus.Title = title; SettingsStatus.Message = message; SettingsStatus.IsOpen = true; }
}
