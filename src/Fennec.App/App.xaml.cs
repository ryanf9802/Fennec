using Microsoft.UI.Xaml;
using Fennec.Core;

namespace Fennec.App;

public partial class App : Application
{
    public static MainWindow? MainWindow { get; private set; }

    public App() => InitializeComponent();

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var options = AppLaunchOptions.Parse(args.Arguments, Environment.GetEnvironmentVariable("FENNEC_DEV_MODE"));
        MainWindow = new MainWindow(options.StartHidden, options.DeveloperMode);
        MainWindow.Activate();
    }
}
