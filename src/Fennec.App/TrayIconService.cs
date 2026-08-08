using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Fennec.App;

public sealed class TrayIconService : IDisposable
{
    private const uint WmApp = 0x8000;
    private const uint CallbackMessage = WmApp + 17;
    private const uint WmLButtonUp = 0x0202;
    private const uint WmRButtonUp = 0x0205;
    private const uint WmCommand = 0x0111;
    private const uint NimAdd = 0;
    private const uint NimDelete = 2;
    private const uint NifMessage = 1;
    private const uint NifIcon = 2;
    private const uint NifTip = 4;
    private const uint MfString = 0;
    private const uint TpmRightButton = 2;
    private const nuint SubclassId = 0xF3EC;
    private const int ExitCommand = 1001;

    private readonly Window _window;
    private readonly AppWindow _appWindow;
    private readonly Action _exit;
    private readonly nint _windowHandle;
    private readonly SubclassProcedure _procedure;
    private NotifyIconData _iconData;
    private bool _disposed;

    public TrayIconService(Window window, AppWindow appWindow, Action exit)
    {
        _window = window;
        _appWindow = appWindow;
        _exit = exit;
        _windowHandle = WinRT.Interop.WindowNative.GetWindowHandle(window);
        _procedure = WindowProcedure;
        if (!SetWindowSubclass(_windowHandle, _procedure, SubclassId, 0)) return;

        _iconData = new NotifyIconData
        {
            Size = (uint)Marshal.SizeOf<NotifyIconData>(),
            WindowHandle = _windowHandle,
            Id = 1,
            Flags = NifMessage | NifIcon | NifTip,
            CallbackMessage = CallbackMessage,
            IconHandle = LoadIcon(0, (nint)32512),
            Tip = "Fennec",
            Info = string.Empty,
            InfoTitle = string.Empty
        };
        ShellNotifyIcon(NimAdd, ref _iconData);
    }

    private nint WindowProcedure(nint window, uint message, nuint wParam, nint lParam, nuint id, nuint data)
    {
        if (message == CallbackMessage)
        {
            if ((uint)lParam == WmLButtonUp)
            {
                _appWindow.Show();
                _window.Activate();
                return 0;
            }
            if ((uint)lParam == WmRButtonUp)
            {
                ShowContextMenu();
                return 0;
            }
        }
        if (message == WmCommand && (int)(wParam & 0xffff) == ExitCommand)
        {
            _exit();
            return 0;
        }
        return DefSubclassProc(window, message, wParam, lParam);
    }

    private void ShowContextMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == 0) return;
        AppendMenu(menu, MfString, ExitCommand, "Exit Fennec");
        GetCursorPos(out var point);
        SetForegroundWindow(_windowHandle);
        TrackPopupMenu(menu, TpmRightButton, point.X, point.Y, 0, _windowHandle, 0);
        DestroyMenu(menu);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        ShellNotifyIcon(NimDelete, ref _iconData);
        RemoveWindowSubclass(_windowHandle, _procedure, SubclassId);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NotifyIconData
    {
        public uint Size; public nint WindowHandle; public uint Id; public uint Flags;
        public uint CallbackMessage; public nint IconHandle;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Tip;
        public uint State; public uint StateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Info;
        public uint TimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string InfoTitle;
        public uint InfoFlags; public Guid GuidItem; public nint BalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X; public int Y; }
    private delegate nint SubclassProcedure(nint window, uint message, nuint wParam, nint lParam, nuint id, nuint data);

    [DllImport("shell32.dll", EntryPoint = "Shell_NotifyIconW", CharSet = CharSet.Unicode)]
    private static extern bool ShellNotifyIcon(uint message, ref NotifyIconData data);
    [DllImport("user32.dll")] private static extern nint LoadIcon(nint instance, nint iconName);
    [DllImport("comctl32.dll")] private static extern bool SetWindowSubclass(nint window, SubclassProcedure procedure, nuint id, nuint data);
    [DllImport("comctl32.dll")] private static extern bool RemoveWindowSubclass(nint window, SubclassProcedure procedure, nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint window, uint message, nuint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern nint CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool AppendMenu(nint menu, uint flags, nuint id, string text);
    [DllImport("user32.dll")] private static extern bool TrackPopupMenu(nint menu, uint flags, int x, int y, int reserved, nint window, nint rectangle);
    [DllImport("user32.dll")] private static extern bool DestroyMenu(nint menu);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint window);
}
