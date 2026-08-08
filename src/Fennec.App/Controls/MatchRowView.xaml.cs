using Fennec.App;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Fennec.App.Controls;

public sealed partial class MatchRowView : UserControl
{
    public static readonly DependencyProperty RowProperty = DependencyProperty.Register(
        nameof(Row), typeof(MatchRow), typeof(MatchRowView), new PropertyMetadata(null));

    public MatchRowView() => InitializeComponent();

    public MatchRow? Row
    {
        get => (MatchRow?)GetValue(RowProperty);
        set => SetValue(RowProperty, value);
    }
}
