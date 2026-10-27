# Tauri desktop host and release operations

Tauri is the chosen desktop framework, at Nat's request. The studio remains the same HTML/CSS/JavaScript dependency graph as GitHub Pages, embedded with all 122 pinned sample assets. There is no hosted-site dependency or UI rewrite. The authoritative product version is package.json; Tauri reads that file directly and Settings reads the running app's metadata. desktop/Cargo.toml and Cargo.lock must match; scripts/desktop-config.mjs rejects a mismatch.

## Framework decision

| Requirement | Tauri | Electron |
| --- | --- | --- |
| Existing studio | Uses the existing files in platform WebViews | Uses the existing files in bundled Chromium |
| Platform audio | WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux; each needs qualification | Bundled Chromium reduces browser-engine differences, with a larger runtime |
| Recording | Web APIs and OS microphone permission; macOS includes usage description | Chromium media APIs plus explicit session permission handlers |
| Files | Narrow Rust save command opens native dialog; existing input controls open projects | Main-process dialogs and isolated preload bridge |
| Persistence | WebView profile outside installation directory; same identifier across releases | Chromium profile outside installation directory |
| Updates | Tauri Minisign artifact verification, version binding, platform installers | electron-updater plus additional signed-manifest or OS-signing configuration |
| C++ integration | cc compiles a bounded C ABI fixture into the Rust process; expand the same boundary later | Node-API addon or isolated native process |
| Maintenance | Rust toolchain and system WebView dependencies; smaller application runtime | Chromium/Node runtime updates, larger downloads and an additional IPC boundary |

Tauri meets the requested host architecture. Engine differences are a qualification obligation, not evidence of sound parity. References: [WebView versions](https://v2.tauri.app/reference/webview-versions/), [Tauri updater](https://v2.tauri.app/plugin/updater/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

## Audio boundary

1. **Desktop-packaged Web Audio:** all ordinary playback, recording, and WAV export still use the existing studio adapters.
2. **Embedded native DSP proof:** native/desktop-fixture.cpp calls the existing C++ Voice in the Tauri process through a bounded C ABI. native_fixture returns one fixed 48 kHz stereo fixture. It is an offline renderer, not a native output-device backend.
3. **Fully native real-time playback:** unfinished. Native device hosting, complete synthesis/effects/sample parity, live scheduling, latency, underruns and hardware qualification remain SYN-018 work. SYN-019 remains mobile delivery.

The next native adapter should accept validated canonical synth-voice plans on the control thread, prepare immutable state, and call Voice::process from an appropriate audio-device callback. Keep native/bridge.mjs's unsupported-feature rejection policy. A project must never silently switch generators when a native feature is unsupported. pre-programmed continues to share the canonical file/plan contracts; desktop packaging does not imply game-host parity.

## Storage and backups

- Windows: the WebView profile is explicitly under `%LOCALAPPDATA%\app.premidi.studio\webview`.
- Linux: the WebView profile is explicitly under `$XDG_DATA_HOME/app.premidi.studio/webview`, normally `~/.local/share/app.premidi.studio/webview`.
- macOS: WKWebView uses its OS-managed website data store outside the .app bundle. Do not assume that copying the .app copies website data. WebKit stores website data under the user's Library; paths can vary with OS versions. Project ZIP export is the portable backup mechanism.
- Exported projects and recordings go to the path chosen in the native save dialog. No persistent user data belongs in the installation directory. The Windows portable edition also uses the user profile, so extracting a newer ZIP in another folder retains the same profile.
- Presets and settings retain their localStorage keys. Drafts and recording/sample bytes retain the pre-midi-local IndexedDB schema and asset identities. File formats, Song/Beat versions, automation and modulation semantics are unchanged.

Close the app before copying a whole WebView profile. Export music ZIPs for durable project backups with external audio assets. A plain .premidi file does not embed WAV bytes. Browser/PWA profiles do not automatically migrate into the desktop profile. Applying a saved preset and exporting a Beat provides a portable copy of that sound's patch and assets.

The close/update path awaits the existing IndexedDB save transaction. An unfinished microphone session prevents closing until it is used or cancelled. Failed saves leave the app open with an error. Cancelling a native save dialog is reported as cancelled, not exported.

## Update behavior

Settings queries only natanai/pre-midi's GitHub Releases API over HTTPS. Stable excludes GitHub prereleases and SemVer prerelease versions; preview can advance to a newer preview or stable version. Drafts and downgrades are excluded. The available version and notes are shown before downloading.

Automatic installation requires a trusted public key embedded at build time and a complete release with desktop-updates.json. Tauri verifies the downloaded package against that key and requires its signed version to match the advertised version. The install call verifies the package again. A forged manifest cannot authorize an unsigned executable or relabel an old signed package as a newer one. Download/verification failures show an error and leave current data intact.

Before installation the UI saves local work and displays exactly:

> pre-midi will close to install the update. When installation finishes, open pre-midi again to continue.

| Edition | Implemented behavior when signing is configured |
| --- | --- |
| Windows installer | Tauri launches the per-user NSIS updater and exits; restart_after_install(false) omits the relaunch flags. No requested elevation. Successful completion still requires installed-upgrade qualification. |
| Windows portable ZIP | Automatic installation is disabled; extract a new ZIP into another folder or switch to the installer. |
| macOS .app | Tauri verifies and stages the .app replacement with its backup/restore flow, then pre-midi exits without relaunching. Apple signing/notarization and quarantine behavior require separate qualification. |
| Linux AppImage | Tauri verifies and replaces the AppImage with framework backup/restore on errors, then exits without relaunching. Interruption/power-loss recovery is not guaranteed. |
| Linux DEB | Automatic installation is disabled; use the system package manager. The app does not request unnecessary root privileges. |

The no-relaunch API and signed-version behavior are from the pinned [tauri-plugin-updater 2.14.0 source](https://docs.rs/crate/tauri-plugin-updater/2.14.0/source/src/updater.rs). This is implementation evidence; it does not substitute for a completed update on physical Windows/macOS/Linux devices. Cached updates are kept only for the running session; after an interruption, check and download again. No universal rollback promise is made.

## Signing setup

Update signing and OS code signing are different. No Windows Authenticode or Apple Developer signing/notarization credentials are currently configured. Unsigned previews remain buildable and are labelled accordingly. Without an update public key, Check for updates can report a newer release but cannot install it automatically.

A maintainer with GitHub CLI repository-secret access can run, from the checkout after `npm ci`:

```
node scripts/setup-desktop-signing.mjs
```

The script creates a Tauri keypair, stores the private key via GitHub CLI stdin in `TAURI_SIGNING_PRIVATE_KEY`, and stores the public key as the repository variable `TAURI_UPDATER_PUBLIC_KEY`. It preserves a private backup under the maintainer's user configuration directory and prints only that path. It never commits the private key. GitHub CLI authentication and secret-management permission are required; the connected repository tools in this session do not expose secret writes. Keep the backup private. If using a password-protected key instead, also configure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Publish a new preview after setting the keys. Existing previews built without the public key require one manual replacement before automatic updates can be trusted. Key rotation requires retaining an established trust path; do not overwrite a key casually.

## Build and publication

- `npm ci` uses package-lock.json; Cargo uses committed Cargo.lock with --locked. Rust is pinned to 1.99.1, Tauri CLI to 2.12.4, and the host/updater/dialog crates to exact versions.
- `.github/workflows/desktop-release.yml` runs Windows x64, Intel Mac, Apple Silicon Mac and Linux x64 jobs. Windows uses a per-user NSIS installer and a ZIP containing the standalone executable. macOS outputs separate DMGs. Linux outputs AppImage and DEB.
- PR builds publish CI artifacts only. Merging this preview version to main or publishing its exact version tag runs prerelease publication. workflow_dispatch defaults to CI artifacts and offers an explicit publish_preview input.
- The source job verifies or creates the immutable version tag, and publication builds check out that tag. A different commit cannot reuse the same version. A stable version is rejected until release policy is revised after installed-app/update qualification.
- The aggregate job requires every platform artifact, rechecks its size/hash and produces SHA256SUMS.txt. It refuses partial signed update sets. Release assets are uploaded to a draft, and the release becomes visible only after all uploads succeed.
- GitHub Pages remains independent and uses the same studio sources. No generated dist/ or downloaded samples are committed.

## Qualification

The workflow distinguishes unit/contract tests, packaged WebView execution and an installed Windows runner smoke. The Windows runner is Windows Server 2022, not a Windows 11 PC. macOS/Linux checks do not imply a physical microphone or listening review. The smoke evidence records each completed check and its limits. Release notes must preserve those distinctions.

Required physical checks before stable: fresh Windows 11 installation, portable launch, microphone permission and capture, audible playback, preset selection, Beat/Song save/reopen/export, offline launch, current/new-version update checks, successful signed update with manual reopen, and preservation of settings/presets/recording bytes. Repeat practical checks on macOS and Linux. Benchmark native output-device latency and underruns separately from the offline fixture.
