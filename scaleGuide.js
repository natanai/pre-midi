// Piano-roll scale guidance is an editing preference, not a change to MIDI note data.
// Intervals are measured in semitones above the selected tonic.
export const SCALE_ROOTS = Object.freeze([
 "C","C♯ / D♭","D","D♯ / E♭","E","F",
 "F♯ / G♭","G","G♯ / A♭","A","A♯ / B♭","B"
]);

export const SCALE_MODES = Object.freeze([
 {id:"chromatic",name:"chromatic",steps:[0,1,2,3,4,5,6,7,8,9,10,11]},
 {id:"major",name:"major",steps:[0,2,4,5,7,9,11]},
 {id:"natural-minor",name:"natural minor",steps:[0,2,3,5,7,8,10]},
 {id:"harmonic-minor",name:"harmonic minor",steps:[0,2,3,5,7,8,11]},
 {id:"melodic-minor",name:"melodic minor (ascending)",steps:[0,2,3,5,7,9,11]},
 {id:"major-pentatonic",name:"major pentatonic",steps:[0,2,4,7,9]},
 {id:"minor-pentatonic",name:"minor pentatonic",steps:[0,3,5,7,10]},
 {id:"blues",name:"minor blues",steps:[0,3,5,6,7,10]},
 {id:"dorian",name:"dorian",steps:[0,2,3,5,7,9,10]},
 {id:"phrygian",name:"phrygian",steps:[0,1,3,5,7,8,10]},
 {id:"lydian",name:"lydian",steps:[0,2,4,6,7,9,11]},
 {id:"mixolydian",name:"mixolydian",steps:[0,2,4,5,7,9,10]},
 {id:"locrian",name:"locrian",steps:[0,1,3,5,6,8,10]},
 {id:"phrygian-dominant",name:"phrygian dominant",steps:[0,1,4,5,7,8,10]},
 {id:"whole-tone",name:"whole tone",steps:[0,2,4,6,8,10]},
 {id:"diminished-half-whole",name:"diminished (half–whole)",steps:[0,1,3,4,6,7,9,10]},
 {id:"diminished-whole-half",name:"diminished (whole–half)",steps:[0,2,3,5,6,8,9,11]}
]);
const STEPS = new Map(SCALE_MODES.map(mode=>[mode.id,new Set(mode.steps)]));

export function normalizeScaleGuide(input) {
 const root = Number.isInteger(input?.root) && input.root>=0 && input.root<12?input.root:0;
 const mode = STEPS.has(input?.mode)?input.mode:"chromatic";
 return {root,mode,lock:mode!=="chromatic" && input?.lock===true};
}

export function isPitchInScale(pitch,guide) {
 if(!Number.isInteger(pitch))return false;
 const {root,mode}=normalizeScaleGuide(guide);
 const relative=((pitch-root)%12+12)%12;
 return STEPS.get(mode).has(relative);
}
