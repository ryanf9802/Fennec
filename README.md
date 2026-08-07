# Fennec

[![Windows build](https://github.com/ryanf9802/Fennec/actions/workflows/build.yml/badge.svg)](https://github.com/ryanf9802/Fennec/actions/workflows/build.yml)

Fennec is a lightweight, native Windows second-monitor dashboard for Rocket
League's local Stats API. It records matches locally, groups them into automatic
sessions, presents a dedicated live-match monitor, and recognizes recurring
teammates and opponents.

## Current feature set

- Game-first timeline with an expanded current session
- Live scoreboards and configurable event timelines
- Past match and session detail
- Recurring teammate and opponent context
- Local SQLite history with JSON and CSV export foundations
- Guided and one-click Stats API configuration
- Windows startup and tray-ready application lifecycle

Fennec does not upload gameplay or identity data. Rank and MMR are not exposed
by the Rocket League Stats API and are not inferred.

## Stats API setup

Before launching Rocket League, edit
`<Install Dir>\TAGame\Config\TAStatsAPI.ini` (or `DefaultStatsAPI.ini`) and add:

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=2
Port=49123
WebPort=49124
```

Fennec can also make the minimal `PacketSendRate` and `WebPort` changes after
showing the target file and creating a backup. Rocket League must be restarted
after a configuration change.

## Development

The solution targets .NET 10 and Windows App SDK 2.3.1. The domain project is
platform-neutral; the UI, local configuration helper, and installer target
Windows 11 x64. Keep the checkout on a Windows-local path such as
`C:\dev\Fennec`; the WinUI XAML compiler does not reliably support WSL UNC
paths.

### Run a downloaded developer build

Every push and pull request produces a self-contained `fennec-dev-win-x64`
artifact in the workflow run. Download and extract it, then run
`Run-Fennec-Dev.cmd`. The artifact includes the .NET runtime, Windows App SDK,
and PDB symbols, so it does not require an installed SDK.

Developer artifacts are unsigned. Windows may show a SmartScreen warning until
the project adopts code signing.

### Run from source

From PowerShell, the development script can install the .NET 10 SDK through
WinGet, restore dependencies, and launch Fennec with diagnostics enabled:

```powershell
.\scripts\dev.ps1 -InstallSdk
```

After the SDK is installed, normal launches only need:

```powershell
.\scripts\dev.ps1
```

Use `-BuildOnly` to compile without launching or `-Clean` to force a clean
rebuild. Visual Studio can open `Fennec.sln` and use the
`Fennec (Developer Mode)` launch profile for breakpoints and PDB debugging.

The underlying commands remain available directly:

```powershell
dotnet build Fennec.sln
dotnet run --project tests/Fennec.Core.Tests
```

### Diagnostics

Developer mode can also be enabled with `Fennec.exe --dev` or the
`FENNEC_DEV_MODE=1` environment variable. It adds a diagnostics section to
Settings and writes seven days of rolling logs under
`%LOCALAPPDATA%\Fennec\logs`. Logs record connection and lifecycle state but do
not record raw Stats API payloads or player display names.

The Settings panel can copy a diagnostic summary and open the log or local data
folders. Include the summary, relevant log lines, and the workflow build SHA
when reporting a problem.

### Release artifacts

Pushes to `main` and manually dispatched workflow runs additionally produce a
self-contained Release ZIP and per-user MSI installer. These are CI artifacts,
not signed production releases.

## License

Fennec is available under the [MIT License](LICENSE). Third-party components
remain subject to their respective licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Rocket League and related names are trademarks of their respective owners.
Fennec is an independent community project and is not endorsed by Psyonix or
Epic Games.
