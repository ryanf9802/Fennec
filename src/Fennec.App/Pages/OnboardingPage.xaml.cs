using Fennec.Core;
using Fennec.Infrastructure;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Pages;

public sealed partial class OnboardingPage : UserControl
{
    private readonly AppRuntime _runtime; private readonly Action _complete;
    public OnboardingPage(AppRuntime runtime, Action complete)
    {
        _runtime = runtime; _complete = complete; InitializeComponent();
        ConfigPicker.ItemsSource = RocketLeagueInstallLocator.FindConfigurationFiles();
        ConfigPicker.SelectedIndex = ConfigPicker.Items.Count > 0 ? 0 : -1;
    }
    private async void Configure_Click(object sender, RoutedEventArgs e)
    {
        if (ConfigPicker.SelectedItem?.ToString() is not { } path) { Show(InfoBarSeverity.Warning, "Choose a configuration file", "No Rocket League installation was detected. Use Settings to enter its path."); return; }
        try { var result = StatsApiIniEditor.Update(path, 2, _runtime.Settings.WebSocketPort); Show(InfoBarSeverity.Success, "Stats API configured", $"Backup: {result.BackupPath}. Restart Rocket League."); }
        catch (UnauthorizedAccessException) { SettingsPage.LaunchElevatedConfigurator(path, _runtime.Settings.WebSocketPort); Show(InfoBarSeverity.Informational, "Administrator approval requested", "Complete the Windows prompt, then restart Rocket League."); }
        catch (Exception exception) { Show(InfoBarSeverity.Error, "Configuration failed", exception.Message); }
        await Task.CompletedTask;
    }
    private async void Manual_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new ContentDialog { Title = "Manual Stats API setup", Content = "[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nPort=49123\nWebPort=49124\n\nSave before launching Rocket League, or restart it after editing.", CloseButtonText = "Close", XamlRoot = XamlRoot };
        await dialog.ShowAsync();
    }
    private async void Continue_Click(object sender, RoutedEventArgs e) { await _runtime.SaveSettingsAsync(_runtime.Settings); _complete(); }
    private void Show(InfoBarSeverity severity, string title, string message) { SetupStatus.Severity = severity; SetupStatus.Title = title; SetupStatus.Message = message; SetupStatus.IsOpen = true; }
}
