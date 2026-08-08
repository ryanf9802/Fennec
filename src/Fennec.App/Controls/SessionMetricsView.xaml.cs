using Fennec.App;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Controls;

public sealed partial class SessionMetricsView : UserControl
{
    public SessionMetricsView() => InitializeComponent();

    public void SetMetrics(SessionMetrics metrics)
    {
        RecordText.Text = metrics.Record;
        WinRateText.Text = metrics.WinRate;
        StreakText.Text = metrics.Streak;
        GoalsForAgainstText.Text = metrics.GoalsForAgainst;
        GoalDiffText.Text = metrics.GoalDifference;
        ShootingText.Text = metrics.Shooting;
        GoalsText.Text = metrics.Goals;
        AssistsText.Text = metrics.Assists;
        SavesText.Text = metrics.Saves;
        ShotsText.Text = metrics.Shots;
        ScoreText.Text = metrics.Score;
        DemosText.Text = metrics.Demos;
        TouchesText.Text = metrics.Touches;
        GamesText.Text = metrics.Games;
    }
}
