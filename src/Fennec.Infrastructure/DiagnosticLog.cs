using System.Globalization;
using System.Text;

namespace Fennec.Infrastructure;

public enum DiagnosticSeverity { Information, Warning, Error }

public interface IDiagnosticLog
{
    string DirectoryPath { get; }
    string CurrentFilePath { get; }
    string? LastEntry { get; }
    void Write(DiagnosticSeverity severity, string area, string message, Exception? exception = null);
}

public sealed class FileDiagnosticLog : IDiagnosticLog
{
    private readonly object _gate = new();
    private readonly bool _verbose;

    public FileDiagnosticLog(string directoryPath, bool verbose)
    {
        DirectoryPath = directoryPath;
        _verbose = verbose;
        Directory.CreateDirectory(directoryPath);
        DeleteExpiredLogs();
    }

    public string DirectoryPath { get; }
    public string CurrentFilePath => GetFilePath(DateTimeOffset.Now);
    public string? LastEntry { get; private set; }

    public void Write(DiagnosticSeverity severity, string area, string message, Exception? exception = null)
    {
        if (severity == DiagnosticSeverity.Information && !_verbose) return;
        var timestamp = DateTimeOffset.Now;
        var line = FormatLine(timestamp, severity, area, message, exception, _verbose);
        lock (_gate)
        {
            LastEntry = line.TrimEnd();
            try { File.AppendAllText(GetFilePath(timestamp), line, Encoding.UTF8); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    public static string FormatLine(
        DateTimeOffset timestamp,
        DiagnosticSeverity severity,
        string area,
        string message,
        Exception? exception,
        bool includeStackTrace)
    {
        var detail = exception is null
            ? string.Empty
            : includeStackTrace ? $" | {exception}" : $" | {exception.GetType().Name}: {exception.Message}";
        return $"{timestamp.ToString("O", CultureInfo.InvariantCulture)} [{severity}] [{Clean(area)}] {Clean(message + detail)}{Environment.NewLine}";
    }

    private void DeleteExpiredLogs()
    {
        var cutoff = DateTime.UtcNow.AddDays(-7);
        foreach (var path in Directory.EnumerateFiles(DirectoryPath, "fennec-*.log"))
        {
            try { if (File.GetLastWriteTimeUtc(path) < cutoff) File.Delete(path); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static string Clean(string value) => value
        .Replace('\r', ' ')
        .Replace('\n', ' ')
        .Replace('\t', ' ');

    private string GetFilePath(DateTimeOffset timestamp) =>
        Path.Combine(DirectoryPath, $"fennec-{timestamp:yyyyMMdd}.log");
}
