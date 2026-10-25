# pre-midi visual language

Pre-midi is a music studio in the pre-programmed family, not a generic contemporary DAW. Its interface deliberately shares the visual grammar of the running engine and Author workspaces.

## Foundation
- Pure black (#000) and near-black (#050505) backgrounds, minimal surface depth.
- Gray text (#aaa), bright text (#e5e5e5), muted metadata (#777), gray rules (#444).
- Monospace typography, flat square fields and buttons, thin/divided sections.
- Use the content hierarchy instead of large cards, gradients, shadows, round corners, gratuitous icons, or large toolbars.
- Match pre-programmed's spatial simplicity without embedding its player terminal or duplicating its Author system.

## Musical signal color
Strong colors are *data encodings*, not navigation themes. Current cycle:
- Cyan: #08e4ec
- Hot pink/red: #ff416d
- Mauve: #ba82eb
- Raw amber: #ffc266

Instrument color is a presentation choice, not part of the native .premidi composition definition. The instrument list, timeline lane/chunks, active piano roll, and instrument inspector use the same accent at any given moment. Never recolor ordinary buttons, status text, unrelated panels, or background chrome just to create visual excitement.

Contrast rules:
- Active notes have an opaque accent fill; held-note tails have a weaker accent fill.
- Empty cells remain nearly black and regular beat separators remain visible.
- Selected instruments and timeline slots show an outline **as well as** color; keyboard focus uses an outline too.
- Playback shows a visible marker independently of track color.
- Maintain usable foreground contrast against both the active and muted fills.

## Responsive implementation
Desktop and mobile share one score, sequencer, inputs, interactions, and saves. CSS may rearrange the instrument list and scroll the piano roll. Avoid mobile-only functional alternatives or losing note-grid controls on small screens.

## Ownership
The pre-midi repo owns the standalone composing interface. Pre-programmed owns canonical Media import/export, D1 persistence, and the game engine's operations/conditions. Both consume the same versioned native composition contract and player synthesis code, rather than forking music data or building a duplicate piano roll inside Author mode.

## Text and terminology
- Use a plain, technical vocabulary throughout the interface. Text names a control, state, sound source, parameter, action or measured behavior.
- Example titles identify what their compositions demonstrate; descriptions list audible or editable properties supported by the score. Do not invent scenes, moods, stories, intentions or judgments about how the music feels.
- Instrument and preset names identify the source or processing: e.g. `Sine Keys`, `Recorded Snare`, `Detuned Pad`. Keep existing machine identifiers stable when changing visible labels.
- Use short, direct prompts and status messages: `Ready`, `Recording`, `Loaded example`. Avoid first-person copy, congratulation, advertising, poetic descriptions or decorative qualifiers.
- Keep factual guidance that prevents errors, explains limitations or communicates consequences. Plain language is not a reason to hide relevant information.
- Prefer testable claims. Where a sonic property is interpretive rather than measurable, omit it.
