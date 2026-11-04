// A piano-roll scrubber follows only the selected chunk when it is actually
// playing on its instrument lane. The music data and playback timing own this
// state; this module never edits the beat.
import {chunkProgress} from "./arrangement.js";
import {clipBeatStep} from "./songModel.js";
export function chunkIsPlaying(beat, instrumentId, chunkId, position) {
 return chunkProgress(beat,instrumentId,chunkId,position)!==null;
}
export function pianoScrubberX(step, gridWidth, gutterWidth = 63) {
 const progress = Math.min(16, Math.max(0, step));
 return gutterWidth + (gridWidth - gutterWidth) * progress / 16;
}

// Song and the Beat piano roll project one authoritative transport position.
// Prefer the selected occurrence; if there is no selection, follow only an
// unambiguous active occurrence of the displayed Beat.
export function songBeatEditorPosition(song,beatId,selectedClipId,songStep){
 const beat=song?.beats.find(item=>item.id===beatId);
 if(!beat)return null;
 const visible=song.tracks.filter(track=>track.kind==="beat")
  .flatMap(track=>track.clips)
  .filter(clip=>clip.beatId===beatId&&clipBeatStep(clip,beat,songStep)!==null);
 const clip=selectedClipId?visible.find(item=>item.id===selectedClipId):
  visible.length===1?visible[0]:null;
 if(!clip)return null;
 const beatStep=clipBeatStep(clip,beat,songStep);
 return {bar:Math.floor(beatStep/16),step:beatStep%16,clipId:clip.id};
}
