namespace Fennec.Core;

public sealed record AppLaunchOptions(bool StartHidden, bool DeveloperMode)
{
    public static AppLaunchOptions Parse(string? arguments, string? developerModeEnvironment)
    {
        var tokens = (arguments ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var developerMode = tokens.Contains("--dev", StringComparer.OrdinalIgnoreCase) ||
            IsEnabled(developerModeEnvironment);
        return new AppLaunchOptions(
            tokens.Contains("--background", StringComparer.OrdinalIgnoreCase),
            developerMode);
    }

    private static bool IsEnabled(string? value) =>
        value is not null && (value.Equals("1", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("yes", StringComparison.OrdinalIgnoreCase));
}
