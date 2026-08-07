using Microsoft.UI.Xaml;

namespace Fennec.App;

public partial class App : Application
{
    public static MainWindow? MainWindow { get; private set; }

    public App() => InitializeComponent();

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var startHidden = args.Arguments.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Contains("--background", StringComparer.OrdinalIgnoreCase);
        MainWindow = new MainWindow(startHidden);
        MainWindow.Activate();
    }
}
