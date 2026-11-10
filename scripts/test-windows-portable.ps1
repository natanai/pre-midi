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
$sourceLicenses = @{
  'LICENSE.txt' = 'Signalsmith-Stretch.txt'
  'LINEAR-LICENSE.txt' = 'Signalsmith-Linear.txt'
}
foreach ($source in $sourceLicenses.Keys) {
  $expected = Get-FileHash (Join-Path $repo "native/vendor/signalsmith-stretch/$source") -Algorithm SHA256
  $actual = Get-FileHash (Join-Path $portable "licenses/$($sourceLicenses[$source])") -Algorithm SHA256
  if ($actual.Hash -ne $expected.Hash) { throw "Portable source-processing license mismatch: $source" }
}
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

# Qualify the documented portable upgrade: replace only application files after
# the previous official preview has closed and released its local WebView profile.
$previousZip = Join-Path $env:RUNNER_TEMP 'premidi-previous-portable.zip'
Invoke-WebRequest 'https://github.com/natanai/pre-midi/releases/download/v0.14.1-preview.3/pre-midi-0.14.1-preview.3-windows-x86_64-portable.zip' -OutFile $previousZip
if ((Get-FileHash $previousZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne '3ae5fc8815bd4c0b1ad45f81801cf7116484c4d91cef26be70db490893f9efd3') {
  throw 'Previous official portable release checksum mismatch'
}
$upgrade = Join-Path $env:RUNNER_TEMP 'premidi portable upgrade'
Expand-Archive $previousZip $upgrade
Invoke-StudioSmoke (Join-Path $upgrade 'pre-midi.exe') 'portable-previous' 'portable-upgrade' -Fresh
$replacement = Join-Path $env:RUNNER_TEMP 'premidi portable replacement'
Expand-Archive $zip.FullName $replacement
foreach ($name in @('pre-midi.exe', 'portable.txt', 'README.txt', 'THIRD-PARTY-NOTICES.txt')) {
  Copy-Item (Join-Path $replacement $name) (Join-Path $upgrade $name) -Force
}
Copy-Item (Join-Path $replacement 'licenses') (Join-Path $upgrade 'licenses') -Recurse -Force
if (Get-Process -Name 'pre-midi' -ErrorAction SilentlyContinue) { throw 'Portable replacement unexpectedly launched the app' }
Invoke-StudioSmoke (Join-Path $upgrade 'pre-midi.exe') 'portable-upgraded' 'portable-upgrade' -Restore
foreach ($name in @('pre-midi.exe', 'portable.txt', 'README.txt', 'THIRD-PARTY-NOTICES.txt')) {
  Copy-Item (Join-Path $replacement $name) (Join-Path $upgrade $name) -Force
}
Invoke-StudioSmoke (Join-Path $upgrade 'pre-midi.exe') 'portable-replaced-again' 'portable-upgrade' -Restore

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


# Integration-test the independent updater process with the actual portable ZIP.
# This invokes the helper after staging. Signed GitHub download verification is
# separately handled by Tauri in updates.rs; this tests the filesystem transaction.
$automatic = Join-Path $env:RUNNER_TEMP 'premidi portable automatic'
Expand-Archive $previousZip $automatic
Invoke-StudioSmoke (Join-Path $automatic 'pre-midi.exe') 'portable-auto-previous' 'portable-auto' -Fresh
$work = Join-Path $automatic '.premidi-update'
New-Item $work -ItemType Directory | Out-Null
Copy-Item $zip.FullName (Join-Path $work 'verified.zip')
Copy-Item (Join-Path $moved 'pre-midi.exe') (Join-Path $work 'runner.exe')
$hash = (Get-FileHash (Join-Path $work 'verified.zip') -Algorithm SHA256).Hash.ToLowerInvariant()
$version = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
Remove-Item 'Env:PREMIDI_SMOKE_EXPECT_FRESH' -ErrorAction SilentlyContinue
$env:PREMIDI_SMOKE_EXPECT_RESTORE = '1'
$env:PREMIDI_SMOKE_STORAGE_TOKEN = 'portable-auto'
$env:PREMIDI_SMOKE_OUTPUT = Join-Path $env:RUNNER_TEMP 'premidi-portable-auto-installed-smoke.json'
$helper = Start-Process (Join-Path $work 'runner.exe') -ArgumentList @('--apply-portable-update', '4294967295', $hash, $version) -WorkingDirectory $automatic -PassThru
if (!$helper.WaitForExit(180000)) { $helper.Kill(); throw 'Portable updater helper timed out' }
if ($helper.ExitCode -ne 0) {
  $failure = Get-Content (Join-Path $work 'failure.txt') -Raw -ErrorAction SilentlyContinue
  throw "Portable updater helper failed: $failure"
}
if ((Get-Content (Join-Path $work 'success.txt') -Raw).Trim() -ne $version) { throw 'Portable updater did not confirm its new version' }
if (Test-Path (Join-Path $work 'backup')) { throw 'Successful portable update retained its rollback backup' }
# The helper confirms UI readiness, not completion of the separate smoke suite.
# Wait for that first launched app to finish and release its portable WebView profile.
$installedSmoke = $env:PREMIDI_SMOKE_OUTPUT
for ($attempt = 0; $attempt -lt 480; $attempt++) {
  if (Test-Path $installedSmoke) { break }
  Start-Sleep -Milliseconds 250
}
if (!(Test-Path $installedSmoke)) { throw 'Updated app never completed its first post-update smoke run' }
$firstReport = Get-Content $installedSmoke -Raw | ConvertFrom-Json
if (!$firstReport.passed) { throw 'Updated app failed its first post-update smoke run' }
Wait-WebViewProfileExit (Join-Path $automatic 'data/webview')
Invoke-StudioSmoke (Join-Path $automatic 'pre-midi.exe') 'portable-auto-upgraded' 'portable-auto' -Restore
# A corrupted staged archive must fail before replacing any application file.
$before = (Get-FileHash (Join-Path $automatic 'pre-midi.exe') -Algorithm SHA256).Hash
# Successful startup cleans the helper staging folder. Restage the files for
# this independent tampering test rather than depending on prior leftovers.
New-Item $work -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $automatic 'pre-midi.exe') (Join-Path $work 'runner.exe') -Force
Copy-Item $zip.FullName (Join-Path $work 'verified.zip') -Force
$bad = Start-Process (Join-Path $work 'runner.exe') -ArgumentList @('--apply-portable-update', '4294967295', ('0' * 64), $version) -WorkingDirectory $automatic -PassThru
if (!$bad.WaitForExit(30000)) { $bad.Kill(); throw 'Tampered package check timed out' }
if ($bad.ExitCode -eq 0 -or (Get-FileHash (Join-Path $automatic 'pre-midi.exe') -Algorithm SHA256).Hash -ne $before) {
  throw 'Tampered staged archive was accepted or modified installed files'
}
if (!(Test-Path (Join-Path $work 'failure.txt'))) { throw 'Rejected update did not record its failure' }
Remove-Item (Join-Path $work 'failure.txt')
Invoke-StudioSmoke (Join-Path $automatic 'pre-midi.exe') 'portable-auto-after-reject' 'portable-auto' -Restore
