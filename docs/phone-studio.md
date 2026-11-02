# pre-midi phone studio — canonical architecture, rebuild and parity gates

Status: **retired phone UI; dedicated shell only** (2026-11-01).
Owner document: **this file**. Do not create a second phone/mobile roadmap or parity matrix. Synthesizer/DSP work remains in `docs/synthesis-roadmap.json`; Song/game-engine integration remains in `docs/song-rollout.md`; naming follows `docs/terminology.json`.

## Intended result

An iPhone user opens the published website in Safari, chooses **Add to Home Screen → Open as Web App**, and launches a local-first, fully functional music studio. Without a computer, they can create Beats and Songs, place and edit notes, design synthesizers, use sample racks, record sounds and vocals, hear playback, save and restore sessions, import/export `.premidi` and asset ZIPs, and render WAVs. Audio and project semantics match desktop, even though navigation and layout are purpose-built for touch.

**Not the goal:** a miniaturized desktop app, duplicated synth code, a less capable “lite” editor, new phone-only file formats, or an account-dependent cloud product. Offline support, installation metadata and robust iOS file handling are delivery requirements, not claims about the current shell.

## Retired implementation and code boundaries

Previously the same `index.html` desktop DOM and `studio.js` ran at every screen size. Phone-specific overrides accumulated in desktop CSS at 340, 520, 570, 640 and 650 px, plus broader responsive breakpoints. This made the phone appear responsive without validating note placement in actual iOS Safari.

The reset removes the narrow phone-only blocks and routes phone viewports before loading desktop CSS/JS to the independent `phone/index.html`, which loads `phone/phone.css` only. That shell intentionally shows a rebuild notice. Desktop and narrower desktop/tablet workspace rules remain; pointer-based note editing, audio, examples, schemas, storage and exports are **not deleted**. Pages staging copies the phone entry. Narrow Chromium desktop tests no longer masquerade as iOS touch qualification.

Do not restore scattered phone CSS into `style.css` or `studioAlignment.css`. All phone-specific visual and interaction code must live in the `phone/` subtree. Desktop and phone host modules may each use a **small number of internal responsive rules inside their own host**, but neither should patch the other's control selectors.

## Approved revisions — 2026-11-01

The user approved the full phone studio plan, with these three refinements taking precedence over older sections in this document:

1. **Three primary workspaces, not four:** **Notes**, **Sound**, and **Song**. The currently selected Instrument and Chunk remain directly available in Notes. Tapping Instrument opens an intentional contextual picker/sheet with current Instruments, a unified Add/Browse catalog, factory and user presets, and Rack presets. Changing Instruments never requires a detour to a separate workspace. There is no fourth Instruments tab.
2. **Exhaustive, source-backed action inventory is a Phase 1 deliverable.** The existing feature parity ledger below is a subsystem outline, **not yet an exhaustive inventory**. Build a single machine-readable capability registry from the real entry-point controls, dynamically rendered synth/sampler fields, gestures, keyboard bindings, Track/Clip actions, import/export operations and desktop/native host capabilities. For each action specify a stable identifier, shared command or justified host-specific equivalent, desktop route, phone route, state/output contract, tests and verified status. Use deterministic extraction and a CI coverage gate so new desktop controls cannot silently lack a phone mapping. Registry data is implementation evidence, not a second human roadmap: **this document remains the single source of truth for acceptance**. An unimplemented phone mapping is a tracked gap, never evidence of parity.
3. **Qualify the iOS host early.** Alongside the first functioning Notes editor, establish prototype Home Screen standalone launch, Web Audio activation, local draft persistence and basic offline-shell tests. Do not postpone discovery of iOS-specific failures until all Sounds and Songs are implemented. Full offline caching, update recovery, file flows and storage hardening remain later release gates.

Additional approved interaction rules: tapping an existing note **selects** it rather than deleting it; delete is an explicit contextual action; long press is optional, not required to find controls. Scroll/paint/pinch must have distinct gesture hit zones and accessible alternatives. Phone owns touch mapping; the new shared note commands and session modules begin the shared, DOM-free note editing seam, but **Phase 1 and the complete phone UI are not yet finished**.

### Approved milestone order

- **Phase 0 — completed:** retire broken phone CSS and establish the dedicated shell without altering desktop sound or project files.
- **Phase 1 — in progress:** shared commands, identical desktop/headless-phone state fixtures, exhaustive generated action registry and CI coverage gate.
- **Phase 2:** usable Notes interface, Instrument sheet, Chunk/scale controls, playback, touch note operations, save/restore; initial Home Screen and offline/host feasibility; real iPhone tap-to-place gate.
- **Phase 3:** all synth/sampler controls and visualizations, sound/rack library and recording, isolated note effects.
- **Phase 4:** Song arrangement, linked Beat Clips, vocal Tracks, automation, external Asset references.
- **Phase 5:** production iOS file/share integration, interruption and storage failure recovery, versioned atomic service worker and complete offline asset availability.
- **Phase 6:** all capability-registry entries demonstrably supported or documented with an appropriate equivalent, performance budgets and repeatable real-device evidence.

The detailed legacy delivery gates below remain relevant; the approved milestone sequence above controls scheduling. An early web-based prototype is not equivalent to an iOS-qualified installable offline application.

## Long-term code layout

```text
index.html + studio.js + style.css       desktop/tablet entry and rendering
phone/index.html + phone/phone.css       dedicated phone host and design tokens
phone/main.js                             future mobile bootstrap
phone/views/                              future Beat, Notes, Sound, Song, Project screens
phone/gestures/                           future touch interaction controllers
shared studio session/actions/selectors   progressively extracted from studio.js
src/dsp/ + core model/format modules      same musical meaning and synthesis behavior
src/hosts/web/                            Web Audio, capture, file, IndexedDB adapters
native/ + desktop/                        existing Windows host, no phone-only dependencies
```

The current `studio.js` is substantially coupled to desktop DOM elements. **Do not import it from phone**. Extract pure state/command operations a seam at a time while preserving desktop tests. Both hosts should call the same commands; each host owns its DOM, navigation, gesture mapping and accessible presentation. State is one session, not mirrored desktop/phone state objects.

Suggested extracted commands, with unchanged semantics: create/open/save project, select/rename/add/remove Instrument, select/duplicate Chunk, add/move/resize/delete note, edit note expression, edit synthesis or sampler parameter, convert instrument layout, manage history, move/trim Song Clips, record/attach Assets, play/seek/stop, export Beat/Song and render WAV. Handle command failure and undo consistently.

An **entry-level** phone viewport decision selects the phone host before desktop starts. The host remains stable through portrait ↔ landscape. Avoid a device-width check in every button or note-rendering function. Phones in landscape must stay in phone mode. iPad uses desktop/tablet mode until a separate decision is made about tablet UX.

## Proposed phone information architecture

A compact global project/title and transport strip persists; the main workspace is maximized for a *single primary editing task* at a time. Bottom or context navigation switches among **Notes**, **Sound**, and **Song**, without destroying state or changing transport context implicitly. A small project menu provides New, Open, Export, Save/Backup, settings and recording entry points. This is a design proposal, not a commitment to final icon choices.

**Notes** is the default: the piano roll occupies nearly the full screen. Keep the pitch keyboard visible while time scrolls; a bar ruler indicates position; vertical pitch scroll and horizontal time scroll are independent. Provide zoom controls rather than squeezing all 16 bars into one phone width. Scale-allowed pitches and audition feedback remain visible. When an Instrument is a Rack, the editor shows sound rows rather than pretending its sounds are pitches.

**Instruments** is a contextual picker available directly from Notes, with a full catalog browser. Add instrument and Browse sounds must show the same categories, built-in presets and rack presets; actions must clearly distinguish adding a new Instrument from replacing a selected Sound. Song/Beat/Chunk state survives switching.

**Sound** is a dedicated screen with the selected Instrument identity, primary level, audible sound shape/scope, preview and save preset controls, and collapsed advanced modules below. All controls, per-note overrides, sample mapping and the existing rack-to-pitched conversion paths must be reachable. Do not drop deep synthesizer parameters merely to fit the screen.

**Song** exposes an uninterrupted ruler, Tracks, Clips, clip resize/move, Beat selection, and vocal Tracks above Beat Tracks. Beat editing remains reachable beneath the Song context conceptually, without flattening the existing references.

**Projects and files** must explicitly distinguish browser-local autosave/presets from exported project backups. An exported `.premidi` or ZIP is the durable way to carry project data between devices; Recordings and Samples stay external to the JSON manifest in `assets/`.

## Note-editing gesture contract (first functional requirement)

| Intent | Touch behavior | Acceptance criterion |
| --- | --- | --- |
| Add note | Tap empty cell | One note immediately appears at the intended pitch/time and auditions |
| Extend new note | Touch empty cell then drag right | Duration lengthens continuously in the same gesture |
| Move note | Touch and drag existing note body | Snapped pitch/time moves visibly; no duplicate note |
| Resize note | Drag visible end handle | Duration changes without moving onset |
| Remove note | Select, then explicit delete/context action | Scrolling does not delete notes |
| Open note effects | Long press or visible note action | Same isolated note-effects controls as desktop |
| Audition pitch | Touch a piano key or Rack row | Immediate sound + press feedback |
| Navigate grid | Scroll non-note space, or explicit two-finger gestures | Vertical pitch and horizontal time remain usable |
| Zoom | Pinch and accessible +/- alternative | Stable point under gesture, usable tap targets |
| Undo/redo | Persistent controls | One undo step per completed edit; cancel/interrupt rolls back cleanly |

Use Pointer Events and capture where supported, but test actual Safari `pointercancel`, scroll arbitration and touch movement. No global `touch-action:none` across the whole editor. Use hit testing and explicit gesture precedence so a held touch can move a note while a plain tap can place one. Offer non-gesture alternatives for accessibility, including keyboard/VoiceOver selection.

## Feature parity ledger

The **same feature** means phone reachability + same underlying command/output + persistent round-trip + appropriate real-device qualification. Default status for every phone item below is **not implemented**, not “tested” because desktop code exists.

| Subsystem | Required phone coverage | Status |
| --- | --- | --- |
| Transport | Beat/Song play/stop, loop, tempo, bars/meter, seek and live playhead | todo |
| Piano roll | Tap/place, paint duration, move, resize, delete, audition, selection, zoom, undo/redo | todo |
| Scale | Root/mode, lock, visual hints, melodic/directional scale behavior where supported | todo |
| Instruments | Catalog, examples, factory/user presets, add/browse/replace, rename/delete, conversion | todo |
| Chunks and timeline | Create/duplicate/select, offsets, repeats, overlap/polymeter where supported | todo |
| Rack | Individual sample rows, preview rotation, sound import, Rack editing and note mapping | todo |
| Sound synthesis | All oscillators, envelope, filters, movement, distortion, delay, modulation, visualizations | todo |
| Note effects | Isolated per-note editor, dynamics, expression and note-vs-instrument overrides | todo |
| Song | Beat Tracks, Clips, repeats, overlap, trimming, source Beat selection, names, arrangement | todo |
| Recordings | Sound/voice recording, count-in, preview, retry, permission errors, external Assets | todo |
| Automation | Parameter editing/display, playback, reversible history and preserved data | todo |
| Persistence | IndexedDB autosave/reopen, library presets, error/recovery UX, clear backup signals | todo |
| Import/export | `.premidi`, asset ZIP, WAV, iOS Files/Share flows, round-trip with Windows/game | todo |
| Host/PWA | Install, standalone safe area, cache versioning, offline startup, suspend/relaunch | todo |
| Accessibility | VoiceOver labels/actions, alternate controls, focus, dynamic text, reduced motion | todo |

**Continuous parity policy:** When desktop gains a capability, update this ledger in the same PR with either a verified phone implementation or a clearly open phone item linked to its implementation issue. After v1, CI must prevent untracked host divergence. The machine-readable feature inventory may eventually be generated from shared command/manifest metadata, but this file remains the sole human-readable acceptance source; do not create rival “mobile audits.”

## Delivery sequence and hard gates

### Phase 0 — Safe retirement (initial reset)

Remove failed phone-only CSS, keep shared logic and desktop, add independent phone entry and Pages staging, replace misleading mobile Chromium assertions with phone-entry checks, record this plan.

**Gate:** desktop remains usable; phones show an honest build-state shell, not broken editing tools.

### Phase 1 — Shared command boundary

Extract a testable session state and semantic editing API from the desktop controller. Build deterministic fixtures for add/move/resize/delete, undo/redo, selected Instrument/Chunk, and serialization. Wire desktop to the extracted commands without changing its UI. Add phone DOM harness that can run touch simulations without mirroring desktop markup.

**Gate:** desktop and headless phone adapter get identical state from the same gesture/command fixtures.

### Phase 2 — A working phone Beat creator

Build phone layout and transport, pitch/Rack keyboard, Instrument and Chunk selector, basic Beat editing, and direct note placement. **Do not advance until a tap creates a note on real iPhone Safari.** Then add paint/drag/resize/delete, scale hints, audition, zoom/scroll, undo/redo, stable orientation and persistence.

**Gate:** from an empty phone project, make a multi-Instrument Beat, modify it, replay it, save and reload it with identical editable notes.

### Phase 3 — Full sound editor and library

Port every primary/advanced Sound control and module visualization into phone-native panels. Add library browsing, Rack presets, sample import, sound recording, conversion to synth, preset save/reuse, and isolated per-note effects. Ensure live editing while transport plays.

**Gate:** all factory and user Sounds can be edited from phone; serialized patches and playback behavior match shared contract fixtures.

### Phase 4 — Song, voice, automation

Implement Song arranger, Beat Tracks and Clips with selection/move/trim/overlap, vocal Tracks, Song/Beat transport, voice recording and automation editors. Reuse the existing Song schema and external asset references.

**Gate:** create and round-trip a multi-Beat Song with Clips, vocal takes and automation; no flattening or changed identities.

### Phase 5 — Reliable iOS host APIs and project safety

Implement a user-gesture Web Audio activation path, microphone permission/error and interruption recovery, IndexedDB integrity/recovery, export backup reminders, ZIP/WAV/`.premidi` Files integration. Verify large projects within realistic memory limits. Distinguish Safari tab storage from Home Screen app storage and test migration/backups, rather than assuming data appears in both.

**Gate:** forced reload, app switch, recording interruption and failed saves either preserve work or present a recoverable error. An exported project opens in a fresh app install/context with Assets intact.

### Phase 6 — Installable, offline Home Screen app

Add scoped manifest, proper icons (pre-programmed brand), Apple metadata, navigation/start URL and standalone safe areas. Add an explicitly versioned service worker that caches the phone shell, JS, audio DSP and pinned needed samples atomically. Ensure old cached code cannot run with incompatible new modules. Offline status must truthfully distinguish cached projects/samples from missing assets.

**Gate:** install in Safari, cold-launch in standalone, airplane-mode launch after initial assets cache, edit/play/save and export locally; verify update and retry when cache install is interrupted.

### Phase 7 — Parity enforcement, optimization and release

Create feature-level cross-host tests, audio render fixtures, import/export round-trips, CI parity checks, runtime performance budgets for dense 16-bar piano rolls and lengthy Songs, and a repeatable iOS device acceptance log.

**Gate:** every ledger row is verified or has an intentional, documented platform limitation with an equivalent safe workflow. No silent disabled features or unsupported effects.

## Specific iOS qualification requirements

Test both **Safari tab** and **Home Screen standalone** on actual iPhones, not only Chrome with a 390 px window. Include portrait and landscape, 375×812 / 390×844 / 430×932 CSS-pixel reference sizes, safe-area insets, on-screen keyboard open/closed, VoiceOver and reduced-motion, and fast switching between app and other apps.

Audio needs explicit gesture activation and recovery after background suspension, screen lock and device/audio-route changes. Recording needs permission denial/regrant, count-in cancel, repeated takes, partial take cleanup, file size limits and interruption. Never advertise unattended background recording or continuous locked-screen playback without demonstrated iOS support.

Storage needs quota errors, eviction, autosave status, app update rollback and separate fresh-session reimport tests. Browser-local preset saves are not durable synchronized backups. Make periodic export discoverable without making the app account-based. iOS file import/export via Files/Share must be proved on-device, not inferred from browser API existence.

References for host constraints:
- Apple [Add a website to Home Screen](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27).
- WebKit [Home Screen apps on iOS](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- WebKit [Storage limits and eviction](https://webkit.org/blog/14403/updates-to-storage-policy/).
- Apple [Web apps, storage and standalone behavior](https://developer.apple.com/videos/play/wwdc2023/10120/).

## What the reset does NOT do

No audio-engine removal, sample deletion, preset downgrade, `.premidi` schema rewrite, Windows packaging change, promise of offline availability today, or newly working phone composition controls. The reset is architecture preparation and honest retirement only.
