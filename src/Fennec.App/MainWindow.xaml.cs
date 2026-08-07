using Fennec.App.Pages;
using Fennec.Core;
using Fennec.Infrastructure;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Graphics;

namespace Fennec.App;

public sealed partial class MainWindow : Window
{
    private readonly AppRuntime _runtime;
    private readonly AppWindow _appWindow;
    private TrayIconService? _tray;
    private string? _lastActiveMatchId;
    private readonly bool _startHidden;

    public MainWindow(bool startHidden = false, bool developerMode = false)
    {
        _runtime = new AppRuntime(developerMode);
        _startHidden = startHidden;
        InitializeComponent();
        var windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
        _appWindow = AppWindow.GetFromWindowId(windowId);
        _appWindow.Resize(new SizeInt32(1280, 820));
        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "Fennec.ico");
        if (File.Exists(iconPath)) _appWindow.SetIcon(iconPath);
        _appWindow.Closing += AppWindow_Closing;
        _runtime.Changed += Runtime_Changed;
        Activated += MainWindow_Activated;
    }

    private async void MainWindow_Activated(object sender, WindowActivatedEventArgs args)
    {
        Activated -= MainWindow_Activated;
        _tray = new TrayIconService(this, _appWindow, ExitApplication);
        await _runtime.InitializeAsync();
        PageHost.Content = _runtime.IsFirstRun
            ? new OnboardingPage(_runtime, () => PageHost.Content = new GamesPage(_runtime, OpenMatch, OpenSession))
            : new GamesPage(_runtime, OpenMatch, OpenSession);
        _lastActiveMatchId = null;
        RefreshConnection();
        if (_startHidden) _appWindow.Hide();
    }

    private void Runtime_Changed() => DispatcherQueue.TryEnqueue(RefreshConnection);

    private void RefreshConnection()
    {
        RootLayout.RequestedTheme = _runtime.Settings.Theme switch
        {
            "Light" => ElementTheme.Light,
            "System" => ElementTheme.Default,
            _ => ElementTheme.Dark
        };
        (ConnectionLabel.Text, ConnectionDot.Fill) = _runtime.ConnectionState switch
        {
            FeedConnectionState.Live => ("Match live", new SolidColorBrush(Colors.LimeGreen)),
            FeedConnectionState.Waiting => ("Connected", new SolidColorBrush(Colors.DeepSkyBlue)),
            FeedConnectionState.Connecting => ("Connecting", new SolidColorBrush(Colors.Goldenrod)),
            FeedConnectionState.Unavailable => ("Rocket League unavailable", new SolidColorBrush(Colors.Gray)),
            _ => ("Stopped", new SolidColorBrush(Colors.Gray))
        };
        if (_runtime.Settings.AutoOpenLiveMatch && _runtime.ActiveMatch is { } active && active.Id != _lastActiveMatchId)
        {
            _lastActiveMatchId = active.Id;
            _appWindow.Show(); Activate(); OpenMatch(active);
        }
    }

    private void Navigation_ItemInvoked(NavigationView sender, NavigationViewItemInvokedEventArgs args)
    {
        if (args.InvokedItemContainer?.Tag?.ToString() is not { } tag) return;
        PageHost.Content = tag switch
        {
            "profile" => new ProfilePage(_runtime),
            "settings" => new SettingsPage(_runtime),
            _ => new GamesPage(_runtime, OpenMatch, OpenSession)
        };
    }

    private void OpenMatch(MatchState match)
    {
        _runtime.MarkMatchOpened(match.Id);
        PageHost.Content = new MatchPage(_runtime, match);
    }
    private void OpenSession(SessionGroup session) => PageHost.Content = new SessionPage(_runtime, session, OpenMatch);

    private void AppWindow_Closing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        args.Cancel = true;
        sender.Hide();
    }

    private async void ExitApplication()
    {
        _appWindow.Closing -= AppWindow_Closing;
        _tray?.Dispose();
        await _runtime.DisposeAsync();
        Close();
    }
}
