# miniaudio device I/O

Upstream: https://github.com/mackron/miniaudio

Pinned release: 0.11.25, commit `9634bedb5b5a2ca38c1ee7108a9358a4e233f14d`.

Header SHA-256: `ac7af4de748b7e26b777f37e01cee313a308a7296a3eb080e2906b320cc55c89`.

Run `node scripts/fetch-miniaudio.mjs` before building. The build-time download is verified by both immutable commit and SHA-256; the generated header is not committed. Release binaries embed the compiled device layer and never download code at runtime. LICENSE is the unmodified upstream dual public-domain/MIT-0 notice. We use the MIT-0 option. Decoder, encoder, node-graph, resource-manager, generator and high-level engine modules are disabled. pre-midi's own C++ DSP generates audio.

Production backends: WASAPI on Windows, CoreAudio on macOS, PulseAudio or ALSA on Linux. The null backend is available only through an explicit test-host flag (desktop smoke additionally requires PREMIDI_SMOKE_OUTPUT); it is never a production fallback. No miniaudio MIDI, synthesis, plugin or mobile integration is claimed.
