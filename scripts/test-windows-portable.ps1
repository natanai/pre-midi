$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$zip = Get-ChildItem (Join-Path $repo 'release/*-portable.zip')
if (@($zip).Count -ne 1) { throw 'Expected one portable ZIP' }

function Wait-WebViewProfileExit {
  param([string]$Profile)
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $children = Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" | Where-Object {
      $_.CommandLine -and $_.CommandLine.Contains($Profile, [StringComparison]::OrdinalIgnoreCase)
    }
    if (!$children) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "WebView2 did not release its profile after closing: $Profile"
}

function Invoke-StudioSmoke {
  param([string]$Exe, [string]$Name, [string]$Token, [switch]$Restore, [switch]$Fresh,
        [string]$WriteToken = '', [bool]$Portable = $true)
  $env:PREMIDI_SMOKE_OUTPUT = Join-Path $env:RUNNER_TEMP "premidi-$Name-smoke.json"
  $env:PREMIDI_SMOKE_STORAGE_TOKEN = $Token
  foreach ($key in @('PREMIDI_SMOKE_EXPECT_RESTORE', 'PREMIDI_SMOKE_EXPECT_FRESH', 'PREMIDI_SMOKE_WRITE_TOKEN')) {
    Remove-Item "Env:$key" -ErrorAction SilentlyContinue
  }
  if ($Restore) { $env:PREMIDI_SMOKE_EXPECT_RESTORE = '1' }
  if ($Fresh) { $env:PREMIDI_SMOKE_EXPECT_FRESH = '1' }
  if ($WriteToken) { $env:PREMIDI_SMOKE_WRITE_TOKEN = $WriteToken }
  # Deliberately launch from a different working directory.
  $app = Start-Process $Exe -WorkingDirectory $env:RUNNER_TEMP -PassThru
  if (!$app.WaitForExit(120000)) { $app.Kill(); throw "$Name launch timed out" }
  if ($app.ExitCode -ne 0) { throw "$Name failed: $($app.ExitCode)" }
  $report = Get-Content $env:PREMIDI_SMOKE_OUTPUT -Raw | ConvertFrom-Json
  if (!$report.passed -or $report.storage.portable -ne $Portable) { throw "$Name storage mode failed" }
  # Microsoft requires browser-process exit, not merely host-process exit,
  # before moving or copying a WebView2 user data folder.
  Wait-WebViewProfileExit $report.storage.webview
  if ($Portable) {
    $expected = Join-Path (Split-Path $Exe -Parent) 'data/webview'
    if ([IO.Path]::GetFullPath($report.storage.webview) -ne [IO.Path]::GetFullPath($expected)) {
      throw "$Name profile escaped its portable folder"
    }
    if (!(Get-ChildItem $expected -Recurse -File | Select-Object -First 1)) { throw 'No on-disk portable profile' }
  }
  Write-Host (Get-Content $env:PREMIDI_SMOKE_OUTPUT -Raw)
}

$portable = Join-Path $env:RUNNER_TEMP 'premidi portable first'
Expand-Archive $zip.FullName $portable
Invoke-StudioSmoke (Join-Path $portable 'pre-midi.exe') 'portable-fresh' 'portable-a' -Fresh

# Windows can briefly retain WebView child-process handles after the main exit.
$moved = Join-Path $env:RUNNER_TEMP 'premidi portable moved'
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try { Move-Item $portable $moved; break }
  catch { if ($attempt -eq 19) { throw }; Start-Sleep -Milliseconds 500 }
}
Invoke-StudioSmoke (Join-Path $moved 'pre-midi.exe') 'portable-moved' 'portable-a' -Restore

$copied = Join-Path $env:RUNNER_TEMP 'premidi portable copied'
Copy-Item $moved $copied -Recurse
Invoke-StudioSmoke (Join-Path $copied 'pre-midi.exe') 'portable-copied' 'portable-a' -Restore -WriteToken 'portable-b'
Invoke-StudioSmoke (Join-Path $copied 'pre-midi.exe') 'portable-copy-reopened' 'portable-b' -Restore
Invoke-StudioSmoke (Join-Path $moved 'pre-midi.exe') 'portable-original-isolated' 'portable-a' -Restore

# An unusable local data path must fail rather than silently use AppData.
$blocked = Join-Path $env:RUNNER_TEMP 'premidi portable blocked'
Expand-Archive $zip.FullName $blocked
Remove-Item (Join-Path $blocked 'data') -Recurse
Set-Content (Join-Path $blocked 'data') 'not a directory'
$env:PREMIDI_SMOKE_OUTPUT = Join-Path $env:RUNNER_TEMP 'premidi-portable-blocked-smoke.json'
$app = Start-Process (Join-Path $blocked 'pre-midi.exe') -PassThru
if (!$app.WaitForExit(30000)) { $app.Kill(); throw 'Unusable portable folder hung' }
$failure = Get-Content $env:PREMIDI_SMOKE_OUTPUT -Raw | ConvertFrom-Json
if ($app.ExitCode -eq 0 -or $failure.passed -or $failure.error -notlike '*writable portable folder*') {
  throw 'Unusable portable folder did not fail safely'
}
Write-Host (Get-Content $env:PREMIDI_SMOKE_OUTPUT -Raw)

Invoke-StudioSmoke (Join-Path $env:RUNNER_TEMP 'premidi-installed/pre-midi.exe') 'installed-after-portable' 'installed-profile' -Restore -Portable $false
