using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Fennec.Core;

namespace Fennec.Infrastructure;

public enum FeedConnectionState { Stopped, Connecting, Waiting, Live, Unavailable }

public sealed class StatsFeedClient(Uri endpoint, IDiagnosticLog? diagnostics = null) : IAsyncDisposable
{
    private readonly Uri _endpoint = endpoint;
    private readonly IDiagnosticLog? _diagnostics = diagnostics;
    private readonly CancellationTokenSource _lifetime = new();
    private ClientWebSocket? _socket;

    public event Func<StatsEnvelope, Task>? MessageReceived;
    public event Action<FeedConnectionState>? StateChanged;

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token, cancellationToken);
        await RunLoopAsync(linked.Token).ConfigureAwait(false);
    }

    private async Task RunLoopAsync(CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromSeconds(1);
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                StateChanged?.Invoke(FeedConnectionState.Connecting);
                _diagnostics?.Write(DiagnosticSeverity.Information, "StatsFeed", $"Connecting to {_endpoint}");
                _socket?.Dispose();
                _socket = new ClientWebSocket();
                await _socket.ConnectAsync(_endpoint, cancellationToken).ConfigureAwait(false);
                StateChanged?.Invoke(FeedConnectionState.Waiting);
                _diagnostics?.Write(DiagnosticSeverity.Information, "StatsFeed", "WebSocket connected");
                delay = TimeSpan.FromSeconds(1);
                await ReceiveMessagesAsync(_socket, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (WebSocketException exception)
            {
                StateChanged?.Invoke(FeedConnectionState.Unavailable);
                _diagnostics?.Write(DiagnosticSeverity.Warning, "StatsFeed", "WebSocket unavailable", exception);
            }
            catch (Exception exception)
            {
                StateChanged?.Invoke(FeedConnectionState.Unavailable);
                _diagnostics?.Write(DiagnosticSeverity.Error, "StatsFeed", "Monitoring loop failed and will retry", exception);
            }
            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 15));
        }
        StateChanged?.Invoke(FeedConnectionState.Stopped);
    }

    private async Task ReceiveMessagesAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        while (socket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            using var message = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, cancellationToken)
                        .ConfigureAwait(false);
                    return;
                }
                await message.WriteAsync(buffer.AsMemory(0, result.Count), cancellationToken).ConfigureAwait(false);
            } while (!result.EndOfMessage);

            if (result.MessageType != WebSocketMessageType.Text) continue;
            try
            {
                var envelope = StatsEnvelope.Parse(Encoding.UTF8.GetString(message.GetBuffer(), 0, checked((int)message.Length)));
                if (MessageReceived is { } handler) await handler(envelope).ConfigureAwait(false);
            }
            catch (JsonException exception)
            {
                // A malformed packet must not terminate monitoring.
                _diagnostics?.Write(DiagnosticSeverity.Warning, "StatsFeed", "Ignored a malformed Stats API packet", exception);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _lifetime.CancelAsync().ConfigureAwait(false);
        _socket?.Dispose();
        _lifetime.Dispose();
    }
}
