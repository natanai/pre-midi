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
 {id:"melodic-minor",name:"melodic minor",steps:[0,2,3,5,7,9,11],descendingSteps:[0,2,3,5,7,8,10]},
 {id:"melodic-minor-jazz",name:"melodic minor (same both ways)",steps:[0,2,3,5,7,9,11]},
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
// Only genuinely direction-dependent modes declare a descending form.
// Existing pitch-class modes apply equally ascending and descending.
const STEPS = new Map(SCALE_MODES.map(mode=>[mode.id,{
 ascending:new Set(mode.steps),
 descending:new Set(mode.descendingSteps??mode.steps)
}]));

export function normalizeScaleGuide(input) {
 const root = Number.isInteger(input?.root) && input.root>=0 && input.root<12?input.root:0;
 const mode = STEPS.has(input?.mode)?input.mode:"chromatic";
 return {root,mode,lock:mode!=="chromatic" && input?.lock===true};
}

// A scale belongs to the editable Beat, not one of its instruments.
// Read older per-instrument browser preferences without modifying notes or
// adding metadata to compact .premidi music instructions.
export function scaleGuideForBeat(preferences,beat) {
 const current=preferences.get(beat.id);
 if(current)return normalizeScaleGuide(current);
 const previous=beat.instruments.map(inst=>preferences.get(beat.id+":"+inst.id)).filter(Boolean);
 return normalizeScaleGuide(previous.find(guide=>guide.mode!=="chromatic")??previous[0]);
}

// Melodic direction comes from musical time, not the order of mouse clicks.
// The most recent earlier onset supplies the context. A chord at that onset
// must agree on direction; ties and mixed directions allow either form.
export function scaleDirectionAtStep(pitch,notes,step) {
 if(!Number.isInteger(pitch)||!Array.isArray(notes)||!Number.isInteger(step))return "either";
 let latest=-Infinity;
 let previous=[];
 for(const note of notes){
  if(!Number.isInteger(note?.start)||!Number.isInteger(note?.pitch)||note.start>=step)continue;
  if(note.start>latest){latest=note.start;previous=[note.pitch];}
  else if(note.start===latest)previous.push(note.pitch);
 }
 if(!previous.length)return "either";
 if(previous.every(value=>pitch>value))return "ascending";
 if(previous.every(value=>pitch<value))return "descending";
 return "either";
}

function inScale(pitch,guide,direction){
 if(!Number.isInteger(pitch))return false;
 const {root,mode}=normalizeScaleGuide(guide);
 const relative=((pitch-root)%12+12)%12;
 const steps=STEPS.get(mode);
 return direction==="ascending" ? steps.ascending.has(relative) :
  direction==="descending" ? steps.descending.has(relative) :
  steps.ascending.has(relative)||steps.descending.has(relative);
}

// With no predecessor, both melodic forms remain available.
// This is the chromatic keyboard's pitch-class guidance, not a note mutation.
export function isPitchInScale(pitch,guide) {
 return inScale(pitch,guide,"either");
}

// Recomputed for each candidate cell, so moving the insertion point or adding
// an earlier note immediately adjusts the directional guidance and lock.
export function isPitchInScaleAtStep(pitch,guide,notes,step) {
 return inScale(pitch,guide,scaleDirectionAtStep(pitch,notes,step));
}
