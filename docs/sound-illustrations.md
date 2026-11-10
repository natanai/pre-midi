# Sound illustrations

The Sound view toggle offers modules or combined. Modules keep each illustration visible without paging or automatic view switching; modules can be folded or expanded independently. Related controls may appear in several panels, always editing the same patch values and undo transaction. Live previews synchronize every copy, and committed edits retain focus in their originating panel.

Combined gathers unique controls into one panel and shows the illustration(s) related to the focused or edited control above them. The illustration area stays visible while scrolling its controls. This is a local layout preference, not authored sound state or history. Switching back restores the separate modules and their folding state.

One physical desktop Inspector is moved between Beat, Freeform and vocal editing contexts. The canonical Inspector and its recorded-audio modules use `soundPanelView.js`, `soundPanelLayout.js` and `soundIllustrations.js`. `soundPanelModels.js` supplies isolated reference lessons using the existing playback equations. The measured scope remains separate from labeled synthetic references.

Visible modules include filter response, filter sweep, distortion, noise, held/short-note amplitude envelopes, glide, pitch bend, vibrato, volume pulse, tone movement, stereo and delay. Recordings have separate envelope, pitch/onset, level/dynamics and stereo panels. Each added movement has its own route graph and controls. Sample-root groups have their own panels, and all 32 harmonic nodes are visible in a single spectrum.

Brightness is intentionally repeated beside filtering, sweep, distortion and tone movement. Envelope parameters appear beside both envelope examples. Recording level appears beside dynamics and stereo. Quick overview controls remain available. Repetition is access to one parameter, not separate processing stages.

## Next sound-design features

Concrete companion controls are scoped in `docs/synthesis-roadmap.json` under `sound_panel_expansions`: distortion input/mix/shaper, noise color/bandwidth, stereo width/mid-side balance, recording time stretch/formants, modulation shape/phase/sync and delay feedback tone/ping-pong. Stereo width/mid-side, delay feedback tone/ping-pong, processor wet/dry and selectable/synced/random/step modulation are already implemented. The remaining candidates are future DSP work, not placeholder knobs in the interface. A useful one-control panel can remain one-control until its companion feature is implemented.

## Prototype workflow

Follow `AGENTS.md`: use the focused panel interaction check for this layout, not a full browser/native qualification cycle. Preserve the canonical musical commands and compact .premidi format.

## Stereo and EQ expansion (2026-11-08)

The shared Inspector adds stereo image and echo stereo/tone modules. Each has two-axis graph editing and ordinary controls; combined view follows width, mid/side balance, echo tone, feedback and ping-pong. Stereo reference traces apply the actual mid/side matrix, with mono limitations explained on labels. Echo reference depicts a 2 kHz signal through feedback tone, with left/right alternation. EQ now adds/removes bands up to eight while retaining surviving graph identities. Focused DOM checks cover vocal edits, undo and combined illustration follow; native/offline audio checks cover the underlying parameters. These stereo/delay companions are implemented; distortion shapers, noise color/bandwidth, recording time stretch and phase/free-run policies remain scoped work.

## Classic modulation effects (2026-11-10)

The shared processing Inspector adds chorus, flanger, phaser and auto-pan modules. Rate/depth plots show motion over two seconds or one synced cycle; delay/feedback shows signed echoes, phaser frequency/feedback shows a 48 kHz midpoint notch reference, and phase/stereo shows the channel offsets. Each relationship has direct graph editing and conventional controls; auto-pan phase is a useful single-control panel. Timing selects free Hz or musical beats without overwriting the saved free rate. Modules/combined focus and project history use the existing common edit paths. These are labeled reference illustrations, not live measured spectra. Focused DOM behavior passes; observed browser and physical Windows/listening acceptance remain open.

## Source treatment and frequency effects (preview.32)

One shared recorded-source pitch/time panel edits transpose and stretch through a direct graph or precise controls, with explicit pitch+speed/independent mode. The formant panel shows a labeled synthetic vowel-envelope reference and ordinary formant controls. Reverse/preserve choices have both checkbox and direct diagram actions. Beat samples and Song vocals use the same panels, history and combined-view focus. The real scope prepares the actual source treatment. Ring/frequency shift add a frequency/sideband reference and a phase/stereo graph; Hz translation is distinguished from musical transposition. Physical observation/listening remains unqualified.
