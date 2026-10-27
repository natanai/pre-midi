# Tauri desktop host and release operations

Tauri is the chosen desktop framework, at Nat's request. The studio remains the same HTML/CSS/JavaScript dependency graph as GitHub Pages, embedded with all 122 pinned sample assets. There is no hosted-site dependency or UI rewrite. The authoritative product version is package.json; Tauri reads that file directly and Settings reads the running app's metadata. desktop/Cargo.toml and Cargo.lock are synchronized by the npm version hook; scripts/desktop-config.mjs rejects a mismatch.

**Current preview policy:** publish only the Windows 11 x64 portable ZIP during rapid prototyping. The installer and macOS/Linux package configurations remain available for full-release engineering, but are not published by the preview workflow. Cross-platform native code and canonical music semantics remain shared. Earlier releases are historical builds, not the current preview target.

## Framework decision

| Requirement | Tauri | Electron |
| --- | --- | --- |
| Existing studio | Uses the existing files in platform WebViews | Uses the existing files in bundled Chromium |
| Platform audio | WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux; each needs qualification | Bundled Chromium reduces browser-engine differences, with a larger runtime |
| Recording | Web APIs and OS microphone permission; macOS includes usage description | Chromium media APIs plus explicit session permission handlers |
| Files | Narrow Rust save command opens native dialog; existing input controls open projects | Main-process dialogs and isolated preload bridge |
| Persistence | Installer uses the user profile; Windows portable ZIP keeps its profile inside its own folder | Configurable Chromium profile; portable mode also requires explicit folder-local configuration |
| Updates | Tauri Minisign artifact verification, version binding, platform installers | electron-updater plus additional signed-manifest or OS-signing configuration |
| C++ integration | cc compiles a bounded C ABI fixture into the Rust process; expand the same boundary later | Node-API addon or isolated native process |
| Maintenance | Rust toolchain and system WebView dependencies; smaller application runtime | Chromium/Node runtime updates, larger downloads and an additional IPC boundary |

Tauri meets the requested host architecture. Engine differences are a qualification obligation, not evidence of sound parity. The macOS preview requires 15.4 or newer because the bundled recorded instruments use Ogg/Vorbis; [WebKit added this container support on macOS 15.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/). The native smoke test decodes a bundled Ogg sample as well as rendering synth PCM. References: [WebView versions](https://v2.tauri.app/reference/webview-versions/), [Tauri updater](https://v2.tauri.app/plugin/updater/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

## Audio boundary

1. **Desktop-packaged Web Audio:** remains an explicit Settings choice; microphone workflows and WAV export retain the existing studio adapters.
2. **Embedded native DSP proof:** native/desktop-fixture.cpp calls the existing C++ Voice in the Tauri process through a bounded C ABI. native_fixture returns one fixed 48 kHz stereo fixture. It is an offline renderer, not a native output-device backend.
3. **Native real-time synth vertical slice (preview.4):** the default desktop playback adapter sends supported canonical plans to the C++ miniaudio device host. Production uses WASAPI/CoreAudio/PulseAudio/ALSA. Device selection, pause/resume/seek/loop, voice stealing and separate native previews are implemented. Complete synthesis/effects/sample parity, live edits during playback, latency, underruns and physical hardware qualification remain SYN-018 work. SYN-019 remains mobile delivery.

The native adapter accepts validated canonical synth-voice plans on a dedicated control thread, prepares immutable instructions/banks/coefficients, and calls Voice::process in miniaudio callbacks. See [native audio architecture and qualification](native-audio.md). Unsupported instructions reject the whole session; the user may explicitly choose Web Audio, with no automatic fallback. pre-programmed continues to share the canonical file/plan contracts; this host does not imply game-host parity.

## Storage and backups

- Windows installer: the WebView profile is explicitly under `%LOCALAPPDATA%\app.premidi.studio\webview`.
- Windows portable, preview.3 onward: `portable.txt` beside `pre-midi.exe` selects `<executable folder>/data/webview`. This contains localStorage presets/settings, IndexedDB drafts and external recorded WAV bytes, and WebView caches. Project/music ZIP saves default to `<executable folder>/projects`, WAV exports to `<executable folder>/exports`. Paths come from the executable, not the working directory. Moving or copying the closed portable folder carries its data, and separate copies do not share profiles. A folder that cannot be written produces a visible startup error; it never silently falls back to AppData. Existing data-folder junctions/symlinks pointing outside the master folder are rejected.
- Linux: the WebView profile is explicitly under `$XDG_DATA_HOME/app.premidi.studio/webview`, normally `~/.local/share/app.premidi.studio/webview`.
- macOS: WKWebView uses its OS-managed website data store outside the .app bundle. Do not assume that copying the .app copies website data. WebKit stores website data under the user's Library; paths can vary with OS versions. Project ZIP export is the portable backup mechanism.
- Exported projects and recordings go to the path explicitly chosen in the native save dialog. Portable defaults stay inside the master folder; choosing an external destination explicitly can save outside it. Installed editions keep persistent data outside replaceable application files. The portable edition deliberately keeps user data in its own folder, separate from the executable, so updates must preserve `data`, `projects` and `exports`.
- Presets and settings retain their localStorage keys. Drafts and recording/sample bytes retain the pre-midi-local IndexedDB schema and asset identities. File formats, Song/Beat versions, automation and modulation semantics are unchanged.

Close the app before copying a whole WebView profile. Export music ZIPs for durable project backups with external audio assets. A plain .premidi file does not embed WAV bytes. Browser/PWA profiles do not automatically migrate into the desktop profile. Applying a saved preset and exporting a Beat provides a portable copy of that sound's patch and assets.

**Portable migration from preview.1/.2:** those ZIPs used the installer's AppData profile. They are not silently imported or deleted. Close all pre-midi windows, back up `%LOCALAPPDATA%\app.premidi.studio\webview`, then copy that `webview` folder into the new portable folder's `data` directory before its first launch. To replace an already initialized portable profile, first back up that profile and move it aside; never merge live profile directories. Alternatively export/import music ZIPs; profile copying also retains presets and settings. The original AppData profile remains untouched, so the installed edition continues to work independently.

**Portable upgrade:** close the app, back up the entire master folder, and replace only `pre-midi.exe`, `portable.txt` and `README.txt` from the newer ZIP. Keep `data`, `projects` and `exports`. Extracting a new ZIP elsewhere creates a separate, empty profile until its data is copied. Do not delete the old folder as an upgrade step. Removing `portable.txt` changes the executable to installed-profile behavior, so keep the marker.

Folder locality covers application-managed profile, music and cache data. WebView2 remains a Windows runtime dependency, normally installed with Windows 11; this ZIP does not bundle a fixed WebView2 runtime. Windows can maintain system/runtime files, temporary files and file-dialog history outside the folder. This is not an operating-system sandbox. macOS and Linux storage behavior is unchanged by the Windows portable change.

The close/update path awaits the existing IndexedDB save transaction. Normal shutdown closes the WebView window/controller before requesting process exit, so profile writes can complete. The Windows relocation test also waits for WebView2 browser processes to release the profile before moving/copying it, following [Microsoft's user-data-folder lifetime guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder). An unfinished microphone session prevents closing until it is used or cancelled. Failed saves leave the app open with an error. Cancelling a native save dialog is reported as cancelled, not exported.

## Update behavior

Settings queries only natanai/pre-midi's GitHub Releases API over HTTPS. Stable excludes GitHub prereleases and SemVer prerelease versions; preview can advance to a newer preview or stable version. Drafts and downgrades are excluded. The available version and notes are shown before downloading.

Automatic installation requires a trusted public key embedded at build time and a complete release with desktop-updates.json. Tauri verifies the downloaded package against that key and requires its signed version to match the advertised version. The install call verifies the package again. A forged manifest cannot authorize an unsigned executable or relabel an old signed package as a newer one. Download/verification failures show an error and leave current data intact.

Before installation the UI saves local work and displays exactly:

> pre-midi will close to install the update. When installation finishes, open pre-midi again to continue.

| Edition | Implemented behavior when signing is configured |
| --- | --- |
| Windows installer | Tauri launches the per-user NSIS updater and exits; restart_after_install(false) omits the relaunch flags. No requested elevation. Successful completion still requires installed-upgrade qualification. |
| Windows portable ZIP | Automatic installation is disabled; close the app, replace release files while retaining `data`, `projects` and `exports`, then reopen manually. |
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

Use `npm version 0.14.1-preview.4` (or the next intended version) to update the authoritative package version and generated Cargo metadata together. Preview 1 passed all four PR builds but its tagged publication met external runner DNS/package-server failures; preview 2 adds bounded dependency setup and avoids recompiling debug dependencies for the release-policy tests. Preview 3 gives the Windows portable edition an independent folder-local profile. Older in-flight preview builds are superseded when a newer preview is pushed.

- `npm ci` uses package-lock.json; Cargo uses committed Cargo.lock with --locked. Rust is pinned to 1.99.1, Tauri CLI to 2.12.4, and the host/updater/dialog crates to exact versions.
- `.github/workflows/desktop-release.yml` currently runs only Windows x64, with `tauri build --no-bundle` and a portable ZIP. It produces no installer, macOS or Linux release assets. The full-set package/publish helpers and platform-specific Tauri configuration are retained; restore the multi-platform qualification matrix before a full release.
- PR builds publish CI artifacts only. Merging this preview version to main or publishing its exact version tag runs prerelease publication. workflow_dispatch defaults to CI artifacts and offers an explicit publish_preview input.
- The source job verifies or creates the immutable version tag, and publication builds check out that tag. A different commit cannot reuse the same version. A stable version is rejected until release policy is revised after installed-app/update qualification.
- The aggregate job explicitly selects `--windows-portable-only`, requires exactly one Windows portable artifact, rejects extra installer/platform packages, rechecks its size/hash and produces SHA256SUMS.txt. The default full-release helper still requires the complete platform set and refuses partial signed update sets. Release assets are uploaded to a draft, and the release becomes visible only after all uploads succeed.
- GitHub Pages remains independent and uses the same studio sources. No generated dist/ or downloaded samples are committed.

## Qualification

The workflow distinguishes unit/contract tests from packaged portable WebView execution. The Windows runner is Windows Server 2022, not a Windows 11 PC. The smoke evidence records each completed check and its limits. Release notes must preserve those distinctions. Earlier multi-platform and installed NSIS checks are historical qualification, not a claim that those packages ship in preview.4.

The Windows portable check starts with an empty local profile, moves the whole folder, copies it, changes the copy's identity, and reopens both folders to verify independent presets/settings and recorded WAV bytes. It also launches the SHA-256-verified official preview.3 ZIP, closes it, replaces only application files with preview.4, manually reopens it and verifies retained data. Repeating that replacement tests same-version recovery. An unusable local data directory fails without falling back to AppData. Rust path tests cover marker detection, relocation, separate folders and rejection of an escaping symlink on Unix. These checks do not establish that all Windows system writes are folder-local or qualify signed automatic installation.

Required physical checks before stable: fresh Windows 11 installation, portable launch, microphone permission and capture, audible playback, preset selection, Beat/Song save/reopen/export, offline launch, current/new-version update checks, successful signed update with manual reopen, and preservation of settings/presets/recording bytes. Repeat practical checks on macOS and Linux. Benchmark native output-device latency and underruns separately from the offline fixture.
