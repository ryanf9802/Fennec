using Microsoft.UI.Xaml;
using Fennec.Core;

namespace Fennec.App;

public partial class App : Application
{
    public static MainWindow? MainWindow { get; private set; }

    public App()
    {
#if DEBUG
        Console.WriteLine("[Fennec] Initializing WinUI application");
        UnhandledException += (_, eventArgs) =>
        {
            Console.Error.WriteLine("[Fennec] Unhandled UI exception:");
            Console.Error.WriteLine(eventArgs.Exception);
        };
#endif
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var processArguments = string.Join(' ', Environment.GetCommandLineArgs().Skip(1));
        var options = AppLaunchOptions.Parse(
            $"{args.Arguments} {processArguments}",
            Environment.GetEnvironmentVariable("FENNEC_DEV_MODE"));
#if DEBUG
        Console.WriteLine($"[Fennec] Launching; developerMode={options.DeveloperMode}, startHidden={options.StartHidden}");
#endif
        MainWindow = new MainWindow(options.StartHidden, options.DeveloperMode);
        MainWindow.Activate();
    }
}
