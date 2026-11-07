# Sound illustrations

The Sound view toggle offers modules or combined. Modules keep each illustration visible without paging or automatic view switching; modules can be folded or expanded independently. Related controls may appear in several panels, always editing the same patch values and undo transaction. Live previews synchronize every copy, and committed edits retain focus in their originating panel.

Combined gathers unique controls into one panel and shows the illustration(s) related to the focused or edited control above them. The illustration area stays visible while scrolling its controls. This is a local layout preference, not authored sound state or history. Switching back restores the separate modules and their folding state.

The shared Beat/freeform Inspector, sampler and vocal editor use `soundPanelView.js`, `soundPanelLayout.js` and `soundIllustrations.js`. `soundPanelModels.js` supplies isolated reference lessons using the existing playback equations. The measured scope remains separate from labeled synthetic references.

Visible modules include filter response, filter sweep, distortion, noise, held/short-note amplitude envelopes, glide, pitch bend, vibrato, volume pulse, tone movement, stereo and delay. Recordings have separate envelope, pitch/onset, level/dynamics and stereo panels. Each added movement has its own route graph and controls. Sample-root groups have their own panels, and all 32 harmonic nodes are visible in a single spectrum.

Brightness is intentionally repeated beside filtering, sweep, distortion and tone movement. Envelope parameters appear beside both envelope examples. Recording level appears beside dynamics and stereo. Quick overview controls remain available. Repetition is access to one parameter, not separate processing stages.

## Next sound-design features

Concrete companion controls are scoped in `docs/synthesis-roadmap.json` under `sound_panel_expansions`: distortion input/mix/shaper, noise color/bandwidth, stereo width/mid-side balance, recording time stretch/formants, modulation shape/phase/sync and delay feedback tone/ping-pong. These are planned DSP work, not placeholder knobs in the interface. A useful one-control panel can remain one-control until its companion feature is implemented.

## Prototype workflow

Follow `AGENTS.md`: use the focused panel interaction check for this layout, not a full browser/native qualification cycle. Preserve the canonical musical commands and compact .premidi format.
