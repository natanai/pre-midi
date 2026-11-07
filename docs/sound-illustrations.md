# Sound illustration implementation and chat handoff

**Ownership:** this is the concise implementation note for educational Sound illustrations. `soundInspector.js` owns the shared Beat/freeform Inspector; `docs/song-rollout.md` owns Song architecture. Update only facts affected by the work, without repeating old validation logs.

## Knob ↔ illustration semantic audit (2026-11-07)

The reported distortion failure exposed a gap in the earlier coverage claim: a node on some other page, a moving marker, or a changing caption is insufficient. Coverage now requires a directly editable node/action, the full ordinary control range and precision, and a changing linked signal or explicitly identified reference trace. The existing knobs and the graph use the same patch mutation/history paths in the one shared Inspector.

**Navigation:** deliberate focus/input on an ordinary control reveals its responsive editing page. Distortion immediately reveals the filter's before/after waveform; pulse, vibrato wait, modulation smoothing and all paginated partial/root controls reveal their corresponding nodes. Pointer crossings do not change pages or highlight graphs. Existing `preventScroll` focus restoration and scroll offsets remain in force.

| Control family | Educational result and inverse control |
| --- | --- |
| Oscillators / harmonics | Exact octave/detune source frequency, mixed/source waveforms, partial amplitudes and all 32 partial nodes; removed the unused approximate oscillator renderer. Silent sources have an explicit dashed source reference. |
| Brightness / resonance / distortion | Analytic frequency response and the existing 220 Hz before/after reference waveform; X brightness, Y drive; ordinary distortion input automatically reveals the waveform. Removed misleading miniature duplicates from the response view. |
| Sweep / noise | Actual clamped cutoff excursion, requested sweep reference when range-limited, time/amount nodes, noise decay with zero meaning steady noise. Inactive durations retain editable reference curves and a reason. |
| Pitch / movement | Real shared pitch equations and 130 ms vibrato onset ramp over a 4.5 s reference note, covering the entire wait/glide ranges. Distinct bend/wait and pulse/tone/stereo views expose all axes. Inactive rates have labeled dashed references. |
| Gain / stereo | Equal-power left/right reference signals and multiplied Instrument/Sound levels. Patch sample gain and outer Sound gain have distinct domains, preventing false coverage, preview crossover or focus restoration to the wrong knob. |
| Samples / vocals | Explicit 8 s reference recording and 4 s held note, matching native onset/key-off/end/tail rules. One-shot/vocal fade nodes move the fade start; keyed release moves the end. Attack and vocal fade retain their real 5 ms precision. Labeled 55 Hz references, L/R signals and paired recording levels explain pitch-follow, transpose, strum, gain and normalization without claiming source PCM. |
| Added movements | Actual smoothed source traces for all four source kinds, zero-depth references, and source/range/target actions. The envelope reference includes the maximum attack/decay, held stage and release tail. All sampler knobs now preview their shared illustrations during dragging, including standalone/phone mounts. |
| Delay / per-note / mapping / automation | Dry/wet returns plus inactive wet references; editable straight-bend amount with an explicit wave guide; all recorded MIDI roots and automation endpoints retain their natural axes. |

**Audits:** `tests/soundTeachingSemantics.test.js` checks **262 numeric context tasks** and **802 view-to-control transitions**, including default patches, muted recordings, inactive effects, one-shot/natural-end samples, vocals, harmonic partials, all route kinds and gain contexts. Signal checks exclude marker positions, captions, numbers and guide paths. Inverse handle geometry is checked to `1e-6` SVG units. Reference sample timing is independently checked against native planner events across attack/release and trigger modes.

`tests/sound-teaching-check.html` inventories the mounted shared controls, edits every real knob, requires its drawn signal/reference to change, then edits the corresponding node by one exact step and verifies both the authored value and original knob. It checks selectors/switches, matching ranges/precision, and negative controls that reject gain-domain aliasing or lost precision. `tests/visual-pages-check.html` retains actual Vocal/Freeform, pointer cancellation, atomic history and accessibility coverage. The actual Beat regression now starts on the normal response page and proves distortion changes the waveform before pointer release; smoothing, pulse scroll/focus and expanded layout regressions remain.

**Last full qualification:** PR #210 passed 590 Node tests and the desktop/narrow Chrome, native and Windows suites. This is historical evidence, not a requirement to rerun those suites for ordinary edits. This is a shared UI/model pass; it does not change audio DSP or project formats. Physical Windows 11 and Safari/Home Screen qualification remain separate, and no Windows ZIP is produced by this pass.

## Lean prototype policy (2026-11-07)

Follow `AGENTS.md` and the README: one small relevant check per change. The full illustration/browser/native suites remain available on demand, not automatic release gates. Do not re-audit every knob, regenerate phone ledgers or rewrite historical qualification reports for unrelated edits. Keep both the ordinary controls and direct graph edits using the same canonical mutation/history paths. Physical Windows 11 and Safari acceptance are separate from prototype web publishing.
