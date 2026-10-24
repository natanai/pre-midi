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

Track assignment is presentation only in v1, not part of the native .premidi composition definition. The track list, arrangement row/clip, active piano roll, and instrument inspector use the same accent at any given moment. Never recolor ordinary buttons, status text, unrelated panels, or background chrome just to create visual excitement.

Contrast rules:
- Active notes have an opaque accent fill; held-note tails have a weaker accent fill.
- Empty cells remain nearly black and regular beat separators remain visible.
- Selected tracks show an outline **as well as** color; keyboard focus uses an outline too.
- Playback shows a visible marker independently of track color.
- Maintain usable foreground contrast against both the active and muted fills.

## Responsive implementation
Desktop and mobile share one score, sequencer, inputs, interactions, and saves. CSS may rearrange the track list and scroll the piano roll. Avoid mobile-only functional alternatives or losing note-grid controls on small screens.

## Ownership
The pre-midi repo owns the standalone composing interface. Pre-programmed owns canonical Media import/export, D1 persistence, and the game engine's operations/conditions. Both consume the same versioned native composition contract and player synthesis code, rather than forking music data or building a duplicate piano roll inside Author mode.
