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

This is a design constraint, not license to remove essential warnings, error messages, accessibility names, confirmations, or recording guidance.
