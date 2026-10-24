# pre-midi development direction

## Pre-midi first

Build the standalone music studio in pre-midi before repeatedly mirroring changes into pre-programmed. The music schema, authoring interface, instrument definitions and audio engine should be designed together in pre-midi. Pre-programmed's Media feature keeps its existing imported composition support while the studio evolves.

When future changes alter the current v2 score format, new compositions may not immediately import into the game. That is an expected temporary limitation, **not** a reason to maintain unused conversion layers, duplicate editing logic, or update both repositories after every experiment.

## Ownership and eventual parity

- Pre-midi owns composition and instrument authoring, the canonical portable format, audio rendering and offline export.
- Pre-programmed owns its Media resources, D1 mutations, Author tasks, game effects and conditions, and the whole-game project export.
- The two applications should eventually consume one versioned schema, validator, and playback engine, with a single interpretation of each instrument and musical parameter.
- Standalone editing must never require game code. Game playback must never require pre-midi's whole DAW interface.
- During development, do not change pre-programmed just to maintain compatibility with every provisional studio change.

## Usability before increasing complexity

Keep Instruments, Timeline, Notes and Sound as clear working zones. Controls must remain fully visible at desktop and mobile widths; avoid crowded action headers. Continue supporting silent live note editing, direct chunk assignment, visible selected context, note resizing, and an audio-synchronized playhead. Verify layout by browser interaction and viewport inspection, not only tests.

## Modular instrument architecture

Treat instruments as authored signal-processing definitions, not an ever-growing one-off collection of knobs. An eventual voice/processing model can compose:

- Sound sources: multiple oscillators and noise, followed later by sample players and SoundFonts.
- Envelope generators: full ADSR envelopes assignable to volume and other destinations.
- Filters and timbre shaping: filter types, cutoff, resonance, oscillator mix and detuning.
- Modulation: LFOs, envelopes and destination parameter assignments.
- Reusable ordered effects: delay, reverb, distortion, chorus, etc.
- Mixer: per-instrument levels, panning, sends and buses.
- Reusable patch library: save, import, export, duplicate and share instrument definitions.

Each component should have a canonical schema, stable parameter identities, one validator and one audio implementation. Reuse appropriate open-source libraries with license review, without adopting incompatible architecture just because it already exists.

## Richer composition

Expand from one-bar chunks toward variable-duration sections, richer timeline placements, velocity, automation, tempo/meter changes and more complete loop controls. Reusable musical identities should survive across arrangements so game logic can address sections, instruments and parameters meaningfully.

## Reactive music without a second scripting system

The standalone composition describes the music; pre-programmed's existing conditions, State and effect operations define gameplay behavior. Stable references can eventually make operations such as enable a layer, switch section at a bar boundary, alter instrument parameters, or mute a bus possible without pre-midi carrying embedded game scripts.

## Intentional parity milestone

When the music studio and portable score format are ready for a freeze:

1. Finalize and test the native format, instrument definitions, dependencies and portable asset packaging.
2. Synchronize the canonical validator and playback engine into pre-programmed.
3. Import/export through Media's existing D1 and whole-project persistence paths.
4. Add game-facing music operations through existing resource and capability contracts.
5. Verify round-trip and audible equivalence before declaring interoperability complete.

Until then, **pre-midi should be allowed to mature independently**. No compatibility conversions for hypothetical users of never-used provisional formats.
