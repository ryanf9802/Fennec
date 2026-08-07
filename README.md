# Fennec

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
Windows 11 x64.

```powershell
dotnet build Fennec.sln
dotnet run --project tests/Fennec.Core.Tests
```

## License

Fennec is available under the [MIT License](LICENSE). Third-party components
remain subject to their respective licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Rocket League and related names are trademarks of their respective owners.
Fennec is an independent community project and is not endorsed by Psyonix or
Epic Games.
