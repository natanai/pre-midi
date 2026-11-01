# pre-midi studio interface contract

This is the native music studio for pre-programmed. The music, its controls, and its structure are the interface. Resist adding copy.

- **Lowercase chrome** throughout. Keep authored names, musical note spelling, file extensions, IDs, and other semantic data intact. Do not lowercase stored values to style the interface.
- **No flavor text in the visible UI**. Avoid taglines, slogans, explanatory paragraphs, duplicated control instructions, badges, needless subtitles, and additional visualization bars. If a label and the action already explain a control, do not add commentary.
- **Explain sound via the label itself**, not the dial: hover over the exact words of a control label (or tap on touch devices) to reveal short, casual, sound-specific help. Prefer an audible prediction over a metaphor that fails to explain the effect. Use lowercase and **no ending punctuation**. The canonical help dictionary is in `dial.js`; extend it there when adding a new dial or selector.
- **Explain measurements separately**: hover over only the abbreviation (e.g. `st`, `ct`, `ms`, `hz`) to see its literal full name. Do not put units or control definitions inside the sonic label hints unless essential for clarity.
- **Never attach explanatory hover behavior to the dial surface**. Dials must remain unobstructed during interaction. Preserve keyboard and screen-reader descriptions.
- **Operations must say what they do**. Use the quiet bracketed style for layout-changing operations, e.g. `[convert to rack]`, `[convert to piano roll]`. Keep reverse operations discoverable and name multi-sound extraction differently from full conversion.
- **Show contextual actions once**. Avoid repeating destructive or arrangement operations in the inspector when a per-row or per-instrument action menu already offers them.
- **Make non-obvious restrictions discoverable** without explaining them in permanently visible prose: accessible descriptions and disabled-action hints are preferable.
- New visible copy must earn its space. Prefer fewer words, and test the change at both desktop inspector width and mobile sheet width.
- **One baseline per control row**. Adjacent selects, buttons, checkboxes and readouts need an intentional common bottom/control baseline; their labels belong above that baseline. Avoid arbitrary bottom padding and `margin-left:auto` gaps that imply mechanical grouping where none exists. Make second rows deliberate rather than accidental flex wraps, and let action groups wrap on mobile.
- **Transport position is bar:beat**, not part of looping. Show it as a separately labeled readout and keep its accessible value synchronized on start, stop, and position changes.

This is a design constraint, not license to remove essential warnings, error messages, accessibility names, confirmations, or recording guidance.

## Repository boundaries

- **Native-first synthesis:** `docs/synthesis-roadmap.json` is the machine-readable synthesis/DSP backlog, complementary to the Song feature rollout in `docs/song-rollout.md`. Desktop and mobile hosts are primary; the web host is maintained where feasible, never at the cost of native sound fidelity. Portable patch semantics and tested host parity take precedence over browser-specific APIs.
- One vocabulary for active code, UI, persisted schema and pre-programmed: `docs/terminology.json`. Legacy native versions: v7 Beat, v8 Song; modulation uses explicit v9 Beat/v10 Song and patch v2. Cutoff timeline automation uses explicit v11 Beat/v12 Song and voice plan v3. Old files migrate explicitly; do not break readers with textual renames.
- The source model is Sound → Instrument/Rack → Chunk → Beat → Song Track/Clip. A Song reuses editable Beat identities; a Recording references external audio Assets. Never embed recording bytes in `.premidi`.
- Vocal Tracks are always above Beat Tracks, with the selected Beat editor below. Expanded Song means Song transport, collapsed Song means selected Beat transport.
- pre-midi owns studio editing and the native music instructions. pre-programmed owns game State, effects, conditions, Media persistence and dynamic music control. The old game v2 reader remains a compatibility gap, not proof of parity.
- Preserve web, future standalone and game-host portability; browser-specific storage/microphone APIs cannot define musical semantics.

## Sound-design qualification

- **The instrument library is a catalog of foundational timbres, not a gallery of minor preset variations.** Prefer one neutral, editable starting patch per meaningful sound source or synthesis character. Changing only cutoff, attack, release, gain, delay, distortion, or detune usually does not justify a separate factory listing. Add a second preset based on the same recording only when its treatment makes a substantially different playable instrument; test this by listening blind at matched pitch and volume, not by comparing parameter values alone.
- Curate duplicate/near-duplicate entries instead of growing the factory library indefinitely. Keep existing project's self-contained patches and sample asset references playable even when retiring a factory listing. Regression tests should catch reused sample zones within the same keys category and other obvious duplicate starting recipes.
- **One sound catalog, multiple entry points:** Add instrument and Browse sounds must expose the same category definitions and all applicable factory/user rack presets. The choice action may differ, but must state that difference explicitly. Browsing a whole rack adds an independent instrument; it must not silently destroy notes on the current instrument. Explicit per-row replacement remains scoped to individual sounds.
- **Examples are complete beats, not a competing sound category.** Example-derived instruments and rack rows belong in their ordinary sound categories. Retain complete example beats in the examples gallery.
- **Rack previews are one sound at a time.** Consecutive clicks audition successive rows, wrap to the first row, and identify the current row. This applies to a rack's library preview and the live rack's Hear sound control; the main beat/song transport must remain unchanged.

Professional capability and newcomer comprehension are both release requirements. Keep volume, brightness, onset and fade easy to reach in the existing inspector, with deeper controls available contextually. Do not add a mandatory beginner/expert mode. Preserve the select → hear → edit → save variation workflow at desktop and phone widths. Automated clicks do not replace observed newcomer or listening review.

## Visual system

Black or near-black surfaces, grayscale chrome, thin rules, monospace typography and square controls. Use saturated color for data (selected musical signals, recording state), not decoration. Selected notes and instruments require an outline as well as color; focus and accessibility remain visible. Desktop and mobile share the same editing behaviors.

## Cleanup and publishing

Do not delete audio code, examples, compatibility tests, verified sample provenance or ongoing roadmap work merely because they are not visible in the UI. Remove stale plans only after their surviving requirements are carried into the canonical documents and tests. The published `dist/` is generated from the live JS dependency graph and pinned samples, and must exclude tests/docs/scripts. Never commit generated `dist/` or downloaded `samples/`.

After implementation, run checks, reconcile concurrent work on main, publish to GitHub Pages and verify the deployment for testing. The canonical roadmap is `docs/song-rollout.md`; don't create a second competing plan.
