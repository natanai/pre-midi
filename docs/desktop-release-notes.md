# pre-midi 0.14.1-preview.28 — Windows portable preview

Windows 11 x64, portable ZIP, manual installation. No installer or registry changes are required. This preview is intended for testing on your PC, rather than a claim of production audio stability.

## Included changes

- Held notes across Chunks: drag a pitched note's body left behind the keyboard to merge its new attack into a note already held at that pitch from an earlier Chunk. Reused Chunks remain isolated to their specific placement.
- Right-edge note resizing now extends across Chunk boundaries automatically using the existing long-note format. Incoming note tails remain visible and their right edges can be lengthened.
- Added five project-original reusable factory samples: picked wire, muted amplified string, room kick, noise snare and sharp hat.


- Delay ping-pong alternates echoes left/right; echo tone darkens each repeat while preserving the first echo. Corrected native repeat timing to match browser playback.
- Stereo width and mid/side balance use the same interactive graph/dials across Sound contexts. Width leaves mono recordings unchanged; side-only balance removes shared mono content.
- EQ can add/remove bands up to eight without replacing surviving bands.
- Unused attached freeform lanes are a closed three-pixel pull-tab; deliberate downward pulling reveals the lane, while horizontal dragging stays quiet and locked to its parent row.

- Vocal end trimming mirrors start trimming, including handle, precise time, keyboard editing and restore; both edges update the Song clip and playback source bounds.
- Vocal sound controls preserve the focused knob, open module and scroll position after a committed edit.
- Beat dragging stays on its own Track; a 650 ms downward pull into its own child lane deliberately converts to freeform, with a fill cue. Parent and child rows share a full-width frame.
- Shared expandable parametric EQ with interactive graph, ordinary controls, per-band enable and common chain order/bypass/mix; steeper 24/48 db/oct filter stages.

- Four shared performance macros with multiple route assignments, reset/save reset and preset/project recall.
- Filter/distortion wet/dry with interactive blend graphs and aligned distortion dry paths.
- Tempo delay from 1/16 through quarter notes, including dotted eighths; free seconds remain available up to two seconds.
- Seeded sample-and-hold, smooth-random and editable four-step movement since preview.24.

- Fixed sampled rack selection and Beat chunk placement: the shared delay illustration now reads sampled Sound defaults and uses their actual edit paths. This includes Night Drive Kit.

- One physical Sound Inspector and shared desktop workspace for Beat, Freeform and Song vocals, with shared history/Sound buttons and processing controls.
- Vocal start trimming updates the Song clip region; original recordings remain external and unchanged. Shared processing presets, vocal reuse, effectful seek continuations and live vocal edits retain their settings.
- Common amplitude/resonance movement routes, sine/triangle/ramp/square LFOs and tempo-synced divisions.
- Up to 32 cutoff automation points, with shared graph/numeric add/remove editing and captured Freeform source timing.
- Shared serial processing controls: add/remove/restore filter and distortion, reorder them, bypass without erasing values, and bypass the separate delay send. Empty and single-stage chains are supported in browser and native rendering.

## Install and test

Extract the complete ZIP into a separate writable folder and open pre-midi.exe. Keep portable.txt beside it. Each portable folder keeps its own data.

For an in-place manual update, close all app instances and back up the folder first. Replace application files only; preserve data/, projects/ and exports/. Export a music ZIP when you want a portable copy that includes its recording/sample assets; plain .premidi instructions do not contain those audio bytes.

Try ping-pong echoes, bright/dark feedback tone, width on stereo and mono recordings, adding/removing EQ bands and undo. Try both vocal trim handles, repeated knob edits while scrolled/expanded, horizontal Beat drags and deliberate own-lane conversion, EQ/filter slopes, macro mapping/reset, processor mixes, synced echoes at slow/fast tempos, and a short Beat and Song, vocal recording/trim/playback, shared Sound controls, processor reorder/remove/restore and undo/redo. Save a processing preset, export/reopen a project ZIP, and confirm its audio/settings remain. Use headphones while testing microphone recording.

## Remaining limits

The normal native transport retains its 600-second and 4,096-onset session limits. Experimental long-Song streaming remains opt-in and has separate seek/loop/live-edit/count-in/recording limitations; use the normal transport for this preview's editing and microphone checks.

The broader M2 roadmap is not complete: general routing, sidechains, multiple processor instances and broader modulation/automation remain open. Parallel EQ routing, dynamics, reverb and independent pitch/time editing remain later work.

Automated Windows build, dependency, native and portable-folder checks do not prove real Windows 11 device sound, microphone alignment or dropout-free listening. Please test those on your chosen audio device. This preview is unsigned and uses manual ZIP updates.
