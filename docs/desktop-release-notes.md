pre-midi 0.14.1-preview.7 adds native noise and stereo delay playback to the Windows portable studio. Sine Keys and Sine Bell now play through C++/miniaudio with their intended delay, including echoes after note endings and across loops. Seeking retains echoes from already-ended notes. Noise-based synth percussion also plays natively. No Web Audio fallback is used for these features.

- Windows 11 x64 portable ZIP only. Extract the complete folder to a writable location and open `pre-midi.exe`. WebView2 Runtime is required; it is normally present on Windows 11.
- To upgrade: close pre-midi, back up your folder, replace only `pre-midi.exe`, `portable.txt` and `README.txt`, and preserve `data/`, `projects/` and `exports/`. Open the application manually. Earlier preview.1/.2 data remains in AppData; see [migration instructions](https://github.com/natanai/pre-midi/blob/main/docs/desktop-host.md#storage-and-backups).
- Settings displays the release version. Settings → Check for updates retains separate stable/preview channels and a direct link to the official portable ZIP. Select the preview channel for these releases.
- Installers and macOS/Linux previews remain deferred; their native architecture is retained.

Native playback supports the existing oscillator types, filters and sweeps, ADSR, bend/glide curves, canonical modulation, cutoff automation, noise/decay, stereo delay, gain/pan, polyphony, looping, pause/resume and seeking. This phase passes 227 independent browser/native acoustic cases with unchanged max 1e-4 / RMS 2e-5 gates, plus native mixer and allocation tests.

Drive/oversampling, legacy vibrato/tone/tremolo, sample racks and recorded/vocal playback remain unfinished and are reported explicitly. Native playback currently uses a snapshot taken at Play; restart after edits. WAV export and microphone workflows still use Web Audio. The full native compatibility mission in issue #49 remains open.

Automated miniaudio device tests use an explicitly selected null backend. They do not establish physical Windows WASAPI sound, microphone quality, driver underruns, end-to-end latency or sleep/resume behavior. Physical-device qualification remains pending. This unsigned testing build may trigger Windows SmartScreen.
