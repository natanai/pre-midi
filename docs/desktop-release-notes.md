pre-midi desktop preview uses Tauri with the existing studio and bundled local assets.

- Windows 11 x64: per-user NSIS installer and portable ZIP. WebView2 Runtime is required; it is normally present on Windows 11. Keep the extracted ZIP together.
- macOS 15.4+: separate Intel (x86_64) and Apple Silicon (aarch64) DMGs. Unsigned previews may be blocked by Gatekeeper; Apple signing/notarization is not configured.
- Linux x86_64: AppImage and DEB, built on Ubuntu 22.04. WebKitGTK 4.1 and desktop audio dependencies are required. AppImage compatibility and physical devices remain under qualification.

Music playback and WAV export use Web Audio in the operating system's WebView. The embedded C++ core can render a bounded offline fixture in the desktop process; it is not the studio's real-time audio-device backend. Noise, drive, delay, legacy modulation and complete project parity are unfinished native DSP work.

Settings displays the packaged application version and checks official GitHub Releases. Stable and preview channels are separate; downgrades are refused. Automatic installation requires a configured trusted signing key and a signed package. Portable Windows ZIP and Linux DEB editions use manual replacement/package-manager installation. Updates never deliberately remove user data.

These are testing builds. Automated packaging and WebView smoke checks do not establish microphone quality, hardware audio latency, human listening quality, Windows 11 installation/upgrade reliability or all-platform compatibility. Do not treat this prerelease as stable. Export music ZIPs to back up external WAV assets and projects before testing.
