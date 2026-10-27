# Desktop host: Tauri

Tauri is the requested desktop framework. The existing HTML/CSS/JavaScript studio is embedded locally, with no UI rewrite. Electron was evaluated for consistent bundled Chromium behavior, but is not included. Tauri's smaller host and Rust command boundary are preferred; WebView2, WKWebView and WebKitGTK audio/recording differences require actual host qualification.

This first implementation is an unqualified preview scaffold, not a released native audio engine. Playback and WAV export use Web Audio. The C++ core in native/ remains authoritative for its supported offline synthesis profile; a future bounded Rust/C++ interface must validate canonical voice plans and explicitly reject unsupported features. Desktop packaging does not complete SYN-018's device integration gate. SYN-019 remains mobile work.

Version comes from package.json through Tauri's version file reference. The Cargo package version describes the internal host crate, not the product release. Settings reads the running Tauri application's metadata.

Exports use a Rust native save dialog. Imports retain the studio file inputs. Drafts, recording assets and presets retain existing IndexedDB/localStorage semantics in the platform WebView profile, outside installation files. Browser profiles are not automatically migrated. Export music ZIPs including external WAV assets before reinstalling; a .premidi JSON alone does not contain recorded bytes. Full data-path documentation and upgrade/reinstall tests remain required.

The desktop-preview workflow builds separate Windows x64, macOS Intel/Apple Silicon and Linux x64 CI artifacts. It publishes no stable release. Artifact generation is not installed-app validation. Rust/Cargo dependencies must be locked after the first verified build before the release pipeline is accepted.

## Remaining release gates

- Compile and inspect all four platform builds; create Windows portable ZIP and explicit SHA-256 checksums.
- Provision a persistent Tauri updater private key as a repository secret and embed its public key. Never commit the private key. No automatic updates are currently enabled.
- Implement preview/stable discovery from official GitHub Releases, signature verification, user confirmation, saved-data flush and no automatic relaunch. Inspect Windows installer behavior before claiming this last guarantee.
- Aggregate all artifacts before publishing a GitHub prerelease; keep Pages independent.
- Test playback, preset selection, Beat/Song save/reopen, WAV export, real microphone permission, offline operation and persistence after install/update/reinstall on actual devices. CI currently checks buildability and existing JavaScript tests only.
- Configure OS signing/notarization separately from updater signatures. Unsigned previews may trigger SmartScreen/Gatekeeper restrictions.

References: https://v2.tauri.app/reference/webview-versions/ and https://v2.tauri.app/plugin/updater/
