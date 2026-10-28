# Repository maintenance audit — 2026-10-28

Source baseline: `10ea09ecdb871d6312f67f95a84f7273a082ef79`. This audit is intentionally non-destructive: file names alone do not prove dead code. No production files, tests, historical benchmark reports, sample provenance, or platform adapters were deleted.

## Verified current release policy

- Only the Windows 11 x64 **portable folder ZIP** is an active preview distribution.
- The browser studio remains supported.
- macOS/Linux host architecture remains in source for eventual full release; building and publishing their previews is deferred.
- Native C++ synthesis is attached to the miniaudio device callback for supported plans, but sample racks, vocals, noise, drive, delay, legacy movement, and live replanning are incomplete.
- Native output-device tests in CI use an explicitly identified null backend. They do not prove Windows hardware latency, device recovery, or underrun behavior.
- Portable updates require preserving `data/`, `projects/`, and `exports/`. No automatic in-place portable update is qualified.

## Dependency-aware cleanup register

| Candidate | Classification | Decision | Evidence or required check |
| --- | --- | --- | --- |
| `scripts/install-linux-desktop.sh` | Deferred cross-platform infrastructure | **Retain** | Linux distribution is deferred, not cancelled. Confirm whether any release or local developer flow references it before removal. |
| `desktop/Info.plist`, macOS icons and Tauri package configuration | Deferred cross-platform infrastructure | **Retain** | Necessary for future macOS full-release qualification. |
| `scripts/package-desktop.py`, `scripts/publish-desktop.mjs`, `scripts/desktop-config.mjs` | Active release infrastructure | **Retain** | Windows portable workflow invokes these scripts. |
| `native/desktop-fixture.cpp`, `native/bridge.mjs`, `native/render.cpp` | Native DSP qualification | **Retain** | Offline/native comparison and fixture pathways are separate from the live device callback. Remove only if a replacement test proves equivalent coverage. |
| `benchmarks/native-modulation-candidate.json` and older benchmark reports | Historical qualification evidence | **Retain, label historical** | Failed candidates and earlier clean-source reports document regression thresholds and source provenance. |
| `docs/song-rollout.md` | Historical/forward integration roadmap | **Retain pending reconciliation** | Song-specific constraints complement the canonical synthesis roadmap; check for obsolete status claims before edits. |
| `README.md` | User-facing documentation | **Update** | Previously claimed only Beat v7/Song v8 and omitted the Windows native preview. |
| `.github/workflows/desktop-release.yml` | Active Windows preview workflow | **Retain** | Workflow name already identifies Windows portable; renaming its filename has no functional benefit. |
| `tests/**`, `src/hosts/web/**` | Active compatibility and qualification | **Retain** | Browser studio remains supported; do not weaken parity coverage to reduce repository size. |
| `native/vendor/miniaudio/LICENSE` and `THIRD_PARTY_NOTICES.md` | Licence compliance | **Retain** | Third-party notices are not expendable clutter. |

**Confirmed safe source deletions:** none in this inspection. Avoid speculative deletion. Follow-up cleanup can remove a file only after import/reference tracing, comparison of current workflow paths, and full regression coverage.

## Roadmap: implementation order

1. **Native parity:** sample-rack playback; noise, drive, delay and legacy movement; preserve explicit unsupported-feature errors until verified. Acceptance: real authored Beats/Songs render on the C++ path with objective browser/native comparisons and no silent substitution.
2. **Real-time composition:** editing while native playback continues; incremental schedule updates; sample and vocal timing; record/play synchronization. Acceptance: edit, seek, loop, record and replay without forced transport restarts or lost assets.
3. **Sound design and performance:** expressive modulation, effects and MIDI keyboard input. Acceptance: reproducible musical tests plus newcomer usability qualification.
4. **Production quality:** headroom, export formats, latency, device switching, CPU and underrun measurements on actual Windows 11 hardware. Null-backend CI evidence must remain separately labeled.
5. **Integration and release:** `pre-programmed` native `.premidi` reader parity; signed update strategy; macOS/Linux full-release builds and physical tests. Windows portable remains the only preview artifact until the distribution policy changes.

Canonical task IDs and implementation statuses remain in `docs/synthesis-roadmap.json`; this audit does not mark unfinished work complete.

## Next maintenance pass acceptance

- Trace import and runtime references before any deletion, including dynamic imports and workflow invocations.
- Preserve legacy format migration, project assets, tests and all required licences.
- Run `npm run check`, browser checks, native comparison suites and Windows portable workflow before merging any code-removal PR.
- Record removed paths, exact dependency evidence, repository size change, and CI results in that PR.
- Do not overwrite concurrent feature branches.
