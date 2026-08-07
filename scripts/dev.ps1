[CmdletBinding()]
param(
    [switch]$InstallSdk,
    [switch]$BuildOnly,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ($repoRoot.StartsWith("\\wsl$", [StringComparison]::OrdinalIgnoreCase) -or
    $repoRoot.StartsWith("\\wsl.localhost", [StringComparison]::OrdinalIgnoreCase)) {
    throw "WinUI builds must run from a Windows-local path such as C:\dev\Fennec, not a WSL UNC path."
}

function Find-DotNet10 {
    $command = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($null -eq $command) { return $null }
    $sdks = & $command.Source --list-sdks 2>$null
    if ($LASTEXITCODE -eq 0 -and $sdks -match '^10\.') { return $command.Source }
    return $null
}

$dotnet = Find-DotNet10
if ($null -eq $dotnet -and $InstallSdk) {
    if ($null -eq (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "WinGet is unavailable. Install the Windows x64 .NET 10 SDK from https://dotnet.microsoft.com/download/dotnet/10.0."
    }
    winget install --id Microsoft.DotNet.SDK.10 --source winget --exact --silent `
        --accept-package-agreements --accept-source-agreements
    $env:Path = "$env:ProgramFiles\dotnet;$env:Path"
    $dotnet = Find-DotNet10
}

if ($null -eq $dotnet) {
    throw "The .NET 10 SDK is required. Re-run with -InstallSdk or install Microsoft.DotNet.SDK.10 with WinGet."
}

Set-Location $repoRoot
$env:FENNEC_DEV_MODE = "1"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"

if ($Clean) {
    & $dotnet clean .\src\Fennec.App\Fennec.App.csproj -c Debug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $dotnet restore .\src\Fennec.App\Fennec.App.csproj -r win-x64
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($BuildOnly) {
    & $dotnet build .\src\Fennec.App\Fennec.App.csproj -c Debug --no-restore
} else {
    & $dotnet run --project .\src\Fennec.App\Fennec.App.csproj -c Debug --no-restore -- --dev
}
exit $LASTEXITCODE
