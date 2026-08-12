[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Config,

  [ValidateRange(1, 10)]
  [int]$MaxAttempts = 3
)

$transientFailurePatterns = @(
  'failed to bundle project:.*http status:\s*(408|425|429|5\d\d)',
  'failed to bundle project:.*peer disconnected',
  'failed to bundle project:.*connection (reset|closed|refused)',
  'failed to bundle project:.*timed out',
  'failed to bundle project:.*temporarily unavailable'
)

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  $buildOutput = @()
  & pnpm exec tauri build --no-sign --config $Config 2>&1 |
    Tee-Object -Variable buildOutput
  $buildExitCode = $LASTEXITCODE

  if ($buildExitCode -eq 0) {
    exit 0
  }

  $combinedOutput = $buildOutput -join "`n"
  $isTransientFailure = $false
  foreach ($pattern in $transientFailurePatterns) {
    if ($combinedOutput -match $pattern) {
      $isTransientFailure = $true
      break
    }
  }

  if (-not $isTransientFailure -or $attempt -eq $MaxAttempts) {
    exit $buildExitCode
  }

  $delaySeconds = 10 * $attempt
  Write-Output "::warning::Transient Tauri bundler download failure on attempt $attempt of $MaxAttempts. Retrying in $delaySeconds seconds."
  Start-Sleep -Seconds $delaySeconds
}
