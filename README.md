# pre-midi

A standalone local-first synthesizer composition studio for pre-programmed.

## Use
The static studio has no backend, login, runtime dependency, or build step. Serve the repository from any local static HTTP server (for example run Python's http.server on port 8080). The GitHub Pages deployment workflow targets https://natanai.github.io/pre-midi/ once **Settings > Pages > Build and deployment > GitHub Actions** is enabled.

## Included in v0.1
- 16-step piano roll, note lengths, per-track patterns, duplication and arrangement across 2–16 bars.
- 1–12 tracks with basic waveform, volume, attack, and release controls.
- Transport, optional loop, undo/redo, and offline stereo WAV rendering.
- Import/export **.premidi v1** composition files using standard browser file APIs.
- Local browser draft recovery. Always export a portable file to back up your work.

## Native format
The versioned v1 composition schema lives in schema.js. A .premidi file contains self-contained 4/4 synthesizer score data (track IDs, pattern IDs, notes, arrangement, and instrument controls) encoded in UTF-8 JSON. No recorded samples or third-party instrument assets are included. Pre-programmed can preserve a stable composition ID and control the arrangement without recreating the music-production interface.

## Not yet implemented
FLAC export, General MIDI export, SoundFonts, samples, effects, piano roll drag/resize, unlimited bars, and direct local sync. This is an early functional milestone, **not yet a full DAW**.

Run npm run check using Node.js 20+ to verify the current source.
