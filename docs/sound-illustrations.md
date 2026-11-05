# Sound illustration implementation and chat handoff

**Canonical ownership:** this is the single running handoff, acceptance checklist and execution log for the **educational, interactive Sound illustrations**. Update this file in place at every meaningful milestone and before handing the work to another chat. This is **not** a competing Song/freeform roadmap: `docs/song-rollout.md` remains authoritative for the shared Sound Inspector and Song/freeform architecture; `docs/synthesis-roadmap.json` remains authoritative for DSP synthesis.

## Responsibilities and boundaries

- **Illustration agent (this track):** `soundIllustrations.js`, its educational graphs, axes, gestures, readouts, accessibility, test fixtures, and **illustration-specific** tests. Cover synths, samples, modulation routes, harmonics, gain staging, note expression, cutoff automation and shared vocal processor illustrations.
- **Separate Song/freeform agent:** shared Sound Inspector extraction, `studio.js`, `freeformSoundUI.js`, Beat/Song data ownership, cross-context undo, preview wiring, native long-Song paging and canonical `docs/song-rollout.md`.
- **Do not** create a second synth, sound format, duplicate parameter registry, alternate DSP path, or cross-context editor assembly. Coordinate changes to shared definitions and UI contracts with the Song/freeform agent rather than editing its files concurrently.
- **Never remove a knob or other existing feature because its educational illustration is hard to design.** Conventional knobs and interactive diagrams must coexist and write the same canonical parameter via the caller's existing transaction. Distinguish stored Sound parameters from per-note/Instrument/Clip automation ownership.
- Target desktop browser and portable native Windows 11 now; phone parity is explicitly deferred. Preserve phone capability documentation/checks when the standard suite requires them.
- Respect `AGENTS.md`: no bulky added UI copy, lowercase chrome, separate sonic help from measurement-unit help, preserve focus, reasonable compact widths.

## Source of truth / entry points

| Concern | Canonical source |
|---|---|
| Educational diagrams, handle axes, categorical actions, pointer and keyboard input | `soundIllustrations.js` (`diagram`, `diagramPageCount`, `illustrateSoundPanel`) |
| Ordinary synth patch field definitions | `instrumentUI.js` and `synth.js` |
| Sample and vocal shared controls | `audioControlUI.js`, `samplerUI.js`, `vocalAudioView.js` |
| Real modulation source/target contracts | `src/dsp/modulation.js`, `modulationUI.js` |
| Control-to-illustration live inventory | `tests/visualControlInventory.js` |
| Pure axis/coverage and edit-path tests | `tests/interactiveDiagramCoverage.test.js`, `tests/soundIllustrations.test.js` |
| Live DOM/gesture/control-link browser tests | `tests/visual-pages-check.html`, `tests/visual-links-check.html`, `tests/layout.browser.mjs` |
| Beat/freeform consolidation / integration gate | `docs/song-rollout.md` |

## Approved product requirements / non-negotiables

1. Each applicable existing knob/selector has an intelligible educational illustration that can **directly change its parameter**, not merely highlight or navigate to the knob. Retain control and diagram options in parallel. Explicitly document any physical/semantic reason for a genuinely nonvisual exception.
2. Prefer genuine simultaneous X/Y control (four physical movement directions) when two related parameters make educational sense. Do not invent a parameter or draw a false relationship just to obtain two axes. Spectral painting spans partial index on X and amplitude on Y; a MIDI root is naturally a horizontal keyboard position.
3. Graphs visibly respond when conventional controls change, and conventional controls refresh when the illustration changes. Drag, keyboard (including shift precision), categorical toggles, empty-space navigation, zoom, A/B measurement and focus preservation must be checked. Related axes should commit as **one edit / one undo step**.
4. Present honest units and musical predictions; explicitly distinguish calculated explanatory curves from actual measured PCM scope. Test numerical ranges, log scales, limiting behavior, inactive parent effects and browser/native parity.
5. An edit must never silently write a different owning object. Freeform note cutoff versus Beat/Instrument cutoff can reuse the illustration while preserving distinct automation targets.

## Engineering status and verified changes

**Initial qualitative illustration-goal estimate: ~80%** from the November 4 source audit. This is a judgment of requirements accomplished, **not** measured test coverage, and is intentionally separate from the Song/freeform rollout's 92% estimate. Recalculate only after a comprehensive source + live DOM audit; passing CI alone does not mean every UX goal is complete.

**Merged:** [PR #158](https://github.com/natanai/pre-midi/pull/158), merge commit `dbfd856205be3d9a3957bbe774d653ebad24fd9a`. Improved handle unit readouts (Hz, seconds, milliseconds, semitones, percentages, pan direction), made the vocal filter diagram's on/off affordance reversible using the existing canonical `filter` value (null for vocal bypass), changed interactive SVG from image role to group role, and expanded pure/browser regressions. **Verified** `npm run check`, Chrome studio/illustration tests and entire GitHub Actions workflow [run 41962323400](https://github.com/natanai/pre-midi/actions/runs/41962323400): success. No Sound knobs, parameters or .premidi formats were removed.

### Active work / next milestone

- **In review:** [PR #160](https://github.com/natanai/pre-midi/pull/160), branch `illustrations/oscillator-two-direct-edit-and-audit`. Adds a direct, reversible mix-diagram action for oscillator 2's canonical base level even when the second waveform is collapsed. The ordinary add/remove control remains. Pure path and mounted Chrome tests added. **Do not report as merged or qualified until the latest GitHub Actions run passes.**
- **In review:** [PR #162](https://github.com/natanai/pre-midi/pull/162), branch `illustrations/full-gain-stage-coverage`. Following Song agent PR #159, the common `soundInspector.js` exposes distinct Instrument volume, Sound gain, and stereo pan. PR #162 preserves the stereo/volume illustration on page 1 and adds a genuine two-axis volume × gain lesson on page 2 for pitched Sounds; rack and Freeform level modes stay on one page. Pure and mounted-browser tests added. The first CI run found an outdated test assertion expecting only one page; fixed in the branch. **CI must pass before merging.**
- Use the actual `diagram` model and tests to inventory any **direct-edit holes**, not just paths that have visual hover links. Derive a real cross-context count once the common inspector is merged.
- Verify illustration-to-knob synchronization **during preview**, especially after common Sound Inspector consolidation, while keeping one undo entry for two-axis drags.
- Audit response/curve fidelity: the filter graph is an approximate teaching curve, not a measured Biquad frequency response; waveform/delay/envelope illustrations also have simplified assumptions. Decide what should be physically accurate versus explicitly labeled schematic after comparing web and native DSP.
- Verify keyboard focus/ARIA for SVG path hits, knob and diagram links, categorical actions, and zoom; preserve existing mini-scope measured PCM/A-B comparison.
- Test all of the above in desktop Chrome and native Windows/CI; physical Windows 11 audio/mouse testing still requires real device observation.

### Known architectural limits (owned by the other agent)

The Freeform agent merged [PR #159](https://github.com/natanai/pre-midi/pull/159) introducing shared `soundInspector.js`; consolidation may still have later milestones. The other agent owns its progress and `docs/song-rollout.md`. **Do not solve missing coverage by copying controls across editors.** Validate the new common inspector's final state before bidirectional coverage sign-off.

## Next-chat continuation procedure

1. Read `AGENTS.md`, this file, `docs/song-rollout.md`, then latest `soundIllustrations.js` and the three primary illustration test files. Inspect **current main and open PRs**, not historical SHA assumptions.
2. Check the **latest PR/CI status** and whether the separate Freeform agent has merged the shared Inspector. Never overwrite its ongoing edits.
3. Work on a **fresh illustration-only branch** (or existing active illustration PR listed here), add pure tests plus a mounted browser regression, and run `npm run check` / GitHub Actions Chrome + native suite. Preserve features and canonical patch paths.
4. Merge qualified small PRs and verify GitHub Pages publish; report separately: illustration completion estimate, Song/freeform estimate, confirmed CI, unqualified physical Windows tests, and remaining illustration gates.
5. Update **this exact file** with the new PR/commit, tests, current branch, next steps and any blockers. Do not make another competing illustration task document.

**Handoff anchor:** user explicitly assigned this chat to illustration interactions only; a different agent is implementing Freeform and the unified Sound Inspector.
