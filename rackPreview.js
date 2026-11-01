// Shared, non-musical preview position for factory, saved and live racks.
// Playback order follows the current row order. No change to notes or transport.
export function nextRackPreview(positions,key,sounds){
 if(!Array.isArray(sounds)||sounds.length===0)throw Error("Cannot preview an empty rack.");
 const index=(positions.get(key)??0)%sounds.length;
 positions.set(key,(index+1)%sounds.length);
 return {sound:sounds[index],index,total:sounds.length};
}
export function resetRackPreview(positions,key){positions.delete(key);}
