using Fennec.App;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Controls;

public sealed partial class PlayerScorecardView : UserControl
{
    public static readonly DependencyProperty RowProperty = DependencyProperty.Register(
        nameof(Row), typeof(PlayerRow), typeof(PlayerScorecardView), new PropertyMetadata(null));

    public PlayerScorecardView() => InitializeComponent();

    public PlayerRow? Row
    {
        get => (PlayerRow?)GetValue(RowProperty);
        set => SetValue(RowProperty, value);
    }
}
