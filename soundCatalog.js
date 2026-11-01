// The one public factory catalogue for Add instrument and Browse sounds.
// Musical example patches, old preset IDs, and CC0 sample metadata remain in
// their owning modules so existing .premidi files can be opened unchanged.
import {PRESETS} from "./synth.js";
import {SAMPLE_LIBRARY} from "./samples.js";
import {EXAMPLE_SOUND_PRESETS} from "./examples.js";
import {DRUM_RACKS} from "./drumRacks.js";

// A small glide/vibrato edit to the same nylon-finger recordings does not
// create a second foundational timbre. The named patch is still resolvable
// by samplePreset() and remains available to existing example compositions.
export const RETIRED_SAMPLE_LISTINGS=Object.freeze(["nylon-sob"]);
const retired=new Set(RETIRED_SAMPLE_LISTINGS);

// Example beats use the original full instruments internally. Only a complete
// rack is a distinct, useful *starting arrangement*; its individual one-off
// row tweaks and song-specific pitched patches should not multiply factory
// listings. Keep each rack editable and retain all source patches.
export const CURATED_EXAMPLE_RACKS=EXAMPLE_SOUND_PRESETS.filter(p=>Array.isArray(p.sounds));
export const FACTORY_SOUND_CATALOG=Object.freeze([
 ...PRESETS,
 ...SAMPLE_LIBRARY.filter(p=>!retired.has(p.id)),
 ...DRUM_RACKS,
 ...CURATED_EXAMPLE_RACKS
]);
